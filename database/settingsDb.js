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
        automod,NotAutomodChannels, automodBlacklist, automodBadLinks, uniteautomodblacklists, uniteAutomodBadLinks,helpLogChannelName,
        helpLogChannelNameUse,manRoleName,girlRoleName,newMemberRoleName,banRoleName,supportRoleName,podkastRoleName,moderatorRoleName,
        eventRoleName,controlRoleName,creativeRoleName,applicationsLogChannelName,applicationsLogChannelNameUse,randomRoomName,loversRoleName, 
        weddingsLogChannelName, weddingsLogChannelNameUse)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)`,
      [
        guildId, muteLogChannelName, muteLogChannelNameUse, mutedRoleName, muteDuration, muteNotice, warningLogChannelName, warningLogChannelNameUse, warningDuration,
        maxWarnings, warningsNotice, banLogChannelName, banLogChannelNameUse, deletingMessagesFromBannedUsers, kickLogChannelName, kickLogChannelNameUse,
        reportLogChannelName, reportLogChannelNameUse, clearLogChannelName, clearLogChannelNameUse, clearNotice, logChannelName, language, automod, NotAutomodChannels, automodBlacklist,
        automodBadLinks, uniteautomodblacklists, uniteAutomodBadLinks, helpLogChannelName, helpLogChannelNameUse, manRoleName, girlRoleName, newMemberRoleName, banRoleName,
        supportRoleName, podkastRoleName, moderatorRoleName, eventRoleName, controlRoleName, creativeRoleName, applicationsLogChannelName, applicationsLogChannelNameUse,
        randomRoomName,loversRoleName, weddingsLogChannelName, weddingsLogChannelNameUse
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

// Функция для получения настроек сервера из базы данных
async function getServerSettings(guildId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM server_settings WHERE guildId = ?`, [guildId], (err, row) => {
      if (err) {
        console.error(`Ошибка при получении настроек сервера: ${err.message}`);
        reject(err);
      } else {
        resolve(row || {});
      }
    });
  });
}

// Функция для инициализации настроек сервера по умолчанию
async function initializeDefaultServerSettings(guildId) {
  try {
    const settings = await getServerSettings(guildId);
    if (!settings.logChannelName) {
      const defaultSettings = {
        guildId: guildId,
        muteLogChannelName: process.env.MUTE_LOGCHANNELNAME || 'mute_HellinModerator_log',
        muteLogChannelNameUse: process.env.MUTE_LOGCHANNELNAME_USE === '0' ? false : true,
        mutedRoleName: process.env.MUTEDROLENAME || 'Muted',
        muteDuration: process.env.MUTE_DURATION || '5m',
        muteNotice: process.env.MUTE_NOTICE === '1',
        warningLogChannelName: process.env.WARNING_LOGCHANNELNAME || 'warn_HellinModerator_log',
        warningLogChannelNameUse: process.env.WARNING_LOGCHANNELNAME_USE === '0' ? false : true,
        warningDuration: process.env.WARNING_DURATION || '30m',
        maxWarnings: parseInt(process.env.MAX_WARNINGS, 10) || 3,
        warningsNotice: process.env.WARNINGS_NOTICE === '1',
        banLogChannelName: process.env.BAN_LOGCHANNELNAME || 'ban_HellinModerator_log',
        banLogChannelNameUse: process.env.BAN_LOGCHANNELNAME_USE === '0' ? false : true,
        deletingMessagesFromBannedUsers: process.env.DELETING_MESSAGES_FROM_BANNED_USERS === '1',
        kickLogChannelName: process.env.KICK_LOGCHANNELNAME || 'kick_HellinModerator_log',
        kickLogChannelNameUse: process.env.KICK_LOGCHANNELNAME_USE === '0' ? false : true,
        reportLogChannelName: process.env.REPORT_LOGCHANNELNAME || 'report_HellinModerator_log',
        reportLogChannelNameUse: process.env.REPORT_LOGCHANNELNAME_USE === '0' ? false : true,
        clearLogChannelName: process.env.CLEAR_LOGCHANNELNAME || 'clear_HellinModerator_log',
        clearLogChannelNameUse: process.env.CLEAR_LOGCHANNELNAME_USE === '0' ? false : true,
        clearNotice: process.env.CLEAR_NOTICE === '0' ? false : true,
        logChannelName: process.env.LOGCHANNELNAME || 'HellinModerator_logs',
        language: process.env.LANGUAGE || 'eng',
        automod: process.env.AUTOMOD === '0' ? false : true,
        NotAutomodChannels: process.env.NOTAUTOMODCHANNELS || 'HellinModerator_logs, clear_HellinModerator_log',
        automodBlacklist: process.env.AUTOMODBLACKLIST || 'fuck',
        automodBadLinks: process.env.AUTOMODBADLINKS || 'azino777cashcazino-slots.ru',
        uniteautomodblacklists: process.env.UNITE_AUTOMODBLACKLISTS || '0' ? false : true,
        uniteAutomodBadLinks: process.env.UNITE_AUTOMODBADLINKS || '0' ? false : true,
        helpLogChannelName: process.env.HELP_LOGCHANNELNAME || 'help_HellinModerator_log',
        helpLogChannelNameUse: process.env.HELP_LOGCHANNELNAME_USE || '0' ? false : true,
        manRoleName: process.env.MANROLENAME || '♂',
        girlRoleName: process.env.GIRLROLENAME || '♀',
        newMemberRoleName: process.env.NEWMEMBERROLENAME || 'Новичок',
        banRoleName: process.env.BANROLENAME || 'Ban',
        applicationsLogChannelName: process.env.APPLICATIONS_LOGCHANNELNAME || 'applications_HellinModerator_log',
        applicationsLogChannelNameUse: process.env.APPLICATIONS_LOGCHANNELNAME_USE === '0' ? false : true,
        randomRoomName: process.env.RANDOM_ROOM_NAME || '🎮Рандомная комната',
        loversRoleName: process.env.LOVERSROLENAME || '💞',
        supportRoleName: process.env.SUPPORTROLENAME || 'Саппорт', 
        podkastRoleName: process.env.PODKASTROLENAME || 'Ведущий', 
        moderatorRoleName: process.env.MODERATORROLENAME || 'Модератор', 
        eventRoleName: process.env.EVENTROLENAME || 'Ивентер', 
        controlRoleName: process.env.CONTROLROLENAME || 'Контрол', 
        creativeRoleName: process.env.CREATIVEROLENAME || 'Креатив', 
        weddingsLogChannelName: process.env.RANDOM_ROOM_NAME || '🖤свадьба',
        weddingsLogChannelNameUse: process.env.APPLICATIONS_LOGCHANNELNAME_USE === '0' ? false : true
       
      };

      await saveServerSettings(guildId, defaultSettings);
      console.log(`Настройки по умолчанию инициализированы для сервера: ${guildId}`);
    }
  } catch (err) {
    console.error(`Ошибка при инициализации настроек сервера: ${err.message}`);
    throw err;
  }
}

// Экспортируем функции для использования в других модулях
module.exports = {
  saveServerSettings,
  initializeDefaultServerSettings,
  getServerSettings
};