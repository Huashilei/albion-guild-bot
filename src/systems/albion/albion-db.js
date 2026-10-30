/**
 * Albion Database Functions
 * Per-guild storage for Albion configuration and registered users
 */

import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../../config/constants.js';
import { writeJsonAtomicSync } from '../../utils/atomicFile.js';

// File paths for Albion data
const getAlbionConfigFile = (guildId) => path.join(DATA_DIR, `albion-config-${guildId}.json`);
const getAlbionUsersFile = (guildId) => path.join(DATA_DIR, `albion-users-${guildId}.json`);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function registrationKey(discordUserId, registerType) {
  return `${discordUserId}:${registerType}`;
}

function normalizeRegisterType(registerType) {
  return (registerType || 'guild').toLowerCase();
}

function toLegacyView(record) {
  return {
    ...record,
    discordId: record.discord_user_id,
    ign: record.player_name,
    region: record.albion_region,
    guild: record.guild_name,
    playerId: record.player_id,
    registeredAt: record.created_at,
    lastVerified: record.verified_at
  };
}

function toRegistrationRecord(guildId, discordId, userData, existingRecord = null) {
  const now = new Date().toISOString();
  const registerType = normalizeRegisterType(userData.registerType);
  // Re-registering after unregister/purge starts a fresh timeline (tenure tiers restart)
  const continuing = existingRecord && existingRecord.is_active !== false;

  const record = {
    id: existingRecord?.id || `${discordId}-${registerType}`,
    discord_user_id: discordId,
    discord_guild_id: guildId,
    albion_region: userData.region,
    register_type: registerType,
    player_id: userData.playerId || null,
    player_name: userData.ign || null,
    guild_id: userData.guildId || null,
    guild_name: userData.guild || null,
    alliance_id: userData.allianceId || null,
    alliance_name: userData.allianceName || null,
    alliance_tag: userData.allianceTag || null,
    verified_at: now,
    is_active: userData.isActive !== false,
    created_at: (continuing && existingRecord.created_at) || now,
    tiers_granted: continuing ? (existingRecord.tiers_granted || []) : [],
    updated_at: now
  };

  return toLegacyView(record);
}

/**
 * Load Albion configuration for a guild
 * @param {string} guildId
 * @returns {Object} Configuration object
 */
export function loadAlbionConfig(guildId) {
  try {
    const file = getAlbionConfigFile(guildId);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (error) {
    console.error(`Error loading Albion config for guild ${guildId}:`, error);
  }
  
  // Default configuration
  return {
    albionRegion: null,
    albionGuildName: null,
    registerRoleId: null,
    loyaltyTiers: [], // [{ id: roleId, roleId, days, hours, replace }]
    guildTag: null,
    nicknameFormat: '{tag} {ign}',
    allianceRoleEnabled: true,
    allianceRoleIds: [],
    allianceRoleAutoCreate: false,
    allianceNicknameEnabled: true,
    allianceNicknameFormat: '[{allianceTag}] | {playerName}',
    allianceNicknameOverwrite: true,
    allianceNicknameMaxLength: 32
  };
}

/**
 * Save Albion configuration for a guild
 * @param {string} guildId
 * @param {Object} config - Configuration object
 */
export function saveAlbionConfig(guildId, config) {
  try {
    ensureDataDir();
    const file = getAlbionConfigFile(guildId);
    writeJsonAtomicSync(file, config);
    console.log(`✅ Albion config saved for guild ${guildId}`);
  } catch (error) {
    console.error(`❌ Error saving Albion config for guild ${guildId}:`, error);
  }
}

/**
 * Load registered users for a guild
 * @param {string} guildId
 * @returns {Map} Map of discordId -> user data
 */
export function loadAlbionUsers(guildId) {
  try {
    const file = getAlbionUsersFile(guildId);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const users = new Map();

      for (const [key, value] of Object.entries(data)) {
        if (value && value.register_type) {
          // 'player' was a legacy registration type functionally identical to
          // 'guild' (same validation, role, and nickname) and has been
          // removed as a selectable option - fold any existing records into
          // 'guild' on load so they keep working with purge/unregister/etc.
          if (value.register_type === 'player') {
            const record = { ...value, register_type: 'guild' };
            users.set(registrationKey(record.discord_user_id, 'guild'), toLegacyView(record));
          } else {
            users.set(key, toLegacyView(value));
          }
          continue;
        }

        // Migrate legacy shape keyed by discord id.
        if (value && value.ign) {
          const migrated = toRegistrationRecord(guildId, value.discordId || key, {
            registerType: 'guild',
            region: value.region,
            ign: value.ign,
            guild: value.guild,
            playerId: value.playerId,
            isActive: true
          }, {
            id: `${value.discordId || key}-guild`,
            created_at: value.registeredAt || new Date().toISOString()
          });
          users.set(registrationKey(migrated.discord_user_id, migrated.register_type), migrated);
        }
      }

      return users;
    }
  } catch (error) {
    console.error(`Error loading Albion users for guild ${guildId}:`, error);
  }
  return new Map();
}

/**
 * Save registered users for a guild
 * @param {string} guildId
 * @param {Map} users - Map of discordId -> user data
 */
export function saveAlbionUsers(guildId, users) {
  try {
    ensureDataDir();
    const file = getAlbionUsersFile(guildId);
    const data = {};

    for (const [key, user] of users.entries()) {
      data[key] = {
        id: user.id,
        discord_user_id: user.discord_user_id,
        discord_guild_id: user.discord_guild_id,
        albion_region: user.albion_region,
        register_type: user.register_type,
        player_id: user.player_id,
        player_name: user.player_name,
        guild_id: user.guild_id,
        guild_name: user.guild_name,
        alliance_id: user.alliance_id,
        alliance_name: user.alliance_name,
        alliance_tag: user.alliance_tag,
        verified_at: user.verified_at,
        is_active: user.is_active,
        created_at: user.created_at,
        tiers_granted: user.tiers_granted || [],
        updated_at: user.updated_at
      };
    }

    writeJsonAtomicSync(file, data);
    console.log(`✅ Albion users saved for guild ${guildId}`);
  } catch (error) {
    console.error(`❌ Error saving Albion users for guild ${guildId}:`, error);
  }
}

/**
 * Get registered user by Discord ID
 * @param {string} guildId
 * @param {string} discordId
 * @returns {Object|null} User data or null
 */
export function getAlbionUser(guildId, discordId, registerType = 'guild') {
  const users = loadAlbionUsers(guildId);
  const key = registrationKey(discordId, normalizeRegisterType(registerType));
  const record = users.get(key);
  if (!record || record.is_active === false) {
    return null;
  }
  return record;
}

/**
 * Register or update a user
 * @param {string} guildId
 * @param {string} discordId
 * @param {Object} userData - { ign, region, guild, playerId }
 */
export function saveAlbionUser(guildId, discordId, userData) {
  const registerType = normalizeRegisterType(userData.registerType);
  const users = loadAlbionUsers(guildId);
  const key = registrationKey(discordId, registerType);
  const existing = users.get(key);
  const record = toRegistrationRecord(guildId, discordId, {
    ...userData,
    registerType,
    isActive: true
  }, existing);

  users.set(key, record);
  
  saveAlbionUsers(guildId, users);
}

/**
 * Remove a user from the database
 * @param {string} guildId
 * @param {string} discordId
 * @returns {boolean} True if user was removed
 */
export function removeAlbionUser(guildId, discordId, registerType = 'guild') {
  const users = loadAlbionUsers(guildId);
  const key = registrationKey(discordId, normalizeRegisterType(registerType));
  const existing = users.get(key);

  if (!existing) {
    return false;
  }

  users.set(key, {
    ...existing,
    is_active: false,
    updated_at: new Date().toISOString()
  });
  saveAlbionUsers(guildId, users);

  return true;
}

/**
 * Record which tenure tiers an active registration has already received
 * @param {string} guildId
 * @param {string} discordId
 * @param {string} registerType
 * @param {string[]} tierIds
 */
export function setTiersGranted(guildId, discordId, registerType, tierIds) {
  const users = loadAlbionUsers(guildId);
  const key = registrationKey(discordId, normalizeRegisterType(registerType));
  const existing = users.get(key);
  if (!existing) return;
  users.set(key, { ...existing, tiers_granted: tierIds });
  saveAlbionUsers(guildId, users);
}

/**
 * Get all registered users for a guild
 * @param {string} guildId
 * @returns {Array} Array of user objects
 */
export function getAllAlbionUsers(guildId, registerType = null, activeOnly = true) {
  const users = loadAlbionUsers(guildId);
  const normalizedType = registerType ? normalizeRegisterType(registerType) : null;

  return Array.from(users.values()).filter((record) => {
    if (normalizedType && record.register_type !== normalizedType) {
      return false;
    }
    if (activeOnly && record.is_active === false) {
      return false;
    }
    return true;
  });
}

/**
 * Find user by in-game name (case-insensitive)
 * @param {string} guildId
 * @param {string} ign
 * @returns {Object|null} User data with discordId or null
 */
export function findAlbionUserByIGN(guildId, ign) {
  const users = getAllAlbionUsers(guildId, null, true);
  const normalizedIgn = ign.toLowerCase();

  for (const userData of users) {
    if (userData.ign && userData.ign.toLowerCase() === normalizedIgn) {
      return userData;
    }
  }
  
  return null;
}

/**
 * Find all active users by in-game name (case-insensitive)
 * @param {string} guildId
 * @param {string} ign
 * @returns {Array} Matched user registrations
 */
export function findAlbionUsersByIGN(guildId, ign) {
  const users = getAllAlbionUsers(guildId, null, true);
  const normalizedIgn = ign.toLowerCase();

  return users.filter((userData) =>
    userData.ign && userData.ign.toLowerCase() === normalizedIgn
  );
}


/**
 * Check if configuration is complete
 * @param {Object} config
 * @returns {Object} { valid: boolean, missing: string[] }
 */
export function validateAlbionConfig(config) {
  const missing = [];
  
  if (!config.albionRegion) missing.push('region');
  if (!config.albionGuildName) missing.push('guild name');
  if (!config.registerRoleId) missing.push('register role');
  
  return {
    valid: missing.length === 0,
    missing
  };
}
