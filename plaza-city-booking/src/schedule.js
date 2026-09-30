// Espacios, horarios permitidos y validación de franjas.
// Todos los apartados son en bloques de 1 hora, en America/Chicago.
import { weekday } from './time.js';
import { holidayFor } from './holidays.js';

// weekday: 1=lunes ... 6=sábado, 7=domingo
const MON_FRI = [1, 2, 3, 4, 5];
const SAT = [6];

/**
 * Cada espacio tiene "ventanas" [{days, from, to, label}]. `to` es exclusivo:
 * from 8, to 17 => franjas 8-9, 9-10, ..., 16-17.
 */
export const SPACES = [
  {
    id: 'conference',
    name: 'Conference Room',
    nameEs: 'Sala de Juntas',
    floor: 'Planta baja',
    icon: 'conference',
    windows: [
      { days: MON_FRI, from: 8, to: 17, kind: 'regular' },
      { days: MON_FRI, from: 17, to: 21, kind: 'special' },
    ],
  },
  {
    id: 'atrium',
    name: 'Atrium',
    nameEs: 'Atrio',
    floor: 'Planta baja',
    icon: 'atrium',
    windows: [
      { days: MON_FRI, from: 17, to: 21, kind: 'regular' },
      { days: SAT, from: 8, to: 13, kind: 'regular' },
    ],
  },
  {
    id: 'lounge',
    name: 'Lounge',
    nameEs: 'Lounge',
    floor: 'Segundo piso',
    icon: 'lounge',
    windows: [
      { days: MON_FRI, from: 17, to: 21, kind: 'regular' },
      { days: SAT, from: 8, to: 13, kind: 'regular' },
    ],
  },
];

export const SPACE_IDS = SPACES.map((s) => s.id);

export function getSpace(id) {
  return SPACES.find((s) => s.id === id) || null;
}

/**
 * Estado de un día para un espacio:
 *  - { open: false, reason: 'sunday' | 'holiday', holiday? }  -> uso libre
 *  - { open: false, reason: 'closed' }                        -> no hay horario ese día
 *  - { open: true, hours: [{hour, kind}] }
 */
export function dayStatus(spaceId, dateStr) {
  const space = getSpace(spaceId);
  if (!space) throw new Error(`Espacio desconocido: ${spaceId}`);
  const wd = weekday(dateStr);
  if (wd === 7) return { open: false, reason: 'sunday', freeUse: true };
  const holiday = holidayFor(dateStr);
  if (holiday) return { open: false, reason: 'holiday', freeUse: true, holiday };
  const hours = [];
  for (const w of space.windows) {
    if (!w.days.includes(wd)) continue;
    for (let h = w.from; h < w.to; h++) hours.push({ hour: h, kind: w.kind });
  }
  hours.sort((a, b) => a.hour - b.hour);
  if (!hours.length) return { open: false, reason: 'closed', freeUse: false };
  return { open: true, hours };
}

/** ¿Está permitida la franja [hour, hour+1) ese día para ese espacio? */
export function isHourAllowed(spaceId, dateStr, hour) {
  const st = dayStatus(spaceId, dateStr);
  return st.open && st.hours.some((h) => h.hour === hour);
}

/**
 * Valida un rango [startHour, endHour) contra el horario del espacio.
 * Devuelve { ok: true } o { ok: false, code, message }.
 */
export function validateRange(spaceId, dateStr, startHour, endHour, rules) {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    return { ok: false, code: 'bad_hours', message: 'Las horas deben ser enteras.' };
  }
  if (endHour <= startHour) {
    return { ok: false, code: 'bad_range', message: 'La hora final debe ser mayor a la inicial.' };
  }
  if (endHour - startHour > rules.maxHoursPerBooking) {
    return {
      ok: false,
      code: 'too_long',
      message: `Máximo ${rules.maxHoursPerBooking} horas por apartado.`,
    };
  }
  const st = dayStatus(spaceId, dateStr);
  if (!st.open) {
    if (st.reason === 'sunday') {
      return { ok: false, code: 'sunday', message: 'Los domingos el espacio es de uso libre, por orden de llegada.' };
    }
    if (st.reason === 'holiday') {
      return {
        ok: false,
        code: 'holiday',
        message: `Día festivo (${st.holiday.nameEs || st.holiday.name}): uso libre, por orden de llegada.`,
      };
    }
    return { ok: false, code: 'closed', message: 'El espacio no tiene horario disponible ese día.' };
  }
  for (let h = startHour; h < endHour; h++) {
    if (!st.hours.some((x) => x.hour === h)) {
      return { ok: false, code: 'outside_hours', message: `La hora ${h}:00 está fuera del horario permitido.` };
    }
  }
  return { ok: true };
}
