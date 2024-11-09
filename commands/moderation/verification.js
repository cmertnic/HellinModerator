const { Client, ChannelType, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { i18next } = require('../../i18n');
const { getServerSettings } = require('../../database/settingsDb');
const {createLogChannel} = require('../../events');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription(i18next.t('verify-js_description'))
        .addUserOption (option => option
            .setName('user')
            .setDescription(i18next.t('verify-js_user_description'))
            .setRequired(true))
        .addStringOption(option => option
            .setName('action')
            .setDescription(i18next.t('verify-js_action'))
            .setRequired(true)
            .addChoices(
                { name: i18next.t('verify-js_give_role'), value: 'give_role' },
                { name: i18next.t('verify-js_deny_access'), value: 'deny_access' },
                { name: i18next.t('verify-js_change_gender'), value: 'change_gender' }
            ))
        .addStringOption(option => option
            .setName('gender')
            .setDescription('Выберите гендер пользователя (необязательно)')
            .setRequired(false)
            .addChoices(
                { name: i18next.t('verify-js_Man'), value: 'male' },
                { name: i18next.t('verify-js_Woman'), value: 'female' }
            )),
    async execute(robot, interaction, database) {
        await interaction.deferReply({ ephemeral: true });
        try {
            if (interaction.user.bot || interaction.channel.type === ChannelType.DM) return;

            const userIdToVerify = interaction.options.getUser ('user').id;
            const action = interaction.options.getString('action');
            const memberToVerify = await interaction.guild.members.fetch(userIdToVerify);

            if (!memberToVerify) {
                return await interaction.editReply({ content: i18next.t('User_not_found'), ephemeral: true });
            }

            // Получение настроек сервера
            const serverSettings = await getServerSettings(interaction.guild.id);
            const {logChannelName } = serverSettings;
            const gender = interaction.options.getString('gender'); // Получаем значение gender
            const botMember = interaction.guild.members.me;
            let logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);

            // Если канал для логов не найден, создаем его
            if (!logChannel) {
                const logChannelCreationResult = await createLogChannel(interaction, logChannelName, botMember, interaction.guild.roles.cache, database);

                if (logChannelCreationResult.startsWith('Ошибка')) {
                    return interaction.editReply({ content: logChannelCreationResult, ephemeral: true });
                }

                logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
            }

            switch (action) {
                case 'give_role':
                    let roleToAssign;
                    if (gender === 'male') {
                        roleToAssign = interaction.guild.roles.cache.find(role => role.name === 'М');
                    } else if (gender === 'female') {
                        roleToAssign = interaction.guild.roles.cache.find(role => role.name === 'Ж');
                    } else {
                        return await interaction.editReply({ content: i18next.t('verify-js_gender_not_found'), ephemeral: true });
                    }

                    if (roleToAssign) {
                        // Проверяем, есть ли уже у пользователя эта роль
                        if (memberToVerify.roles.cache.has(roleToAssign.id)) {
                            return await interaction.editReply({ content: i18next.t('verify-js_role_already_declared', { rolename: roleToAssign.name }),  ephemeral: true });
                        }

                        await memberToVerify.roles.add(roleToAssign);
                        await interaction.editReply({ content: i18next.t('verify-js_role_add', { rolename: roleToAssign.name,userIdToVerify: userIdToVerify }), ephemeral: true });

                        // Создание embed для лога в канале логов
                        const embed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(i18next.t('verify-js_role_given_log_title'))
                            .setDescription(i18next.t('verify-js_role_given_log', { member: memberToVerify.id, role: roleToAssign.name }))
                            .setTimestamp()
                            .setFooter({ text: i18next.t('verify-js_log_footer', { moderator: interaction.user.tag }) });

                        // Отправка embed в канал логов
                        await logChannel.send({ embeds: [embed] });
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
                    const maleRole = interaction.guild.roles.cache.find(role => role.name === 'М');
                    const femaleRole = interaction.guild.roles.cache.find(role => role.name === 'Ж');

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
            return await interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
        }
    },
};


