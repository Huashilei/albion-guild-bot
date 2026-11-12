import fs from 'fs';
import path from 'path';
import { AttachmentBuilder } from 'discord.js';
import { DATA_DIR } from '../../config/constants.js';
import { writeJsonAtomicSync } from '../../utils/atomicFile.js';
import { DiscordRequest } from '../../../utils.js';
import { renderWelcomeCard } from './welcome-card.js';

// Guild system_channel_flags bit that hides Discord's built-in "X joined" message
export const SUPPRESS_JOIN_NOTIFICATIONS = 1 << 0;

export const DEFAULT_WELCOME_MESSAGE = 'Welcome to **{server}**, {user}! You are member **#{count}**.';

const configPath = (guildId) => path.join(DATA_DIR, `welcome-config-${guildId}.json`);

export function loadWelcomeConfig(guildId) {
  try {
    return JSON.parse(fs.readFileSync(configPath(guildId), 'utf8'));
  } catch {
    return { enabled: false, channelId: null, message: DEFAULT_WELCOME_MESSAGE };
  }
}

export function saveWelcomeConfig(guildId, config) {
  writeJsonAtomicSync(configPath(guildId), config);
}

// {user} mention, {name} display name, {server} server name, {count} member count
function formatMessage(template, member) {
  return (template || DEFAULT_WELCOME_MESSAGE)
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{name}', member.displayName)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

/**
 * Post the welcome card for `member` in the configured channel.
 * Returns the channel it was sent to, or null when welcome is off.
 */
export async function sendWelcome(member, { force = false } = {}) {
  const config = loadWelcomeConfig(member.guild.id);
  if ((!config.enabled && !force) || !config.channelId) return null;

  const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    console.error(`❌ Welcome channel ${config.channelId} missing in ${member.guild.id}`);
    return null;
  }

  const card = new AttachmentBuilder(renderWelcomeCard(member.displayName), { name: 'welcome.gif' });
  await channel.send({
    content: formatMessage(config.message, member),
    files: [card],
    allowed_mentions: { users: [member.id] },
  });
  return channel;
}

export async function handleGuildMemberAdd(member) {
  if (member.user.bot) return;
  try {
    await sendWelcome(member);
  } catch (err) {
    console.error(`❌ Welcome failed for ${member.id} in ${member.guild.id}:`, err);
  }
}

/**
 * Turn Discord's built-in join message on or off. Needs Manage Server.
 * Returns true on success.
 */
export async function setDiscordJoinMessage(guildId, enabled) {
  try {
    const guild = await (await DiscordRequest(`guilds/${guildId}`, { method: 'GET' })).json();
    const flags = guild.system_channel_flags || 0;
    const next = enabled ? flags & ~SUPPRESS_JOIN_NOTIFICATIONS : flags | SUPPRESS_JOIN_NOTIFICATIONS;
    if (next !== flags) {
      await DiscordRequest(`guilds/${guildId}`, { method: 'PATCH', body: { system_channel_flags: next } });
    }
    return true;
  } catch (err) {
    console.error(`❌ Could not change Discord join message for ${guildId}:`, err.message);
    return false;
  }
}
