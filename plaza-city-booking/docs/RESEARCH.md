# Investigación y decisiones

## 1. Identidad corporativa de Plaza City

La paleta y el logo vienen del logo oficial de Plaza City que entregó el dueño:

| Color | Hex | Uso en la app |
|---|---|---|
| Azul marino | `#071B55` | Barra superior, pestaña y día seleccionados, fondo del ícono |
| Azul | `#20599A` | Enlaces, estado activo, horas "tuyas", medidores de ocupación |
| Verde | `#8DC22E` | Botón principal con texto azul marino, línea de la barra, horas libres |

El verde solo llega a 2.1:1 sobre blanco, así que nunca se usa como texto sobre
blanco. Para el texto "Libre" se usa un verde oscuro derivado (`#3F6A0C`, 5.8:1).
Todos los colores de texto cumplen 4.5:1 y los indicadores gráficos 3:1, en modo
claro y oscuro. Los tokens están en `booking/css/theme.css`.

- **Logo:** `booking/icons/plaza-city-logo.png`, recortado en círculo con fondo transparente. Aparece en la barra superior y en las pantallas de entrada.
- **Ícono de la app:** propuesta C3, una hoja de calendario con encabezado verde y las dos torres del logo redibujadas como vector. `booking/icons/logo.svg` sirve para la pestaña y la computadora; los PNG de 180, 192 y 512 px sirven para iPhone y Android, y `badge-72.png` es la silueta para notificaciones.
- **Tipografía:** Montserrat para títulos, cercana al logotipo, e Inter para texto.

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
