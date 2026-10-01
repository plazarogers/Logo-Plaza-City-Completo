<?php
// Instalador de un solo uso. Genera app/config.php (llaves VAPID, token de cron,
// hash de la llave del dueño, nombre aleatorio de la base de datos) y crea la BD.
// Cuando app/config.php existe, este archivo se niega a correr de nuevo.
//
// CLI: php install.php --owner-key="..." --base-url="https://plazacity.net/booking" --email="admin@plazacity.net" [--db-path=/ruta/fuera/de/public_html/db.sqlite]
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

function checks(): array
{
    $dataDir = PCB_APP . '/data';
    $ec = false;
    if (function_exists('openssl_pkey_new')) {
        $k = @openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $ec = $k !== false && function_exists('openssl_pkey_derive');
    }
    return [
        'PHP 8.0 o superior (' . PHP_VERSION . ')' => version_compare(PHP_VERSION, '8.0.0', '>='),
        'Extensión pdo_sqlite (base de datos)' => extension_loaded('pdo_sqlite'),
        'OpenSSL con curvas P-256 (notificaciones push)' => $ec,
        'hash_hkdf (notificaciones push)' => function_exists('hash_hkdf'),
        'cURL o allow_url_fopen (envío de push)' => function_exists('curl_init') || ini_get('allow_url_fopen'),
        'Carpeta app/ con permiso de escritura' => is_writable(PCB_APP),
        'Carpeta app/data con permiso de escritura' => is_dir($dataDir) ? is_writable($dataDir) : is_writable(PCB_APP),
    ];
}

function install(string $ownerKey, string $baseUrl, string $email, ?string $dbPath): array
{
    if (Config::installed()) {
        throw new RuntimeException('Ya está instalado (existe app/config.php).');
    }
    if (strlen($ownerKey) < 12) {
        throw new RuntimeException('La llave del dueño debe tener al menos 12 caracteres.');
    }
    if (!filter_var($baseUrl, FILTER_VALIDATE_URL)) {
        throw new RuntimeException('URL inválida.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Correo inválido.');
    }
    $vapid = WebPush::generateVapidKeys();
    $cfg = [
        'base_url' => rtrim($baseUrl, '/'),
        'db_path' => $dbPath ?: PCB_APP . '/data/pcb-' . bin2hex(random_bytes(8)) . '.sqlite',
        'owner_key_hash' => password_hash($ownerKey, PASSWORD_DEFAULT),
        'cron_token' => bin2hex(random_bytes(20)),
        'vapid' => $vapid + ['subject' => 'mailto:' . $email],
        'rules' => Config::defaults()['rules'],
    ];
    Config::set($cfg);
    @chmod(dirname($cfg['db_path']), 0700);
    Db::connect($cfg['db_path']);
    $php = "<?php\n// Generado por install.php el " . gmdate('Y-m-d H:i') . " UTC. NO compartir: contiene secretos.\n"
        . "// Puedes ajustar 'rules'. Ver config.sample.php.\nreturn " . var_export($cfg, true) . ";\n";
    if (file_put_contents(Config::file(), $php, LOCK_EX) === false) {
        throw new RuntimeException('No se pudo escribir app/config.php. Revisa permisos.');
    }
    @chmod(Config::file(), 0600);
    return $cfg;
}

if (PHP_SAPI === 'cli') {
    $o = getopt('', ['owner-key:', 'base-url:', 'email:', 'db-path::']);
    try {
        $cfg = install((string) ($o['owner-key'] ?? ''), (string) ($o['base-url'] ?? ''), (string) ($o['email'] ?? ''), $o['db-path'] ?? null);
        echo "Instalado.\n  URL: {$cfg['base_url']}/\n  Admin: {$cfg['base_url']}/#/admin\n  Cron: php " . __DIR__ . "/cron.php\n  Cron por URL: {$cfg['base_url']}/cron.php?token={$cfg['cron_token']}\n";
    } catch (Throwable $e) {
        fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
        exit(1);
    }
    exit(0);
}

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');
header('Cache-Control: private, no-cache, no-store, must-revalidate');
$h = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$scheme = Auth::isHttps() ? 'https' : 'http';
$guessUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'plazacity.net') . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/booking/install.php'), '/');
$error = null;
$done = null;
$checks = checks();
$allOk = !in_array(false, $checks, true);

if (Config::installed()) {
    $done = 'already';
} elseif (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && $allOk) {
    try {
        if (($_POST['owner_key'] ?? '') !== ($_POST['owner_key2'] ?? '')) {
            throw new RuntimeException('Las llaves no coinciden.');
        }
        $cfg = install((string) ($_POST['owner_key'] ?? ''), (string) ($_POST['base_url'] ?? ''), (string) ($_POST['email'] ?? ''), null);
        $done = $cfg;
        $exposed = Owner::dbExposed();
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}
?><!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Instalar · Plaza City Booking</title>
<link rel="stylesheet" href="css/theme.css"><link rel="stylesheet" href="css/app.css">
<style>body{padding-bottom:0}.page{margin:0 auto!important;max-width:640px!important}code{word-break:break-all;background:var(--pc-surface-2);padding:2px 6px;border-radius:4px}</style>
</head><body>
<header class="topbar"><a class="brand" href="./"><img class="logo" src="icons/plaza-city-logo-128.png" alt="" width="40" height="40"><div><b>PLAZA CITY</b><span>Instalación</span></div></a></header>
<main class="page">
<?php if ($done === 'already'): ?>
  <div class="card"><h1>Ya está instalado</h1><p>Este instalador está desactivado porque <code>app/config.php</code> ya existe. Por seguridad puedes borrar <code>install.php</code> del servidor.</p><a class="btn primary" href="./">Abrir la app</a></div>
<?php elseif (is_array($done)): ?>
  <div class="card"><h1>Instalación completa</h1>
  <div class="success">Llaves de notificaciones generadas y base de datos creada.</div>
  <?php if (($exposed ?? null) === true): ?><div class="error"><b>Atención:</b> el archivo de la base de datos se puede descargar desde internet en este servidor. Muévelo fuera de <code>public_html</code> y cambia <code>db_path</code> en <code>app/config.php</code> (ver la guía). En SiteGround: Site Tools → Speed → Caching → apaga "NGINX Direct Delivery" o mueve el archivo.</div>
  <?php elseif (($exposed ?? null) === false): ?><div class="success">Verificado: la base de datos no se puede descargar desde internet.</div><?php endif; ?>
  <ol class="stack">
    <li><b>Configura el cron</b> (SiteGround: Site Tools → Devs → Cron Jobs, cada 5 minutos · cPanel: Cron Jobs):<br><code>php <?= $h(__DIR__) ?>/cron.php &gt;/dev/null 2&gt;&amp;1</code><br>
      Si tu hosting no tiene cron, usa un servicio externo con esta URL:<br><code><?= $h($done['base_url']) ?>/cron.php?token=<?= $h($done['cron_token']) ?></code></li>
    <li><b>Genera la primera invitación</b> en <a href="./#/admin">Administración</a> con la llave que acabas de crear.</li>
    <li><b>Borra <code>install.php</code></b> del servidor (ya no se puede volver a ejecutar, pero no hace falta dejarlo).</li>
  </ol>
  <a class="btn primary" href="./#/admin">Ir a Administración</a></div>
<?php else: ?>
  <div class="card"><h1>Instalar Plaza City Booking</h1>
  <p class="muted">Este paso se hace una sola vez después de subir la carpeta <code>booking</code> al hosting.</p>
  <h2>Requisitos del servidor</h2>
  <div class="list"><?php foreach ($checks as $label => $ok): ?>
    <div class="item"><span class="chip <?= $ok ? 'free' : 'busy' ?>"><?= $ok ? 'OK' : 'FALTA' ?></span> <?= $h($label) ?></div>
  <?php endforeach; ?></div>
  <?php if (!$allOk): ?><div class="error">Pide a tu proveedor de hosting que active lo que falta (o cambia la versión de PHP a 8.2+ en SiteGround: Site Tools → Devs → PHP Manager · en cPanel: "Select PHP Version").</div><?php endif; ?>
  <?php if (!Auth::isHttps()): ?><div class="notice">Estás entrando por <b>http</b>. Activa el certificado SSL gratuito (SiteGround: Site Tools → Security → SSL Manager y luego HTTPS Enforce · cPanel: SSL/TLS Status → AutoSSL) y entra por <b>https</b>: las notificaciones push y el modo app solo funcionan con https.</div><?php endif; ?>
  <?php if ($error): ?><div class="error"><?= $h($error) ?></div><?php endif; ?>
  <form method="post" style="margin-top:14px">
    <label class="field"><span>URL pública de esta carpeta</span><input name="base_url" value="<?= $h($_POST['base_url'] ?? $guessUrl) ?>" required></label>
    <label class="field"><span>Correo de contacto (para los servicios de push)</span><input name="email" type="email" value="<?= $h($_POST['email'] ?? '') ?>" required></label>
    <label class="field"><span>Llave del dueño / administrador (mínimo 12 caracteres, guárdala bien)</span><input name="owner_key" type="password" minlength="12" required autocomplete="new-password"></label>
    <label class="field"><span>Repite la llave</span><input name="owner_key2" type="password" minlength="12" required autocomplete="new-password"></label>
    <button class="btn primary block" <?= $allOk ? '' : 'disabled' ?>>Instalar</button>
  </form></div>
<?php endif; ?>
</main></body></html>
