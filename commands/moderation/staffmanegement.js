const { ChannelType, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { i18next } = require('../../i18n');
const { getServerSettings } = require('../../database/settingsDb');
const { createRoles } = require('../../events');

async function ensureRolesExist(interaction) {
    const rolesToCreate = ['Саппорт', 'Ведущий', 'Модератор', 'Ивентер', 'Контрол', 'Креатив'];
    const rolesCreationMessages = await createRoles(interaction, rolesToCreate); 
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staffmanagement')
        .setDescription('Управление ролями сотрудников')
        .addUserOption (option => option
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
                { name: i18next.t('staffmanagement-js_eventer'), value: 'eventer' },
                { name: i18next.t('staffmanagement-js_control'), value: 'control' },
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

            const userIdToManage = interaction.options.getUser ('user').id;
            const action = interaction.options.getString('action');
            const roleToManage = interaction.options.getString('role');
            const memberToManage = await interaction.guild.members.fetch(userIdToManage);

            if (!memberToManage) {
                return await interaction.editReply({ content: i18next.t('User _not_found'), ephemeral: true });
            }

            // Название канала логирования
            const logChannelName = 'заявки';
            const botMember = interaction.guild.members.me;
            let logChannel = interaction.guild.channels.cache.find(ch => ch.name === logChannelName && ch.type === ChannelType.GuildText);

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
                    role = interaction.guild.roles.cache.find(role => role.name === 'Саппорт');
                    break;
                case 'leader':
                    role = interaction.guild.roles.cache.find(role => role.name === 'Ведущий');
                    break;
                case 'moderator':
                    role = interaction.guild.roles.cache.find(role => role.name === 'Модератор');
                    break;
                case 'eventer':
                    role = interaction.guild.roles.cache.find(role => role.name === 'Ивентер');
                    break;
                case 'control':
                    role = interaction.guild.roles.cache.find(role => role.name === 'Контрол');
                    break;
                case 'creative':
                    role = interaction.guild.roles.cache.find(role => role.name === 'Креатив');
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
