// Загружаем переменные окружения
require('dotenv').config();

// Импортируем необходимые модули
const { Collection, ChannelType, REST, Routes, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, Events } = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');
const { initializeDefaultServerSettings, getServerSettings } = require('./database/settingsDb');
const { getAllMemberIds, updateMembersInfo, removeStaleMembers } = require('./database/membersDb');
const { removeExpiredWarnings } = require('./database/warningsDb');
const { removeExpiredMutes } = require('./database/mutesDb');
const { initializeI18next, i18next, t } = require('./i18n');
const { createLogChannel, createRoles, ensureRolesExist, checkAntiRaidConditions, assignNewMemberRole } = require('./events');

// Инициализируем массивы для хранения черного списка и плохих ссылок
let blacklist = [];
let bad_links = [];
const recentJoins = new Map(); // Хранит время присоединения участников

// Загружаем черный список и плохие ссылки из файлов
async function loadBlacklistAndBadLinks() {
  try {
    const [blacklistData, badLinksData] = await Promise.all([
      fs.promises.readFile('blacklist.txt', 'utf8'),
      fs.promises.readFile('bad_links.txt', 'utf8'),
    ]);

    blacklist = blacklistData.trim().split('\n').map((word) => word.trim());
    bad_links = badLinksData.trim().split('\n').map((link) => link.trim());

    console.log(`Загружено ${blacklist.length} слов в черный список.`);
    console.log(`Загружено ${bad_links.length} ссылок в плохие ссылки.`);
  } catch (err) {
    console.error('Ошибка при загрузке черного списка и плохих ссылок:', err);
  }
}

// Инициализируем локализацию для сервера
async function initializeLocalizationForServer(guildId) {
  try {
    const serverSettings = await getServerSettings(guildId);
    const serverLanguage = serverSettings.language;
    await initializeI18next(serverLanguage);
  } catch (error) {
    console.error('Ошибка при инициализации локализации:', error);
  }
}

// Инициализируем переменные
const commands = [];
const guildsData = new Map();
const rest = new REST().setToken(process.env.TOKEN);

// Загружаем и регистрируем команды
(async () => {
  await initializeI18next('eng');
  try {
    // Создаем экземпляр клиента Discord
    const { Client, GatewayIntentBits, Partials } = require('discord.js');

    const robot = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildScheduledEvents
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember,
        Partials.GuildScheduledEvent
      ]
    });

    robot.commands = new Collection();
    const commandFolders = fs.readdirSync('./commands');

    for (const folder of commandFolders) {
      const commandFiles = fs.readdirSync(`./commands/${folder}`).filter((file) => file.endsWith('.js'));
      for (const file of commandFiles) {
        const command = require(`./commands/${folder}/${file}`);
        if ('data' in command && 'execute' in command) {
          robot.commands.set(command.data.name, command);
          commands.push(command.data.toJSON());
        } else {
          console.log(`Предупреждение! Команда по пути ./commands/${folder}/${file} потеряла свойство "data" или "execute".`);
        }
      }
    }

    // Регистрируем команды
    try {
      const data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );

      console.log(`Успешно зарегистрировано ${data.length} команд.`);
    } catch (error) {
      console.error('Ошибка при регистрации команд:', error);
    }

    // Обработчики событий
    robot.on('guildCreate', async (guild) => {
      console.log(`Бот добавлен на сервер: ${guild.name}`);

      // Инициализируем настройки сервера по умолчанию
      await initializeDefaultServerSettings(guild.id);

      // Устанавливаем небольшую задержку перед обновлением данных гильдии
      await new Promise((resolve) => setTimeout(resolve, 500));

      const defaultSettings = await getServerSettings(guild.id);
      // Сохраняем данные гильдии в Map
      guildsData.set(guild.id, defaultSettings);
      console.log(`Данные гильдии инициализированы для ID: ${guild.id}`);
    });
    // Обработка выбора роли
    const selectedRoles = []; // Массив для хранения выбранных ролей

    robot.on('ready', async () => {
      console.log(`${robot.user.username} готов вкалывать`);
      const guilds = robot.guilds.cache;

      for (const guild of guilds.values()) {
        const guildId = guild.id;

        try {
          let serverSettings = await getServerSettings(guildId);

          if (!serverSettings || Object.keys(serverSettings).length === 0) {
            await initializeDefaultServerSettings(guildId);
            serverSettings = await getServerSettings(guildId);
          }

          await initializeLocalizationForServer(guildId);

          guildsData.set(guildId, serverSettings);

        } catch (error) {
          console.error(`Ошибка при обработке сервера ${guildId}:`, error);
        }
      }

      try {
        await rest.put(
          Routes.applicationCommands(robot.user.id),
          { body: commands },
        );

      } catch (error) {
        console.error('Ошибка при регистрации команд:', error);
      }
    });

    robot.on('interactionCreate', async (interaction) => {
      if (!interaction.isCommand()) return;

      const command = robot.commands.get(interaction.commandName);

      if (!command) {
        await interaction.reply({ content: 'Команда не найдена!', ephemeral: true });
        return;
      }

      try {
        let serverLanguage = 'eng';

        if (interaction.guild) {
          // Получаем настройки сервера для языка
          const guildId = interaction.guild.id;
          const serverSettings = await getServerSettings(guildId);
          serverLanguage = serverSettings.language || 'rus';
        }

        // Обновляем язык для команды
        await initializeI18next(serverLanguage);

        console.log(`Выполнение команды: ${interaction.commandName}`);
        await command.execute(robot, interaction);
      } catch (error) {
        console.error('Ошибка при выполнении команды:', error);
        await interaction.reply({ content: 'Произошла ошибка при выполнении команды!', ephemeral: true });
      }
    });
    // Событие при добавлении нового участника на сервер
    robot.on('guildMemberAdd', async (member) => {
      try {
        const serverSettings = await getServerSettings(member.guild.id);
        const { banRoleName, newMemberRoleName, logChannelName, banLogChannelName, banLogChannelNameUse } = serverSettings;

        // Проверяем условия анти-рейда
        await checkAntiRaidConditions(member, banRoleName, logChannelName, banLogChannelName, banLogChannelNameUse);

        // Выдаем роль новому участнику
        await assignNewMemberRole(member, newMemberRoleName);
      } catch (error) {
        console.error(`Ошибка при обработке нового участника ${member.user.tag}: ${error.message}`);
      }
    });

    robot.on('messageCreate', async (message) => {
      if (!message.guild || message.author.bot) return;
    
      const serverSettings = await getServerSettings(message.guild.id);
      const {
        uniteAutomodBlacklists,
        uniteAutomodBadLinks,
        automod,
        automodBlacklist,
        automodBadLinks,
        logChannelName,
        NotAutomodChannels,
      } = serverSettings;
    
      if (!automod) return;
    
      const NotAutomodChannelsSet = new Set(NotAutomodChannels?.split(',') || []);
    
      if (NotAutomodChannelsSet.has(message.channel.name)) return;
    
      const botMember = await message.guild.members.fetch(robot.user.id);
      const authorMember = await message.guild.members.fetch(message.author.id);
      const mess_value = message.content.toLowerCase();
    
      if (botMember.roles.highest.position <= authorMember.roles.highest.position) return;
    
      let logChannel = message.guild.channels.cache.find((channel) => channel.name === logChannelName);
    
      if (!logChannel) {
        const channelNameToCreate = logChannelName;
        const higherRoles = [...message.guild.roles.cache.values()].filter((role) => botMember.roles.highest.position < role.position);
        const logChannelCreationResult = await createLogChannel(message, channelNameToCreate, botMember, higherRoles);
    
        if (logChannelCreationResult.startsWith('Ошибка')) {
          console.error(logChannelCreationResult);
          return;
        }
    
        logChannel = message.guild.channels.cache.find((ch) => ch.name === channelNameToCreate);
      }
    
      let blacklistToUse, bad_linksToUse;
    
      if (uniteAutomodBlacklists && automodBlacklist !== 'fuck') {
        blacklistToUse = [...new Set([...(automodBlacklist || '').split(','), ...blacklist])];
      } else {
        blacklistToUse = [...(automodBlacklist || '').split(',')];
      }
    
      if (uniteAutomodBadLinks && automodBadLinks !== 'azino777cashcazino-slots.ru') {
        bad_linksToUse = [...new Set([...(automodBadLinks || '').split(','), ...bad_links])];
      } else {
        bad_linksToUse = [...(automodBadLinks || '').split(',')];
      }
    
      // Проверяем черный список и плохие ссылки
      for (const item of [...blacklistToUse, ...bad_linksToUse]) {
        if (mess_value.includes(item)) {
          await message.delete();
    
          const embed = new EmbedBuilder()
            .setTitle('Сообщение удалено')
            .setDescription(`Сообщение пользователя <@${message.author.id}> было удалено из-за содержания запрещенного слова: ${item}`)
            .addFields(
              { name: 'Содержимое сообщения:', value: message.content, inline: false },
              { name: 'Причина:', value: `Запрещенное слово: ${item}`, inline: false }
            )
            .setTimestamp();
    
          try {
            await logChannel.send({ embeds: [embed] });
          } catch (error) {
            console.error('Ошибка при отправке сообщения в канал журнала:', error);
          }
    
          try {
            await message.author.send('Ваше сообщение было удалено из-за содержания запрещенного слова: ' + item);
          } catch (error) {
            console.error('Ошибка при отправке сообщения пользователю:', error);
          }
    
          return;
        }
      }
    
      // Проверка на наличие Discord-ссылок
      const discordLinkRegex = /(https?:\/\/)?(www\.)?(discord\.gg|discordapp\.com|discord\.com)\/[^\s]+/i;
      if (discordLinkRegex.test(mess_value)) {
        await message.delete();
    
        const embed = new EmbedBuilder()
          .setTitle('Сообщение удалено')
          .setDescription(`Сообщение пользователя <@${message.author.id}> было удалено из-за ссылки на Discord.`)
          .addFields(
            { name: 'Содержимое сообщения:', value: message.content, inline: false },
            { name: 'Причина:', value: 'Ссылка на Discord', inline: false }
          )
          .setTimestamp();
    
        try {
          await logChannel.send({ embeds: [embed] });
        } catch (error) {
          console.error('Ошибка при отправке сообщения в канал журнала:', error);
        }
    
        try {
          await message.author.send('Ваше сообщение было удалено за содержание ссылки на Discord.');
        } catch (error) {
          console.error('Ошибка при отправке сообщения пользователю:', error);
        }
      }
    });



    const chosenRoles = []; // Массив для хранения выбранных ролей
    let selectedRole; // Переменная для хранения последней выбранной роли

    robot.on(Events.InteractionCreate, async (interaction) => {
      // Обработка выбора роли из выпадающего меню
      if (interaction.isStringSelectMenu() && interaction.customId === 'roleSelect') {
        // Проверяем наличие выбранных значений
        if (!interaction.values || interaction.values.length === 0) {
          console.error('Ошибка: interaction.values пустой или не определен.');
          await interaction.reply({ content: 'Ошибка: не удалось получить выбранную роль.', ephemeral: true });
          return;
        }

        selectedRole = interaction.values[0]; // Сохраняем выбранную роль

        // Добавляем выбранную роль в массив
        chosenRoles.push(selectedRole);

        const modal = new ModalBuilder()
          .setCustomId('staffModal')
          .setTitle('Форма заявки на роль');

        const textInput = new TextInputBuilder()
          .setCustomId('textInput')
          .setLabel('Ваше ФИО и возраст')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Зубенко Михаил Петрович, 120');

        const actionRow = new ActionRowBuilder().addComponents(textInput);
        modal.addComponents(actionRow);

        // Общие дополнительные вопросы для всех ролей
        const additionalQuestions = [
          { id: 'experience', label: 'Работали ли вы уже на серверах?', placeholder: 'Да, в Haru я там был крутым админом ....' },
          { id: 'time', label: 'Какой у вас часовой пояс?', placeholder: 'GMT +3' },
          { id: 'motivation', label: 'Почему вы хотите стать частью команды?', placeholder: 'Я крутой, могу не спать 18 часов подряд' }
        ];

        // Добавляем специфические вопросы для роли "Ведущий"
        if (selectedRole === 'role5') {
          additionalQuestions.unshift({ id: 'microphoneModel', label: 'Какую модель микрофона вы используете?', placeholder: 'Razer' });
        }

        // Добавляем дополнительные вопросы в модальное окно
        additionalQuestions.forEach(question => {
          const additionalInput = new TextInputBuilder()
            .setCustomId(question.id)
            .setLabel(question.label)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(question.placeholder);

          const additionalActionRow = new ActionRowBuilder().addComponents(additionalInput);
          modal.addComponents(additionalActionRow);
        });

        await interaction.showModal(modal);
      }

      // Обработка отправки модального окна
      if (interaction.customId === 'staffModal') {
        try {
          const userInput = interaction.fields.getTextInputValue('textInput');

          // Получаем выбранные роли
          const selectedRoleLabels = chosenRoles.map(role => {
            const option = interaction.message.components[0].components[0].options.find(opt => opt.value === role);
            return option ? option.label : null;
          }).filter(label => label !== null);

          if (selectedRoleLabels.length === 0) {
            console.error('Ошибка: выбранные роли не найдены.');
            await interaction.reply({ content: 'Ошибка: выбранные роли не найдены.', ephemeral: true });
            return;
          }

          // Получаем ответы на дополнительные вопросы
          const additionalInputs = {
            microphoneModel: selectedRole === 'role5' ? interaction.fields.getTextInputValue('microphoneModel') : 'Не указано',
            experience: interaction.fields.getTextInputValue('experience') || 'Не указано',
            motivation: interaction.fields.getTextInputValue('motivation') || 'Не указано',
            time: interaction.fields.getTextInputValue('time') || 'Не указано'
          };

          // Получаем настройки сервера
          const serverSettings = await getServerSettings(interaction.guild.id);
          const { logChannelName, requisitionLogChannelNameUse, requisitionLogChannelName } = serverSettings;

          // Ищем лог-канал по настройкам
          let logChannel;
          if (requisitionLogChannelNameUse) {
            logChannel = interaction.guild.channels.cache.find(ch => ch.name === requisitionLogChannelName && ch.type === 'GUILD_TEXT');
          } else {
            logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName && ch.type === 'GUILD_TEXT');
          }

          // Если канал не найден, создаем его
          if (!logChannel) {
            const channelNameToCreate = requisitionLogChannelName || logChannelName;
            const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
            const roles = interaction.guild.roles.cache;
            const higherRoles = roles.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);

            const logChannelCreationResult = await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles);

            if (logChannelCreationResult.startsWith('Ошибка')) {
              return interaction.reply({ content: logChannelCreationResult, ephemeral: true });
            }

            logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
          }

          // Отправляем сообщение в лог-канал
          if (logChannel) {
            const userMention = `<@${interaction.user.id}>`; // Упоминание пользователя

            await logChannel.send(`**Новая заявка на роль:** ${selectedRoleLabels.join(', ')}\n` +
              `**Имя пользователя:** ${userMention} (${userInput})\n\n` +
              `**Дополнительные вопросы:**\n` +
              `🔊 **Модель микрофона:** ${additionalInputs.microphoneModel}\n` +
              `📜 **Опыт:** ${additionalInputs.experience}\n` +
              `💬 **Мотивация:** ${additionalInputs.motivation}\n` +
              `🌍 **Часовой пояс:** ${additionalInputs.time}`);

            await interaction.reply({ content: `Вы подали заявку на роли: ${selectedRoleLabels.join(', ')}\nВы ввели: ${userInput}\nДополнительные ответы: Модель микрофона: ${additionalInputs.microphoneModel}, Опыт: ${additionalInputs.experience}, Мотивация: ${additionalInputs.motivation}\nЧасовой пояс: ${additionalInputs.time}`, ephemeral: true });
          } else {
            console.error('Канал для заявок не найден.');
            await interaction.reply({ content: 'Ошибка: канал для заявок не найден.', ephemeral: true });
          }
          chosenRoles.length = 0; // Очищаем массив выбранных ролей
          selectedRole = null; // Сбрасываем выбранную роль
        } catch (error) {
          console.error('Ошибка при обработке модального окна:', error);
          await interaction.reply({ content: 'Произошла ошибка при обработке вашей заявки. Пожалуйста, попробуйте снова.', ephemeral: true });
        }
      }
    });

    // Обработчик события voiceStateUpdate для перемещения пользователя
    robot.on("voiceStateUpdate", async (oldState, newState) => {
      try {
        // Проверяем, что новое состояние не равно null и что у нас есть доступ к гильдии
        if (!newState.channel || !newState.guild) return;

        // Получаем настройки сервера
        const serverSettings = await getServerSettings(newState.guild.id);
        const { logChannelName, randomRoomName, randomRoomNameUse } = serverSettings;

        // Ищем канал для логирования
        let logChannel;
        if (randomRoomNameUse) {
          logChannel = newState.guild.channels.cache.find(ch => ch.name === randomRoomName);
        } else {
          logChannel = newState.guild.channels.cache.find(ch => ch.name === logChannelName);
        }

        // Проверка наличия канала для логирования
        if (!logChannel) {
          const channelNameToCreate = weddingsLogChannelNameUse ? randomRoomName : logChannelName;
          const roles = newState.guild.roles.cache;
          const botMember = newState.guild.members.me;
          const higherRoles = roles.filter(role => botMember.roles.highest.comparePositionTo(role) < 0);
          await createLogChannel(newState, channelNameToCreate, botMember, higherRoles, serverSettings);
          logChannel = newState.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
        }

        // Проверяем, соответствует ли новое состояние комнате
        if (newState.channel.name === randomRoomName) {
          // Получаем все голосовые каналы на сервере
          const allVoiceChannels = newState.guild.channels.cache.filter(channel => channel.type === ChannelType.GuildVoice);

          // Здесь вы можете задать свои критерии для выбора каналов
          const TARGET_CHANNELS = allVoiceChannels
            .filter(channel => channel.name.toLowerCase() !== randomRoomName.toLowerCase()) // Исключаем текущую комнату
            .map(channel => channel.name); // Получаем имена каналов

          if (TARGET_CHANNELS.length > 0) {
            const randomChannelName = TARGET_CHANNELS[Math.floor(Math.random() * TARGET_CHANNELS.length)];
            const randomChannel = allVoiceChannels.find(channel => channel.name === randomChannelName);
            await newState.member.voice.setChannel(randomChannel);
          }
        }
      } catch (err) {
        console.error(`Ошибка при обработке состояния голоса пользователя ${newState.member ? newState.member.user.tag : 'неизвестного'}:`, err);
        if (newState.member) {
          await newState.member.send('Произошла ошибка при перемещении.');
        }
      }
    });

    function setupCronJobs() {
      cron.schedule('*/2 * * * *', async () => {
        console.log('Запуск задачи по расписанию для проверки ');
        for (const guild of robot.guilds.cache.values()) {
          const guildId = guild.id;
          try {
            const now = Date.now();
            const twoMinutesAgo = now - 2 * 60 * 1000; // Время 2 минуты назад
            const recentMembers = [...recentJoins.entries()].filter(([id, time]) => time >= twoMinutesAgo);

            if (recentMembers.length < 25) {

              recentJoins.clear(); // Очищаем recentJoins, если менее 25 участников
            }

            // Получаем настройки сервера
            const serverSettings = await getServerSettings(guildId);

            // Получаем ID всех участников
            const memberIds = await getAllMemberIds(guild);

            // Обновляем информацию об участниках
            await updateMembersInfo(robot, guildId, memberIds);

            // Удаляем устаревших участников из базы данных
            await removeStaleMembers(guild);

            // Удаление истекших предупреждений и мутов
            await removeExpiredWarnings(robot, guildId, serverSettings, memberIds);
            await removeExpiredMutes(robot, guildId);
          } catch (error) {
            console.error(`Ошибка при обработке сервера ${guildId}:`, error);
          }
        }
      });
    }

    setupCronJobs();
    robot.login(process.env.TOKEN);
    loadBlacklistAndBadLinks();
  } catch (error) {
    console.error('Ошибка при инициализации бота:', error);
  }
})();
