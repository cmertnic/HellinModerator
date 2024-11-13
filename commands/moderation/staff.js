const { PermissionsBitField, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { i18next, t } = require('../../i18n');
const { getServerSettings } = require('../../database/settingsDb');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription('Создание окна найма'),

    async execute(robot, interaction) {       
        // Проверки и инициализация переменных
        if (interaction.user.bot) return;
        if (interaction.channel.type === ChannelType.DM) {
            return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
          }
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            interaction.reply({ content: i18next.t('Admin_user_check'), ephemeral: true });
            return;
        }
        const serverSettings = await getServerSettings(interaction.guild.id);
        const { supportRoleName, podkastRoleName, moderatorRoleName, eventRoleName, controlRoleName, creativeRoleName, } = serverSettings;
        const embed = new EmbedBuilder()
            .setColor('#696969') // Цвет рамки
            .setTitle('Проходит набор в команду сервера!')
            .setDescription('Заявки будут рассмотрены в течение 2 дней.')
            .setImage('https://media.discordapp.net/attachments/1304707253735002153/1305141737731260506/b681efd3301c9dc0816534f46a1da326_1.gif?ex=6731f376&is=6730a1f6&hm=de61c24a1b8463aad441c02c461f4ed081114f8d5d2792aaedc72af00157286f&=') 
            .setTimestamp();

        const roleSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('roleSelect')
            .setPlaceholder('Выберите роль')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(supportRoleName)
                    .setValue('role1'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(controlRoleName)
                    .setValue('role2'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(eventRoleName)
                    .setValue('role3'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(moderatorRoleName)
                    .setValue('role4'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(podkastRoleName)
                    .setValue('role5'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(creativeRoleName)
                    .setValue('role6'),
            );

        const actionRow = new ActionRowBuilder().addComponents(roleSelectMenu);

        await interaction.reply({ embeds: [embed], components: [actionRow] });
    },
};


