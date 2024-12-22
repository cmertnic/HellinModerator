// Загружаем переменные окружения
require('dotenv').config();

// Импортируем необходимые модули
const { Client, GatewayIntentBits, Partials, Collection, ChannelType, REST, Routes, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, Events } = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');
const { initializeDefaultServerSettings, getServerSettings } = require('./database/settingsDb');
const { removeExpiredWarnings } = require('./database/warningsDb');
const { removeExpiredMutes } = require('./database/mutesDb');
const { initializeI18next, i18next, t } = require('./i18n');
const { createLogChannel,getOrCreateVoiceChannel, createVoiceLogChannel, createRoles, ensureRolesExist, checkAntiRaidConditions, assignNewMemberRole } = require('./events');

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

        console.log(`Выполнение команды: ${interaction.commandName} от пользователя: ${interaction.user.tag} (ID: ${interaction.user.id})`);
        await command.execute(robot, interaction);
      } catch (error) {
        console.error(`Ошибка при выполнении команды от пользователя: ${interaction.user.tag} (ID: ${interaction.user.id}):`, error);
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
      } catch {
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

      const whitelistLinks = ['https://discord.gg/hellin'];

      // Получаем все голосовые каналы на сервере
      const voiceChannelLinks = message.guild.channels.cache
        .filter(channel => channel.type === ChannelType.GuildVoice) // Используем ChannelType для фильтрации
        .map(channel => `https://discord.com/channels/${message.guild.id}/${channel.id}`);

      // Регулярное выражение для ссылок на серверные приглашения
      const serverInviteRegex = /(https?:\/\/)?(www\.)?(discord\.gg|discordapp\.com|discord\.com)\/invite\/[^\s]+/i;

      // Проверяем, содержит ли сообщение ссылку из белого списка
      if (whitelistLinks.some(link => mess_value.includes(link))) {
        return;
      }

      // Проверка на наличие ссылок на голосовые каналы или серверные приглашения в сообщении
      const containsVoiceChannelLink = voiceChannelLinks.some(link => mess_value.includes(link));
      const containsServerInvite = serverInviteRegex.test(mess_value);

      if (containsVoiceChannelLink || containsServerInvite) {
        return;
      }

      // Дополнительная проверка на наличие ссылки на конкретный канал
      if (mess_value.includes(`https://discord.com/channels/${message.guild.id}/`)) {
        return;
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
        return; // Добавляем return, чтобы не продолжать проверку
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
        if (selectedRole === 'role3') {
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
            microphoneModel: selectedRole === 'role3' ? interaction.fields.getTextInputValue('microphoneModel') : 'Не указано',
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

      // Обработка выбора правила из выпадающего меню
      if (interaction.isStringSelectMenu() && interaction.customId === 'rulesSelect') {
        let imageUrls = [];
        let captions = [];

        switch (interaction.values[0]) {
          case 'rule1':
            imageUrls = [
              'https://media.discordapp.net/attachments/1304707253735002153/1309212909263388762/56f3e17d4beceefe.png?ex=6740c309&is=673f7189&hm=a3b0e35cd7b981412bb01ede0d28ec401045327a74af351f220d72518e5810e0&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1309212946223861850/1.0.png?ex=6740c312&is=673f7192&hm=c2f88fff4ddd60f1caa834f29322504b0a133110446994d5c1642f7a09e589d2&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309212971913969776/1.1.png?ex=6740c318&is=673f7198&hm=add3ff43de572fbf8b9cd08950a5e5513409976be71ed7d7079ded488fba2ab3&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309212995011874877/1.2.png?ex=6740c31e&is=673f719e&hm=9876c0a2825c2da54c97ea649112c56c14e5bdef8eacb962682244753a7bf42b&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309213015312306197/1.3.png?ex=6740c322&is=673f71a2&hm=15cca6e6c98940e2cda26562748a298039c7068d4357bcff67cb168dde071c8a&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309213035826515978/1.4.png?ex=6740c327&is=673f71a7&hm=b5292d96d7c4a296a7e2e50023a026721e5c8cc9424cefe1382ef4f96982ddc8&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309213054868918312/1.5.png?ex=6740c32c&is=673f71ac&hm=6ea789b7b9f7edee3b1ee8ef82affea4359b3a27bc3d7c446019b061f0580e14&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309213553949151232/1.6.png?ex=6740c3a3&is=673f7223&hm=5112a587eab27e39f4f47d203b61d305f3ba3753893a5a95461985eeb9c48cad&=&format=webp&quality=lossless&width=550&height=190'
            ];
            captions = [
              ' ',
              'Правило 1.0',
              'Правило 1.1',
              'Правило 1.2',
              'Правило 1.3',
              'Правило 1.4',
              'Правило 1.5',
              'Правило 1.6'
            ];
            break;
          case 'rule2':
            imageUrls = [
              'https://media.discordapp.net/attachments/1304707253735002153/1309213597234233354/0e1137b1e678eef3.png?ex=6740c3ad&is=673f722d&hm=d1fe3eafff5c278ce5c51987ceb8a8b8504044b06d3867f963e7d8c5390cab44&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309213736799834112/2.0.png?ex=6740c3ce&is=673f724e&hm=58ae52af1285225d606362f2f74ac049737d85f69e975e44a5ab8db4a061da90&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1309213754944393267/2.1.png?ex=6740c3d3&is=673f7253&hm=a392df3843cd32b2a1165dd166d00078576cc166169918d3c6bed1b9fc671382&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309213847986507878/2.2.png?ex=6740c3e9&is=673f7269&hm=3e1cca68631355b647f86fd13720f2de899d0ff914c3b1afb30eab4669e9c248&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309213868450381944/2.3.png?ex=6740c3ee&is=673f726e&hm=9eff63e0b4a0f92e925d2e1b506248c23a94769cb6eb62f06bab93dab42ef11c&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309214239797411911/2.4.png?ex=6740c446&is=673f72c6&hm=440f4f95bc524951f6f20b3b060e2366e50a591c71977827382e4d7f2abac94b&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309214250035707934/2.5.png?ex=6740c449&is=673f72c9&hm=d539bb1952517476b04c98d722bc5bc2994bafb4ea43e357b8cddd61da2ef6f8&=&format=webp&quality=lossless&width=550&height=190'
            ];
            captions = [
              ' ',
              'Правило 2.0',
              'Правило 2.1',
              'Правило 2.2',
              'Правило 2.3',
              'Правило 2.4',
              'Правило 2.5'
            ];
            break;
          case 'rule3':
            imageUrls = [
              'https://media.discordapp.net/attachments/1304707253735002153/1309214266590629928/cd140f054f923b19.png?ex=6740c44d&is=673f72cd&hm=c084666b1660e8d14df05c8d47bb9f1758c07dca5fbc8fc7bc3129caa260591f&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309214279408549998/3.0.png?ex=6740c450&is=673f72d0&hm=bd8390a94c65f34fd83e1f8b507b2ee4853d6833fed2e7a93a8e97af355b6608&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309214292712886382/3.1.png?ex=6740c453&is=673f72d3&hm=8e5c3fc600863f188570e0e6b5632cf8e95a068f44213fcaba9e9136944088ce&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309214310513250446/3.2.png?ex=6740c457&is=673f72d7&hm=023f98f9ebf46fc1532da9c7ebba1c5eb612034aa07b4146dd87e6d7d4b560a8&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1309214325449293834/3.3.png?ex=6740c45b&is=673f72db&hm=049422d8fa9e778cf4f6a3df55b7ba9a12d27423ecef155b2db0e36d9c41d50a&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309214338493448262/3.4.png?ex=6740c45e&is=673f72de&hm=857c977e6b0b4dcf0ee91f24a75814c201daea350fdf3fbf70ae373330c90973&=&format=webp&quality=lossless&width=550&height=189'
            ];
            captions = [
              ' ',
              'Правило 3.0',
              'Правило 3.1',
              'Правило 3.2',
              'Правило 3.3',
              'Правило 3.4'
            ];
            break;
          case 'rule4':
            imageUrls = [
              'https://media.discordapp.net/attachments/1304707253735002153/1309214359880208435/078199136237c96a.png?ex=6740c463&is=673f72e3&hm=ef06df66b9ea72fe44d97aedd20018f20161cfa361a1edc18b6a8f5c9f2bd3f2&=&format=webp&quality=lossless&width=550&height=190',
              'https://media.discordapp.net/attachments/1304707253735002153/1309214381413892096/10cec2fcc2f78d17.png?ex=6740c468&is=673f72e8&hm=b3bcfbbd9dfdb9a4a71f535b30559914b935e61d4eee5c45345c121e227f0dba&=&format=webp&quality=lossless&width=550&height=190'
            ];
            captions = [
              ' ',
              'Примечание'
            ];
            break;
          default:
            imageUrls = null;
            captions = null;
        }

        if (imageUrls.length > 0) {
          await interaction.reply({ content: 'Открываю правила...', ephemeral: true });

          for (let i = 0; i < imageUrls.length; i++) {
            const embed = new EmbedBuilder()
              .setColor('#0099ff')
              .setTitle(captions[i])
              .setImage(imageUrls[i]);

            try {
              await interaction.followUp({ embeds: [embed], ephemeral: true });
            } catch (error) {
              console.error('Ошибка при отправке сообщения:', error);
              await interaction.followUp({ content: 'Произошла ошибка при отправке изображения.', ephemeral: true });
              break; // Выход из цикла при ошибке
            }

            // Задержка между отправками сообщений, чтобы избежать превышения лимитов
            await new Promise(resolve => setTimeout(resolve, 500)); // Задержка 1 секунда
          }
        } else {
          await interaction.reply({ content: 'Ошибка: изображения не найдены.', ephemeral: true });
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
          const channelNameToCreate = randomRoomNameUse ? randomRoomName : logChannelName;
          const botMember = newState.guild.members.me;
          await getOrCreateVoiceChannel(newState.guild, channelNameToCreate, botMember);
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

    function setupCronJobs(robot) {
      cron.schedule('*/2 * * * *', async () => {
        console.log('Запуск задачи по расписанию для проверки');

        try {
          // Проверяем, инициализирован ли объект robot и доступны ли guilds
          if (!robot || !robot.guilds) {
            console.log('Объект robot не инициализирован или guilds недоступны.');
            return;
          }

          // Проверяем, есть ли доступные гильдии
          if (robot.guilds.cache.size === 0) {
            console.log('Нет доступных серверов для обработки.');
            return;
          }

          for (const guild of robot.guilds.cache.values()) {


            try {
              const now = Date.now();
              const twoMinutesAgo = now - 2 * 60 * 1000; // Время 2 минуты назад
              const recentMembers = [...recentJoins.entries()].filter(([id, time]) => time >= twoMinutesAgo);

              if (recentMembers.length < 25) {
                recentJoins.clear();
              }

              // Получаем настройки сервера
              const serverSettings = await getServerSettings(guild.id);
              const { newMemberRoleName } = serverSettings;

              // Проверяем участников на наличие ролей и назначаем роль новичка
              const members = await guild.members.fetch();

              for (const [memberId, member] of members) {
                if (member.roles.cache.size === 0) {
                  await assignNewMemberRole(member, newMemberRoleName);
                  console.log(`Роль новичка назначена участнику ${member.user.tag} на сервере ${guild.name}`);
                }
              }

              // Удаление истекших предупреждений и мутов
              await removeExpiredWarnings(robot, guild.id, serverSettings);
              await removeExpiredMutes(robot, guild.id);

            } catch (error) {
              console.error(`Ошибка при обработке сервера ${guild.id}:`, error);
            }
          }
        } catch (error) {
          console.error(`Ошибка при запуске задачи cron:`, error);
        }
      });
    }


    setupCronJobs(robot);
    // Запускаем загрузку черного списка и плохих ссылок
    loadBlacklistAndBadLinks();
    robot.login(process.env.TOKEN);
  } catch (error) {
    console.error('Ошибка при инициализации бота:', error);
  }
})();    