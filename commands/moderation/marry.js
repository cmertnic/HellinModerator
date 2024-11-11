// Импорт необходимых классов и функций из Discord.js и других модулей
const { ChannelType, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { i18next } = require('../../i18n'); // Импорт i18next для интернационализации
const { createRoles, createLogChannel } = require('../../events'); // Импорт функций для создания ролей и лог-канала
const userCommandCooldowns = new Map(); // Карта для отслеживания кулдаунов команд пользователей

// Функция для проверки существования необходимых ролей на сервере
async function ensureRolesExist(interaction) {
    const rolesToCreate = ['💞']; // Определяем роли для создания
    await createRoles(interaction, rolesToCreate); // Вызываем функцию для создания ролей
}

// Экспортируем модуль команды
module.exports = {
    data: new SlashCommandBuilder()
        .setName('marry') // Название команды
        .setDescription('Предложить кому-то жениться') // Описание команды
        .addUserOption(option => option
            .setName('user') // Опция для пользователя, которому делать предложение
            .setDescription('Пользователь, которому вы хотите сделать предложение') // Описание опции пользователя
            .setRequired(true)), // Сделать эту опцию обязательной
    
    // Функция выполнения для обработки команды
    async execute(robot, interaction) {
        // Запретить использование команды ботами
        if (interaction.user.bot) return;

        // Проверить, используется ли команда в личных сообщениях
        if (interaction.channel.type === ChannelType.DM) {
            return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
        }

        // Проверить, была ли уже отправлена или отложена реакция на взаимодействие
        if (interaction.replied || interaction.deferred) {
            return; 
        }

        // Отложить ответ, чтобы подтвердить обработку команды
        await interaction.deferReply({ ephemeral: true });

        // Убедиться, что необходимые роли существуют
        await ensureRolesExist(interaction);

        // Проверить кулдаун команды
        const commandCooldown = userCommandCooldowns.get(interaction.user.id);
        if (commandCooldown && commandCooldown.command === 'marry' && Date.now() < commandCooldown.endsAt) {
            const timeLeft = Math.round((commandCooldown.endsAt - Date.now()) / 1000);
            return await interaction.editReply({ content: i18next.t('cooldown', { timeLeft }), ephemeral: true });
        }

        // Получить пользователя для предложения из опций команды
        const userToMarry = interaction.options.getUser ('user');
        // Запретить само-предложения
        if (userToMarry.id === interaction.user.id) {
            return await interaction.editReply({ content: i18next.t('marry-js_self_proposal'), ephemeral: true });
        }

        // Найти роль "женат" в гильдии
        const marriedRole = interaction.guild.roles.cache.find(role => role.name === '💞');

        let proposerMember;
        let receiverMember;

        // Получить участников из гильдии
        try {
            proposerMember = await interaction.guild.members.fetch(interaction.user.id);
            receiverMember = await interaction.guild.members.fetch(userToMarry.id);
        } catch (error) {
            return await interaction.editReply({ content: i18next.t('User_not_found'), ephemeral: true });
        }

        // Проверить, есть ли у инициатора уже роль "женат"
        if (proposerMember.roles.cache.has(marriedRole.id)) {
            return await interaction.editReply({ content: i18next.t('marry-js_role_exists1'), ephemeral: true });
        }

        // Проверить, есть ли у получателя уже роль "женат"
        if (receiverMember.roles.cache.has(marriedRole.id)) {
            return await interaction.editReply({ content: i18next.t('marry-js_role_exists2', { user: userToMarry.username }), ephemeral: true });
        }

        // Создать выпадающее меню для ответа на предложение
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('marry_response') // Установить пользовательский ID для меню
            .setPlaceholder(i18next.t('marry-js_select_placeholder')) // Текст-заполнитель
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel(i18next.t('marry-js_accept')) // Опция "Принять"
                    .setValue('accept'), // Значение для принятия
                new StringSelectMenuOptionBuilder()
                    .setLabel(i18next.t('marry-js_decline')) // Опция "Отклонить"
                    .setValue('decline'), // Значение для отклонения
            ]);

        // Создать ряд для размещения выпадающего меню
        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Создать вложение для предложения о браке
        const marryEmbed = new EmbedBuilder()
            .setColor(0x00FF00) // Установить цвет вложения
            .setTitle(i18next.t('marry-js_proposal_title')) // Заголовок вложения
            .setDescription(i18next.t('marry-js_proposal_description', { user: interaction.user.username })) // Описание
            .setImage('https://media.discordapp.net/attachments/1304806409011200063/1305545882027950140/bd7317c5771b33d26df5774f4f2313b2.gif?ex=67336bda&is=67321a5a&hm=43cb738298a892c1a5a04544727db755d0f3fb8029aec44061d5151c38c0975a&=') // Изображение в вложении
            .setTimestamp(); // Время для вложения

        const botMember = interaction.guild.members.me; // Получить участника бота
        const logChannelName = '🖤свадьба'; // Определить имя лог-канала
        let logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName); // Проверить, существует ли лог-канал

        // Создать лог-канал, если он не существует
        if (!logChannel) {
            const logChannelCreationResult = await createLogChannel(interaction, logChannelName, botMember, interaction.guild.roles.cache);

            // Обработать ошибки при создании лог-канала
            if (logChannelCreationResult.startsWith('Ошибка')) {
                return interaction.editReply({ content: logChannelCreationResult, ephemeral: true });
            }

            logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName); // Повторно получить лог-канал
        }

        // Получить все каналы и проверить существование лог-канала
        const fetchedChannels = await interaction.guild.channels.fetch();
        const existingChannel = fetchedChannels.find(c => c.name === logChannelName && c.type === ChannelType.GuildText);

        // Создать лог-канал, если он не существует
        if (!existingChannel) {
            const everyoneRole = interaction.guild.roles.everyone;

            try {
                await interaction.guild.channels.create({
                    name: logChannelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: everyoneRole.id,
                            deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] // Запретить права для всех
                        },
                        {
                            id: botMember.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] // Разрешить права для бота
                        }
                    ],
                    reason: i18next.t('events-js_logChannel_reason') // Причина создания канала
                });
            } catch (error) {
                console.error(`Ошибка при создании канала: ${error}`); // Лог ошибки
            }
        }

        // Отправить сообщение с предложением пользователю
        const proposalMessage = await userToMarry.send({ embeds: [marryEmbed], components: [row] }).catch(async err => {
            // Если отправка ЛС не удалась, залогировать сообщение в лог-канале
            if (existingChannel) {
                await existingChannel.send({ embeds: [marryEmbed] });
            }

            return await interaction.editReply({ content: i18next.t('marry-js_user_dm_error'), ephemeral: true });
        });

        // Уведомить инициатора, что предложение было отправлено
        await interaction.editReply({ content: i18next.t('marry-js_proposal_sent', { user: userToMarry.username }), ephemeral: true });

        // Создать фильтр для коллектора ответов
        const filter = (i) => i.user.id === userToMarry.id;
        const collector = proposalMessage.createMessageComponentCollector({ filter, time: 86400000 }); // 24 часа

        // Установить кулдаун для команды marry
        userCommandCooldowns.set(interaction.user.id, { command: 'marry', endsAt: Date.now() + 604800000 }); // Кулдаун 7 дней

        // Собрать ответы на предложение
        collector.on('collect', async (i) => {
            await i.deferUpdate(); // Отложить обновление взаимодействия
            
            let responseEmbed; // Вложение для ответа
            
            // Обработать принятие предложения
            if (i.values[0] === 'accept') {
                responseEmbed = new EmbedBuilder()
                    .setColor(0x00FF00) // Установить цвет для принятия
                    .setTitle(i18next.t('marry-js_proposal_accepted_title')) // Заголовок для принятия
                    .setDescription(i18next.t('marry-js_proposal_accepted', { user1: interaction.user.username, user2: userToMarry.username })) // Описание для принятия
                    .setImage('https://images-ext-1.discordapp.net/external/GeSN-LiDIS1WKl8jvHsn2daPuuppCnJ9cxccT1QFioc/https/c.tenor.com/u7B_BCacat8AAAAC/wedding-ring-engaged.gif') // Изображение для принятия
                    .setTimestamp(); // Время для вложения
                
                // Залогировать принятие в лог-канале
                if (existingChannel) {
                    await existingChannel.send({ embeds: [responseEmbed] });
                }

                // Добавить роль "женат" обоим участникам
                await proposerMember.roles.add(marriedRole).catch(error => {
                    console.error(`Ошибка при добавлении роли инициатору: ${error.message}`); // Лог ошибки
                });
                await receiverMember.roles.add(marriedRole).catch(error => {
                    console.error(`Ошибка при добавлении роли получателю: ${error.message}`); // Лог ошибки
                });
            } 
            // Обработать отклонение предложения
            else if (i.values[0] === 'decline') {
                responseEmbed = new EmbedBuilder()
                    .setColor(0xFF0000) // Установить цвет для отклонения
                    .setTitle(i18next.t('marry-js_proposal_declined_title')) // Заголовок для отклонения
                    .setDescription(i18next.t('marry-js_declined_message', { user: userToMarry.username })) // Описание для отклонения
                    .setImage('https://media.discordapp.net/attachments/1304806409011200063/1305545882027950140/bd7317c5771b33d26df5774f4f2313b2.gif?ex=67336bda&is=67321a5a&hm=43cb738298a892c1a5a04544727db755d0f3fb8029aec44061d5151c38c0975a&=') // Изображение для отклонения
                    .setTimestamp(); // Время для вложения
                
                // Отправить ответ об отклонении инициатору
                try {
                    await interaction.user.send({ embeds: [responseEmbed] });
                } catch (error) {
                    // Залогировать отклонение в лог-канале, если ЛС не удалось
                    if (existingChannel) {
                        await existingChannel.send({ embeds: [responseEmbed] });
                    }
                }
            }
        
            collector.stop(); // Остановить коллектор после ответа
        });

        // Обработать окончание коллектора (тайм-аут)
        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                // Уведомить инициатора, если предложение истекло
                if (existingChannel) {
                    interaction.user.send(i18next.t('marry-js_proposal_timeout', { user: userToMarry.username }));
                }
            }
        });

        // Очистить кулдаун команды пользователя через 7 дней
        setTimeout(() => {
            userCommandCooldowns.delete(interaction.user.id);
        }, 604800000); // 7 дней в миллисекундах
    },
};
