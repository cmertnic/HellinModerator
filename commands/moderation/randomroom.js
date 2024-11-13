const { ChannelType, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { i18next } = require('../../i18n');
const { getOrCreateVoiceChannel } = require('../../events');
const { getServerSettings } = require('../../database/settingsDb');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('randomroom')
        .setDescription('Создание комнаты для случаных переносов'),
    /**
* Выполнение команды
* @param {Client} robot - экземпляр клиента Discord.js
* @param {CommandInteraction} interaction - объект взаимодействия с пользователем
*/
    async execute(robot, interaction) {
        if (interaction.user.bot) return;
        if (interaction.channel.type === ChannelType.DM) {
            return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
        }
        const serverSettings = await getServerSettings(interaction.guild.id);
        const { randomRoomName } = serverSettings;
        // Проверка прав администратора у пользователя, вызвавшего команду
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({ content: i18next.t('Admin_user_check'), ephemeral: true });
        }

        // Проверяем, был ли уже отправлен ответ
        if (interaction.replied || interaction.deferred) {
            return; // Не продолжаем, если уже был ответ
        }

        await interaction.deferReply({ ephemeral: true });
        const botMember = interaction.guild.members.me;

        // Создаем или получаем голосовую комнату с заранее заданным названием
        const { channel, created } = await getOrCreateVoiceChannel(interaction.guild, randomRoomName, botMember);

        if (!channel) {
            return await interaction.editReply({ content: i18next.t('randomroom-js_channel_creation_error'), ephemeral: true });
        }

        await interaction.editReply({ content: i18next.t('randomroom-js_channel_created', { channel: channel.name }), ephemeral: true });
    },
};