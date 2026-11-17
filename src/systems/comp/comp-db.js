import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { DATA_DIR } from '../../config/constants.js';
import { writeJsonAtomicSync } from '../../utils/atomicFile.js';

// Comp rosters: a list of builds (weapon/head/armor/... icons) per roster, with
// a player name per build. Stored per guild in DATA_DIR/comp-<guild>.json.
// All access is synchronous read-modify-write inside one Node process, so two
// requests can never interleave a half-finished update.

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/comp');

// Gear slots and how many alternative items each may hold
export const SLOTS = {
  weapon: 1,
  offhand: 1,
  head: 1,
  armor: 1,
  shoes: 3,
  cape: 1,
  food: 3,
  potion: 2,
};

export const LIMITS = { rosters: 25, builds: 60, title: 60, note: 300, player: 40, rosterTitle: 60 };

let catalogIds = null;
export function getCatalogIds() {
  if (!catalogIds) {
    catalogIds = new Set(JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'catalog.json'), 'utf8')).map((i) => i.id));
  }
  return catalogIds;
}

export function loadSeed(name = 'clap-kite') {
  if (!/^[a-z-]+$/.test(name)) return [];
  try {
    return JSON.parse(fs.readFileSync(path.join(ASSET_DIR, `seed-${name}.json`), 'utf8'));
  } catch {
    return [];
  }
}

const fileFor = (guildId) => path.join(DATA_DIR, `comp-${guildId}.json`);

function loadAll(guildId) {
  try {
    const data = JSON.parse(fs.readFileSync(fileFor(guildId), 'utf8'));
    if (data && typeof data.rosters === 'object') return data;
  } catch {
    // missing or unreadable: start empty
  }
  return { rosters: {} };
}

function saveAll(guildId, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeJsonAtomicSync(fileFor(guildId), data);
}

const newId = () => crypto.randomBytes(4).toString('hex');
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

/** Keep only known item ids, in slot-size limits. Unknown slots are dropped. */
export function sanitizeItems(items) {
  const ids = getCatalogIds();
  const out = {};
  for (const [slot, max] of Object.entries(SLOTS)) {
    const arr = Array.isArray(items?.[slot]) ? items[slot] : [];
    out[slot] = [...new Set(arr.filter((id) => typeof id === 'string' && ids.has(id)))].slice(0, max);
  }
  return out;
}

function sanitizeBuild(b) {
  return {
    id: /^[A-Za-z0-9_-]{1,24}$/.test(b?.id) ? b.id : `b${newId()}`,
    title: clean(b?.title, LIMITS.title) || 'NEW BUILD',
    player: clean(b?.player, LIMITS.player),
    claimedBy: typeof b?.claimedBy === 'string' && /^\d{5,25}$/.test(b.claimedBy) ? b.claimedBy : null,
    note: clean(b?.note, LIMITS.note),
    items: sanitizeItems(b?.items),
  };
}

export function listRosters(guildId) {
  return Object.values(loadAll(guildId).rosters).sort((a, b) => b.createdAt - a.createdAt);
}

export function getRoster(guildId, rosterId) {
  return loadAll(guildId).rosters[rosterId] || null;
}

export function createRoster(guildId, { title, createdBy, seed = null }) {
  const data = loadAll(guildId);
  if (Object.keys(data.rosters).length >= LIMITS.rosters) {
    throw new Error(`A server can have at most ${LIMITS.rosters} rosters. Delete one first.`);
  }
  const id = newId();
  const now = Date.now();
  const builds = (seed ? loadSeed(seed) : []).slice(0, LIMITS.builds).map(sanitizeBuild);
  data.rosters[id] = {
    id,
    title: clean(title, LIMITS.rosterTitle) || 'Roster',
    createdBy,
    createdAt: now,
    updatedAt: now,
    closed: false,
    builds,
  };
  saveAll(guildId, data);
  return data.rosters[id];
}

export function deleteRoster(guildId, rosterId) {
  const data = loadAll(guildId);
  if (!data.rosters[rosterId]) return false;
  delete data.rosters[rosterId];
  saveAll(guildId, data);
  return true;
}

/**
 * Apply one change to a roster. `actor` = { userId, isAdmin, ign }.
 * Players may only claim/release their own build; admins may do everything.
 * Returns { roster } or { error }.
 */
export function applyOp(guildId, rosterId, op, actor) {
  const data = loadAll(guildId);
  const roster = data.rosters[rosterId];
  if (!roster) return { error: 'Roster not found.', status: 404 };

  const build = op.buildId ? roster.builds.find((b) => b.id === op.buildId) : null;
  const needBuild = () => (build ? null : { error: 'Build not found. Reload the page.', status: 404 });
  const adminOnly = () => (actor.isAdmin ? null : { error: 'Only roster admins can do that.', status: 403 });

  switch (op.op) {
    case 'claim': {
      const err = needBuild();
      if (err) return err;
      if (roster.closed && !actor.isAdmin) return { error: 'This roster is closed.', status: 403 };
      if (!actor.ign) return { error: 'Register your Albion name with the bot first (use /register in Discord).', status: 403 };
      if (build.claimedBy && build.claimedBy !== actor.userId) return { error: `${build.player || 'Someone'} already has this build.`, status: 409 };
      if (build.player && !build.claimedBy && !actor.isAdmin) return { error: `${build.player} is already assigned to this build.`, status: 409 };
      // One build per player per roster: claiming a new one frees the old one
      for (const other of roster.builds) {
        if (other.claimedBy === actor.userId && other.id !== build.id) {
          other.claimedBy = null;
          other.player = '';
        }
      }
      build.claimedBy = actor.userId;
      build.player = clean(actor.ign, LIMITS.player);
      break;
    }
    case 'release': {
      const err = needBuild();
      if (err) return err;
      if (build.claimedBy !== actor.userId && !actor.isAdmin) return { error: 'You can only release your own build.', status: 403 };
      build.claimedBy = null;
      build.player = '';
      break;
    }
    case 'update': {
      const err = adminOnly() || needBuild();
      if (err) return err;
      const p = op.patch || {};
      if ('title' in p) build.title = clean(p.title, LIMITS.title) || 'NEW BUILD';
      if ('note' in p) build.note = clean(p.note, LIMITS.note);
      if ('player' in p) {
        build.player = clean(p.player, LIMITS.player);
        build.claimedBy = null; // typed in by an admin, not a player claim
      }
      if ('items' in p) build.items = sanitizeItems(p.items);
      break;
    }
    case 'add': {
      const err = adminOnly();
      if (err) return err;
      if (roster.builds.length >= LIMITS.builds) return { error: `At most ${LIMITS.builds} builds per roster.`, status: 400 };
      roster.builds.push(sanitizeBuild({}));
      break;
    }
    case 'duplicate': {
      const err = adminOnly() || needBuild();
      if (err) return err;
      if (roster.builds.length >= LIMITS.builds) return { error: `At most ${LIMITS.builds} builds per roster.`, status: 400 };
      const copy = sanitizeBuild({ ...build, id: undefined, claimedBy: null, player: '', title: `${build.title} COPY` });
      roster.builds.splice(roster.builds.indexOf(build) + 1, 0, copy);
      break;
    }
    case 'delete': {
      const err = adminOnly() || needBuild();
      if (err) return err;
      roster.builds.splice(roster.builds.indexOf(build), 1);
      break;
    }
    case 'move': {
      const err = adminOnly() || needBuild();
      if (err) return err;
      const i = roster.builds.indexOf(build);
      const j = i + (op.dir === 'up' ? -1 : 1);
      if (j >= 0 && j < roster.builds.length) [roster.builds[i], roster.builds[j]] = [roster.builds[j], roster.builds[i]];
      break;
    }
    case 'meta': {
      const err = adminOnly();
      if (err) return err;
      if ('title' in op) roster.title = clean(op.title, LIMITS.rosterTitle) || roster.title;
      if ('closed' in op) roster.closed = !!op.closed;
      break;
    }
    case 'clear-players': {
      const err = adminOnly();
      if (err) return err;
      for (const b of roster.builds) {
        b.player = '';
        b.claimedBy = null;
      }
      break;
    }
    default:
      return { error: 'Unknown action.', status: 400 };
  }

  roster.updatedAt = Date.now();
  saveAll(guildId, data);
  return { roster };
}
