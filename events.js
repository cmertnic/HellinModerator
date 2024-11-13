const cron = require('node-cron');
const validLanguages = ['ben', 'chi', 'eng', 'fra', 'ger', 'hin', 'jpn', 'kor', 'por', 'rus', 'spa'];
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const { saveServerSettings, getServerSettings } = require('./database/settingsDb');
const { i18next, t, updateI18nextLanguage } = require('./i18n');

// Функция для валидации ID пользователя с помощью регулярного выражения
function validateUserId(userId) {
    const regex = /^(?:<@)?!?(\d{17,19})>?$/;
    const match = userId.match(regex);
    return match ? match[1] : null;
}

// Функция для обеспечения существования директории
async function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    try {
        await fs.access(dirname);
    } catch (err) {
        await fs.mkdir(dirname, { recursive: true });
    }
}

// Функция для форматирования продолжительности в дни, часы, минуты и секунды
function formatDuration(duration) {
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const seconds = Math.floor((duration / 1000) % 60);

    const parts = [];
    if (days > 0) parts.push(`${days} ${t('events-js_formatDuration_d' + getPlural(days, '1', '2', '3'))}`);
    if (hours > 0) parts.push(`${hours} ${t('events-js_formatDuration_h' + getPlural(hours, '1', '2', '3'))}`);
    if (minutes > 0) parts.push(`${minutes} ${t('events-js_formatDuration_m' + getPlural(minutes, '1', '2', '3'))}`);
    if (seconds > 0) parts.push(`${seconds} ${t('events-js_formatDuration_s' + getPlural(seconds, '1', '2', '3'))}`);

    return parts.join(' ');
}

// Функция для преобразования пользовательского формата времени в миллисекунды
function convertToTimestamp(customTimeFormat) {
    const defaultValues = { days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };
    const parts = customTimeFormat.split(':').map(part => parseInt(part, 10));

    const timeParts = { ...defaultValues };
    parts.forEach((part, index) => {
        if (part) {
            const key = Object.keys(defaultValues)[index];
            timeParts[key] = part;
        }
    });

    const timeInMilliseconds = (timeParts.days * 86400000) +
        (timeParts.hours * 3600000) +
        (timeParts.minutes * 60000) +
        (timeParts.seconds * 1000) +
        timeParts.milliseconds;

    return timeInMilliseconds;
}

// Функция для преобразования строки времени в миллисекунды
function convertToMilliseconds(timeString) {
    const timePattern = /(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?/;
    const match = timePattern.exec(timeString);

    if (!match) return 300000;

    const days = parseInt(match[1]) || 0;
    const hours = parseInt(match[2]) || 0;
    const minutes = parseInt(match[3]) || 0;
    const seconds = parseInt(match[4]) || 0;

    const millisecondsPerDay = 86400000;
    const millisecondsPerHour = 3600000;
    const millisecondsPerMinute = 60000;
    const millisecondsPerSecond = 1000;

    return days * millisecondsPerDay +
        hours * millisecondsPerHour +
        minutes * millisecondsPerMinute +
        seconds * millisecondsPerSecond;
}

// Дополнительные функции для обработки сообщений
async function sendPart(channel, part) {
    await channel.send(part).catch(e => console.error(e));
}

async function sendLongMessage(channel, text) {
    const MAX_LENGTH = 2000;

    if (text.length <= MAX_LENGTH) {
        await sendPart(channel, text);
    } else {
        const parts = text.match(/(.|[\r\n]){1,1980}(?=\s|$)|(.|[\r\n])+?(\s|$)/g);
        for (const part of parts) {
            if (part.length > 0) {
                const partText = part + '...(продолжение)';
                await sendPart(channel, partText);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    }
}

// Функция для удаления сообщений от забаненных пользователей
async function deleteMessages(user, deleteMessagesTime, guild, logChannel) {
    let deletedMessagesCount = 0;
    const DELETE_MESSAGES_TIME_VALUES = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '3d': 72 * 60 * 60 * 1000,
        '7d': 168 * 60 * 60 * 1000,
    };

    const textChannels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText);
    const promises = textChannels.map(async channel => {
        try {
            const messages = await channel.messages.fetch({ limit: 100 });
            const messagesFromBannedUser = messages.filter(m => m.author.id === user.id);

            if (messagesFromBannedUser.size > 0) {
                let messagesBatch;
                const now = Date.now();
                const deleteMessagesDurationMs = convertToMilliseconds(DELETE_MESSAGES_TIME_VALUES[deleteMessagesTime]);

                switch (deleteMessagesTime) {
                    case '1h':
                        messagesBatch = messagesFromBannedUser.filter(m => now - m.createdTimestamp < DELETE_MESSAGES_TIME_VALUES['1h']);
                        break;
                    case '6h':
                        messagesBatch = messagesFromBannedUser.filter(m => now - m.createdTimestamp < DELETE_MESSAGES_TIME_VALUES['6h']);
                        break;
                    case '12h':
                        messagesBatch = messagesFromBannedUser.filter(m => now - m.createdTimestamp < DELETE_MESSAGES_TIME_VALUES['12h']);
                        break;
                    case '1d':
                        messagesBatch = messagesFromBannedUser.filter(m => now - m.createdTimestamp < DELETE_MESSAGES_TIME_VALUES['1d']);
                        break;
                    case '3d':
                        messagesBatch = messagesFromBannedUser.filter(m => now - m.createdTimestamp < DELETE_MESSAGES_TIME_VALUES['3d']);
                        break;
                    case '7d':
                        messagesBatch = messagesFromBannedUser.filter(m => now - m.createdTimestamp < DELETE_MESSAGES_TIME_VALUES['7d']);
                        break;
                    default:
                        messagesBatch = messagesFromBannedUser;
                        break;
                }

                if (messagesBatch.size > 0) {
                    deletedMessagesCount += messagesBatch.size;
                    await channel.bulkDelete(messagesBatch);
                }
            }
        } catch (error) {
            console.error(`Ошибка при удалении сообщений из канала ${channel.name}:`, error);
        }
    });
    await Promise.all(promises);
    return deletedMessagesCount;
}

// Функция для определения правильной формы слова в зависимости от числа
function getPlural(n, singular, few, many) {
    if (n % 10 === 1 && n % 100 !== 11) {
        return singular;
    } else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) {
        return few;
    } else {
        return many;
    }
}

// Функция для отправления сообщения и его удаления
async function sendPartAndDelete(context, part) {
    try {
        let message;
        if (context.channel) {
            // Если context имеет канал, отправляем сообщение в этот канал
            message = await context.channel.send(part);
        } else if (context.reply) {
            // Если context имеет метод reply, используем его для отправки сообщения
            message = await context.reply(part);
        }

        // Удаление сообщения после заданного времени
        setTimeout(() => {
            if (message.delete) {
                message.delete();
            }
        }, 10000); // Удаляет сообщение через 10 секунд
    } catch (error) {
        console.error('Ошибка при отправке или удалении сообщения:', error);
    }
}

// Функция для создания главного канала лоигрования
async function createMainLogChannel(interaction, channelName, botMember, higherRoles, serverSettings) {
    const result = await getOrCreateLogChannel(interaction.guild, channelName, botMember, higherRoles);
    if (result) {
        if (result.created) {
            serverSettings.logChannelName = result.channel.name;
            await saveServerSettings(interaction.guild.id, serverSettings);
            return i18next.t('events-js_mainLogChannel_create', { channelName: result.channel.name });
        } else {
            return i18next.t('events-js_mainLogChannel_exists', { channelName: result.channel.name });
        }
    } else {
        return i18next.t('events-js_mainLogChannel_error');
    }
}

// Функция получения или создания лог-канала
async function getOrCreateLogChannel(guild, channelName, botMember, higherRoles) {
    const message = i18next.t('events-js_logChannel_reason');
    let fetchedChannels = await guild.channels.fetch();
    const existingChannel = fetchedChannels.find(c => c.name === channelName && c.type === ChannelType.GuildText);

    if (existingChannel) {
        return { channel: existingChannel, created: false };
    } else {
        const everyoneRole = guild.roles.everyone;
        const moderators = await guild.members.fetch().then(members => members.filter(member => member.permissions.has(PermissionFlagsBits.ModerateMembers)));

        try {
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: everyoneRole.id,
                        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                    },
                    {
                        id: botMember.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                    },
                    ...moderators.map(member => ({
                        id: member.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                    })),
                    ...higherRoles.map(role => ({
                        id: role.id,
                        allow: [PermissionFlagsBits.ViewChannel]
                    }))
                ],
                reason: message
            });

            return { channel, created: true };
        } catch (error) {
            console.error(`Ошибка при создании канала: ${error}`);
            return null; // Возвращаем null в случае ошибки
        }
    }
}
async function getOrCreateVoiceChannel(guild, channelName, botMember) {
    const fetchedChannels = await guild.channels.fetch();
    const existingChannel = fetchedChannels.find(c => c.name === channelName && c.type === ChannelType.GuildVoice);

    if (existingChannel) {
        return { channel: existingChannel, created: false };
    } else {
        const everyoneRole = guild.roles.everyone;

        try {
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                permissionOverwrites: [
                    {
                        id: everyoneRole.id,
                        allow: [PermissionFlagsBits.Connect]
                    },
                    {
                        id: botMember.id,
                        allow: [PermissionFlagsBits.Connect]
                    }
                ],
                reason: i18next.t('events-js_logChannel_reason')
            });

            return { channel, created: true };
        } catch (error) {
            console.error(`Ошибка при создании канала: ${error}`);
            return null; // Возвращаем null в случае ошибки
        }
    }
}
// Функция для создания побочных каналов логирования
async function createLogChannel(interaction, channelName, botMember, higherRoles) {
    const result = await getOrCreateLogChannel(interaction.guild, channelName, botMember, higherRoles);
    if (result) {
        if (result.created) {
            return i18next.t('events-js_logChannel_create', { channelName: channelName, createdChannelName: result.channel.name });
        } else {
            return i18next.t('events-js_logChannel_exists', { channelName: channelName, createdChannelName: result.channel.name });
        }
    } else {
        return i18next.t('events-js_logChannel_error', { channelName: channelName });
    }
}

// Функция для создания роли мута
async function createMutedRole(interaction, serverSettings) {
    let mutedRole = interaction.guild.roles.cache.find(role => role.name === serverSettings.mutedRoleName);
    if (!mutedRole) {
        try {
            mutedRole = await interaction.guild.roles.create({
                name: serverSettings.mutedRoleName,
                color: '#808080',
                permissions: []
            });

            return i18next.t('events-js_mutedRole_created', { roleName: serverSettings.mutedRoleName });
        } catch (error) {
            console.error(`Ошибка при создании роли ${serverSettings.mutedRoleName}: ${error}`);
            return i18next.t('events-js_mutedRole_error', { roleName: serverSettings.mutedRoleName });
        }
    } else {
        return i18next.t('events-js_mutedRole_exists', { roleName: serverSettings.mutedRoleName });
    }
}
// Функция для уведомления пользователя и логирования мута
async function notifyUserAndLogMute(interaction, memberToMute, botMember, reason, durationn, moderatorId) {
    const serverSettings = await getServerSettings(interaction.guild.id);
    const muteNotice = serverSettings.muteNotice;
    const muteLogChannelName = serverSettings.muteLogChannelName;
    const muteLogChannelNameUse = serverSettings.muteLogChannelNameUse;
    const logChannelName = serverSettings.logChannelName;
    const defaultReason = i18next.t('defaultReason');

    let logChannel;
    if (muteLogChannelNameUse) {
        logChannel = interaction.guild.channels.cache.find(ch => ch.name === muteLogChannelName);
    } else {
        logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
    }

    if (!logChannel) {
        const channelNameToCreate = muteLogChannelNameUse ? muteLogChannelName : logChannelName;
        const roles = interaction.guild.roles.cache;
        const higherRoles = roles.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);
        const logChannelCreationResult = await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles, serverSettings);

        if (logChannelCreationResult.startsWith('Ошибка')) {
            return interaction.reply({ content: logChannelCreationResult, ephemeral: true });
        }

        logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
    }

    const reasonMessage = reason ? i18next.t('mute-js_reasonMessage_1', { reason: reason }) : i18next.t('mute-js_reasonMessage_2', { defaultReason: defaultReason });
    const moderatorMessage = moderatorId ? i18next.t('mute-js_moderatorMessage_1', { userTag: interaction.user.tag }) : i18next.t('mute-js_moderatorMessage_2');

    if (muteNotice && memberToMute) {
        try {
            const embed = new EmbedBuilder()
                .setColor('#FFA500') // Color of the embed (orange for mute)
                .setDescription(
                    i18next.t('mute-js_user_message', {
                        moderator: interaction.user.id,
                        guildName: interaction.guild.name,
                        durationn: durationn,
                        reasonMessage: reasonMessage,
                    })
                )
                .setImage('https://media.discordapp.net/attachments/1304707253735002153/1305191258385416274/c8fd2f8d8fedab528cc4fa3315e1755c.gif?ex=67322195&is=6730d015&hm=451d13a1d9436ffe86b5b8f30c62598138706feca1c6824daea7bc8fd56f1714&=')
                .setTimestamp();

            await memberToMute.send({ embeds: [embed] });
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
        }
    }

    if (logChannel) {
        try {
            const EmbedMuteUser = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle(i18next.t('mute-js_muted_user_log_channel_title'))
                .setDescription(i18next.t('mute-js_muted_user_log_channel', { Mute_member_id: memberToMute.id, durationn: durationn, reasonMessage: reasonMessage }))
                .setTimestamp()
                .setFooter({ text: i18next.t('mute-js_muted_user_log_channel_footer', { moderator: interaction.user.tag }) });

            await logChannel.send({ embeds: [EmbedMuteUser] });
        } catch (error) {
            return interaction.reply({ content: i18next.t('Error_log', { error }), ephemeral: true });
        }
    } else {
        await interaction.reply({ content: i18next.t('Error_search_log'), ephemeral: true });
    }
}
// Функция для уведомления пользователя и логирования предупреждений
async function notifyUserAndLogWarn(interaction, memberToWarn, formattedDuration, reason) {
    const serverSettings = await getServerSettings(interaction.guild.id);
    const logChannelName = serverSettings.logChannelName;
    const warningLogChannelName = serverSettings.warningLogChannelName;
    const warningLogChannelNameUse = serverSettings.warningLogChannelNameUse;
    const warningsNotice = serverSettings.warningsNotice;

    let logChannel;
    if (warningLogChannelNameUse) {
        logChannel = interaction.guild.channels.cache.find(ch => ch.name === warningLogChannelName);
    } else {
        logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
    }

    if (!logChannel) {
        const channelNameToCreate = warningLogChannelNameUse ? warningLogChannelName : logChannelName;
        const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
        const higherRoles = interaction.guild.roles.cache.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);

        const logChannelCreationResult = await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles, serverSettings);

        if (logChannelCreationResult.startsWith('Ошибка')) {
            return interaction.reply({ content: logChannelCreationResult, ephemeral: true });
        }

        logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
    }

    if (warningsNotice && memberToWarn) {
        try {
            const embed = new EmbedBuilder()
                .setColor('#FF0000') // Color of the embed
                .setDescription(
                    t('warn-js_error_message_user', {
                        moderator: interaction.user.id,
                        guildname: interaction.guild.name,
                        formattedDuration,
                        reason,
                    })
                )
                .setImage('https://media.discordapp.net/attachments/1304707253735002153/1305191258385416274/c8fd2f8d8fedab528cc4fa3315e1755c.gif?ex=67322195&is=6730d015&hm=451d13a1d9436ffe86b5b8f30c62598138706feca1c6824daea7bc8fd56f1714&=')
                .setTimestamp();

            await memberToWarn.send({ embeds: [embed] });
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
        }
    }


    try {
        const EmbedWarnUser = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(t('warn-js_user_log_channel_title'))
            .setDescription(t('warn-js_warn_user_log_channel', { memberToWarn: memberToWarn.id, formattedDuration, reason }))
            .setTimestamp()
            .setFooter({ text: t('warn-js_user_log_channel_footer', { moderator: interaction.user.tag }) });

        await logChannel.send({ embeds: [EmbedWarnUser] });
    } catch (error) {
        console.error(` - Ошибка при отправке сообщения в лог-канал:`, error);
    }
}
// Функция валидации значения настройки
async function validateSettingValue(settingKey, value, interaction, guildId) {
    let isValid = true;
    let errorMessage = '';

    // Получаем название настройки для проверки
    const settingName = i18next.t(`settings-js_buttons_name_${settingKey}`); // Предполагается, что названия настроек хранятся в i18next
    // Валидация значения настройки в зависимости от ключа настройки
    switch (settingKey) {
        // Валидация для строковых значений
        case 'logChannelName':
        case 'mutedRoleName':
        case 'muteLogChannelName':
        case 'warningLogChannelName':
        case 'banLogChannelName':
        case 'clearLogChannelName':
        case 'kickLogChannelName':
        case 'reportLogChannelName':
        case 'NotAutomodChannels':
        case 'automodBlacklist':
        case 'automodBadLinks':
        case 'helpLogChannelName':
        case 'manRoleName':
        case 'girlRoleName':
        case 'newMemberRoleName':
        case 'banRoleName':
        case 'applicationsLogChannelName':
        case 'randomRoomName':
        case 'loversRoleName':
        case 'supportRoleName':
        case 'podkastRoleName':
        case 'moderatorRoleName':
        case 'eventRoleName':
        case 'controlRoleName':
        case 'creativeRoleName':
        case 'weddingsLogChannelName':
            if (typeof value !== 'string' || value.length === 0) {
                isValid = false;
                errorMessage = i18next.t(`settings-js_logchannel_error`, { settingKey });
            } else if (value === settingName) {
                isValid = false;
                errorMessage = i18next.t(`settings-js_value_same_as_setting_name`, { settingKey }); // Сообщение об ошибке
            }
            break;
        // Валидация для duration
        case 'muteDuration':
        case 'warningDuration':
            const durationPattern = /^(\d+d)?\s*(\d+h)?\s*(\d+m)?$/;
            if (!durationPattern.test(value)) {
                isValid = false;
                errorMessage = i18next.t(`settings-js_duration_error`, { settingKey });
            }
            break;
        // Валидация для maxWarnings
        case 'maxWarnings':
            const numberValue = parseInt(value);
            if (isNaN(numberValue) || numberValue <= 0) {
                isValid = false;
                errorMessage = i18next.t(`settings-js_maxWarnings_err`, { settingKey });
            }
            break;
        // Валидация для boolean значений
        case 'muteNotice':
        case 'warningsNotice':
        case 'deletingMessagesFromBannedUsers':
        case 'clearNotice':
        case 'muteLogChannelNameUse':
        case 'warningLogChannelNameUse':
        case 'banLogChannelNameUse':
        case 'clearLogChannelNameUse':
        case 'kickLogChannelNameUse':
        case 'reportLogChannelNameUse':
        case 'automod':
        case 'uniteautomodblacklists':
        case 'uniteAutomodBadLinks':
        case 'helpLogChannelNameUse':
        case 'applicationsLogChannelNameUse':
        case 'weddingsLogChannelNameUse':
            if (value !== '1' && value !== '0') {
                isValid = false;
                errorMessage = i18next.t(`settings-js_trueFalse_err`, { settingKey });
            } else {
                // Преобразуем '1' и '0' в true и false
                value = value === '1';
            }
            break;
        default:
            isValid = false;
            errorMessage = i18next.t(`settings-js_unknown_param_err`, { settingKey });
            break;
    }

    // Отправка уведомления об ошибке, если значение не прошло валидацию
    if (!isValid) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
    }

    return { isValid, value };
}
// Функция для обработки нажатий на кнопки в меню настроек
async function handleButtonInteraction(interaction, config, page) {
    if (!interaction.isButton()) return;

    try {
        await interaction.deferUpdate();
        const guildId = interaction.guild.id;
        const settingKey = interaction.customId;

        // Задержка в 0.1 секунду, чтобы бот успевал за пользователем
        await new Promise(resolve => setTimeout(resolve, 100));

        // Обработка навигации по страницам
        if (['previousPage', 'nextPage'].includes(settingKey)) {
            const newPage = settingKey === 'previousPage' ? page - 1 : page + 1;
            await displaySettings(interaction, config, newPage);
            return;
        }

        // Проверяем, является ли настройка булевой (в виде 0 или 1)
        const booleanSettings = [
            'muteNotice',
            'warningsNotice',
            'deletingMessagesFromBannedUsers',
            'clearNotice',
            'muteLogChannelNameUse',
            'warningLogChannelNameUse',
            'banLogChannelNameUse',
            'clearLogChannelNameUse',
            'kickLogChannelNameUse',
            'reportLogChannelNameUse',
            'automod',
            'uniteautomodblacklists',
            'uniteAutomodBadLinks',
            'helpLogChannelNameUse',
            'applicationsLogChannelNameUse',
            'weddingsLogChannelNameUse'
        ];

        if (booleanSettings.includes(settingKey)) {
            // Переключаем значение между 0 и 1
            config[settingKey] = config[settingKey] === 1 ? 0 : 1;
            await saveServerSettings(guildId, config);

            const successMessage = i18next.t(`settings-js_sucess_update`, { settingKey });
            await interaction.followUp({ content: successMessage, ephemeral: true });

            // Обновляем основное меню настроек
            await displaySettings(interaction, config, page);
            return;
        }

        // Обработка других типов настроек, которые требуют ввода нового значения
        const newValue = await promptUserForSettingValue(interaction, settingKey);
        if (newValue !== null) {
            // Валидация нового значения
            const validation = await validateSettingValue(settingKey, newValue, interaction, guildId);
            if (validation.isValid) {
                // Сохранение нового значения в конфигурации
                config[settingKey] = validation.value;
                await saveServerSettings(guildId, config);
                const successMessage = i18next.t(`settings-js_sucess_update`, { settingKey });
                await interaction.followUp({ content: successMessage, ephemeral: true });
            }
        }

        // Обновляем основное меню настроек
        await displaySettings(interaction, config, page);

    } catch (error) {
        console.error('Ошибка при обработке кнопки:', error);
        if (!interaction.replied) {
            await interaction.followUp({ content: 'Произошла ошибка. Пожалуйста, попробуйте позже.', ephemeral: true });
        }
    }
}


// Функция для отображения меню настроек
async function displaySettings(interaction, config, page = 1) {
    const itemsPerPage = 5;
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const settingsEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(i18next.t('settings-js_pages_title'))
        .setDescription(i18next.t('settings-js_pages_description'))
        .setFooter({ text: i18next.t(`settings-js_pages_number`, { page }) });
    const settings = [
        { key: 'muteLogChannelName', name: i18next.t('settings-js_buttons_name_1'), value: config.muteLogChannelName },
        { key: 'muteLogChannelNameUse', name: i18next.t('settings-js_buttons_name_2'), value: config.muteLogChannelNameUse === 1 ? '✅' : '❌' },
        { key: 'mutedRoleName', name: i18next.t('settings-js_buttons_name_3'), value: config.mutedRoleName },
        { key: 'muteDuration', name: i18next.t('settings-js_buttons_name_4'), value: String(config.muteDuration) },
        { key: 'muteNotice', name: i18next.t('settings-js_buttons_name_5'), value: config.muteNotice === 1 ? '✅' : '❌' },
        { key: 'warningLogChannelName', name: i18next.t('settings-js_buttons_name_6'), value: config.warningLogChannelName },
        { key: 'warningLogChannelNameUse', name: i18next.t('settings-js_buttons_name_7'), value: config.warningLogChannelNameUse === 1 ? '✅' : '❌' },
        { key: 'warningDuration', name: i18next.t('settings-js_buttons_name_8'), value: String(config.warningDuration) },
        { key: 'maxWarnings', name: i18next.t('settings-js_buttons_name_9'), value: String(config.maxWarnings) },
        { key: 'warningsNotice', name: i18next.t('settings-js_buttons_name_10'), value: config.warningsNotice === 1 ? '✅' : '❌' },
        { key: 'banLogChannelName', name: i18next.t('settings-js_buttons_name_11'), value: config.banLogChannelName },
        { key: 'banLogChannelNameUse', name: i18next.t('settings-js_buttons_name_12'), value: config.banLogChannelNameUse === 1 ? '✅' : '❌' },
        { key: 'deletingMessagesFromBannedUsers', name: i18next.t('settings-js_buttons_name_13'), value: config.deletingMessagesFromBannedUsers === 1 ? '✅' : '❌' },
        { key: 'kickLogChannelName', name: i18next.t('settings-js_buttons_name_14'), value: config.kickLogChannelName },
        { key: 'kickLogChannelNameUse', name: i18next.t('settings-js_buttons_name_15'), value: config.kickLogChannelNameUse === 1 ? '✅' : '❌' },
        { key: 'reportLogChannelName', name: i18next.t('settings-js_buttons_name_16'), value: config.reportLogChannelName },
        { key: 'reportLogChannelNameUse', name: i18next.t('settings-js_buttons_name_17'), value: config.reportLogChannelNameUse === 1 ? '✅' : '❌' },
        { key: 'clearLogChannelName', name: i18next.t('settings-js_buttons_name_18'), value: config.clearLogChannelName },
        { key: 'clearLogChannelNameUse', name: i18next.t('settings-js_buttons_name_19'), value: config.clearLogChannelNameUse === 1 ? '✅' : '❌' },
        { key: 'clearNotice', name: i18next.t('settings-js_buttons_name_20'), value: config.clearNotice === 1 ? '✅' : '❌' },
        { key: 'logChannelName', name: i18next.t('settings-js_buttons_name_21'), value: config.logChannelName },
        { key: 'automod', name: i18next.t('settings-js_buttons_name_23'), value: config.automod === 1 ? '✅' : '❌' },
        { key: 'NotAutomodChannels', name: i18next.t('settings-js_buttons_name_24'), value: String(config.NotAutomodChannels) },
        { key: 'automodBlacklist', name: i18next.t('settings-js_buttons_name_25'), value: String(config.automodBlacklist) },
        { key: 'automodBadLinks', name: i18next.t('settings-js_buttons_name_26'), value: String(config.automodBadLinks) },
        { key: 'uniteautomodblacklists', name: i18next.t('settings-js_buttons_name_27'), value: config.uniteautomodblacklists === 1 ? '✅' : '❌' },
        { key: 'uniteAutomodBadLinks', name: i18next.t('settings-js_buttons_name_28'), value: config.uniteAutomodBadLinks === 1 ? '✅' : '❌' },
        { key: 'helpLogChannelName', name: i18next.t('settings-js_buttons_name_29'), value: String(config.helpLogChannelName) },
        { key: 'helpLogChannelNameUse', name: i18next.t('settings-js_buttons_name_30'), value: config.helpLogChannelNameUse === 1 ? '✅' : '❌' },
        { key: 'manRoleName', name: i18next.t('settings-js_buttons_name_31'), value: String(config.manRoleName) },
        { key: 'girlRoleName', name: i18next.t('settings-js_buttons_name_32'), value: String(config.girlRoleName) },
        { key: 'newMemberRoleName', name: i18next.t('settings-js_buttons_name_33'), value: String(config.newMemberRoleName) },
        { key: 'banRoleName', name: i18next.t('settings-js_buttons_name_34'), value: String(config.banRoleName) },
        { key: 'applicationsLogChannelName', name: i18next.t('settings-js_buttons_name_35'), value: String(config.applicationsLogChannelName) },
        { key: 'applicationsLogChannelNameUse', name: i18next.t('settings-js_buttons_name_36'), value: config.applicationsLogChannelNameUse === 1 ? '✅' : '❌' },
        { key: 'randomRoomName', name: i18next.t('settings-js_buttons_name_37'), value: String(config.randomRoomName) },
        { key: 'loversRoleName', name: i18next.t('settings-js_buttons_name_38'), value: String(config.loversRoleName) },
        { key: 'supportRoleName', name: i18next.t('settings-js_buttons_name_39'), value: String(config.supportRoleName) },
        { key: 'podkastRoleName', name: i18next.t('settings-js_buttons_name_40'), value: String(config.podkastRoleName) },
        { key: 'moderatorRoleName', name: i18next.t('settings-js_buttons_name_41'), value: String(config.moderatorRoleName) },
        { key: 'eventRoleName', name: i18next.t('settings-js_buttons_name_42'), value: String(config.eventRoleName) },
        { key: 'controlRoleName', name: i18next.t('settings-js_buttons_name_43'), value: String(config.controlRoleName) },
        { key: 'creativeRoleName', name: i18next.t('settings-js_buttons_name_44'), value: String(config.creativeRoleName) },
        { key: 'weddingsLogChannelName', name: i18next.t('settings-js_buttons_name_45'), value: String(config.weddingsLogChannelName) },
        { key: 'weddingsLogChannelNameUse', name: i18next.t('settings-js_buttons_name_46'), value: config.weddingsLogChannelNameUse === 1 ? '✅' : '❌' },

    ];


    const currentPageSettings = settings.slice(start, end);
    currentPageSettings.forEach(setting => {
        settingsEmbed.addFields({ name: setting.name, value: setting.value });
    });
    const buttons = currentPageSettings.map(setting => createButton(setting.key, setting.name));
    const navigationButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('previousPage')
                .setLabel('⬅️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 1),
            new ButtonBuilder()
                .setCustomId('nextPage')
                .setLabel('➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(end >= settings.length)
        );
    await interaction.editReply({ embeds: [settingsEmbed], components: [new ActionRowBuilder().addComponents(buttons), navigationButtons] });
}
// Функция для создания кнопки в меню настроек
function createButton(customId, label) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary);
}
// Функция для запроса нового значения настройки у пользователя
async function promptUserForSettingValue(interaction, settingKey) {
    const filter = response => response.author.id === interaction.user.id;

    // Отправляем новое сообщение для запроса значения
    await interaction.followUp({ content: i18next.t(`settings-js_enter_new_value`, { settingKey }), ephemeral: true });

    try {
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
        const response = collected.first();
        const newValue = response.content;

        // Проверка существования сообщения перед удалением
        if (response && response.deletable) {
            await response.delete();
        }
        return newValue;
    } catch (err) {
        console.error('Ошибка при получении нового значения настройки:', err);
        await interaction.followUp({ content: i18next.t('settings-js_times_is_up'), ephemeral: true });
        return null;
    }
}
async function createRoles(interaction, roleNames) {
    const messages = [];

    // Функция для генерации случайного цвета в шестнадцатеричном формате
    function getRandomColor() {
        const randomColor = Math.floor(Math.random() * 16777215).toString(16);
        return `#${randomColor.padStart(6, '0')}`; // Добавляет нули в начале, если необходимо
    }

    for (const roleName of roleNames) {
        let role = interaction.guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
            try {
                const color = getRandomColor(); // Генерируем случайный цвет
                role = await interaction.guild.roles.create({
                    name: roleName,
                    color: color,
                    permissions: []
                });
            } catch (error) {
                console.error(i18next.t('events-js_mutedRole_error'), { roleName });
                messages.push(i18next.t('events-js_mutedRole_error'), { roleName });
            }
        } else {
            messages.push(i18next.t('events-js_mutedRole_exists'), { roleName });
        }
    }

    return messages.join('\n');
}
// Отдельная функция для обработки выбора из выпадающего меню help
async function handleSelectInteraction(helpChannel, selectInteraction, questionUser, questionContent) {
    try {
        // Проверяем, было ли взаимодействие уже обработано
        if (selectInteraction.replied || selectInteraction.deferred) return;

        await selectInteraction.deferUpdate(); // Подтверждаем взаимодействие

        const selectedValue = selectInteraction.values[0];
        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`responseSelect_${selectInteraction.message.id}`)
                .setDisabled(true) // Делаем меню недоступным
                .setPlaceholder('Вы уже выбрали ответ')
                .addOptions([
                    { label: 'Да', value: 'response_yes' },
                    { label: 'Нет', value: 'response_no' },
                    { label: 'Другой ответ', value: 'custom_response' },
                ])
        );

        await selectInteraction.message.edit({ components: [selectRow] });

        if (selectedValue === 'custom_response') {
            const responsePrompt = 'Пожалуйста, введите свой ответ в чате.';
            await selectInteraction.followUp({ content: responsePrompt, ephemeral: true });

            const filter = msg => msg.author.id === questionUser.id && !msg.author.bot;
            const collector = selectInteraction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

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
                    setTimeout(async () => {
                        try {
                            await questionUser.send({ content: `Напоминаю вам о вашем вопросе: "${questionContent}"` });
                        } catch (error) {
                            console.error(`Не удалось отправить напоминание пользователю ${questionUser.tag}: ${error.message}`);
                        }
                    }, 3600000); // 1 час

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
        } else {
            const response = `Вы выбрали: ${selectedValue === 'response_yes' ? 'Да' : 'Нет'}`;
            const responseEmbed = new EmbedBuilder()
                .setColor(0x0000FF)
                .setTitle(`Ответ от ${selectInteraction.user.tag}`)
                .setDescription(response)
                .addFields({ name: 'Ваш вопрос:', value: questionContent })
                .setTimestamp();

            await helpChannel.messages.delete(selectInteraction.message.id).catch(console.error);
            await questionUser.send({ embeds: [responseEmbed] });
            await selectInteraction.followUp({ content: `Вам был отправлен ответ от <@${selectInteraction.user.id}>.`, ephemeral: true });

            // Устанавливаем напоминание
            setTimeout(async () => {
                try {
                    await questionUser.send({ content: `Напоминаю вам о вашем вопросе: "${questionContent}"` });
                } catch (error) {
                    console.error(`Не удалось отправить напоминание пользователю ${questionUser.tag}: ${error.message}`);
                }
            }, 3600000); // 1 час

            await selectInteraction.message.delete();
        }
    } catch (error) {
        console.error(`Ошибка при обработке взаимодействия: ${error.message}`);
    }
}
// Экспортируем функции для использования в других файлах
module.exports = {
    validateUserId,
    formatDuration,
    sendPart,
    sendLongMessage,
    getPlural,
    sendPartAndDelete,
    convertToTimestamp,
    convertToMilliseconds,
    ensureDirectoryExistence,
    createMainLogChannel,
    createLogChannel,
    getOrCreateLogChannel,
    createMutedRole,
    deleteMessages,
    notifyUserAndLogMute,
    notifyUserAndLogWarn,
    validateSettingValue,
    handleButtonInteraction,
    displaySettings,
    createButton,
    promptUserForSettingValue,
    createRoles,
    getOrCreateVoiceChannel,
    handleSelectInteraction
};