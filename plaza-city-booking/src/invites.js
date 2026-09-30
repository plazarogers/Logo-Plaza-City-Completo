// Links de invitación: única vía de registro. El dueño los genera, ve cuáles
// están activos y los revoca. Caducan solos por fecha o por número de usos.
import crypto from 'node:crypto';
import { getDb } from './db.js';
import { config } from './config.js';

export function createInvite({ label = '', maxUses = 1, days = config.rules.inviteDefaultDays } = {}) {
  const token = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + Math.max(1, days) * 86400_000).toISOString();
  const info = getDb()
    .prepare('INSERT INTO invites (token, label, max_uses, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, String(label).slice(0, 120), Math.max(1, Math.min(500, maxUses | 0)), expires);
  return getInvite(info.lastInsertRowid);
}

export function inviteUrl(token) {
  return `${config.baseUrl.replace(/\/$/, '')}/registro?invite=${encodeURIComponent(token)}`;
}

export function inviteStatus(inv) {
  const nowIso = new Date().toISOString();
  if (inv.revoked_at) return 'revoked';
  if (inv.expires_at <= nowIso) return 'expired';
  if (inv.uses >= inv.max_uses) return 'used';
  return 'active';
}

function decorate(inv) {
  return inv ? { ...inv, status: inviteStatus(inv), url: inviteUrl(inv.token) } : null;
}

export function getInvite(id) {
  return decorate(getDb().prepare('SELECT * FROM invites WHERE id = ?').get(id));
}

export function findInviteByToken(token) {
  return decorate(getDb().prepare('SELECT * FROM invites WHERE token = ?').get(String(token)));
}

export function listInvites() {
  const rows = getDb().prepare('SELECT * FROM invites ORDER BY created_at DESC LIMIT 200').all();
  return rows.map(decorate).map((inv) => ({
    ...inv,
    users: getDb().prepare('SELECT name, email, company, created_at FROM users WHERE invite_id = ?').all(inv.id),
  }));
}

export function revokeInvite(id) {
  const res = getDb()
    .prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), id);
  return res.changes > 0;
}

/** Consume un uso del invite dentro de una transacción de registro. */
export function consumeInvite(id) {
  const res = getDb()
    .prepare(
      `UPDATE invites SET uses = uses + 1
       WHERE id = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses`,
    )
    .run(id, new Date().toISOString());
  return res.changes > 0;
}
