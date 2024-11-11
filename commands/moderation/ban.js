// Импортируем необходимые классы и модули
const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const { createLogChannel, convertToMilliseconds, deleteMessages, createRoles } = require('../../events');
const { getServerSettings } = require('../../database/settingsDb');
const { i18next, t } = require('../../i18n');

// Определяем названия опций с помощью i18next для локализации
const USER_OPTION_NAME = i18next.t('ban-js_user');
const DEL_MESS_TIME_OPTION_NAME = i18next.t('ban-js_del_mess_time');
const REASON_OPTION_NAME = i18next.t('ban-js_reason');

// Экспортируем команду как модуль
module.exports = {
  // Определяем данные команды с помощью SlashCommandBuilder
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Забанить пользователя')
    .addUserOption(option => option.setName(USER_OPTION_NAME).setDescription('Пользователь').setRequired(true))
    .addStringOption(option => option.setName(DEL_MESS_TIME_OPTION_NAME).setDescription(i18next.t('время для удаления сообщений пользователя')).setRequired(true).addChoices(
      { name: ('Ничего'), value: '0' },
      { name: ('За полседний час'), value: '1h' },
      { name: ('За полседние 6 часов'), value: '6h' },
      { name: ('За полседние 12 часов'), value: '12h' },
      { name: ('За полседний день'), value: '1d' },
      { name: ('За полседние 3 дня'), value: '3d' },
      { name: ('За полседние 7 дней'), value: '7d' }
    ))
    .addStringOption(option => option.setName(REASON_OPTION_NAME).setDescription('причина бана').setRequired(false)),

  async execute(robot, interaction) {
    if (interaction.user.bot) return;
    if (interaction.channel.type === ChannelType.DM) {
      return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
    }
    
    async function ensureRolesExist(interaction) {
      const rolesToCreate = ['Ban'];
      const rolesCreationMessages = await createRoles(interaction, rolesToCreate);
    }

    // Откладываем ответ, чтобы бот не блокировался во время выполнения команды
    await interaction.deferReply({ ephemeral: true });
    try {
      // Извлекаем объекты member и guild из interaction
      const { member, guild } = interaction;

      // Получаем пользователя, которого нужно забанить, и его ID
      const user = interaction.options.getMember(USER_OPTION_NAME);
      const userId = user.id;

      // Получаем причину (или причину по умолчанию)
      const reason = interaction.options.getString(REASON_OPTION_NAME) || i18next.t('defaultReason');

      // Получаем период времени для удаления сообщений от забаненного пользователя
      const deleteMessagesTime = interaction.options.getString(DEL_MESS_TIME_OPTION_NAME);

      // Проверяем права на выдачу ролей
      const serverSettings = await getServerSettings(guild.id);
      const banLogChannelName = serverSettings.banLogName;
      const banLogChannelNameUse = serverSettings.banLogChannelNameUse;
      const moderator = interaction.user;
      const botMember = guild.members.cache.get(robot.user.id);
      
      if (!member.roles.cache.some(role => role.permissions.has('ManageRoles'))) {
        return interaction.editReply({ content: i18next.t('ManageRoles_user_check'), ephemeral: true });
      }
      if (!botMember.roles.cache.some(role => role.permissions.has('ManageRoles'))) {
        return interaction.editReply({ content: i18next.t('ManageRoles_bot_check'), ephemeral: true });
      }

      // Проверяем, есть ли роль "ban"
      let banRole = guild.roles.cache.find(role => role.name === 'Ban');
      if (!banRole) {
        const roleCreationMessages = await ensureRolesExist(interaction);
        if (roleCreationMessages) {
          console.log(roleCreationMessages); // Логирование сообщений о создании ролей
        }
      }
      const url = 'https://forms.gle/vrihPf3gUJqEdciL9';
      // Выдаем роль пользователю
      await user.roles.add(banRole, reason);
      // Отправляем сообщение забаненному пользователю
      const banEmbed = new EmbedBuilder()
        .setColor(0xFF0000) // Красный цвет для бана
        .setTitle(i18next.t('ban-js_banned_title'))
        .setImage('https://media.discordapp.net/attachments/1304707253735002153/1305191258385416274/c8fd2f8d8fedab528cc4fa3315e1755c.gif?ex=67322195&is=6730d015&hm=451d13a1d9436ffe86b5b8f30c62598138706feca1c6824daea7bc8fd56f1714&=')
        .setDescription(i18next.t('ban-js_banned_description', { moderator: moderator.id, reason }))
        .setTimestamp()
        .setFooter({ text: i18next.t('ban-js_banned_footer') });

      await user.send({ embeds: [banEmbed] }).catch(err => console.error(`Не удалось отправить сообщение пользователю: ${err.message}`));
      await user.send(url).catch(err => console.error(`Не удалось отправить сообщение пользователю: ${err.message}`));
      // Находим канал логирования
      const logChannelName = (await getServerSettings(guild.id)).logChannelName;
      let logChannel;
      if (banLogChannelNameUse) {
        logChannel = guild.channels.cache?.find(ch => ch.name === banLogChannelName);
      } else {
        logChannel = guild.channels.cache?.find(ch => ch.name === logChannelName);
      }

      // Если канал логирования не существует, создаем его
      if (!logChannel) {
        const channelNameToCreate = banLogChannelNameUse ? banLogChannelName : logChannelName;
        const logChannelCreationResult = await createLogChannel(interaction, channelNameToCreate, guild.members.cache.get(robot.user.id), guild.roles.cache.filter(role => role.comparePositionTo(guild.members.cache.get(robot.user.id).roles.highest) > 0), serverSettings);

        if (logChannelCreationResult.startsWith('Ошибка')) {
          return interaction.editReply({ content: logChannelCreationResult, ephemeral: true });
        }

        // Обновляем переменную logChannel созданного канала
        logChannel = guild.channels.cache.find(ch => ch.name === channelNameToCreate);
      }

      // Создаем вставку для регистрации события выдачи роли
      const EmbedBan = new EmbedBuilder()
        .setColor(0xFF0000) // Красный цвет для бана
        .setTitle(i18next.t('ban-js_block_user_title', { reason }))
        .setDescription(i18next.t('ban-js_block_user_description', { user: userId, reason }))
        .setTimestamp()
        .setFooter({ text: i18next.t('ban-js_block_user_footer', { moderator: moderator.tag }) });

      // Отправляем вставку в канал журнала
      await logChannel.send({ embeds: [EmbedBan] });

      // Отвечаем пользователю, который выполнил команду, сообщением с подтверждением
      await interaction.editReply({ content: i18next.t('ban-js_block_user_title'), ephemeral: true });
    } catch (error) {
      console.error(`Произошла ошибка: ${error.message}`);
      return interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
    }
  },
};
