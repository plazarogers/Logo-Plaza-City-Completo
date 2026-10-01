<?php
declare(strict_types=1);

/** Funciones del dueño/administrador del edificio. */
final class Owner
{
    public static function users(): array
    {
        return Db::all(
            "SELECT u.id, u.name, u.email, u.company, u.suite, u.access_until, u.disabled_at, u.last_seen_at, u.created_at,
                    (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id AND b.status IN ('active','completed')) AS bookings,
                    (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id AND b.released_reason = 'no_show') AS no_shows,
                    (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = u.id) AS devices
             FROM users u ORDER BY u.disabled_at IS NOT NULL, u.name COLLATE NOCASE"
        );
    }

    /** Baja: cierra sesiones, quita push y cancela apartados futuros (liberándolos para los demás). */
    public static function disableUser(int $id, string $reason = 'owner'): void
    {
        $u = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$u) {
            throw new AppError('not_found', 404);
        }
        $future = Db::all("SELECT * FROM bookings WHERE user_id = ? AND status = 'active' AND start_at > ?", [$id, Time::nowIso()]);
        Db::tx(function () use ($id, $future) {
            Db::run('UPDATE users SET disabled_at = COALESCE(disabled_at, ?) WHERE id = ?', [Time::nowIso(), $id]);
            Db::run('DELETE FROM sessions WHERE user_id = ?', [$id]);
            Db::run('DELETE FROM push_subscriptions WHERE user_id = ?', [$id]);
            foreach ($future as $b) {
                Bookings::cancelBySystem($b, 'user_disabled');
            }
        });
    }

    public static function enableUser(int $id, ?string $accessUntil): void
    {
        if ($accessUntil !== null && $accessUntil !== '' && !Time::isValidDate($accessUntil)) {
            throw new AppError('bad_date');
        }
        Db::run('UPDATE users SET disabled_at = NULL, access_until = ? WHERE id = ?', [$accessUntil ?: null, $id]);
    }

    public static function setAccessUntil(int $id, ?string $accessUntil): void
    {
        if ($accessUntil !== null && $accessUntil !== '' && !Time::isValidDate($accessUntil)) {
            throw new AppError('bad_date');
        }
        Db::run('UPDATE users SET access_until = ? WHERE id = ?', [$accessUntil ?: null, $id]);
    }

    public static function closures(): array
    {
        return Db::all('SELECT * FROM closures WHERE date >= ? ORDER BY date, space_id', [Time::addDays(Time::today(), -30)]);
    }

    /** Cierre o día de uso libre. Cancela automáticamente los apartados afectados y avisa. */
    public static function addClosure(string $date, ?string $spaceId, string $kind, string $reason): array
    {
        if (!Time::isValidDate($date)) {
            throw new AppError('bad_date');
        }
        if ($date < Time::today()) {
            throw new AppError('past_date');
        }
        if ($spaceId !== null && $spaceId !== '' && !Schedule::space($spaceId)) {
            throw new AppError('unknown_space');
        }
        $spaceId = $spaceId ?: null;
        $kind = $kind === 'free_use' ? 'free_use' : 'closed';
        $reason = mb_substr(trim($reason), 0, 120);
        $affected = $spaceId
            ? Db::all("SELECT * FROM bookings WHERE date = ? AND space_id = ? AND status = 'active' AND end_at > ?", [$date, $spaceId, Time::nowIso()])
            : Db::all("SELECT * FROM bookings WHERE date = ? AND status = 'active' AND end_at > ?", [$date, Time::nowIso()]);
        $id = Db::tx(function () use ($date, $spaceId, $kind, $reason, $affected) {
            Db::run('INSERT INTO closures (date, space_id, kind, reason) VALUES (?, ?, ?, ?)', [$date, $spaceId, $kind, $reason]);
            $id = (int) Db::pdo()->lastInsertId();
            Bookings::log('closure', ['space_id' => $spaceId, 'date' => $date, 'detail' => $kind . ($reason !== '' ? ': ' . $reason : '')]);
            foreach ($affected as $b) {
                Bookings::cancelBySystem($b, 'closure', $reason);
            }
            return $id;
        });
        return ['id' => $id, 'cancelled' => count($affected)];
    }

    public static function deleteClosure(int $id): bool
    {
        return Db::run('DELETE FROM closures WHERE id = ?', [$id])->rowCount() > 0;
    }

    /** Uso de los últimos N días. */
    public static function stats(int $days = 30): array
    {
        $from = Time::addDays(Time::today(), -$days);
        $to = Time::today();
        $bySpace = [];
        foreach (Schedule::ids() as $sid) {
            $r = Db::one(
                "SELECT
                   COALESCE(SUM(CASE WHEN status IN ('active','completed') THEN end_hour - start_hour END), 0) AS hours,
                   COUNT(CASE WHEN status IN ('active','completed') THEN 1 END) AS bookings,
                   COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
                   COUNT(CASE WHEN released_reason = 'no_show' THEN 1 END) AS no_shows
                 FROM bookings WHERE space_id = ? AND date >= ? AND date <= ?",
                [$sid, $from, $to]
            );
            $available = 0;
            for ($d = $from; $d <= $to; $d = Time::addDays($d, 1)) {
                $st = Schedule::dayStatus($sid, $d);
                $available += $st['open'] ? count($st['hours']) : 0;
            }
            $bySpace[] = ['id' => $sid, 'available_hours' => $available, 'occupancy' => $available ? round($r['hours'] / $available, 3) : 0] + array_map('intval', $r);
        }
        $byCompany = Db::all(
            "SELECT COALESCE(NULLIF(u.company, ''), u.name) AS company, SUM(b.end_hour - b.start_hour) AS hours, COUNT(*) AS bookings
             FROM bookings b JOIN users u ON u.id = b.user_id
             WHERE b.status IN ('active','completed') AND b.date >= ? AND b.date <= ?
             GROUP BY 1 ORDER BY hours DESC LIMIT 50",
            [$from, $to]
        );
        return ['from' => $from, 'to' => $to, 'spaces' => $bySpace, 'companies' => $byCompany,
            'users' => (int) Db::value('SELECT COUNT(*) FROM users WHERE disabled_at IS NULL'),
            'push_devices' => (int) Db::value('SELECT COUNT(*) FROM push_subscriptions')];
    }

    public static function csv(): string
    {
        $rows = Db::all(
            'SELECT b.id, b.space_id, b.date, b.start_hour, b.end_hour, b.status, b.released_reason, b.checked_in_at, b.note,
                    u.name, u.email, u.company, b.created_at
             FROM bookings b JOIN users u ON u.id = b.user_id ORDER BY b.date DESC, b.start_hour'
        );
        $f = fopen('php://temp', 'w+');
        fwrite($f, "\xEF\xBB\xBF"); // BOM para que Excel lea acentos
        fputcsv($f, ['id', 'space', 'date', 'start', 'end', 'hours', 'status', 'reason', 'checked_in_at', 'note', 'name', 'email', 'company', 'created_at'], ',', '"', '');
        // Evita que Excel interprete como fórmula un texto escrito por un inquilino.
        $safe = fn ($v) => is_string($v) && $v !== '' && strpbrk($v[0], "=+-@\t\r") !== false ? "'" . $v : $v;
        foreach ($rows as $r) {
            $r = array_map($safe, $r);
            fputcsv($f, [$r['id'], $r['space_id'], $r['date'], Time::hh((int) $r['start_hour']), Time::hh((int) $r['end_hour']),
                $r['end_hour'] - $r['start_hour'], $r['status'], $r['released_reason'], $r['checked_in_at'], $r['note'],
                $r['name'], $r['email'], $r['company'], $r['created_at']], ',', '"', '');
        }
        rewind($f);
        return stream_get_contents($f);
    }
}
