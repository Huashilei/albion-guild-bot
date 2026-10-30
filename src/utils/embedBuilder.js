import { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { loadPrefix } from '../database/guildData.js';
import { hasPermission, hasPermissionSlash } from './permissions.js';
import { BOT_NAME } from '../config/constants.js';

// Build help embed based on user permissions
export function buildHelpEmbed(member, guildId, isSlashCommand = false) {
  const prefix = loadPrefix(guildId).prefix;
  
  // Check permissions
  const isAdmin = isSlashCommand 
    ? (member && member.permissions && (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator))
    : (member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator));
  
  const hasBankPerms = isSlashCommand 
    ? hasPermissionSlash(member, 'bankAdminRoles', guildId)
    : hasPermission(member, 'bankAdminRoles');
  
  const hasCtaPerms = isSlashCommand 
    ? hasPermissionSlash(member, 'ctaRegearRoles', guildId)
    : hasPermission(member, 'ctaRegearRoles');

  const hasContentPerms = isSlashCommand 
    ? hasPermissionSlash(member, 'contentAdminRoles', guildId)
    : hasPermission(member, 'contentAdminRoles');

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📖 ${BOT_NAME} - Command Help`)
    .setFooter({ text: `${BOT_NAME} - Albion Online Guild Bot` })
    .setTimestamp();

  let description = `**Current Prefix:** \`${prefix}\`\n\n`;

  // User Commands (Always shown)
  description += `**👤 User Commands** (Available to All Members):\n`;
  description += `• \`/help\` or \`${prefix}help\` - Show this help menu\n`;
  description += `• \`/utc\` or \`${prefix}utc\` - Display current UTC time\n`;
  description += `• \`/info <playername>\` - Search for an Albion player\n`;
  description += `• \`/bank balance [@user]\` or \`${prefix}bal [@user]\` - Check balance\n`;
  description += `• \`/bank active\` or \`${prefix}bank active\` - List all bank users\n`;
  description += `• \`/register\` or the **Register** button on the member hub - guided registration (uses configured roles/nickname)\n`;
  description += `• \`/unregister\` or \`${prefix}unregister\` - Unregister your character\n`;
  description += `• In content threads: \`x [role]\` - Claim a role (tank, heal, etc.)\n`;
  description += `• In content threads: \`x fill\` - Sign up to fill any slot\n\n`;

  // Bank Admin Commands
  if (hasBankPerms || isAdmin) {
    description += `**💰 Bank Admin Commands** ${isAdmin ? '(Administrator)' : '(Authorized Role)'}:\n`;
    description += `• \`/bank deposit @user <amount>\` or \`${prefix}bank deposit @user <amount>\`\n`;
    description += `• \`/bank withdraw @user <amount>\` or \`${prefix}bank withdraw @user <amount>\`\n`;
    description += `• \`/bank clear @user\` or \`${prefix}bank clear @user\`\n`;
    description += `• \`/bank clearall\` or \`${prefix}bank clearall\`\n\n`;
  }

  // CTA Regear Commands
  if (hasCtaPerms || isAdmin) {
    description += `**⚔️ Regear Commands** ${isAdmin ? '(Administrator)' : '(Authorized Role)'}:\n`;
    description += `• \`/regear create [title] [time] [notice]\` - Create a regear thread\n`;
    description += `• \`/regear close\` - Close and lock the current regear thread\n\n`;
  }

  // Content Admin Commands
  if (hasContentPerms || isAdmin) {
    description += `**🎮 Content Admin Commands** ${isAdmin ? '(Administrator)' : '(Authorized Role)'}:\n`;
    description += `• \`/content create\` - Create a content callout (guided: size, roles, details)\n`;
    description += `• \`/content adduser @user [role]\` - Add user to content role\n`;
    description += `• \`/content removeuser [role]\` - Remove user from content role\n\n`;
  }

  // Full Admin Commands (Only for Discord Administrators)
  if (isAdmin) {
    description += `**🛡️ Administrator Commands** (Discord Admin Only):\n`;
    description += `• \`${prefix}prefix <new>\` - Change bot prefix\n`;
    description += `• \`/perms list\` or \`${prefix}perms list\` - View role permissions\n`;
    description += `• \`/perms add <bank|cta|content> @role\` - Grant role permission\n`;
    description += `• \`/perms remove <bank|cta|content> @role\` - Revoke role permission\n`;
    description += `• \`/panel\` - Post the member hub buttons (Register / Unregister / Balance / Help)\n`;
    description += `• \`/config view\` - View guild verification settings\n`;
    description += `• \`/set guild <region> <guild_name>\` - Configure Albion guild\n`;
    description += `• \`/set register-role @role\` - Set verified member role\n`;
    description += `• \`/set guild-tag <tag>\` - Set guild tag for nicknames\n`;
    description += `• \`/set nickname-format <format>\` - Set nickname format\n`;
    description += `• \`/forceunregister <ign>\` or \`${prefix}forceunregister <ign>\` - Force unregister by IGN\n`;
    description += `• \`/purge type:alliance confirm:true\` or \`${prefix}purge alliance confirm\` - Remove alliance registrations\n`;
    description += `• \`/purge type:guild confirm:true\` or \`${prefix}purge confirm\` - Remove invalid guild registrations\n`;
    description += `• \`/ticket setup\` - Pick forum, staff role, log channel; posts the Apply button\n`;
    description += `• \`/ticket list\` - Show the application setup\n`;
    description += `• \`/ticket panel [message]\` - Re-post the Apply button\n`;
    description += `• \`/ticket delete\` - Remove the application setup\n`;
    description += `• \`/ticket stats\` - View ticket statistics\n`;
    description += `• \`/ticket health\` - Run ticket system health check\n\n`;
  }

  // Show permission status if user has special permissions
  if (!isAdmin && (hasBankPerms || hasCtaPerms || hasContentPerms)) {
    description += `*You have special permissions granted via role assignment.*\n`;
  }

  embed.setDescription(description);
  return embed;
}

/**
 * Build paginated help embeds
 * Returns array of embeds for pagination
 */
export function buildPaginatedHelpEmbeds(member, guildId, isSlashCommand = false) {
  const prefix = loadPrefix(guildId).prefix;
  
  // Check permissions
  const isAdmin = isSlashCommand 
    ? (member && member.permissions && (BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator))
    : (member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator));
  
  const hasBankPerms = isSlashCommand 
    ? hasPermissionSlash(member, 'bankAdminRoles', guildId)
    : hasPermission(member, 'bankAdminRoles');
  
  const hasCtaPerms = isSlashCommand 
    ? hasPermissionSlash(member, 'ctaRegearRoles', guildId)
    : hasPermission(member, 'ctaRegearRoles');

  const hasContentPerms = isSlashCommand 
    ? hasPermissionSlash(member, 'contentAdminRoles', guildId)
    : hasPermission(member, 'contentAdminRoles');

  const pages = [];

  // Page 1: User Commands
  const page1 = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📖 ${BOT_NAME} - Command Help (Page 1)`)
    .setDescription(
      `**Current Prefix:** \`${prefix}\`\n\n` +
      `**👤 User Commands** (Available to All Members):\n` +
      `• \`/help\` or \`${prefix}help\` - Show this help menu\n` +
      `• \`/utc\` or \`${prefix}utc\` - Display current UTC time\n` +
      `• \`/info <playername>\` - Search for an Albion player across all regions\n` +
      `• \`/bank balance [@user]\` or \`${prefix}bal [@user]\` - Check bank balance\n` +
      `• \`/bank active\` or \`${prefix}bank active\` - List all bank users\n\n` +
      `**🎮 Albion Guild Verification:**\n` +
      `• \`/register\` or the **Register** button on the member hub\n` +
      `  Guided: pick Guild or Alliance, then enter your in-game name\n` +
      `  Applies configured roles and nickname format\n` +
      `• \`/unregister\` or \`${prefix}unregister\`\n` +
      `  Unregister your character from the system\n\n` +
      `**📝 Content Threads:**\n` +
      `• \`x [role]\` - Claim a role (e.g., \`x tank\`, \`x heal\`, \`x dps\`)\n` +
      `• \`x fill\` - Sign up to fill any available slot\n` +
      `• \`x cancel\` - Remove yourself from content\n`
    )
    .setFooter({ text: `${BOT_NAME} - Albion Online Guild Bot` })
    .setTimestamp();
  pages.push(page1);

  // Page 2: Bank & Regear Commands
  let page2Desc = '';
  if (hasBankPerms || isAdmin) {
    page2Desc += `**💰 Bank Admin Commands** ${isAdmin ? '(Administrator)' : '(Authorized Role)'}:\n`;
    page2Desc += `• \`/bank deposit @user <amount>\` or \`${prefix}bank deposit @user <amount>\`\n`;
    page2Desc += `  Add money to a user's account\n`;
    page2Desc += `• \`/bank withdraw @user <amount>\` or \`${prefix}bank withdraw @user <amount>\`\n`;
    page2Desc += `  Remove money from a user's account\n`;
    page2Desc += `• \`/bank clear @user\` or \`${prefix}bank clear @user\`\n`;
    page2Desc += `  Clear a specific user's balance\n`;
    page2Desc += `• \`/bank clearall\` or \`${prefix}bank clearall\`\n`;
    page2Desc += `  Clear all balances (use with caution)\n\n`;
  }

  if (hasCtaPerms || isAdmin) {
    page2Desc += `**⚔️ Regear Commands** ${isAdmin ? '(Administrator)' : '(Authorized Role)'}:\n`;
    page2Desc += `• \`/regear create [title] [time] [notice]\`\n`;
    page2Desc += `  Create a regear thread with any title\n`;
    page2Desc += `• \`/regear close\`\n`;
    page2Desc += `  Close and lock the current regear thread\n\n`;
  }

  if (hasContentPerms || isAdmin) {
    page2Desc += `**🎮 Content Admin Commands** ${isAdmin ? '(Administrator)' : '(Authorized Role)'}:\n`;
    page2Desc += `• \`/content create\`\n`;
    page2Desc += `  Create a content callout (guided: size, roles, details)\n`;
    page2Desc += `• \`/content adduser @user [role]\`\n`;
    page2Desc += `  Add user to content role slot\n`;
    page2Desc += `• \`/content removeuser [role]\`\n`;
    page2Desc += `  Remove user from content role slot\n`;
  }

  if (page2Desc) {
    const page2 = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📖 ${BOT_NAME} - Command Help (Page 2)`)
      .setDescription(page2Desc)
      .setFooter({ text: `${BOT_NAME} - Albion Online Guild Bot` })
      .setTimestamp();
    pages.push(page2);
  }

  // Page 3: Albion Admin Commands
  if (isAdmin) {
    const page3 = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📖 ${BOT_NAME} - Command Help (Page 3)`)
      .setDescription(
        `**🎮 Albion Guild Verification (Admin)**:\n` +
        `• \`/set guild <region> <guild_name>\` or \`${prefix}set guild <region> <guild_name>\`\n` +
        `  Configure your guild and region (americas, europe, asia)\n` +
        `• \`/set register-role @role\` or \`${prefix}set register-role @role\`\n` +
        `  Set the role assigned to verified members\n` +
        `• \`/set guild-tag <tag>\` or \`${prefix}set guild-tag <tag>\`\n` +
        `  Set guild tag for nicknames (e.g., MINO)\n` +
        `• \`/set nickname-format <format>\` or \`${prefix}set nickname-format <format>\`\n` +
        `  Set nickname format ({ign}, {tag}, {guild}, {region})\n` +
        `• \`/config view\` or \`${prefix}config\`\n` +
        `  View current Albion configuration\n` +
        `• \`/forceunregister <ign>\` or \`${prefix}forceunregister <ign>\`\n` +
        `  Force unregister a player by in-game name\n` +
        `• \`/purge type:alliance confirm:true\` or \`${prefix}purge alliance confirm\`\n` +
        `  Remove all alliance registrations and roles\n` +
        `• \`/purge type:guild confirm:true\` or \`${prefix}purge confirm\`\n` +
        `  Remove users no longer in the guild (checks Albion API)\n`
      )
      .setFooter({ text: `${BOT_NAME} - Albion Online Guild Bot` })
      .setTimestamp();
    pages.push(page3);

    // Page 4: Admin Content & Ticket Commands
    const page4 = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📖 ${BOT_NAME} - Command Help (Page 4)`)
      .setDescription(
        `**🎫 Ticket Commands** (Administrator Only):\n` +
        `• \`/ticket setup\`\n` +
        `  Setup a ticket panel with full configuration\n` +
        `• \`/ticket list\` or \`${prefix}ticketpanels\`\n` +
        `  List all configured ticket panels\n` +
        `• \`/ticket panel [panel_id]\` or \`${prefix}applypanel\`\n` +
        `  Send apply button panel to current channel\n` +
        `• \`/ticket delete <panel_id>\` or \`${prefix}ticketdelete <panel_id>\`\n` +
        `  Delete a ticket panel configuration\n` +
        `• \`/ticket stats\` or \`${prefix}ticketstats\`\n` +
        `  View ticket statistics (total, open, closed, etc.)\n` +
        `• \`/ticket health\` or \`${prefix}tickethealth\`\n` +
        `  Run ticket system health check\n\n` +
        `**🔐 Permission Management** (Administrator Only):\n` +
        `• \`/perms list\` or \`${prefix}perms list\`\n` +
        `  View all role permissions\n` +
        `• \`/perms add <bank|cta|content> @role\`\n` +
        `  Grant role permission\n` +
        `• \`/perms remove <bank|cta|content> @role\`\n` +
        `  Revoke role permission\n\n` +
        `**⚙️ Bot Configuration** (Administrator Only):\n` +
        `• \`${prefix}prefix <new>\`\n` +
        `  Change bot prefix\n`
      )
      .setFooter({ text: `${BOT_NAME} - Albion Online Guild Bot` })
      .setTimestamp();
    pages.push(page4);
  } else {
    // For non-admin, adjust page numbers
    pages.forEach((page, index) => {
      const totalPages = pages.length;
      page.setTitle(`📖 ${BOT_NAME} - Command Help (Page ${index + 1}/${totalPages})`);
    });
  }

  return pages;
}

/**
 * Build navigation buttons for paginated help
 */
export function buildHelpNavigationButtons(currentPage, totalPages) {
  const row = new ActionRowBuilder();

  // Previous button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`help_prev_${currentPage}`)
      .setLabel('◀️ Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0)
  );

  // Page indicator (disabled button showing page number)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('help_page_indicator')
      .setLabel(`Page ${currentPage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  // Next button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`help_next_${currentPage}`)
      .setLabel('Next ▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1)
  );

  return row;
}

// Splits pre-formatted lines into chunks that each fit inside a single embed
// field value (Discord's limit is 1024 chars - stay well under it).
function chunkLines(lines, maxChars = 1000) {
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const line of lines) {
    const lineLen = line.length + 1; // +1 for the joining newline
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
}

// Builds one or more embeds listing registered guild/alliance members
// (Discord ID <-> Albion IGN), safely chunked to respect Discord's per-field
// (1024 char), per-embed (25 field), and per-message (10 embed) limits.
export function buildRegisteredListEmbeds({ guild = [], alliance = [] }) {
  const embeds = [];
  let fields = [];
  let approxChars = 0; // running total for the current, not-yet-flushed embed

  const MAX_EMBED_CHARS = 5500; // Discord's real limit is 6000 (title+fields+footer) - leave margin

  const flushEmbed = () => {
    if (fields.length === 0) return;
    embeds.push(
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(embeds.length === 0 ? '📋 Registered Members' : '📋 Registered Members (cont.)')
        .addFields(fields)
        .setTimestamp()
    );
    fields = [];
    approxChars = 0;
  };

  const addSection = (label, entries, formatLine) => {
    if (entries.length === 0) return;
    const lines = entries.map(formatLine);
    const chunks = chunkLines(lines);
    chunks.forEach((chunk, i) => {
      const fieldName = chunks.length > 1 ? `${label} (part ${i + 1}/${chunks.length})` : label;
      const fieldSize = fieldName.length + chunk.length;
      if (fields.length >= 24 || approxChars + fieldSize > MAX_EMBED_CHARS) {
        flushEmbed();
      }
      fields.push({ name: fieldName, value: chunk, inline: false });
      approxChars += fieldSize;
    });
  };

  addSection(
    `🛡️ Guild (${guild.length})`,
    guild,
    (e, i) => `${i + 1}. <@${e.discordId}> — **${e.ign}**${e.region ? ` (${e.region.toUpperCase()})` : ''}`
  );
  addSection(
    `🤝 Alliance (${alliance.length})`,
    alliance,
    (e, i) => `${i + 1}. <@${e.discordId}> — **${e.ign}**`
  );

  flushEmbed();

  if (embeds.length === 0) {
    embeds.push(
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Registered Members')
        .setDescription('No members are currently registered.')
        .setTimestamp()
    );
  }

  embeds[embeds.length - 1].setFooter({ text: `Guild: ${guild.length} | Alliance: ${alliance.length}` });

  return embeds.slice(0, 10); // Discord allows at most 10 embeds per message
}

const MS_PER_DAY = 86400000;

function daysSince(date) {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / MS_PER_DAY));
}

export const TENURE_PAGE_SIZE = 20; // ~150 chars per line keeps a page well under Discord's 6000 char message limit
export const TENURE_PREV = 'tenure_prev_';
export const TENURE_NEXT = 'tenure_next_';

// One page of the register-role tenure list (rows come from buildTenureRows,
// already sorted). Returns the embed plus Prev/Next buttons when there is more than one page.
export function buildTenurePage(rows, page = 0) {
  const totalPages = Math.max(1, Math.ceil(rows.length / TENURE_PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), totalPages - 1);
  const start = current * TENURE_PAGE_SIZE;

  const lines = rows.slice(start, start + TENURE_PAGE_SIZE).map((r, i) => {
    const joined = r.joinedAt ? `${daysSince(r.joinedAt)}d` : '?';
    const registered = r.registeredAt && !Number.isNaN(Date.parse(r.registeredAt))
      ? `${daysSince(new Date(r.registeredAt))}d`
      : 'n/a';
    const name = r.ign ? `**${r.ign}**` : '*not in DB*';
    const tier = r.tierRoleId ? ` · <@&${r.tierRoleId}>` : '';
    const next = r.next ? ` · next <@&${r.next.roleId}> in ${r.next.days}d` : '';
    return `${start + i + 1}. <@${r.discordId}> — ${name} · server ${joined} · registered ${registered}${tier}${next}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('⏳ Register Role Tenure')
    .setDescription(lines.join('\n') || 'No members hold the register role.')
    .setFooter({ text: `Page ${current + 1}/${totalPages} · ${rows.length} member(s) · longest on server first · "registered" = days since DB registration` });

  const components = [];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${TENURE_PREV}${current}`)
          .setLabel('◀️ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(current === 0),
        new ButtonBuilder()
          .setCustomId(`${TENURE_NEXT}${current}`)
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(current === totalPages - 1)
      ).toJSON()
    );
  }

  return { embed, components, page: current, totalPages };
}

function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV of every tenure row (not paged). BOM so Excel reads UTF-8 names correctly.
export function buildTenureCsv(rows) {
  const header = ['discord_id', 'username', 'ign', 'joined_server_at', 'days_on_server', 'registered_at', 'days_registered', 'current_tier', 'next_tier', 'days_to_next_tier'];
  const lines = rows.map((r) => {
    const regOk = r.registeredAt && !Number.isNaN(Date.parse(r.registeredAt));
    return [
      r.discordId,
      r.username,
      r.ign,
      r.joinedAt ? r.joinedAt.toISOString() : '',
      r.joinedAt ? daysSince(r.joinedAt) : '',
      regOk ? r.registeredAt : '',
      regOk ? daysSince(new Date(r.registeredAt)) : '',
      r.tierName,
      r.next?.name,
      r.next?.days
    ].map(csvCell).join(',');
  });
  return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
}
