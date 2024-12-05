// Импортируем необходимые классы и модули
const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const { createLogChannel, convertToMilliseconds, deleteMessages } = require('../../events');
const { getServerSettings } = require('../../database/settingsDb');
const { i18next } = require('../../i18n');

// Определяем названия опций с помощью i18next для локализации
const USER_OPTION_NAME = 'user';
const DEL_MESS_TIME_OPTION_NAME = 'time';
const REASON_OPTION_NAME = 'reason';

// Экспортируем команду как модуль
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Забанить пользователя')
    .addUserOption(option => option.setName(USER_OPTION_NAME).setDescription('Пользователь').setRequired(true))
    .addStringOption(option => option.setName(DEL_MESS_TIME_OPTION_NAME).setDescription(i18next.t('время для удаления сообщений пользователя')).setRequired(true).addChoices(
      { name: 'Ничего', value: '0' },
      { name: 'За полседний час', value: '1h' },
      { name: 'За полседние 6 часов', value: '6h' },
      { name: 'За полседние 12 часов', value: '12h' },
      { name: 'За полседний день', value: '1d' },
      { name: 'За полседние 3 дня', value: '3d' },
      { name: 'За полседние 7 дней', value: '7d' }
    ))
    .addStringOption(option => option.setName(REASON_OPTION_NAME).setDescription('причина бана').setRequired(false)),

  async execute(robot, interaction) {
    if (interaction.user.bot) return;
    if (interaction.channel.type === ChannelType.DM) {
      return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    try {
      const { member, guild } = interaction;
      const user = interaction.options.getMember(USER_OPTION_NAME);

      // Проверка, существует ли пользователь на сервере
      if (!user) {
        return interaction.editReply({ content: i18next.t('пользователя нет на сервере'), ephemeral: true });
      }

      const userId = user.id;
      const reason = interaction.options.getString(REASON_OPTION_NAME) || i18next.t('defaultReason');
      const deleteMessagesTime = interaction.options.getString(DEL_MESS_TIME_OPTION_NAME);
      const serverSettings = await getServerSettings(guild.id);
      const logChannelName = serverSettings.logChannelName;
      const banLogChannelName = serverSettings.banLogName;
      const banLogChannelNameUse = serverSettings.banLogChannelNameUse;
      const deletingMessagesFromBannedUsers = serverSettings.deletingMessagesFromBannedUsers;
      const moderator = interaction.user;
      const botMember = guild.members.cache.get(robot.user.id);

      if (!member.permissions.has('BanMembers')) {
        return interaction.editReply({ content: i18next.t('BanMembers_user_check'), ephemeral: true });
      }
      if (!botMember.permissions.has('BanMembers')) {
        return interaction.editReply({ content: i18next.t('BanMembers_bot_check'), ephemeral: true });
      }
      if (user.roles.highest.comparePositionTo(interaction.member.roles.highest) > 0 || user.roles.highest.comparePositionTo(botMember.roles.highest) > 0) {
        return interaction.editReply({ content: i18next.t('ban-js_user_above_bot_or_author'), ephemeral: true });
      }

      // Отправляем сообщение пользователю перед баном
      const banEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(i18next.t('ban-js_banned_title'))
        .setImage('https://media.discordapp.net/attachments/1304707253735002153/1309214603653283963/55c02c6f0fc22ea4b00448f242b59b77_1.png?ex=6740c49d&is=673f731d&hm=a1201c1349bd050132703395323031cb3da9c8210bd27cfa4cce7b4736f928f5&=&format=webp&quality=lossless&width=550&height=274')
        .setDescription(i18next.t('ban-js_banned_description', { moderator: moderator.id, reason }))
        .setTimestamp()
        .setFooter({ text: i18next.t('ban-js_banned_footer') });

      await user.send({ embeds: [banEmbed] }).catch(err => console.error(`Не удалось отправить сообщение пользователю: ${err.message}`));

      // Находим канал логирования на основе настроек сервера
      let logChannel;
      if (banLogChannelNameUse) {
        logChannel = guild.channels.cache.find(ch => ch.name === banLogChannelName);
      } else {
        logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);
      }

      // Если канал логирования не существует, создаем его
      if (!logChannel) {
        const channelNameToCreate = banLogChannelNameUse ? banLogChannelName : logChannelName;
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

      // Баним пользователя с указанной причиной и удаляем его сообщения, если это разрешено
      await user.ban({ reason, days: deleteMessagesTime ? convertToMilliseconds(deleteMessagesTime) / (1000 * 60 * 60 * 24) : 0 });

      // Удаляем сообщения забаненного пользователя на основе настроек сервера и указанного периода времени
      const deletedMessagesCount = deletingMessagesFromBannedUsers && deleteMessagesTime !== '0' ? await deleteMessages(user, deleteMessagesTime, guild, logChannel) : 0;

      // Создаем вставку для регистрации события бана
      const EmbedBan = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(i18next.t('ban-js_block_user_title', { reason }))
        .setDescription(i18next.t('ban-js_block_user_description', { user: userId, reason }))
        .setTimestamp()
        .setFooter({ text: i18next.t('ban-js_block_user_footer', { moderator: moderator.tag }) });

      await logChannel.send({ embeds: [EmbedBan] });

      // Отвечаем пользователю, который выполнил команду, сообщением с подтверждением
      await interaction.editReply({ content: i18next.t('ban-js_block_user_log_moderator', { user: userId, deletedMessagesCount }), ephemeral: true });
    } catch (error) {
      console.error(`Произошла ошибка: ${error.message}`);
      return interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
    }
  },
};
