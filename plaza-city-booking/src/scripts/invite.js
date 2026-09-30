// CLI para el dueño: crear, listar y revocar links de invitación sin usar la web.
//   npm run invite -- create --label "Suite 204" --uses 1 --days 7
//   npm run invite -- list
//   npm run invite -- revoke <id>
import { getDb } from '../db.js';
import { createInvite, listInvites, revokeInvite } from '../invites.js';

getDb();
const [cmd = 'list', ...rest] = process.argv.slice(2);
const opt = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] !== undefined ? rest[i + 1] : def;
};

if (cmd === 'create') {
  const inv = createInvite({ label: opt('label', ''), maxUses: Number(opt('uses', 1)), days: Number(opt('days', 7)) });
  console.log('Link de invitación creado:');
  console.log(`  ${inv.url}`);
  console.log(`  etiqueta: ${inv.label || '-'} · usos: ${inv.max_uses} · expira: ${inv.expires_at}`);
} else if (cmd === 'revoke') {
  const id = Number(rest[0]);
  console.log(revokeInvite(id) ? `Invitación ${id} revocada.` : `No se encontró invitación activa con id ${id}.`);
} else {
  const rows = listInvites();
  if (!rows.length) console.log('No hay invitaciones.');
  for (const r of rows) {
    console.log(`#${r.id} [${r.status}] ${r.label || '-'} · usos ${r.uses}/${r.max_uses} · expira ${r.expires_at}`);
    console.log(`    ${r.url}`);
    for (const u of r.users) console.log(`    -> ${u.name} <${u.email}> ${u.company ? '(' + u.company + ')' : ''}`);
  }
}
