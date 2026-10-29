/**
 * Ticket Database Layer - Guild-Scoped Storage
 * Atomic file operations with proper safety for persistent Docker volumes
 */

import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '../../config/constants.js';


// Write queue per guild to prevent race conditions
const writeQueues = new Map();

/**
 * Get guild data directory
 */
function getGuildDir(guildId) {
  return path.join(DATA_DIR, 'guilds', guildId);
}

/**
 * Ensure guild directory exists
 */
async function ensureGuildDir(guildId) {
  const dir = getGuildDir(guildId);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create guild directory ${guildId}:`, error);
    throw error;
  }
}

/**
 * Atomic file write: write to temp file, then rename
 */
async function atomicWrite(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tmpPath);
    } catch {}
    throw error;
  }
}

/**
 * Queue write operation per guild to prevent concurrent writes
 */
async function queuedWrite(guildId, fn) {
  if (!writeQueues.has(guildId)) {
    writeQueues.set(guildId, Promise.resolve());
  }
  
  const promise = writeQueues.get(guildId).then(fn).catch((error) => {
    console.error(`Queued write error for guild ${guildId}:`, error);
    throw error;
  });
  
  writeQueues.set(guildId, promise);
  return promise;
}

/**
 * Load JSON file with fallback
 */
async function loadJson(filePath, defaultValue = null) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultValue;
    }
    console.error(`Error loading ${filePath}:`, error);
    return defaultValue;
  }
}

// ==================== TICKETS ====================

/**
 * Load all tickets for a guild
 */
export async function loadTickets(guildId) {
  await ensureGuildDir(guildId);
  const filePath = path.join(getGuildDir(guildId), 'tickets.json');
  return await loadJson(filePath, []);
}

/**
 * Save tickets for a guild
 */
export async function saveTickets(guildId, tickets) {
  await ensureGuildDir(guildId);
  const filePath = path.join(getGuildDir(guildId), 'tickets.json');
  return queuedWrite(guildId, async () => {
    await atomicWrite(filePath, tickets);
  });
}

/**
 * Get ticket by channelId
 */
export async function getTicketByChannel(guildId, channelId) {
  const tickets = await loadTickets(guildId);
  return tickets.find(t => t.channelId === channelId);
}

/**
 * Get open ticket by author
 */
export async function getOpenTicketByAuthor(guildId, authorId, panelId) {
  const tickets = await loadTickets(guildId);
  return tickets.find(t => 
    t.authorId === authorId && 
    t.panelId === panelId && 
    t.status === 'open'
  );
}

/**
 * Add new ticket
 */
export async function addTicket(guildId, ticket) {
  const tickets = await loadTickets(guildId);
  tickets.push(ticket);
  await saveTickets(guildId, tickets);
  return ticket;
}

/**
 * Update ticket
 */
export async function updateTicket(guildId, ticketId, updates) {
  const tickets = await loadTickets(guildId);
  const index = tickets.findIndex(t => t.ticketId === ticketId);
  if (index === -1) {
    throw new Error(`Ticket ${ticketId} not found in guild ${guildId}`);
  }
  tickets[index] = { ...tickets[index], ...updates };
  await saveTickets(guildId, tickets);
  return tickets[index];
}

// ==================== TRANSCRIPTS ====================

/**
 * Load all transcripts for a guild
 */
export async function loadTranscripts(guildId) {
  await ensureGuildDir(guildId);
  const filePath = path.join(getGuildDir(guildId), 'transcripts.json');
  return await loadJson(filePath, []);
}

/**
 * Save transcripts for a guild
 */
export async function saveTranscripts(guildId, transcripts) {
  await ensureGuildDir(guildId);
  const filePath = path.join(getGuildDir(guildId), 'transcripts.json');
  return queuedWrite(guildId, async () => {
    await atomicWrite(filePath, transcripts);
  });
}

/**
 * Get transcript by ticketId
 */
export async function getTranscript(guildId, ticketId) {
  const transcripts = await loadTranscripts(guildId);
  return transcripts.find(t => t.ticketId === ticketId);
}

/**
 * Initialize transcript for new ticket
 */
export async function initTranscript(guildId, ticketId) {
  const transcripts = await loadTranscripts(guildId);
  const transcript = {
    ticketId,
    messages: [],
    staffMessageCount: 0
  };
  transcripts.push(transcript);
  await saveTranscripts(guildId, transcripts);
  return transcript;
}

/**
 * Add message to transcript
 */
export async function addTranscriptMessage(guildId, ticketId, message) {
  const transcripts = await loadTranscripts(guildId);
  const index = transcripts.findIndex(t => t.ticketId === ticketId);
  if (index === -1) {
    throw new Error(`Transcript for ticket ${ticketId} not found`);
  }
  
  transcripts[index].messages.push(message);
  if (message.isStaff) {
    transcripts[index].staffMessageCount++;
  }
  
  await saveTranscripts(guildId, transcripts);
  return transcripts[index];
}

// ==================== PANELS ====================

/**
 * Load panel config for a guild
 */
export async function loadPanels(guildId) {
  await ensureGuildDir(guildId);
  const filePath = path.join(getGuildDir(guildId), 'panels.json');
  return await loadJson(filePath, []);
}

/**
 * Save panels for a guild
 */
export async function savePanels(guildId, panels) {
  await ensureGuildDir(guildId);
  const filePath = path.join(getGuildDir(guildId), 'panels.json');
  return queuedWrite(guildId, async () => {
    await atomicWrite(filePath, panels);
  });
}

/**
 * Get panel by panelId
 */
export async function getPanel(guildId, panelId) {
  const panels = await loadPanels(guildId);
  return panels.find(p => p.panelId === panelId);
}

// ==================== META ====================

/**
 * Load meta data for a guild
 */
export async function loadMeta(guildId) {
  await ensureGuildDir(guildId);
  const filePath = path.join(getGuildDir(guildId), 'meta.json');
  return await loadJson(filePath, { lastTicketId: 0 });
}

/**
 * Save meta data for a guild
 */
export async function saveMeta(guildId, meta) {
  await ensureGuildDir(guildId);
  const filePath = path.join(getGuildDir(guildId), 'meta.json');
  return queuedWrite(guildId, async () => {
    await atomicWrite(filePath, meta);
  });
}

/**
 * Increment and get next ticket ID
 */
export async function getNextTicketId(guildId) {
  const meta = await loadMeta(guildId);
  meta.lastTicketId++;
  await saveMeta(guildId, meta);
  return meta.lastTicketId;
}

/**
 * Reset all ticket data (tickets, transcripts, counter)
 * WARNING: This deletes all ticket history!
 */
export async function resetTicketData(guildId) {
  await ensureGuildDir(guildId);
  
  // Reset tickets
  await saveTickets(guildId, []);
  
  // Reset transcripts
  await saveTranscripts(guildId, []);
  
  // Reset meta (counter)
  await saveMeta(guildId, { lastTicketId: 0 });
  
  return true;
}
