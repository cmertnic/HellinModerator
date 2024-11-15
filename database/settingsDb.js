// Подключаем модуль dotenv для загрузки переменных окружения из файла .env
const dotenv = require('dotenv');
dotenv.config();

// Подключаем модуль path для работы с путями файлов
const path = require('path');

// Подключаем модуль sqlite3 для работы с базой данных SQLite
const sqlite3 = require('sqlite3').verbose();

// Проверяем, что переменная окружения SQLITE_SETTINGS_DB_PATH определена
if (!process.env.SQLITE_SETTINGS_DB_PATH) {
  console.error('Переменная окружения SQLITE_SETTINGS_DB_PATH не определена.');
  process.exit(1);
}

// Получаем путь к базе данных из переменной окружения SQLITE_SETTINGS_DB_PATH
const dbPath = path.resolve(process.env.SQLITE_SETTINGS_DB_PATH);

// Создаем новое подключение к базе данных с флагами OPEN_READWRITE и OPEN_CREATE
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(`Ошибка при подключении к базе данных: ${err.message}`);
    process.exit(1);
  }
  console.log('Подключено к базе данных настроек');
});

// Создаем таблицу server_settings, если она еще не создана
db.run(`CREATE TABLE IF NOT EXISTS server_settings (
    guildId TEXT PRIMARY KEY,
    muteLogChannelName TEXT,
    muteLogChannelNameUse BOOLEAN,
    mutedRoleName TEXT,
    muteDuration INTEGER,
    muteNotice BOOLEAN,
    warningLogChannelName TEXT,
    warningLogChannelNameUse BOOLEAN,
    warningDuration INTEGER,
    maxWarnings INTEGER,
    warningsNotice BOOLEAN,
    banLogChannelName TEXT,
    banLogChannelNameUse BOOLEAN,
    deletingMessagesFromBannedUsers BOOLEAN,
    kickLogChannelName TEXT,
    kickLogChannelNameUse BOOLEAN,
    reportLogChannelName TEXT,
    reportLogChannelNameUse BOOLEAN,
    clearLogChannelName TEXT,
    clearLogChannelNameUse BOOLEAN,
    clearNotice BOOLEAN,
    logChannelName TEXT,
    language TEXT,
    automod BOOLEAN,
    NotAutomodChannels TEXT,
    automodBlacklist TEXT,
    automodBadLinks TEXT,
    uniteautomodblacklists BOOLEAN,
    uniteAutomodBadLinks BOOLEAN,
    helpLogChannelName TEXT,
    helpLogChannelNameUse BOOLEAN,
    manRoleName TEXT,
    girlRoleName TEXT,
    newMemberRoleName TEXT,
    banRoleName TEXT,
    supportRoleName TEXT,
    podkastRoleName TEXT,
    moderatorRoleName TEXT,
    eventRoleName TEXT,
    controlRoleName TEXT,
    creativeRoleName TEXT,
    applicationsLogChannelName TEXT,
    applicationsLogChannelNameUse BOOLEAN,
    randomRoomName TEXT,  
    loversRoleName TEXT,  
    weddingsLogChannelName TEXT,  
    weddingsLogChannelNameUse BOOLEAN  
);`, (err) => {
  if (err) {
    console.error(`Ошибка при создании таблицы server_settings: ${err.message}`);
    process.exit(1);
  }
});

// Функция для удаления устаревших записей из таблицы server_settings
async function removeStaleSettings(guildIds) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM server_settings WHERE guildId NOT IN (' + guildIds.map(() => '?').join(',') + ')', guildIds, function(err) {
      if (err) {
        console.error('Ошибка при удалении устаревших настроек:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Функция для сохранения настроек сервера в базе данных
function saveServerSettings(guildId, settings) {
  return new Promise((resolve, reject) => {
    const {
      guildId, muteLogChannelName, muteLogChannelNameUse, mutedRoleName, muteDuration, muteNotice, warningLogChannelName, warningLogChannelNameUse, warningDuration,
      maxWarnings, warningsNotice, banLogChannelName, banLogChannelNameUse, deletingMessagesFromBannedUsers, kickLogChannelName, kickLogChannelNameUse,
      reportLogChannelName, reportLogChannelNameUse, clearLogChannelName, clearLogChannelNameUse, clearNotice, logChannelName, language, automod, NotAutomodChannels, automodBlacklist,
      automodBadLinks, uniteautomodblacklists, uniteAutomodBadLinks, helpLogChannelName, helpLogChannelNameUse, manRoleName, girlRoleName, newMemberRoleName, banRoleName,
      supportRoleName, podkastRoleName, moderatorRoleName, eventRoleName, controlRoleName, creativeRoleName, applicationsLogChannelName, applicationsLogChannelNameUse,
      randomRoomName, loversRoleName, weddingsLogChannelName, weddingsLogChannelNameUse
    } = settings;

    db.run(`REPLACE INTO server_settings
        (guildId, muteLogChannelName, muteLogChannelNameUse, mutedRoleName, muteDuration, muteNotice, warningLogChannelName, warningLogChannelNameUse, warningDuration,
        maxWarnings, warningsNotice, banLogChannelName, banLogChannelNameUse, deletingMessagesFromBannedUsers, kickLogChannelName, kickLogChannelNameUse,
        reportLogChannelName, reportLogChannelNameUse, clearLogChannelName, clearLogChannelNameUse, clearNotice, logChannelName, language,
        automod, NotAutomodChannels, automodBlacklist, automodBadLinks, uniteautomodblacklists, uniteAutomodBadLinks, helpLogChannelName,
        helpLogChannelNameUse, manRoleName, girlRoleName, newMemberRoleName, banRoleName, supportRoleName, podkastRoleName, moderatorRoleName,
        eventRoleName, controlRoleName, creativeRoleName, applicationsLogChannelName, applicationsLogChannelNameUse, randomRoomName, loversRoleName, 
        weddingsLogChannelName, weddingsLogChannelNameUse)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        guildId, muteLogChannelName, muteLogChannelNameUse, mutedRoleName, muteDuration, muteNotice, warningLogChannelName, warningLogChannelNameUse, warningDuration,
        maxWarnings, warningsNotice, banLogChannelName, banLogChannelNameUse, deletingMessagesFromBannedUsers, kickLogChannelName, kickLogChannelNameUse,
        reportLogChannelName, reportLogChannelNameUse, clearLogChannelName, clearLogChannelNameUse, clearNotice, logChannelName, language, automod, NotAutomodChannels, automodBlacklist,
        automodBadLinks, uniteautomodblacklists, uniteAutomodBadLinks, helpLogChannelName, helpLogChannelNameUse, manRoleName, girlRoleName, newMemberRoleName, banRoleName,
        supportRoleName, podkastRoleName, moderatorRoleName, eventRoleName, controlRoleName, creativeRoleName, applicationsLogChannelName, applicationsLogChannelNameUse,
        randomRoomName, loversRoleName, weddingsLogChannelName, weddingsLogChannelNameUse
      ], (err) => {
        if (err) {
          console.error(`Ошибка при сохранении настроек сервера: ${err.message}`);
          reject(err);
        } else {
          resolve();
        }
      });
  });
}

// Функция для инициализации настроек сервера по умолчанию
async function initializeDefaultServerSettings(guildId, allGuildIds) {
  try {
      const settings = await getServerSettings(guildId);
      if (!settings.logChannelName) {
          const defaultSettings = {
              guildId: guildId,
              // Другие настройки
          };

          await saveServerSettings(guildId, defaultSettings);
          console.log(`Настройки по умолчанию инициализированы для сервера: ${guildId}`);
      }

      // Удаляем устаревшие записи
      await removeStaleSettings(allGuildIds);
  } catch (err) {
      console.error(`Ошибка при инициализации настроек сервера: ${err.message}`);
      throw err;
  }
}

async function getServerSettings(guildId) {
  return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM server_settings WHERE guildId = ?`, [guildId], (err, row) => {
          if (err) {
              console.error(`Ошибка при получении настроек сервера: ${err.message}`);
              reject(err);
          } else {
              resolve(row ? [row] : []); // Возвращаем массив
          }
      });
  });
}

// Экспортируем функции для использования в других модулях
module.exports = {
  saveServerSettings,
  initializeDefaultServerSettings,
  getServerSettings,
  removeStaleSettings // Экспортируем новую функцию, если нужно использовать ее в других модулях
};
