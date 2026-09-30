import { Router } from 'express';
import { getDb } from '../db.js';
import { config } from '../config.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie,
  requireUser, requireOwner, rateLimit,
} from '../auth.js';
import { createInvite, findInviteByToken, listInvites, revokeInvite, consumeInvite } from '../invites.js';
import { SPACES, dayStatus } from '../schedule.js';
import { federalHolidays, extraHolidays } from '../holidays.js';
import { isValidDateStr, todayStr, now } from '../time.js';
import {
  BookingError, createBooking, cancelBooking, checkIn, endEarly, dayView, myBookings, activityLog, upcomingOverview, logActivity,
} from '../bookings.js';
import { saveSubscription, removeSubscription, hasSubscription, pushEnabled, sendToUser } from '../push.js';

export const api = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof BookingError) return res.status(err.status).json({ error: err.code, message: err.message });
      console.error(err);
      res.status(500).json({ error: 'server_error', message: 'Error interno del servidor.' });
    }
  };
}

// ---------- Configuración pública ----------
api.get('/config', (req, res) => {
  res.json({
    timezone: config.timezone,
    rules: config.rules,
    spaces: SPACES,
    push: { enabled: pushEnabled(), publicKey: config.vapid.publicKey || null },
    today: todayStr(),
    now: now().toISO(),
    user: req.user,
  });
});

// ---------- Autenticación ----------
api.get('/me', (req, res) => {
  res.json({ user: req.user, pushSubscribed: req.user ? hasSubscription(req.user.id) : false });
});

api.get('/invites/:token', (req, res) => {
  const inv = findInviteByToken(req.params.token);
  if (!inv) return res.status(404).json({ error: 'invalid_invite', message: 'Este link de invitación no existe.' });
  if (inv.status !== 'active') {
    return res.status(410).json({ error: 'invite_' + inv.status, message: 'Este link de invitación ya no es válido.' });
  }
  res.json({ ok: true, label: inv.label, expires_at: inv.expires_at });
});

api.post('/register', rateLimit({ max: 20 }), handle((req, res) => {
  const { token, name, email, company = '', suite = '', password, lang = 'es' } = req.body || {};
  const inv = findInviteByToken(token || '');
  if (!inv || inv.status !== 'active') {
    return res.status(410).json({ error: 'invalid_invite', message: 'Este link de invitación no es válido o ya expiró.' });
  }
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'bad_name', message: 'Escribe tu nombre.' });
  if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: 'bad_email', message: 'Correo inválido.' });
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'bad_password', message: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  const db = getDb();
  let userId;
  try {
    userId = db.transaction(() => {
      if (!consumeInvite(inv.id)) throw new BookingError('invalid_invite', 'Este link de invitación ya se usó.', 410);
      const info = db
        .prepare('INSERT INTO users (email, name, company, suite, password_hash, lang, invite_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(String(email).trim().toLowerCase(), String(name).trim().slice(0, 80), String(company).trim().slice(0, 80),
          String(suite).trim().slice(0, 40), hashPassword(String(password)), lang === 'en' ? 'en' : 'es', inv.id);
      logActivity('registered', { user_id: info.lastInsertRowid, detail: inv.label });
      return info.lastInsertRowid;
    })();
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'email_taken', message: 'Ese correo ya está registrado. Inicia sesión.' });
    }
    throw err;
  }
  const session = createSession(userId);
  setSessionCookie(res, session);
  const user = db.prepare('SELECT id, email, name, company, suite, lang FROM users WHERE id = ?').get(userId);
  res.status(201).json({ user });
}));

api.post('/login', rateLimit({ max: 15 }), handle((req, res) => {
  const { email, password } = req.body || {};
  const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'bad_credentials', message: 'Correo o contraseña incorrectos.' });
  }
  const session = createSession(user.id);
  setSessionCookie(res, session);
  res.json({ user: { id: user.id, email: user.email, name: user.name, company: user.company, suite: user.suite, lang: user.lang } });
}));

api.post('/logout', (req, res) => {
  if (req.sessionId) destroySession(req.sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

api.patch('/me', requireUser, handle((req, res) => {
  const { name, company, suite, lang } = req.body || {};
  getDb()
    .prepare('UPDATE users SET name = COALESCE(?, name), company = COALESCE(?, company), suite = COALESCE(?, suite), lang = COALESCE(?, lang) WHERE id = ?')
    .run(name ? String(name).trim().slice(0, 80) : null, company != null ? String(company).slice(0, 80) : null,
      suite != null ? String(suite).slice(0, 40) : null, lang === 'en' || lang === 'es' ? lang : null, req.user.id);
  res.json({ user: getDb().prepare('SELECT id, email, name, company, suite, lang FROM users WHERE id = ?').get(req.user.id) });
}));

// ---------- Calendario y apartados ----------
api.get('/holidays/:year', (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ error: 'bad_year' });
  res.json({ year, federal: federalHolidays(year), extra: extraHolidays().filter((h) => h.date.startsWith(String(year))) });
});

api.get('/overview', requireUser, (req, res) => {
  res.json({ days: upcomingOverview(parseInt(req.query.days, 10) || 7) });
});

api.get('/calendar/:space/:date', requireUser, handle((req, res) => {
  const { space, date } = req.params;
  if (!SPACES.some((s) => s.id === space)) return res.status(404).json({ error: 'unknown_space' });
  if (!isValidDateStr(date)) return res.status(400).json({ error: 'bad_date' });
  res.json(dayView(space, date, req.user.id));
}));

api.get('/calendar/:space', requireUser, handle((req, res) => {
  // Semana (7 días) a partir de ?from=YYYY-MM-DD (default: hoy)
  const { space } = req.params;
  if (!SPACES.some((s) => s.id === space)) return res.status(404).json({ error: 'unknown_space' });
  const from = isValidDateStr(req.query.from) ? req.query.from : todayStr();
  const start = now().set({ year: +from.slice(0, 4), month: +from.slice(5, 7), day: +from.slice(8, 10) }).startOf('day');
  const days = [];
  for (let i = 0; i < 7; i++) days.push(dayView(space, start.plus({ days: i }).toISODate(), req.user.id));
  res.json({ space: SPACES.find((s) => s.id === space), from, days });
}));

api.post('/bookings', requireUser, handle((req, res) => {
  const { space, date, startHour, endHour, note } = req.body || {};
  const b = createBooking({
    userId: req.user.id, spaceId: String(space || ''), date: String(date || ''),
    startHour: Number(startHour), endHour: Number(endHour), note: note || '',
  });
  res.status(201).json({ booking: b });
}));

api.get('/bookings/mine', requireUser, (req, res) => {
  res.json({ bookings: myBookings(req.user.id) });
});

api.post('/bookings/:id/cancel', requireUser, handle((req, res) => {
  res.json({ booking: cancelBooking({ userId: req.user.id, bookingId: Number(req.params.id) }) });
}));

api.post('/bookings/:id/checkin', requireUser, handle((req, res) => {
  res.json({ booking: checkIn({ userId: req.user.id, bookingId: Number(req.params.id) }) });
}));

api.post('/bookings/:id/release', requireUser, handle((req, res) => {
  res.json({ booking: endEarly({ userId: req.user.id, bookingId: Number(req.params.id) }) });
}));

api.get('/activity', requireUser, (req, res) => {
  const before = req.query.before ? Number(req.query.before) : null;
  res.json({ items: activityLog({ limit: Math.min(200, parseInt(req.query.limit, 10) || 100), before }) });
});

api.get('/day-status/:date', requireUser, (req, res) => {
  if (!isValidDateStr(req.params.date)) return res.status(400).json({ error: 'bad_date' });
  res.json(Object.fromEntries(SPACES.map((s) => [s.id, dayStatus(s.id, req.params.date)])));
});

// ---------- Push ----------
api.post('/push/subscribe', requireUser, handle((req, res) => {
  if (!pushEnabled()) return res.status(503).json({ error: 'push_disabled', message: 'Las notificaciones push no están configuradas en el servidor.' });
  saveSubscription(req.user.id, req.body?.subscription, req.get('user-agent'));
  res.json({ ok: true });
}));

api.post('/push/unsubscribe', requireUser, (req, res) => {
  if (req.body?.endpoint) removeSubscription(String(req.body.endpoint));
  res.json({ ok: true });
});

api.post('/push/test', requireUser, handle(async (req, res) => {
  const r = await sendToUser(req.user.id, { title: 'Plaza City', body: 'Las notificaciones funcionan en este dispositivo.', url: '/', tag: 'test' });
  res.json(r);
}));

// ---------- Invitaciones (dueño) ----------
api.get('/owner/check', requireOwner, (_req, res) => res.json({ ok: true }));
api.get('/owner/invites', requireOwner, (_req, res) => res.json({ invites: listInvites() }));
api.post('/owner/invites', requireOwner, handle((req, res) => {
  const { label = '', maxUses = 1, days = config.rules.inviteDefaultDays } = req.body || {};
  res.status(201).json({ invite: createInvite({ label, maxUses: Number(maxUses) || 1, days: Number(days) || config.rules.inviteDefaultDays }) });
}));
api.post('/owner/invites/:id/revoke', requireOwner, (req, res) => {
  res.json({ ok: revokeInvite(Number(req.params.id)) });
});
api.get('/owner/users', requireOwner, (_req, res) => {
  res.json({ users: getDb().prepare('SELECT id, name, email, company, suite, created_at FROM users ORDER BY created_at DESC').all() });
});
