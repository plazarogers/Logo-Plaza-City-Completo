# Investigación y decisiones

## 1. Identidad corporativa de plazacity.net

El entorno de desarrollo no pudo abrir `plazacity.net` (la red de la sesión lo
bloquea), así que los colores exactos del sitio no se extrajeron. Por búsqueda
pública se confirmó que Plaza City LLC es una constructora comercial con
oficinas en 1310 Rayford Park Rd, Spring, TX, y que el sitio está formado por
páginas `.html` (Home, General Contractor, Site Work, Gallery, Leasing Now,
Contacts).

La app usa una paleta corporativa sobria: azul marino `#14213d`, dorado
`#e5a100`, Montserrat para títulos e Inter para texto. **Para igualarla al
sitio** basta cambiar las variables de `booking/css/theme.css`, reemplazar
`booking/icons/logo.svg` (y los PNG) por el logo oficial y, si aplica, la fuente
en `booking/index.html`.

## 2. Por qué PHP + SQLite dentro de /booking

El sitio está hecho de páginas `.html`, lo típico de un hosting compartido con
cPanel. En ese tipo de hosting PHP siempre está disponible y Node.js casi
nunca. Por eso la versión anterior (Node.js) se reescribió en PHP sin
dependencias:

- Se instala subiendo una carpeta: sin terminal, sin Composer, sin base de datos que crear.
- SQLite cabe en un archivo y aguanta de sobra el tráfico de un edificio.
- Las rutas internas usan `#` (`/booking/#/calendario`), así que no depende de reglas de reescritura del servidor.
- Web Push está implementado con OpenSSL nativo (cifrado RFC 8291 y firma VAPID RFC 8292), verificado contra una implementación independiente.
- El mantenimiento corre por cron y, como respaldo, con cada visita.

## 3. Benchmark de apps de reservación

| Patrón | Skedda | Robin | Envoy | OfficeRnD | YAROOMS | En Plaza City |
|---|---|---|---|---|---|---|
| Vista por espacio y día | Grid día/semana | Mapa + lista | Lista | Calendario | Calendario | Pestañas por espacio, tira de 7 días, cuadrícula por hora con estado; resumen semanal en Inicio. |
| Reglas | Ventana, duración, cuotas, lock-in | Políticas | Límites | Capacidad | Por rol | Ventana 30 días, 4 h seguidas, cuota diaria, máximo activos, lock-in configurable. |
| Doble reserva | Sí | Sí | Sí | Sí | Sí | Restricción única en la base dentro de una transacción. |
| Check-in y liberación | Gracia 5–15 min | 10 min ("abandoned meeting") | ±5 min | Auto-cancel | QR/app | ±15 min, recordatorio push, liberación automática y aviso a todos. |
| Recordatorios | Correo | Slack/Teams/app | App | Correo | Teams | Push 15 min antes. |
| Agregar al calendario | Sí | Sí | Sí | Sí | Sí | Descarga `.ics` por apartado (Google, Outlook, Apple). |
| Bloqueos/cierres | Sí | Sí | Sí | Sí | Sí | Cierres por día y espacio; cancelación y aviso automáticos. |
| Altas y bajas | Admin | SSO | Admin | Admin | Admin | Links de invitación con usos, caducidad y fin de contrato; baja automática. |
| Analítica | Reportes | Analytics | Insights | Reportes | Reportes | Ocupación, no-shows, horas por empresa, CSV. |
| Transparencia | Calendario | — | — | — | — | Bitácora pública de actividad. |

Se descartaron a propósito, por complejidad frente a beneficio en un edificio
pequeño: apartados recurrentes (facilitan acaparar espacios), flujos de
aprobación (contradicen la operación sin administrador), pagos y SSO.

Fuentes: Robin Help Center ("Automatically canceling abandoned meetings",
"Abandoned meeting protection"), Skedda Support ("Check-in", "Booking
Conditions", "Booking Window", "Lock-in"), Envoy Help Center ("Booking,
checking into and releasing rooms", "Rooms Space Saver Features"), comparativas
públicas de YAROOMS y Skedda.
