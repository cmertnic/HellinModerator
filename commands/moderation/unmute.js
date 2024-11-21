// Импорт необходимых модулей и функций
const { createMutedRole, createLogChannel } = require('../../events');
const { Client, ChannelType, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getServerSettings } = require('../../database/settingsDb');
const { removeMuteFromDatabase } = require('../../database/mutesDb');
const { i18next, t } = require('../../i18n');
const USER_OPTION_NAME = 'user';
const REASON_OPTION_NAME = 'reason';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Разглушить пользователя')
        .addUserOption(option =>
            option.setName(USER_OPTION_NAME)
                .setDescription('ID или упоминание пользователя')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName(REASON_OPTION_NAME)
                .setDescription('Причина разглушения')
                .setRequired(false)
        ),

    /**
     * @param {Client} robot - экземпляр Discord.js Client
     * @param {CommandInteraction} interaction - объектInteraction от Discord.js
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

            // Получение настроек сервера
            const serverSettings = await getServerSettings(interaction.guild.id);
            const { muteNotice, muteLogChannelName, muteLogChannelNameUse, logChannelName, mutedRoleName } = serverSettings;

            // Получение ID пользователя и причины из опций команды
            const userId = interaction.options.getUser(USER_OPTION_NAME).id;
            const reason = interaction.options.getString(REASON_OPTION_NAME) || i18next.t('defaultReason');
            const memberToUnmute = interaction.guild.members.cache.get(userId);

            // Создание роли для мута, если она не существует
            await createMutedRole(interaction, serverSettings);

            // Проверка existence пользователя
            if (!memberToUnmute) {
                return interaction.editReply({ content: i18next.t('unmute-js_user_check'), ephemeral: true });
            }

            // Находим роль для мута и канал для логов
            const mutedRole = interaction.guild.roles.cache.find(role => role.name === mutedRoleName);
            let logChannel;
            if (muteLogChannelNameUse) {
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === muteLogChannelName);
            } else {
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
            }
            // Получаем члена бота и проверяем его разрешения
            const botMember = interaction.guild.members.me;
            if (!botMember.permissions.has('ModerateMembers') || botMember.roles.highest.comparePositionTo(memberToUnmute.roles.highest) <= 0) {
                return interaction.editReply({ content: i18next.t('unmute-js_bot_permissions'), ephemeral: true });
            }
            // Если канал для логов не найден, создаем его
            if (!logChannel) {
                const channelNameToCreate = muteLogChannelNameUse ? muteLogChannelName : logChannelName;
                const roles = interaction.guild.roles.cache;
                const higherRoles = roles.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);
                const logChannelCreationResult = await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles, serverSettings);

                if (logChannelCreationResult.startsWith('Ошибка')) {
                    return interaction.editReply({ content: logChannelCreationResult, ephemeral: true });
                }

                logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
            }

            // Проверка existence роли для мута и канала для логов
            if (!mutedRole || !logChannel) {
                return interaction.editReply({ content: i18next.t('unmute-js_checks_failed'), ephemeral: true });
            }



            // Проверка, находится ли пользователь в роли для мута
            if (!memberToUnmute.roles.cache.has(mutedRole.id)) {
                return interaction.editReply({ content: i18next.t('unmute-js_user_not_muted'), ephemeral: true });
            }

            // Удаление роли для мута у пользователя
            await memberToUnmute.roles.remove(mutedRole.id);

            // Создание embed для лога в канале логов
            const embed = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle(i18next.t('unmute-js_unmute_user_log_channel_title'))
                .setDescription(i18next.t('unmute-js_unmute_user_log_channel', { memberToUnmute, reason }))
                .setTimestamp()
                .setFooter({ text: i18next.t('unmute-js_unmute_user_log_channel_footer', { moderator: interaction.user.tag }) });

            // Отправка embed в канал логов
            await logChannel.send({ embeds: [embed] });

            // Удаление мута из базы данных
            await removeMuteFromDatabase(robot, interaction.guild.id, userId);

            // Отправка уведомления пользователю, если включено
            if (muteNotice) {
                try {
                    const unmuteEmbed = new EmbedBuilder()
                    .setColor(0x00FF00) 
                    .setTitle(i18next.t('unmute-js_user_message', { moderator: interaction.user.name, guildName:interaction.guild.name,reasonMessage:reason}))
                    .setDescription(`Причина: ${reason}`)
                    .setImage('https://media.discordapp.net/attachments/1304707253735002153/1309214768179052584/df0c9e157b1f63b43baa17565ebcaec9_1.png?ex=6740c4c4&is=673f7344&hm=d66aed91f3a432b1da03aa9b4da89a6f2434f37b144b511b3a1789dd366a9feb&=&format=webp&quality=lossless')
                    .setTimestamp()
                
                await memberToUnmute.send({ embeds: [unmuteEmbed] }).catch(err => console.error(`Не удалось отправить сообщение пользователю: ${err.message}`));
                } catch (error) {
                    console.error(`Failed to send unmute notice to user ${memberToUnmute.user.tag}: ${error}`);
                }
            }
            // Отправка ответа в чат с результатом unmute
            await interaction.editReply({ content: i18next.t('unmute-js_unban_user_log_moderator', { memberToUnmute: memberToUnmute, reasonMessage: reason }), ephemeral: true });
        } catch (error) {
            console.error(`Произошла ошибка: ${error.message}`);
            return interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
        }
    }

};