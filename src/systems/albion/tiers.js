/**
 * Tenure tiers: roles granted automatically once a registration reaches a given age.
 * Age counts from the registration's created_at, which resets on re-register.
 * Thresholds are cumulative from registration (30d then 60d = second role at day 60).
 */

import { loadAlbionConfig, getAllAlbionUsers, setTiersGranted } from './albion-db.js';

const MS_PER_HOUR = 3600000;

export function tierThresholdMs(tier) {
  return ((tier.days || 0) * 24 + (tier.hours || 0)) * MS_PER_HOUR;
}

export function getSortedTiers(config) {
  return [...(config.loyaltyTiers || [])].sort((a, b) => tierThresholdMs(a) - tierThresholdMs(b));
}

/**
 * Grant every tier role that is due. Safe to run repeatedly: a tier is only
 * granted once per registration, so a role an admin removes by hand stays removed.
 */
export async function applyTiers(guild) {
  const config = loadAlbionConfig(guild.id);
  const tiers = getSortedTiers(config);
  if (tiers.length === 0) return { granted: 0 };

  const now = Date.now();
  const due = [];
  for (const record of getAllAlbionUsers(guild.id, null, true)) {
    const age = now - Date.parse(record.created_at);
    if (Number.isNaN(age)) continue;
    const have = new Set(record.tiers_granted || []);
    const newTiers = tiers.filter((t) => age >= tierThresholdMs(t) && !have.has(t.id));
    if (newTiers.length > 0) due.push({ record, have, newTiers });
  }
  if (due.length === 0) return { granted: 0 };

  await guild.members.fetch().catch((err) => console.error('❌ Tier sweep member fetch failed:', err));

  let granted = 0;
  for (const { record, have, newTiers } of due) {
    const member = guild.members.cache.get(record.discordId);
    if (!member) continue;

    for (const tier of newTiers) {
      if (!guild.roles.cache.has(tier.roleId)) continue; // role deleted
      try {
        await member.roles.add(tier.roleId);
        if (tier.replace) {
          const lower = tiers.filter((o) => tierThresholdMs(o) < tierThresholdMs(tier) && member.roles.cache.has(o.roleId));
          for (const o of lower) await member.roles.remove(o.roleId);
        }
        have.add(tier.id);
        granted++;
        console.log(`🏅 Tier ${tier.roleId} granted to ${record.discordId} in ${guild.id}`);
      } catch (err) {
        console.error(`❌ Could not grant tier ${tier.roleId} to ${record.discordId}:`, err.message);
      }
    }

    setTiersGranted(guild.id, record.discordId, record.register_type, [...have]);
  }

  return { granted };
}

/**
 * Remove the tier roles a registration had received (used on unregister/purge).
 */
export async function stripTierRoles(member, guildId, record) {
  const granted = new Set(record?.tiers_granted || []);
  if (granted.size === 0) return;
  for (const tier of loadAlbionConfig(guildId).loyaltyTiers || []) {
    if (granted.has(tier.id) && member.roles.cache.has(tier.roleId)) {
      await member.roles.remove(tier.roleId).catch(() => null);
    }
  }
}
