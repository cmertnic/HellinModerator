const { Client, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, Events } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { i18next } = require('../../i18n');
const userCommandCooldowns = new Map();
const { createLogChannel } = require('../../events');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Помощь')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Введите ваш вопрос')
                .setRequired(true)),

    async execute(robot, interaction) {
        if (interaction.user.bot) return;
        if (interaction.channel.type === ChannelType.DM) {
            return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
        }
        const question = interaction.options.getString('question');

        const commandCooldown = userCommandCooldowns.get(interaction.user.id);
        if (commandCooldown && commandCooldown.command === 'help' && Date.now() < commandCooldown.endsAt) {
            const timeLeft = Math.round((commandCooldown.endsAt - Date.now()) / 1000);
            return interaction.reply({ content: (i18next.t(`cooldown`, { timeLeft: timeLeft })), ephemeral: true });
        }

        const helpChannelName = "help";
        const botMember = interaction.guild.members.me;
        let helpChannel = interaction.guild.channels.cache.find(ch => ch.name === helpChannelName);

        if (!helpChannel) {
            const logChannelCreationResult = await createLogChannel(interaction, helpChannelName, botMember, interaction.guild.roles.cache);

            if (logChannelCreationResult.startsWith('Ошибка')) {
                return interaction.editReply({ content: logChannelCreationResult, ephemeral: true });
            }

            helpChannel = interaction.guild.channels.cache.find(ch => ch.name === helpChannelName);
        }

        // Создаем вложение для сообщения
        const questionEmbed = new EmbedBuilder()
            .setColor(0x00FF00) // Установить цвет вложения
            .setTitle('Вопрос от ' + interaction.user.username) // Заголовок вложения
            .setDescription(question) // Описание
            .setTimestamp(); // Время для вложения

        const helpMessage = await helpChannel.send({ embeds: [questionEmbed] });

        // Создаем выпадающее меню для ответов
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`responseSelect_${helpMessage.id}`)
            .setPlaceholder('Выберите ответ или введите свой')
            .addOptions([
                {
                    label: 'Ответ 1',
                    value: 'response_1',
                },
                {
                    label: 'Ответ 2',
                    value: 'response_2',
                },
                {
                    label: 'Другой ответ',
                    value: 'custom_response',
                },
            ]);

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        await helpMessage.edit({ components: [selectRow] });

        userCommandCooldowns.set(interaction.user.id, { command: 'help', endsAt: Date.now() + 300200 });
        await interaction.reply({ content: 'Ваш вопрос был отправлен!', ephemeral: true });

        // Регистрация обработчика для взаимодействия с выпадающим меню
        robot.on(Events.InteractionCreate, async (selectInteraction) => {
            if (selectInteraction.isStringSelectMenu() && selectInteraction.customId.startsWith('responseSelect_')) {
                await handleSelectInteraction(helpChannel, selectInteraction, interaction.user, question);
            }
        });
    }
};

// Отдельная функция для обработки выбора из выпадающего меню
async function handleSelectInteraction(helpChannel, selectInteraction, questionUser, questionContent) {
    const selectedValue = selectInteraction.values[0];

    // Закрываем выпадающее меню
    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`responseSelect_${selectInteraction.message.id}`)
            .setDisabled(true) // Делаем меню недоступным
            .setPlaceholder('Вы уже выбрали ответ')
            .addOptions([
                {
                    label: 'Ответ 1',
                    value: 'response_1',
                },
                {
                    label: 'Ответ 2',
                    value: 'response_2',
                },
                {
                    label: 'Другой ответ',
                    value: 'custom_response',
                },
            ]) // Добавляем опции обратно
    );

    await selectInteraction.message.edit({ components: [selectRow] });

    const currentTime = new Date().toLocaleString(); // Получаем текущее время

    if (selectedValue === 'custom_response') {
        const responsePrompt = 'Пожалуйста, введите свой ответ в чате.';
        await selectInteraction.reply({ content: responsePrompt, ephemeral: true });

        const filter = msg => msg.author.id === questionUser.id && !msg.author.bot;
        const collector = selectInteraction.channel.createMessageCollector({ filter, max: 1, time: 60000 }); // Слушаем 60 секунд

        collector.on('collect', async (msg) => {
            try {
                const responseEmbed = new EmbedBuilder()
                    .setColor(0x0000FF)
                    .setTitle('Ответ от ' + `${selectInteraction.user.tag}`)
                    .setDescription(msg.content)
                    .addFields({ name: 'Ваш вопрос:', value: questionContent })
                    .setTimestamp();

                await questionUser.send({ embeds: [responseEmbed] });
                await selectInteraction.followUp({ content: `Ваш ответ был отправлен <@${selectInteraction.user.id}>.`, ephemeral: true });

                // Устанавливаем напоминание
                const reminderTime = 3600000; // Время напоминания в миллисекундах (1 час)
                setTimeout(async () => {
                    try {
                        await questionUser.send({ content: `Напоминаю вам о вашем вопросе: "${questionContent}"` });
                    } catch (error) {
                        console.error(`Не удалось отправить напоминание пользователю ${questionUser.tag}: ${error.message}`);
                    }
                }, reminderTime);

                await selectInteraction.message.delete();
                await msg.delete();
            } catch (error) {
                console.error(`Не удалось отправить личное сообщение пользователю ${questionUser.tag}: ${error.message}`);
                await selectInteraction.followUp({ content: 'Не удалось отправить вам личное сообщение. Проверьте настройки конфиденциальности.', ephemeral: true });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                selectInteraction.followUp({ content: 'Вы не ввели ответ вовремя.', ephemeral: true });
            }
        });

        return; // Завершаем функцию, чтобы не продолжать обработку
    } else {
        const response = `Вы выбрали: ${selectedValue === 'response_1' ? 'Ответ 1' : 'Ответ 2'}`;

        const responseEmbed = new EmbedBuilder()
            .setColor(0x0000FF)
            .setTitle(`Ответ от ${selectInteraction.user.tag}`)
            .setDescription(response)
            .addFields({ name: 'Ваш вопрос:', value: questionContent })
            .setTimestamp();

        await helpChannel.messages.delete(selectInteraction.message.id).catch(console.error);

        try {
            await questionUser.send({ embeds: [responseEmbed] });
            await selectInteraction.followUp({ content: `Вам был отправлен ответ от <@${selectInteraction.user.id}>.`, ephemeral: true });

            // Устанавливаем напоминание
            const reminderTime = 3600000; // Время напоминания в миллисекундах (1 час)
            setTimeout(async () => {
                try {
                    await questionUser.send({ content: `Напоминаю вам о вашем вопросе: "${questionContent}"` });
                } catch (error) {
                    console.error(`Не удалось отправить напоминание пользователю ${questionUser.tag}: ${error.message}`);
                }
            }, reminderTime);

            await selectInteraction.message.delete();
        } catch (error) {
            console.error(`Не удалось отправить личное сообщение пользователю ${questionUser.tag}: ${error.message}`);
            await selectInteraction.reply({ content: 'Не удалось отправить вам личное сообщение. Проверьте настройки конфиденциальности.', ephemeral: true });
            return;
        }
    }
}

