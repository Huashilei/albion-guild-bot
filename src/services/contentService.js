import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

// ─── Role definitions ──────────────────────────────────────────────────────────

export const MASTER_ROLES = [
// ======================
// SWORDS
// ======================

{ key: 'sword_broadsword', label: 'Broadsword', shortLabel: 'Broad', category: 'dps' },
{ key: 'sword_claymore', label: 'Claymore', shortLabel: 'Claymore', category: 'dps' },
{ key: 'sword_dual', label: 'Dual Swords', shortLabel: 'Dual', category: 'dps' },
{ key: 'sword_clarent', label: 'Clarent Blade', shortLabel: 'Clarent', category: 'dps' },
{ key: 'sword_carving', label: 'Carving Sword', shortLabel: 'Carving', category: 'dps' },
{ key: 'sword_kingmaker', label: 'Kingmaker', shortLabel: 'King', category: 'dps' },
{ key: 'sword_galatine', label: 'Galatine Pair', shortLabel: 'Galas', category: 'dps' },
{ key: 'sword_infinityblade', label: 'Infinity Blade', shortLabel: 'Infinity', category: 'dps' },

// ======================
// AXES
// ======================

{ key: 'axe_battleaxe', label: 'Battleaxe', shortLabel: 'Battleaxe', category: 'dps' },
{ key: 'axe_greataxe', label: 'Greataxe', shortLabel: 'Greataxe', category: 'dps' },
{ key: 'axe_halberd', label: 'Halberd', shortLabel: 'Halberd', category: 'dps' },
{ key: 'axe_carrion', label: 'Carrioncaller', shortLabel: 'Carrion', category: 'dps' },
{ key: 'axe_infernal', label: 'Infernal Scythe', shortLabel: 'Scythe', category: 'dps' },
{ key: 'axe_bearpaws', label: 'Bear Paws', shortLabel: 'Bear', category: 'dps' },
{ key: 'axe_realm', label: 'Realmbreaker', shortLabel: 'Realm', category: 'dps' },
{ key: 'axe_crystlareaper', label: 'Crystlareaper', shortLabel: 'Cryst', category: 'dps' },

// ======================
// MACES
// ======================

{ key: 'mace_1h', label: 'Mace', shortLabel: 'Mace', category: 'tank' },
{ key: 'mace_heavy', label: 'Heavy Mace', shortLabel: 'Heavy', category: 'tank' },
{ key: 'mace_morning', label: 'Morning Star', shortLabel: 'Morning', category: 'tank' },
{ key: 'mace_camlann', label: 'Camlann Mace', shortLabel: 'Camlann', category: 'tank' },
{ key: 'mace_bedrock', label: 'Bedrock Mace', shortLabel: 'Bedrock', category: 'tank' },
{ key: 'mace_incubus', label: 'Incubus Mace', shortLabel: 'Incubus', category: 'tank' },
{ key: 'mace_oath', label: 'Oathkeepers', shortLabel: 'Oath', category: 'tank' },
{ key: 'mace_dreadstorm', label: 'Dreadstorm Mace', shortLabel: 'Dread', category: 'tank' },

// ======================
// HAMMERS
// ======================

{ key: 'hammer_1h', label: 'Hammer', shortLabel: 'Hammer', category: 'tank' },
{ key: 'hammer_pole', label: 'Polehammer', shortLabel: 'Pole', category: 'tank' },
{ key: 'hammer_grove', label: 'Grovekeeper', shortLabel: 'Grove', category: 'tank' },
{ key: 'hammer_tomb', label: 'Tombhammer', shortLabel: 'Tomb', category: 'tank' },
{ key: 'hammer_hoj', label: 'Hammer of Justice', shortLabel: 'HoJ', category: 'tank' },
{ key: 'hammer_forge', label: 'Forge Hammers', shortLabel: 'Forge', category: 'tank' },
{ key: 'hammer_great', label: 'Great Hammer', shortLabel: 'GHammer', category: 'tank' },
{ key: 'hammer_trueblot', label: 'Trueblot Hammer', shortLabel: 'Trueblot', category: 'tank' },

// ======================
// SPEARS
// ======================

{ key: 'spear_1h', label: 'Spear', shortLabel: 'Spear', category: 'dps' },
{ key: 'spear_pike', label: 'Pike', shortLabel: 'Pike', category: 'dps' },
{ key: 'spear_glaive', label: 'Glaive', shortLabel: 'Glaive', category: 'dps' },
{ key: 'spear_spirit', label: 'Spirithunter', shortLabel: 'Spirit', category: 'dps' },
{ key: 'spear_heron', label: 'Heron Spear', shortLabel: 'Heron', category: 'dps' },
{ key: 'spear_trinity', label: 'Trinity Spear', shortLabel: 'Trinity', category: 'dps' },
{ key: 'spear_daybreaker', label: 'Daybreaker', shortLabel: 'Day', category: 'dps' },
{ key: 'spear_riftglaive', label: 'Riftglaive', shortLabel: 'Rift', category: 'dps' },

// ======================
// DAGGERS
// ======================

{ key: 'dagger_1h', label: 'Dagger', shortLabel: 'Dagger', category: 'dps' },
{ key: 'dagger_pair', label: 'Dagger Pair', shortLabel: 'DP', category: 'dps' },
{ key: 'dagger_claws', label: 'Claws', shortLabel: 'Claws', category: 'dps' },
{ key: 'dagger_blood', label: 'Bloodletter', shortLabel: 'BL', category: 'dps' },
{ key: 'dagger_demonfang', label: 'Demonfang', shortLabel: 'DF', category: 'dps' },
{ key: 'dagger_death', label: 'Deathgivers', shortLabel: 'DG', category: 'dps' },
{ key: 'dagger_bridled', label: 'Bridled Fury', shortLabel: 'BF', category: 'dps' },
{ key: 'dagger_twinslayer', label: 'Twin Slayers', shortLabel: 'TS', category: 'dps' },

// ======================
// BOWS
// ======================

{ key: 'bow_regular', label: 'Bow', shortLabel: 'Bow', category: 'dps' },
{ key: 'bow_warbow', label: 'Warbow', shortLabel: 'Warbow', category: 'dps' },
{ key: 'bow_longbow', label: 'Longbow', shortLabel: 'Longbow', category: 'dps' },
{ key: 'bow_badon', label: 'Bow of Badon', shortLabel: 'Badon', category: 'dps' },
{ key: 'bow_wailing', label: 'Wailing Bow', shortLabel: 'Wailing', category: 'dps' },
{ key: 'bow_whisper', label: 'Whispering Bow', shortLabel: 'Whisper', category: 'dps' },
{ key: 'bow_mistpiercer', label: 'Mistpiercer Bow', shortLabel: 'Mist', category: 'dps' },
{ key: 'bow_skystrider', label: 'Skystrider Bow', shortLabel: 'Sky', category: 'dps' },
// ======================
// CROSSBOWS
// ======================

{ key: 'xbow_1h', label: 'Crossbow', shortLabel: 'Xbow', category: 'dps' },
{ key: 'xbow_heavy', label: 'Heavy Crossbow', shortLabel: 'HXB', category: 'dps' },
{ key: 'xbow_light', label: 'Light Crossbow', shortLabel: 'LCB', category: 'dps' },
{ key: 'xbow_weeping', label: 'Weeping Repeater', shortLabel: 'WE', category: 'dps' },
{ key: 'xbow_siege', label: 'Siegebow', shortLabel: 'Siege', category: 'dps' },
{ key: 'xbow_bolts', label: 'Boltcasters', shortLabel: 'Bolts', category: 'dps' },
{ key: 'xbow_energy', label: 'Energy Shaper', shortLabel: 'ES', category: 'dps' },
{ key: 'xbow_arclight', label: 'Arclight Blasters', shortLabel: 'Arclight', category: 'dps' },

// ======================
// QUARTERSTAFFS
// ======================

{ key: 'staff_1h', label: 'Quarterstaff', shortLabel: 'QS', category: 'dps' },
{ key: 'staff_ironclad', label: 'Iron-Clad Staff', shortLabel: 'IC', category: 'tank' },
{ key: 'staff_double', label: 'Double Bladed Staff', shortLabel: 'DBS', category: 'dps' },
{ key: 'staff_soulscythe', label: 'Soulscythe', shortLabel: 'Soul', category: 'dps' },
{ key: 'staff_blackmonk', label: 'Black Monk Stave', shortLabel: 'BM', category: 'dps' },
{ key: 'staff_balance', label: 'Staff of Balance', shortLabel: 'Balance', category: 'dps' },
{ key: 'staff_grail', label: 'Grailseeker', shortLabel: 'Grail', category: 'support' },
{ key: 'staff_twinblade', label: 'Phantom Twinblade', shortLabel: 'Twinblade', category: 'support' },

// ======================
// WAR GLOVES
// ======================

{ key: 'glove_brawler', label: 'Brawler Gloves', shortLabel: 'Brawler', category: 'dps' },
{ key: 'glove_battle', label: 'Battle Bracers', shortLabel: 'Bracers', category: 'dps' },
{ key: 'glove_spiked', label: 'Spiked Gauntlets', shortLabel: 'Spiked', category: 'dps' },
{ key: 'glove_ursine', label: 'Ursine Maulers', shortLabel: 'Ursine', category: 'dps' },
{ key: 'glove_ava', label: 'Fists of Avalon', shortLabel: 'Ava', category: 'dps' },
{ key: 'glove_hellfire', label: 'Hellfire Hands', shortLabel: 'HFH', category: 'dps' },
{ key: 'glove_raven', label: 'Ravenstrike Cestus', shortLabel: 'Raven', category: 'dps' },
{ key: 'glove_forcepulse', label: 'Forcepulse Bracer', shortLabel: 'Force', category: 'dps' },

// ======================
// FIRE STAFFS
// ======================

{ key: 'fire_1h', label: 'Fire Staff', shortLabel: '1H Fire', category: 'dps' },
{ key: 'fire_great', label: 'Great Fire Staff', shortLabel: 'GFire', category: 'dps' },
{ key: 'fire_infernal', label: 'Infernal Staff', shortLabel: 'Infernal', category: 'dps' },
{ key: 'fire_brim', label: 'Brimstone Staff', shortLabel: 'Brim', category: 'dps' },
{ key: 'fire_blazing', label: 'Blazing Staff', shortLabel: 'Blazing', category: 'dps' },
{ key: 'fire_wildfire', label: 'Wildfire Staff', shortLabel: 'Wildfire', category: 'dps' },
{ key: 'fire_dawnsong', label: 'Dawnsong', shortLabel: 'Dawn', category: 'dps' },
{ key: 'fire_flamewalker', label: 'Flamewalker Staff', shortLabel: 'Flame', category: 'dps' },

// ======================
// FROST STAFFS
// ======================

{ key: 'frost_1h', label: 'Frost Staff', shortLabel: 'Frost', category: 'dps' },
{ key: 'frost_great', label: 'Great Frost Staff', shortLabel: 'GFrost', category: 'dps' },
{ key: 'frost_glacial', label: 'Glacial Staff', shortLabel: 'Glacial', category: 'dps' },
{ key: 'frost_perma', label: 'Permafrost Prism', shortLabel: 'Perma', category: 'dps' },
{ key: 'frost_hoarfrost', label: 'Hoarfrost Staff', shortLabel: 'Hoar', category: 'dps' },
{ key: 'frost_chillhowl', label: 'Chillhowl', shortLabel: 'Chill', category: 'dps' },
{ key: 'frost_icicle', label: 'Icicle Staff', shortLabel: 'Icicle', category: 'dps' },
{ key: 'frost_arctic', label: 'Arctic Staff', shortLabel: 'Arctic', category: 'dps' },

// ======================
// CURSED STAFFS
// ======================

{ key: 'curse_1h', label: 'Cursed Staff', shortLabel: 'Curse', category: 'dps' },
{ key: 'curse_great', label: 'Great Cursed Staff', shortLabel: 'GCurse', category: 'dps' },
{ key: 'curse_demonic', label: 'Demonic Staff', shortLabel: 'Demonic', category: 'dps' },
{ key: 'curse_lifecurse', label: 'Lifecurse Staff', shortLabel: 'Life', category: 'dps' },
{ key: 'curse_shadowcaller', label: 'Shadowcaller', shortLabel: 'SC', category: 'dps' },
{ key: 'curse_damnation', label: 'Damnation Staff', shortLabel: 'Damn', category: 'dps' },
{ key: 'curse_skull', label: 'Cursed Skull', shortLabel: 'Skull', category: 'dps' },
{ key: 'curse_rotcaller', label: 'Cursed Rotcaller', shortLabel: 'Rot', category: 'dps' },

// ======================
// ARCANE STAFFS
// ======================

{ key: 'arcane_1h', label: 'Arcane Staff', shortLabel: 'Arcane', category: 'dps' },
{ key: 'arcane_great', label: 'Great Arcane Staff', shortLabel: 'GArc', category: 'support' },
{ key: 'arcane_enig', label: 'Enigmatic Staff', shortLabel: 'Enig', category: 'support' },
{ key: 'arcane_occult', label: 'Occult Staff', shortLabel: 'Occult', category: 'support' },
{ key: 'arcane_witchwork', label: 'Witchwork Staff', shortLabel: 'Witch', category: 'support' },
{ key: 'arcane_evensong', label: 'Evensong', shortLabel: 'Evensong', category: 'support' },
{ key: 'arcane_locus', label: 'Locus Staff', shortLabel: 'Locus', category: 'support' },
{ key: 'arcane_astral', label: 'Astral Staff', shortLabel: 'Astral', category: 'dps' },

// ======================
// HOLY STAFFS
// ======================

{ key: 'holy_1h', label: 'Holy Staff', shortLabel: 'Holy', category: 'heal' },
{ key: 'holy_great', label: 'Great Holy Staff', shortLabel: 'GHoly', category: 'heal' },
{ key: 'holy_divine', label: 'Divine Staff', shortLabel: 'Divine', category: 'heal' },
{ key: 'holy_lifetouch', label: 'Lifetouch Staff', shortLabel: 'LT', category: 'heal' },
{ key: 'holy_fallen', label: 'Fallen Staff', shortLabel: 'Fallen', category: 'heal' },
{ key: 'holy_redemption', label: 'Redemption Staff', shortLabel: 'Redemp', category: 'heal' },
{ key: 'holy_hallowfall', label: 'Hallowfall', shortLabel: 'HF', category: 'heal' },
{ key: 'holy_exalted', label: 'Exalted Staff', shortLabel: 'Exalted', category: 'heal' },

// ======================
// NATURE STAFFS
// ======================

{ key: 'nature_1h', label: 'Nature Staff', shortLabel: 'Nature', category: 'heal' },
{ key: 'nature_great', label: 'Great Nature Staff', shortLabel: 'GNature', category: 'heal' },
{ key: 'nature_wild', label: 'Wild Staff', shortLabel: 'Wild', category: 'heal' },
{ key: 'nature_druidic', label: 'Druidic Staff', shortLabel: 'Druid', category: 'heal' },
{ key: 'nature_blight', label: 'Blight Staff', shortLabel: 'Blight', category: 'heal' },
{ key: 'nature_rampant', label: 'Rampant Staff', shortLabel: 'Rampant', category: 'heal' },
{ key: 'nature_ironroot', label: 'Ironroot Staff', shortLabel: 'Iron', category: 'heal' },
{ key: 'nature_forgebark', label: 'Forgebark Staff', shortLabel: 'FBark', category: 'heal' },

// ======================
// SHAPESHIFTER STAFFS /
// ======================

{ key: 'shape_prowling', label: 'Prowling Staff', shortLabel: 'Prowl', category: 'dps' },
{ key: 'shape_rootbound', label: 'Rootbound Staff', shortLabel: 'Root', category: 'support' },
{ key: 'shape_primal', label: 'Primal Staff', shortLabel: 'Primal', category: 'dps' },
{ key: 'shape_bloodmoon', label: 'Bloodmoon Staff', shortLabel: 'Blood', category: 'dps' },
{ key: 'shape_hellspawn', label: 'Hellspawn Staff', shortLabel: 'Hell', category: 'dps' },
{ key: 'shape_earthrune', label: 'Earthrune Staff', shortLabel: 'Earth', category: 'tank' },
{ key: 'shape_lightcaller', label: 'Lightcaller', shortLabel: 'LC', category: 'dps' },
{ key: 'shape_stillgaze', label: 'Stillgaze Staff', shortLabel: 'Still', category: 'dps' },

];

// Lookup map: roleKey -> role info
export const ROLE_MAP = Object.fromEntries(MASTER_ROLES.map(r => [r.key, r]));

// Roles grouped by category (for the category-based selector)
export const ROLES_BY_CATEGORY = {
  tank:    MASTER_ROLES.filter(r => r.category === 'tank'),
  heal:    MASTER_ROLES.filter(r => r.category === 'heal'),
  support: MASTER_ROLES.filter(r => r.category === 'support'),
  dps:     MASTER_ROLES.filter(r => r.category === 'dps'),
};

// DPS roles split into 4 groups of ≤ 25 to stay within Discord's select-menu option limit
// g1=24 (Swords/Axes/Spears), g2=24 (Daggers/Bows/Xbows),
// g3=24 (Gloves/Fire/Frost),  g4=21 (Cursed/Quarterstaff/Shapeshifter/Arcane DPS)
export const DPS_GROUPS = {
  g1: MASTER_ROLES.filter(r => r.category === 'dps' && /^(sword_|axe_|spear_)/.test(r.key)),
  g2: MASTER_ROLES.filter(r => r.category === 'dps' && /^(dagger_|bow_|xbow_)/.test(r.key)),
  g3: MASTER_ROLES.filter(r => r.category === 'dps' && /^(glove_|fire_|frost_)/.test(r.key)),
  g4: MASTER_ROLES.filter(r => r.category === 'dps' && /^(curse_|staff_|shape_|arcane_)/.test(r.key)),
};

// ─── Role display helpers ──────────────────────────────────────────────────────

// Strip duplicate suffix (_2, _3 …) to get the canonical ROLE_MAP key
export const getBaseKey = (key) => key.replace(/_\d+$/, '');

const CAT_LABEL = { tank: 'Tank', heal: 'Heal', support: 'Support', dps: 'DPS' };

// Full display name: "Category - Label" (or custom name if present)
export const getRoleDisplayName = (key, customNames = {}) => {
  if (customNames[key]) return customNames[key];
  const info = ROLE_MAP[getBaseKey(key)];
  if (!info) return key.toUpperCase();
  return `${CAT_LABEL[info.category] || info.category} - ${info.label}`;
};

// ─── Active-content embed & buttons ───────────────────────────────────────────

const CATEGORY_META = {
  tank: { emoji: '🛡️', label: 'Tank' },
  heal: { emoji: '💚', label: 'Heal' },
  support: { emoji: '✨', label: 'Support' },
  dps: { emoji: '⚔️', label: 'DPS' },
  custom: { emoji: '📝', label: 'Custom' },
};
const CATEGORY_ORDER = ['tank', 'heal', 'support', 'dps', 'custom'];

// Custom-method roles (key like "custom_0") have no weapon entry in ROLE_MAP,
// so they have no real category - group them separately instead of guessing.
const getRoleCategory = (key) => ROLE_MAP[getBaseKey(key)]?.category || 'custom';

// Plain weapon/role label with no category prefix - used in the grouped
// roster where the category is already the field header. Falls back to the
// full "Category - Label" form (getRoleDisplayName) for any unmapped key.
const getRoleShortLabel = (key, customNames = {}) => {
  if (customNames[key]) return customNames[key];
  const info = ROLE_MAP[getBaseKey(key)];
  return info ? info.label : getRoleDisplayName(key, customNames);
};

const buildProgressBar = (filled, total, length = 12) => {
  if (total <= 0) return '▱'.repeat(length);
  const filledSegments = Math.min(length, Math.round((filled / total) * length));
  return '▰'.repeat(filledSegments) + '▱'.repeat(length - filledSegments);
};

// Splits pre-formatted lines into chunks that each fit inside a single embed
// field value (Discord's limit is 1024 chars) - a full 20-slot party stacked
// into one category can get close to that.
const chunkFieldLines = (lines, maxChars = 1000) => {
  const chunks = [];
  let current = [];
  let currentLen = 0;
  for (const line of lines) {
    const lineLen = line.length + 1;
    if (current.length > 0 && currentLen + lineLen > maxChars) {
      chunks.push(current.join('\n'));
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += lineLen;
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks;
};

// Parses a "HH:MM", "HH:MM UTC", or "H:MM AM/PM" style time into a Discord
// timestamp so Discord renders it as a live, localized countdown for every
// viewer. Falls back to the raw text for anything else (e.g. "After reset").
const formatEventTime = (timeStr) => {
  if (!timeStr) return 'TBD';
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?\s*(utc)?$/i);
  if (!match) return timeStr;

  const [, hourRaw, minRaw, meridiem] = match;
  let hour = parseInt(hourRaw, 10);
  const min = parseInt(minRaw, 10);
  if (hour > 23 || min > 59) return timeStr;
  if (meridiem) {
    hour = hour % 12;
    if (meridiem.toLowerCase() === 'pm') hour += 12;
  }

  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, min, 0));
  if (target.getTime() <= Date.now()) {
    target.setUTCDate(target.getUTCDate() + 1); // already passed today - assume tomorrow
  }

  const unix = Math.floor(target.getTime() / 1000);
  return `<t:${unix}:t> (<t:${unix}:R>)`;
};

// Build the content embed dynamically from activeRoles
export const buildContentEmbed = (callout) => {
  const { title, time, demassNotice, activeRoles, roles, fill, customRoleNames } = callout;
  const total = activeRoles.length;
  const filled = activeRoles.filter(k => roles[k] != null).length;
  const isFull = total > 0 && filled === total;

  // Group by category while keeping each role's GLOBAL slot number
  // (its position in activeRoles) - /content removeuser slot:N depends on it.
  const byCategory = { tank: [], heal: [], support: [], dps: [], custom: [] };
  activeRoles.forEach((key, i) => {
    byCategory[getRoleCategory(key)].push({ key, slot: i + 1 });
  });

  const fields = [];
  for (const cat of CATEGORY_ORDER) {
    const entries = byCategory[cat];
    if (entries.length === 0) continue;

    const meta = CATEGORY_META[cat];
    const catFilled = entries.filter((e) => roles[e.key]).length;
    const lines = entries.map(({ key, slot }) => {
      const userId = roles[key];
      return `\`${slot}.\` ${getRoleShortLabel(key, customRoleNames)} — ${userId ? `<@${userId}>` : '🔓 *Open*'}`;
    });

    const chunks = chunkFieldLines(lines);
    chunks.forEach((chunk, i) => {
      fields.push({
        name: `${meta.emoji} ${meta.label} (${catFilled}/${entries.length})${chunks.length > 1 ? ` [${i + 1}/${chunks.length}]` : ''}`,
        value: chunk,
        inline: entries.length <= 4 && chunks.length === 1,
      });
    });
  }

  if (fill.length > 0) {
    // Max party size is 20, so the mention list here (~21 chars each) never
    // approaches the 1024-char field limit - no chunking needed.
    fields.push({
      name: `🔄 Fill (${fill.length})`,
      value: fill.map((id) => `<@${id}>`).join(', '),
      inline: false,
    });
  }

  return new EmbedBuilder()
    .setColor(isFull ? 0x57F287 : 0x5865F2)
    .setTitle(`📣 ${title || 'Role Call'}`)
    .setDescription(
      `**${buildProgressBar(filled, total)}**  \`${filled}/${total}\`\n` +
      `🕒 ${formatEventTime(time)}` +
      (demassNotice ? `\n⚠️ **Demass:** ${demassNotice}` : '')
    )
    .addFields(fields)
    .setFooter({ text: isFull ? '✅ Roster full!' : 'Click a role below to sign up • 🔄 Fill for any slot' });
};

// Build Discord button rows dynamically from activeRoles (max 4 role rows + 1 utility row)
export const buildContentComponents = (callout) => {
  const { activeRoles, customRoleNames } = callout;

  const btn = (customId, label, style = ButtonStyle.Primary) =>
    new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);

  const row = (...btns) => new ActionRowBuilder().addComponents(...btns);

  const roleButtons = activeRoles.map(key => {
    let shortLabel;
    if (customRoleNames?.[key]) {
      shortLabel = customRoleNames[key].substring(0, 12);
    } else {
      const baseInfo = ROLE_MAP[getBaseKey(key)];
      const base = baseInfo?.shortLabel || getBaseKey(key).toUpperCase().substring(0, 10);
      const dupMatch = key.match(/_(\d+)$/);
      shortLabel = dupMatch ? `${base}${dupMatch[1]}`.substring(0, 12) : base.substring(0, 12);
    }
    return btn(`content_role_${key}`, shortLabel);
  });

  const rows = [];
  for (let i = 0; i < roleButtons.length && rows.length < 4; i += 5) {
    rows.push(row(...roleButtons.slice(i, i + 5)));
  }

  // Utility row: Fill + Cancel
  rows.push(row(
    btn('content_fill', '🔄 Fill', ButtonStyle.Success),
    btn('content_cancel', '❌ Cancel', ButtonStyle.Danger)
  ));

  return rows;
};

// ─── Creation wizard builders ──────────────────────────────────────────────────

// Step 1: party size dropdown
export const buildSizeSelector = () => {
  const options = [];
  for (let i = 2; i <= 20; i++) {
    options.push({ label: `${i} players`, value: String(i) });
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId('content_size_select')
    .setPlaceholder('How many party slots?')
    .addOptions(options);
  return [new ActionRowBuilder().addComponents(select)];
};

// Step 2: choose Custom vs Preset roles
export const buildMethodSelector = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('content_method_custom')
      .setLabel('🖊️ Custom Roles')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('content_method_dropdown')
      .setLabel('📋 Preset Roles')
      .setStyle(ButtonStyle.Secondary),
  ),
];

// ─── EDIT ROLES HERE ──────────────────────────────────────────────────────────
// To add/remove/rename preset roles, edit MASTER_ROLES near the top of this file.
// Each entry needs: key (unique ID), label (full display name), shortLabel (abbrev), category.
// Categories: 'tank' | 'heal' | 'support' | 'dps'
// ─────────────────────────────────────────────────────────────────────────────

// Step 3a (Preset – Non-DPS): Tank / Heal / Support selects + navigation button
// Tank=17, Heal=14, Support=8 — all within Discord's 25-option limit per select
export const buildPresetNondpsMessage = (partySize, selTank = [], selHeal = [], selSupport = []) => {
  const nondpsCount = selTank.length + selHeal.length + selSupport.length;

  const makeSelect = (customId, placeholder, roles, selected) =>
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(0)
      .setMaxValues(Math.min(partySize, roles.length))
      .addOptions(roles.map(r => ({ label: r.label, value: r.key, default: selected.includes(r.key) })));

  return {
    content:
      `**Step 3a of 4** — Select Tank / Heal / Support roles *(${nondpsCount} non-DPS selected so far)*\n` +
      `Click **→ Select DPS** when done here (you don't need to fill all slots with non-DPS).`,
    components: [
      new ActionRowBuilder().addComponents(makeSelect('content_preset_tank',    '🛡️ Tank roles',    ROLES_BY_CATEGORY.tank,    selTank)),
      new ActionRowBuilder().addComponents(makeSelect('content_preset_heal',    '💚 Heal roles',    ROLES_BY_CATEGORY.heal,    selHeal)),
      new ActionRowBuilder().addComponents(makeSelect('content_preset_support', '🔷 Support roles', ROLES_BY_CATEGORY.support, selSupport)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('content_preset_to_dps')
          .setLabel(`→ Select DPS Roles (${nondpsCount} non-DPS chosen)`)
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
};

// Step 3b (Preset – DPS): four weapon-group selects + confirm/back buttons
// Each option is prefixed with its weapon family (e.g. "Shape - Prowling Staff")
// so users can instantly tell which group they're picking from.
export const buildPresetDpsMessage = (partySize, nondpsCount, selG1 = [], selG2 = [], selG3 = [], selG4 = []) => {
  const dpsCount = selG1.length + selG2.length + selG3.length + selG4.length;
  const totalSelected = nondpsCount + dpsCount;
  const confirmReady = totalSelected === partySize;

  // Maps key prefix → short family name shown before the weapon name
  const PREFIX = {
    sword_: 'Sword',   axe_: 'Axe',      spear_: 'Spear',
    dagger_: 'Dagger', bow_: 'Bow',       xbow_: 'Crossbow',
    glove_: 'Gloves',  fire_: 'Fire',     frost_: 'Frost',
    curse_: 'Curse',   staff_: 'Staff',   shape_: 'Shape',  arcane_: 'Arcane',
  };
  const prefixLabel = (r) => {
    const p = Object.keys(PREFIX).find(k => r.key.startsWith(k));
    return p ? `${PREFIX[p]} - ${r.label}` : r.label;
  };

  const makeSelect = (customId, placeholder, roles, selected) =>
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(0)
      .setMaxValues(Math.min(partySize, roles.length))
      .addOptions(roles.map(r => ({ label: prefixLabel(r), value: r.key, default: selected.includes(r.key) })));

  return {
    content:
      `**Step 3b of 4** — Select DPS roles *(${totalSelected}/${partySize} total selected)*\n` +
      (confirmReady ? `✅ All slots filled — click Confirm!` : `Select DPS roles to reach exactly **${partySize}** total.`),
    components: [
      new ActionRowBuilder().addComponents(makeSelect('content_preset_dps_g1', '⚔️ Swords / Axes / Spears',           DPS_GROUPS.g1, selG1)),
      new ActionRowBuilder().addComponents(makeSelect('content_preset_dps_g2', '🗡️ Daggers / Bows / Crossbows',       DPS_GROUPS.g2, selG2)),
      new ActionRowBuilder().addComponents(makeSelect('content_preset_dps_g3', '🥊 Gloves / Fire Staff / Frost Staff', DPS_GROUPS.g3, selG3)),
      new ActionRowBuilder().addComponents(makeSelect('content_preset_dps_g4', '💀 Cursed / Quarterstaff / Shape / Arcane', DPS_GROUPS.g4, selG4)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('content_preset_to_nondps')
          .setLabel('← Back to Non-DPS')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('content_preset_confirm')
          .setLabel(confirmReady ? `✅ Confirm ${totalSelected} roles` : `Confirm (${totalSelected}/${partySize})`)
          .setStyle(confirmReady ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
    ],
  };
};

// Step 3 (Custom): one multiline modal — enter all roles, one per line
export const buildCustomRoleModal = (partySize) =>
  new ModalBuilder()
    .setCustomId('content_custom_modal')
    .setTitle(`Custom Roles — ${partySize} slots`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('custom_roles_text')
          .setLabel(`Enter ${partySize} roles, one per line`)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(
            'DPS — Shadowcaller (SC)\nHeal — Hallowfall (HF)\nTank — Grovekeeper (GA)\n...'
          )
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(1000),
      ),
    );

// "Set content details" button — shown when all slots are assigned
export const buildContinueToDetailsButton = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('content_details_btn')
      .setLabel('✏️ Set Content Details')
      .setStyle(ButtonStyle.Success),
  ),
];

// Step 4: content details modal (title / time / demass)
export const buildContentDetailsModal = () =>
  new ModalBuilder()
    .setCustomId('content_create_modal')
    .setTitle('Content Details')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('modal_title')
          .setLabel('Content Title')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. ROA Sunday Run')
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('modal_time')
          .setLabel('Time (e.g. 20:00 UTC)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('20:00 UTC')
          .setRequired(true)
          .setMaxLength(50),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('modal_demass')
          .setLabel('Demass Notice (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Leave blank if no demass notice')
          .setRequired(false)
          .setMaxLength(500),
      ),
    );

// Step 5: preview embed (yellow, not yet published)
export const buildContentPreviewEmbed = (pending) => {
  const { assignedRoles = [], customRoleNames = {}, title, time, demassNotice } = pending;

  const byCategory = { tank: [], heal: [], support: [], dps: [], custom: [] };
  assignedRoles.forEach((key, i) => {
    byCategory[getRoleCategory(key)].push({ key, slot: i + 1 });
  });

  const fields = [];
  for (const cat of CATEGORY_ORDER) {
    const entries = byCategory[cat];
    if (entries.length === 0) continue;
    const meta = CATEGORY_META[cat];
    const lines = entries.map(({ key, slot }) => `\`${slot}.\` ${getRoleShortLabel(key, customRoleNames)}`);
    fields.push({
      name: `${meta.emoji} ${meta.label} (${entries.length})`,
      value: lines.join('\n'),
      inline: entries.length <= 4,
    });
  }

  return new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle(`📋 Preview: ${title || 'Role Call'}`)
    .setDescription(
      `⚠️ **Not yet published** — review below, then Publish or Edit Details\n\n` +
      `🕒 ${formatEventTime(time)}` +
      (demassNotice ? `\n⚠️ **Demass:** ${demassNotice}` : '') +
      `\n**Party size:** ${assignedRoles.length}`
    )
    .addFields(fields);
};

// Step 3c (Preset): optional duplicate-slots step
export const buildDuplicatesStep = (pending) => {
  const { assignedRoles = [], customRoleNames = {} } = pending;

  // Count how many copies of each base key are already assigned
  const counts = {};
  for (const key of assignedRoles) {
    const base = getBaseKey(key);
    counts[base] = (counts[base] || 0) + 1;
  }

  const uniqueBases = [...new Set(assignedRoles.map(k => getBaseKey(k)))];

  const roleList = uniqueBases.map(base => {
    const name = getRoleDisplayName(base, customRoleNames);
    const c = counts[base];
    return `• ${name}${c > 1 ? ` ×${c}` : ''}`;
  }).join('\n');

  const selectOptions = uniqueBases.map(base => ({
    label: getRoleDisplayName(base, customRoleNames).substring(0, 100),
    value: base,
  }));

  const components = [];
  if (selectOptions.length > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('content_preset_dupe_select')
          .setPlaceholder('Select a role to add an extra copy')
          .setMinValues(0)
          .setMaxValues(Math.min(selectOptions.length, 25))
          .addOptions(selectOptions)
      )
    );
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('content_preset_add_dupe')
        .setLabel('➕ Add Extra Copy')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('content_preset_finalize')
        .setLabel(`✅ Set Details (${assignedRoles.length} slots)`)
        .setStyle(ButtonStyle.Success),
    )
  );

  return {
    content:
      `**Step 3c — Optional: Duplicate Role Slots**\n` +
      `Current slots (${assignedRoles.length}):\n${roleList}\n\n` +
      `Select a role above and click **➕ Add Extra Copy** to add an extra slot for that role.\n` +
      `Click **✅ Set Details** when your composition is ready.`,
    components,
  };
};

// Step 5: publish / edit-details buttons
export const buildPreviewComponents = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('content_preview_publish')
      .setLabel('✅ Publish')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('content_preview_edit')
      .setLabel('✏️ Edit Details')
      .setStyle(ButtonStyle.Secondary),
  ),
];

// ─── Auto-assign fill players ──────────────────────────────────────────────────

export async function autoAssignFillPlayers(client, callout) {
  const { activeRoles } = callout;
  if (!activeRoles || activeRoles.length === 0) return;

  // Shuffle fill array so assignment order is unpredictable
  for (let i = callout.fill.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [callout.fill[i], callout.fill[j]] = [callout.fill[j], callout.fill[i]];
  }

  while (callout.fill.length > 0) {
    const emptySlots = activeRoles.filter(key => callout.roles[key] === null);
    if (emptySlots.length === 0) break;

    const emptySlot = emptySlots[Math.floor(Math.random() * emptySlots.length)];
    const fillPlayerId = callout.fill.shift();
    callout.roles[emptySlot] = fillPlayerId;
    console.log(`✅ Fill assigned: <@${fillPlayerId}> → ${emptySlot.toUpperCase()}`);

    try {
      const channel = await client.channels.fetch(callout.threadId);
      if (channel) {
        const displayName = getRoleDisplayName(emptySlot, callout.customRoleNames || {});
        await channel.send(`✅ <@${fillPlayerId}> has been automatically assigned to **${displayName}** from FILL!`);
      }
    } catch (err) {
      console.error('Error notifying fill player:', err);
    }
  }
}