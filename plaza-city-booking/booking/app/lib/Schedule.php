<?php
declare(strict_types=1);

/** Espacios, horarios permitidos y validación. Bloques de 1 hora. */
final class Schedule
{
    // días: 1 = lunes ... 6 = sábado, 7 = domingo. 'to' es exclusivo.
    public const SPACES = [
        [
            'id' => 'conference', 'name' => 'Conference Room', 'nameEs' => 'Conference Room',
            'windows' => [
                ['days' => [1, 2, 3, 4, 5], 'from' => 8, 'to' => 17, 'kind' => 'regular'],
                ['days' => [1, 2, 3, 4, 5], 'from' => 17, 'to' => 21, 'kind' => 'special'],
            ],
        ],
        [
            'id' => 'atrium', 'name' => 'Atrium', 'nameEs' => 'Atrio',
            'windows' => [
                ['days' => [1, 2, 3, 4, 5], 'from' => 17, 'to' => 21, 'kind' => 'regular'],
                ['days' => [6], 'from' => 8, 'to' => 13, 'kind' => 'regular'],
            ],
        ],
        [
            'id' => 'lounge', 'name' => 'Lounge (2nd floor)', 'nameEs' => 'Lounge (2º piso)',
            'windows' => [
                ['days' => [1, 2, 3, 4, 5], 'from' => 17, 'to' => 21, 'kind' => 'regular'],
                ['days' => [6], 'from' => 8, 'to' => 13, 'kind' => 'regular'],
            ],
        ],
    ];

    public static function ids(): array
    {
        return array_column(self::SPACES, 'id');
    }

    public static function space(string $id): ?array
    {
        foreach (self::SPACES as $s) {
            if ($s['id'] === $id) {
                return $s;
            }
        }
        return null;
    }

    public static function name(string $id, string $lang): string
    {
        $s = self::space($id);
        return $s ? ($lang === 'en' ? $s['name'] : $s['nameEs']) : $id;
    }

    /** Cierre del edificio aplicable (del espacio o de todo el edificio). */
    public static function closure(string $spaceId, string $date): ?array
    {
        return Db::one(
            'SELECT id, date, space_id, kind, reason FROM closures WHERE date = ? AND (space_id IS NULL OR space_id = ?) ORDER BY space_id IS NULL, id LIMIT 1',
            [$date, $spaceId]
        );
    }

    /**
     * Estado de un día:
     *  open=false reason=sunday|holiday|closure_free  (freeUse=true: uso libre por orden de llegada)
     *  open=false reason=closure|closed              (no hay uso)
     *  open=true  hours=[{hour, kind}]
     */
    public static function dayStatus(string $spaceId, string $date): array
    {
        $space = self::space($spaceId);
        if (!$space) {
            throw new AppError('unknown_space');
        }
        $wd = Time::weekday($date);
        if ($wd === 7) {
            return ['open' => false, 'reason' => 'sunday', 'freeUse' => true];
        }
        if ($h = Holidays::forDate($date)) {
            return ['open' => false, 'reason' => 'holiday', 'freeUse' => true, 'holiday' => $h];
        }
        if ($c = self::closure($spaceId, $date)) {
            $free = $c['kind'] === 'free_use';
            return ['open' => false, 'reason' => $free ? 'closure_free' : 'closure', 'freeUse' => $free, 'closure' => $c];
        }
        $hours = [];
        foreach ($space['windows'] as $w) {
            if (!in_array($wd, $w['days'], true)) {
                continue;
            }
            for ($h = $w['from']; $h < $w['to']; $h++) {
                $hours[] = ['hour' => $h, 'kind' => $w['kind']];
            }
        }
        usort($hours, fn ($a, $b) => $a['hour'] <=> $b['hour']);
        if (!$hours) {
            return ['open' => false, 'reason' => 'closed', 'freeUse' => false];
        }
        return ['open' => true, 'hours' => $hours];
    }

    /** Valida [start, end) contra el horario. Lanza AppError si no es válido. */
    public static function validateRange(string $spaceId, string $date, $start, $end): void
    {
        if (!is_int($start) || !is_int($end)) {
            throw new AppError('bad_hours');
        }
        if ($end <= $start) {
            throw new AppError('bad_range');
        }
        $max = Config::rule('max_hours_per_booking');
        if ($end - $start > $max) {
            throw new AppError('too_long', 400, ['max' => $max]);
        }
        $st = self::dayStatus($spaceId, $date);
        if (!$st['open']) {
            $vars = [];
            if ($st['reason'] === 'holiday') {
                $vars['name'] = Msg::$lang === 'en' ? $st['holiday']['name'] : $st['holiday']['nameEs'];
            }
            if (isset($st['closure'])) {
                $vars['reason'] = $st['closure']['reason'];
            }
            throw new AppError($st['reason'], 400, $vars);
        }
        $allowed = array_column($st['hours'], 'hour');
        for ($h = $start; $h < $end; $h++) {
            if (!in_array($h, $allowed, true)) {
                throw new AppError('outside_hours', 400, ['hour' => Time::hh($h)]);
            }
        }
    }
}
