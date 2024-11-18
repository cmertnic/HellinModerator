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
const { createLogChannel, createRoles, ensureRolesExist, checkAntiRaidConditions, assignNewMemberRole, createAndSetBanner } = require('./events');
const sharp = require('sharp');
const axios = require('axios');

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
    robot.on(Events.InteractionCreate, async (interaction) => {
      // Обработка выбора правила из выпадающего меню
      if (interaction.isStringSelectMenu() && interaction.customId === 'rulesSelect') {
        let imageUrls;
        let captions;

        switch (interaction.values[0]) {
          case 'rule1':
            imageUrls = [
              'https://media.discordapp.net/attachments/1304707253735002153/1308021879772156005/3685cb7c54c558b3.png?ex=673c6dce&is=673b1c4e&hm=b922234649ebfb3904d6674c936d183b931aaaa22f1a47d45e95d8c4f95949b6&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1308021919546609716/1.0.png?ex=673c6dd7&is=673b1c57&hm=88a7a17227c42c2898ddf693db53debf78a9cfb9cdd512d9a4e6306117a16a56&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1308021919936811079/1.1.png?ex=673c6dd7&is=673b1c57&hm=1b4296d739d174f05d3c872427e76b93dfcdd8a23fcf3564e4e8bda7020b8e08&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1308021920368955432/1.2.png?ex=673c6dd7&is=673b1c57&hm=e5e9a4aaa131b42710c4d3dd610d0cebbc1af0c80118c677601bfa30c5fa7d0f&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1308021920725467136/1.3.png?ex=673c6dd7&is=673b1c57&hm=a672069cccc31137c0af2957d96043362d5180cb9e6edfc4c69212a4e4a38ddb&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1308021921274789929/1.4.png?ex=673c6dd7&is=673b1c57&hm=583b4ff3763e7cebf71c34155c8dfa5e046f93f8240460d95d09fc71d96e801b&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1308021921606144082/1.5.png?ex=673c6dd7&is=673b1c57&hm=af503a1650545f1e2676bd6a11a58aeebb2994f0895b0854d74f1e3d1ddfb30e&=&format=webp&quality=lossless',
              'https://media.discordapp.net/attachments/1304707253735002153/1308021921907998750/1.6.png?ex=673c6dd8&is=673b1c58&hm=c533d64970e7cd801715b5f6d10fc770ee0569815f4d248e001e076e937706e2&=&format=webp&quality=lossless'
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
                'https://media.discordapp.net/attachments/1304707253735002153/1308021993978855466/0e74938470d982f3.png?ex=673c6de9&is=673b1c69&hm=a2db77bf01f17b58b8ca4038b76507e784b2ee4cee0266c1c482c99b0f64388f&=&format=webp&quality=lossless&width=550&height=189',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022026627452989/2.0.png?ex=673c6df1&is=673b1c71&hm=da91fb9c57c12d68ff4260b5ea6d8a080a6e24fbdae445bef53f1c4da79b1ec6&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022026933633094/2.1.png?ex=673c6df1&is=673b1c71&hm=5a72e86e3f50effab3a9ab630d5283a8e7fadf23eb163d3c24c24ef32b1b8dc0&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022027352932352/2.2.png?ex=673c6df1&is=673b1c71&hm=0eefcb7ee67415d5adaa22d470c48b071bf9f2144b4d3850022b5e61ad3d6d12&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022027742871594/2.3.png?ex=673c6df1&is=673b1c71&hm=52bc5b5ae75060715603619357f0fe4263ba8f8659337f64eb8d35e372545c36&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022028112232551/2.4.png?ex=673c6df1&is=673b1c71&hm=7d30365fecd397bf87635ecc638c56e77f5a60a27cdca72d46dd52787d1ca8d5&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022028514889759/2.5.png?ex=673c6df1&is=673b1c71&hm=383f419960868da41c93ceac3ffa387ba20450bdbabd6042abd6f706ca52597c&=&format=webp&quality=lossless'
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
                'https://media.discordapp.net/attachments/1304707253735002153/1308022127357591594/128041928c42778f.png?ex=673c6e09&is=673b1c89&hm=d44abe5d8e5a2e12bec53715f75946ef9c8051f16a8197f1f33cf732d7488fad&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022645681426452/3.0.png?ex=673c6e84&is=673b1d04&hm=c2ef75fd182ab3e4d0dc74fbb4482b96afaffa46b72b0b420e56c0a621199a2a&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022157066113064/3.1.png?ex=673c6e10&is=673b1c90&hm=d6d23617fba889af214b1341923f9f2ec64faed3f5aee6fdeaa84ed00c3c0acd&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022157443596348/3.2.png?ex=673c6e10&is=673b1c90&hm=352cd6a4ff885cdda57c43121336709fb1dfba4213439abda7ae774b11541f69&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022157829476453/3.3.png?ex=673c6e10&is=673b1c90&hm=696212ff0c7bb6f5f290d9303fbe2a9ff170d327014819f6d059f48f2f37ee3d&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022158173274182/3.4.png?ex=673c6e10&is=673b1c90&hm=6e1bf0df143e56adc89416e214427f634d0a376826ad6f55f030e9f382ff0555&=&format=webp&quality=lossless'
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
                'https://media.discordapp.net/attachments/1304707253735002153/1308022213990940733/84251ae5ca1e47a4.png?ex=673c6e1d&is=673b1c9d&hm=b31a047edf88dcd54b718317005bc29010638cb10d27d30d3ff2e7d6dd8f72b4&=&format=webp&quality=lossless',
                'https://media.discordapp.net/attachments/1304707253735002153/1308022234664669204/a17f87e1fc5a375c.png?ex=673c6e22&is=673b1ca2&hm=8b0966e998cdd1a9da2e88b590062b9aae47cadd897276f633531863c0f7f9fe&=&format=webp&quality=lossless'
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

        if (imageUrls && imageUrls.length > 0) {
          // Отправляем первое сообщение с описанием
          await interaction.reply({ content: `открываю правила`, ephemeral: true });

          // Отправляем каждое изображение в отдельном эфемерном сообщении
          for (let i = 0; i < imageUrls.length; i++) {
            const embed = new EmbedBuilder()
              .setColor('#0099ff')
              .setTitle(captions[i]) // Устанавливаем кастомную приписку
              .setImage(imageUrls[i]); // Устанавливаем изображение

            // Используем followUp для отправки эфемерного сообщения
            await interaction.followUp({ embeds: [embed], ephemeral: true });
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

              // Получаем ID всех участников
              const memberIds = await getAllMemberIds(guild);

              // Обновляем информацию об участниках
              await updateMembersInfo(robot, guild.id, memberIds);

              // Проверяем участников на наличие ролей и назначаем роль новичка
              const members = await guild.members.fetch();

              for (const [memberId, member] of members) {
                if (member.roles.cache.size === 0) {
                  await assignNewMemberRole(member, newMemberRoleName);
                  console.log(`Роль новичка назначена участнику ${member.user.tag} на сервере ${guild.name}`);
                }
              }

              // Удаляем устаревших участников из базы данных
              await removeStaleMembers(guild);

              // Удаление истекших предупреждений и мутов
              await removeExpiredWarnings(robot, guild.id, serverSettings, memberIds);
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
