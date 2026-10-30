import { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import axios from 'axios';
import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../../utils.js';
import { deposit, withdraw, getBalance, getActiveUsers, clearUser, clearAll, CURRENCY } from '../systems/bank/bank.js';
import { loadPermissions, savePermissions } from '../database/guildData.js';
import { hasPermissionSlash } from '../utils/permissions.js';
import { buildHelpEmbed, buildPaginatedHelpEmbeds, buildHelpNavigationButtons, buildRegisteredListEmbeds, buildTenureListEmbeds } from '../utils/embedBuilder.js';
import { contentState, pendingCreations } from '../config/contentState.js';
import { buildContentEmbed, buildContentComponents, buildSizeSelector, autoAssignFillPlayers, getRoleDisplayName } from '../services/contentService.js';
import { savePanels, loadPanels } from '../systems/ticket/ticket-db.js';
import { getTicketStats, ticketSystemHealthCheck } from '../systems/ticket/ticket-utils.js';
import { unregisterUser, purgeUsers } from '../systems/albion/albion.js';
import { buildTypePanel } from '../systems/albion/register-ui.js';
import { applyTiers, getSortedTiers } from '../systems/albion/tiers.js';
import { buildHubPanel, buildBalanceBody, buildUnregisterBody } from '../systems/hub/member-hub.js';
import { loadAlbionConfig, saveAlbionConfig, validateAlbionConfig, findAlbionUsersByIGN, getAllAlbionUsers } from '../systems/albion/albion-db.js';

export async function handleSlashCommands(req, res, client) {
  const { name } = req.body.data;

  // "/utc" command - Display current UTC time (Albion Online in-game time)
  if (name === 'utc') {
    const now = new Date();
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const utcTime = `${hours}:${minutes}:${seconds}`;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(`⏰ UTC Time Now: **${utcTime}**`);

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [embed.toJSON()]
      },
    });
  }

  // "/info" command - Search for Albion Online player across all regions
  if (name === 'info') {
    const playerName = req.body.data.options[0].value;

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
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Player **${playerName}** not found in any region.`,
            flags: 64 // EPHEMERAL
          },
        });
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

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()]
        },
      });

    } catch (error) {
      console.error('Error fetching player info:', error);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ An error occurred while fetching player information. Please try again later.',
          flags: 64
        },
      });
    }
  }

  // "/content" command - Manage content callouts
  if (name === 'content') {
    console.log('🎮 Executing /content command');
    const subcommand = req.body.data.options[0].name;
    console.log(`   Subcommand: ${subcommand}`);
    const context = req.body.context;
    const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
    const member = req.body.member;
    const guildId = req.body.guild_id;

    // Check Content Admin permission for create, adduser, removeuser
    if (['create', 'adduser', 'removeuser'].includes(subcommand)) {
      if (!hasPermissionSlash(member, 'contentAdminRoles', guildId)) {
        return res.send({          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You need Administrator permission or an authorized Content Admin role to use this command.',
            flags: 64
          },
        });
      }
    }

    // Subcommand: create — step 1: show party size dropdown (ephemeral)
    if (subcommand === 'create') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      pendingCreations.set(userId, {
        partySize: null,
        method: null,
        assignedRoles: [],
        customRoleNames: {},
        presetTank: [],
        presetHeal: [],
        presetSupport: [],
        presetDpsG1: [],
        presetDpsG2: [],
        presetDpsG3: [],
        presetDpsG4: [],
      });

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '**Step 1 of 4** — How many party slots?',
          flags: 64,
          components: buildSizeSelector().map(r => r.toJSON())
        }
      });
    }

    // Subcommand: adduser
    if (subcommand === 'adduser') {
      if (!contentState.active) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ No active content callout! Use `/content create` first.',
            flags: 64
          },
        });
      }

      const targetUserId = req.body.data.options[0].options[0].value;
      const roleOption = req.body.data.options[0].options[1].value;

      // Validate role against current active roles
      if (!contentState.activeRoles.includes(roleOption)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ The role **${roleOption}** is not part of this content callout!\n\nActive roles: ${contentState.activeRoles.map(r => `\`${r}\``).join(', ')}`,
            flags: 64
          },
        });
      }

      if (contentState.roles[roleOption]) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ The **${roleOption.toUpperCase()}** slot is already filled!`,
            flags: 64
          },
        });
      }

      contentState.roles[roleOption] = targetUserId;
      await autoAssignFillPlayers(client);

      const embed = buildContentEmbed();
      try {
        await DiscordRequest(`channels/${contentState.channelId}/messages/${contentState.messageId}`, {
          method: 'PATCH',
          body: { embeds: [embed.toJSON()] },
        });
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ <@${targetUserId}> added to **${roleOption.toUpperCase()}**`,
            flags: 64
          },
        });
      } catch (err) {
        console.error('Error updating message:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Failed to update the content message.', flags: 64 },
        });
      }
    }

    // Subcommand: removeuser
    if (subcommand === 'removeuser') {
      if (!contentState.active) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ No active content callout! Use `/content create` first.', flags: 64 },
        });
      }

      const removeOpts = req.body.data.options[0].options || [];
      const userOption = removeOpts.find(o => o.name === 'user')?.value;
      const slotOption = removeOpts.find(o => o.name === 'slot')?.value;

      if (!userOption && slotOption == null) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Provide either `user` (mention) or `slot` (slot number).', flags: 64 },
        });
      }

      let roleKey = null;
      let removedUserId = null;

      if (slotOption != null) {
        // Remove by slot number (1-based)
        const idx = parseInt(slotOption) - 1;
        if (idx < 0 || idx >= contentState.activeRoles.length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `❌ Slot **${slotOption}** is out of range. There are **${contentState.activeRoles.length}** slots.`, flags: 64 },
          });
        }
        roleKey = contentState.activeRoles[idx];
        if (!contentState.roles[roleKey]) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `❌ Slot **${slotOption}** (${getRoleDisplayName(roleKey, contentState.customRoleNames)}) is already empty.`, flags: 64 },
          });
        }
        removedUserId = contentState.roles[roleKey];
      } else {
        // Remove by Discord user — find which slot they're in
        roleKey = contentState.activeRoles.find(k => contentState.roles[k] === userOption) || null;

        if (!roleKey) {
          // Check fill list
          const fillIdx = contentState.fill.indexOf(userOption);
          if (fillIdx > -1) {
            contentState.fill.splice(fillIdx, 1);
            const embed = buildContentEmbed();
            try {
              await DiscordRequest(`channels/${contentState.channelId}/messages/${contentState.messageId}`, {
                method: 'PATCH',
                body: { embeds: [embed.toJSON()] },
              });
            } catch (err) {
              console.error('Error updating message:', err);
            }
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: `✅ Removed <@${userOption}> from the **Fill** list.`, flags: 64 },
            });
          }
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `❌ <@${userOption}> is not signed up in any slot or the fill list.`, flags: 64 },
          });
        }
        removedUserId = userOption;
      }

      contentState.roles[roleKey] = null;
      await autoAssignFillPlayers(client);

      const slotName = getRoleDisplayName(roleKey, contentState.customRoleNames);
      const slotNum = contentState.activeRoles.indexOf(roleKey) + 1;
      const embed = buildContentEmbed();
      try {
        await DiscordRequest(`channels/${contentState.channelId}/messages/${contentState.messageId}`, {
          method: 'PATCH',
          body: { embeds: [embed.toJSON()] },
        });
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `✅ Removed <@${removedUserId}> from slot **#${slotNum} — ${slotName}**.`, flags: 64 },
        });
      } catch (err) {
        console.error('Error updating message:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Failed to update the content message.', flags: 64 },
        });
      }
    }

  }

  // "/regear" command - Manage regear threads (unified CTA/FF)
  if (name === 'regear') {
    console.log('⚔️ Executing /regear command');
    
    const subcommand = req.body.data.options[0].name;
    const member = req.body.member;
    const guildId = req.body.guild_id;

    // Subcommand: create
    if (subcommand === 'create') {
      console.log('   Creating new regear thread...');

      // Any regear thread now requires the same permission /regear close already
      // requires - there's no more "type" to conditionally gate on since the
      // title is free text (previously only content_type:cta was gated; ff was
      // open to everyone).
      if (!hasPermissionSlash(member, 'ctaRegearRoles', guildId)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You need Administrator permission or an authorized role to use this command.',
            flags: 64
          },
        });
      }

      const createOptions = req.body.data.options[0].options;
      const threadTitle = createOptions.find(o => o.name === 'title').value;
      const time = createOptions.find(o => o.name === 'time').value;
      const notice = createOptions.find(o => o.name === 'notice')?.value || null;
      const channelId = req.body.channel_id;

      // Defer the response
      console.log('   ⏳ Deferring response...');
      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: 64
        }
      });

      try {
        // Create a thread in the channel
        console.log(`   📝 Creating regear thread: ${threadTitle}...`);
        const threadResponse = await DiscordRequest(`channels/${channelId}/threads`, {
          method: 'POST',
          body: {
            name: threadTitle,
            type: 11,
            auto_archive_duration: 1440
          },
        });
        const threadData = await threadResponse.json();
        const threadId = threadData.id;
        console.log(`   ✅ Thread created: ${threadId}`);

        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle(`⚔️ ${threadTitle}`)
          .setDescription(
            `**SEND REGEAR HERE**\n**Time:** ${time}` +
            (notice ? `\n**Notice:** ${notice}` : '')
          );

        // Post the message in the thread
        const registerRoleId = loadAlbionConfig(guildId).registerRoleId;
        await DiscordRequest(`channels/${threadId}/messages`, {
          method: 'POST',
          body: {
            ...(registerRoleId ? { content: `<@&${registerRoleId}>` } : {}),
            embeds: [embed.toJSON()]
          },
        });

        // Follow up with success message
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: `✅ Regear thread created: **${threadTitle}**`,
            flags: 64
          },
        });
        console.log(`   ✅ /regear create completed successfully`);

      } catch (err) {
        console.error(`   ❌ Error creating regear thread:`, err);

        // Follow up with error message
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: `❌ Failed to create regear thread.`,
            flags: 64
          },
        });
      }
      return;
    }

    // Subcommand: close
    if (subcommand === 'close') {
      console.log('   Closing regear thread...');

      // Check permission for regear close
      if (!hasPermissionSlash(member, 'ctaRegearRoles', guildId)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You need Administrator permission or an authorized role to close regear threads.',
            flags: 64
          },
        });
      }

      const channelId = req.body.channel_id;

      // Defer the response
      console.log('   ⏳ Deferring response...');
      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: 64
        }
      });

      try {
        // Get channel/thread info
        const channelResponse = await DiscordRequest(`channels/${channelId}`, {
          method: 'GET'
        });
        const channelData = await channelResponse.json();

        // Check if this is a thread
        if (channelData.type !== 11 && channelData.type !== 12) {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: {
              content: '❌ This command must be used inside a thread.',
              flags: 64
            },
          });
          return;
        }

        const currentName = channelData.name;

        // Check if already closed (idempotency)
        if (currentName.includes('[✓]') || currentName.includes('(REGEARED)') || 
            currentName.includes('(CLEARED)') || currentName.includes('(COMPLETED)')) {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: {
              content: '⚠️ This thread is already closed.',
              flags: 64
            },
          });
          return;
        }

        // Rename thread with [✓] suffix
        const newName = `${currentName} [✓]`;
        
        // Update thread: rename and lock
        await DiscordRequest(`channels/${channelId}`, {
          method: 'PATCH',
          body: {
            name: newName.substring(0, 100),
            locked: true,
            archived: false
          },
        });

        console.log(`   ✅ Thread closed: ${currentName} → ${newName}`);

        // Try to send follow-up message
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: {
              content: `✅ Thread closed and locked.`,
              flags: 64
            },
          });
        } catch (webhookErr) {
          console.log('   ⚠️ Thread closed successfully but could not send confirmation message (token expired)');
        }

      } catch (err) {
        console.error('   ❌ Error closing regear thread:', err);

        // Try to send error message
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: {
              content: '❌ Failed to close regear thread.',
              flags: 64
            },
          });
        } catch (webhookErr) {
          console.log('   ⚠️ Could not send error message (token expired)');
        }
      }
      return;
    }
  }

  // "/bank" command - Bank economy system
  if (name === 'bank') {
    console.log('💰 Executing /bank command');
    const subcommand = req.body.data.options[0].name;
    console.log(`   Subcommand: ${subcommand}`);
    const context = req.body.context;
    const userId = context === 0 ? req.body.member?.user?.id : req.body.user?.id;
    const member = req.body.member;
    const guildId = req.body.guild_id;

    // Bank commands only work in guilds
    if (!guildId) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ Bank commands can only be used in a server.',
          flags: 64
        },
      });
    }

    // Check admin permission for deposit/withdraw
    const hasAdminPermission = hasPermissionSlash(member, 'bankAdminRoles', guildId);

    // Subcommand: deposit
    if (subcommand === 'deposit') {
      if (!hasAdminPermission) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You need Administrator permission or an authorized role to use this command.',
            flags: 64
          },
        });
      }

      const targetUserId = req.body.data.options[0].options[0].value;
      const amount = req.body.data.options[0].options[1].value;

      const result = deposit(guildId, targetUserId, amount);

      if (!result.success) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ ${result.error}`,
            flags: 64
          },
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('💰 Deposit Successful')
        .setDescription(
          `**User:** <@${targetUserId}>\n` +
          `**Deposited:** ${CURRENCY}${amount.toLocaleString()}\n` +
          `**New Balance:** ${CURRENCY}${result.newBalance.toLocaleString()}`
        )
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()]
        },
      });
    }

    // Subcommand: withdraw
    if (subcommand === 'withdraw') {
      if (!hasAdminPermission) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You need Administrator permission or an authorized role to use this command.',
            flags: 64
          },
        });
      }

      const targetUserId = req.body.data.options[0].options[0].value;
      const amount = req.body.data.options[0].options[1].value;

      const result = withdraw(guildId, targetUserId, amount);

      if (!result.success) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ ${result.error}`,
            flags: 64
          },
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('💸 Withdrawal Successful')
        .setDescription(
          `**User:** <@${targetUserId}>\n` +
          `**Withdrawn:** ${CURRENCY}${amount.toLocaleString()}\n` +
          `**New Balance:** ${CURRENCY}${result.newBalance.toLocaleString()}`
        )
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()]
        },
      });
    }

    // Subcommand: balance
    if (subcommand === 'balance') {
      const targetUserId = req.body.data.options[0]?.options?.[0]?.value || userId;
      
      if (!targetUserId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Unable to determine user for balance check.',
            flags: 64
          },
        });
      }

      const balance = getBalance(guildId, targetUserId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('💰 Bank Balance')
        .setDescription(
          `**User:** <@${targetUserId}>\n` +
          `**Balance:** ${CURRENCY}${balance.toLocaleString()}`
        )
        .setTimestamp();

      // Private reply: balances are nobody else's business, and it cleans itself up
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: active
    if (subcommand === 'active') {
      const activeUsers = getActiveUsers(guildId);

      if (activeUsers.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '📊 No users currently have money in the bank.',
            flags: 64
          },
        });
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

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: clear
    if (subcommand === 'clear') {
      if (!hasAdminPermission) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You need Administrator permission or an authorized role to use this command.',
            flags: 64
          },
        });
      }

      const targetUserId = req.body.data.options[0].options[0].value;
      const result = clearUser(guildId, targetUserId);

      if (!result.success) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ ${result.error}`,
            flags: 64
          },
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle('🗑️ Balance Cleared')
        .setDescription(
          `**User:** <@${targetUserId}>\n` +
          `**Cleared Amount:** ${CURRENCY}${result.clearedAmount.toLocaleString()}\n` +
          `**New Balance:** ${CURRENCY}0`
        )
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()]
        },
      });
    }

    // Subcommand: clearall
    if (subcommand === 'clearall') {
      if (!hasAdminPermission) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You need Administrator permission or an authorized role to use this command.',
            flags: 64
          },
        });
      }

      const result = clearAll(guildId);

      if (!result.success) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ ${result.error}`,
            flags: 64
          },
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle('🗑️ All Balances Cleared')
        .setDescription(
          `**Cleared Users:** ${result.clearedUsers}\n` +
          `**All balances have been reset to ${CURRENCY}0**`
        )
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()]
        },
      });
    }
  }

  // "/ticket" command - Ticket system management (Admin only)
  if (name === 'ticket') {
    console.log('🎫 Executing /ticket command');
    const subcommand = req.body.data.options[0].name;
    const member = req.body.member;
    const guildId = req.body.guild_id;

    // Check for administrator permission
    if (!member || !member.permissions || (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) !== BigInt(PermissionFlagsBits.Administrator)) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ You need Administrator permission to use this command.',
          flags: 64
        },
      });
    }

    // Subcommand: setup - saves the single 'apply' panel and posts the button here
    if (subcommand === 'setup') {
      const options = req.body.data.options[0].options;
      const get = (n) => options.find(o => o.name === n)?.value;
      const ticketCategoryId = get('forum');
      const staffRoleId = get('staff_role');
      const transcriptChannelId = get('transcript_channel');
      const pingRoleId = get('ping_role') || staffRoleId;
      const customMessage = get('message') || null;

      try {
        const forumChannel = await client.channels.fetch(ticketCategoryId).catch(() => null);
        if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ Pick a Forum channel for applications.', flags: 64 },
          });
        }

        const panelId = 'apply';
        const panels = await loadPanels(guildId);
        const newPanel = {
          panelId,
          ticketTypeName: 'Apply',
          ticketCategoryId,
          pingRoleId,
          staffRoleIds: [staffRoleId],
          approveRoleId: pingRoleId,
          transcriptChannelId,
          nicknameFormat: '{username}'
        };
        const existingIndex = panels.findIndex(p => p.panelId === panelId);
        if (existingIndex >= 0) {
          panels[existingIndex] = { ...panels[existingIndex], ...newPanel };
        } else {
          panels.push(newPanel);
        }
        await savePanels(guildId, panels);

        const { createApplyPanelMessage } = await import('../systems/ticket/ticket-system.js');
        const channel = await client.channels.fetch(req.body.channel_id);
        await channel.send(createApplyPanelMessage(customMessage));

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ Applications set up. Forum: <#${ticketCategoryId}> • Staff: <@&${staffRoleId}> • Logs: <#${transcriptChannelId}>
The Apply button was posted in this channel.`,
            flags: 64
          },
        });

      } catch (error) {
        console.error('Error setting up ticket panel:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Failed to set up applications. Check the bot can send messages here and read the forum.', flags: 64 },
        });
      }
    }

    // Subcommand: list
    if (subcommand === 'list') {
      try {
        const panels = await loadPanels(guildId);

        if (panels.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ No ticket panels configured for this server.',
              flags: 64
            },
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('🎫 Ticket Panels')
          .setColor(0x5865F2)
          .setTimestamp();

        for (const panel of panels) {
          const fields = [
            `Forum Channel: <#${panel.ticketCategoryId}>`,
            `Ping Role: <@&${panel.pingRoleId}>`,
            `Transcript: <#${panel.transcriptChannelId}>`,
            `Staff Roles: ${panel.staffRoleIds.map(id => `<@&${id}>`).join(', ')}`
          ];

          embed.addFields({
            name: `${panel.ticketTypeName} (${panel.panelId})`,
            value: fields.join('\n'),
            inline: false
          });
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [embed.toJSON()],
            flags: 64
          },
        });

      } catch (error) {
        console.error('Error listing ticket panels:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Failed to list ticket panels.',
            flags: 64
          },
        });
      }
    }

    // Subcommand: delete
    if (subcommand === 'delete') {
      const panelId = 'apply';

      try {
        const panels = await loadPanels(guildId);
        const index = panels.findIndex(p => p.panelId === panelId);
        
        if (index === -1) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Panel "${panelId}" not found.`,
              flags: 64
            },
          });
        }

        panels.splice(index, 1);
        await savePanels(guildId, panels);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ Ticket panel "${panelId}" deleted.`,
            flags: 64
          },
        });

      } catch (error) {
        console.error('Error deleting ticket panel:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Failed to delete ticket panel.',
            flags: 64
          },
        });
      }
    }

    // Subcommand: stats
    if (subcommand === 'stats') {
      try {
        const stats = await getTicketStats(guildId);

        if (!stats) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to retrieve ticket statistics.',
              flags: 64
            },
          });
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

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [embed.toJSON()],
            flags: 64
          },
        });

      } catch (error) {
        console.error('Error getting ticket stats:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Failed to retrieve ticket statistics.',
            flags: 64
          },
        });
      }
    }

    // Subcommand: health
    if (subcommand === 'health') {
      try {
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

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [embed.toJSON()],
            flags: 64
          },
        });

      } catch (error) {
        console.error('Error running health check:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Failed to run health check.',
            flags: 64
          },
        });
      }
    }

    // Subcommand: panel
    if (subcommand === 'panel') {
      try {
        const options = req.body.data.options[0].options || [];
        const panelId = 'apply';
        const customMessage = options.find(o => o.name === 'message')?.value || null;

        // Verify panel exists
        const panels = await loadPanels(guildId);
        const panel = panels.find(p => p.panelId === panelId);

        if (!panel) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Applications are not set up yet. Run `/ticket setup` first.',
              flags: 64
            },
          });
        }

        // Get channel from client
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Could not find guild.',
              flags: 64
            },
          });
        }

        const channelId = req.body.channel_id;
        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Could not find channel.',
              flags: 64
            },
          });
        }

        // Import createApplyPanelMessage function
        const { createApplyPanelMessage } = await import('../systems/ticket/ticket-system.js');
        const panelMessage = createApplyPanelMessage(customMessage);
        await channel.send(panelMessage);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ ${panel.ticketTypeName} panel sent to <#${channelId}>!`,
            flags: 64
          },
        });

      } catch (error) {
        console.error('Error sending ticket panel:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Failed to send ticket panel.',
            flags: 64
          },
        });
      }
    }

    // Subcommand: reset
    if (subcommand === 'reset') {
      const confirmed = req.body.data.options[0].options?.find(o => o.name === 'confirm')?.value === true;
      if (!confirmed) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '⚠️ Set `confirm:true` to execute the reset. This deletes all tickets and transcripts for this server.',
            flags: 64
          },
        });
      }

      try {
        const { resetTicketData } = await import('../systems/ticket/ticket-db.js');

        // Reset all ticket data
        await resetTicketData(guildId);

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

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [embed.toJSON()],
            flags: 64
          },
        });

      } catch (error) {
        console.error('Error resetting ticket data:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Failed to reset ticket data.',
            flags: 64
          },
        });
      }
    }
  }

  // "/help" command - Show available commands with pagination
  if (name === 'help') {
    console.log('❓ Executing /help command');
    const guildId = req.body.guild_id;
    const member = req.body.member;
    
    const pages = buildPaginatedHelpEmbeds(member, guildId, true);
    
    // If only one page, send without buttons
    if (pages.length === 1) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [pages[0].toJSON()],
          flags: 64
        },
      });
    }
    
    // Multiple pages - send with navigation buttons
    const buttons = buildHelpNavigationButtons(0, pages.length);
    
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [pages[0].toJSON()],
        components: [buttons.toJSON()],
        flags: 64
      },
    });
  }

  // "/perms" command - Manage role permissions (Admin only)
  if (name === 'perms') {
    console.log('🔐 Executing /perms command');
    const member = req.body.member;
    const subcommand = req.body.data.options[0].name;
    
    // Check if user is Discord Administrator
    const isAdmin = member && member.permissions && 
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ You need Administrator permission to manage permissions.',
          flags: 64
        },
      });
    }

    // Subcommand: list
    if (subcommand === 'list') {
      const guildId = req.body.guild_id;
      const permissions = loadPermissions(guildId);
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
        .setFooter({ text: 'Administrators always have access to all commands' })
        .setTimestamp();
      
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: add
    if (subcommand === 'add') {
      const guildId = req.body.guild_id;
      const permType = req.body.data.options[0].options[0].value;
      const roleId = req.body.data.options[0].options[1].value;
      
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
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Invalid permission type.',
            flags: 64
          },
        });
      }

      const permissions = loadPermissions(guildId);

      if (permissions[configKey].includes(roleId)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Role <@&${roleId}> already has ${displayName} permission.`,
            flags: 64
          },
        });
      }
      
      permissions[configKey].push(roleId);
      savePermissions(guildId, permissions);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `✅ Added <@&${roleId}> to ${displayName} permissions.`,
          flags: 64
        },
      });
    }

    // Subcommand: remove
    if (subcommand === 'remove') {
      const guildId = req.body.guild_id;
      const permType = req.body.data.options[0].options[0].value;
      const roleId = req.body.data.options[0].options[1].value;
      
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
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Invalid permission type.',
            flags: 64
          },
        });
      }

      const permissions = loadPermissions(guildId);
      const index = permissions[configKey].indexOf(roleId);
      
      if (index === -1) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Role <@&${roleId}> doesn't have ${displayName} permission.`,
            flags: 64
          },
        });
      }
      
      permissions[configKey].splice(index, 1);
      savePermissions(guildId, permissions);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `✅ Removed <@&${roleId}> from ${displayName} permissions.`,
          flags: 64
        },
      });
    }
  }

  // "/set" command - Configure Albion guild verification (Admin only)
  if (name === 'set') {
    console.log('⚙️ Executing /set command');
    const member = req.body.member;
    const guildId = req.body.guild_id;
    const subcommand = req.body.data.options[0].name;

    // Check for administrator permission
    const isAdmin = member && member.permissions && 
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ You need Administrator permission to use this command.',
          flags: 64
        },
      });
    }

    const config = loadAlbionConfig(guildId);

    // Subcommand: guild
    if (subcommand === 'guild') {
      const region = req.body.data.options[0].options[0].value;
      const guildName = req.body.data.options[0].options[1].value;

      config.albionRegion = region;
      config.albionGuildName = guildName;
      saveAlbionConfig(guildId, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Guild Configuration Updated')
        .addFields(
          { name: 'Region', value: region.toUpperCase(), inline: true },
          { name: 'Guild Name', value: guildName, inline: true }
        )
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: register-role
    if (subcommand === 'register-role') {
      const roleId = req.body.data.options[0].options[0].value;

      config.registerRoleId = roleId;
      saveAlbionConfig(guildId, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Register Role Updated')
        .setDescription(`Verified members will receive <@&${roleId}>`)
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: guild-tag
    if (subcommand === 'guild-tag') {
      const tag = req.body.data.options[0].options[0].value;

      config.guildTag = tag;
      saveAlbionConfig(guildId, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Guild Tag Updated')
        .setDescription(`Guild tag set to: **${tag}**`)
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: nickname-format
    if (subcommand === 'nickname-format') {
      const format = req.body.data.options[0].options[0].value;

      if (format.length > 32) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Nickname format is too long (max 32 characters).',
            flags: 64
          },
        });
      }

      config.nicknameFormat = format;
      saveAlbionConfig(guildId, config);

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

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: alliance-role
    if (subcommand === 'alliance-role') {
      const roleId = req.body.data.options[0].options[0].value;
      config.allianceRoleIds = [roleId];
      config.allianceRoleEnabled = true;
      saveAlbionConfig(guildId, config);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Alliance Role Updated')
        .setDescription(`Alliance registrations will assign <@&${roleId}>`)
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: alliance-role-enabled
    if (subcommand === 'alliance-role-enabled') {
      const enabled = req.body.data.options[0].options[0].value;
      config.allianceRoleEnabled = enabled;
      saveAlbionConfig(guildId, config);

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `✅ Alliance role assignment is now **${enabled ? 'enabled' : 'disabled'}**.`,
          flags: 64
        },
      });
    }

    // Subcommand: alliance-nickname-format
    if (subcommand === 'alliance-nickname-format') {
      const format = req.body.data.options[0].options[0].value;

      if (format.length > 64) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Alliance nickname format is too long (max 64 characters).',
            flags: 64
          },
        });
      }

      config.allianceNicknameFormat = format;
      saveAlbionConfig(guildId, config);

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

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }

    // Subcommand: alliance-nickname-enabled
    if (subcommand === 'alliance-nickname-enabled') {
      const enabled = req.body.data.options[0].options[0].value;
      config.allianceNicknameEnabled = enabled;
      saveAlbionConfig(guildId, config);

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `✅ Alliance nickname updates are now **${enabled ? 'enabled' : 'disabled'}**.`,
          flags: 64
        },
      });
    }

    // Subcommand: alliance-nickname-overwrite
    if (subcommand === 'alliance-nickname-overwrite') {
      const enabled = req.body.data.options[0].options[0].value;
      config.allianceNicknameOverwrite = enabled;
      saveAlbionConfig(guildId, config);

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `✅ Alliance nickname overwrite is now **${enabled ? 'enabled' : 'disabled'}**.`,
          flags: 64
        },
      });
    }
  }

  // "/config" command - View Albion configuration
  if (name === 'config') {
    console.log('📋 Executing /config command');
    const guildId = req.body.guild_id;
    const member = req.body.member;
    const subcommand = req.body.data.options[0].name;

    // Config exposes role IDs and guild settings - admins only
    const isAdmin = member?.permissions &&
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
    if (!isAdmin) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ You need Administrator permission to use this command.', flags: 64 },
      });
    }

    if (subcommand === 'view') {
      const config = loadAlbionConfig(guildId);
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
        .setFooter({ text: 'Use /set to configure these settings' })
        .setTimestamp();

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed.toJSON()],
          flags: 64
        },
      });
    }
  }

  // "/register" command - opens the guided panel (guild/alliance -> name).
  // The region comes from /set guild, so there is nothing for players to type.
  if (name === 'register') {
    console.log('📝 Executing /register command');
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { ...buildTypePanel(loadAlbionConfig(req.body.guild_id)), flags: 64 }
    });
  }

  // "/unregister" command - Unregister user's character
  if (name === 'unregister') {
    console.log('🗑️ Executing /unregister command');
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id || req.body.user?.id;

    res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: 64 }
    });

    let body;
    try {
      const guild = client.guilds.cache.get(guildId);
      body = guild
        ? await buildUnregisterBody(guild, userId)
        : { content: '❌ Failed to fetch guild information.', flags: 64 };
    } catch (error) {
      console.error('Error in /unregister command:', error);
      body = { content: '❌ An unexpected error occurred during unregistration.', flags: 64 };
    }

    await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
      method: 'PATCH',
      body
    });
    return;
  }

  // "/panel" command - post the public member hub (Admin only)
  if (name === 'panel') {
    const member = req.body.member;
    const isAdmin = member?.permissions &&
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);

    if (!isAdmin) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ You need Administrator permission to use this command.', flags: 64 },
      });
    }

    const message = req.body.data.options?.find(o => o.name === 'message')?.value || null;
    try {
      await DiscordRequest(`channels/${req.body.channel_id}/messages`, {
        method: 'POST',
        body: buildHubPanel(message?.replace(/\\n/g, '\n')),
      });
    } catch (error) {
      console.error('Error posting member hub:', error);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Could not post the panel here. Check the bot can send messages in this channel.', flags: 64 },
      });
    }

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '✅ Member hub posted.', flags: 64 },
    });
  }

  // "/forceunregister" command - Force unregister by IGN (Admin only)
  if (name === 'forceunregister') {
    console.log('⚠️ Executing /forceunregister command');
    const member = req.body.member;
    const guildId = req.body.guild_id;
    const ign = req.body.data.options[0].value;

    // Check for administrator permission
    const isAdmin = member && member.permissions && 
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ You need Administrator permission to use this command.',
          flags: 64
        },
      });
    }

    // Defer response
    res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: 64 }
    });

    try {
      const guild = client.guilds.cache.get(guildId);
      
      if (!guild) {
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: '❌ Failed to fetch guild information.',
            flags: 64
          }
        });
        return;
      }

      // Find all matching users by IGN
      const matchedUsers = findAlbionUsersByIGN(guildId, ign);
      
      if (!matchedUsers || matchedUsers.length === 0) {
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: `❌ No registration found for IGN: **${ign}**`,
            flags: 64
          }
        });
        return;
      }

      const unregisterResults = [];
      for (const userData of matchedUsers) {
        const targetDiscordId = userData.discord_user_id || userData.discordId;
        const targetType = userData.register_type || userData.registerType || 'guild';
        const result = await unregisterUser(guild, targetDiscordId, targetType);
        unregisterResults.push({ userData, result, targetType });
      }

      const successful = unregisterResults.filter((entry) => entry.result.success);
      if (successful.length === 0) {
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: '❌ Failed to unregister matched player record(s).',
            flags: 64
          }
        });
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

      // Success
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

      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: {
          embeds: [embed.toJSON()],
          flags: 64
        }
      });

    } catch (error) {
      console.error('Error in /forceunregister command:', error);
      
      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: {
          content: '❌ An unexpected error occurred during force unregistration.',
          flags: 64
        }
      });
    }
    
    return;
  }

  // "/purge" command - Remove users no longer in guild (Admin only)
  if (name === 'purge') {
    console.log('🗑️ Executing /purge command');
    const member = req.body.member;
    const guildId = req.body.guild_id;
    const options = req.body.data.options || [];

    // New schema: /purge type:<alliance|guild> confirm:true
    const purgeType = (options.find(opt => opt.name === 'type')?.value || 'guild').toLowerCase();
    const confirmValue = options.find(opt => opt.name === 'confirm')?.value;

    // Legacy schema support: /purge confirm (subcommand)
    const usesLegacySubcommand = options[0]?.name === 'confirm' && options[0]?.type === 1;

    // Check for administrator permission
    const isAdmin = member && member.permissions && 
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ You need Administrator permission to use this command.',
          flags: 64
        },
      });
    }

    if (usesLegacySubcommand || confirmValue === true) {
      // Defer response - this will take time
      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: 64 }
      });

      try {
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: {
              content: '❌ Failed to fetch guild information.',
              flags: 64
            }
          });
          return;
        }

        // Perform purge
        const result = await purgeUsers(guild, purgeType);

        if (!result.success) {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: {
              content: `❌ Purge failed: ${result.message}`,
              flags: 64
            }
          });
          return;
        }

        // Build result embed
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(purgeType === 'alliance' ? '🗑️ Alliance Purge Complete' : '🗑️ Purge Complete')
          .addFields(
            { name: purgeType === 'alliance' ? 'Registrations Checked' : 'Members Checked', value: String(result.checked), inline: true },
            { name: 'Removed', value: String(result.removed), inline: true },
            { name: 'Valid', value: String(result.valid || 0), inline: true },
            { name: 'Errors', value: String(result.errors), inline: true }
          )
          .setTimestamp();

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            embeds: [embed.toJSON()],
            flags: 64
          }
        });

      } catch (error) {
        console.error('Error in /purge command:', error);
        
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: '❌ An unexpected error occurred during purge.',
            flags: 64
          }
        });
      }
      
      return;
    }

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '⚠️ Confirmation required. Use `/purge type:alliance confirm:true` for alliance cleanup.',
        flags: 64
      }
    });
  }

  if (name === 'registered') {
    console.log('📋 Executing /registered command');
    const member = req.body.member;
    const guildId = req.body.guild_id;
    const options = req.body.data.options || [];
    const filterType = (options.find(opt => opt.name === 'type')?.value || 'all').toLowerCase();

    const isAdmin = member && member.permissions &&
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);

    if (!isAdmin) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ You need Administrator permission to use this command.',
          flags: 64
        },
      });
    }

    if (options.find(opt => opt.name === 'tenure')?.value) {
      const config = loadAlbionConfig(guildId);
      if (!config.registerRoleId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ No register role configured. Use `/set register-role` first.', flags: 64 },
        });
      }

      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: 64 } });

      let body;
      try {
        const guild = client.guilds.cache.get(guildId);
        const members = await guild.members.fetch();
        const records = new Map();
        for (const rec of getAllAlbionUsers(guildId, null, true)) {
          const prev = records.get(rec.discordId);
          // Keep the earliest registration when a user has both guild and alliance records.
          if (!prev || new Date(rec.registeredAt) < new Date(prev.registeredAt)) records.set(rec.discordId, rec);
        }
        const rows = members
          .filter(m => m.roles.cache.has(config.registerRoleId))
          .map(m => ({
            discordId: m.id,
            ign: records.get(m.id)?.ign || null,
            joinedAt: m.joinedAt,
            registeredAt: records.get(m.id)?.registeredAt || null
          }));
        body = { embeds: buildTenureListEmbeds(rows).map(e => e.toJSON()), flags: 64 };
      } catch (err) {
        console.error('❌ Error building tenure list:', err);
        body = { content: '❌ Failed to build the tenure list.', flags: 64 };
      }

      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body
      });
      return;
    }

    const guildEntries = filterType === 'alliance' ? [] : getAllAlbionUsers(guildId, 'guild', true);
    const allianceEntries = filterType === 'guild' ? [] : getAllAlbionUsers(guildId, 'alliance', true);
    const embeds = buildRegisteredListEmbeds({ guild: guildEntries, alliance: allianceEntries });

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: embeds.map((e) => e.toJSON()),
        flags: 64
      },
    });
  }

  if (name === 'tier') {
    console.log('🏅 Executing /tier command');
    const member = req.body.member;
    const guildId = req.body.guild_id;
    const sub = req.body.data.options[0];
    const subOptions = sub.options || [];
    const getOpt = (optName) => subOptions.find(opt => opt.name === optName)?.value;
    const reply = (content) => res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content, flags: 64, allowed_mentions: { parse: [] } },
    });

    const isAdmin = member && member.permissions &&
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
    if (!isAdmin) return reply('❌ You need Administrator permission to use this command.');

    const config = loadAlbionConfig(guildId);
    config.loyaltyTiers = config.loyaltyTiers || [];

    if (sub.name === 'list') {
      const tiers = getSortedTiers(config);
      if (tiers.length === 0) return reply('No tiers set. Use `/tier add`.');
      const lines = tiers.map((t, i) =>
        `${i + 1}. <@&${t.roleId}>: after **${t.days}d ${t.hours}h** registered${t.replace ? ' (replaces lower tiers)' : ''}`);
      return reply(`**Tenure tiers** (counted from registration; resets if the member unregisters)\n${lines.join('\n')}`);
    }

    const roleId = getOpt('role');

    if (sub.name === 'add') {
      const days = getOpt('days');
      const hours = getOpt('hours') || 0;
      if (roleId === guildId) return reply('❌ Cannot use @everyone as a tier role.');
      if (roleId === config.registerRoleId) return reply('❌ The register role cannot also be a tier role.');
      if (days === 0 && hours === 0) return reply('❌ Set at least 1 hour or 1 day.');

      const tier = { id: roleId, roleId, days, hours, replace: !!getOpt('replace') };
      const idx = config.loyaltyTiers.findIndex(t => t.id === roleId);
      if (idx >= 0) config.loyaltyTiers[idx] = tier; else config.loyaltyTiers.push(tier);
      saveAlbionConfig(guildId, config);

      reply(`✅ <@&${roleId}> will be granted after **${days}d ${hours}h** registered${tier.replace ? ', replacing lower tiers' : ''}. Existing members who already qualify get it within a minute. Keep the bot's role above this role in the role list.`);
      const guild = client.guilds.cache.get(guildId);
      if (guild) applyTiers(guild).catch(err => console.error('❌ Tier sweep failed:', err));
      return;
    }

    if (sub.name === 'remove') {
      const before = config.loyaltyTiers.length;
      config.loyaltyTiers = config.loyaltyTiers.filter(t => t.id !== roleId);
      if (config.loyaltyTiers.length === before) return reply('❌ That role is not a tier.');
      saveAlbionConfig(guildId, config);
      return reply(`✅ <@&${roleId}> is no longer a tier. Members keep the role.`);
    }
  }

  console.error(`❌ Unknown command: ${name}`);
  return res.status(400).json({ error: 'unknown command' });
}
