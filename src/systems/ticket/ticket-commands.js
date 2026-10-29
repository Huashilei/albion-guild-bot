/**
 * Ticket Setup Commands - Administrative configuration
 * Commands to manage ticket panels per guild
 */

import { EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { savePanels, loadPanels } from './ticket-db.js';
import { getTicketStats, ticketSystemHealthCheck } from './ticket-utils.js';

/**
 * Setup ticket panel configuration
 * Usage: !ticketsetup <panelId> <ticketType> <categoryId> <pingRoleId> <staffRoleIds> <approveRoleId> <transcriptChannelId> <nicknameFormat> [albionGuild] [albionRegion]
 */
export async function setupTicketPanel(message, args) {
  // Check permissions
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply('❌ You need Administrator permission to use this command.');
  }

  if (args.length < 7) {
    return message.reply(
      '❌ Usage: `!ticketsetup <panelId> <ticketType> <forumChannelId> <pingRoleId> <staffRoleIds> <approveRoleId> <transcriptChannelId> [nicknameFormat] [albionGuild] [albionRegion]`\n' +
      'Example: `!ticketsetup apply "Apply" 123456 789012 345678,901234 567890 111213 "{username}" "My Guild" "Asia"`\n' +
      'Note: forumChannelId must be your Forum channel where application posts will be created\n' +
      'Note: staffRoleIds should be comma-separated (no spaces)\n' +
      'Albion regions: Americas, Europe, Asia'
    );
  }

  const panelId = args[0];
  const ticketTypeName = args[1].replace(/"/g, '');
  const ticketCategoryId = args[2];
  const pingRoleId = args[3];
  const staffRoleIds = args[4].split(',').map(id => id.trim()).filter(Boolean);
  const approveRoleId = args[5];
  const transcriptChannelId = args[6];
  const nicknameFormat = args[7] ? args[7].replace(/"/g, '') : '{username}';
  const requiredAlbionGuild = args[8] ? args[8].replace(/"/g, '') : null;
  const albionRegion = args[9] ? args[9].replace(/"/g, '') : null;

  // Validate Albion region if provided
  if (albionRegion && !['Americas', 'Europe', 'Asia'].includes(albionRegion)) {
    return message.reply('❌ Invalid Albion region. Must be: Americas, Europe, or Asia');
  }

  try {
    const guildId = message.guildId;
    const panels = await loadPanels(guildId);

    const forumChannel = await message.guild.channels.fetch(ticketCategoryId).catch(() => null);
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
      return message.reply('❌ Invalid forumChannelId. Please provide the ID of a Forum channel (for example, your applicants forum).');
    }

    // Check if panel already exists
    const existingIndex = panels.findIndex(p => p.panelId === panelId);

    const newPanel = {
      panelId,
      ticketTypeName,
      ticketCategoryId,
      pingRoleId,
      staffRoleIds,
      approveRoleId,
      transcriptChannelId,
      nicknameFormat,
      requiredAlbionGuild,
      albionRegion
    };

    if (existingIndex >= 0) {
      // Preserve any fields that are not explicitly passed this run.
      panels[existingIndex] = {
        ...panels[existingIndex],
        ...newPanel
      };
    } else {
      panels.push(newPanel);
    }

    await savePanels(guildId, panels);

    const embed = new EmbedBuilder()
      .setTitle('✅ Ticket Panel Configured')
      .addFields(
        { name: 'Panel ID', value: panelId, inline: true },
        { name: 'Ticket Type', value: ticketTypeName, inline: true },
        { name: 'Forum Channel', value: `<#${ticketCategoryId}>`, inline: true },
        { name: 'Ping Role', value: `<@&${pingRoleId}>`, inline: true },
        { name: 'Transcript Channel', value: `<#${transcriptChannelId}>`, inline: true },
        { name: 'Staff Roles', value: staffRoleIds.map(id => `<@&${id}>`).join(', '), inline: false }
      )
      .setColor(0x57F287)
      .setTimestamp();

    return message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error setting up ticket panel:', error);
    return message.reply('❌ Failed to setup ticket panel. Check the console for details.');
  }
}

/**
 * List all ticket panels
 * Usage: !ticketpanels
 */
export async function listTicketPanels(message) {
  try {
    const guildId = message.guildId;
    const panels = await loadPanels(guildId);

    if (panels.length === 0) {
      return message.reply('❌ No ticket panels configured for this server.');
    }

    const embed = new EmbedBuilder()
      .setTitle('🎫 Ticket Panels')
      .setColor(0x5865F2)
      .setTimestamp();

    for (const panel of panels) {
      const fieldLines = [
        `**Forum Channel:** <#${panel.ticketCategoryId}>`,
        `**Ping Role:** <@&${panel.pingRoleId}>`,
        `**Transcript:** <#${panel.transcriptChannelId}>`,
        `**Staff Roles:** ${panel.staffRoleIds.map(id => `<@&${id}>`).join(', ')}`
      ];

      embed.addFields({
        name: `${panel.ticketTypeName} (${panel.panelId})`,
        value: fieldLines.join('\n'),
        inline: false
      });
    }

    return message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error listing ticket panels:', error);
    return message.reply('❌ Failed to list ticket panels.');
  }
}

/**
 * Delete a ticket panel
 * Usage: !ticketdelete <panelId>
 */
export async function deleteTicketPanel(message, args) {
  // Check permissions
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply('❌ You need Administrator permission to use this command.');
  }

  if (args.length < 1) {
    return message.reply('❌ Usage: `!ticketdelete <panelId>`');
  }

  const panelId = args[0];

  try {
    const guildId = message.guildId;
    const panels = await loadPanels(guildId);

    const index = panels.findIndex(p => p.panelId === panelId);
    if (index === -1) {
      return message.reply(`❌ Panel "${panelId}" not found.`);
    }

    panels.splice(index, 1);
    await savePanels(guildId, panels);

    return message.reply(`✅ Ticket panel "${panelId}" deleted.`);

  } catch (error) {
    console.error('Error deleting ticket panel:', error);
    return message.reply('❌ Failed to delete ticket panel.');
  }
}

/**
 * Get ticket statistics
 * Usage: !ticketstats
 */
export async function getTicketStatsCommand(message) {
  try {
    const guildId = message.guildId;
    const stats = await getTicketStats(guildId);

    if (!stats) {
      return message.reply('❌ Failed to retrieve ticket statistics.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Ticket Statistics')
      .addFields(
        { name: 'Total Tickets', value: String(stats.total), inline: true },
        { name: 'Open', value: String(stats.open), inline: true },
        { name: 'Claimed', value: String(stats.claimed), inline: true },
        { name: 'Closed', value: String(stats.closed), inline: true },
        { name: 'Approved', value: String(stats.approved), inline: true },
        { name: 'Last Ticket ID', value: String(stats.lastTicketId), inline: true }
      )
      .setColor(0x5865F2)
      .setTimestamp();

    return message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error getting ticket stats:', error);
    return message.reply('❌ Failed to retrieve ticket statistics.');
  }
}

/**
 * Health check for ticket system
 * Usage: !tickethealth
 */
export async function ticketHealthCommand(message) {
  // Check permissions
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply('❌ You need Administrator permission to use this command.');
  }

  try {
    const guildId = message.guildId;
    const health = await ticketSystemHealthCheck(guildId);

    const statusEmoji = {
      healthy: '✅',
      warning: '⚠️',
      error: '❌'
    }[health.status];

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji} Ticket System Health Check`)
      .addFields(
        { name: 'Status', value: health.status.toUpperCase(), inline: true },
        { name: 'Panels', value: String(health.stats?.panels || 0), inline: true },
        { name: 'Total Tickets', value: String(health.stats?.totalTickets || 0), inline: true }
      )
      .setColor(health.status === 'healthy' ? 0x57F287 : health.status === 'warning' ? 0xFEE75C : 0xED4245)
      .setTimestamp();

    if (health.issues.length > 0) {
      embed.addFields({
        name: 'Issues',
        value: health.issues.join('\n'),
        inline: false
      });
    }

    return message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error running health check:', error);
    return message.reply('❌ Failed to run health check.');
  }
}
