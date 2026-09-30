// Imprime los días festivos que el sistema aplicará para un año.
//   npm run holidays -- 2027
import { federalHolidays, extraHolidays } from '../holidays.js';
const year = Number(process.argv[2]) || new Date().getFullYear();
console.log(`Festivos federales EE.UU. ${year} (calculados automáticamente):`);
for (const h of federalHolidays(year)) console.log(`  ${h.date}  ${h.name}`);
const extra = extraHolidays().filter((h) => h.date.startsWith(String(year)));
if (extra.length) {
  console.log('Festivos extra del edificio (data/holidays.extra.json):');
  for (const h of extra) console.log(`  ${h.date}  ${h.name}`);
}
