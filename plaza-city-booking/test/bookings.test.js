import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { useTestDb, getDb } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { createBooking, cancelBooking, checkIn, runMaintenance, dayView, activityLog, BookingError } from '../src/bookings.js';
import { createInvite, consumeInvite, findInviteByToken, revokeInvite } from '../src/invites.js';

function addUser(email) {
  return getDb().prepare("INSERT INTO users (email, name, company, password_hash) VALUES (?, ?, 'Acme', ?)").run(email, email.split('@')[0], hashPassword('x'.repeat(8))).lastInsertRowid;
}
// Próximo lunes (en Chicago) a partir de mañana, para tener horario abierto y sin festivo.
function nextOpenWeekday() {
  let d = DateTime.now().setZone('America/Chicago').plus({ days: 1 }).startOf('day');
  while (d.weekday > 5 || ['2026-11-26', '2026-12-25', '2027-01-01'].includes(d.toISODate())) d = d.plus({ days: 1 });
  return d.toISODate();
}

let u1, u2, date;
beforeEach(() => { useTestDb(); u1 = addUser('ana@x.com'); u2 = addUser('beto@x.com'); date = nextOpenWeekday(); });

test('crea apartado y registra bitácora', () => {
  const b = createBooking({ userId: u1, spaceId: 'conference', date, startHour: 9, endHour: 11 });
  assert.equal(b.status, 'active');
  assert.equal(b.checked_in_at, null);
  const view = dayView('conference', date, u1);
  assert.equal(view.hours.find((h) => h.hour === 9).booking.mine, true);
  assert.equal(view.hours.find((h) => h.hour === 10).booking.id, b.id);
  assert.equal(view.hours.find((h) => h.hour === 11).booking, null);
  assert.equal(activityLog()[0].type, 'booked');
});

test('previene doble reserva (traslape parcial)', () => {
  createBooking({ userId: u1, spaceId: 'conference', date, startHour: 9, endHour: 11 });
  assert.throws(() => createBooking({ userId: u2, spaceId: 'conference', date, startHour: 10, endHour: 12 }), (e) => e instanceof BookingError && e.code === 'conflict' && e.status === 409);
  // La transacción hizo rollback: no quedó ningún slot de u2
  assert.equal(getDb().prepare('SELECT COUNT(*) c FROM bookings').get().c, 1);
  // Otro espacio a la misma hora sí se puede
  const other = createBooking({ userId: u2, spaceId: 'atrium', date, startHour: 17, endHour: 18 });
  assert.equal(other.status, 'active');
});

test('rechaza domingo, festivo, fuera de horario y demasiado lejos', () => {
  let sunday = DateTime.fromISO(date, { zone: 'America/Chicago' });
  while (sunday.weekday !== 7) sunday = sunday.plus({ days: 1 });
  assert.throws(() => createBooking({ userId: u1, spaceId: 'atrium', date: sunday.toISODate(), startHour: 9, endHour: 10 }), /orden de llegada/);
  assert.throws(() => createBooking({ userId: u1, spaceId: 'conference', date, startHour: 6, endHour: 7 }), (e) => e.code === 'outside_hours');
  assert.throws(() => createBooking({ userId: u1, spaceId: 'conference', date, startHour: 8, endHour: 13 }), (e) => e.code === 'too_long');
  const far = DateTime.now().setZone('America/Chicago').plus({ days: 60 });
  assert.throws(() => createBooking({ userId: u1, spaceId: 'conference', date: far.toISODate(), startHour: 9, endHour: 10 }), (e) => ['too_far', 'sunday', 'holiday'].includes(e.code));
  assert.throws(() => createBooking({ userId: u1, spaceId: 'conference', date: '2020-01-06', startHour: 9, endHour: 10 }), (e) => e.code === 'past');
});

test('cuota diaria por usuario y espacio', () => {
  createBooking({ userId: u1, spaceId: 'conference', date, startHour: 8, endHour: 11 });
  assert.throws(() => createBooking({ userId: u1, spaceId: 'conference', date, startHour: 13, endHour: 15 }), (e) => e.code === 'quota');
  assert.equal(createBooking({ userId: u1, spaceId: 'conference', date, startHour: 13, endHour: 14 }).status, 'active');
});

test('solo el dueño del apartado puede cancelar; cancelar libera las horas', () => {
  const b = createBooking({ userId: u1, spaceId: 'lounge', date, startHour: 18, endHour: 20 });
  assert.throws(() => cancelBooking({ userId: u2, bookingId: b.id }), (e) => e.code === 'forbidden' && e.status === 403);
  const c = cancelBooking({ userId: u1, bookingId: b.id });
  assert.equal(c.status, 'cancelled');
  assert.equal(getDb().prepare('SELECT COUNT(*) c FROM booking_slots').get().c, 0);
  assert.equal(createBooking({ userId: u2, spaceId: 'lounge', date, startHour: 18, endHour: 19 }).status, 'active');
  assert.throws(() => cancelBooking({ userId: u1, bookingId: b.id }), (e) => e.code === 'not_active');
});

test('check-in fuera de ventana se rechaza; no-show se libera automáticamente', () => {
  const b = createBooking({ userId: u1, spaceId: 'conference', date, startHour: 9, endHour: 10 });
  assert.throws(() => checkIn({ userId: u1, bookingId: b.id }), (e) => e.code === 'too_early');
  // Simulamos que el apartado empezó hace 20 minutos sin check-in.
  const start = new Date(Date.now() - 20 * 60_000).toISOString();
  const end = new Date(Date.now() + 40 * 60_000).toISOString();
  getDb().prepare('UPDATE bookings SET start_at = ?, end_at = ? WHERE id = ?').run(start, end, b.id);
  const r = runMaintenance();
  assert.equal(r.released, 1);
  const row = getDb().prepare('SELECT status, released_reason FROM bookings WHERE id = ?').get(b.id);
  assert.equal(row.status, 'released');
  assert.equal(row.released_reason, 'no_show');
  assert.equal(getDb().prepare('SELECT COUNT(*) c FROM booking_slots').get().c, 0);
  assert.equal(activityLog()[0].type, 'released');
});

test('con check-in a tiempo no se libera', () => {
  const b = createBooking({ userId: u1, spaceId: 'conference', date, startHour: 9, endHour: 10 });
  const start = new Date(Date.now() - 5 * 60_000).toISOString();
  const end = new Date(Date.now() + 55 * 60_000).toISOString();
  getDb().prepare('UPDATE bookings SET start_at = ?, end_at = ? WHERE id = ?').run(start, end, b.id);
  assert.ok(checkIn({ userId: u1, bookingId: b.id }).checked_in_at);
  getDb().prepare('UPDATE bookings SET start_at = ? WHERE id = ?').run(new Date(Date.now() - 30 * 60_000).toISOString(), b.id);
  assert.equal(runMaintenance().released, 0);
});

test('invitaciones: usos, expiración y revocación', () => {
  const inv = createInvite({ label: 'Suite 1', maxUses: 1, days: 7 });
  assert.equal(inv.status, 'active');
  assert.ok(inv.url.includes('/registro?invite='));
  assert.equal(consumeInvite(inv.id), true);
  assert.equal(findInviteByToken(inv.token).status, 'used');
  assert.equal(consumeInvite(inv.id), false);
  const inv2 = createInvite({ maxUses: 5 });
  assert.equal(revokeInvite(inv2.id), true);
  assert.equal(findInviteByToken(inv2.token).status, 'revoked');
  assert.equal(consumeInvite(inv2.id), false);
});
