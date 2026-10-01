<?php
declare(strict_types=1);

/**
 * Suscripciones y bandeja de salida. Las notificaciones se encolan dentro de
 * la transacción y se envían después de responder al usuario (o por cron),
 * así un servicio push lento nunca bloquea un apartado.
 */
final class Push
{
    public static function enabled(): bool
    {
        $v = Config::get('vapid');
        return !empty($v['public_key']) && !empty($v['private_key_pem']);
    }

    public static function save(int $userId, $sub, string $ua = ''): void
    {
        if (!is_array($sub) || !is_string($sub['endpoint'] ?? null) || !preg_match('#^https://#', $sub['endpoint'])
            || strlen($sub['endpoint']) > 1000 || !is_string($sub['keys']['p256dh'] ?? null) || !is_string($sub['keys']['auth'] ?? null)) {
            throw new AppError('bad_subscription');
        }
        if (!self::allowedEndpoint($sub['endpoint'])) {
            throw new AppError('bad_subscription');
        }
        if (strlen(WebPush::b64uDecode($sub['keys']['p256dh'])) !== 65 || strlen(WebPush::b64uDecode($sub['keys']['auth'])) < 16) {
            throw new AppError('bad_subscription');
        }
        Db::run(
            'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth',
            [$userId, $sub['endpoint'], $sub['keys']['p256dh'], $sub['keys']['auth'], mb_substr($ua, 0, 200)]
        );
    }

    /** Solo servicios push oficiales de los navegadores (evita usar el servidor para llamar a otros sitios). */
    public static function allowedEndpoint(string $url): bool
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        foreach (['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'] as $suffix) {
            if ($host === $suffix || str_ends_with($host, '.' . $suffix)) {
                return true;
            }
        }
        return false;
    }

    public static function remove(string $endpoint, ?int $userId = null): void
    {
        if ($userId === null) {
            Db::run('DELETE FROM push_subscriptions WHERE endpoint = ?', [$endpoint]);
        } else {
            Db::run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [$endpoint, $userId]);
        }
    }

    public static function hasSubscription(int $userId): bool
    {
        return (bool) Db::value('SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1', [$userId]);
    }

    /**
     * Encola una notificación para un usuario. $build recibe el idioma del
     * destinatario y devuelve ['title','body','url','tag'].
     */
    public static function queueUser(int $userId, callable $build, ?string $lang = null): void
    {
        if (!self::enabled()) {
            return;
        }
        $lang ??= (string) (Db::value('SELECT lang FROM users WHERE id = ?', [$userId]) ?? 'es');
        Db::run('INSERT INTO push_outbox (user_id, payload) VALUES (?, ?)', [$userId, json_encode($build($lang), JSON_UNESCAPED_UNICODE)]);
    }

    /** Encola para todos los usuarios activos con suscripción, excepto $exceptUserId. */
    public static function queueAll(callable $build, ?int $exceptUserId = null): void
    {
        if (!self::enabled()) {
            return;
        }
        $rows = Db::all(
            'SELECT DISTINCT u.id, u.lang FROM users u JOIN push_subscriptions p ON p.user_id = u.id
             WHERE u.disabled_at IS NULL AND (u.access_until IS NULL OR u.access_until >= ?) AND u.id != ?',
            [Time::today(), $exceptUserId ?? 0]
        );
        foreach ($rows as $r) {
            self::queueUser((int) $r['id'], $build, $r['lang']);
        }
    }

    /** Envía lo pendiente. Llamado al final de cada request y por cron. */
    public static function flush(int $limit = 300): array
    {
        if (!self::enabled()) {
            return ['sent' => 0, 'failed' => 0];
        }
        $rows = Db::all('SELECT * FROM push_outbox WHERE attempts < 3 ORDER BY id LIMIT ' . (int) $limit);
        if (!$rows) {
            return ['sent' => 0, 'failed' => 0];
        }
        // Reclamar las filas (evita doble envío si cron y una request coinciden).
        $ids = array_column($rows, 'id');
        $in = implode(',', array_map('intval', $ids));
        Db::run("UPDATE push_outbox SET attempts = attempts + 10 WHERE id IN ($in) AND attempts < 3");
        $messages = [];
        $map = [];
        foreach ($rows as $row) {
            foreach (Db::all('SELECT * FROM push_subscriptions WHERE user_id = ?', [$row['user_id']]) as $s) {
                $messages[] = ['endpoint' => $s['endpoint'], 'p256dh' => $s['p256dh'], 'auth' => $s['auth'], 'payload' => $row['payload']];
                $map[] = [$row['id'], $s['endpoint']];
            }
        }
        $codes = WebPush::sendMany($messages, Config::get('vapid'));
        $sent = 0;
        $failed = 0;
        $retry = [];
        foreach ($codes as $i => $code) {
            [$outboxId, $endpoint] = $map[$i];
            if ($code >= 200 && $code < 300) {
                $sent++;
            } else {
                $failed++;
                if (in_array($code, [400, 403, 404, 410], true)) {
                    self::remove($endpoint); // suscripción vencida o inválida
                } elseif ($code === 0 || $code === 429 || $code >= 500) {
                    $retry[$outboxId] = true;
                }
            }
        }
        foreach ($ids as $id) {
            if (isset($retry[$id])) {
                Db::run('UPDATE push_outbox SET attempts = attempts - 9 WHERE id = ?', [$id]); // reintento (máx 3)
            } else {
                Db::run('DELETE FROM push_outbox WHERE id = ?', [$id]);
            }
        }
        return ['sent' => $sent, 'failed' => $failed];
    }

    /** Envío inmediato a un usuario (botón "Enviar prueba"). */
    public static function sendNow(int $userId, array $payload): array
    {
        if (!self::enabled()) {
            throw new AppError('push_disabled', 503);
        }
        $subs = Db::all('SELECT * FROM push_subscriptions WHERE user_id = ?', [$userId]);
        $msgs = array_map(fn ($s) => ['endpoint' => $s['endpoint'], 'p256dh' => $s['p256dh'], 'auth' => $s['auth'], 'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE)], $subs);
        $codes = WebPush::sendMany($msgs, Config::get('vapid'));
        $sent = 0;
        foreach ($codes as $i => $c) {
            if ($c >= 200 && $c < 300) {
                $sent++;
            } elseif (in_array($c, [400, 403, 404, 410], true)) {
                self::remove($subs[$i]['endpoint']);
            }
        }
        return ['sent' => $sent, 'failed' => count($codes) - $sent];
    }
}
