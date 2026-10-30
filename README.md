# Albion-Guild-Bot - Albion Online Guild Tools for Discord

A white-label Discord bot of guild tools for Albion Online, featuring automatic guild/alliance verification, a virtual bank economy, content (group activity) callouts, regear threads, and an application ticket system.

---

## Features

- **Guild Verification** - Automatically verify members are in your Albion guild
- **Alliance Registration** - Register alliance members with configurable roles and nicknames
- **Tenure Tiers** - Automatically grant extra roles as members stay registered longer (e.g. Veteran at 30 days, Old at 60)
- **Virtual Bank** - Track virtual currency for guild activities
- **Content Management** - Organize group content with role signups
- **Ticket System** - Application and support tickets
- **Regear Threads** - Manage regear requests for any content type

---

## Setup

### Prerequisites

- Node.js 18+
- A Discord application + bot ([Discord Developer Portal](https://discord.com/developers/applications))

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.Example` to `.env` and fill in real values - **never commit `.env`** (it's gitignored):

| Variable | Required | Description |
|---|---|---|
| `APP_ID` | Yes | Your Discord application ID |
| `DISCORD_TOKEN` | Yes | Your bot's token (Bot tab in the Developer Portal) |
| `PUBLIC_KEY` | Yes | Your application's public key, used to verify incoming interaction requests |
| `DATA_DIR` | No | Where per-guild JSON data is stored. Defaults to `/home/container/data` (matches the Pelican egg layout). Set this to a local path (e.g. `./data`) for local development |
| `BOT_NAME` | No | Display name shown in help embeds and footers. Defaults to `Minokawa`. Set this to your own guild or bot name - the bot is white-label, so no code changes are needed to rebrand it |
| `PORT` | No | Port the Express server listens on for the `/interactions` webhook. Defaults to `3000` |

### 3. Register slash commands

```bash
npm run register
```

The bot also does this **automatically on every start** (skipped when `commands.js` hasn't changed since the last successful registration), so deploying and restarting is enough. Run `npm run register` manually only to force a re-registration. It can take a few minutes for Discord to propagate command changes.

### 4. Configure the Interactions Endpoint URL

This bot receives slash commands, buttons, and modals over an **HTTP webhook**, not the Discord gateway. In the Developer Portal, under your application's **General Information**, set **Interactions Endpoint URL** to:

```
https://<your-public-host>/interactions
```

Discord will only deliver interactions to whichever transport is configured here - if this is set, the gateway will not also receive them. The bot still keeps a gateway connection open (`app.js`), but only for `messageCreate` (prefix commands) and the member/guild cache.

### 5. Run the bot

```bash
npm start        # production
npm run dev      # local dev, auto-restarts on change (nodemon)
```

### Docker / Pelican deployment

`Dockerfile.pelican` is the image actually built and pushed by CI (`.github/workflows/docker-image.yml`, published as `<dockerhub-user>/albion-guild-bot:pelican-latest` on Docker Hub; set `DOCKER_USERNAME` / `DOCKER_PASSWORD` repo secrets and update the image name in the workflow if you fork it) - it follows Pelican's `container` user + `tini` conventions and expects the app's persistent data volume mounted at whatever `DATA_DIR` resolves to (defaults to `/home/container/data`).

Pushing to `main` only builds and publishes a new image - it does **not** auto-restart the running Pelican server. Pull the new image and restart the container manually (or via Pelican's own auto-update settings) to actually deploy a change.

### Required bot permissions

- View Channels
- Send Messages
- Embed Links
- Manage Channels (ticket system creates/deletes channels)
- Manage Roles (Albion registration, ticket approval)
- Manage Nicknames (Albion registration, ticket approval)
- Create Threads / Manage Threads (content callouts, regear)
- Read Message History

---

## Data & Storage

There is no database - all persistence is flat JSON files under `DATA_DIR`, one set per guild:

| File | Owner | Purpose |
|---|---|---|
| `prefix-config-{guildId}.json` | `src/database/guildData.js` | Custom command prefix (default `!`) |
| `permissions-config-{guildId}.json` | `src/database/guildData.js` | Role lists allowed to manage bank/CTA/content |
| `albion-config-{guildId}.json` | `src/systems/albion/albion-db.js` | Guild/region/role/nickname-format configuration |
| `albion-users-{guildId}.json` | `src/systems/albion/albion-db.js` | Registered members |
| `bank-data-{guildId}.json` | `src/systems/bank/bank.js` | Virtual currency balances |
| `guilds/{guildId}/{tickets,transcripts,panels,meta}.json` | `src/systems/ticket/ticket-db.js` | Ticket system state |

All writes go through a temp-file-then-rename pattern (`src/utils/atomicFile.js`, and `ticket-db.js`'s own async version), so a crash or forced restart mid-write can't leave one of these files truncated. **Back these files up regularly** - they're the only copy of guild configuration, balances, and ticket history.

---

## Commands Reference

### Getting Started (Members)

1. **Register your character:**
   ```
   /register
   ```
   A panel walks you through it: pick your server region, pick Guild or Alliance, then type your in-game name. (Power users can still use the shortcut `/register region:asia type:alliance name:YourCharacterName`.)
2. **Sign up for content** - in a content thread, type `x tank` (or your role), `x fill`, or `x cancel`.
3. **Check your bank balance:** `/bank balance`

### User Commands

| Command | Description |
|---|---|
| `/help` | Show all available commands |
| `/utc` | Display current UTC time (Albion game time) |
| `/info <playername>` | Search for any Albion player |
| `/register` | Guided registration panel (region -> Guild/Alliance -> in-game name). Ties your IGN to your Discord account. Optional shortcut: `/register region:<region> type:<alliance\|guild> name:<ign>` |
| `/unregister` | Unregister your character |
| `/config view` | View guild verification settings |
| `/bank balance [@user]` | Check your balance or another user's |
| `/bank active` | See all members with bank balances |

**Regions:** `americas`, `europe`, `asia`

**Content threads:** `x <role>` to sign up for a role, `x fill` for any open slot, `x cancel` to leave.

### Admin Commands

**Albion verification**

| Command | Description |
|---|---|
| `/set guild <region> <name>` | Configure guild and region |
| `/set register-role @role` | Role given to verified members |
| `/set guild-tag <tag>` | Guild tag used in nicknames |
| `/set nickname-format <format>` | Nickname template (`{ign}`, `{tag}`, `{guild}`, `{region}`) |
| `/set alliance-role @role` | Alliance registration role |
| `/set alliance-role-enabled <true\|false>` | Toggle alliance role assignment |
| `/set alliance-nickname-format <format>` | Alliance nickname template (`{allianceTag}`, `{allianceName}`, `{playerName}`) |
| `/set alliance-nickname-enabled <true\|false>` | Toggle alliance nickname updates |
| `/set alliance-nickname-overwrite <true\|false>` | Overwrite existing nickname on re-register |
| `/forceunregister <ign>` | Force-unregister a member by IGN |
| `/purge type:guild confirm:true` | Re-verify every guild-registered member against the Albion API and remove anyone no longer in the guild (including members who hold the role but were never registered at all) |
| `/purge type:alliance confirm:true` | Re-verify every alliance-registered member and remove anyone no longer in the guild's current alliance (same manually-assigned-role handling as guild purge) |
| `/registered [type:all\|guild\|alliance]` (or `!registered [all\|guild\|alliance]`) | List every registered member with their linked Albion IGN, grouped by type |
| `/registered tenure:true [csv:true]` | List every holder of the register role with days on the server and days since registration, longest first, plus each member's current tier role and the next tier with days remaining. Shows 20 members per page with Previous/Next buttons, so any guild size works. `csv:true` also attaches the full list as a CSV (Discord ID, username, IGN, join and registration dates, days, current and next tier). Discord does not expose role-assignment time, so registration date stands in for it |
| `/tier add <role> <days> [hours] [replace]` | Grant a role once a member has been registered that long. Thresholds count from registration, so tiers at 30 and 60 days give the second role at day 60. `replace:true` removes lower tier roles. Re-run with the same role to change it |
| `/tier remove <role>` | Stop granting a tier role (members keep it) |
| `/tier list` | Show configured tiers |

If an alliance tag is missing, alliance name is used instead; if both are missing, the nickname falls back to player name only.

**Tenure tiers.** The timeline starts at registration and resets if the member unregisters, is force-unregistered or is purged, then registers again. The bot checks on start, every 15 minutes and right after `/tier add`. Each tier is granted once per registration, so a tier role removed by hand is not re-added. Unregistering or purging also removes the tier roles the bot granted. The bot's role must be above the tier roles in the role list.

**Alliance verification is automatic, not configured.** `type:alliance` registration and `/purge type:alliance` both look up the configured guild's (`/set guild`) *current* alliance live from the Albion API every time, and check the registering/purged player against that - there's no separate alliance name to set or keep in sync. If the guild ever switches alliances in-game, registration and purge pick that up automatically on the next run. If the guild currently isn't in any alliance, alliance registration/purge is unavailable until it joins one.

**Bank**

| Command | Description |
|---|---|
| `/bank deposit @user <amount>` | Add money to a user's account |
| `/bank withdraw @user <amount>` | Remove money from a user's account |
| `/bank clear @user` | Clear a specific user's balance |
| `/bank clearall` | Clear all balances (use with caution) |

**Content**

| Command | Description |
|---|---|
| `/content create` | Create a content callout (ROA/CTA/GCAMPS/FF/Tracking/Avadungeon) |
| `/content reset` | Reset content system for a new callout |
| `/content adduser @user [role]` | Manually add a user to a role slot |
| `/content removeuser [role]` | Remove a user from a role slot |

Content types: **ROA** (Roads of Avalon, 7 roles + fill), **CTA** (tank/heal/dps/support/dtank), **GCAMPS** (5 roles + fill), **FF** (tank/heal/dps), **Tracking** (5 roles + fill), **Avadungeon** (10 roles + fill).

**Regear**

| Command | Description |
|---|---|
| `/regear create <title> <time> [notice]` | Create a regear thread with any title (e.g. "CTA Regear", "Hellgate Regear") - `notice` is an optional extra instruction line (e.g. "Include OC break") |
| `/regear close` | Close and lock the regear thread |

Both subcommands require the same `ctaRegearRoles` permission (see `/perms`) - there's no more per-type distinction, since the title is free text now.

**Ticket system**

The prefix form mirrors the slash form 1:1 - `/ticket <subcommand>` <-> `!ticket <subcommand>`:

| Command | Slash | Prefix |
|---|---|---|
| Configure a panel | `/ticket setup` | `!ticket setup <panelId> "<name>" <categoryId> <pingRoleId> <staffRoleIds> <approveRoleId> <transcriptChannelId> ["<nicknameFormat>"]` |
| List panels | `/ticket list` | `!ticket list` |
| Post the apply button | `/ticket panel [id]` | `!ticket panel` |
| Delete a panel | `/ticket delete <id>` | `!ticket delete <panelId>` |
| View statistics | `/ticket stats` | `!ticket stats` |
| Health check | `/ticket health` | `!ticket health` |
| Reset all ticket data | `/ticket reset confirm:true` | `!ticket reset confirm` |

The old flat command names (`!ticketsetup`, `!ticketpanels`, `!ticketdelete`, `!ticketstats`, `!tickethealth`, `!applypanel`) still work as aliases.

Example panel setup: `!ticket setup apply "Apply" 123456789012345678 987654321098765432 111111111111111111,222222222222222222 333333333333333333 444444444444444444 "{username}"` (staff role IDs are comma-separated, no spaces; quoted values may contain spaces).

`/ticket reset` / `!ticket reset` **permanently deletes all tickets and transcripts for the server** - both now require explicit confirmation (`confirm:true` / `confirm`), matching `/purge`'s pattern.

Ticket lifecycle: **open** → **claimed** (staff clicked Claim) → **approved** (role + nickname applied) or **closed** (no approval). Data is isolated per guild under `guilds/{guildId}/` - see [Data & Storage](#data--storage).

**Permissions**

| Command | Description |
|---|---|
| `!prefix <new>` | Change the bot's prefix for this server |
| `/perms list` | View role permissions |
| `/perms add <bank\|cta\|content> @role` | Grant a role permission |
| `/perms remove <bank\|cta\|content> @role` | Revoke a role permission |

---

## FAQ / Troubleshooting

**Why can't I register?**
Use your exact in-game name (case-sensitive), confirm you're actually in the guild/alliance in Albion, and check you selected the right region.

**How do I change my registered character?**
`/unregister`, then `/register` with the new character. Only one character per Discord account.

**My nickname/role didn't change.**
The bot needs Manage Nicknames / Manage Roles, and its own role must be positioned *above* the role or member being changed in Server Settings → Roles.

**What does a purge do?**
`type:guild` re-checks registered members against the Albion API and removes entries that no longer match; `type:alliance` removes all active alliance registrations and the configured alliance role(s).

**Tickets aren't being created.**
Confirm a panel exists (`!ticketpanels` / `/ticket list`) and the bot has Manage Channels and the category ID in the panel config is correct.

**Slash commands aren't showing up in Discord.**
Run `npm run register` and wait a few minutes for Discord to propagate the change.

---

## Support

For help or issues, contact your guild leadership through Discord.
