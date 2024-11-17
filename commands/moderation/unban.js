// Импорт необходимых модулей и функций
const { createRoles, createLogChannel } = require('../../events');
const { Client, ChannelType, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getServerSettings } = require('../../database/settingsDb');
const { i18next, t } = require('../../i18n');

const USER_OPTION_NAME = i18next.t('unban-js_user');
const REASON_OPTION_NAME = i18next.t('unban-js_reason');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Причина разбана')
        .addUserOption (option =>
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
            const {banRoleName, logChannelName,banLogChannelName, banLogChannelNameUse } = serverSettings;

            // Проверка наличия роли "Ban"
            const banRole = interaction.guild.roles.cache.find(role => role.name === banRoleName);
            if (!banRole) {
                await createRoles(interaction, [banRoleName]);
            }

            // Получение канала для логирования
            let logChannel;
            if (banLogChannelNameUse) {
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === banLogChannelName);
            } else {
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
            }

            // Проверка наличия канала для логирования
            if (!logChannel) {
                const channelNameToCreate = banlogChannelNameUse ? banLogChannelName : logChannelName;
                const roles = interaction.guild.roles.cache;
                const botMember = interaction.guild.members.me;
                const higherRoles = roles.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);
                await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles, serverSettings);
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
            }

            // Проверка прав пользователя и бота
            const botMember = interaction.guild.members.me;
            if (!botMember.permissions.has('ManageRoles') || botMember.roles.highest.comparePositionTo(banRole) <= 0) {
                return interaction.editReply({ content: i18next.t('unban-js_bot_permissions'), ephemeral: true });
            }

            // Проверка, имеет ли пользователь роль "Ban"
            const memberToUnban = interaction.guild.members.cache.get(userId);
            if (!memberToUnban || !memberToUnban.roles.cache.has(banRole.id)) {
                return interaction.editReply({ content: i18next.t('unban-js_user_not_blocked', { userId: userId }), ephemeral: true });
            }

            // Удаление роли "Ban" у пользователя
            await memberToUnban.roles.remove(banRole, reason);

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
                            .setTitle(('Вы были разбанены'))
                            .setImage('https://media.discordapp.net/attachments/1304707253735002153/1307719818052370482/3.gif?ex=673b547c&is=673a02fc&hm=f028851848c910ff85988a20a3e41ac1cf558a768af7a5c210e75add7fe5cdd6&=')
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
