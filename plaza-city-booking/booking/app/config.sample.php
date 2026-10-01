<?php
// Copia de referencia. El instalador (install.php) genera app/config.php
// automáticamente con llaves y secretos nuevos. No subas config.php a git.
return [
    // URL pública de la carpeta, sin diagonal final.
    'base_url' => 'https://plazacity.net/booking',

    // Ruta del archivo SQLite. Si tu hosting lo permite, ponlo FUERA de
    // public_html, p. ej. '/home/usuario/plaza-booking-data/db.sqlite'.
    'db_path' => __DIR__ . '/data/pcb-CAMBIA-ESTE-NOMBRE.sqlite',

    // Hash (password_hash) de la llave del dueño para el panel de administración.
    'owner_key_hash' => '',

    // Token para ejecutar cron.php por URL (servicios de cron externos).
    'cron_token' => '',

    // Web Push (VAPID). El instalador las genera.
    'vapid' => [
        'public_key' => '',
        'private_key_pem' => '',
        'subject' => 'mailto:admin@plazacity.net',
    ],

    // Reglas (opcional: si no las pones se usan estos valores)
    'rules' => [
        'booking_window_days' => 30,
        'max_hours_per_booking' => 4,
        'max_hours_per_user_per_day' => 4,
        'max_active_bookings_per_user' => 10,
        'checkin_opens_minutes_before' => 15,
        'checkin_grace_minutes' => 15,
        'reminder_minutes_before' => 15,
        'cancel_lock_in_minutes' => 0,
        'invite_default_days' => 7,
        'session_days' => 30,
    ],
];
