'use strict';

const crypto = require('crypto');
const cfg = require('./config');

const TOKEN_TTL_MS = 5 * 60 * 1000;
const ADMIN_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map();
const adminCache = new Map();
let groupResource = null;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function trim(map) {
  if (map.size > 5000) map.clear();
}

async function getJson(url, token) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(8000)
  });
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return { status: res.status, body };
}

/** Validates a Google OAuth access token and returns { email }. */
async function verifyToken(token) {
  const key = sha(token);
  const hit = tokenCache.get(key);
  if (hit && hit.until > Date.now()) return hit.user;

  const { status, body } = await getJson(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
  );
  if (status !== 200 || !body) throw httpError(401, 'Sign-in could not be verified.');

  const email = String(body.email || '').toLowerCase();
  const verified = String(body.email_verified) === 'true';
  const client = String(body.azp || body.aud || '');
  const expMs = Number(body.exp) * 1000;

  if (!email || !verified) throw httpError(401, 'Sign-in has no verified email.');
  if (!email.endsWith(`@${cfg.domain}`)) throw httpError(403, `This tool is for ${cfg.domain} accounts only.`);
  if (cfg.oauthClientId) {
    if (client !== cfg.oauthClientId) throw httpError(403, 'Token was not issued to this add-on.');
  } else if (cfg.projectNumber && !client.startsWith(`${cfg.projectNumber}-`)) {
    throw httpError(403, 'Token was not issued to this add-on.');
  }
  if (!expMs || expMs <= Date.now()) throw httpError(401, 'Sign-in has expired.');

  const user = { email };
  trim(tokenCache);
  tokenCache.set(key, { user, until: Math.min(expMs, Date.now() + TOKEN_TTL_MS) });
  return user;
}

/** True when the user is in the admin Google Group (or the safety-net list). */
async function isAdmin(email, token) {
  if (cfg.adminEmails.includes(email)) return true;
  if (!cfg.adminGroup) return false;

  const hit = adminCache.get(email);
  if (hit && hit.until > Date.now()) return hit.value;

  let value = false;
  try {
    if (!groupResource) {
      const g = await getJson(
        `https://cloudidentity.googleapis.com/v1/groups:lookup?groupKey.id=${encodeURIComponent(cfg.adminGroup)}`,
        token
      );
      if (g.status === 200 && g.body && g.body.name) groupResource = g.body.name;
    }
    if (groupResource) {
      const m = await getJson(
        `https://cloudidentity.googleapis.com/v1/${groupResource}/memberships:lookup?memberKey.id=${encodeURIComponent(email)}`,
        token
      );
      value = m.status === 200 && Boolean(m.body && m.body.name);
    }
  } catch (e) {
    console.warn('Admin group check failed:', e.message);
    value = false;
  }
  trim(adminCache);
  adminCache.set(email, { value, until: Date.now() + ADMIN_TTL_MS });
  return value;
}

function httpError(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  return err;
}

/** Express middleware: sets req.user = { email, isAdmin }. */
async function authenticate(req, res, next) {
  try {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) throw httpError(401, 'Missing sign-in token.');
    const user = await verifyToken(m[1]);
    const admin = await isAdmin(user.email, m[1]);
    /* An admin can ask to see exactly what a normal user sees ("View as user"). */
    const asUser = admin && String(req.headers['x-view-as'] || '').toLowerCase() === 'user';
    req.user = { email: user.email, isAdmin: admin && !asUser, realAdmin: admin, viewingAsUser: asUser };
    next();
  } catch (e) {
    next(e);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) return next(httpError(403, 'Only template admins can do this.'));
  next();
}

module.exports = { authenticate, requireAdmin, httpError, sha };
