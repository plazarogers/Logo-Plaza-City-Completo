# Plaza City · Reservación de áreas comunes (`plazacity.net/booking`)

Aplicación web para que los inquilinos de Plaza City aparten por hora el
**Conference Room**, el **Atrium** y el **Lounge (2º piso)**. Vive dentro del
sitio del edificio, en la carpeta `booking`, y funciona en celular, tablet y
laptop. Se puede instalar como app en la pantalla de inicio y envía
notificaciones push.

El sistema se administra solo: horarios, festivos, doble reserva, check-in,
liberación por no presentarse, recordatorios y bajas por fin de contrato son
automáticos. El dueño solo genera links de invitación y, si quiere, marca días
de cierre.

- **Instalación en SiteGround (hosting de plazacity.net), paso a paso: [`docs/SITEGROUND.md`](docs/SITEGROUND.md)**
- Investigación previa y benchmark (Skedda, Robin, Envoy, OfficeRnD, YAROOMS): [`docs/RESEARCH.md`](docs/RESEARCH.md)

## Contenido

| Carpeta | Qué es |
|---|---|
| `booking/` | **Lo que se sube al hosting**, tal cual, a `public_html/booking/`. |
| `tests/` | Pruebas automatizadas (`php tests/run.php`). No se suben. |
| `docs/` | Investigación y decisiones. |

## Requisitos del hosting

Cualquier hosting compartido con cPanel (GoDaddy, Bluehost, HostGator, Namecheap,
SiteGround, A2, Hostinger…) cumple:

- PHP 8.0 o superior (recomendado 8.2+) con `pdo_sqlite` y `openssl`. Vienen activos por defecto.
- Certificado SSL (https). Es gratis en cPanel con AutoSSL. **Sin https no hay notificaciones push ni modo app.**
- No necesita MySQL, Node, Composer ni ningún servicio externo. La base de datos es un archivo SQLite.

Si plazacity.net está hecho con un constructor cerrado (Wix, Squarespace,
GoDaddy Website Builder) no se pueden subir carpetas. En ese caso se contrata un
hosting PHP básico y se usa un subdominio, por ejemplo `booking.plazacity.net`,
con un enlace desde el sitio. La app funciona igual.

## Instalar en plazacity.net/booking (10 minutos)

> plazacity.net está en **SiteGround**: sigue [`docs/SITEGROUND.md`](docs/SITEGROUND.md), que tiene los menús exactos de Site Tools. Los pasos de abajo son la versión genérica para cPanel.

1. **Sube la carpeta.** En cPanel abre *File Manager* → `public_html`. Sube el
   archivo `booking.zip` y usa *Extract*. Debe quedar `public_html/booking/index.html`.
   (Para crear el zip: `zip -r booking.zip booking` dentro de esta carpeta, o
   descarga el repositorio desde GitHub y comprime la carpeta `booking`.)
2. **Versión de PHP.** cPanel → *Select PHP Version* (o *MultiPHP Manager*) → 8.2 o superior.
3. **SSL.** cPanel → *SSL/TLS Status* → *Run AutoSSL*. Verifica que `https://plazacity.net` abra con candado.
4. **Instalador.** Abre `https://plazacity.net/booking/install.php`. Revisa que
   todos los requisitos digan OK, escribe tu correo y una **llave de
   administración** (mínimo 12 caracteres, guárdala en un lugar seguro) y pulsa *Instalar*.
   El instalador genera solo las llaves de notificaciones (VAPID), el token del
   cron y la base de datos con un nombre aleatorio. Hazlo justo después de
   subir la carpeta: el primero que lo ejecuta fija la llave.
5. **Cron (recomendado).** cPanel → *Cron Jobs* → "Once Per Minute" con el comando que muestra el instalador:
   ```
   php /home/TU_USUARIO/public_html/booking/cron.php >/dev/null 2>&1
   ```
   Si tu plan no tiene cron, crea una tarea gratuita en cron-job.org que llame cada
   minuto a la URL `https://plazacity.net/booking/cron.php?token=…` que te dio el instalador.
   Sin cron la app también funciona: hace el mantenimiento cada vez que alguien
   la usa, pero los recordatorios y liberaciones llegan con menos puntualidad.
6. **Borra `install.php`** del servidor (ya no se puede volver a ejecutar, pero no hace falta dejarlo).
7. **Forzar https (opcional).** En `booking/.htaccess` descomenta el bloque "Forzar https".
8. **Enlace en el sitio.** Agrega un botón "Reservar áreas comunes" en plazacity.net que apunte a `https://plazacity.net/booking/`.

## Uso diario del dueño: `https://plazacity.net/booking/#/admin`

Se entra con la llave de administración. No requiere cuenta de inquilino.

- **Invitaciones.** Genera un link con etiqueta (p. ej. "Suite 204 – Acme"),
  número de personas que pueden usarlo, días de validez y, opcionalmente, **fin
  de contrato**. Cópialo o compártelo por WhatsApp/correo. Ves cuáles están
  activos, usados, expirados o revocados y quién se registró con cada uno.
  "Revocar" lo invalida al instante.
- **Inquilinos.** Lista con última visita, apartados, no-shows y dispositivos con
  push. Puedes desactivar (cierra sesiones y cancela sus apartados futuros),
  reactivar, cambiar fin de acceso y generar un **link para nueva contraseña**
  (un solo uso, 24 h) si alguien la olvida.
- **Cierres.** Marca un día como cerrado (mantenimiento, evento) o de uso libre,
  para un espacio o todo el edificio. Los apartados afectados se cancelan solos
  y cada afectado recibe una notificación.
- **Uso.** Ocupación por espacio, no-shows, cancelaciones y horas por empresa de
  los últimos 30 días, y descarga de todos los apartados en CSV para Excel.
  Al final, **Estado del sistema** comprueba https, notificaciones, que el cron
  esté corriendo y que la base de datos no se pueda descargar desde internet.

Cuando vence el fin de contrato de un inquilino, su cuenta se desactiva sola.

## Reglas

| Espacio | Lunes a viernes | Sábado |
|---|---|---|
| Conference Room | 8:00–17:00 + sesiones especiales 17:00–21:00 | — |
| Atrium | 17:00–21:00 | 8:00–13:00 |
| Lounge (2º piso) | 17:00–21:00 | 8:00–13:00 |

- Bloques de 1 hora, zona America/Chicago (incluye cambios de horario de verano).
- **Domingos y festivos federales de EE.UU.**: no se aparta; se muestra "Uso libre, por orden de llegada".
- Anticipación máxima 30 días; máximo 4 horas seguidas; 4 horas por espacio al día por persona; máximo 10 apartados activos por persona.
- Doble reserva imposible: la base de datos tiene una restricción única por espacio y hora.
- Check-in desde 15 min antes hasta 15 min después del inicio. Recordatorio push 15 min antes. Sin check-in, el espacio se libera solo y se avisa a todos. Apartar la hora en curso cuenta como check-in.
- Solo quien apartó puede cancelar; si ya empezó, "Liberar" devuelve las horas restantes.
- Bitácora pública: quién apartó qué, cuándo y cuánto tiempo; cancelaciones, liberaciones y cierres.
- **Pedir un espacio vacío:** si alguien hizo check-in pero el espacio está vacío, otro inquilino puede pedírselo desde el calendario. Solo se puede durante el apartado y después de los 15 minutos de check-in. Quien apartó recibe una notificación urgente con "Liberar" y "Lo estoy usando"; en iPhone, al tocarla se abre la app con esas opciones. Si no responde en 3 minutos, el resto del apartado se libera. Al liberarse, quien pidió tiene 5 minutos de prioridad para apartarlo. Solo hay una solicitud pendiente por apartado, cada persona puede pedir un apartado una sola vez, y todo queda en la bitácora. Los tiempos se ajustan en `rules` con `request_response_minutes` y `request_hold_minutes`.
- **Idioma:** la app abre en el idioma del teléfono o la computadora. El botón **ES | EN** de la barra superior lo cambia al instante en cualquier pantalla, incluido el panel de administración. Con sesión iniciada, la elección se guarda en la cuenta: se respeta en todos sus dispositivos y las notificaciones push llegan en ese idioma.

Los valores se cambian en `booking/app/config.php`, sección `rules` (ver
`config.sample.php`). Los horarios de los espacios están en `booking/app/lib/Schedule.php`.

## Notificaciones push

Se activan solas con el instalador: genera las llaves VAPID y las guarda en
`app/config.php`. No hay que contratar Firebase ni ningún servicio.

- Cada inquilino pulsa **Ajustes → Activar en este dispositivo** (o el aviso en Inicio) y puede enviarse una prueba.
- **iPhone/iPad (iOS 16.4+)**: primero Compartir → *Agregar a inicio*, abrir la app desde ese ícono y activar ahí.
- Se notifica a todos los demás cuando alguien aparta, cancela o libera (espacio, día, hora y quién), en el idioma de cada persona.
- Se notifica al interesado el recordatorio de check-in, la liberación por no-show y la cancelación por cierre del edificio.
- Solo se aceptan suscripciones de los servicios oficiales (Google, Mozilla, Apple, Microsoft).
- Si algún día cambias las llaves VAPID, cada inquilino debe volver a activar las notificaciones.

## Días festivos

Los festivos federales se **calculan automáticamente para cualquier año** en
`booking/app/lib/Holidays.php`, con la regla oficial (fecha fija con
observancia viernes/lunes, o "n-ésimo lunes/jueves del mes"). No hay nada que
actualizar cada año. Días extra del edificio (Nochebuena, por ejemplo) se
agregan desde **Administración → Cierres** como "uso libre".

## Seguridad

- Contraseñas con `password_hash` (bcrypt). Sesiones con token aleatorio en cookie `HttpOnly`, `SameSite=Lax` y `Secure` en https; en la base solo se guarda su hash.
- Protección CSRF: toda escritura exige un encabezado que un formulario de otro sitio no puede enviar.
- Límite de intentos para login, registro, restablecer contraseña y llave de administración.
- Links de invitación y de contraseña aleatorios, con caducidad y usos limitados.
- La base de datos tiene nombre aleatorio, permisos que solo dejan leerla a PHP y está bloqueada por `.htaccess`. El panel verifica con una descarga real que no sea accesible. Si tu hosting lo permite, también puedes moverla fuera de `public_html` y actualizar `db_path` en `app/config.php`.
- Todas las respuestas de la API llevan `Cache-Control: private, no-cache, no-store`, así que ninguna caché del hosting (como la Dynamic Cache de SiteGround) puede mostrar datos de un inquilino a otro.
- Política de seguridad de contenido (CSP) en el HTML y en `.htaccess`, protección contra incrustación en otros sitios, y consultas SQL siempre parametrizadas.

## Actualizar la app

Sube los archivos nuevos encima de los anteriores **sin borrar** `booking/app/config.php`
ni `booking/app/data/`. La base de datos se actualiza sola.

## Respaldo

Toda la información está en el archivo `.sqlite` de `booking/app/data/`.
Descárgalo desde el File Manager (o inclúyelo en el respaldo de cPanel).

## Probar en local

```bash
cd plaza-city-booking
php booking/install.php --owner-key="una-llave-larga" --base-url="http://localhost:8000/booking" --email="tu@correo.com"
php -S localhost:8000          # abre http://localhost:8000/booking/
php tests/run.php              # pruebas automatizadas
```

`localhost` cuenta como sitio seguro, así que las notificaciones también se pueden probar ahí.
Para reinstalar en local borra `booking/app/config.php` y el `.sqlite` de `booking/app/data/`.

## Estructura

```
booking/
  index.html, css/, js/, icons/   interfaz (PWA)
  sw.js, manifest.json            notificaciones y modo app
  api.php                         API: api.php?r=<ruta>
  cron.php                        mantenimiento automático
  install.php                     instalador de un solo uso
  .htaccess                       protecciones Apache/LiteSpeed
  app/
    bootstrap.php, config.sample.php
    lib/  Config, Db, Time, Msg, Holidays, Schedule, Auth, Invites,
          Bookings, Owner, Push, WebPush
    data/ base de datos SQLite (generada)
```
