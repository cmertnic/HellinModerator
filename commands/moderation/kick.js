    // Импорт нужных модулей и функций
    const { createLogChannel } = require('../../events');
    const { getServerSettings } = require('../../database/settingsDb');
    const { Client,SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
    const { i18next, t } = require('../../i18n');
    const USER_OPTION_NAME = 'user';
    const REASON_OPTION_NAME = 'reason';

    module.exports = {
        data: new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Исключить пользователя с сервера')
            .addUserOption(option =>
                option.setName(USER_OPTION_NAME)
                    .setDescription('Пользователь для исключения')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName(REASON_OPTION_NAME)
                    .setDescription('Причина исключения')
                    .setRequired(false)
            ),
        /**
         * Выполнение команды
         * @param {Client} robot - экземпляр клиента Discord.js
         * @param {CommandInteraction} interaction - объект взаимодействия с пользователем
         */
        async execute(robot, interaction) {
            // Откладываем ответ, чтобы бот не блокировался во время выполнения команды
            await interaction.deferReply({ ephemeral: true });
            try {
                // Проверка, что пользователь не бот и сообщение не находится в личных сообщениях
                if (interaction.user.bot) return;
                if (interaction.channel.type === ChannelType.DM) {
                    return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
                  }

                // Разбор аргументов команды
                const userId = interaction.options.getUser(USER_OPTION_NAME).id;
                const userToKick = interaction.guild.members.cache.get(userId);

                // Получение настроек сервера
                const serverSettings = await getServerSettings(interaction.guild.id);
                const logChannelName = serverSettings.logChannelName;
                const kickLogChannelName = serverSettings.kickLogChannelName;
                const kickLogChannelNameUse = serverSettings.kickLogChannelNameUse;
                const defaultReason = i18next.t('defaultReason');

                // Проверки наличия необходимых элементов
                if (!userId || !userToKick) {
                    return interaction.editReply({ content: (i18next.t('error_id_or_tag')), ephemeral: true });
                }

                // Проверка прав пользователя и бота на 'KickMembers'
                const member = interaction.member;
                if (!member.permissions.has('KickMembers')) {
                    return interaction.editReply({ content: (i18next.t('KickMembers_user_check')), ephemeral: true });
                }
                const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
                if (!botMember.permissions.has('KickMembers')) {
                    return interaction.editReply({ content: (i18next.t('KickMembers_bot_check')), ephemeral: true });
                }
                if (userToKick.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
                    return interaction.editReply({ content: (i18next.t('error_highest_role')), ephemeral: true });
                }

                // Определение причины исключения
                const reason = interaction.options.getString(REASON_OPTION_NAME) || defaultReason;

                // Логирование действия
                let logChannel;
                if (kickLogChannelNameUse) {
                    logChannel = interaction.guild.channels.cache.find(ch => ch.name === kickLogChannelName);
                } else {
                    logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
                }

                // Проверка и создание лог-канала, если он не найден
                if (!logChannel) {
                    const channelNameToCreate = kickLogChannelNameUse ? kickLogChannelName : logChannelName;
                    const roles = interaction.guild.roles.cache;
                    const higherRoles = roles.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);
                    const logChannelCreationResult = await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles, serverSettings);

                    // Выход из функции, если произошла ошибка при создании канала
                    if (logChannelCreationResult.startsWith('Ошибка')) {
                        return interaction.editReply({ content: logChannelCreationResult, ephemeral: true });
                    }

                    // Переопределяем переменную logChannel, так как она теперь может содержать новый канал
                    logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
                }

                // Выполнение команды исключения
                try {
                    await userToKick.kick({ reason });
                    const EmbedKickUser = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(i18next.t('kick-js_kick_user_log_channel_title'))
                        .setDescription(i18next.t('kick-js_kick_user_log_channel', { userDisplayName: userToKick, reason: reason }))
                        .setTimestamp()
                        .setFooter({ text: i18next.t('kick-js_kick_user_log_channel_footer', { moderator: interaction.user.tag }) });

                    await logChannel.send({ embeds: [EmbedKickUser] });
                } catch (error) {
                    return interaction.editReply(interaction, { content: i18next.t(`Error_log`, { error: error }), ephemeral: true });
                }

                // Отправка сообщения о завершении выполнения команды
                await interaction.editReply({
                    content: i18next.t('kick-js_kick_user_log_moderator', { userDisplayName: userToKick, reason: reason }), ephemeral: true
                });
            } catch (error) {
                console.error(`Произошла ошибка: ${error.message}`);
                return interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
            }


        }
    };