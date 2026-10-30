import fs from 'fs';
import path from 'path';
import { ChannelType } from 'discord.js';
import { DATA_DIR } from '../../config/constants.js';
import { writeJsonAtomicSync } from '../../utils/atomicFile.js';

// Joining a voice channel with this name creates a temporary VC in the same
// category and moves the member into it. Empty temp VCs are deleted.
const TRIGGER_NAME = 'create vc';
const TEMP_FILE = path.join(DATA_DIR, 'temp-vc.json');

// Temp channel ids are persisted so channels left over from a restart still get cleaned up
let tempChannelIds = new Set();

function loadTempChannels() {
  try {
    tempChannelIds = new Set(JSON.parse(fs.readFileSync(TEMP_FILE, 'utf8')));
  } catch {
    tempChannelIds = new Set();
  }
}

function saveTempChannels() {
  writeJsonAtomicSync(TEMP_FILE, [...tempChannelIds]);
}

function isTrigger(channel) {
  return channel?.type === ChannelType.GuildVoice && channel.name.trim().toLowerCase() === TRIGGER_NAME;
}

async function deleteIfEmpty(channel) {
  if (!tempChannelIds.has(channel.id) || channel.members.size > 0) return;
  tempChannelIds.delete(channel.id);
  saveTempChannels();
  await channel.delete('Temporary VC empty').catch((err) => console.error('❌ Failed to delete temp VC:', err.message));
}

async function createTempChannel(trigger, member) {
  const channel = await trigger.guild.channels.create({
    name: `${member.displayName}'s VC`.slice(0, 100),
    type: ChannelType.GuildVoice,
    parent: trigger.parentId,
    bitrate: trigger.bitrate,
    userLimit: trigger.userLimit,
    permissionOverwrites: [...trigger.permissionOverwrites.cache.values()].map(({ id, type, allow, deny }) => ({ id, type, allow, deny })),
    reason: `Temporary VC for ${member.user.tag}`
  });
  tempChannelIds.add(channel.id);
  saveTempChannels();

  try {
    await member.voice.setChannel(channel);
  } catch (err) {
    // Member left before the move, or the bot lacks Move Members
    console.error('❌ Failed to move member to temp VC:', err.message);
    await deleteIfEmpty(channel);
  }
}

export function handleVoiceStateUpdate(oldState, newState) {
  if (oldState.channelId === newState.channelId) return;

  if (isTrigger(newState.channel) && newState.member && !newState.member.user.bot) {
    createTempChannel(newState.channel, newState.member)
      .catch((err) => console.error('❌ Failed to create temp VC:', err.message));
  }
  if (oldState.channel) deleteIfEmpty(oldState.channel);
}

// Remove temp VCs that emptied (or were deleted) while the bot was offline
export async function cleanupTempChannels(client) {
  loadTempChannels();
  for (const id of [...tempChannelIds]) {
    const channel = await client.channels.fetch(id).catch(() => null);
    if (!channel) {
      tempChannelIds.delete(id);
    } else {
      await deleteIfEmpty(channel);
    }
  }
  saveTempChannels();
}
