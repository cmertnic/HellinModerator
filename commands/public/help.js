// Импорт необходимых классов из библиотеки discord.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, Events, ChannelType } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { i18next } = require('../../i18n'); // Импорт для интернационализации
const userCommandCooldowns = new Map(); // Хранит время отката для команд пользователей
const { createLogChannel, handleSelectInteraction } = require('../../events'); // Импорт функций для работы с логами и обработкой взаимодействий
const { getServerSettings } = require('../../database/settingsDb');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('help') // Название команды
        .setDescription('Помощь') // Описание команды
        .addStringOption(option =>
            option.setName('question') // Опция для вопроса
                .setDescription('Введите ваш вопрос') // Описание опции
                .setRequired(true)), // Обязательная опция

    async execute(robot, interaction) {
        // Проверка, является ли пользователь ботом
        if (interaction.user.bot) return;

        // Проверка, является ли канал личным сообщением
        if (interaction.channel.type === ChannelType.DM) {
            return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
        }

        // Получение вопроса из опции
        const question = interaction.options.getString('question');

        // Проверка времени отката для команды
        const commandCooldown = userCommandCooldowns.get(interaction.user.id);
        if (commandCooldown && commandCooldown.command === 'help' && Date.now() < commandCooldown.endsAt) {
            const timeLeft = Math.round((commandCooldown.endsAt - Date.now()) / 1000); // Осталось времени
            return interaction.reply({ content: (i18next.t(`cooldown`, { timeLeft: timeLeft })), ephemeral: true });
        }
        const serverSettings = await getServerSettings(interaction.guild.id);
        const helpLogChannelName = serverSettings.helpLogChannelName;
        const helpLogChannelNameUse = serverSettings.helpLogChannelNameUse;
        const logChannelName = serverSettings.logChannelName;
        let logChannel;
        if (helpLogChannelNameUse) {
            logChannel = interaction.guild.channels.cache.find(ch => ch.name === helpLogChannelName);
        } else {
            logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
        }
    
        if (!logChannel) {
            const channelNameToCreate = helpLogChannelNameUse ? helpLogChannelName : logChannelName;
            const roles = interaction.guild.roles.cache;
            const higherRoles = roles.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);
            const logChannelCreationResult = await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles, serverSettings);
    
            if (logChannelCreationResult.startsWith('Ошибка')) {
                return interaction.reply({ content: logChannelCreationResult, ephemeral: true });
            }
    
            logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
        }
        const botMember = interaction.guild.members.me; // Получение информации о боте

        // Создаем вложение для сообщения
        const questionEmbed = new EmbedBuilder()
            .setColor(0x00FF00) // Устанавливаем цвет вложения
            .setTitle('Вопрос от ' + interaction.user.username) // Заголовок вложения с именем пользователя
            .setDescription(question) // Описание с вопросом
            .setTimestamp(); // Установка времени для вложения

        // Отправляем сообщение в канал помощи
        const helpMessage = await logChannel.send({ embeds: [questionEmbed] });

        // Создаем выпадающее меню для ответов
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`responseSelect_${helpMessage.id}`) // Уникальный идентификатор для меню
            .setPlaceholder('Выберите ответ или введите свой') // Текст-заполнитель
            .addOptions([
                {
                    label: 'Да', // Метка для опции
                    value: 'response_yes', // Значение для опции
                },
                {
                    label: 'Нет',
                    value: 'response_no',
                },
                {
                    label: 'Написать ответ',
                    value: 'custom_response',
                },
            ]);

        // Создаем строку действий и добавляем меню
        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        await helpMessage.edit({ components: [selectRow] }); // Обновляем сообщение, добавляя выпадающее меню

        // Устанавливаем время отката на 1 час 10 минут
        userCommandCooldowns.set(interaction.user.id, { command: 'help', endsAt: Date.now() + 4200000 }); // 1 час 10 минут
        await interaction.reply({ content: 'Ваш вопрос был отправлен!', ephemeral: true }); // Подтверждение отправки вопроса

        // Регистрация обработчика для взаимодействия с выпадающим меню
        robot.on(Events.InteractionCreate, async (selectInteraction) => {
            if (selectInteraction.isStringSelectMenu() && selectInteraction.customId.startsWith('responseSelect_')) {
                // Обработка выбора пользователя из меню
                await handleSelectInteraction(logChannel, selectInteraction, interaction.user, question);
            }
        });
    }
};
