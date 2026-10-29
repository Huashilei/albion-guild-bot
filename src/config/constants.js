// Configuration constants

// Data directory from environment variable (default: /home/container/data)
export const DATA_DIR = process.env.DATA_DIR || '/home/container/data';

// Custom emoji configuration - Replace with your server's emoji IDs
export const CUSTOM_EMOJIS = {
  OFFTANK: '<:OFFTANK:1388541334637379695>',
  HEALER: '<:HEALER:1388541939317473350>',
  DEBUFF: '<:DEBUFF:1388542342788677834>',
  DPS: '<:DPS:1388541739815669792>',
};

// Display name used in embeds (white-label: override per deployment)
export const BOT_NAME = process.env.BOT_NAME || 'Minokawa';

// Express server port
export const PORT = process.env.PORT || 3000;
