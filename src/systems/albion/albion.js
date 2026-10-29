/**
 * Albion Online registration system
 * Supports typed registrations: guild, alliance, player
 */

import { validatePlayerGuild, validatePlayerAlliance, fetchGuildInfo } from './albion-api.js';
import {
  loadAlbionConfig,
  getAlbionUser,
  saveAlbionUser,
  removeAlbionUser,
  getAllAlbionUsers,
  validateAlbionConfig,
  findAlbionUserByIGN
} from './albion-db.js';

const DEFAULT_ALLIANCE_ROLE_NAME = 'Alliance Member';
const DEFAULT_ALLIANCE_NICKNAME_FORMAT = '[{allianceTag}] | {playerName}';

async function applyNickname(guild, memberId, nickname) {
  try {
    const member = await guild.members.fetch(memberId);

    if (!member) {
      return { success: false, error: 'Member not found in guild.' };
    }

    const botMember = guild.members.me;
    if (!botMember.permissions.has('ManageNicknames')) {
      return { success: false, error: 'Bot lacks "Manage Nicknames" permission.' };
    }

    if (member.roles.highest.position >= botMember.roles.highest.position) {
      return { success: false, error: 'Cannot change nickname: user has higher or equal role.' };
    }

    let finalNickname = nickname;
    if (nickname.length > 32) {
      finalNickname = nickname.substring(0, 32);
      console.log(`⚠️ Nickname truncated from ${nickname.length} to 32 characters`);
    }

    await member.setNickname(finalNickname);
    return { success: true, nickname: finalNickname };
  } catch (error) {
    console.error('Error applying nickname:', error);
    return { success: false, error: 'Failed to apply nickname.' };
  }
}

function formatAllianceNickname(formatTemplate, playerData) {
  const template = (formatTemplate || DEFAULT_ALLIANCE_NICKNAME_FORMAT).trim();
  const allianceTag = (playerData.AllianceTag || '').trim();
  const allianceName = (playerData.AllianceName || '').trim();
  const playerName = (playerData.Name || '').trim();
  const effectiveAlliance = allianceTag || allianceName;

  if (!effectiveAlliance) {
    return playerName;
  }

  let nickname = template
    .replace(/\{allianceTag\}/g, allianceTag || '')
    .replace(/\{allianceName\}/g, allianceName || '')
    .replace(/\{playerName\}/g, playerName || '')
    .replace(/\{alliance\}/g, effectiveAlliance);

  // Remove common artifacts when alliance values are absent.
  nickname = nickname
    .replace(/\[\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\|\s*\|/g, '|')
    .replace(/^\s*\|\s*/, '')
    .replace(/\s*\|\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return nickname || playerName;
}

function formatNickname(template, variables) {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value || '');
  }

  return result.replace(/\s+/g, ' ').trim();
}

async function resolveAllianceRole(guild, roleRef, allowAutoCreate) {
  if (!roleRef) {
    return {
      success: false,
      error: 'ROLE_NOT_CONFIGURED',
      message: 'Alliance role is not configured.'
    };
  }

  const byId = guild.roles.cache.get(roleRef);
  if (byId) {
    return { success: true, role: byId, created: false };
  }

  const byName = guild.roles.cache.find((role) => role.name.toLowerCase() === String(roleRef).toLowerCase());
  if (byName) {
    return { success: true, role: byName, created: false };
  }

  if (!allowAutoCreate) {
    return {
      success: false,
      error: 'ROLE_NOT_FOUND',
      message: `Configured alliance role "${roleRef}" was not found.`
    };
  }

  const botMember = guild.members.me;
  if (!botMember.permissions.has('ManageRoles')) {
    return {
      success: false,
      error: 'MISSING_PERMISSIONS',
      message: `Missing permission to create role "${roleRef}".`
    };
  }

  try {
    const createdRole = await guild.roles.create({
      name: String(roleRef || DEFAULT_ALLIANCE_ROLE_NAME),
      reason: 'Alliance registration system role auto-create'
    });
    return { success: true, role: createdRole, created: true };
  } catch (error) {
    console.error('Error creating configured alliance role:', error);
    return {
      success: false,
      error: 'ROLE_CREATE_FAILED',
      message: `Failed to create configured alliance role "${roleRef}".`
    };
  }
}

async function assignRoleByType(guild, discordId, registerType, config) {
  let targetRoleIds = [];
  const resolvedRoleNames = [];

  if (registerType === 'alliance') {
    if (!config.allianceRoleEnabled) {
      return { success: true, assigned: false, roleName: null, warning: 'Alliance role assignment is disabled in config.' };
    }

    const configuredRoles = Array.isArray(config.allianceRoleIds) && config.allianceRoleIds.length > 0
      ? config.allianceRoleIds
      : [];

    for (const roleRef of configuredRoles) {
      const roleResult = await resolveAllianceRole(guild, roleRef, config.allianceRoleAutoCreate === true);
      if (!roleResult.success) {
        return { success: true, assigned: false, roleName: null, warning: roleResult.message };
      }
      targetRoleIds.push(roleResult.role.id);
      resolvedRoleNames.push(roleResult.role.name);
    }

    if (targetRoleIds.length === 0) {
      return { success: true, assigned: false, roleName: null, warning: 'Alliance role assignment skipped: no alliance role configured.' };
    }
  } else if (registerType === 'guild' && config.registerRoleId) {
    targetRoleIds = [config.registerRoleId];
    const guildRole = guild.roles.cache.get(config.registerRoleId);
    if (guildRole) {
      resolvedRoleNames.push(guildRole.name);
    }
  }

  if (targetRoleIds.length === 0) {
    return { success: true, assigned: false, roleName: null };
  }

  // Check the usual causes up front so the user gets an actionable message
  // instead of a generic failure.
  const botMember = guild.members.me;
  if (!botMember?.permissions.has('ManageRoles')) {
    return { success: true, assigned: false, warning: 'The bot is missing the **Manage Roles** permission. Ask an admin to grant it.' };
  }
  for (const roleId of targetRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return { success: true, assigned: false, warning: 'The configured role no longer exists. An admin needs to set it again with `/set register-role`.' };
    }
    if (role.managed || role.id === guild.id) {
      return { success: true, assigned: false, warning: `**${role.name}** is a managed/@everyone role and cannot be assigned. An admin needs to pick a different role.` };
    }
    if (role.position >= botMember.roles.highest.position) {
      return { success: true, assigned: false, warning: `The bot's role must be **above** **${role.name}**. An admin needs to move the bot's role higher in Server Settings → Roles.` };
    }
  }

  try {
    const member = await guild.members.fetch(discordId);
    if (!member) {
      return { success: false, assigned: false, message: 'Member not found in guild.' };
    }

    for (const roleId of targetRoleIds) {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
      }
    }

    return {
      success: true,
      assigned: true,
      roleName: resolvedRoleNames.length > 0 ? resolvedRoleNames.join(', ') : (registerType === 'alliance' ? DEFAULT_ALLIANCE_ROLE_NAME : 'Registered Member')
    };
  } catch (error) {
    console.error(`Error assigning role (Discord code ${error.code ?? 'n/a'}):`, error);
    return { success: true, assigned: false, warning: `Failed to assign one or more configured roles (${error.message || 'unknown error'}).` };
  }
}

function normalizeRegisterType(registerType) {
  return (registerType || 'guild').toLowerCase();
}

function buildRegistrationPayload(guild, discordId, region, registerType, validationData) {
  return {
    registerType,
    region,
    ign: validationData.Name,
    playerId: validationData.Id,
    guildId: validationData.GuildId || null,
    guild: validationData.GuildName || null,
    allianceId: validationData.AllianceId || null,
    allianceName: validationData.AllianceName || null,
    allianceTag: validationData.AllianceTag || null,
    discordId,
    guildDiscordId: guild.id,
    isActive: true
  };
}

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function isSameAlbionIdentity(existingRecord, registrationPayload) {
  if (!existingRecord || !registrationPayload) {
    return false;
  }

  const existingPlayerId = existingRecord.player_id || existingRecord.playerId || null;
  const incomingPlayerId = registrationPayload.playerId || null;

  if (existingPlayerId && incomingPlayerId) {
    return existingPlayerId === incomingPlayerId;
  }

  const existingIgn = normalizeString(existingRecord.player_name || existingRecord.ign);
  const incomingIgn = normalizeString(registrationPayload.ign);
  if (!existingIgn || !incomingIgn || existingIgn !== incomingIgn) {
    return false;
  }

  const existingRegion = normalizeString(existingRecord.albion_region || existingRecord.region);
  const incomingRegion = normalizeString(registrationPayload.region);
  return existingRegion === incomingRegion;
}

function findIdentityOwnerConflict(registrations, registrationPayload, discordId) {
  for (const registration of registrations) {
    if (registration.is_active === false) {
      continue;
    }

    if (!isSameAlbionIdentity(registration, registrationPayload)) {
      continue;
    }

    if (registration.discord_user_id !== discordId) {
      return registration;
    }
  }

  return null;
}

/**
 * Register a user with typed verification.
 * Backward compatible signature:
 * registerUser(guild, discordId, region, ign, playerId, registerType)
 */
export async function registerUser(guild, discordId, region, ign, playerId = null, registerType = 'guild') {
  const guildId = guild.id;
  const normalizedType = normalizeRegisterType(registerType);
  const config = loadAlbionConfig(guildId);

  // The server's configured region always wins: both the guild and its alliance
  // live on one Albion server, and a caller-supplied region would let someone
  // match a same-named guild/player on a different server.
  region = config.albionRegion || region;

  let validation;

  if (normalizedType === 'alliance') {
    if (!config.albionGuildName || !config.albionRegion) {
      return {
        success: false,
        error: 'INCOMPLETE_CONFIG',
        message: 'Alliance registration requires the guild and region to be configured first (/set guild). Please contact an administrator.'
      };
    }

    // Look up the guild's *current* alliance live, rather than a static config
    // value, so this automatically follows if the guild ever switches alliances.
    const homeGuildInfo = await fetchGuildInfo(config.albionRegion, config.albionGuildName);
    if (!homeGuildInfo.success) {
      return homeGuildInfo;
    }
    if (!homeGuildInfo.data.AllianceId) {
      return {
        success: false,
        error: 'GUILD_NOT_IN_ALLIANCE',
        message: `${config.albionGuildName} is not currently in an alliance, so alliance registration isn't available right now.`
      };
    }

    validation = await validatePlayerAlliance(region, ign, playerId, homeGuildInfo.data.AllianceId);
  } else {
    const configValidation = validateAlbionConfig(config);
    if (!configValidation.valid) {
      return {
        success: false,
        error: 'INCOMPLETE_CONFIG',
        message: `Server configuration incomplete. Missing: ${configValidation.missing.join(', ')}. Please contact an administrator.`
      };
    }

    validation = await validatePlayerGuild(region, ign, config.albionGuildName, playerId);
  }

  if (!validation.success) {
    return validation;
  }

  const registrationPayload = buildRegistrationPayload(guild, discordId, region, normalizedType, validation.data);

  const existingUserRegistration = getAlbionUser(guildId, discordId, normalizedType);
  if (existingUserRegistration && isSameAlbionIdentity(existingUserRegistration, registrationPayload)) {
    return {
      success: false,
      error: 'ALREADY_REGISTERED',
      message: `You are already registered as **${registrationPayload.ign}** (${normalizedType.toUpperCase()}).`
    };
  }

  const allActiveRegistrations = getAllAlbionUsers(guildId, null, true);
  const identityConflict = findIdentityOwnerConflict(allActiveRegistrations, registrationPayload, discordId);
  if (identityConflict) {
    const ownerDiscordId = identityConflict.discord_user_id;
    const ownerType = (identityConflict.register_type || 'guild').toUpperCase();
    const ownerIgn = identityConflict.player_name || identityConflict.ign || registrationPayload.ign;

    return {
      success: false,
      error: 'IGN_ALREADY_REGISTERED',
      message: `Character **${ownerIgn}** is already registered to <@${ownerDiscordId}> (${ownerType}). This character/alliance identity can only be owned by one Discord account.`
    };
  }

  // Upsert active registration for one user/type pair.
  saveAlbionUser(guildId, discordId, registrationPayload);

  const roleResult = await assignRoleByType(guild, discordId, normalizedType, config);

  let nicknameResult = { success: false };
  if (normalizedType === 'alliance') {
    if (config.allianceNicknameEnabled) {
      try {
        const member = await guild.members.fetch(discordId);
        if (member) {
          const hasPermission = guild.members.me.permissions.has('ManageNicknames');
          const canEditMember = member.manageable;
          const shouldOverwrite = config.allianceNicknameOverwrite !== false;

          if (!hasPermission || !canEditMember) {
            nicknameResult = {
              success: false,
              warning: 'Nickname update skipped due to Discord permission or role hierarchy.'
            };
          } else if (!shouldOverwrite && member.nickname) {
            nicknameResult = {
              success: false,
              warning: 'Nickname update skipped because overwrite is disabled and member already has a nickname.'
            };
          } else {
            const nicknameBase = formatAllianceNickname(config.allianceNicknameFormat, validation.data);
            const maxLen = Number.isInteger(config.allianceNicknameMaxLength)
              ? Math.min(Math.max(config.allianceNicknameMaxLength, 1), 32)
              : 32;
            const finalNickname = nicknameBase.length > maxLen ? nicknameBase.substring(0, maxLen).trim() : nicknameBase;
            nicknameResult = await applyNickname(guild, discordId, finalNickname);
          }
        }
      } catch (error) {
        console.error('Alliance nickname update failed:', error);
        nicknameResult = {
          success: false,
          warning: 'Nickname update failed unexpectedly.'
        };
      }
    } else {
      nicknameResult = {
        success: false,
        warning: 'Nickname updates are disabled in config.'
      };
    }
  } else if (config.nicknameFormat) {
    const nicknameVars = {
      ign: validation.data.Name,
      tag: config.guildTag || validation.data.AllianceTag || '',
      guild: validation.data.GuildName || '',
      region: region.toUpperCase()
    };

    const formattedNickname = formatNickname(config.nicknameFormat, nicknameVars);
    nicknameResult = await applyNickname(guild, discordId, formattedNickname);
  }

  const successMessage = normalizedType === 'alliance'
    ? `Successfully registered as **${validation.data.Name}** from alliance **${validation.data.AllianceName}**!`
    : `Successfully registered as **${validation.data.Name}** from guild **${validation.data.GuildName}**!`;

  return {
    success: true,
    message: successMessage,
    data: {
      ign: validation.data.Name,
      region,
      guild: validation.data.GuildName,
      alliance: validation.data.AllianceName,
      allianceTag: validation.data.AllianceTag,
      registerType: normalizedType,
      roleAssigned: roleResult.assigned,
      roleName: roleResult.roleName || null,
      roleWarning: roleResult.warning || null,
      nicknameApplied: nicknameResult.success,
      nickname: nicknameResult.nickname,
      nicknameWarning: nicknameResult.warning || null
    }
  };
}

/**
 * Purge users by registration type.
 * For alliance registrations this re-verifies each currently role-holding
 * member against the guild's *current* alliance (looked up live) and removes
 * anyone who no longer belongs - mirroring how guild purge already works.
 */
export async function purgeUsers(guild, registerType = 'guild') {
  const guildId = guild.id;
  const normalizedType = normalizeRegisterType(registerType);
  const config = loadAlbionConfig(guildId);

  if (normalizedType === 'alliance') {
    if (!config.albionGuildName || !config.albionRegion) {
      return {
        success: false,
        error: 'INCOMPLETE_CONFIG',
        message: 'Alliance purge requires the guild and region to be configured first (/set guild).'
      };
    }

    const homeGuildInfo = await fetchGuildInfo(config.albionRegion, config.albionGuildName);
    if (!homeGuildInfo.success) {
      return homeGuildInfo;
    }
    if (!homeGuildInfo.data.AllianceId) {
      return {
        success: false,
        error: 'GUILD_NOT_IN_ALLIANCE',
        message: `${config.albionGuildName} is not currently in an alliance, so there is nothing to verify alliance registrations against.`
      };
    }
    const currentAllianceId = homeGuildInfo.data.AllianceId;

    const configuredRoles = Array.isArray(config.allianceRoleIds) ? config.allianceRoleIds : [];
    const resolvedRoleIds = [];
    for (const roleRef of configuredRoles) {
      const roleResult = await resolveAllianceRole(guild, roleRef, false);
      if (roleResult.success) {
        resolvedRoleIds.push(roleResult.role.id);
      }
    }

    let membersToCheck = [];
    try {
      await guild.members.fetch();
      const seen = new Set();
      for (const roleId of resolvedRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (!role) continue;
        for (const member of role.members.values()) {
          if (!seen.has(member.id)) {
            seen.add(member.id);
            membersToCheck.push(member);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching members for alliance purge:', error);
      return {
        success: false,
        error: 'FETCH_ERROR',
        message: 'Failed to fetch server members.'
      };
    }

    const summary = {
      success: true,
      checked: 0,
      removed: 0,
      valid: 0,
      errors: 0,
      details: []
    };

    for (const member of membersToCheck) {
      summary.checked++;
      const registration = getAlbionUser(guildId, member.id, 'alliance');

      if (!registration) {
        // Holds an alliance role but has no registration at all (e.g. manually
        // assigned) - treat the same as an alliance mismatch: remove the role.
        summary.removed++;
        for (const roleId of resolvedRoleIds) {
          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(() => null);
          }
        }
        summary.details.push({ discordId: member.id, status: 'no_data', action: 'removed' });
      } else {
        try {
          const validation = await validatePlayerAlliance(
            registration.region,
            registration.ign,
            registration.playerId,
            currentAllianceId
          );

          if (validation.success) {
            summary.valid++;
          } else {
            summary.removed++;
            for (const roleId of resolvedRoleIds) {
              if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId).catch(() => null);
              }
            }
            removeAlbionUser(guildId, member.id, 'alliance');
          }
        } catch (error) {
          summary.errors++;
          console.error(`Error checking alliance for ${registration.ign}:`, error);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return summary;
  }

  const configValidation = validateAlbionConfig(config);
  if (!configValidation.valid) {
    return {
      success: false,
      error: 'INCOMPLETE_CONFIG',
      message: `Server configuration incomplete. Missing: ${configValidation.missing.join(', ')}.`
    };
  }

  let membersToCheck = [];
  try {
    await guild.members.fetch();
    const role = guild.roles.cache.get(config.registerRoleId);

    if (!role) {
      return {
        success: false,
        error: 'ROLE_NOT_FOUND',
        message: 'Register role not found in server.'
      };
    }

    membersToCheck = role.members.map((m) => ({
      id: m.id,
      user: m.user,
      member: m
    }));
  } catch (error) {
    console.error('Error fetching members:', error);
    return {
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch server members.'
    };
  }

  const results = {
    checked: 0,
    removed: 0,
    valid: 0,
    errors: 0,
    details: []
  };

  for (const { id, user, member } of membersToCheck) {
    results.checked++;
    const userData = getAlbionUser(guildId, id, 'guild');

    if (!userData) {
      // Member holds the register role but has no registration record at all
      // (e.g. manually assigned by an admin) - treat the same as a guild
      // mismatch: strip the role and reset the nickname.
      results.removed++;
      await member.roles.remove(config.registerRoleId).catch(() => null);
      await member.setNickname(null).catch(() => null);
      results.details.push({
        discordId: id,
        username: user.username,
        status: 'no_data',
        action: 'removed'
      });
    } else {
      try {
        const validation = await validatePlayerGuild(
          userData.region,
          userData.ign,
          config.albionGuildName,
          userData.playerId
        );

        if (validation.success) {
          results.valid++;
        } else {
          results.removed++;
          await member.roles.remove(config.registerRoleId).catch(() => null);
          await member.setNickname(null).catch(() => null);
          removeAlbionUser(guildId, id, 'guild');
        }
      } catch (error) {
        results.errors++;
        console.error(`Error checking ${user.username}:`, error);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return {
    success: true,
    ...results
  };
}

export async function unregisterUser(guild, discordId, registerType = 'guild') {
  const guildId = guild.id;
  const normalizedType = normalizeRegisterType(registerType);
  const config = loadAlbionConfig(guildId);

  const userData = getAlbionUser(guildId, discordId, normalizedType);
  if (!userData) {
    return {
      success: false,
      error: 'NOT_REGISTERED',
      message: 'You are not registered in the system.'
    };
  }

  removeAlbionUser(guildId, discordId, normalizedType);

  let roleRemoved = false;
  try {
    const member = await guild.members.fetch(discordId);
    if (member) {
      if (normalizedType === 'alliance') {
        const configuredRoles = Array.isArray(config.allianceRoleIds) ? config.allianceRoleIds : [];
        for (const roleRef of configuredRoles) {
          const roleResult = await resolveAllianceRole(guild, roleRef, false);
          if (roleResult.success && member.roles.cache.has(roleResult.role.id)) {
            await member.roles.remove(roleResult.role.id);
            roleRemoved = true;
          }
        }
      } else if (config.registerRoleId && member.roles.cache.has(config.registerRoleId)) {
        await member.roles.remove(config.registerRoleId);
        roleRemoved = true;
      }
    }
  } catch (error) {
    console.error('Error removing role:', error);
  }

  let nicknameReset = false;
  try {
    const member = await guild.members.fetch(discordId);
    if (member) {
      await member.setNickname(null);
      nicknameReset = true;
    }
  } catch (error) {
    console.error('Error resetting nickname:', error);
  }

  return {
    success: true,
    message: `Successfully unregistered ${userData.ign}.`,
    data: {
      ign: userData.ign,
      roleRemoved,
      nicknameReset
    }
  };
}

export { findAlbionUserByIGN };