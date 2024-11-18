const { PermissionsBitField, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { i18next } = require('../../i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Показать правила сервера'),

    async execute(robot, interaction) {
        // Проверки
        if (interaction.user.bot) return;
        if (interaction.channel.type === ChannelType.DM) {
            return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
        }
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            interaction.reply({ content: i18next.t('Admin_user_check'), ephemeral: true });
            return;
        }

        // Создаем EmbedBuilder с информацией о правилах
        const rulesEmbed = new EmbedBuilder()
            .setColor(0x0099FF) // Цвет для Embed
            .setTitle('Правила сервера Hellin') // Заголовок для Embed
            .setDescription(
                'Сервер Hellin. Мы придерживаемся Terms of Service и Community Guidelines. ' +
                'Незнание правил не освобождает вас от ответственности.\n' +
                '[Community Guidelines](https://discord.com/guidelines)\n' +
                '[Terms of Service](https://discord.com/terms)'
            )
            .setImage('https://media.discordapp.net/attachments/1304707253735002153/1308027769250385950/9703fbdf4731dd76.png?ex=673c734a&is=673b21ca&hm=6be4967c3b3cf574e0845aea1fa6e598adfd33cc25bfd7d90e82b9adbb179c0a&=&format=webp&quality=lossless')
            .setTimestamp();

        // Создаем выпадающее меню для выбора правил
        const rulesSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('rulesSelect')
            .setPlaceholder('Выберите правила')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Общие правила 1.0-1.6')
                    .setValue('rule1'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Голосовые правила 2.0-2.5')
                    .setValue('rule2'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Текстовые правила 3.0-3.4')
                    .setValue('rule3'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Примечание')
                    .setValue('rule4')
            );

        const actionRow = new ActionRowBuilder().addComponents(rulesSelectMenu);

        // Отправляем Embed и выпадающее меню
        await interaction.reply({ embeds: [rulesEmbed], components: [actionRow] });
    },
};
