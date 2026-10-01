<?php
declare(strict_types=1);

final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            self::connect((string) Config::get('db_path'));
        }
        return self::$pdo;
    }

    public static function connect(string $path): PDO
    {
        if ($path !== ':memory:') {
            $dir = dirname($path);
            if (!is_dir($dir)) {
                @mkdir($dir, 0700, true);
            }
        }
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 10,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 10000');
        if ($path !== ':memory:') {
            $pdo->exec('PRAGMA journal_mode = WAL');
            // Solo el usuario de PHP puede leerla: si el servidor web (p. ej. NGINX en
            // SiteGround) entrega archivos estáticos con otro usuario, recibe 403.
            // SQLite crea los archivos -wal y -shm con estos mismos permisos.
            if (is_file($path) && (fileperms($path) & 0077) !== 0) {
                @chmod($path, 0600);
            }
        }
        self::$pdo = $pdo;
        self::migrate($pdo);
        return $pdo;
    }

    public static function reset(): void
    {
        self::$pdo = null;
    }

    /** Ejecuta $fn dentro de una transacción con bloqueo de escritura inmediato. */
    public static function tx(callable $fn)
    {
        $pdo = self::pdo();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $r = $fn($pdo);
            $pdo->exec('COMMIT');
            return $r;
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }
    }

    public static function one(string $sql, array $p = []): ?array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    public static function all(string $sql, array $p = []): array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st->fetchAll();
    }

    public static function run(string $sql, array $p = []): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st;
    }

    public static function value(string $sql, array $p = [])
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    private static function migrate(PDO $pdo): void
    {
        $now = "(strftime('%Y-%m-%dT%H:%M:%SZ','now'))";
        $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          name TEXT NOT NULL,
          company TEXT NOT NULL DEFAULT '',
          suite TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL,
          lang TEXT NOT NULL DEFAULT 'es',
          invite_id INTEGER,
          access_until TEXT,            -- 'YYYY-MM-DD' (fin de contrato) o NULL
          disabled_at TEXT,
          last_seen_at TEXT,
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE TABLE IF NOT EXISTS invites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL DEFAULT '',
          max_uses INTEGER NOT NULL DEFAULT 1,
          uses INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT NOT NULL,
          access_until TEXT,
          revoked_at TEXT,
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE TABLE IF NOT EXISTS password_resets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE TABLE IF NOT EXISTS bookings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          space_id TEXT NOT NULL,
          user_id INTEGER NOT NULL REFERENCES users(id),
          date TEXT NOT NULL,
          start_hour INTEGER NOT NULL,
          end_hour INTEGER NOT NULL,
          start_at TEXT NOT NULL,
          end_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',  -- active|cancelled|released|completed
          note TEXT NOT NULL DEFAULT '',
          checked_in_at TEXT,
          reminder_sent_at TEXT,
          released_reason TEXT,                   -- no_show|ended_early|closure|user_disabled
          created_at TEXT NOT NULL DEFAULT $now,
          updated_at TEXT NOT NULL DEFAULT $now
        );
        CREATE INDEX IF NOT EXISTS idx_b_space_date ON bookings(space_id, date);
        CREATE INDEX IF NOT EXISTS idx_b_user ON bookings(user_id);
        CREATE INDEX IF NOT EXISTS idx_b_status_start ON bookings(status, start_at);
        -- Una fila por hora ocupada: UNIQUE garantiza a nivel BD que no haya doble reserva.
        CREATE TABLE IF NOT EXISTS booking_slots (
          booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
          space_id TEXT NOT NULL,
          slot_start TEXT NOT NULL,
          UNIQUE(space_id, slot_start)
        );
        CREATE TABLE IF NOT EXISTS closures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          space_id TEXT,                 -- NULL = todo el edificio
          kind TEXT NOT NULL DEFAULT 'closed', -- closed | free_use
          reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE INDEX IF NOT EXISTS idx_closures_date ON closures(date);
        CREATE TABLE IF NOT EXISTS activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          booking_id INTEGER,
          user_id INTEGER,
          space_id TEXT,
          date TEXT,
          start_hour INTEGER,
          end_hour INTEGER,
          detail TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE TABLE IF NOT EXISTS push_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          payload TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE TABLE IF NOT EXISTS space_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          booking_id INTEGER NOT NULL REFERENCES bookings(id),
          space_id TEXT NOT NULL,
          date TEXT NOT NULL,
          requester_id INTEGER NOT NULL REFERENCES users(id),
          holder_id INTEGER NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'pending',  -- pending|released|expired|declined|closed
          expires_at TEXT NOT NULL,
          responded_at TEXT,
          hold_until TEXT,
          from_hour INTEGER,
          to_hour INTEGER,
          created_at TEXT NOT NULL DEFAULT $now
        );
        CREATE INDEX IF NOT EXISTS idx_req_booking ON space_requests(booking_id);
        CREATE INDEX IF NOT EXISTS idx_req_status ON space_requests(status, expires_at);
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          reset_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        ");
    }

    public static function meta(string $key): ?string
    {
        $v = self::value('SELECT value FROM meta WHERE key = ?', [$key]);
        return $v === null ? null : (string) $v;
    }

    public static function setMeta(string $key, string $value): void
    {
        self::run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [$key, $value]);
    }
}
