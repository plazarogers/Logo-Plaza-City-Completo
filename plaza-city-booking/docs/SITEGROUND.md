# Instalar en SiteGround: `plazacity.net/booking`

Guía paso a paso con los menús de **Site Tools** de SiteGround. Tiempo estimado: 15 minutos.
Para entrar: siteground.com → Login → *Websites* → `plazacity.net` → **Site Tools**.

## 1. PHP 8.2 o superior

*Site Tools → Devs → PHP Manager*

- En **PHP Version** elige 8.2 o más reciente (la opción "Managed" de SiteGround sirve).
- En la pestaña **PHP Extensions** confirma que `pdo_sqlite` y `openssl` estén activas. Vienen activas por defecto; el instalador lo verifica de todas formas.

## 2. Certificado SSL y https obligatorio

*Site Tools → Security → SSL Manager*

- Si `plazacity.net` no aparece con certificado, elige **Let's Encrypt** y pulsa *Get*. Es gratis.

*Site Tools → Security → HTTPS Enforce*

- Actívalo. Así todo el sitio, incluida la app, abre siempre con `https://`.
- Sin https no funcionan las notificaciones push ni la instalación como app.

## 3. Subir la carpeta

*Site Tools → Site → File Manager*

1. Abre `public_html` (es la carpeta de plazacity.net).
2. Pulsa **Upload** (ícono de flecha hacia arriba) → *File Upload* → elige `booking.zip`.
3. Clic derecho sobre `booking.zip` → **Extract** → deja la ruta que propone y confirma.
   SiteGround crea sola la carpeta `booking`, con el nombre del zip. No la crees antes.
4. Comprueba que existe `public_html/booking/index.html`, directamente y no en `booking/booking`.
5. Con "Show hidden files" activo, comprueba que hay un `.htaccess` en `booking`, en `booking/app` y en `booking/app/data`. Borra `booking.zip`.

Si plazacity.net fuera WordPress, la carpeta funciona igual: WordPress no toca carpetas reales.

## 4. Instalador

Abre **https://plazacity.net/booking/install.php**

- Todos los requisitos deben decir **OK**.
- Escribe tu correo y crea tu **llave de administración** (mínimo 12 caracteres). Guárdala en tu gestor de contraseñas: con ella entras al panel.
- Pulsa *Instalar*. Hazlo en cuanto termines de subir la carpeta: el primero que lo ejecute fija la llave.
- La pantalla final muestra la **ruta exacta para el cron** y si la base de datos quedó protegida. Copia la ruta del cron.
- Después borra `public_html/booking/install.php` desde el File Manager.

## 5. Tarea automática (cron)

*Site Tools → Devs → Cron Jobs*

- **Command:** el que mostró el instalador. En SiteGround se ve así:
  ```
  php /home/customer/www/plazacity.net/public_html/booking/cron.php
  ```
- **Interval:** *Custom* → minuto `*/5` y el resto `*` (cada 5 minutos).
  SiteGround pide no abusar de tareas muy frecuentes; cada 5 minutos es un buen equilibrio.
  Además la app hace su mantenimiento cada vez que alguien la usa, así que los recordatorios y liberaciones llegan a tiempo durante el día.
- Pulsa *Create*. A los pocos minutos, el panel de administración (pestaña **Uso → Estado del sistema**) dirá "Tarea automática: OK".

## 6. Caché de SiteGround

*Site Tools → Speed → Caching*

- **Dynamic Cache:** puede quedarse encendida. La app envía `Cache-Control: private, no-cache, no-store` en todas sus respuestas, y SiteGround no cachea respuestas con esos encabezados. Ningún inquilino verá datos de otro.
- **NGINX Direct Delivery:** puede quedarse encendida. Entrega CSS, JS e imágenes directamente desde NGINX.
- Después de **actualizar** la app, pulsa **Flush Cache** en esa misma pantalla.

## 7. Revisar el estado del sistema

Abre **https://plazacity.net/booking/#/admin**, entra con tu llave y ve a la pestaña **Uso**. Al final está **Estado del sistema**. Debe decir OK en:

| Revisión | Si dice "Revisar" |
|---|---|
| Sitio con https | Repite el paso 2. Si instalaste antes de tener SSL, edita `public_html/booking/app/config.php` y cambia `base_url` a `https://plazacity.net/booking`. |
| Notificaciones push configuradas | Solo ocurre si la instalación quedó a medias. Antes de tener inquilinos, borra `app/config.php` y el `.sqlite` de `app/data/` y abre `install.php` de nuevo (súbelo otra vez si lo borraste). Esto borra los datos, así que no lo hagas con la app en uso. |
| Tarea automática (cron) | Revisa el paso 5. El comando debe usar la ruta que mostró el instalador. |
| Base de datos protegida | Ver la sección siguiente. |

### Si "Base de datos protegida" dice "Revisar"

La app hace una prueba real: intenta descargar su propia base de datos desde internet. La protegen tres capas: nombre aleatorio, permisos que solo deja leer a PHP y reglas de `.htaccess`. Si aun así queda expuesta, tienes dos soluciones:

- **Opción A (más simple):** en *Speed → Caching*, apaga **NGINX Direct Delivery** para plazacity.net. Así Apache aplica las reglas de `.htaccess` a todos los archivos.
- **Opción B:** saca la base de datos de la carpeta pública.
  1. En el File Manager sube un nivel desde `public_html` (a `www/plazacity.net/`) y crea la carpeta `booking-data`.
  2. Mueve ahí el archivo `pcb-….sqlite` de `public_html/booking/app/data/`.
  3. Edita `public_html/booking/app/config.php` y cambia `db_path` a `/home/customer/www/plazacity.net/booking-data/pcb-….sqlite` (con el nombre real).
  4. Verifica que tus respaldos incluyan esa carpeta; si no, descarga una copia del archivo de vez en cuando.

Vuelve a abrir **Estado del sistema**: debe decir OK.

## 8. Enlazar desde el sitio

Agrega en plazacity.net un botón o enlace "Reservar áreas comunes" hacia `https://plazacity.net/booking/`.

## Respaldos

*Site Tools → Security → Backups*: SiteGround hace copias diarias automáticas de `public_html`, que incluyen `booking/app/data/` con la base de datos. Para una copia manual, descarga el archivo `.sqlite` desde el File Manager.

## Actualizar la app

1. Sube el nuevo `booking.zip` a `public_html` y extráelo ahí, aceptando sobrescribir.
   El zip nunca trae `app/config.php` ni la base de datos, así que tus datos y llaves no se tocan.
   Comprueba que no se haya creado una carpeta duplicada, como `booking/booking` o `booking (1)`. Si pasa, no borres nada y pide ayuda.
2. Borra `install.php` otra vez.
3. *Speed → Caching → Flush Cache*.
