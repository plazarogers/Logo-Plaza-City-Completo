// Notificaciones push con Web Push (VAPID). Sin Firebase ni servicios externos:
// el navegador entrega la notificación aunque la app esté cerrada.
import webpush from 'web-push';
import { getDb } from './db.js';
import { config } from './config.js';

let ready = false;

export function initPush() {
  const { publicKey, privateKey, subject } = config.vapid;
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configuradas: las push están desactivadas. Ejecuta `npm run vapid`.');
    ready = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  ready = true;
  return true;
}

export function pushEnabled() {
  return ready;
}

export function saveSubscription(userId, sub, userAgent = '') {
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Suscripción push inválida');
  }
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, String(userAgent).slice(0, 200));
}

export function removeSubscription(endpoint) {
  getDb().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function hasSubscription(userId) {
  return !!getDb().prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1').get(userId);
}

/**
 * Envía a todos los usuarios registrados excepto `excludeUserId`.
 * payload: { title, body, url, tag }
 */
export async function broadcast(payload, { excludeUserId = null } = {}) {
  if (!ready) return { sent: 0, failed: 0, skipped: true };
  const rows = excludeUserId
    ? getDb().prepare('SELECT * FROM push_subscriptions WHERE user_id != ?').all(excludeUserId)
    : getDb().prepare('SELECT * FROM push_subscriptions').all();
  return sendTo(rows, payload);
}

export async function sendToUser(userId, payload) {
  if (!ready) return { sent: 0, failed: 0, skipped: true };
  const rows = getDb().prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  return sendTo(rows, payload);
}

async function sendTo(rows, payload) {
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 60 * 60 * 6 },
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        // 404/410: la suscripción ya no existe en el navegador -> limpiar.
        if (err.statusCode === 404 || err.statusCode === 410) removeSubscription(row.endpoint);
        else console.warn('[push] fallo al enviar:', err.statusCode || err.message);
      }
    }),
  );
  return { sent, failed };
}
