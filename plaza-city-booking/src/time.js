// Utilidades de tiempo. TODO el sistema razona en America/Chicago.
import { DateTime } from 'luxon';
import { config } from './config.js';

export const TZ = config.timezone;

export function now() {
  return DateTime.now().setZone(TZ);
}

/** Interpreta un ISO (con o sin zona) o un epoch ms en la zona del edificio. */
export function toLocal(value) {
  if (value instanceof DateTime) return value.setZone(TZ);
  if (typeof value === 'number') return DateTime.fromMillis(value, { zone: TZ });
  return DateTime.fromISO(value, { zone: TZ });
}

/** Construye un DateTime local a partir de 'YYYY-MM-DD' y una hora entera. */
export function slotStart(dateStr, hour) {
  return DateTime.fromISO(dateStr, { zone: TZ }).set({ hour, minute: 0, second: 0, millisecond: 0 });
}

/** Fecha local 'YYYY-MM-DD' de hoy. */
export function todayStr() {
  return now().toISODate();
}

export function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s, { zone: TZ }).isValid;
}

/** Nombre corto del día (1=lunes ... 7=domingo) para 'YYYY-MM-DD'. */
export function weekday(dateStr) {
  return DateTime.fromISO(dateStr, { zone: TZ }).weekday;
}

export function formatHour(h) {
  return `${String(h).padStart(2, '0')}:00`;
}
