# Plaza City · Reservación de áreas comunes

Aplicación web (PWA, mobile-first) para que los inquilinos del edificio de
oficinas Plaza City aparten las áreas comunes por hora: **Conference Room**,
**Atrium** y **Lounge (2º piso)**. Funciona en celular, tablet y laptop, se
puede instalar como app y envía notificaciones push.

Todo el sistema opera solo: los horarios, los festivos, la doble reserva, el
check-in y la liberación por no presentarse se validan automáticamente. No hay
panel de administración diario; el dueño del edificio únicamente genera links
de invitación.

- Investigación previa (identidad visual y benchmark de Skedda, Robin, Envoy,
  OfficeRnD y YAROOMS): [`docs/RESEARCH.md`](docs/RESEARCH.md).

## Reglas implementadas

| Espacio | Lunes a viernes | Sábado |
|---|---|---|
| Conference Room | 8:00–17:00 + sesiones especiales 17:00–21:00 | cerrado |
| Atrium | 17:00–21:00 | 8:00–13:00 |
| Lounge (2º piso) | 17:00–21:00 | 8:00–13:00 |

- Bloques de 1 hora, zona horaria **America/Chicago** (el servidor puede estar en cualquier zona).
- **Domingos y días festivos federales de EE.UU.**: no se aparta; el calendario
  los muestra como "Uso libre, por orden de llegada".
- Anticipación máxima 30 días, máximo 4 horas contiguas por apartado y 4 horas
  por espacio al día por usuario (configurable por variables de entorno).
- Doble reserva imposible: restricción `UNIQUE(space_id, slot_start)` en la base de datos.
- Check-in desde 15 min antes hasta 15 min después del inicio. Sin check-in, el
  espacio se libera solo y se notifica. Apartar la hora en curso cuenta como
  check-in inmediato. Quien apartó puede "terminar antes" y liberar las horas restantes.
- Solo quien apartó puede cancelar.
- Bitácora pública de actividad: quién apartó qué, cuándo y por cuánto tiempo.
- Interfaz en español con opción de inglés (Ajustes).

## Stack y por qué

| Pieza | Elección | Motivo |
|---|---|---|
| Servidor | Node.js 22 + Express 5 | Un solo proceso, sin framework pesado; el scheduler de no-show corre dentro del mismo proceso. |
| Base de datos | SQLite (better-sqlite3), modo WAL | Un archivo en un volumen: cero servidores de BD que administrar, transacciones y restricciones únicas para evitar la doble reserva. Suficiente para cientos de inquilinos. |
| Frontend | HTML/CSS/JS nativo (módulos ES), PWA | Sin build step ni bundler: se edita y se despliega. Instalable en iOS/Android/escritorio. |
| Push | Web Push estándar (VAPID) con `web-push` | No requiere Firebase ni cuenta de terceros; funciona en Chrome, Edge, Firefox, Android y Safari/iOS 16.4+ (instalada en pantalla de inicio). |
| Fechas | Luxon | Manejo correcto de America/Chicago y cambios de horario. |
| Festivos | Cálculo algorítmico (`src/holidays.js`) | Las reglas federales son fijas: no depende de una API externa ni de actualizaciones manuales. |
| Despliegue | Docker / Fly.io / Render / VPS | Una imagen, un volumen, cuatro variables de entorno. |

## Correr en local

Requisitos: Node.js 20 o superior.

```bash
cd plaza-city-booking
npm install
cp .env.example .env
npm run vapid          # imprime VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: pégalas en .env
# edita .env: SESSION_SECRET (aleatorio) y OWNER_KEY (llave del dueño)
npm run dev            # http://localhost:3000
```

Primer usuario: genera un link de invitación (ver abajo), ábrelo en el navegador
y regístrate. Para probar en el celular dentro de tu red usa la IP de tu máquina
en `BASE_URL` (las push necesitan HTTPS o `localhost`; en local funcionan en `localhost`).

Pruebas automatizadas (festivos, horarios, doble reserva, check-in, no-show, invitaciones):

```bash
npm test
```

## Links de invitación (registro)

El registro solo es posible con un link de invitación. Cada link tiene etiqueta,
número de usos y fecha de expiración; caduca solo.

**Desde la web:** entra a `https://tu-dominio/invitaciones`, escribe la
`OWNER_KEY` configurada en el servidor y podrás:

- generar un link (etiqueta, usos, días de validez) y copiarlo;
- ver cuáles están activos, usados, expirados o revocados y quién se registró con cada uno;
- revocar un link activo con un clic.

La llave se guarda solo en la sesión del navegador ("Salir del modo dueño" la olvida).

**Desde la terminal del servidor** (sin `OWNER_KEY`):

```bash
npm run invite -- create --label "Suite 204 - Acme" --uses 1 --days 7
npm run invite -- list
npm run invite -- revoke 3
```

El link tiene la forma `BASE_URL/registro?invite=TOKEN`; envíalo por correo o WhatsApp al inquilino.

## Activar notificaciones push

1. Genera las llaves VAPID una sola vez:
   ```bash
   npm run vapid
   ```
2. Copia `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`
   (`mailto:` con un correo de contacto) a las variables de entorno del servidor.
   Si cambias las llaves, los usuarios deberán volver a activar las push.
3. Reinicia el servidor. En el arranque verás una advertencia si faltan llaves.
4. Cada inquilino activa las notificaciones en **Ajustes → Notificaciones push →
   Activar en este dispositivo** y puede enviarse una prueba.
   - Requiere HTTPS en producción (Fly, Render y Railway lo dan por defecto).
   - En iPhone/iPad (iOS 16.4+): primero agregar la app a la pantalla de inicio
     (Compartir → Agregar a inicio) y activar las push desde la app instalada.

Se envía una push a todos los demás usuarios registrados cuando alguien aparta,
cancela o libera un espacio (incluye espacio, día, hora y quién). Quien no hace
check-in recibe además un aviso de que su apartado se liberó.

## Calendario de días festivos

Los festivos federales de EE.UU. se **calculan automáticamente para cualquier
año** en `src/holidays.js` (regla legal: fecha fija con observancia
viernes/lunes, o "n-ésimo lunes/jueves del mes"). No hay nada que actualizar
cada año. Para verificar lo que aplicará el sistema:

```bash
npm run holidays -- 2027
```

Festivos adicionales del edificio (por ejemplo, cierre en Nochebuena): crea
`data/holidays.extra.json` (ver `data/holidays.extra.json.example`) y reinicia.
Esos días se tratan igual que un festivo: uso libre, sin apartados.

## Variables de entorno

Ver `.env.example`. Obligatorias en producción: `SESSION_SECRET`, `OWNER_KEY`,
`BASE_URL`. Para push: las tres `VAPID_*`. Las reglas (`BOOKING_WINDOW_DAYS`,
`MAX_HOURS_PER_BOOKING`, `MAX_HOURS_PER_USER_PER_DAY`,
`CHECKIN_OPENS_MINUTES_BEFORE`, `CHECKIN_GRACE_MINUTES`,
`CANCEL_LOCK_IN_MINUTES`, `INVITE_DEFAULT_DAYS`) son opcionales. Los horarios de
cada espacio están en `src/schedule.js`.

## Desplegar

Cualquier host que corra un contenedor con un volumen persistente sirve. El
proceso debe estar siempre encendido (no "sleep on idle") para que el
liberador de no-shows corra cada minuto.

### Docker (VPS propio)

```bash
cp .env.example .env   # llena SESSION_SECRET, OWNER_KEY, BASE_URL, VAPID_*
docker compose up -d --build
```

Pon un proxy con HTTPS delante (Caddy o Nginx). Con Caddy basta:
`reservas.plazacity.net { reverse_proxy localhost:3000 }`.

### Fly.io

```bash
fly launch --no-deploy            # usa el fly.toml incluido
fly volumes create plaza_data --size 1 --region dfw
fly secrets set SESSION_SECRET=... OWNER_KEY=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
fly deploy
```

### Render / Railway

Crea un "Web Service" desde este repo (Dockerfile detectado), agrega un disco
persistente montado en `/app/data`, define las variables de entorno y desactiva
el apagado por inactividad (plan que mantenga el proceso vivo).

### Respaldos

Toda la información vive en `data/plaza-city.db`. Copiar ese archivo (con
`sqlite3 data/plaza-city.db ".backup respaldo.db"`) es el respaldo completo.

## Estructura

```
src/
  server.js      arranque, estáticos, scheduler cada minuto
  config.js      variables de entorno y reglas
  schedule.js    espacios y horarios permitidos
  holidays.js    festivos federales (algorítmico) + extras
  bookings.js    crear/cancelar/check-in/liberar, no-show, bitácora
  invites.js     links de invitación
  auth.js        contraseñas (scrypt), sesiones, llave de dueño
  push.js        Web Push (VAPID)
  routes/api.js  API REST
  scripts/       vapid, invite, holidays (CLI)
public/
  index.html, css/theme.css (identidad), css/app.css, js/app.js, js/i18n.js, sw.js
test/            pruebas con node:test
```

## API (resumen)

`POST /api/register` · `POST /api/login` · `POST /api/logout` · `GET /api/me` ·
`GET /api/config` · `GET /api/calendar/:space?from=` · `GET /api/calendar/:space/:date` ·
`POST /api/bookings` · `GET /api/bookings/mine` · `POST /api/bookings/:id/cancel|checkin|release` ·
`GET /api/activity` · `GET /api/holidays/:year` · `POST /api/push/subscribe|unsubscribe|test` ·
`GET|POST /api/owner/invites` · `POST /api/owner/invites/:id/revoke` (header `x-owner-key`).
