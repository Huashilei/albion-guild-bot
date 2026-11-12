import { loadPrefix } from '../database/guildData.js';
import { getCalloutByThread, saveCallouts } from '../config/contentState.js';
import { buildContentEmbed, autoAssignFillPlayers, ROLE_MAP } from '../services/contentService.js';
import { DiscordRequest } from '../../utils.js';
import { handleTicketMessage } from '../systems/ticket/ticket-system.js';
import { handlePrefixCommands } from '../commands/prefixCommands.js';

// Splits prefix-command text on whitespace, treating a "double quoted phrase"
// as one token (e.g. `!ticketsetup apply "Apply" ... "{username}"`).
// A plain split(/\s+/) would break the quoted nickname format above into
// three separate args at each internal space.
function tokenizeArgs(str) {
  const tokens = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(str)) !== null) {
    tokens.push(match[1] !== undefined ? match[1] : match[2]);
  }
  return tokens;
}

export async function handleMessageCreate(message, client) {
  // Ignore bot messages
  if (message.author.bot) return;
  // Prefix commands and ticket logging are server-only; DMs have no guild
  if (!message.guild) return;

  const prefix = loadPrefix(message.guild.id).prefix;

  // Handle content thread messages
  const callout = getCalloutByThread(message.channelId);
  if (callout) {
    const content = message.content.toLowerCase().trim();
    const userId = message.author.id;

    // x cancel
    if (/^x\s+cancel$/i.test(content)) {
      let found = false;
      for (const [k, uid] of Object.entries(callout.roles)) {
        if (uid === userId) { callout.roles[k] = null; found = true; break; }
      }
      const idx = callout.fill.indexOf(userId);
      if (idx > -1) { callout.fill.splice(idx, 1); found = true; }
      if (!found) { await message.react('ℹ️'); return; }
      try {
        saveCallouts();
        const embed = buildContentEmbed(callout);
        await DiscordRequest(`channels/${callout.channelId}/messages/${callout.messageId}`, {
          method: 'PATCH', body: { embeds: [embed.toJSON()] }
        });
        await message.react('✅');
      } catch (err) {
        console.error('Error updating content message:', err);
        await message.reply('❌ Failed to update the content board.');
      }
      return;
    }

    // x fill
    if (/^x\s+fill$/i.test(content)) {
      if (callout.fill.includes(userId)) { await message.react('ℹ️'); return; }
      for (const [k, uid] of Object.entries(callout.roles)) {
        if (uid === userId) callout.roles[k] = null;
      }
      callout.fill.push(userId);
      await autoAssignFillPlayers(client, callout);
      try {
        saveCallouts();
        const embed = buildContentEmbed(callout);
        await DiscordRequest(`channels/${callout.channelId}/messages/${callout.messageId}`, {
          method: 'PATCH', body: { embeds: [embed.toJSON()] }
        });
        await message.react('🔄');
      } catch (err) {
        console.error('Error updating content message:', err);
        await message.reply('❌ Failed to update the content board.');
      }
      return;
    }

    // x [roleKey or shortLabel]
    const xMatch = content.match(/^x\s+(\S+)$/i);
    if (xMatch) {
      const input = xMatch[1].toLowerCase();

      // Build shortLabel -> roleKey lookup for only the active roles
      const shortLabelLookup = {};
      for (const key of callout.activeRoles) {
        const info = ROLE_MAP[key];
        if (info) shortLabelLookup[info.shortLabel.toLowerCase()] = key;
      }

      // Match exact key or shortLabel
      let roleKey = null;
      if (callout.activeRoles.includes(input)) {
        roleKey = input;
      } else if (shortLabelLookup[input]) {
        roleKey = shortLabelLookup[input];
      }

      if (!roleKey) return; // Not a recognised role command

      if (callout.roles[roleKey] && callout.roles[roleKey] !== userId) {
        await message.reply(`❌ **${roleKey.toUpperCase()}** is already taken by <@${callout.roles[roleKey]}>!`);
        return;
      }
      if (callout.roles[roleKey] === userId) { await message.react('ℹ️'); return; }

      // Remove user from any existing role or fill slot
      for (const [k, uid] of Object.entries(callout.roles)) {
        if (uid === userId) callout.roles[k] = null;
      }
      const fillIdx = callout.fill.indexOf(userId);
      if (fillIdx > -1) callout.fill.splice(fillIdx, 1);

      callout.roles[roleKey] = userId;
      await autoAssignFillPlayers(client, callout);

      try {
        saveCallouts();
        const embed = buildContentEmbed(callout);
        await DiscordRequest(`channels/${callout.channelId}/messages/${callout.messageId}`, {
          method: 'PATCH', body: { embeds: [embed.toJSON()] }
        });
        await message.react('✅');
      } catch (err) {
        console.error('Error updating content message:', err);
        await message.reply('❌ Failed to update the content board.');
      }
      return;
    }

    return;
  }


  // Handle text commands with prefix
  if (!message.content.startsWith(prefix)) {
    // Log ticket messages even if not a command
    await handleTicketMessage(message);
    return;
  }

  const args = tokenizeArgs(message.content.slice(prefix.length).trim());
  const command = (args.shift() || '').toLowerCase();

  console.log(`📝 Text command received: ${prefix}${command}`);

  // Handle prefix commands
  await handlePrefixCommands(message, command, args, prefix);
}
