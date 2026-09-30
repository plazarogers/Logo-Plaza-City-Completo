# Investigación previa

## 1. Identidad corporativa de plazacity.net

**Estado:** el entorno de desarrollo (contenedor con política de red restringida)
bloqueó el acceso directo a `plazacity.net`, a `web.archive.org` y a los PDF de
LoopNet. Lo verificable por búsqueda web:

- Plaza City LLC es una constructora comercial (general contractor / site work)
  con oficinas en 1310 Rayford Park Rd, Suite 111, Spring, TX 77386, y renta de
  espacios de oficina ("LEASING - NOW"), incluido Ponderosa Office Park,
  32507 Tamina Rd, Magnolia, TX. Menú del sitio: Home, General Contractor,
  Site Work, Gallery, Leasing Now, Contacts.
- Tono: corporativo, sobrio, orientado a construcción comercial.

Con base en eso la app usa una paleta corporativa de construcción/inmobiliaria:
azul marino profundo (`#14213d`) como primario, dorado/ámbar (`#e5a100`) como
acento, neutros fríos, tipografía Montserrat (títulos) + Inter (texto), y un
logotipo geométrico de tres torres con base dorada.

**Cómo alinear la app con el sitio real (5 minutos):** todos los colores y
fuentes están centralizados en `public/css/theme.css` como variables CSS
(`--pc-navy`, `--pc-gold`, `--pc-font-head`, …). Sustituye los hex por los del
sitio, reemplaza `public/icons/logo.svg` por el logo oficial y cambia el
`<link>` de Google Fonts en `public/index.html` si el sitio usa otra familia.

## 2. Benchmark de apps de reservación

| Patrón | Skedda | Robin | Envoy | OfficeRnD | YAROOMS | Lo que adoptamos |
|---|---|---|---|---|---|---|
| Vista por espacio y por día | Grid día/semana por espacio | Mapa + lista | Lista de salas | Calendario por recurso | Calendario por sala | Pestañas por espacio + tira de 7 días + cuadrícula de horas del día, con estado de cada hora (libre/ocupado/tuyo/pasado/sesión especial). |
| Reglas de reservación ("booking conditions") | Ventana de anticipación, duración máx., cuotas por usuario, lock-in de cancelación | Políticas de aprobación y límites | Límite por usuario | Reglas por capacidad | Reglas por rol | Ventana de 30 días, máximo 4 h contiguas, cuota de 4 h por espacio/día por usuario, cancelación libre hasta el inicio (lock-in configurable), todo validado en servidor. |
| Prevención de doble reserva | Sí (server) | Sí | Sí | Sí | Sí | Restricción `UNIQUE(space_id, slot_start)` en SQLite dentro de una transacción: es imposible insertar dos reservas sobre la misma hora aunque lleguen al mismo tiempo. |
| Check-in y liberación automática | Ventana de gracia 5-15 min, cancela si no hay check-in y avisa por correo | "Abandoned meeting protection": 10 min por defecto, libera y avisa al organizador | Check-in desde 5 min antes hasta 5 min después; libera si no hay check-in | Auto-cancel de no-shows | Check-in por QR/app | Check-in desde 15 min antes hasta 15 min después (ambos configurables). Un cron interno cada minuto libera los no-show, registra en bitácora y notifica al dueño de la reserva y a los demás. Apartar dentro de la ventana cuenta como check-in inmediato (walk-up). "Terminar antes" libera las horas restantes. |
| Notificaciones | Email/push | Email, Slack, Teams | Push app, Slack | Email | Email/Teams | Web Push (VAPID) a todos los demás inquilinos al apartar, cancelar o liberar; sin dependencias de terceros. |
| Transparencia | Calendario visible | Calendario visible | — | — | — | Bitácora pública (quién, qué espacio, cuándo, cuánto tiempo). |

Fuentes consultadas: Robin Help Center ("Automatically canceling abandoned
meetings", "Abandoned meeting protection"), Skedda Support ("Check-in",
"Booking Conditions", "Booking Window", "Lock-in: Cancellation/End-early
Policy"), Envoy Help Center ("Booking, checking into and releasing rooms",
"Rooms Space Saver Features"), y comparativas públicas de YAROOMS y Skedda.
