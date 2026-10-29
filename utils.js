import 'dotenv/config';

const EPHEMERAL_FLAG = 64;
const ORIGINAL_MESSAGE_PATH = /^webhooks\/([^/]+)\/([^/]+)\/messages\/@original$/;

// How long a finished ephemeral message stays before the bot removes it, so
// users aren't left clicking "Dismiss message". Short text goes quickly; embeds
// (registration result, lists) stay long enough to read.
function dismissDelayMs(body) {
  if (body.embeds?.length) return 30_000;
  const chars = String(body.content || '').length;
  return Math.min(30_000, Math.max(8_000, 5_000 + chars * 50));
}

/**
 * Delete an ephemeral interaction response after a delay. Only touches
 * messages with no components - anything interactive (panels, wizards) must
 * stay until the user finishes. Set EPHEMERAL_AUTO_DISMISS=false to disable.
 */
export function scheduleEphemeralDismiss(appId, token, body) {
  if (process.env.EPHEMERAL_AUTO_DISMISS === 'false') return;
  if (!appId || !token || !body) return;
  if (!((body.flags ?? 0) & EPHEMERAL_FLAG) || body.components?.length) return;

  setTimeout(() => {
    DiscordRequest(`webhooks/${appId}/${token}/messages/@original`, { method: 'DELETE' }).catch(() => {});
  }, dismissDelayMs(body)).unref();
}

export async function DiscordRequest(endpoint, options) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  // Final edits of an interaction's original response auto-dismiss (see above)
  const originalEdit = options.method === 'PATCH' ? ORIGINAL_MESSAGE_PATH.exec(endpoint) : null;
  const dismissBody = originalEdit ? options.body : null;
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  // Use fetch to make requests
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
    },
    ...options
  });
  // throw API errors
  if (!res.ok) {
    const data = await res.json();
    console.log(res.status);
    throw new Error(JSON.stringify(data));
  }
  if (originalEdit) scheduleEphemeralDismiss(originalEdit[1], originalEdit[2], dismissBody);
  // return original response
  return res;
}

export async function InstallGlobalCommands(appId, commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
