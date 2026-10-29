import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../../utils.js';
import { 
  handleApplyTicket, 
  handleClaimTicket, 
  handleCloseTicket 
} from '../systems/ticket/ticket-system.js';
import { buildPaginatedHelpEmbeds, buildHelpNavigationButtons } from '../utils/embedBuilder.js';
import { registerUser } from '../systems/albion/albion.js';
import { loadAlbionConfig } from '../systems/albion/albion-db.js';
import {
  REGISTER_TYPE_PREFIX, REGISTER_MODAL_PREFIX, REGISTER_IGN_FIELD,
  buildTypePanel, buildIgnModal, buildRegistrationResponse, isValidRegisterType
} from '../systems/albion/register-ui.js';
import {
  HUB_REGISTER, HUB_UNREGISTER, HUB_BALANCE, HUB_HELP,
  buildBalanceBody, buildUnregisterBody
} from '../systems/hub/member-hub.js';
import { EmbedBuilder } from 'discord.js';
import { buildContentEmbed, buildContentComponents, buildMethodSelector, buildPresetNondpsMessage, buildPresetDpsMessage, buildCustomRoleModal, buildContinueToDetailsButton, buildContentDetailsModal, buildContentPreviewEmbed, buildPreviewComponents, buildDuplicatesStep, autoAssignFillPlayers, getRoleDisplayName, getBaseKey, ROLE_MAP } from '../services/contentService.js';
import { contentState, pendingCreations } from '../config/contentState.js';

// Shared logic for all content button interactions
async function processContentButton(componentId, userId, client) {
  if (!contentState.active) {
    return { message: '❌ No active content callout.', updated: false };
  }
  let message = '';
  let updated = false;

  if (componentId === 'content_cancel') {
    let found = false;
    for (const [k, uid] of Object.entries(contentState.roles)) {
      if (uid === userId) { contentState.roles[k] = null; found = true; break; }
    }
    const idx = contentState.fill.indexOf(userId);
    if (idx > -1) { contentState.fill.splice(idx, 1); found = true; }
    message = found ? '✅ You have been removed from the role call.' : 'ℹ️ You are not currently signed up.';
    updated = found;

  } else if (componentId === 'content_fill') {
    if (contentState.fill.includes(userId)) {
      message = 'ℹ️ You are already in the fill list.';
    } else {
      for (const [k, uid] of Object.entries(contentState.roles)) {
        if (uid === userId) contentState.roles[k] = null;
      }
      contentState.fill.push(userId);
      await autoAssignFillPlayers(client);
      message = '🔄 You have been added to the fill list!';
      updated = true;
    }

  } else {
    // content_role_[roleKey]
    const roleKey = componentId.replace('content_role_', '');
    if (!contentState.activeRoles.includes(roleKey)) {
      message = `❌ This role is not part of the current content.`;
    } else if (contentState.roles[roleKey] && contentState.roles[roleKey] !== userId) {
      message = `❌ The **${roleKey.toUpperCase()}** slot is already taken by <@${contentState.roles[roleKey]}>!`;
    } else if (contentState.roles[roleKey] === userId) {
      message = `ℹ️ You are already signed up as **${roleKey.toUpperCase()}**.`;
    } else {
      for (const [k, uid] of Object.entries(contentState.roles)) {
        if (uid === userId) contentState.roles[k] = null;
      }
      const fillIdx = contentState.fill.indexOf(userId);
      if (fillIdx > -1) contentState.fill.splice(fillIdx, 1);
      contentState.roles[roleKey] = userId;
      await autoAssignFillPlayers(client);
      message = `✅ You've signed up as **${roleKey.toUpperCase()}**!`;
      updated = true;
    }
  }

  return { message, updated };
}

// Button interactions handler for Express endpoint
export async function handleButtonInteractions(req, res, client) {
  const componentId = req.body.data.custom_id;
  const userId = req.body.member?.user?.id || req.body.user?.id;

  // ── Content creation wizard (Express path) ────────────────────────────────

  // Step 1 result: party size chosen → show method buttons
  if (componentId === 'content_size_select') {
    const partySize = parseInt(req.body.data.values[0]);
    pendingCreations.set(userId, {
      partySize,
      method: null,
      assignedRoles: [],
      customRoleNames: {},
      presetTank: [],
      presetHeal: [],
      presetSupport: [],
      presetDpsG1: [],
      presetDpsG2: [],
      presetDpsG3: [],
      presetDpsG4: [],
    });
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        content: `**Step 2 of 4** — Party size: **${partySize}**\nHow do you want to assign roles?`,
        components: buildMethodSelector().map(r => r.toJSON()),
      },
    });
  }

  // Step 2 → Custom: open single multiline modal
  if (componentId === 'content_method_custom') {
    const pending = pendingCreations.get(userId);
    if (!pending) {
      return res.send({ type: 4, data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 } });
    }
    pending.method = 'custom';
    pendingCreations.set(userId, pending);
    return res.send({ type: 9, data: buildCustomRoleModal(pending.partySize).toJSON() });
  }

  // Step 2 → Preset: show non-DPS selection (first preset message)
  if (componentId === 'content_method_dropdown') {
    const pending = pendingCreations.get(userId);
    if (!pending) {
      return res.send({ type: 4, data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 } });
    }
    pending.method = 'dropdown';
    pendingCreations.set(userId, pending);
    const { content, components } = buildPresetNondpsMessage(pending.partySize, [], [], []);
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { content, components: components.map(r => r.toJSON()) },
    });
  }

  // Step 3a (Preset): Tank/Heal/Support selects — update state and re-render non-DPS message
  for (const [field, id] of [
    ['presetTank', 'content_preset_tank'],
    ['presetHeal', 'content_preset_heal'],
    ['presetSupport', 'content_preset_support'],
  ]) {
    if (componentId === id) {
      const pending = pendingCreations.get(userId);
      if (!pending) {
        return res.send({ type: 4, data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 } });
      }
      pending[field] = req.body.data.values;
      pendingCreations.set(userId, pending);
      const { content, components } = buildPresetNondpsMessage(pending.partySize, pending.presetTank, pending.presetHeal, pending.presetSupport);
      return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: { content, components: components.map(r => r.toJSON()) },
      });
    }
  }

  // Step 3b (Preset): DPS group selects — update state and re-render DPS message
  for (const [field, id] of [
    ['presetDpsG1', 'content_preset_dps_g1'],
    ['presetDpsG2', 'content_preset_dps_g2'],
    ['presetDpsG3', 'content_preset_dps_g3'],
    ['presetDpsG4', 'content_preset_dps_g4'],
  ]) {
    if (componentId === id) {
      const pending = pendingCreations.get(userId);
      if (!pending) {
        return res.send({ type: 4, data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 } });
      }
      pending[field] = req.body.data.values;
      pendingCreations.set(userId, pending);
      const nondpsCount = (pending.presetTank?.length || 0) + (pending.presetHeal?.length || 0) + (pending.presetSupport?.length || 0);
      const { content, components } = buildPresetDpsMessage(pending.partySize, nondpsCount, pending.presetDpsG1, pending.presetDpsG2, pending.presetDpsG3, pending.presetDpsG4);
      return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: { content, components: components.map(r => r.toJSON()) },
      });
    }
  }

  // Step 3 (Preset): navigate to DPS selection
  if (componentId === 'content_preset_to_dps') {
    const pending = pendingCreations.get(userId);
    if (!pending) {
      return res.send({ type: 4, data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 } });
    }
    const nondpsCount = (pending.presetTank?.length || 0) + (pending.presetHeal?.length || 0) + (pending.presetSupport?.length || 0);
    const { content, components } = buildPresetDpsMessage(pending.partySize, nondpsCount, pending.presetDpsG1 || [], pending.presetDpsG2 || [], pending.presetDpsG3 || [], pending.presetDpsG4 || []);
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { content, components: components.map(r => r.toJSON()) },
    });
  }

  // Step 3 (Preset): navigate back to non-DPS selection
  if (componentId === 'content_preset_to_nondps') {
    const pending = pendingCreations.get(userId);
    if (!pending) {
      return res.send({ type: 4, data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 } });
    }
    const { content, components } = buildPresetNondpsMessage(pending.partySize, pending.presetTank || [], pending.presetHeal || [], pending.presetSupport || []);
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { content, components: components.map(r => r.toJSON()) },
    });
  }

  // Step 3 (Preset): confirm selection — validate count then open details modal
  if (componentId === 'content_preset_confirm') {
    const pending = pendingCreations.get(userId);
    if (!pending) {
      return res.send({ type: 4, data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 } });
    }
    const combined = [
      ...(pending.presetTank || []),
      ...(pending.presetHeal || []),
      ...(pending.presetSupport || []),
      ...(pending.presetDpsG1 || []),
      ...(pending.presetDpsG2 || []),
      ...(pending.presetDpsG3 || []),
      ...(pending.presetDpsG4 || []),
    ];
    if (combined.length !== pending.partySize) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `❌ You selected **${combined.length}** roles but party size is **${pending.partySize}**. Please select exactly ${pending.partySize} roles.`,
          flags: 64,
        },
      });
    }
    pending.assignedRoles = combined;
    pendingCreations.set(userId, pending);
    return res.send({ type: 9, data: buildContentDetailsModal().toJSON() });
  }

  // Step 3 → 4: open content details modal
  if (componentId === 'content_details_btn') {
    return res.send({ type: 9, data: buildContentDetailsModal().toJSON() });
  }

  // Step 5: publish — create thread and go live
  if (componentId === 'content_preview_publish') {
    const channelId = req.body.channel_id;
    const pending = pendingCreations.get(userId);
    if (!pending?.assignedRoles?.length || !pending?.title) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 },
      });
    }

    // Replace the preview (and its Publish/Edit buttons) with the result
    res.send({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

    try {
      contentState.active = true;
      contentState.title = pending.title;
      contentState.time = pending.time;
      contentState.demassNotice = pending.demassNotice;
      contentState.activeRoles = pending.assignedRoles;
      contentState.roles = Object.fromEntries(pending.assignedRoles.map(k => [k, null]));
      contentState.customRoleNames = pending.customRoleNames || {};
      contentState.fill = [];
      pendingCreations.delete(userId);

      const embed = buildContentEmbed();
      const threadResponse = await DiscordRequest(`channels/${channelId}/threads`, {
        method: 'POST',
        body: { name: pending.title, type: 11, auto_archive_duration: 1440 },
      });
      const threadData = await threadResponse.json();
      const threadId = threadData.id;

      const registerRoleId = loadAlbionConfig(req.body.guild_id).registerRoleId;
      const messageResponse = await DiscordRequest(`channels/${threadId}/messages`, {
        method: 'POST',
        body: {
          ...(registerRoleId ? { content: `<@&${registerRoleId}>` } : {}),
          embeds: [embed.toJSON()],
          components: buildContentComponents().map(r => r.toJSON()),
        },
      });
      const messageData = await messageResponse.json();

      contentState.messageId = messageData.id;
      contentState.channelId = threadId;
      contentState.threadId = threadId;

      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: { content: `✅ Content callout published: **${pending.title}**`, embeds: [], components: [], flags: 64 },
      });
    } catch (err) {
      console.error('❌ Error publishing content (express):', err);
      contentState.active = false;
      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: { content: '❌ Failed to create content thread. Please try again.', embeds: [], components: [], flags: 64 },
      });
    }
    return;
  }

  // Step 5: edit details — re-open modal
  if (componentId === 'content_preview_edit') {
    return res.send({ type: 9, data: buildContentDetailsModal().toJSON() });
  }

  // ── Active content role-call button handlers ──────────────────────────────

  // Content role-call button handlers
  if (componentId.startsWith('content_role_') || componentId === 'content_fill' || componentId === 'content_cancel') {
    const userId = req.body.member?.user?.id || req.body.user?.id;

    // Acknowledge immediately with a deferred ephemeral reply
    res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: 64 }
    });

    let replyContent = '';
    try {
      const { message, updated } = await processContentButton(componentId, userId, client);
      replyContent = message;
      if (updated) {
        const embed = buildContentEmbed();
        const components = buildContentComponents();
        await DiscordRequest(`channels/${contentState.channelId}/messages/${contentState.messageId}`, {
          method: 'PATCH',
          body: {
            embeds: [embed.toJSON()],
            components: components.map(r => r.toJSON())
          }
        });
      }
    } catch (err) {
      console.error('Error handling content button (express):', err);
      replyContent = '❌ An error occurred. Please try again.';
    }

    await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
      method: 'PATCH',
      body: { content: replyContent, flags: 64 }
    });
    return;
  }

  // ── Member hub buttons (public panel posted by /panel) ───────────────────
  if (componentId === HUB_REGISTER) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { ...buildTypePanel(loadAlbionConfig(req.body.guild_id)), flags: 64 },
    });
  }

  if (componentId === HUB_BALANCE) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: buildBalanceBody(req.body.guild_id, userId),
    });
  }

  if (componentId === HUB_HELP) {
    const pages = buildPaginatedHelpEmbeds(req.body.member, req.body.guild_id, true);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [pages[0].toJSON()],
        components: pages.length > 1 ? [buildHelpNavigationButtons(0, pages.length).toJSON()] : [],
        flags: 64,
      },
    });
  }

  if (componentId === HUB_UNREGISTER) {
    res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: 64 },
    });

    let body;
    try {
      const guild = client.guilds.cache.get(req.body.guild_id);
      body = guild
        ? await buildUnregisterBody(guild, userId)
        : { content: '❌ Failed to fetch guild information.', flags: 64 };
    } catch (error) {
      console.error('Error in hub unregister:', error);
      body = { content: '❌ An unexpected error occurred during unregistration.', flags: 64 };
    }
    await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
      method: 'PATCH',
      body,
    });
    return;
  }

  // Guided registration: join type -> IGN modal (region comes from /set guild)
  if (componentId.startsWith(REGISTER_TYPE_PREFIX)) {
    const registerType = componentId.slice(REGISTER_TYPE_PREFIX.length);
    if (!isValidRegisterType(registerType)) {
      return res.status(400).json({ error: 'invalid registration choice' });
    }
    return res.send({ type: 9, data: buildIgnModal(registerType).toJSON() });
  }

  // Albion registration button handler
  if (componentId.startsWith('albion_register_')) {
    console.log('🎮 Albion registration button clicked');
    const parts = componentId.split('_');
    const requestUserId = parts[2];
    const region = parts[3];
    const registerType = ['alliance', 'guild'].includes(parts[4]) ? parts[4] : 'guild';
    const playerIdStartIndex = ['alliance', 'guild'].includes(parts[4]) ? 5 : 4;
    const playerId = parts.slice(playerIdStartIndex).join('_');
    
    const clickerId = req.body.member?.user?.id || req.body.user?.id;

    // Check if the button clicker is the same user who initiated registration
    if (clickerId !== requestUserId) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ This registration is not for you. Please use `/register` to register your own character.',
          flags: 64
        }
      });
    }

    // Replace the "pick your character" message in place instead of leaving it behind
    res.send({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

    try {
      const guild = client.guilds.cache.get(req.body.guild_id);
      const result = await registerUser(guild, requestUserId, region, null, playerId, registerType);

      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: buildRegistrationResponse(result, { userId: requestUserId, region, registerType, playerId })
      });

    } catch (error) {
      console.error('Error in albion registration button:', error);
      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: {
          content: '❌ An unexpected error occurred during registration.',
          embeds: [],
          components: [],
          flags: 64
        }
      });
    }
    return;
  }

  // Ticket system button handlers
  if (componentId === 'apply_ticket') {
    console.log('🎫 Apply ticket button clicked');
    const interaction = {
      customId: componentId,
      guildId: req.body.guild_id,
      user: req.body.member?.user || req.body.user,
      member: req.body.member,
      channelId: req.body.channel_id,
      guild: client.guilds.cache.get(req.body.guild_id),
      deferReply: async (options) => {
        return res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: { flags: options?.ephemeral ? 64 : 0 }
        });
      },
      editReply: async (options) => {
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: options.content,
            embeds: options.embeds?.map(e => e.toJSON?.() || e),
            flags: options.ephemeral ? 64 : 0
          }
        });
      },
      reply: async (options) => {
        if (!res.headersSent) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: options.content,
              embeds: options.embeds?.map(e => e.toJSON?.() || e),
              flags: options.ephemeral ? 64 : 0
            }
          });
        }
      }
    };

    await handleApplyTicket(interaction);
    return;
  }

  if (componentId === 'ticket_claim') {
    console.log('✋ Claim ticket button clicked');
    const guild = client.guilds.cache.get(req.body.guild_id);
    const userId = req.body.member?.user?.id || req.body.user?.id;
    
    // Fetch the member from guild to get proper roles
    let guildMember = null;
    if (guild && userId) {
      try {
        guildMember = await guild.members.fetch(userId);
      } catch (error) {
        console.error('Failed to fetch member:', error);
      }
    }

    const interaction = {
      customId: componentId,
      guildId: req.body.guild_id,
      user: req.body.member?.user || req.body.user,
      member: guildMember,
      channelId: req.body.channel_id,
      guild: guild,
      reply: async (options) => {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: options.content,
            embeds: options.embeds?.map(e => e.toJSON?.() || e),
            flags: options.ephemeral ? 64 : 0
          }
        });
      }
    };

    await handleClaimTicket(interaction);
    return;
  }

  if (componentId === 'ticket_close') {
    console.log('🔒 Close ticket button clicked');
    const guild = client.guilds.cache.get(req.body.guild_id);
    const userId = req.body.member?.user?.id || req.body.user?.id;
    
    // Fetch the member from guild to get proper roles
    let guildMember = null;
    if (guild && userId) {
      try {
        guildMember = await guild.members.fetch(userId);
      } catch (error) {
        console.error('Failed to fetch member:', error);
      }
    }

    const interaction = {
      customId: componentId,
      guildId: req.body.guild_id,
      user: req.body.member?.user || req.body.user,
      member: guildMember,
      channelId: req.body.channel_id,
      guild: guild,
      channel: guild?.channels.cache.get(req.body.channel_id),
      deferReply: async (options) => {
        return res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: { flags: options?.ephemeral ? 64 : 0 }
        });
      },
      editReply: async (options) => {
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: options.content,
            embeds: options.embeds?.map(e => e.toJSON?.() || e),
            flags: options.ephemeral ? 64 : 0
          }
        });
      },
      reply: async (options) => {
        if (!res.headersSent) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: options.content,
              embeds: options.embeds?.map(e => e.toJSON?.() || e),
              flags: options.ephemeral ? 64 : 0
            }
          });
        }
      },
      deferred: false
    };

    await handleCloseTicket(interaction);
    return;
  }

  // Help pagination buttons
  if (componentId.startsWith('help_prev_') || componentId.startsWith('help_next_')) {
    console.log('📖 Help pagination button clicked');
    const guildId = req.body.guild_id;
    const member = req.body.member;
    
    // Extract current page from button ID
    const currentPage = parseInt(componentId.split('_')[2]);
    const isNext = componentId.startsWith('help_next_');
    const newPage = isNext ? currentPage + 1 : currentPage - 1;
    
    // Build help pages
    const pages = buildPaginatedHelpEmbeds(member, guildId, true);
    
    // Validate page number
    if (newPage < 0 || newPage >= pages.length) {
      return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {}
      });
    }
    
    // Build new navigation buttons
    const buttons = buildHelpNavigationButtons(newPage, pages.length);
    
    // Update the message with new page
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [pages[newPage].toJSON()],
        components: [buttons.toJSON()],
        flags: 64
      }
    });
  }

  console.error(`❌ Unknown component ID: ${componentId}`);
  return res.status(400).json({ error: 'unknown component' });
}

// Modal submit handler for Express endpoint (interaction type 5)
export async function handleModalSubmit(req, res, client) {
  const customId = req.body.data.custom_id;
  const userId = req.body.member?.user?.id || req.body.user?.id;
  const modalComponents = req.body.data.components;

  // ── Custom role modal — parse one role per line ───────────────────────────
  if (customId === 'content_custom_modal') {
    const pending = pendingCreations.get(userId);
    if (!pending) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 },
      });
    }

    const rawField = modalComponents
      .flatMap(row => row.components)
      .find(c => c.custom_id === 'custom_roles_text');
    const rawText = (rawField?.value || '').trim();
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length !== pending.partySize) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `❌ You entered **${lines.length}** roles but party size is **${pending.partySize}**. Please try again and enter exactly ${pending.partySize} roles (one per line).`,
          flags: 64,
        },
      });
    }

    pending.assignedRoles = [];
    pending.customRoleNames = {};
    lines.forEach((name, i) => {
      const key = `custom_${i}`;
      pending.assignedRoles.push(key);
      pending.customRoleNames[key] = name;
    });
    pendingCreations.set(userId, pending);

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `✅ All **${pending.partySize}** custom roles set!\n\nClick below to set the title, time, and demass notice:`,
        flags: 64,
        components: buildContinueToDetailsButton().map(r => r.toJSON()),
      },
    });
  }

  // ── Content details modal → show preview ───────────────────────────────────
  if (customId === 'content_create_modal') {
    const channelId = req.body.channel_id;

    const title = modalComponents[0].components[0].value?.trim() || '';
    const time = modalComponents[1].components[0].value?.trim() || '';
    const demassNotice = modalComponents[2]?.components[0]?.value?.trim() || '';

    const pending = pendingCreations.get(userId);
    if (!pending?.assignedRoles?.length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Session expired. Run `/content create` again.', flags: 64 },
      });
    }

    pending.title = title;
    pending.time = time;
    pending.demassNotice = demassNotice;
    pendingCreations.set(userId, pending);

    const previewEmbed = buildContentPreviewEmbed(pending);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '**Step 4 of 4** — Review your content callout:',
        flags: 64,
        embeds: [previewEmbed.toJSON()],
        components: buildPreviewComponents().map(r => r.toJSON()),
      },
    });
  }

  // ── Guided registration: IGN modal submitted ───────────────────────────────
  if (customId.startsWith(REGISTER_MODAL_PREFIX)) {
    const registerType = customId.slice(REGISTER_MODAL_PREFIX.length);
    const region = loadAlbionConfig(req.body.guild_id).albionRegion;
    const ign = modalComponents
      .flatMap(row => row.components)
      .find(c => c.custom_id === REGISTER_IGN_FIELD)?.value?.trim();

    if (!isValidRegisterType(registerType) || !region || !ign) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Invalid registration details. Click **Register** to start again.', flags: 64 },
      });
    }

    // Replace the panel this modal was opened from with the result
    res.send({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

    let body;
    try {
      const guild = client.guilds.cache.get(req.body.guild_id);
      if (!guild) {
        body = { content: '❌ Failed to fetch guild information.', embeds: [], components: [], flags: 64 };
      } else {
        const result = await registerUser(guild, userId, region, ign, null, registerType);
        body = buildRegistrationResponse(result, { userId, region, registerType, ign });
      }
    } catch (error) {
      console.error('Error in guided /register modal:', error);
      body = { content: '❌ An unexpected error occurred during registration.', embeds: [], components: [], flags: 64 };
    }

    await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
      method: 'PATCH',
      body
    });
    return;
  }

  return res.status(400).json({ error: 'unknown modal' });
}
