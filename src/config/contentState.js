import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './constants.js';
import { writeJsonAtomicSync } from '../utils/atomicFile.js';

// Live content callouts, keyed by the callout message id. Several can run at
// once (one per thread, any server); every button, `x` command and /content
// edit looks up its own callout so they never touch each other.
// Shape: {
//   guildId, channelId, threadId, messageId,
//   title, time, demassNotice,
//   activeRoles: string[],   // ordered role keys chosen during /content create
//   roles: {},               // roleKey -> userId | null
//   fill: string[],          // user ids in the fill queue
//   customRoleNames: {},     // roleKey -> display label (custom-named roles)
//   createdAt: Number,
// }
export const callouts = new Map();

const CALLOUTS_FILE = path.join(DATA_DIR, 'content-callouts.json');
// Callouts older than this are forgotten (threads auto-archive after a day)
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function loadCallouts() {
  try {
    const saved = JSON.parse(fs.readFileSync(CALLOUTS_FILE, 'utf8'));
    for (const callout of saved) {
      if (Date.now() - callout.createdAt < MAX_AGE_MS) callouts.set(callout.messageId, callout);
    }
  } catch {
    // No saved callouts yet
  }
}
loadCallouts();

// Persist so buttons keep working after a restart
export function saveCallouts() {
  for (const [id, callout] of callouts) {
    if (Date.now() - callout.createdAt >= MAX_AGE_MS) callouts.delete(id);
  }
  try {
    writeJsonAtomicSync(CALLOUTS_FILE, [...callouts.values()]);
  } catch (err) {
    console.error('❌ Could not save content callouts:', err.message);
  }
}

export function addCallout(callout) {
  callouts.set(callout.messageId, callout);
  saveCallouts();
}

export const getCalloutByMessage = (messageId) => callouts.get(messageId) || null;

export function getCalloutByThread(threadId) {
  for (const callout of callouts.values()) {
    if (callout.threadId === threadId) return callout;
  }
  return null;
}

// For /content adduser|removeuser: the callout of the thread the command was
// run in, else the server's only callout. Null when that is ambiguous.
export function findCalloutForCommand(guildId, channelId) {
  const inThread = getCalloutByThread(channelId);
  if (inThread) return inThread;
  const inGuild = [...callouts.values()].filter((c) => c.guildId === guildId);
  return inGuild.length === 1 ? inGuild[0] : null;
}

// Temporary in-progress creation state, keyed by userId.
// Cleared after successful publish.
// Shape: {
//   partySize: Number,
//   method: 'custom' | 'dropdown' | null,
//   assignedRoles: string[],   // role keys in slot order
//   customRoleNames: {},       // 'custom_0' -> 'Bomb Squad' etc.
//   currentSlot: Number,       // next slot index to fill (0-based)
//   customBatchStart: Number,  // first slot index of the next custom modal batch
//   title: string,             // set after content_create_modal submit
//   time: string,
//   demassNotice: string,
// }
export const pendingCreations = new Map();
