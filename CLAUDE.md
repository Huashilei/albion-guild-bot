# albion-guild-bot — project notes for Claude

Reference doc so future sessions don't need to re-read every file. Update it (and the changelog at the bottom) whenever behaviour changes.

## What it is

White-label Discord bot for Albion Online guilds. Node ESM (`"type": "module"`), discord.js v14 for the gateway and builders, Express for the HTTP interactions endpoint, flat JSON files for storage. No test suite. No linter.

## Architecture

- `app.js`: entry point. Starts the gateway client (only for `messageCreate` and the member/guild cache) and an Express server. `POST /interactions` (verified with `PUBLIC_KEY`) receives slash commands, buttons, selects and modals over HTTP, not the gateway. It also registers slash commands on start (hash-skipped when unchanged). The handler wraps `res.send` so immediate ephemeral replies auto-dismiss.
- `commands.js`: slash command definitions (`ALL_COMMANDS`) plus `registerCommands()`. `npm run register` forces re-registration. The hash is stored in `DATA_DIR/commands-hash.json`.
- `utils.js`: `DiscordRequest(endpoint, options)` REST helper and the ephemeral auto-dismiss logic (see below).
- `src/commands/slashCommands.js`: all slash command handlers, one big `if (name === ...)` chain.
- `src/commands/prefixCommands.js`: `!` prefix equivalents (prefix per server via `!prefix`, default `!`). Largely duplicates slash commands.
- `src/events/interactionCreate.js`: `handleButtonInteractions` (components) and `handleModalSubmit`. All custom_id routing lives here.
- `src/events/messageCreate.js`: content-thread `x <role>` / `x fill` / `x cancel` signup, prefix command dispatch, ticket message logging. Ignores bots and DMs.
- `src/services/contentService.js`: content callout roles (`MASTER_ROLES`), embed and button builders, wizard step builders, `autoAssignFillPlayers`.
- `src/config/contentState.js`: `contentState`, a single global active callout (NOT per server), and `pendingCreations`, a Map of wizard sessions by userId.
- `src/config/constants.js`: `DATA_DIR` (env, default `/home/container/data`), `BOT_NAME` (env, default `Minokawa`), `CUSTOM_EMOJIS`, `PORT`.
- `src/systems/albion/`: `albion.js` (register/unregister/purge logic), `albion-api.js` (Albion gameinfo API wrapper), `albion-db.js` (config and users JSON), `register-ui.js` (registration panel, modal and result embed builders).
- `src/systems/hub/member-hub.js`: Member Hub panel plus shared balance and unregister response builders.
- `src/systems/bank/bank.js`: per-server balances.
- `src/systems/ticket/`: forum-based application tickets (`ticket-system.js` handlers, `ticket-db.js` storage, `ticket-commands.js` prefix helpers, `ticket-utils.js` stats/health).
- `src/systems/tempvc/temp-vc.js`: join-to-create voice. Joining a voice channel named `CREATE VC` (case-insensitive) creates `<name>'s VC` in the same category (copies bitrate, user limit, overwrites), moves the member in, and deletes it when empty. Temp channel ids persist in `DATA_DIR/temp-vc.json` for cleanup after restarts. Needs the `GuildVoiceStates` intent and Manage Channels + Move Members permissions.
- `src/database/guildData.js`: prefix and role-permission files. `src/utils/permissions.js`: `hasPermission` (gateway member) and `hasPermissionSlash` (raw interaction member). `src/utils/embedBuilder.js`: help pages and the registered-members list. `src/utils/atomicFile.js`: atomic JSON write.

### Data files (all under `DATA_DIR`)

`albion-config-<guild>.json`, `albion-users-<guild>.json`, `bank-data-<guild>.json`, `permissions-config-<guild>.json`, `prefix-config-<guild>.json`, `commands-hash.json`, and `guilds/<guild>/` (tickets, panels, transcripts).

### Env vars

`APP_ID`, `DISCORD_TOKEN`, `PUBLIC_KEY`, `DATA_DIR`, `BOT_NAME`, `PORT`, and optionally `EPHEMERAL_AUTO_DISMISS=false` to disable auto-dismiss.

## Key behaviours and gotchas

- **Ephemeral auto-dismiss.** `scheduleEphemeralDismiss` in `utils.js` deletes `@original` after 8–30s (embeds: 30s) for ephemeral messages (flag 64) with NO components. It triggers in two places: `DiscordRequest` on any successful PATCH of `webhooks/.../messages/@original`, and the `res.send` wrapper in `app.js` for immediate type-4 replies. Deferred replies are only cleaned when the final PATCH is sent. Interactive messages (panels, wizards, pickers) are never deleted. When a component click should replace its own message, respond with `DEFERRED_UPDATE_MESSAGE` (type 6) and PATCH with `embeds: [], components: []`, not a new deferred message.
- **Region always comes from config.** `registerUser` overrides any passed region with `config.albionRegion`. Players are never asked for a region. Alliance validation uses the home guild's live `AllianceId` from the Albion API.
- **Admin checks.** Slash admin commands check `member.permissions` for the Administrator bit and also set `default_member_permissions: '8'`. Delegated roles (`bankAdminRoles`, `ctaRegearRoles`, `contentAdminRoles`) are managed with `/perms` and checked with `hasPermissionSlash`.
- **Content/regear pings** use `registerRoleId` from the Albion config.
- Several files use CRLF line endings. Edit with exact-match tools. The Edit tool works for single lines. Python is not installed on this machine; use Node for scripted edits.
- Imports: the app was smoke-tested with `DATA_DIR=<tmp> node -e "import('./src/commands/slashCommands.js')..."` plus `node --check`.

## Discord features

### Slash commands (all registered in `commands.js`)

Everyone:
- `/help`: paginated, permission-aware help (ephemeral, with prev/next buttons).
- `/utc`: current UTC time.
- `/info <playername>`: look up a player across all three regions.
- `/register`: no options; opens the guild/alliance button panel (ephemeral). Then the IGN modal.
- `/unregister`: removes the caller's guild and alliance registrations, role and nickname.
- `/bank balance [user]` and `/bank active`: ephemeral.

Role-gated:
- `/content create | adduser | removeuser`: Content Admin role or Administrator. `create` starts the wizard; `adduser`/`removeuser` edit the live callout (by user or slot number).
- `/regear create <title> <time> [notice]` and `/regear close`: CTA Regear role or Administrator. Create makes a thread and pings the register role; close renames it `[✓]` and locks it.
- `/bank deposit | withdraw | clear | clearall`: Bank Admin role or Administrator. Public receipts.

Administrator only:
- `/panel [message]`: post the Member Hub in the current channel.
- `/perms list | add | remove` (types: bank, cta, content).
- `/set guild | register-role | guild-tag | nickname-format | alliance-role | alliance-role-enabled | alliance-nickname-format | alliance-nickname-enabled | alliance-nickname-overwrite`
- `/tier add <role> <days> [hours] [replace] | remove <role> | list`: tenure tiers. Role is granted automatically once a registration is that old (cumulative from registration: tiers at 30d and 60d give the second role at day 60, not day 90). `replace:true` removes lower tier roles when granted. Adding a tier triggers an immediate sweep so existing qualifying members get it.
- `/config view`: show verification config.
- `/forceunregister <ign>`, `/purge type:<guild|alliance> confirm:true`, `/registered [type] [tenure]`. With `tenure:true` it ignores `type` and lists every holder of the register role (`registerRoleId`) with days on the server (Discord `joinedAt`) and days since DB registration (`registeredAt`, a proxy for role-assign date since Discord does not expose that), sorted longest on server first. Deferred reply; fetches all guild members.
- `/ticket setup <forum> <staff_role> <transcript_channel> [ping_role] [message]`: saves the single `apply` panel and posts the Apply button in the current channel. `/ticket panel [message]` re-posts the button. `/ticket delete` (no options), `list`, `stats`, `health`, `reset confirm:true`. The panel ID is fixed to `apply`; approve role = ping role, nickname format = `{username}`. Prefix `!ticketsetup` keeps its old long signature.

### Prefix commands (default `!`)

`utc`/`time`, `info`, `bank`/`bal` (balance, deposit, withdraw, active, clear, clearall), `prefix`, `perms`, `help`/`commands`, `ticket` (setup, list, delete, stats, health, panel, reset) plus aliases `ticketsetup`, `ticketpanels`, `ticketdelete`, `ticketstats`, `tickethealth`, `applypanel`, `set`, `config`, `register`/`reg` (`!register [alliance|guild] <ign>`, an optional leading region word is accepted and ignored), `unregister`/`unreg`, `forceunregister`/`forceunreg`, `purge`, `registered`.

### Content thread text commands

In the active content thread: `x <role>` (key or short label), `x fill`, `x cancel`.

### Buttons, selects and modals (custom_id routing in `interactionCreate.js`)

- Member Hub (public, posted by `/panel`): `hub_register` (opens the type panel), `hub_unregister`, `hub_balance`, `hub_help`.
- Registration: `albreg_type_<guild|alliance>` opens modal `albreg_modal_<type>` with field `albreg_ign`. If several players share the name, buttons `albion_register_<userId>_<region>_<type>_<playerId>` let the user pick; only the same user can click.
- Content wizard (ephemeral): `content_size_select`, `content_method_custom` / `content_method_dropdown`, `content_preset_tank|heal|support`, `content_preset_dps_g1..g4`, `content_preset_to_dps` / `to_nondps` / `confirm`, modals `content_custom_modal` and `content_create_modal`, `content_details_btn`, `content_preview_publish` / `content_preview_edit`.
- Live callout buttons: `content_role_<key>`, `content_fill`, `content_cancel`. Fill players are auto-assigned to open slots at random.
- Tickets: `apply_ticket` (creates a forum post; hardcoded to panel `apply`), `ticket_claim`, `ticket_close`.
- Help paging: `help_prev_<n>`, `help_next_<n>`.

## Known issues and decisions pending

- `contentState` is global: only one callout across every server.
- Ticket system supports one panel (`apply`) per server. The application questions and notice text are hardcoded in `ticket-system.js`.
- `pendingCreations` entries never expire.
- Albion region URLs are duplicated in `/info` (slash and prefix) and `albion-api.js`.
- Slash and prefix commands duplicate each other (prefixCommands.js is about 1,200 lines).
- `BOT_NAME` default and `CUSTOM_EMOJIS` IDs are specific to one deployment.
- The register role doubles as the content/regear ping role.

## Changelog

### Commit log
- `/registered tenure` and tenure tiers (`/tier`) committed together (`15b2824`) on branch `feat/member-hub-simplify-setup` and pushed.
- README documents both (`aefbf5b`).
- `/registered tenure` rows now also show the member's current tier role and the next tier with days remaining (`buildTenureListEmbeds` row fields `tierRoleId`, `next`).

### Tenure tiers
- New `src/systems/albion/tiers.js` (`applyTiers`, `stripTierRoles`) and `/tier` command. Tiers live in the Albion config as `loyaltyTiers: [{ id, roleId, days, hours, replace }]` (id = roleId, so one tier per role).
- Timeline = the registration's `created_at`. Changed `toRegistrationRecord` in `albion-db.js`: re-registering over an inactive (unregistered/force-unregistered/purged) record now gets a fresh `created_at` and empty `tiers_granted`. Before, the old `created_at` was silently reused. Active records keep theirs.
- Each record stores `tiers_granted` (ids already given) so a tier is granted once per registration; a role an admin removes by hand is not re-added. Guild and alliance records each have their own timeline.
- Sweep runs on bot `ready` and every 15 min (`app.js`), plus right after `/tier add`. Needs the bot's role above tier roles. Failed grants are logged and retried next sweep.
- `unregisterUser` and both purge paths call `stripTierRoles`, removing granted tier roles. If a user holds both guild and alliance records, unregistering one strips tier roles that record granted.
- Tested: DB-level timeline reset and `tiers_granted` persistence with a temp `DATA_DIR`. Not tested against Discord. Run `npm run register` or restart to push `/tier`.

### Registered-role tenure
- `/registered tenure:true` (admin) lists register-role holders with server join age and registration age. Added `tenure` boolean option in `commands.js`, `buildTenureListEmbeds` in `embedBuilder.js`, handler branch in `slashCommands.js`. Role holders without a DB record show "not in DB"; records lacking `registeredAt` show "n/a". Not added to the `!registered` prefix command or `/help` text. Run `npm run register` or restart to push the new option (hash changes, auto-registers on start). Syntax-checked only, not run against Discord.

### Join-to-create voice
- Added `src/systems/tempvc/` and the `voiceStateUpdate` handler in `app.js`; added `GuildVoiceStates` intent. No config or commands: a voice channel just has to be named `CREATE VC`.

### Simplification pass
- `/ticket setup` cut from 6 required options (panel_id, ticket_type, category ID text, ping role, comma-separated staff role IDs, transcript channel) to 3 pickers (forum, staff_role, transcript_channel) plus optional ping_role and message. It also posts the Apply button, so a separate `/ticket panel` is no longer needed. `/ticket delete` and `/ticket panel` lost their `panel_id` option. This fixes the stale `approve_role`/`nickname_format` option reads.
- `/panel` (member hub) was already a single optional `message` option; unchanged.

### Latest session: usability and loophole pass (uncommitted when written)
- Added ephemeral auto-dismiss (`utils.js`, `app.js`). Content publish and multi-match character picker now replace their message in place (type 6) instead of leaving stale buttons.
- Registration redesign: removed region and alliance-Asia restrictions; `/register` has no options; region forced from config in `registerUser`; result embed uses `result.data.region`. `register-ui.js` now exports `buildTypePanel(config)`, `buildIgnModal(type)`, `isValidRegisterType`, `buildNotConfiguredPanel`; region exports removed.
- New `src/systems/hub/member-hub.js` and `/panel` command with the four hub buttons. `/unregister` now shares `buildUnregisterBody` with the hub.
- `/bank balance` and `/bank active` are ephemeral. `/config` is admin-only (runtime check plus `default_member_permissions`).
- `!register` no longer needs a region.
- Fixed: `/ticket health` literal `\n`, DM crash in `messageCreate`, full interaction body logged on every request (leaked tokens), wrong "Button" log label, duplicated `DATA_DIR` defaults in `bank.js` and `ticket-db.js` (now imported from `constants.js`).
- Help text updated: removed nonexistent `/content reset` and stale `/content create` options, documented the hub and `/panel`.

### Before this session (from git history)
- Pinged the registered role instead of a hardcoded role ID in content/regear threads.
- Fixed `/register` crash when run with no options.
- Slash commands registered automatically on bot start.
- Guided `/register` panel (region, guild/alliance, IGN modal) and clearer role-assign errors. The region step has since been removed.
- Made README generic; package renamed `albion-guild-bot`.
