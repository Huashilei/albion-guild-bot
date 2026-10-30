import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { DiscordRequest } from './utils.js';
import { DATA_DIR } from './src/config/constants.js';

// UTC command for Albion Online in-game time
const UTC_COMMAND = {
  name: 'utc',
  description: 'Display current UTC time (Albion Online in-game time)',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Info command for Albion Online player lookup
const INFO_COMMAND = {
  name: 'info',
  description: 'Search for an Albion Online player across all regions',
  options: [
    {
      type: 3, // STRING
      name: 'playername',
      description: 'The player name to search for',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Help command
const HELP_COMMAND = {
  name: 'help',
  description: 'Show available bot commands and information',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Content command for Albion Online content callouts (ROA/CTA/GCAMPS/FF)
const CONTENT_COMMAND = {
  name: 'content',
  description: 'Manage content callouts',
  options: [
    {
      type: 1, // SUB_COMMAND
      name: 'create',
      description: 'Create a new content callout',
      // No options — interactive flow (dropdown + modal) handles everything
    },
    {
      type: 1, // SUB_COMMAND
      name: 'adduser',
      description: 'Add a user to a role slot',
      options: [
        {
          type: 6, // USER
          name: 'user',
          description: 'The user to add',
          required: true,
        },
        {
          type: 3,
          name: 'role',
          description: 'The role slot to assign (fixed-slot types use specific roles, CTA/FF use categories)',
          required: true,
          choices: [
            { name: '🛡️ Tank', value: 'tank' },
            { name: '💚 Healer', value: 'heal' },
            { name: '💚 Healer 2', value: 'heal2' },
            { name: '⚔️ Arcane/MP', value: 'mp' },
            { name: '⚔️ Arcane/MP 2', value: 'mp2' },
            { name: '🔮 Shadowcaller', value: 'shadowcaller' },
            { name: '🔥 Blazing Staff', value: 'blazing' },
            { name: '✨ Flex', value: 'flex' },
            { name: '🗡️ Badon', value: 'badon' },
            { name: '⚔️ DP Air', value: 'dpair' },
            { name: '✂️ HP Cut', value: 'hpcut' },
            { name: '🗡️ Flex DPS', value: 'flexdps' },
            { name: '🛡️ Off-Tank', value: 'offtank' },
            { name: '⚡ Stunner', value: 'stun' },
            { name: '💚 Main Healer', value: 'mainhealer' },
            { name: '💚 Party Healer', value: 'partyhealer' },
            { name: '🗡️ DPS 1', value: 'dps1' },
            { name: '🗡️ DPS 2', value: 'dps2' },
            { name: '🗡️ DPS 3', value: 'dps3' },
            { name: '🗡️ DPS 4', value: 'dps4' },
            { name: '🔥 Blaze/Dawnsong', value: 'blaze' },
            { name: '❄️ Perma Frost', value: 'perma' },
            { name: '💡 Lightcaller', value: 'lc' },
            { name: '🏹 Longbow', value: 'longbow' },
            { name: '🛡️ Support', value: 'support' },
          ],
        },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'removeuser',
      description: 'Remove a user from a role slot (use user mention OR slot number)',
      options: [
        {
          type: 6, // USER
          name: 'user',
          description: 'The Discord user to remove from their slot',
          required: false,
        },
        {
          type: 4, // INTEGER
          name: 'slot',
          description: 'The slot number to clear (e.g. 3 for slot #3)',
          required: false,
          min_value: 1,
        },
      ],
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Unified Regear command
const REGEAR_COMMAND = {
  name: 'regear',
  description: 'Manage regear threads',
  options: [
    {
      type: 1, // SUB_COMMAND
      name: 'create',
      description: 'Create a new regear thread',
      options: [
        {
          type: 3,
          name: 'title',
          description: 'Title for the regear thread (e.g., CTA Regear, Hellgate Regear)',
          required: true,
        },
        {
          type: 3,
          name: 'time',
          description: 'Time for the regear (e.g., 20:00 UTC)',
          required: true,
        },
        {
          type: 3,
          name: 'notice',
          description: 'Optional extra instructions (e.g., Include OC break)',
          required: false,
        },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'close',
      description: 'Close a regear thread (locks & marks complete)',
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Bank command with subcommands
const BANK_COMMAND = {
  name: 'bank',
  description: 'Bank economy system',
  options: [
    {
      type: 1, // SUB_COMMAND
      name: 'deposit',
      description: 'Deposit money to a user (Admin only)',
      options: [
        {
          type: 6, // USER
          name: 'user',
          description: 'The user to deposit money to',
          required: true,
        },
        {
          type: 4, // INTEGER
          name: 'amount',
          description: 'Amount to deposit',
          required: true,
          min_value: 1,
        },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'withdraw',
      description: 'Withdraw money from a user (Admin only)',
      options: [
        {
          type: 6, // USER
          name: 'user',
          description: 'The user to withdraw money from',
          required: true,
        },
        {
          type: 4, // INTEGER
          name: 'amount',
          description: 'Amount to withdraw',
          required: true,
          min_value: 1,
        },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'balance',
      description: 'Check balance',
      options: [
        {
          type: 6, // USER
          name: 'user',
          description: 'Check another user\'s balance (optional)',
          required: false,
        },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'active',
      description: 'List all users with money',
    },
    {
      type: 1, // SUB_COMMAND
      name: 'clear',
      description: 'Clear a specific user\'s balance (Admin only)',
      options: [
        {
          type: 6, // USER
          name: 'user',
          description: 'The user to clear balance from',
          required: true,
        },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'clearall',
      description: 'Clear all users\' balances (Admin only)',
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Permissions management command
const PERMS_COMMAND = {
  name: 'perms',
  description: 'Manage role permissions (Admin only)',
  options: [
    {
      type: 1, // SUB_COMMAND
      name: 'list',
      description: 'View all assigned role permissions',
    },
    {
      type: 1, // SUB_COMMAND
      name: 'add',
      description: 'Grant permission to a role',
      options: [
        {
          type: 3, // STRING
          name: 'type',
          description: 'Permission type',
          required: true,
          choices: [
            { name: 'Bank Admin', value: 'bank' },
            { name: 'CTA Regear', value: 'cta' },
            { name: 'Content Admin', value: 'content' },
          ],
        },
        {
          type: 8, // ROLE
          name: 'role',
          description: 'The role to grant permission to',
          required: true,
        },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'remove',
      description: 'Revoke permission from a role',
      options: [
        {
          type: 3, // STRING
          name: 'type',
          description: 'Permission type',
          required: true,
          choices: [
            { name: 'Bank Admin', value: 'bank' },
            { name: 'CTA Regear', value: 'cta' },
            { name: 'Content Admin', value: 'content' },
          ],
        },
        {
          type: 8, // ROLE
          name: 'role',
          description: 'The role to revoke permission from',
          required: true,
        },
      ],
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Albion guild verification command (Admin only - SET subcommands)
const SET_COMMAND = {
  name: 'set',
  description: 'Configure Albion guild verification settings (Admin only)',
  options: [
    {
      type: 1, // SUB_COMMAND
      name: 'guild',
      description: 'Set the Albion guild and region',
      options: [
        {
          type: 3, // STRING
          name: 'region',
          description: 'Albion server region',
          required: true,
          choices: [
            { name: 'Americas', value: 'americas' },
            { name: 'Europe', value: 'europe' },
            { name: 'Asia', value: 'asia' }
          ]
        },
        {
          type: 3,
          name: 'guild_name',
          description: 'Your guild name in Albion Online',
          required: true
        }
      ]
    },
    {
      type: 1, // SUB_COMMAND
      name: 'register-role',
      description: 'Set the role assigned to verified members',
      options: [
        {
          type: 8, // ROLE
          name: 'role',
          description: 'Role to assign to registered members',
          required: true
        }
      ]
    },
    {
      type: 1, // SUB_COMMAND
      name: 'guild-tag',
      description: 'Set the guild tag for nicknames',
      options: [
        {
          type: 3,
          name: 'tag',
          description: 'Guild tag (e.g., SOUTH)',
          required: true
        }
      ]
    },
    {
      type: 1, // SUB_COMMAND
      name: 'nickname-format',
      description: 'Set nickname format ({ign}, {tag}, {guild}, {region})',
      options: [
        {
          type: 3,
          name: 'format',
          description: 'Nickname format (max 32 chars)',
          required: true
        }
      ]
    },
    {
      type: 1, // SUB_COMMAND
      name: 'alliance-role',
      description: 'Set base role assigned to alliance registrations',
      options: [
        {
          type: 8, // ROLE
          name: 'role',
          description: 'Role to assign for alliance registrations',
          required: true
        }
      ]
    },
    {
      type: 1, // SUB_COMMAND
      name: 'alliance-role-enabled',
      description: 'Enable or disable alliance role assignment',
      options: [
        {
          type: 5, // BOOLEAN
          name: 'enabled',
          description: 'Whether alliance role assignment is enabled',
          required: true
        }
      ]
    },
    {
      type: 1, // SUB_COMMAND
      name: 'alliance-nickname-format',
      description: 'Set alliance nickname format ({allianceTag}, {allianceName}, {playerName})',
      options: [
        {
          type: 3,
          name: 'format',
          description: 'Alliance nickname format template',
          required: true
        }
      ]
    },
    {
      type: 1, // SUB_COMMAND
      name: 'alliance-nickname-enabled',
      description: 'Enable or disable alliance nickname updates',
      options: [
        {
          type: 5, // BOOLEAN
          name: 'enabled',
          description: 'Whether alliance nickname updates are enabled',
          required: true
        }
      ]
    },
    {
      type: 1, // SUB_COMMAND
      name: 'alliance-nickname-overwrite',
      description: 'Control whether alliance registration overwrites existing nicknames',
      options: [
        {
          type: 5, // BOOLEAN
          name: 'enabled',
          description: 'Whether existing nicknames are overwritten',
          required: true
        }
      ]
    }
  ],
  default_member_permissions: '8', // Administrator only
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Albion config view command
const CONFIG_COMMAND = {
  name: 'config',
  description: 'View current Albion guild verification configuration (Admin only)',
  options: [
    {
      type: 1, // SUB_COMMAND
      name: 'view',
      description: 'View current configuration'
    }
  ],
  default_member_permissions: '8', // Administrator only
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Albion user registration command - no options: the guided panel asks
// guild/alliance, then the in-game name. Region comes from /set guild.
const REGISTER_COMMAND = {
  name: 'register',
  description: 'Register your Albion Online character',
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Posts the public member hub (Register / Unregister / Balance / Help buttons)
const PANEL_COMMAND = {
  name: 'panel',
  description: 'Post the member hub buttons in this channel (Admin only)',
  options: [
    {
      type: 3, // STRING
      name: 'message',
      description: 'Optional custom text for the panel (type \\n for a new line)',
      required: false
    }
  ],
  default_member_permissions: '8', // Administrator only
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Albion user unregister command
const UNREGISTER_COMMAND = {
  name: 'unregister',
  description: 'Unregister your Albion Online character',
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Albion force unregister command (Admin only)
const FORCEUNREGISTER_COMMAND = {
  name: 'forceunregister',
  description: 'Force unregister a player by IGN (Admin only)',
  options: [
    {
      type: 3, // STRING
      name: 'ign',
      description: 'In-game name to unregister',
      required: true
    }
  ],
  default_member_permissions: '8', // Administrator only
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Albion purge command (Admin only)
const PURGE_COMMAND = {
  name: 'purge',
  description: 'Purge registrations by type (Admin only)',
  options: [
    {
      type: 3, // STRING
      name: 'type',
      description: 'Purge target',
      required: true,
      choices: [
        { name: 'Alliance', value: 'alliance' },
        { name: 'Guild', value: 'guild' }
      ]
    },
    {
      type: 5, // BOOLEAN
      name: 'confirm',
      description: 'Set to true to execute purge',
      required: true
    }
  ],
  default_member_permissions: '8', // Administrator only
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Albion registered members list command (Admin only)
const REGISTERED_COMMAND = {
  name: 'registered',
  description: 'List members registered with their Albion in-game name (Admin only)',
  options: [
    {
      type: 3, // STRING
      name: 'type',
      description: 'Filter by registration type (default: all)',
      required: false,
      choices: [
        { name: 'All', value: 'all' },
        { name: 'Alliance', value: 'alliance' },
        { name: 'Guild', value: 'guild' }
      ]
    },
    {
      type: 5, // BOOLEAN
      name: 'tenure',
      description: 'Instead list holders of the register role with server join date and registration date',
      required: false
    },
    {
      type: 5, // BOOLEAN
      name: 'csv',
      description: 'With tenure: also attach the full list as a CSV file',
      required: false
    }
  ],
  default_member_permissions: '8', // Administrator only
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Tenure tier command (Admin only): roles granted automatically after N days/hours registered
const TIER_COMMAND = {
  name: 'tier',
  description: 'Roles granted automatically as members stay registered longer (Admin only)',
  options: [
    {
      type: 1, // SUB_COMMAND
      name: 'add',
      description: 'Grant a role after a member has been registered this long (re-run to change a role)',
      options: [
        { type: 8, name: 'role', description: 'Role to grant', required: true }, // ROLE
        { type: 4, name: 'days', description: 'Days since registration', required: true, min_value: 0, max_value: 3650 },
        { type: 4, name: 'hours', description: 'Extra hours (default 0)', required: false, min_value: 0, max_value: 23 },
        { type: 5, name: 'replace', description: 'Remove lower tier roles when this one is granted (default false)', required: false }
      ]
    },
    {
      type: 1,
      name: 'remove',
      description: 'Stop granting a tier role (members keep the role)',
      options: [
        { type: 8, name: 'role', description: 'Tier role to remove', required: true }
      ]
    },
    {
      type: 1,
      name: 'list',
      description: 'Show the configured tiers'
    }
  ],
  default_member_permissions: '8', // Administrator only
  type: 1,
  integration_types: [0],
  contexts: [0]
};

// Ticket management command (Admin only)
const TICKET_COMMAND = {
  name: 'ticket',
  description: 'Manage ticket system panels (Admin only)',
  options: [
    {
      type: 1, // SUB_COMMAND
      name: 'setup',
      description: 'Set up applications: saves the settings and posts the Apply button here',
      options: [
        { type: 7, name: 'forum', description: 'Forum channel where applications are created', required: true, channel_types: [15] },
        { type: 8, name: 'staff_role', description: 'Role that reviews applications (also pinged unless ping_role is set)', required: true },
        { type: 7, name: 'transcript_channel', description: 'Channel for open/close logs', required: true, channel_types: [0] },
        { type: 8, name: 'ping_role', description: 'Role to ping on new applications (default: staff_role)', required: false },
        { type: 3, name: 'message', description: 'Custom text for the Apply panel (type \\n for a new line)', required: false },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'list',
      description: 'List all configured ticket panels',
    },
    {
      type: 1, // SUB_COMMAND
      name: 'delete',
      description: 'Remove the application setup',
    },
    {
      type: 1, // SUB_COMMAND
      name: 'stats',
      description: 'View ticket statistics',
    },
    {
      type: 1, // SUB_COMMAND
      name: 'health',
      description: 'Run ticket system health check',
    },
    {
      type: 1, // SUB_COMMAND
      name: 'panel',
      description: 'Re-post the Apply button panel in this channel',
      options: [
        { type: 3, name: 'message', description: 'Custom text for the panel (type \\n for a new line)', required: false },
      ],
    },
    {
      type: 1, // SUB_COMMAND
      name: 'reset',
      description: 'Reset all ticket data and counter (WARNING: Deletes all ticket history!)',
      options: [
        {
          type: 5, // BOOLEAN
          name: 'confirm',
          description: 'Set to true to execute the reset',
          required: true
        }
      ],
    },
  ],
  type: 1,
  default_member_permissions: '8', // Administrator only
  integration_types: [0],
  contexts: [0],
};

export const ALL_COMMANDS = [UTC_COMMAND, INFO_COMMAND, HELP_COMMAND, CONTENT_COMMAND, REGEAR_COMMAND, BANK_COMMAND, PERMS_COMMAND, SET_COMMAND, CONFIG_COMMAND, REGISTER_COMMAND, PANEL_COMMAND, UNREGISTER_COMMAND, FORCEUNREGISTER_COMMAND, PURGE_COMMAND, REGISTERED_COMMAND, TIER_COMMAND, TICKET_COMMAND];

const HASH_FILE = path.join(DATA_DIR, 'commands-hash.json');

/**
 * Bulk-overwrite the global slash commands. Unless `force` is set, skips the
 * Discord call when the definitions are unchanged since the last successful
 * registration (so frequent restarts don't hit command-registration limits).
 * Throws on failure.
 */
export async function registerCommands({ force = false } = {}) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(ALL_COMMANDS)).digest('hex');

  if (!force) {
    try {
      if (JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')).hash === hash) {
        return { registered: false, count: ALL_COMMANDS.length };
      }
    } catch {
      // No previous hash (or unreadable) - register.
    }
  }

  await DiscordRequest(`applications/${process.env.APP_ID}/commands`, { method: 'PUT', body: ALL_COMMANDS });

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HASH_FILE, JSON.stringify({ hash }));
  } catch (err) {
    console.warn('⚠️ Could not save command hash (commands will re-register next start):', err.message);
  }
  return { registered: true, count: ALL_COMMANDS.length };
}

// `npm run register` - run directly, always re-register
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  registerCommands({ force: true })
    .then(({ count }) => console.log(`✅ Registered ${count} slash commands`))
    .catch((err) => {
      console.error('❌ Failed to register slash commands:', err);
      process.exitCode = 1;
    });
}
