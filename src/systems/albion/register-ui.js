/**
 * Guided registration flow: join-type buttons -> IGN modal.
 * The Albion region always comes from the server's /set guild config, so
 * players never have to pick (or mis-pick) it. Stateless: the type is carried
 * in each step's custom_id.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

export const REGISTER_TYPE_PREFIX = 'albreg_type_';
export const REGISTER_MODAL_PREFIX = 'albreg_modal_';
export const REGISTER_IGN_FIELD = 'albreg_ign';

export function isValidRegisterType(type) {
  return ['guild', 'alliance'].includes(type);
}

/** Message body for when registration isn't usable yet (admin hasn't run /set). */
export function buildNotConfiguredPanel() {
  return {
    content: '❌ Registration is not set up on this server yet. Ask an admin to run `/set guild` and `/set register-role`.',
    embeds: [],
    components: []
  };
}

export function buildTypePanel(config) {
  if (!config?.albionRegion || !config?.albionGuildName) {
    return buildNotConfiguredPanel();
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📝 Register your Albion character')
    .setDescription(
      'How are you joining?\n' +
      `• **Guild member** - you are in **${config.albionGuildName}** in-game\n` +
      '• **Alliance member** - you are in our alliance (another guild) in-game'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${REGISTER_TYPE_PREFIX}guild`)
      .setLabel('Guild member')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${REGISTER_TYPE_PREFIX}alliance`)
      .setLabel('Alliance member')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}

export function buildIgnModal(registerType) {
  return new ModalBuilder()
    .setCustomId(`${REGISTER_MODAL_PREFIX}${registerType}`)
    .setTitle('Your character')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(REGISTER_IGN_FIELD)
          .setLabel('In-game name')
          .setPlaceholder('Exactly as it appears in Albion Online')
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(32)
          .setRequired(true)
      )
    );
}

/**
 * Turn a registerUser() result into a message body for editing the
 * interaction's original response. Always resets embeds/components so it
 * cleanly replaces whatever panel was showing.
 */
export function buildRegistrationResponse(result, { userId, region, registerType, ign = null, playerId = null }) {
  const base = { content: null, embeds: [], components: [], flags: 64 };

  if (!result.success) {
    if (result.error === 'MULTIPLE_MATCHES') {
      const embed = new EmbedBuilder()
        .setColor(0xF0B900)
        .setTitle('⚠️ Multiple Players Found')
        .setDescription(`${result.message}\n\n**Click the button for your character:**`)
        .setFooter({ text: 'Buttons will expire after 5 minutes' });

      result.players.forEach((player, index) => {
        const guildInfo = player.GuildName ? `**Guild:** ${player.GuildName}` : '**Guild:** None';
        const allianceInfo = player.AllianceName ? `\n**Alliance:** ${player.AllianceName}` : '';
        embed.addFields({
          name: `${index + 1}. ${player.Name}`,
          value: `**Player ID:** ${player.Id}\n${guildInfo}${allianceInfo}`,
          inline: false
        });
      });

      const buttons = result.players.slice(0, 5).map((player, index) =>
        new ButtonBuilder()
          .setCustomId(`albion_register_${userId}_${region}_${registerType}_${player.Id}`)
          .setLabel(`${index + 1}. ${player.GuildName || 'No Guild'}`)
          .setStyle(player.GuildName ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setEmoji(player.GuildName ? '✅' : '❌')
      );

      return {
        ...base,
        embeds: [embed.toJSON()],
        components: [new ActionRowBuilder().addComponents(buttons).toJSON()]
      };
    }

    let content = `❌ Registration failed: ${result.message}`;
    const who = result.data?.Name || ign || playerId;

    if (result.error === 'ALREADY_REGISTERED' || result.error === 'IGN_ALREADY_REGISTERED' || result.error === 'INCOMPLETE_CONFIG') {
      content = `❌ ${result.message}`;
    } else if (result.error === 'PLAYER_NOT_FOUND') {
      const identifier = playerId ? `Player ID **${playerId}**` : `Player **${ign}**`;
      content = `❌ ${identifier} not found on the **${region}** server.\n\nPlease check the spelling of your in-game name.`;
    } else if (result.error === 'NO_ALLIANCE') {
      content = `❌ Player **${who}** is not in any alliance.\n\nYou must join an alliance in-game first, then register.`;
    } else if (result.error === 'NO_GUILD') {
      content = `❌ Player **${who}** is not in any guild.\n\nYou must join the guild in-game first, then register.`;
    } else if (result.error === 'GUILD_MISMATCH') {
      content = `❌ ${result.message}\n\nYou must be in the correct guild to register.`;
    } else if (result.error === 'ALLIANCE_MISMATCH') {
      content = `❌ ${result.message}\n\nYou must be in our allied alliance to register as Alliance.`;
    } else if (result.error === 'GUILD_NOT_FOUND' || result.error === 'GUILD_NOT_IN_ALLIANCE') {
      content = `❌ ${result.message}\n\nPlease contact an administrator.`;
    }

    return { ...base, content: `${content}\n\nClick **Register** to try again.` };
  }

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Registration Successful')
    .setDescription(result.message)
    .addFields(
      { name: 'In-Game Name', value: result.data.ign, inline: true },
      { name: 'Type', value: (result.data.registerType || registerType).toUpperCase(), inline: true },
      { name: 'Region', value: (result.data.region || region).toUpperCase(), inline: true }
    )
    .setTimestamp();

  if (result.data.guild) {
    embed.addFields({ name: 'Guild', value: result.data.guild, inline: true });
  }
  if (result.data.alliance) {
    embed.addFields({ name: 'Alliance', value: result.data.alliance, inline: true });
  }

  if (result.data.roleAssigned) {
    embed.addFields({ name: 'Role', value: `✅ ${result.data.roleName || 'Assigned'}`, inline: true });
  } else if (result.data.roleWarning) {
    embed.addFields({ name: 'Role', value: `⚠️ ${result.data.roleWarning}`, inline: false });
  }

  if (result.data.nicknameApplied) {
    embed.addFields({ name: 'Nickname', value: `✅ ${result.data.nickname}`, inline: false });
  } else if (result.data.nicknameWarning) {
    embed.addFields({ name: 'Nickname', value: `⚠️ ${result.data.nicknameWarning}`, inline: false });
  }

  return { ...base, embeds: [embed.toJSON()] };
}
