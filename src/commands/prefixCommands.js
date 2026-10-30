import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { loadPrefix, savePrefix, loadPermissions, savePermissions } from '../database/guildData.js';
import { deposit, withdraw, getBalance, getActiveUsers, clearUser, clearAll, CURRENCY } from '../systems/bank/bank.js';
import { hasPermission } from '../utils/permissions.js';
import { buildHelpEmbed, buildRegisteredPage } from '../utils/embedBuilder.js';
import {
  setupTicketPanel,
  listTicketPanels,
  deleteTicketPanel,
  getTicketStatsCommand,
  ticketHealthCommand
} from '../systems/ticket/ticket-commands.js';
import { createApplyPanelMessage } from '../systems/ticket/ticket-system.js';
import { resetTicketData } from '../systems/ticket/ticket-db.js';
import { registerUser, unregisterUser, purgeUsers } from '../systems/albion/albion.js';
import { loadAlbionConfig, saveAlbionConfig, validateAlbionConfig, findAlbionUsersByIGN, getAllAlbionUsers } from '../systems/albion/albion-db.js';
import axios from 'axios';

// Sends the apply button in the current channel (!ticket panel / !applypanel)
async function sendApplyPanel(message) {
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply('❌ You need Administrator permission to use this command.');
    return;
  }

  const panelMessage = createApplyPanelMessage();
  await message.channel.send(panelMessage);
  await message.reply('✅ Apply panel created!');
}

// Wipes all ticket data for the guild (!ticket reset), gated behind an
// explicit "confirm" argument like !purge - this is irreversible.
async function resetTicketDataCommand(message, args, prefix) {
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply('❌ You need Administrator permission to use this command.');
    return;
  }

  if (args[0]?.toLowerCase() !== 'confirm') {
    await message.reply(
      `⚠️ **WARNING:** This deletes all tickets, transcripts, and resets the ticket counter for this server.\n\n` +
      `To proceed, use: \`${prefix}ticket reset confirm\``
    );
    return;
  }

  try {
    await resetTicketData(message.guildId);

    const embed = new EmbedBuilder()
      .setTitle('✅ Ticket System Reset')
      .setDescription(
        'All ticket data has been cleared:\n' +
        '• All tickets deleted\n' +
        '• All transcripts deleted\n' +
        '• Ticket counter reset to 0\n\n' +
        'Next ticket will be **ticket-1**'
      )
      .setColor(0x57F287)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error resetting ticket data:', error);
    await message.reply('❌ Failed to reset ticket data.');
  }
}

export async function handlePrefixCommands(message, command, args, prefix) {
  // !utc command
  if (command === 'utc' || command === 'time') {
    const now = new Date();
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const utcTime = `${hours}:${minutes}:${seconds}`;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(`⏰ UTC Time Now: **${utcTime}**`);

    await message.reply({ embeds: [embed] });
    return;
  }

  // !info command - Search for Albion Online player across all regions
  if (command === 'info') {
    const playerName = args.join(' ');

    if (!playerName) {
      await message.reply(`❌ Usage: \`${prefix}info <player_name>\``);
      return;
    }

    const loadingMsg = await message.reply('⏳ Searching for player across all regions...');

    // Define the three regions
    const regions = [
      { name: 'Americas', baseUrl: 'https://gameinfo.albiononline.com/api/gameinfo' },
      { name: 'Europe', baseUrl: 'https://gameinfo-ams.albiononline.com/api/gameinfo' },
      { name: 'Asia', baseUrl: 'https://gameinfo-sgp.albiononline.com/api/gameinfo' }
    ];

    try {
      // Search for player across all regions
      const searchPromises = regions.map(async (region) => {
        try {
          const searchResponse = await axios.get(`${region.baseUrl}/search?q=${encodeURIComponent(playerName)}`, {
            timeout: 5000
          });

          const players = searchResponse.data.players || [];
          if (players.length === 0) {
            return { region: region.name, players: [] };
          }

          // Find all exact matches (case-insensitive) - limit to 5
          const exactMatches = players.filter(p => p.Name.toLowerCase() === playerName.toLowerCase()).slice(0, 5);
          
          if (exactMatches.length === 0) {
            return { region: region.name, players: [] };
          }

          // Fetch detailed info for all exact matches
          const detailedPlayers = await Promise.all(
            exactMatches.map(async (player) => {
              try {
                const playerResponse = await axios.get(`${region.baseUrl}/players/${player.Id}`, {
                  timeout: 5000
                });
                return playerResponse.data;
              } catch (error) {
                return null;
              }
            })
          );

          return {
            region: region.name,
            players: detailedPlayers.filter(p => p !== null)
          };
        } catch (error) {
          // If player not found or error in this region, return empty
          return { region: region.name, players: [] };
        }
      });

      const results = await Promise.all(searchPromises);
      const allFoundPlayers = results.flatMap(result => 
        result.players.map(player => ({ region: result.region, data: player }))
      );

      if (allFoundPlayers.length === 0) {
        await loadingMsg.edit(`❌ Player **${playerName}** not found in any region.`);
        return;
      }

      // Build embed with player info from all regions
      const embed = new EmbedBuilder()
        .setColor(0xF0B900)
        .setTitle(`🔍 Player Search: ${playerName}`)
        .setTimestamp();

      if (allFoundPlayers.length > 1) {
        embed.setDescription(`Found **${allFoundPlayers.length}** players with this name across regions.`);
      }

      allFoundPlayers.forEach((playerInfo, index) => {
        const player = playerInfo.data;
        const region = playerInfo.region;

        let fieldValue = `**Player ID:** ${player.Id}\n`;
        
        if (player.GuildId && player.GuildName) {
          fieldValue += `**Guild:** ${player.GuildName}\n`;
        } else {
          fieldValue += `**Guild:** None\n`;
        }

        if (player.AllianceId && player.AllianceName) {
          fieldValue += `**Alliance:** ${player.AllianceName}\n`;
        } else {
          fieldValue += `**Alliance:** None\n`;
        }

        if (player.KillFame !== undefined) {
          fieldValue += `**Kill Fame:** ${player.KillFame.toLocaleString()}\n`;
        }

        if (player.DeathFame !== undefined) {
          fieldValue += `**Death Fame:** ${player.DeathFame.toLocaleString()}\n`;
        }

        if (player.LifetimeStatistics) {
          const stats = player.LifetimeStatistics;
          if (stats.PvE && stats.PvE.Total) {
            fieldValue += `**PvE Fame:** ${stats.PvE.Total.toLocaleString()}\n`;
          }
        }

        const fieldName = allFoundPlayers.length > 1 
          ? `${index + 1}. 📍 ${region} - ${player.Name}`
          : `📍 ${region}`;

        embed.addFields({
          name: fieldName,
          value: fieldValue,
          inline: false
        });
      });

      await loadingMsg.edit({ content: '', embeds: [embed] });

    } catch (error) {
      console.error('Error fetching player info:', error);
      await loadingMsg.edit('❌ An error occurred while fetching player information. Please try again later.');
    }
    return;
  }

  // !bank or !bal command
  if (command === 'bank' || command === 'bal' || command === 'balance') {
    const subcommand = args[0]?.toLowerCase();
    
    if (!subcommand || subcommand === 'balance' || subcommand === 'bal') {
      // Show own balance or mentioned user's balance
      const mentionedUser = message.mentions.users.first();
      const targetUserId = mentionedUser?.id || message.author.id;
      const balance = getBalance(message.guild.id, targetUserId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('💰 Bank Balance')
        .setDescription(
          `**User:** <@${targetUserId}>\n` +
          `**Balance:** ${CURRENCY}${balance.toLocaleString()}`
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Check admin permission for admin commands
    if (!hasPermission(message.member, 'bankAdminRoles')) {
      await message.reply('❌ You need Administrator permission or an authorized role to use this command.');
      return;
    }

    if (subcommand === 'deposit' || subcommand === 'dep') {

      const mentionedUser = message.mentions.users.first();
      const amount = parseInt(args[1]);

      if (!mentionedUser || isNaN(amount) || amount <= 0) {
        await message.reply(`❌ Usage: \`${prefix}bank deposit @user <amount>\``);
        return;
      }

      const result = deposit(message.guild.id, mentionedUser.id, amount);

      if (!result.success) {
        await message.reply(`❌ ${result.error}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('💰 Deposit Successful')
        .setDescription(
          `**User:** <@${mentionedUser.id}>\n` +
          `**Deposited:** ${CURRENCY}${amount.toLocaleString()}\n` +
          `**New Balance:** ${CURRENCY}${result.newBalance.toLocaleString()}`
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'withdraw' || subcommand === 'with') {

      const mentionedUser = message.mentions.users.first();
      const amount = parseInt(args[1]);

      if (!mentionedUser || !amount || amount <= 0) {
        await message.reply(`❌ Usage: \`${prefix}bank withdraw @user <amount>\``);
        return;
      }

      const result = withdraw(message.guild.id, mentionedUser.id, amount);

      if (!result.success) {
        await message.reply(`❌ ${result.error}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('💸 Withdrawal Successful')
        .setDescription(
          `**User:** <@${mentionedUser.id}>\n` +
          `**Withdrawn:** ${CURRENCY}${amount.toLocaleString()}\n` +
          `**New Balance:** ${CURRENCY}${result.newBalance.toLocaleString()}`
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'active' || subcommand === 'list') {
      const activeUsers = getActiveUsers(message.guild.id);

      if (activeUsers.length === 0) {
        await message.reply('📊 No users currently have money in the bank.');
        return;
      }

      const userList = activeUsers
        .map(([uid, bal]) => `<@${uid}> — ${CURRENCY}${bal.toLocaleString()}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle('📊 Active Bank Users')
        .setDescription(userList)
        .setFooter({ text: `Total users: ${activeUsers.length}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'clear') {

      const mentionedUser = message.mentions.users.first();

      if (!mentionedUser) {
        await message.reply(`❌ Usage: \`${prefix}bank clear @user\``);
        return;
      }

      const result = clearUser(message.guild.id, mentionedUser.id);

      if (!result.success) {
        await message.reply(`❌ ${result.error}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle('🗑️ Balance Cleared')
        .setDescription(
          `**User:** <@${mentionedUser.id}>\n` +
          `**Cleared Amount:** ${CURRENCY}${result.clearedAmount.toLocaleString()}\n` +
          `**New Balance:** ${CURRENCY}0`
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'clearall') {

      const result = clearAll(message.guild.id);

      if (!result.success) {
        await message.reply(`❌ ${result.error}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle('🗑️ All Balances Cleared')
        .setDescription(
          `**Cleared Users:** ${result.clearedUsers}\n` +
          `**All balances have been reset to ${CURRENCY}0**`
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Invalid subcommand
    await message.reply(
      `❌ Invalid subcommand. Available: \`balance\`, \`deposit\`, \`withdraw\`, \`active\`, \`clear\`, \`clearall\``
    );
    return;
  }

  // !prefix command - Change bot prefix (Admin only)
  if (command === 'prefix') {
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      await message.reply('❌ You need Administrator permission to change the prefix.');
      return;
    }

    const newPrefix = args[0];

    if (!newPrefix) {
      await message.reply(`📝 Current prefix: \`${prefix}\`\nUsage: \`${prefix}prefix <new_prefix>\``);
      return;
    }

    if (newPrefix.length > 3) {
      await message.reply('❌ Prefix must be 3 characters or less.');
      return;
    }

    if (savePrefix(message.guild.id, newPrefix)) {
      await message.reply(`✅ Prefix changed from \`${prefix}\` to \`${newPrefix}\``);
    } else {
      await message.reply('❌ Failed to change prefix.');
    }
    return;
  }

  // !permissions command - Manage role permissions (Admin only)
  if (command === 'permissions' || command === 'perms') {
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      await message.reply('❌ You need Administrator permission to manage permissions.');
      return;
    }

    const subcommand = args[0]?.toLowerCase();
    const permType = args[1]?.toLowerCase();
    
    if (!subcommand || (subcommand !== 'list' && !permType)) {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔐 Permission Management')
        .setDescription(
          `**Usage:**\n` +
          `\`${prefix}perms list\` - List all role permissions\n` +
          `\`${prefix}perms add <bank|cta|content> @role\` - Add role to permission group\n` +
          `\`${prefix}perms remove <bank|cta|content> @role\` - Remove role from permission group\n\n` +
          `**Permission Types:**\n` +
          `• \`bank\` - Can use bank deposit/withdraw/clear commands\n` +
          `• \`cta\` - Can create and close regear threads\n` +
          `• \`content\` - Can create and manage content callouts`
        );
      await message.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'list') {
      const permissions = loadPermissions(message.guild.id);
      const bankRoles = permissions.bankAdminRoles.map(id => `<@&${id}>`).join('\n') || '*None*';
      const ctaRoles = permissions.ctaRegearRoles.map(id => `<@&${id}>`).join('\n') || '*None*';
      const contentRoles = permissions.contentAdminRoles.map(id => `<@&${id}>`).join('\n') || '*None*';
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔐 Current Role Permissions')
        .addFields(
          { name: '💰 Bank Admin Roles', value: bankRoles, inline: false },
          { name: '⚔️ CTA Regear Roles', value: ctaRoles, inline: false },
          { name: '🎮 Content Admin Roles', value: contentRoles, inline: false }
        )
        .setFooter({ text: 'Administrators always have access to all commands' });
      
      await message.reply({ embeds: [embed] });
      return;
    }

    const role = message.mentions.roles.first();
    if (!role) {
      await message.reply(`❌ Please mention a role. Usage: \`${prefix}perms ${subcommand} <bank|cta|content> @role\``);
      return;
    }

    let configKey;
    let displayName;
    if (permType === 'bank') {
      configKey = 'bankAdminRoles';
      displayName = 'Bank Admin';
    } else if (permType === 'cta') {
      configKey = 'ctaRegearRoles';
      displayName = 'CTA Regear';
    } else if (permType === 'content') {
      configKey = 'contentAdminRoles';
      displayName = 'Content Admin';
    } else {
      await message.reply(`❌ Invalid permission type. Use \`bank\`, \`cta\`, or \`content\`.`);
      return;
    }

    const permissions = loadPermissions(message.guild.id);

    if (subcommand === 'add') {
      if (permissions[configKey].includes(role.id)) {
        await message.reply(`❌ Role ${role} already has ${displayName} permission.`);
        return;
      }
      
      permissions[configKey].push(role.id);
      savePermissions(message.guild.id, permissions);
      await message.reply(`✅ Added ${role} to ${displayName} permissions.`);
      return;
    }

    if (subcommand === 'remove') {
      const index = permissions[configKey].indexOf(role.id);
      if (index === -1) {
        await message.reply(`❌ Role ${role} doesn't have ${displayName} permission.`);
        return;
      }
      
      permissions[configKey].splice(index, 1);
      savePermissions(message.guild.id, permissions);
      await message.reply(`✅ Removed ${role} from ${displayName} permissions.`);
      return;
    }

    await message.reply(`❌ Invalid subcommand. Use \`add\`, \`remove\`, or \`list\`.`);
    return;
  }

  // !help command
  if (command === 'help' || command === 'commands') {
    const embed = buildHelpEmbed(message.member, message.guild.id, false);
    await message.reply({ embeds: [embed] });
    return;
  }

  // ==================== TICKET COMMANDS ====================
  // Primary form mirrors the slash command 1:1: /ticket setup <-> !ticket setup,
  // /ticket list <-> !ticket list, etc. The old flat names (!ticketsetup,
  // !ticketpanels, !applypanel, ...) still work below as aliases.

  if (command === 'ticket') {
    const ticketSubcommand = args[0]?.toLowerCase();
    const ticketArgs = args.slice(1);

    if (ticketSubcommand === 'setup') {
      await setupTicketPanel(message, ticketArgs);
      return;
    }
    if (ticketSubcommand === 'list') {
      await listTicketPanels(message);
      return;
    }
    if (ticketSubcommand === 'delete') {
      await deleteTicketPanel(message, ticketArgs);
      return;
    }
    if (ticketSubcommand === 'stats') {
      await getTicketStatsCommand(message);
      return;
    }
    if (ticketSubcommand === 'health') {
      await ticketHealthCommand(message);
      return;
    }
    if (ticketSubcommand === 'panel') {
      await sendApplyPanel(message);
      return;
    }
    if (ticketSubcommand === 'reset') {
      await resetTicketDataCommand(message, ticketArgs, prefix);
      return;
    }

    await message.reply(
      `❌ Usage: \`${prefix}ticket <setup|list|delete|stats|health|panel|reset>\``
    );
    return;
  }

  // Legacy aliases (still supported for backwards compatibility)
  if (command === 'ticketsetup') {
    await setupTicketPanel(message, args);
    return;
  }
  if (command === 'ticketpanels') {
    await listTicketPanels(message);
    return;
  }
  if (command === 'ticketdelete') {
    await deleteTicketPanel(message, args);
    return;
  }
  if (command === 'ticketstats') {
    await getTicketStatsCommand(message);
    return;
  }
  if (command === 'tickethealth') {
    await ticketHealthCommand(message);
    return;
  }
  if (command === 'applypanel') {
    await sendApplyPanel(message);
    return;
  }

  // ==================== ALBION COMMANDS ====================

  // !set command - Configure Albion guild verification (Admin only)
  if (command === 'set') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply('❌ You need Administrator permission to use this command.');
      return;
    }

    const subcommand = args[0]?.toLowerCase();
    const config = loadAlbionConfig(message.guild.id);

    if (!subcommand) {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Set Command Usage')
        .setDescription(
          `**Available subcommands:**\n` +
          `\`${prefix}set guild <region> <guild_name>\` - Set region and guild\n` +
          `\`${prefix}set register-role @role\` - Set verified member role\n` +
          `\`${prefix}set alliance-role @role\` - Set alliance registration role\n` +
          `\`${prefix}set alliance-role-enabled <true|false>\` - Toggle alliance role assignment\n` +
          `\`${prefix}set alliance-nickname-format <format>\` - Set alliance nickname format\n` +
          `\`${prefix}set alliance-nickname-enabled <true|false>\` - Toggle alliance nickname updates\n` +
          `\`${prefix}set alliance-nickname-overwrite <true|false>\` - Toggle nickname overwrite\n` +
          `\`${prefix}set guild-tag <tag>\` - Set guild tag\n` +
          `\`${prefix}set nickname-format <format>\` - Set nickname format\n\n` +
          `**Regions:** americas, europe, asia\n` +
          `**Nickname variables:** {ign}, {tag}, {guild}, {region}\n` +
          `**Alliance nickname variables:** {allianceTag}, {allianceName}, {playerName}`
        );
      await message.reply({ embeds: [embed] });
      return;
    }

    // Subcommand: alliance-role
    if (subcommand === 'alliance-role') {
      const role = message.mentions.roles.first();

      if (!role) {
        await message.reply(`❌ Usage: \`${prefix}set alliance-role @role\``);
        return;
      }

      config.allianceRoleIds = [role.id];
      config.allianceRoleEnabled = true;
      saveAlbionConfig(message.guild.id, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Alliance Role Updated')
        .setDescription(`Alliance registrations will assign ${role}`)
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Subcommand: alliance-role-enabled
    if (subcommand === 'alliance-role-enabled') {
      const enabledValue = args[1]?.toLowerCase();
      if (!['true', 'false'].includes(enabledValue)) {
        await message.reply(`❌ Usage: \`${prefix}set alliance-role-enabled <true|false>\``);
        return;
      }

      config.allianceRoleEnabled = enabledValue === 'true';
      saveAlbionConfig(message.guild.id, config);

      await message.reply(`✅ Alliance role assignment is now **${config.allianceRoleEnabled ? 'enabled' : 'disabled'}**.`);
      return;
    }

    // Subcommand: guild
    if (subcommand === 'guild') {
      const region = args[1]?.toLowerCase();
      const guildName = args.slice(2).join(' ');

      if (!region || !guildName) {
        await message.reply(`❌ Usage: \`${prefix}set guild <region> <guild_name>\`\nRegions: americas, europe, asia`);
        return;
      }

      if (!['americas', 'europe', 'asia'].includes(region)) {
        await message.reply('❌ Invalid region. Valid regions: americas, europe, asia');
        return;
      }

      config.albionRegion = region;
      config.albionGuildName = guildName;
      saveAlbionConfig(message.guild.id, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Guild Configuration Updated')
        .addFields(
          { name: 'Region', value: region.toUpperCase(), inline: true },
          { name: 'Guild Name', value: guildName, inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Subcommand: register-role
    if (subcommand === 'register-role') {
      const role = message.mentions.roles.first();

      if (!role) {
        await message.reply(`❌ Usage: \`${prefix}set register-role @role\``);
        return;
      }

      config.registerRoleId = role.id;
      saveAlbionConfig(message.guild.id, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Register Role Updated')
        .setDescription(`Verified members will receive ${role}`)
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Subcommand: guild-tag
    if (subcommand === 'guild-tag') {
      const tag = args[1];

      if (!tag) {
        await message.reply(`❌ Usage: \`${prefix}set guild-tag <tag>\``);
        return;
      }

      config.guildTag = tag;
      saveAlbionConfig(message.guild.id, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Guild Tag Updated')
        .setDescription(`Guild tag set to: **${tag}**`)
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Subcommand: nickname-format
    if (subcommand === 'nickname-format') {
      const format = args.slice(1).join(' ');

      if (!format) {
        await message.reply(`❌ Usage: \`${prefix}set nickname-format <format>\`\nExample: \`${prefix}set nickname-format {tag} {ign}\``);
        return;
      }

      if (format.length > 32) {
        await message.reply('❌ Nickname format is too long (max 32 characters).');
        return;
      }

      config.nicknameFormat = format;
      saveAlbionConfig(message.guild.id, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Nickname Format Updated')
        .setDescription(
          `**Format:** ${format}\n\n` +
          '**Available variables:**\n' +
          '• `{ign}` - In-game name\n' +
          '• `{tag}` - Guild tag\n' +
          '• `{guild}` - Guild name\n' +
          '• `{region}` - Region'
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Subcommand: alliance-nickname-format
    if (subcommand === 'alliance-nickname-format') {
      const format = args.slice(1).join(' ');

      if (!format) {
        await message.reply(`❌ Usage: \`${prefix}set alliance-nickname-format <format>\`\nExample: \`${prefix}set alliance-nickname-format [{allianceTag}] | {playerName}\``);
        return;
      }

      if (format.length > 64) {
        await message.reply('❌ Alliance nickname format is too long (max 64 characters).');
        return;
      }

      config.allianceNicknameFormat = format;
      saveAlbionConfig(message.guild.id, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Alliance Nickname Format Updated')
        .setDescription(
          `**Format:** ${format}\n\n` +
          '**Available variables:**\n' +
          '• `{allianceTag}` - Alliance tag\n' +
          '• `{allianceName}` - Alliance name\n' +
          '• `{playerName}` - In-game name'
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Subcommand: alliance-nickname-enabled
    if (subcommand === 'alliance-nickname-enabled') {
      const enabledValue = args[1]?.toLowerCase();
      if (!['true', 'false'].includes(enabledValue)) {
        await message.reply(`❌ Usage: \`${prefix}set alliance-nickname-enabled <true|false>\``);
        return;
      }

      config.allianceNicknameEnabled = enabledValue === 'true';
      saveAlbionConfig(message.guild.id, config);

      await message.reply(`✅ Alliance nickname updates are now **${config.allianceNicknameEnabled ? 'enabled' : 'disabled'}**.`);
      return;
    }

    // Subcommand: alliance-nickname-overwrite
    if (subcommand === 'alliance-nickname-overwrite') {
      const enabledValue = args[1]?.toLowerCase();
      if (!['true', 'false'].includes(enabledValue)) {
        await message.reply(`❌ Usage: \`${prefix}set alliance-nickname-overwrite <true|false>\``);
        return;
      }

      config.allianceNicknameOverwrite = enabledValue === 'true';
      saveAlbionConfig(message.guild.id, config);

      await message.reply(`✅ Alliance nickname overwrite is now **${config.allianceNicknameOverwrite ? 'enabled' : 'disabled'}**.`);
      return;
    }

    await message.reply(`❌ Unknown subcommand. Use \`${prefix}set\` to see available options.`);
    return;
  }

  // !config command - View Albion configuration
  if (command === 'config') {
    const config = loadAlbionConfig(message.guild.id);
    const validation = validateAlbionConfig(config);

    const statusEmoji = validation.valid ? '✅' : '⚠️';
    const statusText = validation.valid ? 'Complete' : `Incomplete (Missing: ${validation.missing.join(', ')})`;

    const embed = new EmbedBuilder()
      .setColor(validation.valid ? 0x57F287 : 0xFEE75C)
      .setTitle('⚙️ Albion Guild Verification Configuration')
      .addFields(
        { name: 'Status', value: `${statusEmoji} ${statusText}`, inline: false },
        { name: 'Region', value: config.albionRegion || '*Not set*', inline: true },
        { name: 'Guild Name', value: config.albionGuildName || '*Not set*', inline: true },
        { name: 'Register Role', value: config.registerRoleId ? `<@&${config.registerRoleId}>` : '*Not set*', inline: true },
        { name: 'Guild Tag', value: config.guildTag || '*Not set*', inline: true },
        { name: 'Nickname Format', value: config.nicknameFormat || '*Default*', inline: false },
        { name: 'Alliance Role Assignment', value: config.allianceRoleEnabled ? 'Enabled' : 'Disabled', inline: true },
        { name: 'Alliance Role(s)', value: (config.allianceRoleIds || []).length > 0 ? config.allianceRoleIds.map(id => `<@&${id}>`).join(', ') : '*Not set*', inline: false },
        { name: 'Alliance Nickname Updates', value: config.allianceNicknameEnabled ? 'Enabled' : 'Disabled', inline: true },
        { name: 'Alliance Nickname Format', value: config.allianceNicknameFormat || '[{allianceTag}] | {playerName}', inline: false },
        { name: 'Alliance Nickname Overwrite', value: config.allianceNicknameOverwrite ? 'Enabled' : 'Disabled', inline: true }
      )
      .setFooter({ text: `Use ${prefix}set to configure these settings` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  // !register command - Register user's Albion character
  if (command === 'register' || command === 'reg') {
    // The region comes from /set guild. A leading region word from the old
    // syntax (!register asia alliance <ign>) is still accepted and ignored.
    const regionArgs = ['americas', 'europe', 'asia'];
    const rest = regionArgs.includes(args[0]?.toLowerCase()) ? args.slice(1) : args;
    const hasExplicitType = ['alliance', 'guild'].includes(rest[0]?.toLowerCase());
    const registerType = hasExplicitType ? rest[0].toLowerCase() : 'guild';
    const ign = (hasExplicitType ? rest.slice(1) : rest).join(' ');
    const region = loadAlbionConfig(message.guild.id).albionRegion;

    if (!ign) {
      await message.reply(
        `❌ Usage: \`${prefix}register <ign>\` (defaults to Guild)\n` +
        `or \`${prefix}register <alliance|guild> <ign>\`\n` +
        `**Examples:** \`${prefix}register MyCharName\`, \`${prefix}register alliance MyCharName\``
      );
      return;
    }

    if (!region) {
      await message.reply('❌ Registration is not set up on this server yet. Ask an admin to run `/set guild`.');
      return;
    }

    const loadingMsg = await message.reply('⏳ Verifying your character with Albion API...');

    try {
      const result = await registerUser(message.guild, message.author.id, region, ign, null, registerType);

      if (!result.success) {
        // Handle multiple matches
        if (result.error === 'MULTIPLE_MATCHES') {
          let matchesList = `⚠️ **${result.message}**\n\n`;
          result.players.forEach((player, index) => {
            const guildInfo = player.GuildName ? `Guild: ${player.GuildName}` : 'Guild: None';
            matchesList += `${index + 1}. **${player.Name}** (Player ID: ${player.Id})\n   ${guildInfo}\n\n`;
          });
          matchesList += 'Several characters share that name. Use the **Register** button on the member hub (or `/register`) and pick yours from the list.';
          
          await loadingMsg.edit(matchesList);
          return;
        }

        let errorMessage = `❌ Registration failed: ${result.message}`;
        
        if (result.error === 'ALREADY_REGISTERED') {
          errorMessage = `❌ ${result.message}`;
        } else if (result.error === 'IGN_ALREADY_REGISTERED') {
          errorMessage = `❌ ${result.message}`;
        } else if (result.error === 'PLAYER_NOT_FOUND') {
          errorMessage = `❌ Player **${ign}** not found in **${region}** region.\n\nPlease check:\n• Spelling of your in-game name\n• Selected region is correct`;
        } else if (result.error === 'NO_ALLIANCE') {
          errorMessage = `❌ Player **${ign}** is not in any alliance.\n\nYou must join an alliance in-game first, then register.`;
        } else if (result.error === 'NO_GUILD') {
          errorMessage = `❌ Player **${ign}** is not in any guild.\n\nYou must join the guild in-game first, then register.`;
        } else if (result.error === 'GUILD_MISMATCH') {
          errorMessage = `❌ ${result.message}\n\nYou must be in the correct guild to register.`;
        } else if (result.error === 'ALLIANCE_MISMATCH') {
          errorMessage = `❌ ${result.message}\n\nYou must be in our allied alliance to register as Alliance.`;
        } else if (result.error === 'GUILD_NOT_FOUND' || result.error === 'GUILD_NOT_IN_ALLIANCE') {
          errorMessage = `❌ ${result.message}\n\nPlease contact an administrator.`;
        } else if (result.error === 'INCOMPLETE_CONFIG') {
          errorMessage = `❌ ${result.message}`;
        }

        await loadingMsg.edit(errorMessage);
        return;
      }

      // Success
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Registration Successful')
        .setDescription(result.message)
        .addFields(
          { name: 'In-Game Name', value: result.data.ign, inline: true },
          { name: 'Type', value: registerType.toUpperCase(), inline: true },
          { name: 'Region', value: region.toUpperCase(), inline: true }
        )
        .setTimestamp();

      if (result.data.guild) {
        embed.addFields({ name: 'Guild', value: result.data.guild, inline: true });
      }

      if (result.data.alliance) {
        embed.addFields({ name: 'Alliance', value: result.data.alliance, inline: true });
      }

      if (result.data.roleAssigned) {
        embed.addFields({ name: 'Role', value: `✅ ${result.data.roleName || 'Assigned'}`, inline: true });
      } else if (result.data.roleWarning) {
        embed.addFields({ name: 'Role', value: `⚠️ ${result.data.roleWarning}`, inline: false });
      }

      if (result.data.nicknameApplied) {
        embed.addFields({ name: 'Nickname', value: `✅ ${result.data.nickname}`, inline: false });
      } else if (result.data.nicknameWarning) {
        embed.addFields({ name: 'Nickname', value: `⚠️ ${result.data.nicknameWarning}`, inline: false });
      }

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('Error in !register command:', error);
      await loadingMsg.edit('❌ An unexpected error occurred during registration.');
    }
    
    return;
  }

  // !unregister command - Unregister user's character
  if (command === 'unregister' || command === 'unreg') {
    const loadingMsg = await message.reply('⏳ Processing your unregistration...');

    try {
      const unregisterAttempts = await Promise.all([
        unregisterUser(message.guild, message.author.id, 'alliance'),
        unregisterUser(message.guild, message.author.id, 'guild')
      ]);

      const successful = unregisterAttempts.filter((entry) => entry.success);

      if (successful.length === 0) {
        await loadingMsg.edit('❌ You are not registered in the system.');
        return;
      }

      const result = successful[0];
      const removedTypes = successful
        .map((entry) => (entry.data?.registerType || 'guild').toUpperCase())
        .join(', ');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('✅ Unregistered Successfully')
        .setDescription('Your registration has been removed from the verification system.')
        .addFields(
          { name: 'Previous IGN', value: result.data.ign, inline: true },
          { name: 'Removed Type(s)', value: removedTypes, inline: true },
          { name: 'Role Removed', value: result.data.roleRemoved ? '✅ Yes' : '⚠️ No', inline: true },
          { name: 'Nickname Reset', value: result.data.nicknameReset ? '✅ Yes' : '⚠️ No', inline: true }
        )
        .setTimestamp();

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('Error in !unregister command:', error);
      await loadingMsg.edit('❌ An unexpected error occurred during unregistration.');
    }
    
    return;
  }

  // !forceunregister command - Force unregister by IGN (Admin only)
  if (command === 'forceunregister' || command === 'forceunreg') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply('❌ You need Administrator permission to use this command.');
      return;
    }

    const ign = args.join(' ');

    if (!ign) {
      await message.reply(
        `❌ Usage: \`${prefix}forceunregister <ign>\`\n` +
        `**Example:** \`${prefix}forceunregister Phresh\``
      );
      return;
    }

    const loadingMsg = await message.reply('⏳ Finding and unregistering player...');

    try {
      // Find matching users by IGN
      const matchedUsers = findAlbionUsersByIGN(message.guild.id, ign);
      
      if (!matchedUsers || matchedUsers.length === 0) {
        await loadingMsg.edit(`❌ No registration found for IGN: **${ign}**`);
        return;
      }

      const unregisterResults = [];
      for (const userData of matchedUsers) {
        const targetDiscordId = userData.discord_user_id || userData.discordId;
        const targetType = userData.register_type || userData.registerType || 'guild';
        const result = await unregisterUser(message.guild, targetDiscordId, targetType);
        unregisterResults.push({ userData, result, targetType });
      }

      const successful = unregisterResults.filter((entry) => entry.result.success);
      if (successful.length === 0) {
        await loadingMsg.edit('❌ Failed to unregister matched player record(s).');
        return;
      }

      const sample = successful[0];
      const removedUsers = successful
        .map((entry) => {
          const uid = entry.userData.discord_user_id || entry.userData.discordId;
          const type = (entry.targetType || 'guild').toUpperCase();
          return `<@${uid}> (${type})`;
        })
        .join(', ');

      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('⚠️ Force Unregistered')
        .setDescription('Successfully force-unregistered matching player record(s).')
        .addFields(
          { name: 'IGN', value: sample.result.data.ign, inline: true },
          { name: 'Removed Record(s)', value: removedUsers, inline: false },
          { name: 'Role Removed', value: sample.result.data.roleRemoved ? '✅ Yes' : '⚠️ No', inline: true },
          { name: 'Nickname Reset', value: sample.result.data.nicknameReset ? '✅ Yes' : '⚠️ No', inline: true }
        )
        .setTimestamp();

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('Error in !forceunregister command:', error);
      await loadingMsg.edit('❌ An unexpected error occurred during force unregistration.');
    }
    
    return;
  }

  // !purge command - Remove users no longer in guild (Admin only)
  if (command === 'purge') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply('❌ You need Administrator permission to use this command.');
      return;
    }

    const purgeType = args[0]?.toLowerCase();
    const subcommand = args[1]?.toLowerCase();

    // New alliance purge flow: !purge alliance confirm
    if (purgeType === 'alliance') {
      if (subcommand !== 'confirm') {
        await message.reply(
          `⚠️ **WARNING:** This will remove all alliance registrations and Alliance Member roles.\n\n` +
          `To proceed, use: \`${prefix}purge alliance confirm\``
        );
        return;
      }

      const loadingMsg = await message.reply('⏳ Purging alliance registrations...');

      try {
        const result = await purgeUsers(message.guild, 'alliance');

        if (!result.success) {
          await loadingMsg.edit(`❌ Purge failed: ${result.message}`);
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🗑️ Alliance Purge Complete')
          .addFields(
            { name: 'Registrations Checked', value: String(result.checked), inline: true },
            { name: 'Removed', value: String(result.removed), inline: true },
            { name: 'Valid', value: String(result.valid || 0), inline: true },
            { name: 'Errors', value: String(result.errors), inline: true }
          )
          .setTimestamp();

        await loadingMsg.edit({ content: null, embeds: [embed] });
      } catch (error) {
        console.error('Error in !purge alliance command:', error);
        await loadingMsg.edit('❌ An unexpected error occurred during alliance purge.');
      }

      return;
    }

    if (purgeType !== 'confirm') {
      await message.reply(
        `⚠️ **WARNING:** This will check all registered members and remove those no longer in the guild!\n\n` +
        `To proceed, use: \`${prefix}purge confirm\`\n` +
        `Alliance purge: \`${prefix}purge alliance confirm\``
      );
      return;
    }

    const loadingMsg = await message.reply('⏳ Starting purge... This may take a while.');

    try {
      const result = await purgeUsers(message.guild);

      if (!result.success) {
        await loadingMsg.edit(`❌ Purge failed: ${result.message}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🗑️ Purge Complete')
        .addFields(
          { name: 'Members Checked', value: String(result.checked), inline: true },
          { name: 'Removed', value: String(result.removed), inline: true },
          { name: 'Valid', value: String(result.valid), inline: true },
          { name: 'Errors', value: String(result.errors), inline: true }
        )
        .setTimestamp();

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('Error in !purge command:', error);
      await loadingMsg.edit('❌ An unexpected error occurred during purge.');
    }

    return;
  }

  // !registered command - List members registered with their Albion IGN (Admin only)
  if (command === 'registered') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply('❌ You need Administrator permission to use this command.');
      return;
    }

    const filterType = args[0]?.toLowerCase() || 'all';
    if (!['all', 'guild', 'alliance'].includes(filterType)) {
      await message.reply(`❌ Usage: \`${prefix}registered [all|guild|alliance]\``);
      return;
    }

    const guildEntries = filterType === 'alliance' ? [] : getAllAlbionUsers(message.guild.id, 'guild', true);
    const allianceEntries = filterType === 'guild' ? [] : getAllAlbionUsers(message.guild.id, 'alliance', true);
    const { embed, components } = buildRegisteredPage({ guild: guildEntries, alliance: allianceEntries }, filterType, 0);

    await message.reply({ embeds: [embed], components });
    return;
  }
}
