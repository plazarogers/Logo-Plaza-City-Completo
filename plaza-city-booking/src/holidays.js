// Días festivos federales de EE.UU. calculados algorítmicamente para cualquier año.
// No requiere red ni actualización manual: las reglas legales (5 U.S.C. § 6103)
// son fijas y se evalúan al vuelo cada vez que se consulta un año.
//
// Regla de "observancia": si el festivo de fecha fija cae en sábado se observa
// el viernes anterior; si cae en domingo, el lunes siguiente (regla OPM).
import { DateTime } from 'luxon';
import fs from 'node:fs';
import path from 'node:path';

const cache = new Map();

function nthWeekdayOfMonth(year, month, weekday, n) {
  // weekday: 1=lunes..7=domingo (luxon). n: 1..5
  let d = DateTime.utc(year, month, 1);
  const delta = (weekday - d.weekday + 7) % 7;
  d = d.plus({ days: delta + (n - 1) * 7 });
  return d;
}

function lastWeekdayOfMonth(year, month, weekday) {
  let d = DateTime.utc(year, month, 1).endOf('month').startOf('day');
  const delta = (d.weekday - weekday + 7) % 7;
  return d.minus({ days: delta });
}

function observed(year, month, day) {
  const d = DateTime.utc(year, month, day);
  if (d.weekday === 6) return d.minus({ days: 1 }); // sábado -> viernes
  if (d.weekday === 7) return d.plus({ days: 1 }); // domingo -> lunes
  return d;
}

/** Devuelve [{date:'YYYY-MM-DD', name, nameEs}] para un año. */
export function federalHolidays(year) {
  const list = [
    { date: observed(year, 1, 1), name: "New Year's Day", nameEs: 'Año Nuevo' },
    { date: nthWeekdayOfMonth(year, 1, 1, 3), name: 'Martin Luther King Jr. Day', nameEs: 'Día de Martin Luther King Jr.' },
    { date: nthWeekdayOfMonth(year, 2, 1, 3), name: "Washington's Birthday (Presidents' Day)", nameEs: 'Día de los Presidentes' },
    { date: lastWeekdayOfMonth(year, 5, 1), name: 'Memorial Day', nameEs: 'Memorial Day' },
    { date: observed(year, 7, 4), name: 'Independence Day', nameEs: 'Día de la Independencia' },
    { date: nthWeekdayOfMonth(year, 9, 1, 1), name: 'Labor Day', nameEs: 'Día del Trabajo' },
    { date: nthWeekdayOfMonth(year, 10, 1, 2), name: 'Columbus Day', nameEs: 'Día de Colón' },
    { date: observed(year, 11, 11), name: 'Veterans Day', nameEs: 'Día de los Veteranos' },
    { date: nthWeekdayOfMonth(year, 11, 4, 4), name: 'Thanksgiving Day', nameEs: 'Día de Acción de Gracias' },
    { date: observed(year, 12, 25), name: 'Christmas Day', nameEs: 'Navidad' },
  ];
  if (year >= 2021) {
    list.push({ date: observed(year, 6, 19), name: 'Juneteenth National Independence Day', nameEs: 'Juneteenth' });
  }
  // Año Nuevo del año siguiente puede observarse el 31 de diciembre de este año.
  const nextNY = observed(year + 1, 1, 1);
  if (nextNY.year === year) {
    list.push({ date: nextNY, name: "New Year's Day (observed)", nameEs: 'Año Nuevo (observado)' });
  }
  return list
    .map((h) => ({ ...h, date: h.date.toISODate() }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Festivos extra opcionales del edificio (p. ej. cierre por mantenimiento).
 * Archivo JSON: [{"date":"2026-12-24","name":"Christmas Eve","nameEs":"Nochebuena"}]
 */
export function extraHolidays(filePath = process.env.HOLIDAYS_EXTRA_FILE || 'data/holidays.extra.json') {
  try {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) return [];
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((h) => typeof h.date === 'string') : [];
  } catch {
    return [];
  }
}

/** Mapa date -> holiday para un año (federales + extra), con caché por año. */
export function holidayMap(year) {
  if (!cache.has(year)) {
    const m = new Map();
    for (const h of federalHolidays(year)) m.set(h.date, h);
    for (const h of extraHolidays()) if (h.date.startsWith(String(year))) m.set(h.date, { nameEs: h.name, ...h });
    cache.set(year, m);
  }
  return cache.get(year);
}

export function clearHolidayCache() {
  cache.clear();
}

export function holidayFor(dateStr) {
  return holidayMap(parseInt(dateStr.slice(0, 4), 10)).get(dateStr) || null;
}

export function isHoliday(dateStr) {
  return holidayFor(dateStr) !== null;
}
