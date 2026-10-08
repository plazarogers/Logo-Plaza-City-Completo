<?php
// Pruebas automatizadas: php tests/run.php
declare(strict_types=1);
require __DIR__ . '/../booking/app/bootstrap.php';

$pass = 0;
$fail = 0;
function test(string $name, callable $fn): void
{
    global $pass, $fail;
    try {
        fresh();
        $fn();
        $pass++;
        echo "ok   - $name\n";
    } catch (Throwable $e) {
        $fail++;
        echo "FAIL - $name\n       " . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() . "\n";
    }
}
function eq($a, $b, string $msg = ''): void
{
    if ($a !== $b) {
        throw new Exception(($msg ? "$msg: " : '') . 'esperado ' . var_export($b, true) . ', obtenido ' . var_export($a, true));
    }
}
function throwsCode(callable $fn, string $code): void
{
    try {
        $fn();
    } catch (AppError $e) {
        eq($e->errCode, $code, 'código de error');
        return;
    }
    throw new Exception("se esperaba AppError($code)");
}
function fresh(): void
{
    $vapid = WebPush::generateVapidKeys();
    Config::set(['base_url' => 'https://plazacity.net/booking', 'db_path' => ':memory:', 'owner_key_hash' => password_hash('owner-key-123', PASSWORD_DEFAULT),
        'vapid' => $vapid + ['subject' => 'mailto:test@example.com']]);
    Db::reset();
    Db::connect(':memory:');
    // "Ahora" fijo: martes 6 de octubre de 2026, 07:00 en Chicago.
    Time::$fixedNow = new DateTimeImmutable('2026-10-06 07:00:00', new DateTimeZone('America/Chicago'));
}
function at(string $local): void
{
    Time::$fixedNow = new DateTimeImmutable($local, new DateTimeZone('America/Chicago'));
}
function user(string $email, array $extra = []): array
{
    Db::run('INSERT INTO users (email, name, company, password_hash, access_until) VALUES (?, ?, ?, ?, ?)',
        [$email, ucfirst(strtok($email, '@')), 'Acme', password_hash('password123', PASSWORD_DEFAULT), $extra['access_until'] ?? null]);
    return Db::one('SELECT * FROM users WHERE id = ?', [(int) Db::pdo()->lastInsertId()]);
}
function subscribe(int $userId): void
{
    Db::run("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, 'x', 'y')", [$userId, 'https://push.example/' . $userId]);
}

// ---------- festivos ----------
test('festivos federales 2026 (4 de julio observado el viernes 3)', function () {
    eq(array_column(Holidays::federal(2026), 'date'), ['2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25']);
});
test('festivos 2027: Navidad y Año Nuevo 2028 observados el viernes', function () {
    $d = array_column(Holidays::federal(2027), 'date');
    foreach (['2027-12-24', '2027-12-31', '2027-11-25', '2027-06-18', '2027-07-05'] as $x) {
        eq(in_array($x, $d, true), true, $x);
    }
    eq(in_array('2027-01-01', $d, true), true, 'Año Nuevo 2027 (viernes)');
});
test('festivos 2028 y 2030 se calculan solos', function () {
    $h = array_column(Holidays::federal(2028), 'date', 'name');
    eq($h['Martin Luther King Jr. Day'], '2028-01-17');
    eq($h['Memorial Day'], '2028-05-29');
    eq($h['Thanksgiving Day'], '2028-11-23');
    eq(Holidays::forDate('2030-09-02')['name'], 'Labor Day');
});

// ---------- horarios ----------
test('Conference Room: L-V 8-17 + especiales 17-21; sábado cerrado', function () {
    $st = Schedule::dayStatus('conference', '2026-10-05');
    eq(array_column($st['hours'], 'hour'), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    eq($st['hours'][9]['kind'], 'special');
    eq(Schedule::dayStatus('conference', '2026-10-10')['reason'], 'closed');
});
test('Atrium y Lounge: L-V 17-21, sábado 8-13', function () {
    foreach (['atrium', 'lounge'] as $s) {
        eq(array_column(Schedule::dayStatus($s, '2026-10-07')['hours'], 'hour'), [17, 18, 19, 20]);
        eq(array_column(Schedule::dayStatus($s, '2026-10-10')['hours'], 'hour'), [8, 9, 10, 11, 12]);
    }
});
test('domingo y festivo: uso libre, no se aparta', function () {
    eq(Schedule::dayStatus('atrium', '2026-10-11')['reason'], 'sunday');
    eq(Schedule::dayStatus('atrium', '2026-10-11')['freeUse'], true);
    eq(Schedule::dayStatus('conference', '2026-11-26')['reason'], 'holiday');
    $u = user('ana@x.com');
    throwsCode(fn () => Bookings::create($u, 'atrium', '2026-10-11', 9, 10), 'sunday');
    throwsCode(fn () => Bookings::create($u, 'conference', '2026-10-12', 9, 10), 'holiday'); // Columbus Day
});

// ---------- apartados ----------
test('apartar, ver en calendario y bitácora', function () {
    $u = user('ana@x.com');
    $b = Bookings::create($u, 'conference', '2026-10-06', 9, 11, 'Junta');
    eq($b['status'], 'active');
    eq($b['start_at'], '2026-10-06T14:00:00Z', 'UTC (CDT = UTC-5)');
    $v = Bookings::dayView('conference', '2026-10-06', (int) $u['id']);
    eq($v['hours'][1]['booking']['mine'], true);
    eq($v['hours'][3]['booking'], null);
    eq(Bookings::activity()[0]['type'], 'booked');
});
test('horario de invierno (CST) se convierte bien a UTC', function () {
    at('2026-12-01 07:00');
    $b = Bookings::create(user('ana@x.com'), 'conference', '2026-12-01', 9, 10);
    eq($b['start_at'], '2026-12-01T15:00:00Z');
});
test('doble reserva imposible (traslape parcial) y rollback completo', function () {
    $a = user('ana@x.com');
    $b = user('beto@x.com');
    Bookings::create($a, 'conference', '2026-10-06', 9, 11);
    throwsCode(fn () => Bookings::create($b, 'conference', '2026-10-06', 10, 12), 'conflict');
    eq((int) Db::value('SELECT COUNT(*) FROM bookings'), 1);
    eq((int) Db::value('SELECT COUNT(*) FROM booking_slots'), 2);
    eq(Bookings::create($b, 'atrium', '2026-10-06', 17, 18)['status'], 'active', 'otro espacio sí');
});
test('reglas: fuera de horario, duración, pasado, anticipación, cuota, máximo activos', function () {
    $u = user('ana@x.com');
    throwsCode(fn () => Bookings::create($u, 'conference', '2026-10-06', 6, 7), 'outside_hours');
    throwsCode(fn () => Bookings::create($u, 'conference', '2026-10-06', 8, 13), 'too_long');
    throwsCode(fn () => Bookings::create($u, 'conference', '2026-10-05', 9, 10), 'past');
    throwsCode(fn () => Bookings::create($u, 'conference', '2026-11-30', 9, 10), 'too_far');
    Bookings::create($u, 'conference', '2026-10-07', 8, 11);
    throwsCode(fn () => Bookings::create($u, 'conference', '2026-10-07', 13, 15), 'quota');
    eq(Bookings::create($u, 'conference', '2026-10-07', 13, 14)['status'], 'active');
    throwsCode(fn () => Bookings::create($u, 'conference', '2026-10-06', 9, 10.5), 'bad_hours');
});
test('la hora en curso sí se puede apartar (y cuenta como check-in)', function () {
    at('2026-10-06 09:20');
    $b = Bookings::create(user('ana@x.com'), 'conference', '2026-10-06', 9, 10);
    eq($b['checked_in_at'] !== null, true);
    throwsCode(fn () => Bookings::create(user('beto@x.com'), 'conference', '2026-10-06', 8, 9), 'past');
});
test('fin de contrato limita las fechas que se pueden apartar', function () {
    $u = user('ana@x.com', ['access_until' => '2026-10-08']);
    throwsCode(fn () => Bookings::create($u, 'conference', '2026-10-09', 9, 10), 'access_ends');
    eq(Bookings::create($u, 'conference', '2026-10-08', 9, 10)['status'], 'active');
});
test('solo quien apartó cancela; cancelar libera y notifica a los demás', function () {
    $a = user('ana@x.com');
    $b = user('beto@x.com');
    subscribe((int) $a['id']);
    subscribe((int) $b['id']);
    $bk = Bookings::create($a, 'lounge', '2026-10-06', 18, 20);
    eq((int) Db::value('SELECT COUNT(*) FROM push_outbox WHERE user_id = ?', [$b['id']]), 1, 'Beto notificado al apartar');
    eq((int) Db::value('SELECT COUNT(*) FROM push_outbox WHERE user_id = ?', [$a['id']]), 0, 'Ana no se notifica a sí misma');
    throwsCode(fn () => Bookings::cancel((int) $b['id'], (int) $bk['id']), 'forbidden_cancel');
    eq(Bookings::cancel((int) $a['id'], (int) $bk['id'])['status'], 'cancelled');
    eq((int) Db::value('SELECT COUNT(*) FROM booking_slots'), 0);
    eq((int) Db::value('SELECT COUNT(*) FROM push_outbox WHERE user_id = ?', [$b['id']]), 2, 'Beto notificado al cancelar');
    $payload = json_decode(Db::value('SELECT payload FROM push_outbox WHERE user_id = ? ORDER BY id DESC', [$b['id']]), true);
    eq(str_contains($payload['title'], 'Lounge'), true);
    eq(str_contains($payload['body'], 'Ana'), true, 'dice quién');
    eq(Bookings::create($b, 'lounge', '2026-10-06', 18, 19)['status'], 'active');
});
test('check-in: ventana, recordatorio y liberación automática por no-show', function () {
    $a = user('ana@x.com');
    $b = user('beto@x.com');
    subscribe((int) $a['id']);
    subscribe((int) $b['id']);
    $bk = Bookings::create($a, 'conference', '2026-10-06', 9, 10);
    throwsCode(fn () => Bookings::checkIn((int) $a['id'], (int) $bk['id']), 'too_early');
    at('2026-10-06 08:46');
    eq(Bookings::maintenance()['reminded'], 1, 'recordatorio 15 min antes');
    eq(Bookings::maintenance()['reminded'], 0, 'solo una vez');
    at('2026-10-06 09:16');
    throwsCode(fn () => Bookings::checkIn((int) $a['id'], (int) $bk['id']), 'too_late');
    $r = Bookings::maintenance();
    eq($r['released'], 1);
    $row = Db::one('SELECT status, released_reason FROM bookings WHERE id = ?', [$bk['id']]);
    eq([$row['status'], $row['released_reason']], ['released', 'no_show']);
    eq((int) Db::value('SELECT COUNT(*) FROM booking_slots'), 0, 'espacio libre');
    eq(Bookings::activity()[0]['type'], 'released');
    eq(Bookings::create($b, 'conference', '2026-10-06', 9, 10)['status'], 'active', 'otro puede tomarlo');
});
test('con check-in a tiempo no se libera; al terminar queda completado', function () {
    $a = user('ana@x.com');
    $bk = Bookings::create($a, 'conference', '2026-10-06', 9, 10);
    at('2026-10-06 08:50');
    eq(Bookings::checkIn((int) $a['id'], (int) $bk['id'])['checked_in_at'] !== null, true);
    at('2026-10-06 09:40');
    eq(Bookings::maintenance()['released'], 0);
    at('2026-10-06 10:01');
    eq(Bookings::maintenance()['completed'], 1);
});
test('terminar antes conserva la hora en curso y libera las siguientes', function () {
    $a = user('ana@x.com');
    $bk = Bookings::create($a, 'conference', '2026-10-06', 9, 12);
    at('2026-10-06 09:05');
    Bookings::checkIn((int) $a['id'], (int) $bk['id']);
    at('2026-10-06 09:30');
    eq(Bookings::cancel((int) $a['id'], (int) $bk['id'])['released_reason'], 'ended_early');
    eq((int) Db::value('SELECT COUNT(*) FROM booking_slots'), 1);
    eq(Bookings::create(user('beto@x.com'), 'conference', '2026-10-06', 10, 12)['status'], 'active');
});
test('límite de cancelación (lock-in) configurable', function () {
    $cfg = Config::all();
    $cfg['rules']['cancel_lock_in_minutes'] = 60;
    Config::set($cfg);
    $a = user('ana@x.com');
    $bk = Bookings::create($a, 'conference', '2026-10-06', 9, 10);
    at('2026-10-06 08:30');
    throwsCode(fn () => Bookings::cancel((int) $a['id'], (int) $bk['id']), 'locked_in');
});

// ---------- invitaciones y usuarios ----------
test('invitaciones: usos, revocación, expiración y fin de contrato', function () {
    $inv = Invites::create('Suite 1', 1, 7, '2027-03-31');
    eq($inv['status'], 'active');
    eq(str_contains($inv['url'], '/booking/#/registro?invite='), true);
    $_SERVER['REMOTE_ADDR'] = '10.0.0.1';
    $u = Auth::register(['token' => $inv['token'], 'name' => 'Ana López', 'email' => 'ANA@x.com', 'password' => 'password123']);
    eq($u['email'], 'ana@x.com');
    eq($u['access_until'], '2027-03-31');
    eq(Invites::findByToken($inv['token'])['status'], 'used');
    throwsCode(fn () => Auth::register(['token' => $inv['token'], 'name' => 'X Y', 'email' => 'x@x.com', 'password' => 'password123']), 'invalid_invite');
    $inv2 = Invites::create('', 5);
    Invites::revoke((int) $inv2['id']);
    eq(Invites::findByToken($inv2['token'])['status'], 'revoked');
    $inv3 = Invites::create('', 1, 1);
    at('2026-10-08 07:00');
    eq(Invites::findByToken($inv3['token'])['status'], 'expired');
});
test('correo duplicado no consume la invitación', function () {
    user('ana@x.com');
    $inv = Invites::create('', 1);
    throwsCode(fn () => Auth::register(['token' => $inv['token'], 'name' => 'Ana', 'email' => 'ana@x.com', 'password' => 'password123']), 'email_taken');
    eq(Invites::findByToken($inv['token'])['status'], 'active');
});
test('login, sesión y contraseña incorrecta', function () {
    $_SERVER['REMOTE_ADDR'] = '10.0.0.2';
    user('ana@x.com');
    throwsCode(fn () => Auth::login('ana@x.com', 'nope-nope'), 'bad_credentials');
    $u = Auth::login('ANA@x.com', 'password123');
    $token = Auth::createSession((int) $u['id']);
    eq((int) Auth::user($token)['id'], (int) $u['id']);
    eq(Auth::user('bogus'), null);
});
test('limitador de intentos de login', function () {
    $_SERVER['REMOTE_ADDR'] = '10.0.0.3';
    user('ana@x.com');
    for ($i = 0; $i < 10; $i++) {
        try { Auth::login('ana@x.com', 'wrong-pass'); } catch (AppError $e) {}
    }
    throwsCode(fn () => Auth::login('ana@x.com', 'password123'), 'rate_limited');
});
test('baja de usuario: sin acceso y apartados futuros cancelados', function () {
    $a = user('ana@x.com');
    $bk = Bookings::create($a, 'conference', '2026-10-07', 9, 10);
    $token = Auth::createSession((int) $a['id']);
    Owner::disableUser((int) $a['id']);
    eq(Auth::user($token), null);
    eq(Db::value('SELECT status FROM bookings WHERE id = ?', [$bk['id']]), 'cancelled');
    $_SERVER['REMOTE_ADDR'] = '10.0.0.4';
    throwsCode(fn () => Auth::login('ana@x.com', 'password123'), 'account_disabled');
    Owner::enableUser((int) $a['id'], null);
    eq(Auth::login('ana@x.com', 'password123')['email'], 'ana@x.com');
});
test('fin de contrato desactiva la cuenta automáticamente', function () {
    $a = user('ana@x.com', ['access_until' => '2026-10-06']);
    Bookings::create($a, 'conference', '2026-10-06', 15, 16);
    at('2026-10-07 00:05');
    eq(Bookings::maintenance()['expired_users'], 1);
    eq(Db::value('SELECT disabled_at IS NOT NULL FROM users WHERE id = ?', [$a['id']]), 1);
});
test('link para restablecer contraseña: un solo uso', function () {
    $_SERVER['REMOTE_ADDR'] = '10.0.0.5';
    $a = user('ana@x.com');
    $t = Auth::createResetToken((int) $a['id']);
    Auth::resetPassword($t, 'nueva-clave-123');
    eq(Auth::login('ana@x.com', 'nueva-clave-123')['email'], 'ana@x.com');
    throwsCode(fn () => Auth::resetPassword($t, 'otra-clave-123'), 'invalid_reset');
});

// ---------- cierres del edificio ----------
test('cierre cancela apartados afectados, avisa y bloquea nuevos', function () {
    $a = user('ana@x.com');
    $b = user('beto@x.com');
    subscribe((int) $a['id']);
    $bk = Bookings::create($a, 'conference', '2026-10-08', 9, 10);
    Bookings::create($b, 'atrium', '2026-10-08', 17, 18);
    Db::run('DELETE FROM push_outbox');
    $r = Owner::addClosure('2026-10-08', 'conference', 'closed', 'Mantenimiento');
    eq($r['cancelled'], 1);
    eq(Db::value('SELECT released_reason FROM bookings WHERE id = ?', [$bk['id']]), 'closure');
    eq((int) Db::value('SELECT COUNT(*) FROM push_outbox WHERE user_id = ?', [$a['id']]), 1, 'Ana avisada');
    throwsCode(fn () => Bookings::create($b, 'conference', '2026-10-08', 11, 12), 'closure');
    eq(Schedule::dayStatus('atrium', '2026-10-08')['open'], true, 'otros espacios siguen');
    Owner::addClosure('2026-10-09', null, 'free_use', 'Evento');
    eq(Schedule::dayStatus('lounge', '2026-10-09')['reason'], 'closure_free');
    throwsCode(fn () => Owner::addClosure('2026-10-01', null, 'closed', ''), 'past_date');
});
test('estadísticas y exportación CSV', function () {
    $a = user('ana@x.com');
    Bookings::create($a, 'conference', '2026-10-06', 9, 11);
    $s = Owner::stats(30);
    eq($s['spaces'][0]['hours'], 2);
    eq(str_contains(Owner::csv(), 'ana@x.com'), true);
    Db::run("UPDATE users SET company = '=HYPERLINK(1)' WHERE id = ?", [$a['id']]);
    eq(str_contains(Owner::csv(), "'=HYPERLINK"), true, 'fórmula neutralizada');
});

// ---------- Solicitudes de espacio ----------
function checkedInBooking(array $u): array
{
    // Apartado de 9 a 11 con check-in hecho a las 8:50.
    $b = Bookings::create($u, 'conference', '2026-10-06', 9, 11);
    at('2026-10-06 08:50');
    Bookings::checkIn((int) $u['id'], (int) $b['id']);
    return $b;
}
test('solicitud: no antes de los 15 min de gracia, no a uno mismo, sí después', function () {
    $ana = user('ana@x.com'); $beto = user('beto@x.com');
    $b = checkedInBooking($ana);
    at('2026-10-06 09:10');
    throwsCode(fn () => Requests::create($beto, (int) $b['id']), 'request_too_early');
    at('2026-10-06 09:20');
    throwsCode(fn () => Requests::create($ana, (int) $b['id']), 'request_own');
    subscribe((int) $ana['id']);
    Db::run('DELETE FROM push_outbox');
    $r = Requests::create($beto, (int) $b['id']);
    eq($r['status'], 'pending');
    eq($r['seconds_left'], 180, '3 minutos para responder');
    $push = json_decode(Db::value('SELECT payload FROM push_outbox WHERE user_id = ?', [$ana['id']]), true);
    eq($push['requireInteraction'], true, 'push urgente');
    eq(count($push['actions']), 2, 'botones Liberar / Lo estoy usando');
    eq($push['_ttl'], 180);
});
test('solicitud: el dueño libera, las horas restantes quedan con prioridad para quien pidió', function () {
    $ana = user('ana@x.com'); $beto = user('beto@x.com'); $carla = user('carla@x.com');
    $b = checkedInBooking($ana);
    at('2026-10-06 09:30');
    $r = Requests::create($beto, (int) $b['id']);
    throwsCode(fn () => Requests::create($carla, (int) $b['id']), 'request_pending');
    throwsCode(fn () => Requests::respond((int) $beto['id'], (int) $r['id'], 'release'), 'not_found');
    eq(Requests::respond((int) $ana['id'], (int) $r['id'], 'release')['status'], 'released');
    $row = Db::one('SELECT status, released_reason FROM bookings WHERE id = ?', [$b['id']]);
    eq([$row['status'], $row['released_reason']], ['released', 'request']);
    eq((int) Db::value('SELECT COUNT(*) FROM booking_slots'), 0, 'se liberan la hora en curso y la siguiente');
    throwsCode(fn () => Bookings::create($carla, 'conference', '2026-10-06', 9, 10), 'held_for_requester');
    eq(Bookings::create($beto, 'conference', '2026-10-06', 9, 11)['status'], 'active', 'quien pidió puede apartar');
    eq(Bookings::activity()[1]['type'], 'request_released');
});
test('solicitud: sin respuesta en 3 minutos se libera sola y se avisa a ambos', function () {
    $ana = user('ana@x.com'); $beto = user('beto@x.com');
    subscribe((int) $ana['id']); subscribe((int) $beto['id']);
    $b = checkedInBooking($ana);
    at('2026-10-06 09:40');
    $r = Requests::create($beto, (int) $b['id']);
    at('2026-10-06 09:42:59');
    eq(Requests::expireDue(), 0, 'aún dentro de los 3 minutos');
    at('2026-10-06 09:43:01');
    Db::run('DELETE FROM push_outbox');
    eq(Requests::forUser((int) $r['id'], (int) $beto['id'])['status'], 'expired');
    eq(Db::value('SELECT released_reason FROM bookings WHERE id = ?', [$b['id']]), 'request_timeout');
    eq((int) Db::value('SELECT COUNT(*) FROM push_outbox WHERE user_id = ?', [$beto['id']]), 1, 'aviso a quien pidió');
    eq((int) Db::value('SELECT COUNT(*) FROM push_outbox WHERE user_id = ?', [$ana['id']]), 1, 'aviso al dueño');
    throwsCode(fn () => Requests::respond((int) $ana['id'], (int) $r['id'], 'keep'), 'request_closed');
});
test('solicitud: "lo estoy usando" mantiene el apartado y no se puede volver a pedir', function () {
    $ana = user('ana@x.com'); $beto = user('beto@x.com'); $carla = user('carla@x.com');
    $b = checkedInBooking($ana);
    at('2026-10-06 09:20');
    $r = Requests::create($beto, (int) $b['id']);
    eq(Requests::respond((int) $ana['id'], (int) $r['id'], 'keep')['status'], 'declined');
    eq(Db::value('SELECT status FROM bookings WHERE id = ?', [$b['id']]), 'active');
    throwsCode(fn () => Requests::create($beto, (int) $b['id']), 'request_already');
    eq(Requests::create($carla, (int) $b['id'])['status'], 'pending', 'otra persona sí puede pedir');
});
test('solicitud: la prioridad vence a los 5 minutos', function () {
    $ana = user('ana@x.com'); $beto = user('beto@x.com'); $carla = user('carla@x.com');
    $b = checkedInBooking($ana);
    at('2026-10-06 09:20');
    $r = Requests::create($beto, (int) $b['id']);
    Requests::respond((int) $ana['id'], (int) $r['id'], 'release');
    at('2026-10-06 09:25:30');
    eq(Bookings::create($carla, 'conference', '2026-10-06', 9, 10)['status'], 'active');
});
test('solicitud: el calendario indica cuándo se puede pedir y la prioridad', function () {
    $ana = user('ana@x.com'); $beto = user('beto@x.com');
    $b = checkedInBooking($ana);
    at('2026-10-06 09:05');
    eq(Bookings::dayView('conference', '2026-10-06', (int) $beto['id'])['hours'][1]['booking']['requestable'], false);
    at('2026-10-06 09:16');
    $v = Bookings::dayView('conference', '2026-10-06', (int) $beto['id']);
    eq($v['hours'][1]['booking']['requestable'], true);
    eq(Bookings::dayView('conference', '2026-10-06', (int) $ana['id'])['hours'][1]['booking']['requestable'], false, 'el dueño no ve el botón');
    $r = Requests::create($beto, (int) $b['id']);
    Requests::respond((int) $ana['id'], (int) $r['id'], 'release');
    $v = Bookings::dayView('conference', '2026-10-06', (int) $beto['id']);
    eq($v['hours'][1]['hold']['mine'], true);
    eq(Bookings::dayView('conference', '2026-10-06', (int) $ana['id'])['hours'][1]['hold']['name'], 'Beto');
});

// ---------- Web Push ----------
test('Web Push: cifrado aes128gcm descifrable por el receptor (RFC 8291)', function () {
    $ua = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    $uaPub = WebPush::rawPublicKey($ua);
    $auth = random_bytes(16);
    $msg = json_encode(['title' => 'Conference Room apartado', 'body' => 'mar 6 oct · 09:00–11:00 · Ana (Acme)']);
    $body = WebPush::encrypt($msg, WebPush::b64u($uaPub), WebPush::b64u($auth));
    // Descifrado como lo haría el navegador
    $salt = substr($body, 0, 16);
    eq(unpack('N', substr($body, 16, 4))[1], 4096);
    eq(ord($body[20]), 65);
    $asPub = substr($body, 21, 65);
    $ct = substr($body, 86);
    $shared = openssl_pkey_derive(WebPush::publicKeyFromRaw($asPub), $ua, 32);
    $ikm = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPub . $asPub, $auth);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
    $pt = openssl_decrypt(substr($ct, 0, -16), 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, substr($ct, -16));
    eq($pt, $msg . "\x02");
});
test('Web Push: JWT VAPID ES256 verificable', function () {
    $v = Config::get('vapid');
    $h = WebPush::vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', $v);
    eq((bool) preg_match('/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/', $h, $m), true);
    $claims = json_decode(WebPush::b64uDecode($m[2]), true);
    eq($claims['aud'], 'https://fcm.googleapis.com');
    eq($m[4], $v['public_key']);
    $raw = WebPush::b64uDecode($m[3]);
    eq(strlen($raw), 64);
    // r||s -> DER para verificar con OpenSSL
    $int = function ($x) { $x = ltrim($x, "\0"); if (ord($x[0]) & 0x80) { $x = "\0" . $x; } return "\x02" . chr(strlen($x)) . $x; };
    $seq = $int(substr($raw, 0, 32)) . $int(substr($raw, 32));
    $der = "\x30" . chr(strlen($seq)) . $seq;
    $pub = WebPush::publicKeyFromRaw(WebPush::b64uDecode($v['public_key']));
    eq(openssl_verify($m[1] . '.' . $m[2], $der, $pub, OPENSSL_ALGO_SHA256), 1);
});
test('suscripciones inválidas se rechazan', function () {
    $a = user('ana@x.com');
    throwsCode(fn () => Push::save((int) $a['id'], ['endpoint' => 'http://insecure', 'keys' => ['p256dh' => 'a', 'auth' => 'b']]), 'bad_subscription');
    $ua = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    $keys = ['p256dh' => WebPush::b64u(WebPush::rawPublicKey($ua)), 'auth' => WebPush::b64u(random_bytes(16))];
    throwsCode(fn () => Push::save((int) $a['id'], ['endpoint' => 'https://intranet.local/x', 'keys' => $keys]), 'bad_subscription');
    throwsCode(fn () => Push::save((int) $a['id'], ['endpoint' => 'https://evilfcm.googleapis.com.attacker.io/x', 'keys' => $keys]), 'bad_subscription');
    foreach (['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QG', 'https://wns2-by3p.notify.windows.com/w/?token=x'] as $ep) {
        Push::save((int) $a['id'], ['endpoint' => $ep, 'keys' => $keys]);
    }
    eq((int) Db::value('SELECT COUNT(*) FROM push_subscriptions'), 4);
});

test('cambiar la llave de administración reescribe config.php', function () {
    $dir = sys_get_temp_dir() . '/pcb-key-' . bin2hex(random_bytes(4));
    mkdir($dir . '/data', 0700, true);
    Config::$fileOverride = $dir . '/config.php';
    try {
        $cfg = ['base_url' => 'https://plazacity.net/booking', 'owner_key_hash' => password_hash('vieja-llave-123', PASSWORD_DEFAULT), 'cron_token' => 'abc', 'rules' => ['max_hours_per_booking' => 3]];
        file_put_contents(Config::file(), '<?php return ' . var_export($cfg, true) . ';');
        throwsCode(fn () => Owner::setKey('corta'), 'key_short');
        Owner::setKey("  ABCDE-FGHJK-MNPQR-STUVW \n");
        $new = require Config::file();
        eq(password_verify('ABCDE-FGHJK-MNPQR-STUVW', $new['owner_key_hash']), true, 'llave nueva, sin espacios');
        eq(password_verify('vieja-llave-123', $new['owner_key_hash']), false, 'la vieja deja de servir');
        eq($new['cron_token'], 'abc', 'conserva el resto');
        eq($new['rules'], ['max_hours_per_booking' => 3], 'conserva reglas tal cual');
        eq(substr(sprintf('%o', fileperms(Config::file())), -3), '600', 'permisos 600');
        $_SERVER['HTTP_X_OWNER_KEY'] = ' ABCDE-FGHJK-MNPQR-STUVW ';
        Auth::requireOwner();
        // Recuperación: sin archivo no se puede; con archivo se puede una vez y el archivo se borra.
        throwsCode(fn () => Owner::resetKey('XXXXX-YYYYY-ZZZZZ-22222'), 'reset_not_pending');
        touch($dir . '/data/reset-llave', time() - 2 * 3600);
        eq(Owner::resetFile(), null, 'archivo viejo (más de 1 h) no cuenta');
        touch($dir . '/data/reset-llave');
        Owner::resetKey('XXXXX-YYYYY-ZZZZZ-22222');
        eq(is_file($dir . '/data/reset-llave'), false, 'el archivo se borra solo');
        eq(password_verify('XXXXX-YYYYY-ZZZZZ-22222', (require Config::file())['owner_key_hash']), true);
        throwsCode(fn () => Owner::resetKey('otra-llave-12345'), 'reset_not_pending');
    } finally {
        Config::$fileOverride = null;
        unset($_SERVER['HTTP_X_OWNER_KEY']);
        array_map('unlink', glob($dir . '/data/*') ?: []);
        @unlink($dir . '/config.php'); @rmdir($dir . '/data'); @rmdir($dir);
    }
});

echo "\n$pass pasaron, $fail fallaron\n";
exit($fail ? 1 : 0);
