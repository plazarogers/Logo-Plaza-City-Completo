import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStatus, validateRange, isHourAllowed } from '../src/schedule.js';

const rules = { maxHoursPerBooking: 4 };

test('Conference Room: L-V 8-17 regular + 17-21 especial', () => {
  const st = dayStatus('conference', '2026-10-05'); // lunes
  assert.equal(st.open, true);
  assert.deepEqual(st.hours.map((h) => h.hour), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(st.hours.find((h) => h.hour === 16).kind, 'regular');
  assert.equal(st.hours.find((h) => h.hour === 17).kind, 'special');
  assert.equal(isHourAllowed('conference', '2026-10-05', 21), false);
  assert.equal(isHourAllowed('conference', '2026-10-05', 7), false);
});

test('Conference Room cerrado el sábado', () => {
  assert.equal(dayStatus('conference', '2026-10-10').open, false);
  assert.equal(dayStatus('conference', '2026-10-10').reason, 'closed');
});

test('Atrium y Lounge: L-V 17-21, sábado 8-13', () => {
  for (const id of ['atrium', 'lounge']) {
    assert.deepEqual(dayStatus(id, '2026-10-07').hours.map((h) => h.hour), [17, 18, 19, 20]);
    assert.deepEqual(dayStatus(id, '2026-10-10').hours.map((h) => h.hour), [8, 9, 10, 11, 12]);
    assert.equal(isHourAllowed(id, '2026-10-07', 9), false);
  }
});

test('Domingo y festivos: uso libre, no se aparta', () => {
  const sun = dayStatus('atrium', '2026-10-11');
  assert.equal(sun.open, false); assert.equal(sun.reason, 'sunday'); assert.equal(sun.freeUse, true);
  const thanks = dayStatus('conference', '2026-11-26');
  assert.equal(thanks.open, false); assert.equal(thanks.reason, 'holiday'); assert.equal(thanks.holiday.name, 'Thanksgiving Day');
  assert.equal(validateRange('conference', '2026-11-26', 9, 10, rules).code, 'holiday');
  assert.equal(validateRange('conference', '2026-10-11', 9, 10, rules).code, 'sunday');
});

test('validateRange: rangos, duración y horario', () => {
  assert.equal(validateRange('conference', '2026-10-05', 8, 12, rules).ok, true);
  assert.equal(validateRange('conference', '2026-10-05', 8, 13, rules).code, 'too_long');
  assert.equal(validateRange('conference', '2026-10-05', 19, 22, rules).code, 'outside_hours');
  assert.equal(validateRange('conference', '2026-10-05', 10, 10, rules).code, 'bad_range');
  assert.equal(validateRange('atrium', '2026-10-05', 16, 18, rules).code, 'outside_hours');
  assert.equal(validateRange('lounge', '2026-10-10', 12, 13, rules).ok, true);
});
