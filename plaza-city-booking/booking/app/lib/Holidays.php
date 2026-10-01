<?php
declare(strict_types=1);

/**
 * Días festivos federales de EE.UU. (5 U.S.C. § 6103) calculados para
 * cualquier año, sin red ni actualización manual. Fecha fija que cae en
 * sábado se observa el viernes; en domingo, el lunes (regla OPM).
 */
final class Holidays
{
    private static array $cache = [];

    private static function rel(string $expr, int $year): string
    {
        return (new DateTimeImmutable("$expr $year", new DateTimeZone('UTC')))->format('Y-m-d');
    }

    private static function observed(int $y, int $m, int $d): string
    {
        $dt = new DateTimeImmutable(sprintf('%04d-%02d-%02d', $y, $m, $d), new DateTimeZone('UTC'));
        $wd = (int) $dt->format('N');
        if ($wd === 6) {
            $dt = $dt->modify('-1 day');
        } elseif ($wd === 7) {
            $dt = $dt->modify('+1 day');
        }
        return $dt->format('Y-m-d');
    }

    /** @return array<int, array{date:string,name:string,nameEs:string}> */
    public static function federal(int $year): array
    {
        if (isset(self::$cache[$year])) {
            return self::$cache[$year];
        }
        $list = [
            ['date' => self::observed($year, 1, 1), 'name' => "New Year's Day", 'nameEs' => 'Año Nuevo'],
            ['date' => self::rel('third monday of january', $year), 'name' => 'Martin Luther King Jr. Day', 'nameEs' => 'Día de Martin Luther King Jr.'],
            ['date' => self::rel('third monday of february', $year), 'name' => "Washington's Birthday (Presidents' Day)", 'nameEs' => 'Día de los Presidentes'],
            ['date' => self::rel('last monday of may', $year), 'name' => 'Memorial Day', 'nameEs' => 'Memorial Day'],
            ['date' => self::observed($year, 7, 4), 'name' => 'Independence Day', 'nameEs' => 'Día de la Independencia'],
            ['date' => self::rel('first monday of september', $year), 'name' => 'Labor Day', 'nameEs' => 'Día del Trabajo'],
            ['date' => self::rel('second monday of october', $year), 'name' => 'Columbus Day', 'nameEs' => 'Día de Colón'],
            ['date' => self::observed($year, 11, 11), 'name' => 'Veterans Day', 'nameEs' => 'Día de los Veteranos'],
            ['date' => self::rel('fourth thursday of november', $year), 'name' => 'Thanksgiving Day', 'nameEs' => 'Día de Acción de Gracias'],
            ['date' => self::observed($year, 12, 25), 'name' => 'Christmas Day', 'nameEs' => 'Navidad'],
        ];
        if ($year >= 2021) {
            $list[] = ['date' => self::observed($year, 6, 19), 'name' => 'Juneteenth National Independence Day', 'nameEs' => 'Juneteenth'];
        }
        // El Año Nuevo siguiente puede observarse el 31 de diciembre de este año.
        $nextNy = self::observed($year + 1, 1, 1);
        if (str_starts_with($nextNy, (string) $year)) {
            $list[] = ['date' => $nextNy, 'name' => "New Year's Day (observed)", 'nameEs' => 'Año Nuevo (observado)'];
        }
        // Y el Año Nuevo de este año puede haberse observado el año anterior: no aplica aquí.
        $list = array_values(array_filter($list, fn ($h) => str_starts_with($h['date'], (string) $year)));
        usort($list, fn ($a, $b) => strcmp($a['date'], $b['date']));
        return self::$cache[$year] = $list;
    }

    public static function forDate(string $date): ?array
    {
        foreach (self::federal((int) substr($date, 0, 4)) as $h) {
            if ($h['date'] === $date) {
                return $h;
            }
        }
        return null;
    }
}
