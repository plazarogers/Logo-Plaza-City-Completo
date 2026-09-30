// Lógica de apartados: creación, cancelación, check-in, liberación automática
// y bitácora. Toda regla vive aquí (el frontend solo la refleja).
import { getDb } from './db.js';
import { config } from './config.js';
import { now, slotStart, isValidDateStr, formatHour, toLocal } from './time.js';
import { getSpace, validateRange, dayStatus, SPACES } from './schedule.js';
import { broadcast, sendToUser } from './push.js';

export class BookingError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const R = () => config.rules;

function log(type, fields) {
  getDb()
    .prepare(
      `INSERT INTO activity (type, booking_id, user_id, space_id, date, start_hour, end_hour, detail)
       VALUES (@type, @booking_id, @user_id, @space_id, @date, @start_hour, @end_hour, @detail)`,
    )
    .run({
      type,
      booking_id: fields.booking_id ?? null,
      user_id: fields.user_id ?? null,
      space_id: fields.space_id ?? null,
      date: fields.date ?? null,
      start_hour: fields.start_hour ?? null,
      end_hour: fields.end_hour ?? null,
      detail: fields.detail ?? '',
    });
}

function spaceLabel(spaceId) {
  const s = getSpace(spaceId);
  return s ? s.name : spaceId;
}

function describe(b) {
  return `${spaceLabel(b.space_id)} · ${b.date} ${formatHour(b.start_hour)}–${formatHour(b.end_hour)}`;
}

/** Ventana de check-in de un apartado: [opens, closes] en ms epoch. */
export function checkinWindow(b) {
  const start = Date.parse(b.start_at);
  return {
    opens: start - R().checkinOpensMinutesBefore * 60_000,
    closes: start + R().checkinGraceMinutes * 60_000,
  };
}

export function getBooking(id) {
  return getDb()
    .prepare(
      `SELECT b.*, u.name AS user_name, u.company AS user_company, u.suite AS user_suite
       FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.id = ?`,
    )
    .get(id);
}

/**
 * Crea un apartado. Reglas:
 *  - fecha válida, dentro de la ventana de anticipación
 *  - dentro del horario del espacio, nunca domingo ni festivo
 *  - no en el pasado (la hora en curso sí, para uso inmediato)
 *  - máximo de horas por apartado y cuota diaria por usuario
 *  - sin traslape con otro apartado activo (UNIQUE en booking_slots)
 */
export function createBooking({ userId, spaceId, date, startHour, endHour, note = '' }) {
  const rules = R();
  const space = getSpace(spaceId);
  if (!space) throw new BookingError('unknown_space', 'Espacio desconocido.');
  if (!isValidDateStr(date)) throw new BookingError('bad_date', 'Fecha inválida.');

  const v = validateRange(spaceId, date, startHour, endHour, rules);
  if (!v.ok) throw new BookingError(v.code, v.message);

  const nowDt = now();
  const startDt = slotStart(date, startHour);
  const endDt = slotStart(date, endHour);
  if (endDt <= nowDt) throw new BookingError('past', 'Esa hora ya pasó.');
  if (startDt < nowDt.startOf('hour')) {
    throw new BookingError('past', 'No se puede apartar una hora que ya comenzó, salvo la hora en curso.');
  }
  const maxDay = nowDt.startOf('day').plus({ days: rules.bookingWindowDays });
  if (startDt > maxDay.endOf('day')) {
    throw new BookingError('too_far', `Solo se puede apartar con hasta ${rules.bookingWindowDays} días de anticipación.`);
  }

  const db = getDb();
  const tx = db.transaction(() => {
    const used = db
      .prepare(
        `SELECT COALESCE(SUM(end_hour - start_hour), 0) AS h FROM bookings
         WHERE user_id = ? AND space_id = ? AND date = ? AND status IN ('active','completed')`,
      )
      .get(userId, spaceId, date).h;
    if (used + (endHour - startHour) > rules.maxHoursPerUserPerDay) {
      throw new BookingError(
        'quota',
        `Máximo ${rules.maxHoursPerUserPerDay} horas por día en ${space.name} por usuario (ya tienes ${used}).`,
      );
    }

    // Si el apartado se crea ya dentro de la ventana de check-in, cuenta como
    // check-in inmediato (uso inmediato / walk-up, como en Robin y Envoy).
    const startMs = startDt.toMillis();
    const nowMs = nowDt.toMillis();
    const autoCheckin = nowMs >= startMs - rules.checkinOpensMinutesBefore * 60_000;

    const info = db
      .prepare(
        `INSERT INTO bookings (space_id, user_id, date, start_hour, end_hour, start_at, end_at, note, checked_in_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        spaceId,
        userId,
        date,
        startHour,
        endHour,
        startDt.toUTC().toISO(),
        endDt.toUTC().toISO(),
        String(note).slice(0, 200),
        autoCheckin ? new Date().toISOString() : null,
      );
    const id = info.lastInsertRowid;
    const ins = db.prepare('INSERT INTO booking_slots (booking_id, space_id, slot_start) VALUES (?, ?, ?)');
    for (let h = startHour; h < endHour; h++) {
      try {
        ins.run(id, spaceId, slotStart(date, h).toUTC().toISO());
      } catch (err) {
        if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
          throw new BookingError('conflict', `La hora ${formatHour(h)} ya está apartada por alguien más.`, 409);
        }
        throw err;
      }
    }
    log('booked', { booking_id: id, user_id: userId, space_id: spaceId, date, start_hour: startHour, end_hour: endHour });
    return id;
  });

  const id = tx();
  const booking = getBooking(id);
  notifyOthers(booking, 'booked');
  return booking;
}

function releaseSlots(bookingId) {
  getDb().prepare('DELETE FROM booking_slots WHERE booking_id = ?').run(bookingId);
}

export function cancelBooking({ userId, bookingId }) {
  const b = getBooking(bookingId);
  if (!b) throw new BookingError('not_found', 'Apartado no encontrado.', 404);
  if (b.user_id !== userId) throw new BookingError('forbidden', 'Solo quien apartó el espacio puede cancelarlo.', 403);
  if (b.status !== 'active') throw new BookingError('not_active', 'Este apartado ya no está activo.');
  const nowMs = Date.now();
  const startMs = Date.parse(b.start_at);
  const endMs = Date.parse(b.end_at);
  const lockIn = startMs - R().cancelLockInMinutes * 60_000;

  const db = getDb();
  if (nowMs < lockIn) {
    // Cancelación normal (antes del inicio).
    db.transaction(() => {
      db.prepare(`UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?`).run(new Date().toISOString(), b.id);
      releaseSlots(b.id);
      log('cancelled', b);
    })();
    const updated = getBooking(b.id);
    notifyOthers(updated, 'cancelled');
    return updated;
  }
  if (nowMs < endMs) {
    // Ya empezó: "terminar antes" libera el resto de las horas.
    return endEarly({ userId, bookingId, b });
  }
  throw new BookingError('already_ended', 'Este apartado ya terminó.');
}

/** Terminar antes de tiempo: libera las horas restantes para los demás. */
export function endEarly({ userId, bookingId, b = null }) {
  b = b || getBooking(bookingId);
  if (!b) throw new BookingError('not_found', 'Apartado no encontrado.', 404);
  if (b.user_id !== userId) throw new BookingError('forbidden', 'Solo quien apartó el espacio puede liberarlo.', 403);
  if (b.status !== 'active') throw new BookingError('not_active', 'Este apartado ya no está activo.');
  const nowLocal = now();
  const db = getDb();
  db.transaction(() => {
    db.prepare(`UPDATE bookings SET status='released', released_reason='ended_early', updated_at=? WHERE id=?`).run(
      new Date().toISOString(),
      b.id,
    );
    // Solo se liberan las horas que aún no comienzan; la hora en curso se conserva.
    db.prepare('DELETE FROM booking_slots WHERE booking_id = ? AND slot_start > ?').run(b.id, nowLocal.toUTC().toISO());
    log('ended_early', b);
  })();
  const updated = getBooking(b.id);
  notifyOthers(updated, 'released');
  return updated;
}

export function checkIn({ userId, bookingId }) {
  const b = getBooking(bookingId);
  if (!b) throw new BookingError('not_found', 'Apartado no encontrado.', 404);
  if (b.user_id !== userId) throw new BookingError('forbidden', 'Solo quien apartó puede hacer check-in.', 403);
  if (b.status !== 'active') throw new BookingError('not_active', 'Este apartado ya no está activo.');
  if (b.checked_in_at) return b;
  const { opens, closes } = checkinWindow(b);
  const nowMs = Date.now();
  if (nowMs < opens) {
    throw new BookingError(
      'too_early',
      `El check-in se abre ${R().checkinOpensMinutesBefore} minutos antes del inicio.`,
    );
  }
  if (nowMs > closes) throw new BookingError('too_late', 'La ventana de check-in ya cerró.');
  getDb()
    .prepare('UPDATE bookings SET checked_in_at = ?, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), new Date().toISOString(), b.id);
  log('checked_in', b);
  return getBooking(b.id);
}

/**
 * Tarea periódica (cada minuto):
 *  1. Libera apartados activos sin check-in cuya ventana ya cerró (no-show).
 *  2. Marca como completados los que ya terminaron.
 */
export function runMaintenance() {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const graceMs = R().checkinGraceMinutes * 60_000;
  const deadline = new Date(Date.now() - graceMs).toISOString();

  const noShows = db
    .prepare(
      `SELECT * FROM bookings WHERE status='active' AND checked_in_at IS NULL AND start_at <= ? AND end_at > ?`,
    )
    .all(deadline, nowIso);
  for (const b of noShows) {
    db.transaction(() => {
      db.prepare(`UPDATE bookings SET status='released', released_reason='no_show', updated_at=? WHERE id=?`).run(nowIso, b.id);
      releaseSlots(b.id);
      log('released', { ...b, detail: 'no_show' });
    })();
    const full = getBooking(b.id);
    notifyOthers(full, 'released');
    sendToUser(b.user_id, {
      title: 'Apartado liberado por falta de check-in',
      body: describe(b),
      url: '/mis-apartados',
      tag: `booking-${b.id}`,
    }).catch(() => {});
  }

  const done = db
    .prepare(`UPDATE bookings SET status='completed', updated_at=? WHERE status='active' AND end_at <= ?`)
    .run(nowIso, nowIso);
  return { released: noShows.length, completed: done.changes };
}

function notifyOthers(b, kind) {
  const who = b.user_company ? `${b.user_name} (${b.user_company})` : b.user_name;
  const titles = {
    booked: `${spaceLabel(b.space_id)} apartado`,
    cancelled: `${spaceLabel(b.space_id)} disponible de nuevo`,
    released: `${spaceLabel(b.space_id)} liberado`,
  };
  const when = `${toLocal(b.start_at).setLocale('es').toFormat("EEE d 'de' MMM")} · ${formatHour(b.start_hour)}–${formatHour(b.end_hour)}`;
  broadcast(
    {
      title: titles[kind],
      body: `${when} · ${who}`,
      url: `/calendario?space=${b.space_id}&date=${b.date}`,
      tag: `booking-${b.id}`,
    },
    { excludeUserId: b.user_id },
  ).catch((err) => console.warn('[push] broadcast:', err.message));
}

/** Apartados de un espacio en un día (activos y completados). */
export function bookingsForDay(spaceId, date) {
  return getDb()
    .prepare(
      `SELECT b.id, b.space_id, b.user_id, b.date, b.start_hour, b.end_hour, b.status, b.note, b.checked_in_at,
              b.start_at, b.end_at, u.name AS user_name, u.company AS user_company
       FROM bookings b JOIN users u ON u.id = b.user_id
       WHERE b.space_id = ? AND b.date = ? AND b.status IN ('active','completed','released')
       ORDER BY b.start_hour`,
    )
    .all(spaceId, date);
}

/** Vista de día para el calendario: horas con estado. */
export function dayView(spaceId, date, viewerId) {
  const status = dayStatus(spaceId, date);
  const rows = bookingsForDay(spaceId, date);
  const slots = getDb().prepare('SELECT booking_id, slot_start FROM booking_slots WHERE space_id = ?').all(spaceId);
  const occupied = new Map(slots.map((s) => [s.slot_start, s.booking_id]));
  const nowDt = now();
  const hours = (status.hours || []).map(({ hour, kind }) => {
    const st = slotStart(date, hour);
    const bookingId = occupied.get(st.toUTC().toISO());
    const b = bookingId ? rows.find((r) => r.id === bookingId) : null;
    return {
      hour,
      kind,
      past: st.plus({ hours: 1 }) <= nowDt || st < nowDt.startOf('hour'),
      booking: b
        ? {
            id: b.id,
            mine: b.user_id === viewerId,
            user_name: b.user_name,
            user_company: b.user_company,
            status: b.status,
            checked_in: !!b.checked_in_at,
            start_hour: b.start_hour,
            end_hour: b.end_hour,
            note: b.note,
          }
        : null,
    };
  });
  return { space: getSpace(spaceId), date, ...status, hours };
}

export function myBookings(userId) {
  return getDb()
    .prepare(
      `SELECT * FROM bookings WHERE user_id = ? AND (status = 'active' OR updated_at > ?)
       ORDER BY start_at DESC LIMIT 100`,
    )
    .all(userId, new Date(Date.now() - 30 * 86400_000).toISOString())
    .map((b) => ({ ...b, checkin: checkinWindow(b), space: getSpace(b.space_id) }));
}

export function activityLog({ limit = 100, before = null } = {}) {
  const db = getDb();
  const rows = before
    ? db
        .prepare(
          `SELECT a.*, u.name AS user_name, u.company AS user_company FROM activity a
           LEFT JOIN users u ON u.id = a.user_id WHERE a.id < ? ORDER BY a.id DESC LIMIT ?`,
        )
        .all(before, limit)
    : db
        .prepare(
          `SELECT a.*, u.name AS user_name, u.company AS user_company FROM activity a
           LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`,
        )
        .all(limit);
  return rows.map((r) => ({ ...r, space: r.space_id ? getSpace(r.space_id) : null, hours: r.end_hour != null ? r.end_hour - r.start_hour : null }));
}

export function upcomingOverview(days = 7) {
  const start = now().startOf('day');
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = start.plus({ days: i }).toISODate();
    out.push({
      date: d,
      spaces: SPACES.map((s) => {
        const st = dayStatus(s.id, d);
        const rows = bookingsForDay(s.id, d).filter((b) => b.status === 'active');
        return { id: s.id, open: st.open, reason: st.reason, holiday: st.holiday || null, total: st.hours?.length || 0, booked: rows.reduce((n, b) => n + (b.end_hour - b.start_hour), 0) };
      }),
    });
  }
  return out;
}

export { log as logActivity };
