import { test } from 'node:test';
import assert from 'node:assert/strict';
import { federalHolidays, isHoliday } from '../src/holidays.js';

test('festivos federales 2026 (4 de julio observado el viernes 3)', () => {
  const dates = federalHolidays(2026).map((h) => h.date);
  assert.deepEqual(dates, [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03',
    '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  ]);
});

test('festivos federales 2027 (Navidad sábado -> viernes 24, Año Nuevo 2028 sábado -> 31 dic 2027)', () => {
  const dates = federalHolidays(2027).map((h) => h.date);
  assert.ok(dates.includes('2027-12-24'), 'Christmas observed on Friday Dec 24');
  assert.ok(dates.includes('2027-12-31'), "New Year's Day 2028 observed on Dec 31, 2027");
  assert.ok(dates.includes('2027-11-25'), 'Thanksgiving 2027');
  assert.ok(dates.includes('2027-06-18'), 'Juneteenth 2027 (Saturday) observed Friday 18');
});

test('festivos 2028 se calculan sin intervención', () => {
  const h = federalHolidays(2028);
  assert.equal(h.find((x) => x.name.startsWith('Martin')).date, '2028-01-17');
  assert.equal(h.find((x) => x.name === 'Memorial Day').date, '2028-05-29');
  assert.equal(h.find((x) => x.name === 'Labor Day').date, '2028-09-04');
  assert.equal(h.find((x) => x.name === 'Thanksgiving Day').date, '2028-11-23');
});

test('isHoliday', () => {
  assert.equal(isHoliday('2026-11-26'), true);
  assert.equal(isHoliday('2026-11-27'), false);
});
