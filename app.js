import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import { InteractionType, InteractionResponseType, verifyKeyMiddleware } from 'discord-interactions';
import { DATA_DIR, PORT } from './src/config/constants.js';
import { handleMessageCreate } from './src/events/messageCreate.js';
import { handleButtonInteractions, handleModalSubmit } from './src/events/interactionCreate.js';
import { handleSlashCommands } from './src/commands/slashCommands.js';
import { registerCommands } from './commands.js';
import { scheduleEphemeralDismiss } from './utils.js';
import { handleVoiceStateUpdate, cleanupTempChannels } from './src/systems/tempvc/temp-vc.js';
import { applyTiers } from './src/systems/albion/tiers.js';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Create an express app
const app = express();

// Gateway client: only used for messageCreate (prefix commands) and member/guild
// cache. Slash commands, buttons, and modals arrive via the /interactions
// webhook below instead - Discord stops sending those over the gateway once
// an Interactions Endpoint URL is configured for the app.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ] 
});

// Gateway connected event
client.once('clientReady', () => {
  console.log(`Gateway connected as ${client.user.tag}`);
  cleanupTempChannels(client).catch((err) => console.error('❌ Temp VC cleanup failed:', err));
});

// Client ready event
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  // Grant tenure tier roles as registrations age (see src/systems/albion/tiers.js)
  const sweepTiers = () => {
    for (const guild of client.guilds.cache.values()) {
      applyTiers(guild).catch((err) => console.error(`❌ Tier sweep failed for ${guild.id}:`, err));
    }
  };
  sweepTiers();
  setInterval(sweepTiers, 15 * 60 * 1000);
});

// Keep Discord's slash commands in sync with commands.js on every start
registerCommands()
  .then(({ registered, count }) => console.log(registered ? `✅ Registered ${count} slash commands` : 'Slash commands already up to date'))
  .catch((err) => console.error('❌ Failed to register slash commands:', err));

// Message create event handler
client.on('messageCreate', async (message) => {
  await handleMessageCreate(message, client);
});

// Join-to-create voice channels
client.on('voiceStateUpdate', handleVoiceStateUpdate);

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  try {
    // Interaction type and data
    const { type, id, data, member, user } = req.body;

    // Immediate ephemeral replies clean themselves up (deferred ones are
    // handled in DiscordRequest when the final edit is sent)
    const sendResponse = res.send.bind(res);
    res.send = (body) => {
      if (body?.type === InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE) {
        scheduleEphemeralDismiss(process.env.APP_ID, req.body.token, body.data);
      }
      return sendResponse(body);
    };
    
    // Extract user information
    const executor = member?.user || user;
    const userName = executor?.username || 'Unknown';
    const userId = executor?.id || 'Unknown';
    
    // Clean logging with user info
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const commandName = data?.name ? `/${data.name}` : type === InteractionType.MESSAGE_COMPONENT ? 'Button' : 'Interaction';
    console.log(`[${timestamp}] ${commandName} | User: ${userName} (${userId})`);

    /**
     * Handle verification requests
     */
    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }

    /**
     * Handle slash command requests
     */
    if (type === InteractionType.APPLICATION_COMMAND) {
      return await handleSlashCommands(req, res, client);
    }

    /**
     * Handle button and component interactions
     */
    if (type === InteractionType.MESSAGE_COMPONENT) {
      return await handleButtonInteractions(req, res, client);
    }

    /**
     * Handle modal submit interactions
     */
    if (type === InteractionType.MODAL_SUBMIT) {
      return await handleModalSubmit(req, res, client);
    }

    console.error('❌ Unknown interaction type:', type);
    return res.status(400).json({ error: 'unknown interaction type' });
  } catch (error) {
    console.error('❌ Error handling interaction:', error);
    
    // Try to respond to Discord if we haven't already
    if (!res.headersSent) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ An error occurred while processing your command. Please try again.',
          flags: 64
        },
      });
    }
  }
});

// Start Express server
app.listen(PORT, () => {
  console.log('Listening on port ', PORT, ' ✅');
});
