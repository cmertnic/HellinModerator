// Загружаем переменные окружения
require('dotenv').config();
// Импортируем необходимые модули
const path = require('path');
const { PermissionsBitField } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const { getServerSettings } = require('../database/settingsDb');
const { i18next } = require('../i18n');
const { createLogChannel } = require('../events');

// Проверяем, определена ли переменная окружения для пути к базе данных предупреждений
if (!process.env.SQLITE_WARNINGS_DB_PATH) {
    console.error('Переменная окружения SQLITE_WARNINGS_DB_PATH не определена.');
    process.exit(1);
}

// Получаем полный путь к файлу базы данных предупреждений
const warningsDbPath = path.resolve(process.env.SQLITE_WARNINGS_DB_PATH);

// Инициализация базы данных предупреждений
const warningsDb = new sqlite3.Database(warningsDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных предупреждений:', err.message);
    } else {
        console.log('Подключено к базе данных предупреждений.');
    }
});

// Создание таблицы предупреждений, если она ещё не существует
warningsDb.run(`CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT NOT NULL,
    userId TEXT NOT NULL,
    duration INTEGER NOT NULL,
    reason TEXT
);`, (err) => {
    if (err) {
        console.error(`Ошибка при создании таблицы предупреждений: ${err.message}`);
    }
});

// Асинхронная функция для получения предупреждений пользователя
async function getUserWarnings(userId) {
    return new Promise((resolve, reject) => {
        warningsDb.all(`SELECT * FROM warnings WHERE userId = ?`, [userId], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Функция для сохранения предупреждения в базу данных
async function saveWarningToDatabase(interaction, userIdToWarn, durationMs, reason) {
    if (!interaction || !interaction.guild || !interaction.guild.id) {
        throw new Error('Не предоставлен объект interaction с необходимыми свойствами');
    }
    
    const serverSettings = await getServerSettings(interaction.guild.id);
    const warningDuration = serverSettings.warningDuration || 3600000;

    reason = reason || i18next.t('defaultReason');
    durationMs = (isNaN(durationMs) || durationMs <= 0) ? warningDuration : durationMs;

    const duration = Date.now() + durationMs;

    return new Promise((resolve, reject) => {
        warningsDb.run(`INSERT INTO warnings (guildId, userId, duration, reason) VALUES (?, ?, ?, ?)`, 
        [interaction.guild.id, userIdToWarn, duration, reason], function (err) {
            if (err) {
                console.error(`Ошибка при вставке в базу данных: ${err}`);
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
}

// Асинхронная функция для получения истекших предупреждений
async function getExpiredWarnings(robot, guildId) {
    const currentTime = Date.now();

    const guild = await robot.guilds.fetch(guildId).catch(console.error);
    if (!guild) {
        console.error(`Ошибка: Сервер с ID ${guildId} не найден.`);
        return [];
    }

    return new Promise((resolve, reject) => {
        warningsDb.all(`SELECT * FROM warnings WHERE duration <= ? AND guildId = ?`, [currentTime, guildId], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

// Асинхронная функция для получения всех активных предупреждений
async function getAllActiveWarnings(guildId) {
    const currentTime = Date.now();

    return new Promise((resolve, reject) => {
        warningsDb.all(`SELECT * FROM warnings WHERE duration > ? AND guildId = ?`, [currentTime, guildId], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Функция для удаления предупреждения из базы данных
async function removeWarningFromDatabase(robot, guildId, userId) {
    return new Promise((resolve, reject) => {
        const query = `DELETE FROM warnings WHERE id = (
            SELECT id FROM warnings
            WHERE userId =? AND guildId =?
            ORDER BY duration DESC
            LIMIT 1
        )`;
        warningsDb.run(query, [userId, guildId], async function (err) {
            if (err) {
                console.error(`Ошибка при удалении предупреждения: ${err.message}`);
                reject(err);
            } else {
                const result = await new Promise((resolve, reject) => {
                    warningsDb.get(`SELECT COUNT(*) AS count FROM warnings WHERE userId =? AND guildId =?`, [userId, guildId], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.count);
                        }
                    });
                });
                resolve(result);

                // Оповещение об успешном удалении предупреждения
                if (robot) {
                    const guild = robot.guilds.cache.get(guildId);
                    try {
                        const member = await guild.members.fetch(userId);
                        if (member && member.permissions.has(PermissionsBitField.Flags.SendMessages)) {
                            const message = i18next.t('warningsDb-js_removeMuteFromDatabase_member_send');
                            await member.send(message).catch(console.error);
                        }
                    } catch (error) {
                        console.error('Ошибка: Не удалось получить участника:', error);
                    }
                }
            }
        });
    });
}

// Функция для удаления данных о пользователе из базы данных
async function removeUserWarningsFromDatabase(guildId, userId) {
    return new Promise((resolve, reject) => {
        const query = 'DELETE FROM warnings WHERE userId = ? AND guildId = ?';
        warningsDb.run(query, [userId, guildId], function (err) {
            if (err) {
                console.error(`Ошибка при удалении данных о пользователе ${userId} из базы данных: ${err.message}`);
                reject(err);
            } else {
                console.log(`Данные о пользователе ${userId} успешно удалены из базы данных.`);
                resolve();
            }
        });
    });
}

// Асинхронная функция для получения количества предупреждений пользователя
async function getWarningsCount(userIdToWarn) {
    userIdToWarn = String(userIdToWarn);

    return new Promise((resolve, reject) => {
        warningsDb.get(`SELECT COUNT(*) AS count FROM warnings WHERE userId = ?`, [userIdToWarn], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row.count);
            }
        });
    });
}

// Функция для удаления истекших предупреждений
async function removeExpiredWarnings(robot, guildId) {
    const guild = robot.guilds.cache.get(guildId);
    const serverSettings = await getServerSettings(guildId);
    const logChannelName = serverSettings.logChannelName;
    const warningLogChannelName = serverSettings.warningLogChannelName;
    const warningLogChannelNameUse = serverSettings.warningLogChannelNameUse;

    const botMember = await guild.members.fetch(robot.user.id);
    let logChannel = warningLogChannelNameUse 
        ? guild.channels.cache.find(ch => ch.name === warningLogChannelName)
        : guild.channels.cache.find(ch => ch.name === logChannelName);

    if (!logChannel) {
        try {
            const channelNameToCreate = warningLogChannelNameUse ? warningLogChannelName : logChannelName;
            const higherRoles = guild.roles.cache.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);
            const logChannelCreationResult = await createLogChannel(robot, guild, channelNameToCreate, botMember, higherRoles, serverSettings);

            if (logChannelCreationResult.startsWith('Ошибка')) {
                console.error(`Ошибка при создании канала: ${logChannelCreationResult}`);
            }

            logChannel = guild.channels.cache.find(ch => ch.name === channelNameToCreate);
        } catch (error) {
            console.error('Ошибка при создании канала:', error);
        }
    }

    const expiredWarnings = await getExpiredWarnings(robot, guildId);
    if (!expiredWarnings || expiredWarnings.length === 0) {
        return;
    }

    for (const warning of expiredWarnings) {
        try {
            let member;
            try {
                member = await guild.members.fetch(warning.userId);
            } catch (error) {
                console.error(`- Ошибка: Пользователь с ID ${warning.userId} не найден на сервере.`);
                await removeUserWarningsFromDatabase(guildId, warning.userId);
                continue;
            }

            const warningsCount = await getWarningsCount(warning.userId);
            if (warningsCount === 0) {
                console.error(`- Ошибка: Предупреждение для пользователя с ID ${warning.userId} не найдено.`);
                continue;
            }

            await removeWarningFromDatabase(robot, guildId, warning.userId);
            await logChannel.send(i18next.t('warningsDb-js_removeExpiredWarnings_log', { userId: warning.userId })).catch(console.error);
        } catch (error) {
            console.error(`- Ошибка при удалении предупреждения для пользователя с ID: ${warning.userId}: ${error}`);
        }
    }
}

// Экспорт функций для работы с предупреждениями
module.exports = {
    getUserWarnings,
    saveWarningToDatabase,
    getExpiredWarnings,
    removeWarningFromDatabase,
    removeExpiredWarnings,
    getWarningsCount,
    getAllActiveWarnings
};
