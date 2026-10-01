<?php
// Punto de carga común para api.php, cron.php, install.php y las pruebas.
declare(strict_types=1);

const PCB_VERSION = '2.0.0';
define('PCB_APP', __DIR__);

foreach (['Config', 'Db', 'Time', 'Msg', 'Holidays', 'Schedule', 'Auth', 'Invites', 'WebPush', 'Push', 'Bookings', 'Owner'] as $cls) {
    require_once __DIR__ . "/lib/$cls.php";
}

date_default_timezone_set('UTC');
