<?php
declare(strict_types=1);

/**
 * Usuarios y sesiones. Contraseñas con password_hash (bcrypt/argon2).
 * La cookie lleva un token aleatorio; en la BD solo se guarda su SHA-256.
 */
final class Auth
{
    public const COOKIE = 'pcb_session';
    private static ?array $user = null;
    private static ?string $tokenHash = null;

    public static function hashToken(string $t): string
    {
        return hash('sha256', $t);
    }

    public static function isHttps(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
            || (($_SERVER['SERVER_PORT'] ?? '') === '443');
    }

    public static function publicUser(array $u): array
    {
        return [
            'id' => (int) $u['id'], 'email' => $u['email'], 'name' => $u['name'], 'company' => $u['company'],
            'suite' => $u['suite'], 'lang' => $u['lang'], 'access_until' => $u['access_until'],
        ];
    }

    public static function isActive(array $u): bool
    {
        if (!empty($u['disabled_at'])) {
            return false;
        }
        return empty($u['access_until']) || $u['access_until'] >= Time::today();
    }

    public static function createSession(int $userId): string
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $expires = Time::now()->modify('+' . Config::rule('session_days') . ' days');
        Db::run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [self::hashToken($token), $userId, Time::iso($expires)]);
        if (PHP_SAPI !== 'cli') {
            setcookie(self::COOKIE, $token, [
                'expires' => $expires->getTimestamp(),
                'path' => Config::basePath(),
                'secure' => self::isHttps(),
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        return $token;
    }

    public static function logout(): void
    {
        if (self::$tokenHash) {
            Db::run('DELETE FROM sessions WHERE token_hash = ?', [self::$tokenHash]);
        }
        if (PHP_SAPI !== 'cli') {
            setcookie(self::COOKIE, '', ['expires' => time() - 3600, 'path' => Config::basePath(), 'secure' => self::isHttps(), 'httponly' => true, 'samesite' => 'Lax']);
        }
        self::$user = null;
    }

    /** Usuario de la sesión actual (o null). */
    public static function user(?string $token = null): ?array
    {
        if (self::$user !== null && $token === null) {
            return self::$user;
        }
        $token ??= $_COOKIE[self::COOKIE] ?? null;
        if (!$token || !is_string($token) || strlen($token) > 200) {
            return null;
        }
        $hash = self::hashToken($token);
        $u = Db::one(
            'SELECT u.*, s.expires_at AS s_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
            [$hash]
        );
        if (!$u || $u['s_expires'] <= Time::nowIso() || !self::isActive($u)) {
            return null;
        }
        // last_seen como máximo una vez cada 10 minutos.
        if (!$u['last_seen_at'] || $u['last_seen_at'] < Time::iso(Time::now()->modify('-10 minutes'))) {
            Db::run('UPDATE users SET last_seen_at = ? WHERE id = ?', [Time::nowIso(), $u['id']]);
        }
        self::$tokenHash = $hash;
        return self::$user = $u;
    }

    public static function requireUser(): array
    {
        $u = self::user();
        if (!$u) {
            throw new AppError('auth_required', 401);
        }
        return $u;
    }

    /** Limitador de intentos persistente (sirve en hosting compartido sin memoria compartida). */
    public static function rateLimit(string $action, int $max, int $windowSec): void
    {
        $key = $action . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'cli');
        $now = time();
        $row = Db::one('SELECT count, reset_at FROM rate_limits WHERE key = ?', [$key]);
        if (!$row || $row['reset_at'] < $now) {
            Db::run('INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at', [$key, $now + $windowSec]);
            return;
        }
        if ($row['count'] >= $max) {
            throw new AppError('rate_limited', 429);
        }
        Db::run('UPDATE rate_limits SET count = count + 1 WHERE key = ?', [$key]);
    }

    public static function login(string $email, string $password): array
    {
        self::rateLimit('login', 10, 900);
        $u = Db::one('SELECT * FROM users WHERE email = ?', [mb_strtolower(trim($email))]);
        // Verificamos contra un hash ficticio si no existe para no revelar correos por tiempo de respuesta.
        $hash = $u['password_hash'] ?? '$2y$12$rMscVRJISSUicUTySMO3O.PXd/xDoNBLuLD0Ckq.XUiE5tDLBh8s.';
        if (!password_verify($password, $hash) || !$u) {
            throw new AppError('bad_credentials', 401);
        }
        if (!self::isActive($u)) {
            throw new AppError('account_disabled', 403);
        }
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
        }
        self::createSession((int) $u['id']);
        return $u;
    }

    public static function validateProfile(array $in, bool $requirePassword): array
    {
        $name = trim((string) ($in['name'] ?? ''));
        if (mb_strlen($name) < 2) {
            throw new AppError('bad_name');
        }
        $out = [
            'name' => mb_substr($name, 0, 80),
            'company' => mb_substr(trim((string) ($in['company'] ?? '')), 0, 80),
            'suite' => mb_substr(trim((string) ($in['suite'] ?? '')), 0, 40),
            'lang' => ($in['lang'] ?? 'es') === 'en' ? 'en' : 'es',
        ];
        if ($requirePassword) {
            $email = mb_strtolower(trim((string) ($in['email'] ?? '')));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) {
                throw new AppError('bad_email');
            }
            $pw = (string) ($in['password'] ?? '');
            if (strlen($pw) < 8 || strlen($pw) > 200) {
                throw new AppError('bad_password');
            }
            $out['email'] = $email;
            $out['password'] = $pw;
        }
        return $out;
    }

    public static function register(array $in): array
    {
        self::rateLimit('register', 20, 3600);
        $inv = Invites::findByToken((string) ($in['token'] ?? ''));
        if (!$inv || $inv['status'] !== 'active') {
            throw new AppError('invalid_invite', 410);
        }
        $p = self::validateProfile($in, true);
        $userId = Db::tx(function () use ($inv, $p) {
            if (!Invites::consume((int) $inv['id'])) {
                throw new AppError('invalid_invite', 410);
            }
            if (Db::value('SELECT 1 FROM users WHERE email = ?', [$p['email']])) {
                throw new AppError('email_taken', 409);
            }
            Db::run(
                'INSERT INTO users (email, name, company, suite, password_hash, lang, invite_id, access_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$p['email'], $p['name'], $p['company'], $p['suite'], password_hash($p['password'], PASSWORD_DEFAULT), $p['lang'], $inv['id'], $inv['access_until']]
            );
            $id = (int) Db::pdo()->lastInsertId();
            Bookings::log('registered', ['user_id' => $id]);
            return $id;
        });
        self::createSession($userId);
        return Db::one('SELECT * FROM users WHERE id = ?', [$userId]);
    }

    public static function changePassword(array $u, string $current, string $new): void
    {
        self::rateLimit('password', 10, 900);
        if (!password_verify($current, $u['password_hash'])) {
            throw new AppError('wrong_password', 400);
        }
        if (strlen($new) < 8 || strlen($new) > 200) {
            throw new AppError('bad_password');
        }
        Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        // Cierra las demás sesiones.
        Db::run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', [$u['id'], self::$tokenHash ?? '']);
    }

    /** Link de un solo uso (24 h) generado por el dueño. */
    public static function createResetToken(int $userId): string
    {
        $token = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
        Db::run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [Time::nowIso(), $userId]);
        Db::run('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [$userId, self::hashToken($token), Time::iso(Time::now()->modify('+24 hours'))]);
        return $token;
    }

    public static function resetPassword(string $token, string $new): array
    {
        self::rateLimit('reset', 10, 900);
        $row = Db::one('SELECT * FROM password_resets WHERE token_hash = ?', [self::hashToken($token)]);
        if (!$row || $row['used_at'] || $row['expires_at'] <= Time::nowIso()) {
            throw new AppError('invalid_reset', 410);
        }
        if (strlen($new) < 8 || strlen($new) > 200) {
            throw new AppError('bad_password');
        }
        $u = Db::one('SELECT * FROM users WHERE id = ?', [$row['user_id']]);
        if (!$u || !self::isActive($u)) {
            throw new AppError('account_disabled', 403);
        }
        Db::tx(function () use ($row, $new) {
            Db::run('UPDATE password_resets SET used_at = ? WHERE id = ?', [Time::nowIso(), $row['id']]);
            Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $row['user_id']]);
            Db::run('DELETE FROM sessions WHERE user_id = ?', [$row['user_id']]);
        });
        self::createSession((int) $row['user_id']);
        return $u;
    }

    /** Dueño/administrador: llave enviada en el header X-Owner-Key. */
    public static function requireOwner(): void
    {
        $hash = (string) Config::get('owner_key_hash');
        $key = (string) ($_SERVER['HTTP_X_OWNER_KEY'] ?? '');
        if ($hash === '' || $key === '' || !password_verify($key, $hash)) {
            self::rateLimit('owner', 10, 900);
            throw new AppError('owner_required', 403);
        }
    }
}
