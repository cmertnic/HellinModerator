// Загружаем переменные окружения
require('dotenv').config();
// Импортируем необходимые модули
const path = require('path');
const { PermissionsBitField,EmbedBuilder } = require('discord.js');
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
                    let member;
                    try {
                        member = await guild.members.fetch(userId);
                    } catch (error) {
                        if (error.code === 10007) {
                            await removeUserWarningsFromDatabase(guildId, userId); // Удаляем информацию о пользователе
                            return; // Выход из функции, если участник не найден
                        } 
                    }

                    if (member && member.permissions.has(PermissionsBitField.Flags.SendMessages)) {
                        const messageEmbed = new EmbedBuilder()
                            .setColor(0x00FF00) 
                            .setTitle(i18next.t('Ваше предупреждение было снято'))
                            .setImage('https://media.discordapp.net/attachments/1304707253735002153/1307720199717257216/4.gif?ex=673b54d7&is=673a0357&hm=16bb22346d236d4a8eac88372baa2c4e07c1486758410fed9be8a14904698892&=')
                            .setTimestamp();
                    
                        await member.send({ embeds: [messageEmbed] }).catch(console.error);
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

            if (!logChannelCreationResult || !logChannelCreationResult.channel) {
                console.error(`Ошибка при создании канала: ${logChannelCreationResult}`);
                return; // Прерываем выполнение, если канал не был создан
            }

            logChannel = logChannelCreationResult.channel; // Используем созданный канал
        } catch (error) {
            console.error('Ошибка при создании канала:', error);
            return; // Прерываем выполнение в случае ошибки
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
                if (error.code === 10007) {
                    await removeUserWarningsFromDatabase(guildId, warning.userId);
                    continue; // Пропускаем это предупреждение
                }
                console.error(`Ошибка при получении участника: ${error}`);
                continue; // Пропускаем это предупреждение
            }

            await removeWarningFromDatabase(robot, guildId, warning.userId);
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
