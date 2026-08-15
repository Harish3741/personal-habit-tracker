import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * SQLite lives on disk next to the app. It holds three kinds of thing:
 *   - a cache of iCloud events (disposable; rebuilt on every sync)
 *   - local events, habits and completions (the actual user data)
 *   - per-calendar sync bookkeeping
 *
 * Nothing here is ever pushed back to iCloud.
 */

const DATA_DIR = process.env.HABIT_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "habits.db");

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  migrate(conn);
  seedCalendarsFromEnv(conn);
  instance = conn;
  return conn;
}

function migrate(conn: Database.Database) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS calendars (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      color     TEXT NOT NULL DEFAULT '#8b8b8b',
      kind      TEXT NOT NULL DEFAULT 'ics',
      url       TEXT NOT NULL,
      enabled   INTEGER NOT NULL DEFAULT 1,
      position  INTEGER NOT NULL DEFAULT 0
    );

    -- Cache of expanded iCloud occurrences. Wiped and rewritten per calendar
    -- on each sync, so it must never hold user-authored data.
    CREATE TABLE IF NOT EXISTS ics_events (
      key           TEXT PRIMARY KEY,
      calendar_id   TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      uid           TEXT NOT NULL,
      recurrence_id TEXT,
      title         TEXT NOT NULL,
      ymd           TEXT NOT NULL,
      start_min     INTEGER,
      end_ymd       TEXT NOT NULL,
      end_min       INTEGER,
      all_day       INTEGER NOT NULL DEFAULT 0,
      notes         TEXT
    );
    CREATE INDEX IF NOT EXISTS ics_events_ymd ON ics_events(ymd);
    CREATE INDEX IF NOT EXISTS ics_events_cal ON ics_events(calendar_id);

    CREATE TABLE IF NOT EXISTS local_events (
      id                TEXT PRIMARY KEY,
      calendar_id       TEXT REFERENCES calendars(id) ON DELETE SET NULL,
      title             TEXT NOT NULL,
      ymd               TEXT NOT NULL,
      start_min         INTEGER,
      end_ymd           TEXT NOT NULL,
      end_min           INTEGER,
      all_day           INTEGER NOT NULL DEFAULT 0,
      notes             TEXT,
      detached_from_key TEXT,
      created_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS local_events_ymd ON local_events(ymd);

    -- iCloud occurrences hidden because they were dragged into a local copy.
    CREATE TABLE IF NOT EXISTS hidden_occurrences (
      key        TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habits (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      match_title  TEXT NOT NULL,
      match_mode   TEXT NOT NULL DEFAULT 'exact',
      calendar_id  TEXT REFERENCES calendars(id) ON DELETE SET NULL,
      target_type  TEXT NOT NULL DEFAULT 'times_per_week',
      target_count INTEGER NOT NULL DEFAULT 1,
      color        TEXT NOT NULL DEFAULT '#e8734a',
      archived     INTEGER NOT NULL DEFAULT 0,
      position     INTEGER NOT NULL DEFAULT 0
    );

    -- One row per ticked event. The event checkbox is the only way a habit
    -- gets credited, so this table is keyed by occurrence, not by habit+day.
    CREATE TABLE IF NOT EXISTS completions (
      occurrence_key TEXT PRIMARY KEY,
      habit_id       TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      ymd            TEXT NOT NULL,
      created_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS completions_habit_ymd ON completions(habit_id, ymd);

    CREATE TABLE IF NOT EXISTS sync_state (
      calendar_id  TEXT PRIMARY KEY REFERENCES calendars(id) ON DELETE CASCADE,
      last_sync_at TEXT,
      last_status  TEXT NOT NULL DEFAULT 'never',
      last_error   TEXT
    );
  `);
}

const DEFAULT_COLORS: Record<string, string> = {
  work: "#5b8def",
  uni: "#a970e0",
  society: "#e0a33e",
  health: "#4ec98a",
  "dilly dally": "#e8734a",
  life: "#3fb8c4",
};

/**
 * First-run convenience: seed calendars from CALENDAR_<NAME>_URL env vars so a
 * fresh clone can be configured entirely from .env.local. Calendars are
 * editable in the UI afterwards, and existing rows are never overwritten.
 */
function seedCalendarsFromEnv(conn: Database.Database) {
  const existing = conn.prepare("SELECT COUNT(*) AS n FROM calendars").get() as { n: number };
  if (existing.n > 0) return;

  const insert = conn.prepare(
    `INSERT INTO calendars (id, name, color, kind, url, enabled, position)
     VALUES (@id, @name, @color, 'ics', @url, 1, @position)`,
  );

  let position = 0;
  for (const [envKey, url] of Object.entries(process.env)) {
    const match = envKey.match(/^CALENDAR_(.+)_URL$/);
    if (!match || !url) continue;
    const name = match[1]
      .toLowerCase()
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    insert.run({
      id: randomUUID(),
      name,
      color: DEFAULT_COLORS[name.toLowerCase()] ?? "#8b8b8b",
      url,
      position: position++,
    });
  }
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
