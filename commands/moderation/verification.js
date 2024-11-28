const { SlashCommandBuilder } = require('@discordjs/builders');
const { ChannelType, EmbedBuilder } = require('discord.js');
const { i18next } = require('../../i18n');
const { createMainLogChannel } = require('../../events');
const { getServerSettings } = require('../../database/settingsDb');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Верификация пользователя')
        .addUserOption(option => option
            .setName('user')
            .setDescription('Верификация пользователя')
            .setRequired(true))
        .addStringOption(option => option
            .setName('action')
            .setDescription('Выберите действие')
            .setRequired(true)
            .addChoices(
                { name: ('Выдать роль'), value: 'give_role' },
                { name: ('Недопуск'), value: 'deny_access' },
                { name: ('Изменить гендер'), value: 'change_gender' }
            ))
        .addStringOption(option => option
            .setName('gender')
            .setDescription('Выберите гендер пользователя (необязательно)')
            .setRequired(false)
            .addChoices(
                { name: i18next.t('Мужчина'), value: 'male' },
                { name: i18next.t('Женщина'), value: 'female' }
            )),
    async execute(robot, interaction) {
        if (interaction.user.bot) return;
        if (interaction.channel.type === ChannelType.DM) {
            return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const userIdToVerify = interaction.options.getUser('user').id;
            const action = interaction.options.getString('action');
            const memberToVerify = await interaction.guild.members.fetch(userIdToVerify);

            if (!memberToVerify) {
                return await interaction.editReply({ content: i18next.t('User_not_found'), ephemeral: true });
            }

            // Получение настроек сервера
            const serverSettings = await getServerSettings(interaction.guild.id);
            const { logChannelName, manRoleName, girlRoleName, newMemberRoleName } = serverSettings;
            const gender = interaction.options.getString('gender');
            const botMember = interaction.guild.members.me;
            let logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);

            // Проверка и создание лог-канала, если он не найден
            if (!logChannel) {
                const channelCreationMessage = await createMainLogChannel(interaction, logChannelName, botMember, interaction.guild.roles.cache.filter(role => botMember.roles.highest.comparePositionTo(role) < 0), serverSettings);
                console.log(channelCreationMessage);
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
                if (!logChannel) {
                    return await interaction.editReply({ content: 'Не удалось создать или найти канал логов.', ephemeral: true });
                }
            }

            // Проверка прав на отправку сообщений
            if (!logChannel.permissionsFor(botMember).has('SEND_MESSAGES')) {
                return await interaction.editReply({ content: 'У бота нет прав на отправку сообщений в канал логов.', ephemeral: true });
            }

            let responseMessage = ''; // Переменная для хранения сообщения ответа

            switch (action) {
                case 'give_role':
                    let roleToAssign;
                    if (gender === 'male') {
                        roleToAssign = interaction.guild.roles.cache.find(role => role.name === manRoleName);
                    } else if (gender === 'female') {
                        roleToAssign = interaction.guild.roles.cache.find(role => role.name === girlRoleName);
                    } else {
                        responseMessage = i18next.t('verify-js_gender_not_found');
                        break;
                    }

                    if (roleToAssign) {
                        if (memberToVerify.roles.cache.has(roleToAssign.id)) {
                            responseMessage = i18next.t('verify-js_role_already_declared', { rolename: roleToAssign.name });
                            break;
                        }

                        await memberToVerify.roles.add(roleToAssign);
                        responseMessage = i18next.t('verify-js_role_add', { rolename: roleToAssign.name, userIdToVerify: userIdToVerify });

                        const rookieRole = interaction.guild.roles.cache.find(role => role.name === newMemberRoleName);
                        if (rookieRole && memberToVerify.roles.cache.has(rookieRole.id)) {
                            await memberToVerify.roles.remove(rookieRole);
                        }

                        try {
                            await memberToVerify.send(i18next.t('verify-js_role_assigned_message', { rolename: roleToAssign.name, moderator: interaction.user.id }));
                        } catch (error) {
                            console.error(`Не удалось отправить личное сообщение: ${error.message}`);
                        }

                        const genderSelectEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(i18next.t('verify-js_role_given_log_title'))
                            .setDescription(i18next.t('verify-js_role_given_log', { member: memberToVerify.id, role: roleToAssign.name }))
                            .setTimestamp()
                            .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                        await logChannel.send({ embeds: [genderSelectEmbed] });
                    } else {
                        responseMessage = 'Роль не найдена.';
                    }
                    break;

                case 'deny_access':
                    const reason = 'Non-admission';
                    await memberToVerify.ban({ reason }).catch(error => {
                        console.error(`Ошибка при бане пользователя: ${error.message}`);
                        responseMessage = i18next.t('Error');
                    });
                    responseMessage = i18next.t('verify-js_user_banned_log', { member: memberToVerify.id, reason });

                    const banEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(i18next.t('verify-js_user_banned_log_title'))
                        .setDescription(i18next.t('verify-js_user_banned_log', { member: memberToVerify.id, reason }))
                        .setTimestamp()
                        .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                    await logChannel.send({ embeds: [banEmbed] });
                    break;

                case 'change_gender':
                    const maleRole = interaction.guild.roles.cache.find(role => role.name === manRoleName);
                    const femaleRole = interaction.guild.roles.cache.find(role => role.name === girlRoleName);

                    if (gender === 'male' && femaleRole && memberToVerify.roles.cache.has(femaleRole.id)) {
                        await memberToVerify.roles.remove(femaleRole);
                        await memberToVerify.roles.add(maleRole);
                        responseMessage = i18next.t('verify-js_gender_changed_log_title');

                        const genderChangeEmbedMale = new EmbedBuilder()
                            .setColor(0xFFFF00)
                            .setTitle(i18next.t('verify-js_gender_changed_log_title'))
                            .setDescription(i18next.t('verify-js_gender_changed_log', { member: memberToVerify.id, gender: manRoleName }))
                            .setTimestamp()
                            .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                        await logChannel.send({ embeds: [genderChangeEmbedMale] });
                    } else if (gender === 'female' && maleRole && memberToVerify.roles.cache.has(maleRole.id)) {
                        await memberToVerify.roles.remove(maleRole);
                        await memberToVerify.roles.add(femaleRole);
                        responseMessage = i18next.t('verify-js_gender_changed_log_title');

                        const genderChangeEmbedFemale = new EmbedBuilder()
                            .setColor(0xFFFF00)
                            .setTitle(i18next.t('verify-js_gender_changed_log_title'))
                            .setDescription(i18next.t('verify-js_gender_changed_log', { member: memberToVerify.id, gender: girlRoleName }))
                            .setTimestamp()
                            .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                        await logChannel.send({ embeds: [genderChangeEmbedFemale] });
                    } else {
                        responseMessage = i18next.t('verify-js_no_roles');
                    }
                    break;

                default:
                    responseMessage = i18next.t('Error');
            }

            // Отправка ответа
            await interaction.editReply({ content: responseMessage || 'Действие выполнено успешно.', ephemeral: true });
        } catch (error) {
            console.error(`Произошла ошибка: ${error.message}`);
            if (!interaction.replied) {
                await interaction.editReply({ content: `Произошла ошибка: ${error.message}`, ephemeral: true });
            }
        }
    },
};
