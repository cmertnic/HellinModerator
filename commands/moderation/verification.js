const { Client, ChannelType, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { i18next } = require('../../i18n');
const { getServerSettings } = require('../../database/settingsDb');
const { createLogChannel, createRoles } = require('../../events');

async function ensureRolesExist(interaction) {
    const rolesToCreate = ['♂', '♀'];
    const rolesCreationMessages = await createRoles(interaction, rolesToCreate);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('verify-js_description')
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
            .setName('gender') // Изменено с 'Гендер' на 'gender'
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
            const userIdToVerify = interaction.options.getUser ('user').id; // Изменено с 'Пользователь' на 'user'
            const action = interaction.options.getString('action'); // Изменено с 'Действие' на 'action'
            const memberToVerify = await interaction.guild.members.fetch(userIdToVerify);

            if (!memberToVerify) {
                return await interaction.editReply({ content: i18next.t('User _not_found'), ephemeral: true });
            }

            // Получение настроек сервера
            const serverSettings = await getServerSettings(interaction.guild.id);
            const { logChannelName } = serverSettings;
            const gender = interaction.options.getString('gender'); // Изменено с 'Гендер' на 'gender'
            const botMember = interaction.guild.members.me;
            let logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);

            // Если канал для логов не найден, создаем его
            if (!logChannel) {
                const logChannelCreationResult = await createLogChannel(interaction, logChannelName, botMember, interaction.guild.roles.cache, serverSettings);

                if (logChannelCreationResult.startsWith('Ошибка')) {
                    return interaction.editReply({ content: logChannelCreationResult, ephemeral: true });
                }

                logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
            }

            // Проверяем наличие прав у бота
            if (!logChannel.permissionsFor(botMember).has('SEND_MESSAGES')) {
                return await interaction.editReply({ content: 'У бота нет прав на отправку сообщений в лог-канал.', ephemeral: true });
            }

            // Убедимся, что роли "М" и "Ж" существуют
            const roleCreationMessages = await ensureRolesExist(interaction);
            if (roleCreationMessages) {
                console.log(roleCreationMessages); // Логирование сообщений о создании ролей
            }

            switch (action) {
                case 'give_role':
                    let roleToAssign;
                    if (gender === 'male') {
                        roleToAssign = interaction.guild.roles.cache.find(role => role.name === '♂');
                    } else if (gender === 'female') {
                        roleToAssign = interaction.guild.roles.cache.find(role => role.name === '♀');
                    } else {
                        return await interaction.editReply({ content: i18next.t('verify-js_gender_not_found'), ephemeral: true });
                    }

                    if (roleToAssign) {
                        // Проверяем, есть ли уже у пользователя эта роль
                        if (memberToVerify.roles.cache.has(roleToAssign.id)) {
                            return await interaction.editReply({ content: i18next.t('verify-js_role_already_declared', { rolename: roleToAssign.name }), ephemeral: true });
                        }

                        await memberToVerify.roles.add(roleToAssign);
                        await interaction.editReply({ content: i18next.t('verify-js_role_add', { rolename: roleToAssign.name, userIdToVerify: userIdToVerify }), ephemeral: true });
                        // Убираем роль "Новичок", если она есть
                        const rookieRole = interaction.guild.roles.cache.find(role => role.name === 'Новичок');
                        if (rookieRole && memberToVerify.roles.cache.has(rookieRole.id)) {
                            await memberToVerify.roles.remove(rookieRole);
                        }
                        // Отправка личного сообщения пользователю
                        try {
                            await memberToVerify.send(i18next.t('verify-js_role_assigned_message', { rolename: roleToAssign.name, moderator: interaction.user.id }));
                        } catch (error) {
                            console.error(`Не удалось отправить личное сообщение пользователю: ${error.message}`);
                        }

                        // Создание embed для лога в канале логов
                        const genderSelectEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(i18next.t('verify-js_role_given_log_title'))
                            .setDescription(i18next.t('verify-js_role_given_log', { member: memberToVerify.id, role: roleToAssign.name }))
                            .setTimestamp()
                            .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                        // Отправка embed в канал логов
                        await logChannel.send({ embeds: [genderSelectEmbed] });
                    } else {
                        await interaction.editReply({ content: 'Роль не найдена.', ephemeral: true });
                    }
                    break;

                case 'deny_access':
                    const reason = 'Недопуск'; // Указываем причину бана
                    await memberToVerify.ban({ reason }).catch(error => {
                        console.error(`Ошибка при бане пользователя: ${error.message}`);
                        return interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
                    });
                    await interaction.editReply({ content: i18next.t('verify-js_user_banned_log', { member: memberToVerify.id, reason }), ephemeral: true });

                    // Создание embed для лога в канале логов
                    const banEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(i18next.t('verify-js_user_banned_log_title'))
                        .setDescription(i18next.t('verify-js_user_banned_log', { member: memberToVerify.id, reason }))
                        .setTimestamp()
                        .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                    // Отправка embed в канал логов
                    await logChannel.send({ embeds: [banEmbed] });
                    break;

                case 'change_gender':
                    const maleRole = interaction.guild.roles.cache.find(role => role.name === '♂');
                    const femaleRole = interaction.guild.roles.cache.find(role => role.name === '♀');

                    if (memberToVerify.roles.cache.has(femaleRole.id) && maleRole) {
                        await memberToVerify.roles.remove(femaleRole);
                        await memberToVerify.roles.add(maleRole);
                        await interaction.editReply({ content: i18next.t('verify-js_gender_changed_log_title'), ephemeral: true });

                        // Создание embed для лога в канале логов
                        const genderChangeEmbedMale = new EmbedBuilder()
                            .setColor(0xFFFF00)
                            .setTitle(i18next.t('verify-js_gender_changed_log_title'))
                            .setDescription(i18next.t('verify-js_gender_changed_log', { member: memberToVerify.id, gender: 'Мужской' }))
                            .setTimestamp()
                            .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                        // Отправка embed в канал логов
                        await logChannel.send({ embeds: [genderChangeEmbedMale] });
                    } else if (memberToVerify.roles.cache.has(maleRole.id) && femaleRole) {
                        await memberToVerify.roles.remove(maleRole);
                        await memberToVerify.roles.add(femaleRole);
                        await interaction.editReply({ content: i18next.t('verify-js_gender_changed_log_title'), ephemeral: true });

                        // Создание embed для лога в канале логов
                        const genderChangeEmbedFemale = new EmbedBuilder()
                            .setColor(0xFFFF00)
                            .setTitle(i18next.t('verify-js_gender_changed_log_title'))
                            .setDescription(i18next.t('verify-js_gender_changed_log', { member: memberToVerify.id, gender: 'Женский' }))
                            .setTimestamp()
                            .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                        // Отправка embed в канал логов
                        await logChannel.send({ embeds: [genderChangeEmbedFemale] });
                    } else {
                        await interaction.editReply({ content: i18next.t('verify-js_no_roles'), ephemeral: true });
                    }
                    break;

                default:
                    await interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
            }
        } catch (error) {
            console.error(`Произошла ошибка: ${error.message}`);
            return await interaction.editReply({ content: `Произошла ошибка: ${error.message}`, ephemeral: true });
        }
    },
};
