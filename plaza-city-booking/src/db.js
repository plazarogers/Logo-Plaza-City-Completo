// SQLite (better-sqlite3): un solo archivo, sin servidor de base de datos.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let db;

export function getDb() {
  if (db) return db;
  const file = config.dbPath;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Solo para pruebas: reemplaza la conexión por una en memoria. */
export function useTestDb() {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      suite TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'es',
      invite_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      max_uses INTEGER NOT NULL DEFAULT 1,
      uses INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,             -- 'YYYY-MM-DD' local (America/Chicago)
      start_hour INTEGER NOT NULL,
      end_hour INTEGER NOT NULL,      -- exclusivo
      start_at TEXT NOT NULL,         -- ISO UTC
      end_at TEXT NOT NULL,           -- ISO UTC
      status TEXT NOT NULL DEFAULT 'active', -- active | cancelled | released | completed
      note TEXT NOT NULL DEFAULT '',
      checked_in_at TEXT,
      released_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_space_date ON bookings(space_id, date);
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status_start ON bookings(status, start_at);

    -- Una fila por hora ocupada. La restricción UNIQUE es la garantía real
    -- (a nivel base de datos) contra la doble reserva.
    CREATE TABLE IF NOT EXISTS booking_slots (
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      space_id TEXT NOT NULL,
      slot_start TEXT NOT NULL,       -- ISO UTC del inicio de la hora
      UNIQUE(space_id, slot_start)
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,             -- booked | cancelled | released | checked_in | ended_early | registered
      booking_id INTEGER,
      user_id INTEGER,
      space_id TEXT,
      date TEXT,
      start_hour INTEGER,
      end_hour INTEGER,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}
