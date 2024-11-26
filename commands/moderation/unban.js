// Импорт необходимых модулей и функций
const { createRoles, createLogChannel } = require('../../events');
const { Client, ChannelType, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getServerSettings } = require('../../database/settingsDb');
const { i18next } = require('../../i18n');

const USER_OPTION_NAME = 'user';
const REASON_OPTION_NAME = 'reason';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Разбанить пользователя')
        .addUserOption(option =>
            option.setName(USER_OPTION_NAME)
                .setDescription('Пользователь')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName(REASON_OPTION_NAME)
                .setDescription('Причина')
                .setRequired(false)
        ),

    /**
     * @param {Client} robot - экземпляр клиента Discord.js
     * @param {CommandInteraction} interaction - объект взаимодействия с пользователем
     */
    async execute(robot, interaction) {
        // Откладываем ответ, чтобы бот не блокировался во время выполнения команды
        await interaction.deferReply({ ephemeral: true });

        try {
            // Предварительные проверки
            if (interaction.user.bot) return;
            if (interaction.channel.type === ChannelType.DM) {
                return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
            }

            // Получение ID пользователя и причины разблокировки
            const user = interaction.options.getUser (USER_OPTION_NAME);
            if (!user) {
                return interaction.editReply({ content: i18next.t('unban-js_user_not_found'), ephemeral: true });
            }

            const userId = user.id; // Получаем ID пользователя
            const reason = interaction.options.getString(REASON_OPTION_NAME) || i18next.t('defaultReason');

            // Получение настроек сервера
            const serverSettings = await getServerSettings(interaction.guild.id);
            const { logChannelName, banLogChannelName, banLogChannelNameUse } = serverSettings;

            // Получение канала для логирования
            let logChannel;
            if (banLogChannelNameUse) {
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === banLogChannelName);
            } else {
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
            }

            // Проверка наличия канала для логирования
            if (!logChannel) {
                const channelNameToCreate = banLogChannelNameUse ? banLogChannelName : logChannelName;
                const roles = interaction.guild.roles.cache;
                const botMember = interaction.guild.members.me;
                const higherRoles = roles.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);
                await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles, serverSettings);
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
            }

            // Проверка прав пользователя и бота
            const botMember = interaction.guild.members.me;
            if (!botMember.permissions.has('BanMembers')) {
                return interaction.editReply({ content: i18next.t('unban-js_bot_permissions'), ephemeral: true });
            }

            // Разбан пользователя
            await interaction.guild.members.unban(userId, reason);

            // Создание embed для лога в канале логов
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(i18next.t('unban-js_unban_user_title'))
                .setDescription(i18next.t('unban-js_unban_user_log_channel', { userId: userId, reason }))
                .setTimestamp()
                .setFooter({ text: i18next.t('unban-js_unban_user_footer', { moderator: interaction.user.tag }) });

            // Отправка embed в канал логов
            await logChannel.send({ embeds: [embed] });

            // Уведомление пользователя
            try {
                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('Вы были разбанены')
                            .setImage('https://media.discordapp.net/attachments/1304707253735002153/1309214603653283963/55c02c6f0fc22ea4b00448f242b59b77_1.png?ex=6740c49d&is=673f731d&hm=a1201c1349bd050132703395323031cb3da9c8210bd27cfa4cce7b4736f928f5&=&format=webp&quality=lossless&width=550&height=274')
                            .setDescription(i18next.t('unban-js_unban_notification_description', { guild: interaction.guild.name }))
                            .setTimestamp()
                    ]
                }).catch(console.error);
            } catch (error) {
                console.error(`Не удалось отправить сообщение пользователю: ${error.message}`);
            }

            // Отправка ответа в чат с результатом разблокировки
            await interaction.editReply({ content: i18next.t('unban-js_unban_user_log_moderator', { userId: userId, reason: reason }), ephemeral: true });
        } catch (error) {
            console.error(`Произошла ошибка: ${error.message}`);
            return interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
        }
    }
};
