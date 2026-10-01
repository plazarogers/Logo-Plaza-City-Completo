<?php
declare(strict_types=1);

/** Apartados: toda regla vive aquí; el frontend solo la refleja. */
final class Bookings
{
    public static function log(string $type, array $f): void
    {
        Db::run(
            'INSERT INTO activity (type, booking_id, user_id, space_id, date, start_hour, end_hour, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$type, $f['booking_id'] ?? ($f['id'] ?? null), $f['user_id'] ?? null, $f['space_id'] ?? null, $f['date'] ?? null,
             $f['start_hour'] ?? null, $f['end_hour'] ?? null, $f['detail'] ?? '']
        );
    }

    public static function get(int $id): ?array
    {
        return Db::one(
            'SELECT b.*, u.name AS user_name, u.company AS user_company FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.id = ?',
            [$id]
        );
    }

    /** Ventana de check-in en ms epoch. */
    public static function checkinWindow(array $b): array
    {
        $start = Time::ms($b['start_at']);
        return [
            'opens' => $start - Config::rule('checkin_opens_minutes_before') * 60000,
            'closes' => $start + Config::rule('checkin_grace_minutes') * 60000,
        ];
    }

    public static function create(array $user, string $spaceId, string $date, $start, $end, string $note = ''): array
    {
        if (!Schedule::space($spaceId)) {
            throw new AppError('unknown_space');
        }
        if (!Time::isValidDate($date)) {
            throw new AppError('bad_date');
        }
        Schedule::validateRange($spaceId, $date, $start, $end);

        $now = Time::now();
        $startDt = Time::slot($date, $start);
        $endDt = Time::slot($date, $end);
        $hourStart = $now->setTime((int) $now->format('H'), 0, 0);
        if ($endDt <= $now || $startDt < $hourStart) {
            throw new AppError('past');
        }
        $days = Config::rule('booking_window_days');
        if ($date > Time::addDays(Time::today(), $days)) {
            throw new AppError('too_far', 400, ['days' => $days]);
        }
        if (!empty($user['access_until']) && $date > $user['access_until']) {
            throw new AppError('access_ends', 400, ['date' => $user['access_until']]);
        }
        $userId = (int) $user['id'];
        $note = mb_substr(trim($note), 0, 120);

        $id = Db::tx(function () use ($userId, $spaceId, $date, $start, $end, $startDt, $endDt, $now, $note) {
            $used = (int) Db::value(
                "SELECT COALESCE(SUM(end_hour - start_hour), 0) FROM bookings WHERE user_id = ? AND space_id = ? AND date = ? AND status IN ('active','completed')",
                [$userId, $spaceId, $date]
            );
            $quota = Config::rule('max_hours_per_user_per_day');
            if ($used + ($end - $start) > $quota) {
                throw new AppError('quota', 400, ['max' => $quota, 'used' => $used]);
            }
            $active = (int) Db::value("SELECT COUNT(*) FROM bookings WHERE user_id = ? AND status = 'active'", [$userId]);
            $maxActive = Config::rule('max_active_bookings_per_user');
            if ($active >= $maxActive) {
                throw new AppError('too_many_active', 400, ['max' => $maxActive]);
            }
            // Apartar ya dentro de la ventana de check-in = check-in inmediato (walk-up).
            $auto = $now->getTimestamp() >= $startDt->getTimestamp() - Config::rule('checkin_opens_minutes_before') * 60;
            Db::run(
                'INSERT INTO bookings (space_id, user_id, date, start_hour, end_hour, start_at, end_at, note, checked_in_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$spaceId, $userId, $date, $start, $end, Time::iso($startDt), Time::iso($endDt), $note, $auto ? Time::nowIso() : null]
            );
            $id = (int) Db::pdo()->lastInsertId();
            $ins = Db::pdo()->prepare('INSERT INTO booking_slots (booking_id, space_id, slot_start) VALUES (?, ?, ?)');
            for ($h = $start; $h < $end; $h++) {
                try {
                    $ins->execute([$id, $spaceId, Time::iso(Time::slot($date, $h))]);
                } catch (PDOException $e) {
                    if ($e->getCode() === '23000') {
                        throw new AppError('conflict', 409, ['hour' => Time::hh($h)]);
                    }
                    throw $e;
                }
            }
            self::log('booked', ['booking_id' => $id, 'user_id' => $userId, 'space_id' => $spaceId, 'date' => $date, 'start_hour' => $start, 'end_hour' => $end]);
            return $id;
        });
        $b = self::get($id);
        self::notifyOthers($b, 'booked');
        return $b;
    }

    private static function owned(int $userId, int $id, string $forbiddenCode): array
    {
        $b = self::get($id);
        if (!$b) {
            throw new AppError('not_found', 404);
        }
        if ((int) $b['user_id'] !== $userId) {
            throw new AppError($forbiddenCode, 403);
        }
        if ($b['status'] !== 'active') {
            throw new AppError('not_active');
        }
        return $b;
    }

    /** Cancela antes del inicio; si ya empezó, libera las horas restantes. */
    public static function cancel(int $userId, int $id): array
    {
        $b = self::owned($userId, $id, 'forbidden_cancel');
        $now = Time::now()->getTimestamp();
        $start = Time::ms($b['start_at']) / 1000;
        $end = Time::ms($b['end_at']) / 1000;
        $lock = Config::rule('cancel_lock_in_minutes');
        if ($now < $start) {
            if ($lock > 0 && $now >= $start - $lock * 60) {
                throw new AppError('locked_in', 400, ['min' => $lock]);
            }
            Db::tx(function () use ($b) {
                Db::run("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ?", [Time::nowIso(), $b['id']]);
                Db::run('DELETE FROM booking_slots WHERE booking_id = ?', [$b['id']]);
                self::log('cancelled', $b);
            });
            $b = self::get((int) $b['id']);
            self::notifyOthers($b, 'cancelled');
            return $b;
        }
        if ($now < $end) {
            return self::endEarly($userId, $id);
        }
        throw new AppError('already_ended');
    }

    /** Terminar antes: conserva la hora en curso y libera las siguientes. */
    public static function endEarly(int $userId, int $id): array
    {
        $b = self::owned($userId, $id, 'forbidden_cancel');
        Db::tx(function () use ($b) {
            Db::run("UPDATE bookings SET status = 'released', released_reason = 'ended_early', updated_at = ? WHERE id = ?", [Time::nowIso(), $b['id']]);
            Db::run('DELETE FROM booking_slots WHERE booking_id = ? AND slot_start > ?', [$b['id'], Time::nowIso()]);
            self::log('ended_early', $b);
        });
        $b = self::get((int) $b['id']);
        self::notifyOthers($b, 'released');
        return $b;
    }

    public static function checkIn(int $userId, int $id): array
    {
        $b = self::owned($userId, $id, 'forbidden_checkin');
        if ($b['checked_in_at']) {
            return $b;
        }
        $w = self::checkinWindow($b);
        $nowMs = Time::now()->getTimestamp() * 1000;
        if ($nowMs < $w['opens']) {
            throw new AppError('too_early', 400, ['min' => Config::rule('checkin_opens_minutes_before')]);
        }
        if ($nowMs > $w['closes']) {
            throw new AppError('too_late');
        }
        Db::run('UPDATE bookings SET checked_in_at = ?, updated_at = ? WHERE id = ?', [Time::nowIso(), Time::nowIso(), $b['id']]);
        self::log('checked_in', $b);
        return self::get((int) $b['id']);
    }

    /** Cancela por decisión del edificio (cierre o baja de usuario) y avisa al afectado. */
    public static function cancelBySystem(array $b, string $reason, string $detail = ''): void
    {
        Db::run("UPDATE bookings SET status = 'cancelled', released_reason = ?, updated_at = ? WHERE id = ? AND status = 'active'", [$reason, Time::nowIso(), $b['id']]);
        Db::run('DELETE FROM booking_slots WHERE booking_id = ?', [$b['id']]);
        self::log('cancelled', $b + ['detail' => $reason]);
        if ($reason === 'closure') {
            Push::queueUser((int) $b['user_id'], fn ($lang) => [
                'title' => $lang === 'en' ? 'Booking cancelled by building management' : 'Apartado cancelado por la administración',
                'body' => self::when($b, $lang) . ($detail ? " · $detail" : ''),
                'url' => '#/mis-apartados', 'tag' => 'booking-' . $b['id'],
            ]);
        }
    }

    /**
     * Mantenimiento automático (cada minuto por cron, o al recibir visitas):
     *  1. recordatorio de check-in   2. libera no-shows   3. marca completados
     *  4. desactiva cuentas cuyo acceso (fin de contrato) venció   5. limpieza
     */
    public static function maintenance(): array
    {
        $now = Time::now();
        $nowIso = Time::nowIso();
        $out = ['reminded' => 0, 'released' => 0, 'completed' => 0, 'expired_users' => 0];

        $remindBy = Time::iso($now->modify('+' . Config::rule('reminder_minutes_before') . ' minutes'));
        foreach (Db::all("SELECT * FROM bookings WHERE status = 'active' AND checked_in_at IS NULL AND reminder_sent_at IS NULL AND start_at <= ? AND end_at > ?", [$remindBy, $nowIso]) as $b) {
            Db::run('UPDATE bookings SET reminder_sent_at = ? WHERE id = ?', [$nowIso, $b['id']]);
            $closes = Time::fromIso($b['start_at'])->modify('+' . Config::rule('checkin_grace_minutes') . ' minutes')->format('H:i');
            Push::queueUser((int) $b['user_id'], fn ($lang) => [
                'title' => $lang === 'en' ? 'Time to check in' : 'Haz check-in',
                'body' => self::when($b, $lang) . ' · ' . ($lang === 'en' ? "Check in before $closes or it will be released." : "Haz check-in antes de las $closes o se liberará."),
                'url' => '#/mis-apartados', 'tag' => 'checkin-' . $b['id'],
            ]);
            $out['reminded']++;
        }

        $deadline = Time::iso($now->modify('-' . Config::rule('checkin_grace_minutes') . ' minutes'));
        foreach (Db::all("SELECT * FROM bookings WHERE status = 'active' AND checked_in_at IS NULL AND start_at <= ? AND end_at > ?", [$deadline, $nowIso]) as $b) {
            Db::tx(function () use ($b, $nowIso) {
                Db::run("UPDATE bookings SET status = 'released', released_reason = 'no_show', updated_at = ? WHERE id = ? AND status = 'active'", [$nowIso, $b['id']]);
                Db::run('DELETE FROM booking_slots WHERE booking_id = ?', [$b['id']]);
                self::log('released', $b + ['detail' => 'no_show']);
            });
            $full = self::get((int) $b['id']);
            self::notifyOthers($full, 'released');
            Push::queueUser((int) $b['user_id'], fn ($lang) => [
                'title' => $lang === 'en' ? 'Booking released (no check-in)' : 'Apartado liberado por falta de check-in',
                'body' => self::when($b, $lang), 'url' => '#/mis-apartados', 'tag' => 'booking-' . $b['id'],
            ]);
            $out['released']++;
        }

        $out['completed'] = Db::run("UPDATE bookings SET status = 'completed', updated_at = ? WHERE status = 'active' AND end_at <= ?", [$nowIso, $nowIso])->rowCount();

        foreach (Db::all('SELECT id FROM users WHERE disabled_at IS NULL AND access_until IS NOT NULL AND access_until < ?', [Time::today()]) as $u) {
            Owner::disableUser((int) $u['id'], 'access_expired');
            $out['expired_users']++;
        }

        Db::run('DELETE FROM sessions WHERE expires_at < ?', [$nowIso]);
        Db::run('DELETE FROM rate_limits WHERE reset_at < ?', [time()]);
        Db::run('DELETE FROM push_outbox WHERE created_at < ?', [Time::iso($now->modify('-1 day'))]);
        Db::run('DELETE FROM password_resets WHERE expires_at < ?', [Time::iso($now->modify('-7 days'))]);
        Db::setMeta('last_maintenance', (string) time());
        return $out;
    }

    /** Ejecuta mantenimiento como máximo cada 30 s (respaldo si no hay cron). */
    public static function maybeMaintenance(): void
    {
        $last = (int) (Db::meta('last_maintenance') ?? 0);
        if (time() - $last >= 30) {
            Db::setMeta('last_maintenance', (string) time());
            self::maintenance();
        }
    }

    public static function when(array $b, string $lang): string
    {
        return Schedule::name($b['space_id'], $lang) . ' · ' . Time::shortDate($b['date'], $lang) . ' · '
            . Time::hh((int) $b['start_hour']) . '–' . Time::hh((int) $b['end_hour']);
    }

    private static function notifyOthers(array $b, string $kind): void
    {
        $who = $b['user_company'] ? "{$b['user_name']} ({$b['user_company']})" : $b['user_name'];
        Push::queueAll(function ($lang) use ($b, $kind, $who) {
            $space = Schedule::name($b['space_id'], $lang);
            $titles = $lang === 'en'
                ? ['booked' => "$space booked", 'cancelled' => "$space is available again", 'released' => "$space released"]
                : ['booked' => "$space apartado", 'cancelled' => "$space disponible de nuevo", 'released' => "$space liberado"];
            $when = Time::shortDate($b['date'], $lang) . ' · ' . Time::hh((int) $b['start_hour']) . '–' . Time::hh((int) $b['end_hour']);
            return [
                'title' => $titles[$kind],
                'body' => "$when · $who",
                'url' => '#/calendario?space=' . $b['space_id'] . '&date=' . $b['date'],
                'tag' => 'booking-' . $b['id'],
            ];
        }, (int) $b['user_id']);
    }

    /** Vista de un día para el calendario. */
    public static function dayView(string $spaceId, string $date, int $viewerId): array
    {
        $status = Schedule::dayStatus($spaceId, $date);
        $hours = [];
        if ($status['open']) {
            $from = Time::iso(Time::slot($date, 0));
            $to = Time::iso(Time::slot(Time::addDays($date, 1), 0));
            $occupied = [];
            foreach (Db::all(
                'SELECT s.slot_start, b.id, b.user_id, b.status, b.checked_in_at, b.start_hour, b.end_hour, b.note, u.name, u.company
                 FROM booking_slots s JOIN bookings b ON b.id = s.booking_id JOIN users u ON u.id = b.user_id
                 WHERE s.space_id = ? AND s.slot_start >= ? AND s.slot_start < ?',
                [$spaceId, $from, $to]
            ) as $r) {
                $occupied[$r['slot_start']] = $r;
            }
            $now = Time::now();
            $hourStart = $now->setTime((int) $now->format('H'), 0, 0);
            foreach ($status['hours'] as $h) {
                $st = Time::slot($date, $h['hour']);
                $r = $occupied[Time::iso($st)] ?? null;
                $hours[] = [
                    'hour' => $h['hour'],
                    'kind' => $h['kind'],
                    'past' => $st < $hourStart,
                    'booking' => $r ? [
                        'id' => (int) $r['id'], 'mine' => (int) $r['user_id'] === $viewerId, 'user_name' => $r['name'],
                        'user_company' => $r['company'], 'status' => $r['status'], 'checked_in' => (bool) $r['checked_in_at'],
                        'start_hour' => (int) $r['start_hour'], 'end_hour' => (int) $r['end_hour'], 'note' => $r['note'],
                    ] : null,
                ];
            }
        }
        unset($status['hours']);
        return ['space' => $spaceId, 'date' => $date] + $status + ['hours' => $hours];
    }

    public static function mine(int $userId): array
    {
        $rows = Db::all(
            "SELECT * FROM bookings WHERE user_id = ? AND (status = 'active' OR updated_at > ?) ORDER BY start_at DESC LIMIT 100",
            [$userId, Time::iso(Time::now()->modify('-30 days'))]
        );
        return array_map(fn ($b) => $b + ['checkin' => self::checkinWindow($b)], $rows);
    }

    public static function activity(int $limit = 50, ?int $before = null): array
    {
        $limit = max(1, min(200, $limit));
        $rows = $before
            ? Db::all("SELECT a.*, u.name AS user_name, u.company AS user_company FROM activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.id < ? ORDER BY a.id DESC LIMIT $limit", [$before])
            : Db::all("SELECT a.*, u.name AS user_name, u.company AS user_company FROM activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT $limit");
        return array_map(fn ($r) => $r + ['hours' => $r['end_hour'] !== null ? $r['end_hour'] - $r['start_hour'] : null], $rows);
    }

    public static function overview(int $days = 7): array
    {
        $out = [];
        $today = Time::today();
        for ($i = 0; $i < $days; $i++) {
            $d = Time::addDays($today, $i);
            $spaces = [];
            foreach (Schedule::ids() as $sid) {
                $st = Schedule::dayStatus($sid, $d);
                $booked = (int) Db::value("SELECT COALESCE(SUM(end_hour - start_hour), 0) FROM bookings WHERE space_id = ? AND date = ? AND status IN ('active','completed')", [$sid, $d]);
                $spaces[] = [
                    'id' => $sid, 'open' => $st['open'], 'reason' => $st['reason'] ?? null,
                    'holiday' => $st['holiday'] ?? null, 'closure' => $st['closure'] ?? null,
                    'total' => $st['open'] ? count($st['hours']) : 0, 'booked' => $booked,
                ];
            }
            $out[] = ['date' => $d, 'spaces' => $spaces];
        }
        return $out;
    }

    /** Archivo .ics para agregar el apartado a Google/Outlook/Apple Calendar. */
    public static function ics(array $b): string
    {
        $fmt = fn (string $iso) => (new DateTimeImmutable($iso))->format('Ymd\THis\Z');
        $esc = fn (string $s) => addcslashes($s, ",;\\");
        $host = parse_url((string) Config::get('base_url'), PHP_URL_HOST) ?: 'plazacity.net';
        $lines = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plaza City//Booking//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:booking-' . $b['id'] . '@' . $host,
            'DTSTAMP:' . $fmt(Time::nowIso()),
            'DTSTART:' . $fmt($b['start_at']),
            'DTEND:' . $fmt($b['end_at']),
            'SUMMARY:' . $esc('Plaza City · ' . Schedule::name($b['space_id'], 'en')),
            'LOCATION:' . $esc('Plaza City · ' . Schedule::name($b['space_id'], 'en')),
            'DESCRIPTION:' . $esc(($b['note'] ? $b['note'] . ' — ' : '') . 'Check-in: ' . rtrim((string) Config::get('base_url'), '/') . '/#/mis-apartados'),
            'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Check-in', 'END:VALARM',
            'END:VEVENT', 'END:VCALENDAR',
        ];
        return implode("\r\n", $lines) . "\r\n";
    }
}
