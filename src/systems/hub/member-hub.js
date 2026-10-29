/**
 * Member hub: one public panel of buttons so players never need slash commands.
 * An admin posts it once with /panel; every button replies privately (and the
 * reply cleans itself up - see scheduleEphemeralDismiss in utils.js).
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BOT_NAME } from '../../config/constants.js';
import { getBalance, CURRENCY } from '../bank/bank.js';
import { unregisterUser } from '../albion/albion.js';

export const HUB_REGISTER = 'hub_register';
export const HUB_UNREGISTER = 'hub_unregister';
export const HUB_BALANCE = 'hub_balance';
export const HUB_HELP = 'hub_help';

export function buildHubPanel(customMessage = null) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🛡️ ${BOT_NAME} - Member Hub`)
    .setDescription(
      customMessage ||
      '**Register** to get your guild role and nickname, check your **balance**, or open **help**.\n' +
      'Everything you click here is private - only you see the reply.'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(HUB_REGISTER).setLabel('Register').setEmoji('📝').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(HUB_UNREGISTER).setLabel('Unregister').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(HUB_BALANCE).setLabel('My Balance').setEmoji('💰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(HUB_HELP).setLabel('Help').setEmoji('❓').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}

export function buildBalanceBody(guildId, userId) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('💰 Bank Balance')
    .setDescription(`**Balance:** ${CURRENCY}${getBalance(guildId, userId).toLocaleString()}`)
    .setTimestamp();
  return { embeds: [embed.toJSON()], components: [], flags: 64 };
}

/** Remove the caller's guild + alliance registrations; returns a message body. */
export async function buildUnregisterBody(guild, userId) {
  // Remove both registration types so alliance-only or guild-only users can unregister.
  // (Legacy 'player' registrations are normalized to 'guild' on load - see albion-db.js.)
  const attempts = await Promise.all([
    unregisterUser(guild, userId, 'alliance'),
    unregisterUser(guild, userId, 'guild')
  ]);
  const successful = attempts.filter((entry) => entry.success);

  if (successful.length === 0) {
    return { content: '❌ You are not registered in the system.', embeds: [], components: [], flags: 64 };
  }

  const first = successful[0];
  const removedTypes = successful
    .map((entry) => (entry.data?.registerType || 'guild').toUpperCase())
    .join(', ');

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('✅ Unregistered Successfully')
    .setDescription('Your registration has been removed from the verification system.')
    .addFields(
      { name: 'Previous IGN', value: first.data.ign, inline: true },
      { name: 'Removed Type(s)', value: removedTypes, inline: true },
      { name: 'Role Removed', value: first.data.roleRemoved ? '✅ Yes' : '⚠️ No', inline: true },
      { name: 'Nickname Reset', value: first.data.nicknameReset ? '✅ Yes' : '⚠️ No', inline: true }
    )
    .setTimestamp();

  return { content: null, embeds: [embed.toJSON()], components: [], flags: 64 };
}
