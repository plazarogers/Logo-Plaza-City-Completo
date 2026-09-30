// Configuración central. Todo se puede sobreescribir con variables de entorno.
import 'node:process';

const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

export const config = {
  port: int(env.PORT, 3000),
  baseUrl: env.BASE_URL || `http://localhost:${int(env.PORT, 3000)}`,
  dbPath: env.DB_PATH || 'data/plaza-city.db',
  timezone: 'America/Chicago',
  // Secreto para firmar cookies de sesión. Obligatorio en producción.
  sessionSecret: env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  sessionDays: int(env.SESSION_DAYS, 30),
  // Llave que usa el dueño del edificio para generar/revocar links de invitación.
  ownerKey: env.OWNER_KEY || '',
  // Web Push (VAPID). Generar con: npm run vapid
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || 'mailto:admin@plazacity.net',
  },
  rules: {
    // Cuántos días hacia adelante se puede apartar (Skedda: "booking window").
    bookingWindowDays: int(env.BOOKING_WINDOW_DAYS, 30),
    // Máximo de horas por apartado (contiguas).
    maxHoursPerBooking: int(env.MAX_HOURS_PER_BOOKING, 4),
    // Máximo de horas por usuario por espacio por día (cuota de uso justo).
    maxHoursPerUserPerDay: int(env.MAX_HOURS_PER_USER_PER_DAY, 4),
    // Check-in: se abre X minutos antes del inicio y se cierra Y minutos después.
    // Si no hay check-in al cerrar la ventana, el espacio se libera solo
    // (Robin: 10 min por defecto; Envoy: 5 min; Skedda: 5-15 min).
    checkinOpensMinutesBefore: int(env.CHECKIN_OPENS_MINUTES_BEFORE, 15),
    checkinGraceMinutes: int(env.CHECKIN_GRACE_MINUTES, 15),
    // Se puede cancelar hasta este número de minutos antes del inicio
    // (Skedda: "lock-in margin"). 0 = hasta el mismo inicio.
    cancelLockInMinutes: int(env.CANCEL_LOCK_IN_MINUTES, 0),
    // Días por defecto de validez de un link de invitación.
    inviteDefaultDays: int(env.INVITE_DEFAULT_DAYS, 7),
  },
  isProduction: env.NODE_ENV === 'production',
};

export function assertProductionConfig() {
  if (!config.isProduction) return;
  const problems = [];
  if (config.sessionSecret === 'dev-insecure-secret-change-me') problems.push('SESSION_SECRET');
  if (!config.ownerKey) problems.push('OWNER_KEY');
  if (problems.length) {
    throw new Error(`Faltan variables de entorno obligatorias en producción: ${problems.join(', ')}`);
  }
}
