<?php
declare(strict_types=1);

/** Todo el sistema razona en America/Chicago; en BD se guarda UTC ISO-8601. */
final class Time
{
    /** Solo pruebas: fija "ahora". */
    public static ?DateTimeImmutable $fixedNow = null;

    public static function tz(): DateTimeZone
    {
        static $tz = null;
        return $tz ??= new DateTimeZone((string) Config::get('timezone', 'America/Chicago'));
    }

    public static function now(): DateTimeImmutable
    {
        return (self::$fixedNow ?? new DateTimeImmutable('now'))->setTimezone(self::tz());
    }

    public static function nowIso(): string
    {
        return self::iso(self::now());
    }

    public static function iso(DateTimeInterface $dt): string
    {
        return (new DateTimeImmutable('@' . $dt->getTimestamp()))->format('Y-m-d\TH:i:s\Z');
    }

    public static function fromIso(string $iso): DateTimeImmutable
    {
        return (new DateTimeImmutable($iso))->setTimezone(self::tz());
    }

    public static function slot(string $date, int $hour): DateTimeImmutable
    {
        return new DateTimeImmutable(sprintf('%s %02d:00:00', $date, $hour), self::tz());
    }

    public static function today(): string
    {
        return self::now()->format('Y-m-d');
    }

    public static function isValidDate($s): bool
    {
        if (!is_string($s) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) {
            return false;
        }
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    /** 1 = lunes ... 7 = domingo */
    public static function weekday(string $date): int
    {
        return (int) (new DateTimeImmutable($date, self::tz()))->format('N');
    }

    public static function addDays(string $date, int $n): string
    {
        return (new DateTimeImmutable($date, self::tz()))->modify(($n >= 0 ? '+' : '') . $n . ' days')->format('Y-m-d');
    }

    public static function ms(string $iso): int
    {
        return (new DateTimeImmutable($iso))->getTimestamp() * 1000;
    }

    public static function hh(int $h): string
    {
        return sprintf('%02d:00', $h);
    }

    /** "jue 1 oct" / "Thu Oct 1" sin depender de la extensión intl. */
    public static function shortDate(string $date, string $lang): string
    {
        $d = new DateTimeImmutable($date, self::tz());
        $wd = (int) $d->format('N') - 1;
        $mo = (int) $d->format('n') - 1;
        if ($lang === 'en') {
            $w = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][$wd];
            $m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][$mo];
            return "$w $m " . $d->format('j');
        }
        $w = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][$wd];
        $m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][$mo];
        return "$w " . $d->format('j') . " $m";
    }
}
