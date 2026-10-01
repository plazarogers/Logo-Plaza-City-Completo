<?php
declare(strict_types=1);

/** Links de invitación: única vía de registro. Caducan por fecha o usos. */
final class Invites
{
    public static function url(string $token): string
    {
        return rtrim((string) Config::get('base_url'), '/') . '/#/registro?invite=' . rawurlencode($token);
    }

    public static function status(array $inv): string
    {
        if ($inv['revoked_at']) {
            return 'revoked';
        }
        if ($inv['expires_at'] <= Time::nowIso()) {
            return 'expired';
        }
        if ((int) $inv['uses'] >= (int) $inv['max_uses']) {
            return 'used';
        }
        return 'active';
    }

    private static function decorate(?array $inv): ?array
    {
        if (!$inv) {
            return null;
        }
        $inv['status'] = self::status($inv);
        $inv['url'] = self::url($inv['token']);
        return $inv;
    }

    public static function create(string $label = '', int $maxUses = 1, ?int $days = null, ?string $accessUntil = null): array
    {
        $days ??= Config::rule('invite_default_days');
        $days = max(1, min(365, $days));
        $maxUses = max(1, min(500, $maxUses));
        if ($accessUntil !== null && $accessUntil !== '' && !Time::isValidDate($accessUntil)) {
            throw new AppError('bad_date');
        }
        $token = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
        Db::run(
            'INSERT INTO invites (token, label, max_uses, expires_at, access_until) VALUES (?, ?, ?, ?, ?)',
            [$token, mb_substr($label, 0, 120), $maxUses, Time::iso(Time::now()->modify("+$days days")), $accessUntil ?: null]
        );
        return self::get((int) Db::pdo()->lastInsertId());
    }

    public static function get(int $id): ?array
    {
        return self::decorate(Db::one('SELECT * FROM invites WHERE id = ?', [$id]));
    }

    public static function findByToken(string $token): ?array
    {
        if ($token === '' || strlen($token) > 100) {
            return null;
        }
        return self::decorate(Db::one('SELECT * FROM invites WHERE token = ?', [$token]));
    }

    public static function list(): array
    {
        $rows = Db::all('SELECT * FROM invites ORDER BY id DESC LIMIT 300');
        return array_map(function ($inv) {
            $inv = self::decorate($inv);
            $inv['users'] = Db::all('SELECT id, name, email, company FROM users WHERE invite_id = ?', [$inv['id']]);
            if ($inv['status'] !== 'active') {
                unset($inv['url']); // no exponer links muertos
            }
            return $inv;
        }, $rows);
    }

    public static function revoke(int $id): bool
    {
        return Db::run('UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [Time::nowIso(), $id])->rowCount() > 0;
    }

    /** Consume un uso de forma atómica. */
    public static function consume(int $id): bool
    {
        return Db::run(
            'UPDATE invites SET uses = uses + 1 WHERE id = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses',
            [$id, Time::nowIso()]
        )->rowCount() > 0;
    }
}
