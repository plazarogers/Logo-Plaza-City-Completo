<?php
// Tarea automática: recordatorios, liberación de no-shows, cierre de apartados
// terminados, bajas por fin de contrato y envío de notificaciones pendientes.
//
// cPanel → Cron Jobs (cada minuto):
//   php /home/USUARIO/public_html/booking/cron.php >/dev/null 2>&1
// Sin cron en el hosting: un servicio externo (p. ej. cron-job.org) puede llamar
//   https://plazacity.net/booking/cron.php?token=CRON_TOKEN
// Aun sin cron, el sistema ejecuta el mantenimiento cuando alguien usa la app.
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    $token = (string) Config::get('cron_token');
    if ($token === '' || !hash_equals($token, (string) ($_GET['token'] ?? ''))) {
        http_response_code(403);
        exit('forbidden');
    }
    header('Content-Type: text/plain; charset=utf-8');
}
if (!Config::installed()) {
    exit("not installed\n");
}
Db::pdo();
$m = Bookings::maintenance();
$p = Push::flush();
echo json_encode($m + ['push_sent' => $p['sent'], 'push_failed' => $p['failed']]), "\n";
