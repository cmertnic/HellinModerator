// Импортируем необходимые классы и модули
const { SlashCommandBuilder, ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { createLogChannel, deleteMessages, createRoles } = require('../../events');
const { getServerSettings } = require('../../database/settingsDb');
const { i18next } = require('../../i18n');

// Определяем названия опций с помощью i18next для локализации
const USER_OPTION_NAME ='user';
const DEL_MESS_TIME_OPTION_NAME = 'time';
const REASON_OPTION_NAME = 'reason';

// Экспортируем команду как модуль
module.exports = {
  // Определяем данные команды с помощью SlashCommandBuilder
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
      const userId = user.id;

      const reason = interaction.options.getString(REASON_OPTION_NAME) || i18next.t('defaultReason');
      const deleteMessagesTime = interaction.options.getString(DEL_MESS_TIME_OPTION_NAME);

      const serverSettings = await getServerSettings(interaction.guild.id);
      const { banRoleName, logChannelName, banLogChannelName, banLogChannelNameUse } = serverSettings;

      const moderator = interaction.user;
      const botMember = guild.members.cache.get(robot.user.id);

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return await interaction.editReply({ content: i18next.t('у вас нет полномочий BanMembers'), ephemeral: true });
      }
      if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return await interaction.editReply({ content: i18next.t('у меня нет полномочий ManageRoles'), ephemeral: true });
      }

      const banRole = interaction.guild.roles.cache.find(role => role.name === banRoleName);
      if (!banRole) {
        await createRoles(interaction, [banRoleName]);
      }

      await user.roles.add(banRole, reason);

      const banEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(i18next.t('ban-js_banned_title'))
        .setImage('https://media.discordapp.net/attachments/1304707253735002153/1309214603653283963/55c02c6f0fc22ea4b00448f242b59b77_1.png?ex=6740c49d&is=673f731d&hm=a1201c1349bd050132703395323031cb3da9c8210bd27cfa4cce7b4736f928f5&=&format=webp&quality=lossless&width=550&height=274')
        .setDescription(i18next.t('ban-js_banned_description', { moderator: moderator.id, reason }))
        .setTimestamp()
        .setFooter({ text: i18next.t('ban-js_banned_footer') });

      await user.send({ embeds: [banEmbed] }).catch(err => console.error(`Не удалось отправить сообщение пользователю: ${err.message}`));

      let logChannel;
      if (banLogChannelNameUse) {
        logChannel = guild.channels.cache.find(ch => ch.name === banLogChannelName);
      } else {
        logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);
      }

      if (!logChannel) {
        const channelNameToCreate = banLogChannelNameUse ? banLogChannelName : logChannelName;
        const logChannelCreationResult = await createLogChannel(interaction, channelNameToCreate, guild.members.cache.get(robot.user.id), guild.roles.cache.filter(role => role.comparePositionTo(guild.members.cache.get(robot.user.id).roles.highest) > 0), serverSettings);

        if (logChannelCreationResult.startsWith('Ошибка')) {
          return await interaction.editReply({ content: logChannelCreationResult, ephemeral: true });
        }

        logChannel = guild.channels.cache.find(ch => ch.name === channelNameToCreate);
      }

      const EmbedBan = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(i18next.t('ban-js_block_user_title', { reason }))
        .setDescription(i18next.t('ban-js_block_user_description', { user: userId, reason }))
        .setTimestamp()
        .setFooter({ text: i18next.t('ban-js_block_user_footer', { moderator: moderator.tag }) });

      await logChannel.send({ embeds: [EmbedBan] });
      await interaction.editReply({ content: i18next.t('ban-js_block_user_title'), ephemeral: true });

    } catch (error) {
      console.error(`Произошла ошибка: ${error.message}`);
      return await interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
    }
  },
};

// Функция для проверки корректности URL
function isValidURL(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}
