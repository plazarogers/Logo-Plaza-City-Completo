<?php
declare(strict_types=1);

final class Config
{
    private static ?array $cfg = null;

    public static function defaults(): array
    {
        return [
            'base_url' => '',
            'timezone' => 'America/Chicago',
            'db_path' => PCB_APP . '/data/pcb.sqlite',
            'owner_key_hash' => '',
            'cron_token' => '',
            'vapid' => ['public_key' => '', 'private_key_pem' => '', 'subject' => 'mailto:admin@plazacity.net'],
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
                'request_response_minutes' => 3,  // tiempo para responder una solicitud de espacio
                'request_hold_minutes' => 5,      // prioridad de quien pidió para apartar
            ],
        ];
    }

    /** Solo pruebas: ruta alternativa de config.php (y de su carpeta data/). */
    public static ?string $fileOverride = null;

    public static function file(): string
    {
        return self::$fileOverride ?? PCB_APP . '/config.php';
    }

    public static function installed(): bool
    {
        return self::$cfg !== null || is_file(self::file());
    }

    public static function all(): array
    {
        if (self::$cfg === null) {
            $loaded = is_file(self::file()) ? require self::file() : [];
            self::$cfg = array_replace_recursive(self::defaults(), is_array($loaded) ? $loaded : []);
        }
        return self::$cfg;
    }

    /** Solo pruebas / instalador. */
    public static function set(array $cfg): void
    {
        self::$cfg = array_replace_recursive(self::defaults(), $cfg);
    }

    public static function get(string $key, $default = null)
    {
        return self::all()[$key] ?? $default;
    }

    public static function rules(): array
    {
        return self::all()['rules'];
    }

    public static function rule(string $key): int
    {
        return (int) self::rules()[$key];
    }

    public static function basePath(): string
    {
        $p = parse_url((string) self::get('base_url'), PHP_URL_PATH) ?: '/';
        return rtrim($p, '/') . '/';
    }
}
