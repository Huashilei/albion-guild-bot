import crypto from 'crypto';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { PermissionFlagsBits } from 'discord.js';
import { BOT_NAME } from '../../config/constants.js';
import { hasPermission } from '../../utils/permissions.js';
import { getAlbionUser } from '../albion/albion-db.js';
import { getRoster, applyOp } from './comp-db.js';

// Web side of the comp rosters: Discord login, a signed session cookie, and a
// small JSON API behind one HTML page (assets/comp/app.html).
//
// Needed env vars: PUBLIC_URL (https://your-bot-host), DISCORD_CLIENT_SECRET
// (Developer Portal > OAuth2). Redirect to add in the portal:
//   <PUBLIC_URL>/comp/auth/callback
// SESSION_SECRET is optional; without it the secret is derived from the bot token.

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/comp');
const COOKIE = 'comp_session';
const STATE_COOKIE = 'comp_state';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const publicUrl = () => (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
export const compConfigured = () => !!(publicUrl() && process.env.DISCORD_CLIENT_SECRET && process.env.APP_ID);
export const compRosterUrl = (guildId, rosterId) => `${publicUrl()}/comp/${guildId}/${rosterId}`;

const secret = () => process.env.SESSION_SECRET || crypto.createHmac('sha256', 'comp-session').update(String(process.env.DISCORD_TOKEN || '')).digest('hex');

/* ---------- signed cookies ---------- */

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, maxAgeMs) {
  const flags = ['Path=/comp', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (publicUrl().startsWith('https://')) flags.push('Secure');
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; ${flags.join('; ')}`);
}

const clearCookie = (res, name) => setCookie(res, name, '', 0);

const sessionOf = (req) => verify(readCookies(req)[COOKIE]);

// Only allow returning to our own roster pages after login
const safeNext = (next) => (/^\/comp\/\d{5,25}\/[0-9a-f]{8}$/.test(String(next)) ? String(next) : '/comp/done');

/* ---------- who is this user in this guild ---------- */

async function resolveActor(client, guildId, userId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { error: 'The bot is not in that server.', status: 404 };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { error: `You need to be a member of ${guild.name} to see this roster.`, status: 403 };
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || hasPermission(member, 'contentAdminRoles');
  const reg = getAlbionUser(guildId, userId, 'guild') || getAlbionUser(guildId, userId, 'alliance');
  return {
    guild,
    actor: { userId, isAdmin, ign: reg?.ign || null },
    me: {
      userId,
      name: member.displayName,
      avatar: member.displayAvatarURL({ size: 64, extension: 'png' }),
      isAdmin,
      ign: reg?.ign || null,
    },
  };
}

const payload = (guild, roster, me) => ({ roster, me, guildName: guild.name, botName: BOT_NAME });

/* ---------- routes ---------- */

export function mountCompRoutes(app, client) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (!compConfigured() && !req.path.startsWith('/icons/')) {
      return res.status(503).type('text').send('Rosters are not set up on this bot yet (PUBLIC_URL and DISCORD_CLIENT_SECRET are missing).');
    }
    next();
  });

  // Static assets: icons and the name list
  router.use('/icons', express.static(path.join(ASSET_DIR, 'icons'), { maxAge: '7d', immutable: true, index: false }));
  router.get('/catalog.json', (req, res) => res.sendFile(path.join(ASSET_DIR, 'catalog.json'), { maxAge: '1h' }));

  /* ----- Discord OAuth ----- */

  router.get('/auth/login', (req, res) => {
    const nonce = crypto.randomBytes(16).toString('hex');
    setCookie(res, STATE_COOKIE, sign({ nonce, next: safeNext(req.query.next), exp: Date.now() + 10 * 60 * 1000 }), 10 * 60 * 1000);
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: process.env.APP_ID,
      response_type: 'code',
      scope: 'identify',
      redirect_uri: `${publicUrl()}/comp/auth/callback`,
      state: nonce,
      prompt: 'none',
    }).toString();
    res.redirect(url.toString());
  });

  router.get('/auth/callback', async (req, res) => {
    const saved = verify(readCookies(req)[STATE_COOKIE]);
    clearCookie(res, STATE_COOKIE);
    if (!saved || !req.query.state || req.query.state !== saved.nonce || !req.query.code) {
      return res.status(400).type('text').send('Login failed or expired. Go back to Discord and open the roster link again.');
    }
    try {
      const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.APP_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: String(req.query.code),
          redirect_uri: `${publicUrl()}/comp/auth/callback`,
        }),
      });
      if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}`);
      const { access_token: accessToken } = await tokenRes.json();
      const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!meRes.ok) throw new Error(`users/@me ${meRes.status}`);
      const user = await meRes.json();
      // The Discord token is only used right here; the session keeps just the user id
      setCookie(res, COOKIE, sign({ uid: user.id, exp: Date.now() + SESSION_MS }), SESSION_MS);
      res.redirect(saved.next);
    } catch (err) {
      console.error('❌ Comp login failed:', err.message);
      res.status(502).type('text').send('Could not sign in with Discord. Try again in a moment.');
    }
  });

  router.get('/auth/logout', (req, res) => {
    clearCookie(res, COOKIE);
    res.redirect('/comp/done');
  });

  router.get('/done', (req, res) => res.type('text').send('Signed in. Go back to Discord and open the roster link.'));

  /* ----- API ----- */

  const api = express.Router({ mergeParams: true });
  api.use(express.json({ limit: '32kb' }));

  api.use((req, res, next) => {
    const { guildId, rosterId } = req.params;
    if (!/^\d{5,25}$/.test(guildId) || !/^[0-9a-f]{8}$/.test(rosterId)) return res.status(404).json({ error: 'Not found.' });
    if (req.method === 'POST') {
      // Browsers always send Origin on cross-site POSTs; refuse any that is not us
      const origin = req.headers.origin;
      if (origin && origin !== new URL(publicUrl()).origin) return res.status(403).json({ error: 'Bad origin.' });
      if (!req.is('application/json')) return res.status(415).json({ error: 'Expected JSON.' });
    }
    const session = sessionOf(req);
    if (!session) return res.status(401).json({ error: 'login' });
    req.uid = session.uid;
    next();
  });

  api.get('/', async (req, res) => {
    const { guildId, rosterId } = req.params;
    const who = await resolveActor(client, guildId, req.uid);
    if (who.error) return res.status(who.status).json({ error: who.error });
    const roster = getRoster(guildId, rosterId);
    if (!roster) return res.status(404).json({ error: 'This roster no longer exists.' });
    res.set('Cache-Control', 'no-store').json(payload(who.guild, roster, who.me));
  });

  api.post('/', async (req, res) => {
    const { guildId, rosterId } = req.params;
    const who = await resolveActor(client, guildId, req.uid);
    if (who.error) return res.status(who.status).json({ error: who.error });
    const result = applyOp(guildId, rosterId, req.body || {}, who.actor);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.set('Cache-Control', 'no-store').json(payload(who.guild, result.roster, who.me));
  });

  router.use('/api/:guildId/:rosterId', api);

  // The page itself. It carries no data; everything comes through the API.
  router.get('/:guildId/:rosterId', (req, res) => {
    if (!/^\d{5,25}$/.test(req.params.guildId) || !/^[0-9a-f]{8}$/.test(req.params.rosterId)) return res.status(404).type('text').send('Not found.');
    res.sendFile(path.join(ASSET_DIR, 'app.html'));
  });

  app.use('/comp', router);
}
