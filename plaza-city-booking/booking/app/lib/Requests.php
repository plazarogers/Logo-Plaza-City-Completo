<?php
declare(strict_types=1);

/**
 * Solicitudes de espacio: un inquilino encuentra vacío un espacio apartado y le
 * pide al dueño del apartado que lo libere.
 *  - Solo durante el apartado y después de los minutos de gracia del check-in.
 *  - El dueño responde "Liberar" o "Lo estoy usando" (push con botones).
 *  - Si no responde en request_response_minutes, el espacio se libera solo.
 *  - Al liberarse, quien pidió tiene request_hold_minutes de prioridad para apartar.
 */
final class Requests
{
    public static function eligibility(array $b, int $userId): ?string
    {
        if ($b['status'] !== 'active') {
            return 'not_active';
        }
        if ((int) $b['user_id'] === $userId) {
            return 'request_own';
        }
        $now = Time::now()->getTimestamp();
        $start = intdiv(Time::ms($b['start_at']), 1000);
        $end = intdiv(Time::ms($b['end_at']), 1000);
        if ($now < $start + Config::rule('checkin_grace_minutes') * 60) {
            return 'request_too_early';
        }
        if ($now >= $end) {
            return 'already_ended';
        }
        if (Db::value("SELECT 1 FROM space_requests WHERE booking_id = ? AND status = 'pending'", [$b['id']])) {
            return 'request_pending';
        }
        if (Db::value('SELECT 1 FROM space_requests WHERE booking_id = ? AND requester_id = ?', [$b['id'], $userId])) {
            return 'request_already';
        }
        return null;
    }

    public static function get(int $id): ?array
    {
        $r = Db::one(
            "SELECT r.*, rq.name AS requester_name, rq.company AS requester_company, h.name AS holder_name, h.company AS holder_company,
                    b.start_hour, b.end_hour, b.start_at, b.end_at, b.status AS booking_status
             FROM space_requests r
             JOIN users rq ON rq.id = r.requester_id JOIN users h ON h.id = r.holder_id JOIN bookings b ON b.id = r.booking_id
             WHERE r.id = ?",
            [$id]
        );
        if (!$r) {
            return null;
        }
        $now = Time::now()->getTimestamp();
        $r['seconds_left'] = $r['status'] === 'pending' ? max(0, (new DateTimeImmutable($r['expires_at']))->getTimestamp() - $now) : 0;
        $r['hold_seconds_left'] = $r['hold_until'] ? max(0, (new DateTimeImmutable($r['hold_until']))->getTimestamp() - $now) : 0;
        return $r;
    }

    /** Vista para un usuario: solo quien pidió o quien apartó pueden verla. */
    public static function forUser(int $id, int $userId): array
    {
        self::expireDue();
        $r = self::get($id);
        if (!$r || ((int) $r['requester_id'] !== $userId && (int) $r['holder_id'] !== $userId)) {
            throw new AppError('not_found', 404);
        }
        $r['role'] = (int) $r['requester_id'] === $userId ? 'requester' : 'holder';
        return $r;
    }

    public static function create(array $user, int $bookingId): array
    {
        Auth::rateLimit('space_request', 10, 3600);
        self::expireDue();
        $b = Bookings::get($bookingId);
        if (!$b) {
            throw new AppError('not_found', 404);
        }
        if ($code = self::eligibility($b, (int) $user['id'])) {
            throw new AppError($code, 409, ['min' => Config::rule('checkin_grace_minutes')]);
        }
        $mins = Config::rule('request_response_minutes');
        $id = Db::tx(function () use ($b, $user, $mins) {
            Db::run(
                "INSERT INTO space_requests (booking_id, space_id, date, requester_id, holder_id, status, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
                [$b['id'], $b['space_id'], $b['date'], $user['id'], $b['user_id'], Time::iso(Time::now()->modify("+$mins minutes"))]
            );
            $id = (int) Db::pdo()->lastInsertId();
            Bookings::log('request_sent', $b + ['user_id' => $user['id'], 'detail' => $b['user_name']]);
            return $id;
        });
        $who = $user['company'] ? "{$user['name']} ({$user['company']})" : $user['name'];
        Push::queueUser((int) $b['user_id'], fn ($lang) => [
            'title' => $lang === 'en'
                ? "$who wants to use the " . Schedule::name($b['space_id'], 'en') . ' now'
                : "$who quiere usar " . Schedule::name($b['space_id'], 'es') . ' ahora',
            'body' => $lang === 'en'
                ? "Your space looks empty. Release it or say you are using it. If you do not answer in $mins minutes, it will be released."
                : "Tu espacio se ve vacío. Libéralo o indica que lo estás usando. Si no respondes en $mins minutos, se liberará.",
            'url' => '#/solicitud?id=' . $id,
            'tag' => 'request-' . $id,
            'requestId' => $id,
            'requireInteraction' => true,
            'actions' => $lang === 'en'
                ? [['action' => 'release', 'title' => 'Release'], ['action' => 'keep', 'title' => "I'm using it"]]
                : [['action' => 'release', 'title' => 'Liberar'], ['action' => 'keep', 'title' => 'Lo estoy usando']],
            '_ttl' => $mins * 60,
            '_urgency' => 'high',
        ]);
        return self::forUser($id, (int) $user['id']);
    }

    /** Respuesta del dueño del apartado: 'release' o 'keep'. */
    public static function respond(int $userId, int $id, string $action): array
    {
        self::expireDue();
        $r = self::get($id);
        if (!$r || (int) $r['holder_id'] !== $userId) {
            throw new AppError('not_found', 404);
        }
        if ($r['status'] !== 'pending') {
            throw new AppError('request_closed', 409);
        }
        if ($action === 'release') {
            self::grant($r, 'released');
        } elseif ($action === 'keep') {
            Db::tx(function () use ($r) {
                Db::run("UPDATE space_requests SET status = 'declined', responded_at = ? WHERE id = ? AND status = 'pending'", [Time::nowIso(), $r['id']]);
                Bookings::log('request_declined', ['booking_id' => $r['booking_id'], 'user_id' => $r['holder_id'], 'space_id' => $r['space_id'],
                    'date' => $r['date'], 'start_hour' => $r['start_hour'], 'end_hour' => $r['end_hour'], 'detail' => $r['requester_name']]);
            });
            Push::queueUser((int) $r['requester_id'], fn ($lang) => [
                'title' => $lang === 'en' ? Schedule::name($r['space_id'], 'en') . ' is in use' : Schedule::name($r['space_id'], 'es') . ' está en uso',
                'body' => $lang === 'en' ? "{$r['holder_name']} says they are using the space." : "{$r['holder_name']} indicó que está usando el espacio.",
                'url' => '#/calendario?space=' . $r['space_id'] . '&date=' . $r['date'], 'tag' => 'request-' . $r['id'],
            ]);
        } else {
            throw new AppError('unknown_route', 404);
        }
        return self::forUser($id, $userId);
    }

    /** Libera el resto del apartado (desde la hora en curso) y da prioridad a quien pidió. */
    private static function grant(array $r, string $status): void
    {
        $now = Time::now();
        $hourStart = $now->setTime((int) $now->format('H'), 0, 0);
        $fromHour = (int) $hourStart->format('G');
        $hold = Time::iso($now->modify('+' . Config::rule('request_hold_minutes') . ' minutes'));
        $reason = $status === 'released' ? 'request' : 'request_timeout';
        Db::tx(function () use ($r, $status, $hourStart, $fromHour, $hold, $reason) {
            Db::run("UPDATE space_requests SET status = ?, responded_at = ?, hold_until = ?, from_hour = ?, to_hour = ? WHERE id = ? AND status = 'pending'",
                [$status, Time::nowIso(), $hold, $fromHour, $r['end_hour'], $r['id']]);
            Db::run("UPDATE bookings SET status = 'released', released_reason = ?, updated_at = ? WHERE id = ? AND status = 'active'", [$reason, Time::nowIso(), $r['booking_id']]);
            Db::run('DELETE FROM booking_slots WHERE booking_id = ? AND slot_start >= ?', [$r['booking_id'], Time::iso($hourStart)]);
            Bookings::log($status === 'released' ? 'request_released' : 'request_expired', ['booking_id' => $r['booking_id'], 'user_id' => $r['holder_id'],
                'space_id' => $r['space_id'], 'date' => $r['date'], 'start_hour' => $fromHour, 'end_hour' => $r['end_hour'], 'detail' => $r['requester_name']]);
        });
        $until = Time::fromIso($hold)->format('H:i');
        Push::queueUser((int) $r['requester_id'], fn ($lang) => [
            'title' => $lang === 'en' ? Schedule::name($r['space_id'], 'en') . ' is yours' : Schedule::name($r['space_id'], 'es') . ' es tuyo',
            'body' => $lang === 'en' ? "Book it before $until; until then it is reserved for you." : "Apártalo antes de las $until; hasta entonces está reservado para ti.",
            'url' => '#/calendario?space=' . $r['space_id'] . '&date=' . $r['date'], 'tag' => 'request-' . $r['id'],
        ]);
        if ($status === 'expired') {
            Push::queueUser((int) $r['holder_id'], fn ($lang) => [
                'title' => $lang === 'en' ? 'Your booking was released' : 'Se liberó tu apartado',
                'body' => $lang === 'en'
                    ? "You did not answer {$r['requester_name']}'s request in time."
                    : "No respondiste a tiempo la solicitud de {$r['requester_name']}.",
                'url' => '#/mis-apartados', 'tag' => 'request-' . $r['id'],
            ]);
        }
    }

    /** Resuelve las solicitudes vencidas. Se llama en cada petición y en el cron. */
    public static function expireDue(): int
    {
        $rows = Db::all("SELECT id FROM space_requests WHERE status = 'pending' AND expires_at <= ?", [Time::nowIso()]);
        foreach ($rows as $row) {
            $r = self::get((int) $row['id']);
            if (!$r || $r['status'] !== 'pending') {
                continue;
            }
            if ($r['booking_status'] === 'active' && $r['end_at'] > Time::nowIso()) {
                self::grant($r, 'expired');
            } else {
                Db::run("UPDATE space_requests SET status = 'closed', responded_at = ? WHERE id = ?", [Time::nowIso(), $r['id']]);
            }
        }
        // Si el apartado dejó de estar activo por otra causa, la solicitud ya no aplica.
        Db::run("UPDATE space_requests SET status = 'closed', responded_at = ? WHERE status = 'pending'
                 AND booking_id IN (SELECT id FROM bookings WHERE status != 'active')", [Time::nowIso()]);
        return count($rows);
    }

    /** Prioridad vigente para otra persona sobre estas horas (o null). */
    public static function holdBlocking(string $spaceId, string $date, int $start, int $end, int $userId): ?array
    {
        return Db::one(
            "SELECT r.hold_until, u.name AS requester_name FROM space_requests r JOIN users u ON u.id = r.requester_id
             WHERE r.space_id = ? AND r.date = ? AND r.status IN ('released','expired') AND r.hold_until > ?
               AND r.requester_id != ? AND r.from_hour < ? AND r.to_hour > ? LIMIT 1",
            [$spaceId, $date, Time::nowIso(), $userId, $end, $start]
        );
    }

    /** Prioridades vigentes de un día y espacio (para el calendario). */
    public static function holds(string $spaceId, string $date): array
    {
        return Db::all(
            "SELECT r.requester_id, r.hold_until, r.from_hour, r.to_hour, u.name AS requester_name FROM space_requests r JOIN users u ON u.id = r.requester_id
             WHERE r.space_id = ? AND r.date = ? AND r.status IN ('released','expired') AND r.hold_until > ?",
            [$spaceId, $date, Time::nowIso()]
        );
    }

    /** Solicitudes pendientes sobre apartados de este usuario. */
    public static function pendingForHolder(int $userId): array
    {
        return array_map(fn ($row) => self::get((int) $row['id']),
            Db::all("SELECT id FROM space_requests WHERE holder_id = ? AND status = 'pending' AND expires_at > ? ORDER BY id", [$userId, Time::nowIso()]));
    }
}
