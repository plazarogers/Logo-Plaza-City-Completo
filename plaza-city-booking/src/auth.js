// Autenticación: contraseñas con scrypt (nativo de Node) y sesiones en SQLite
// entregadas en una cookie httpOnly firmada con HMAC.
import crypto from 'node:crypto';
import { getDb } from './db.js';
import { config } from './config.js';

const COOKIE = 'pc_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

export function createSession(userId) {
  const id = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400_000).toISOString();
  getDb().prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expires);
  return { id, expires };
}

export function destroySession(id) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function setSessionCookie(res, session) {
  const value = `${session.id}.${sign(session.id)}`;
  res.cookie(COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    expires: new Date(session.expires),
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** Middleware: pone req.user (o null) y req.sessionId. */
export function attachUser(req, _res, next) {
  req.user = null;
  req.sessionId = null;
  const raw = parseCookies(req.headers.cookie)[COOKIE];
  if (raw) {
    const dot = raw.lastIndexOf('.');
    if (dot > 0) {
      const id = raw.slice(0, dot);
      const sig = raw.slice(dot + 1);
      const expected = sign(id);
      if (sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        const row = getDb()
          .prepare(
            `SELECT u.id, u.email, u.name, u.company, u.suite, u.lang, s.expires_at
             FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
          )
          .get(id);
        if (row && row.expires_at > new Date().toISOString()) {
          req.sessionId = id;
          req.user = { id: row.id, email: row.email, name: row.name, company: row.company, suite: row.suite, lang: row.lang };
        }
      }
    }
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required', message: 'Inicia sesión para continuar.' });
  next();
}

/** El dueño se identifica con OWNER_KEY (header x-owner-key). */
export function requireOwner(req, res, next) {
  const key = req.get('x-owner-key') || '';
  if (!config.ownerKey) {
    return res.status(503).json({ error: 'owner_key_missing', message: 'Configura OWNER_KEY en el servidor.' });
  }
  const a = Buffer.from(key);
  const b = Buffer.from(config.ownerKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'forbidden', message: 'Llave de dueño incorrecta.' });
  }
  next();
}

/** Limitador de intentos muy simple en memoria (login / registro). */
const attempts = new Map();
export function rateLimit({ max = 10, windowMs = 15 * 60_000 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const nowMs = Date.now();
    const entry = attempts.get(key) || { count: 0, reset: nowMs + windowMs };
    if (nowMs > entry.reset) {
      entry.count = 0;
      entry.reset = nowMs + windowMs;
    }
    entry.count += 1;
    attempts.set(key, entry);
    if (entry.count > max) {
      return res.status(429).json({ error: 'rate_limited', message: 'Demasiados intentos. Espera unos minutos.' });
    }
    next();
  };
}

export function purgeExpiredSessions() {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}
