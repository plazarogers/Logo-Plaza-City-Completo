import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, assertProductionConfig } from './config.js';
import { getDb } from './db.js';
import { attachUser, purgeExpiredSessions } from './auth.js';
import { initPush } from './push.js';
import { runMaintenance } from './bookings.js';
import { api } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(attachUser);
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.use('/api', api);
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // El service worker debe servirse desde la raíz con scope '/'.
  app.get('/sw.js', (_req, res) => {
    res.set('Service-Worker-Allowed', '/');
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicDir, 'sw.js'));
  });
  app.use(express.static(publicDir, { extensions: ['html'], maxAge: config.isProduction ? '1h' : 0 }));
  // SPA: cualquier otra ruta sirve index.html
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertProductionConfig();
  getDb();
  initPush();
  const app = createApp();
  runMaintenance();
  setInterval(() => {
    try {
      const r = runMaintenance();
      if (r.released) console.log(`[maintenance] liberados por no-show: ${r.released}`);
    } catch (err) {
      console.error('[maintenance]', err);
    }
  }, 60_000).unref();
  setInterval(purgeExpiredSessions, 6 * 3600_000).unref();
  app.listen(config.port, () => {
    console.log(`Plaza City Booking escuchando en ${config.baseUrl} (zona ${config.timezone})`);
    if (!config.ownerKey) console.warn('[owner] OWNER_KEY no está configurada: no se podrán crear invitaciones desde la web (usa `npm run invite`).');
  });
}
