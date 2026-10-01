<?php
// API REST de Plaza City Booking. Todas las rutas: api.php?r=<ruta>
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$route = trim((string) ($_GET['r'] ?? ''), '/');
$headerLang = substr((string) ($_SERVER['HTTP_X_LANG'] ?? ''), 0, 2);
Msg::$lang = $headerLang === 'en' ? 'en' : 'es';

/** Envía la respuesta y libera al cliente antes de las tareas en segundo plano. */
function respond(int $status, $data, ?string $raw = null, ?string $contentType = null, ?string $filename = null): void
{
    http_response_code($status);
    if ($contentType) {
        header('Content-Type: ' . $contentType);
    }
    if ($filename) {
        header('Content-Disposition: attachment; filename="' . $filename . '"');
    }
    $body = $raw ?? json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    header('Content-Length: ' . strlen($body));
    echo $body;
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } elseif (function_exists('litespeed_finish_request')) {
        litespeed_finish_request();
    } else {
        @ob_flush();
        @flush();
    }
    ignore_user_abort(true);
    try {
        Push::flush();
    } catch (Throwable $e) {
        error_log('[pcb push] ' . $e->getMessage());
    }
    exit;
}

function body(): array
{
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input') ?: '';
        if (strlen($raw) > 65536) {
            throw new AppError('server_error', 413);
        }
        $b = json_decode($raw, true);
        $b = is_array($b) ? $b : [];
    }
    return $b;
}

function q(string $k, string $default = ''): string
{
    $v = $_GET[$k] ?? $default;
    return is_string($v) ? $v : $default;
}

try {
    if (!Config::installed()) {
        throw new AppError('not_installed', 503);
    }
    // CSRF: toda escritura debe traer este header (un formulario de otro sitio no puede enviarlo).
    if ($method !== 'GET' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'plaza-booking') {
        throw new AppError('csrf', 403);
    }
    Db::pdo();
    Bookings::maybeMaintenance();
    $user = Auth::user();
    if ($user && !$headerLang) {
        Msg::$lang = $user['lang'];
    }
    $id = 0;
    if (preg_match('#^(bookings|owner/invites|owner/users|owner/closures)/(\d+)(/.*)?$#', $route, $m)) {
        $id = (int) $m[2];
        $route = $m[1] . '/:id' . ($m[3] ?? '');
    }
    $key = $method . ' ' . $route;

    switch ($key) {
        // ---------- público ----------
        case 'GET config':
            respond(200, [
                'version' => PCB_VERSION,
                'timezone' => Config::get('timezone'),
                'rules' => Config::rules(),
                'spaces' => Schedule::SPACES,
                'push' => ['enabled' => Push::enabled(), 'publicKey' => Push::enabled() ? Config::get('vapid')['public_key'] : null],
                'today' => Time::today(),
                'now' => Time::now()->format(DATE_ATOM),
                'user' => $user ? Auth::publicUser($user) : null,
                'pushSubscribed' => $user ? Push::hasSubscription((int) $user['id']) : false,
            ]);
        case 'GET invite':
            $inv = Invites::findByToken(q('token'));
            if (!$inv || $inv['status'] !== 'active') {
                throw new AppError('invalid_invite', 410);
            }
            respond(200, ['ok' => true, 'label' => $inv['label'], 'expires_at' => $inv['expires_at'], 'access_until' => $inv['access_until']]);
        case 'POST register':
            $u = Auth::register(body());
            respond(201, ['user' => Auth::publicUser($u)]);
        case 'POST login':
            $u = Auth::login((string) (body()['email'] ?? ''), (string) (body()['password'] ?? ''));
            respond(200, ['user' => Auth::publicUser($u)]);
        case 'POST logout':
            Auth::logout();
            respond(200, ['ok' => true]);
        case 'POST reset':
            $u = Auth::resetPassword((string) (body()['token'] ?? ''), (string) (body()['password'] ?? ''));
            respond(200, ['user' => Auth::publicUser($u)]);
        case 'GET holidays':
            $y = (int) q('year', Time::now()->format('Y'));
            if ($y < 2000 || $y > 2200) {
                throw new AppError('bad_date');
            }
            respond(200, ['year' => $y, 'federal' => Holidays::federal($y)]);

        // ---------- inquilinos ----------
        case 'POST me':
            $u = Auth::requireUser();
            $p = Auth::validateProfile(body() + ['name' => $u['name']], false);
            Db::run('UPDATE users SET name = ?, company = ?, suite = ?, lang = ? WHERE id = ?', [$p['name'], $p['company'], $p['suite'], $p['lang'], $u['id']]);
            respond(200, ['user' => Auth::publicUser(Db::one('SELECT * FROM users WHERE id = ?', [$u['id']]))]);
        case 'POST password':
            $u = Auth::requireUser();
            Auth::changePassword($u, (string) (body()['current'] ?? ''), (string) (body()['password'] ?? ''));
            respond(200, ['ok' => true]);
        case 'GET overview':
            Auth::requireUser();
            respond(200, ['days' => Bookings::overview(max(1, min(14, (int) q('days', '7'))))]);
        case 'GET week':
            $u = Auth::requireUser();
            $space = q('space');
            if (!Schedule::space($space)) {
                throw new AppError('unknown_space', 404);
            }
            $from = Time::isValidDate(q('from')) ? q('from') : Time::today();
            $days = [];
            for ($i = 0; $i < 7; $i++) {
                $days[] = Bookings::dayView($space, Time::addDays($from, $i), (int) $u['id']);
            }
            respond(200, ['space' => $space, 'from' => $from, 'days' => $days]);
        case 'GET day':
            $u = Auth::requireUser();
            if (!Schedule::space(q('space')) || !Time::isValidDate(q('date'))) {
                throw new AppError('bad_date');
            }
            respond(200, Bookings::dayView(q('space'), q('date'), (int) $u['id']));
        case 'POST bookings':
            $u = Auth::requireUser();
            Auth::rateLimit('book', 60, 3600);
            $b = body();
            $start = filter_var($b['startHour'] ?? null, FILTER_VALIDATE_INT);
            $end = filter_var($b['endHour'] ?? null, FILTER_VALIDATE_INT);
            $booking = Bookings::create($u, (string) ($b['space'] ?? ''), (string) ($b['date'] ?? ''), $start === false ? null : $start, $end === false ? null : $end, (string) ($b['note'] ?? ''));
            respond(201, ['booking' => $booking]);
        case 'GET bookings/mine':
            $u = Auth::requireUser();
            respond(200, ['bookings' => Bookings::mine((int) $u['id'])]);
        case 'POST bookings/:id/cancel':
            $u = Auth::requireUser();
            respond(200, ['booking' => Bookings::cancel((int) $u['id'], $id)]);
        case 'POST bookings/:id/release':
            $u = Auth::requireUser();
            respond(200, ['booking' => Bookings::endEarly((int) $u['id'], $id)]);
        case 'POST bookings/:id/checkin':
            $u = Auth::requireUser();
            respond(200, ['booking' => Bookings::checkIn((int) $u['id'], $id)]);
        case 'GET bookings/:id/ics':
            $u = Auth::requireUser();
            $b = Bookings::get($id);
            if (!$b || (int) $b['user_id'] !== (int) $u['id']) {
                throw new AppError('not_found', 404);
            }
            respond(200, null, Bookings::ics($b), 'text/calendar; charset=utf-8', 'plaza-city-' . $b['space_id'] . '-' . $b['date'] . '.ics');
        case 'GET activity':
            Auth::requireUser();
            $before = (int) q('before', '0');
            respond(200, ['items' => Bookings::activity((int) q('limit', '50'), $before ?: null)]);
        case 'POST push/subscribe':
            $u = Auth::requireUser();
            if (!Push::enabled()) {
                throw new AppError('push_disabled', 503);
            }
            Push::save((int) $u['id'], body()['subscription'] ?? null, (string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
            respond(200, ['ok' => true]);
        case 'POST push/unsubscribe':
            $u = Auth::requireUser();
            Push::remove((string) (body()['endpoint'] ?? ''), (int) $u['id']);
            respond(200, ['ok' => true]);
        case 'POST push/test':
            $u = Auth::requireUser();
            Auth::rateLimit('pushtest', 10, 3600);
            respond(200, Push::sendNow((int) $u['id'], ['title' => 'Plaza City', 'body' => Msg::$lang === 'en' ? 'Notifications work on this device.' : 'Las notificaciones funcionan en este dispositivo.', 'url' => '#/ajustes', 'tag' => 'test']));

        // ---------- dueño / administración ----------
        default:
            if (str_starts_with($route, 'owner/')) {
                Auth::requireOwner();
                switch ($key) {
                    case 'GET owner/check':
                        respond(200, ['ok' => true]);
                    case 'GET owner/invites':
                        respond(200, ['invites' => Invites::list()]);
                    case 'POST owner/invites':
                        $b = body();
                        respond(201, ['invite' => Invites::create((string) ($b['label'] ?? ''), (int) ($b['maxUses'] ?? 1), (int) ($b['days'] ?? Config::rule('invite_default_days')), ($b['accessUntil'] ?? '') ?: null)]);
                    case 'POST owner/invites/:id/revoke':
                        respond(200, ['ok' => Invites::revoke($id)]);
                    case 'GET owner/users':
                        respond(200, ['users' => Owner::users()]);
                    case 'POST owner/users/:id/disable':
                        Owner::disableUser($id);
                        respond(200, ['ok' => true]);
                    case 'POST owner/users/:id/enable':
                        Owner::enableUser($id, (body()['accessUntil'] ?? '') ?: null);
                        respond(200, ['ok' => true]);
                    case 'POST owner/users/:id/access':
                        Owner::setAccessUntil($id, (body()['accessUntil'] ?? '') ?: null);
                        respond(200, ['ok' => true]);
                    case 'POST owner/users/:id/reset':
                        if (!Db::one('SELECT 1 FROM users WHERE id = ?', [$id])) {
                            throw new AppError('not_found', 404);
                        }
                        $t = Auth::createResetToken($id);
                        respond(200, ['url' => rtrim((string) Config::get('base_url'), '/') . '/#/restablecer?token=' . rawurlencode($t)]);
                    case 'GET owner/closures':
                        respond(200, ['closures' => Owner::closures()]);
                    case 'POST owner/closures':
                        $b = body();
                        respond(201, Owner::addClosure((string) ($b['date'] ?? ''), ($b['space'] ?? '') ?: null, (string) ($b['kind'] ?? 'closed'), (string) ($b['reason'] ?? '')));
                    case 'POST owner/closures/:id/delete':
                        respond(200, ['ok' => Owner::deleteClosure($id)]);
                    case 'GET owner/stats':
                        respond(200, Owner::stats(max(7, min(365, (int) q('days', '30')))));
                    case 'GET owner/export':
                        respond(200, null, Owner::csv(), 'text/csv; charset=utf-8', 'plaza-city-apartados-' . Time::today() . '.csv');
                }
            }
            throw new AppError('unknown_route', 404);
    }
} catch (AppError $e) {
    respond($e->status, ['error' => $e->errCode, 'message' => Msg::t($e->errCode, $e->vars)]);
} catch (Throwable $e) {
    error_log('[pcb] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    respond(500, ['error' => 'server_error', 'message' => Msg::t('server_error')]);
}
