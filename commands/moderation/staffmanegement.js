const { ChannelType, SlashCommandBuilder, PermissionFlagsBits,PermissionsBitField, EmbedBuilder } = require('discord.js');
const { i18next } = require('../../i18n');
const { getServerSettings } = require('../../database/settingsDb');
const { createRoles, createLogChannel } = require('../../events');

async function ensureRolesExist(interaction) {
    const serverSettings = await getServerSettings(interaction.guild.id);
    const { supportRoleName, podkastRoleName, moderatorRoleName, creativeRoleName } = serverSettings;
    const rolesToCreate = [supportRoleName, podkastRoleName, moderatorRoleName, creativeRoleName];
    await createRoles(interaction, rolesToCreate);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staffmanagement')
        .setDescription('Управление ролями сотрудников')
        .addUserOption(option => option
            .setName('user')
            .setDescription('Пользователь, которому нужно назначить или снять роль')
            .setRequired(true))
        .addStringOption(option => option
            .setName('action')
            .setDescription('Действие (нанять или снять)')
            .setRequired(true)
            .addChoices(
                { name: ('Повысить'), value: 'hire' },
                { name: ('Понизить'), value: 'fire' }
            ))
        .addStringOption(option => option
            .setName('role')
            .setDescription(i18next.t('staffmanagement-js_role'))
            .setRequired(true)
            .addChoices(
                { name: i18next.t('staffmanagement-js_support'), value: 'support' },
                { name: i18next.t('staffmanagement-js_leader'), value: 'leader' },
                { name: i18next.t('staffmanagement-js_moderator'), value: 'moderator' },
                { name: i18next.t('staffmanagement-js_creative'), value: 'creative' }
            )),
    async execute(robot, interaction) {
        if (interaction.user.bot) return;
        if (interaction.channel.type === ChannelType.DM) {
            return await interaction.reply({ content: i18next.t('error_private_messages'), ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        try {
            // Убедимся, что роли существуют
            const roleCreationMessages = await ensureRolesExist(interaction);
            if (roleCreationMessages) {
                console.log(roleCreationMessages); // Логирование сообщений о создании ролей
            }

            const userIdToManage = interaction.options.getUser('user').id;
            const action = interaction.options.getString('action');
            const roleToManage = interaction.options.getString('role');
            const memberToManage = await interaction.guild.members.fetch(userIdToManage);
            const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
            if (!memberToManage) {
                return await interaction.editReply({ content: i18next.t('User_not_found'), ephemeral: true });
            }

            const serverSettings = await getServerSettings(interaction.guild.id);
            const { allowedRoles, supportRoleName, podkastRoleName, moderatorRoleName, creativeRoleName, applicationsLogChannelName, applicationsLogChannelNameUse, logChannelName } = serverSettings;

            // Извлекаем названия разрешенных ролей
            const allowedRolesArray = allowedRoles.split(',').map(role => role.trim());

            // Проверяем наличие роли у пользователя
            const hasAllowedRole = interaction.member.roles.cache.some(role => allowedRolesArray.includes(role.name));
            
            // Проверяем права доступа
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !hasAllowedRole) {
                return await interaction.editReply({ content: 'У вас нет прав на выполнение этой команды.', ephemeral: true });
            }


            // Получение канала для логирования
            let logChannel;
            if (applicationsLogChannelNameUse) {
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === applicationsLogChannelName);
            } else {
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName);
            }

            // Проверка наличия канала для логирования
            if (!logChannel) {
                const channelNameToCreate = applicationsLogChannelNameUse ? applicationsLogChannelName : logChannelName;
                const roles = interaction.guild.roles.cache;
                const botMember = interaction.guild.members.me;
               const higherRoles = interaction.guild.roles.cache.filter(role => role.position > botMember.roles.highest.position);
                await createLogChannel(interaction, channelNameToCreate, botMember, higherRoles, serverSettings);
                logChannel = interaction.guild.channels.cache.find(ch => ch.name === channelNameToCreate);
            }

            // Если канал для логов не найден, создаем его
            if (!logChannel) {
                const everyoneRole = interaction.guild.roles.everyone;

                try {
                    logChannel = await interaction.guild.channels.create({
                        name: logChannelName,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: everyoneRole.id,
                                deny: [PermissionFlagsBits.ViewChannel],
                            },
                            {
                                id: botMember.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                            },
                        ],
                    });

                    // Получаем всех пользователей с ролями выше бота и разрешаем им видеть канал
                    const higherRoles = interaction.guild.roles.cache.filter(role => role.position > botMember.roles.highest.position);
                    higherRoles.forEach(role => {
                        logChannel.permissionOverwrites.create(role, {
                            [PermissionFlagsBits.ViewChannel]: true,
                            [PermissionFlagsBits.SendMessages]: true,
                        });
                    });

                    console.log(`Создан новый лог-канал: ${logChannel.name}`);
                } catch (error) {
                    console.error(`Не удалось создать канал логирования: ${error.message}`);
                    return await interaction.editReply({ content: 'Не удалось создать канал логирования.', ephemeral: true });
                }
            }

            // Проверяем наличие прав у бота
            if (!logChannel.permissionsFor(botMember).has(PermissionFlagsBits.SendMessages)) {
                return await interaction.editReply({ content: 'У бота нет прав на отправку сообщений в лог-канал.', ephemeral: true });
            }

            // Определяем роль для управления
            let role;
            switch (roleToManage) {
                case 'support':
                    role = interaction.guild.roles.cache.find(role => role.name === supportRoleName);
                    break;
                case 'leader':
                    role = interaction.guild.roles.cache.find(role => role.name === podkastRoleName);
                    break;
                case 'moderator':
                    role = interaction.guild.roles.cache.find(role => role.name === moderatorRoleName);
                    break;
                case 'creative':
                    role = interaction.guild.roles.cache.find(role => role.name === creativeRoleName);
                    break;
                default:
                    return await interaction.editReply({ content: 'Роль не найдена.', ephemeral: true });
            }

            if (!role) {
                return await interaction.editReply({ content: 'Роль не найдена.', ephemeral: true });
            }

            switch (action) {
                case 'hire':
                    console.log('Executing hire action');
                    if (memberToManage.roles.cache.has(role.id)) {
                        return await interaction.editReply({ content: i18next.t('staffmanagement-js_role_already_hired', { rolename: role.name }), ephemeral: true });
                    }
                    await memberToManage.roles.add(role);
                    await interaction.editReply({ content: i18next.t('staffmanagement-js_role_hired', { rolename: role.name, userIdToManage: userIdToManage }), ephemeral: true });

                    // Создание embed для лога в канале логов
                    const hireEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle(i18next.t('staffmanagement-js_hire_log_title'))
                        .setDescription(i18next.t('staffmanagement-js_hire_log', { member: memberToManage.id, role: role.name }))
                        .setTimestamp()
                        .setFooter({ text: i18next.t('staffmanagement-js_log_footer', { moderator: interaction.user.tag }) });

                    // Отправка embed в канал логов
                    await logChannel.send({ embeds: [hireEmbed] });
                    break;

                case 'fire':
                    console.log('Executing fire action');
                    if (!memberToManage.roles.cache.has(role.id)) {
                        return await interaction.editReply({ content: i18next.t('staffmanagement-js_role_not_hired', { rolename: role.name }), ephemeral: true });
                    }
                    await memberToManage.roles.remove(role);
                    await interaction.editReply({ content: i18next.t('staffmanagement-js_role_fired', { rolename: role.name, userIdToManage: userIdToManage }), ephemeral: true });

                    // Создание embed для лога в канале логов
                    const fireEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(i18next.t('staffmanagement-js_fire_log_title'))
                        .setDescription(i18next.t('staffmanagement-js_fire_log', { member: memberToManage.id, role: role.name }))
                        .setTimestamp()
                        .setFooter({ text: i18next.t('staffmanagement-js_log_footer', { moderator: interaction.user.tag }) });

                    // Отправка embed в канал логов
                    await logChannel.send({ embeds: [fireEmbed] });
                    break;

                default:
                    console.log('Unknown action');
                    await interaction.editReply({ content: i18next.t('Error'), ephemeral: true });
            }
        } catch (error) {
            console.error(`Произошла ошибка: ${error.message}`);
            return await interaction.editReply({ content: `Произошла ошибка: ${error.message}`, ephemeral: true });
        }
    },
};
