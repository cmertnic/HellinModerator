// Подключаем необходимые модули
const dotenv = require('dotenv');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Загружаем переменные окружения из файла .env
dotenv.config();

// Проверяем наличие переменной окружения SQLITE_SETTINGS_DB_PATH
if (!process.env.SQLITE_SETTINGS_DB_PATH) {
  console.error('Переменная окружения SQLITE_SETTINGS_DB_PATH не определена.');
  process.exit(1);
}

// Получаем путь к базе данных из переменной окружения
const dbPath = path.resolve(process.env.SQLITE_SETTINGS_DB_PATH);

// Создаем новое подключение к базе данных
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
    creativeRoleName TEXT,
    applicationsLogChannelName TEXT,
    applicationsLogChannelNameUse BOOLEAN,
    randomRoomName TEXT, 
    randomRoomNameUse BOOLEAN,
    loversRoleName TEXT,  
    weddingsLogChannelName TEXT,  
    weddingsLogChannelNameUse BOOLEAN,  
    requisitionLogChannelName TEXT,  
    requisitionLogChannelNameUse TEXT,
    allowedRoles TEXT
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
      muteLogChannelName, muteLogChannelNameUse, mutedRoleName, muteDuration, muteNotice,
      warningLogChannelName, warningLogChannelNameUse, warningDuration, maxWarnings, warningsNotice,
      banLogChannelName, banLogChannelNameUse, deletingMessagesFromBannedUsers, kickLogChannelName,
      kickLogChannelNameUse, reportLogChannelName, reportLogChannelNameUse, clearLogChannelName,
      clearLogChannelNameUse, clearNotice, logChannelName, language, automod, NotAutomodChannels,
      automodBlacklist, automodBadLinks, uniteautomodblacklists, uniteAutomodBadLinks, helpLogChannelName,
      helpLogChannelNameUse, manRoleName, girlRoleName, newMemberRoleName, banRoleName, supportRoleName,
      podkastRoleName, moderatorRoleName, creativeRoleName,
      applicationsLogChannelName, applicationsLogChannelNameUse, randomRoomName, randomRoomNameUse,
      loversRoleName, weddingsLogChannelName, weddingsLogChannelNameUse, requisitionLogChannelName,
      requisitionLogChannelNameUse,allowedRoles
    } = settings;

    db.run(`REPLACE INTO server_settings
        (guildId, muteLogChannelName, muteLogChannelNameUse, mutedRoleName, muteDuration, muteNotice, warningLogChannelName, warningLogChannelNameUse, warningDuration,
        maxWarnings, warningsNotice, banLogChannelName, banLogChannelNameUse, deletingMessagesFromBannedUsers, kickLogChannelName, kickLogChannelNameUse,
        reportLogChannelName, reportLogChannelNameUse, clearLogChannelName, clearLogChannelNameUse, clearNotice, logChannelName, language,
        automod, NotAutomodChannels, automodBlacklist, automodBadLinks, uniteautomodblacklists, uniteAutomodBadLinks, helpLogChannelName,
        helpLogChannelNameUse, manRoleName, girlRoleName, newMemberRoleName, banRoleName, supportRoleName,
        podkastRoleName, moderatorRoleName, creativeRoleName,applicationsLogChannelName, applicationsLogChannelNameUse, randomRoomName, randomRoomNameUse,
        loversRoleName, weddingsLogChannelName, weddingsLogChannelNameUse,requisitionLogChannelName,
        requisitionLogChannelNameUse,allowedRoles)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
      [
        guildId, muteLogChannelName, muteLogChannelNameUse, mutedRoleName, muteDuration, muteNotice,
        warningLogChannelName, warningLogChannelNameUse, warningDuration, maxWarnings, warningsNotice,
        banLogChannelName, banLogChannelNameUse, deletingMessagesFromBannedUsers, kickLogChannelName,
        kickLogChannelNameUse, reportLogChannelName, reportLogChannelNameUse, clearLogChannelName,
        clearLogChannelNameUse, clearNotice, logChannelName, language, automod, NotAutomodChannels,
        automodBlacklist, automodBadLinks, uniteautomodblacklists, uniteAutomodBadLinks, helpLogChannelName,
        helpLogChannelNameUse, manRoleName, girlRoleName, newMemberRoleName, banRoleName, supportRoleName,
        podkastRoleName, moderatorRoleName, creativeRoleName,
        applicationsLogChannelName, applicationsLogChannelNameUse, randomRoomName, randomRoomNameUse,
        loversRoleName, weddingsLogChannelName, weddingsLogChannelNameUse, requisitionLogChannelName,
        requisitionLogChannelNameUse,allowedRoles
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
        uniteautomodblacklists: process.env.UNITE_AUTOMODBLACKLISTS === '0' ? false : true,
        uniteAutomodBadLinks: process.env.UNITE_AUTOMODBADLINKS === '0' ? false : true,
        helpLogChannelName: process.env.HELP_LOGCHANNELNAME || 'help_HellinModerator_log',
        helpLogChannelNameUse: process.env.HELP_LOGCHANNELNAME_USE === '0' ? false : true,
        manRoleName: process.env.MANROLENAME || '♂',
        girlRoleName: process.env.GIRLROLENAME || '♀',
        newMemberRoleName: process.env.NEWMEMBERROLENAME || 'Новичок',
        banRoleName: process.env.BANROLENAME || 'Ban',
        applicationsLogChannelName: process.env.APPLICATIONS_LOGCHANNELNAME || 'applications_HellinModerator_log',
        applicationsLogChannelNameUse: process.env.APPLICATIONS_LOGCHANNELNAME_USE === '0' ? false : true,
        randomRoomName: process.env.RANDOM_ROOM_NAME || '🎮Рандомная комната',
        randomRoomNameUse: process.env.RANDOM_ROOM_NAME_USE === '0' ? false : true,
        loversRoleName: process.env.LOVERSROLENAME || '💞',
        supportRoleName: process.env.SUPPORTROLENAME || 'Support',
        podkastRoleName: process.env.PODKASTROLENAME || 'Tribunmode',
        moderatorRoleName: process.env.MODERATORROLENAME || 'Moderator',
        creativeRoleName: process.env.CREATIVEROLENAME || 'Creative',
        weddingsLogChannelName: process.env.WEDDINGS_LOGCHANNELNAME || '🖤свадьба',
        weddingsLogChannelNameUse: process.env.WEDDINGS_LOGCHANNELNAME_USE === '0' ? false : true,
        requisitionLogChannelName: process.env.REQUESTION_LOGCHANNELNAME || 'requisition_HellinModerator_log',
        requisitionLogChannelNameUse: process.env.REQUESTION_LOGCHANNELNAME_USE === '0' ? false : true,
        allowedRoles: process.env.ALLOWEDROLES || 'Admin | Отвечает за Staff, Admin | Отвечает за Moderator, Admin | Отвечает за Support, Admin | Отвечает за Tribunmode, Admin | Отвечает за Creative',
      };

      // Сохраняем настройки по умолчанию
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
