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
            await interaction.reply({ content: i18next.t('Admin_user_check'), ephemeral: true });
            return;
        }

        // Создаем EmbedBuilder с информацией о правилах
        const rulesEmbed = new EmbedBuilder()
            .setColor(0xFF0000) // Цвет для Embed
            .setTitle('Правила сервера Hellin') // Заголовок для Embed
            .setDescription(
                'Сервер Hellin. Мы придерживаемся Terms of Service и Community Guidelines. ' +
                'Незнание правил не освобождает вас от ответственности.\n' +
                '[Community Guidelines](https://discord.com/guidelines)\n' +
                '[Terms of Service](https://discord.com/terms)'
            )
            .setImage('https://media.discordapp.net/attachments/1304707253735002153/1309212889013293146/4fb8b30397ef7185.png?ex=6740c304&is=673f7184&hm=f451e267441109324096d53942c7732c9c96b05e81131372b8cfd6e5a24cda3f&=&format=webp&quality=lossless')
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

