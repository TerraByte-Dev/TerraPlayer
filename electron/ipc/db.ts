import initSqlJs, { type Database } from 'sql.js'
import { join } from 'path'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'

let _db: Database | null = null
let _dbPath: string = ''

export async function getDb(): Promise<Database> {
  if (_db) return _db

  // Locate the WASM file — packaged path differs from dev path
  const wasmDir = app.isPackaged
    ? join(process.resourcesPath, 'sql-wasm')
    : join(app.getAppPath(), 'node_modules', 'sql.js', 'dist')

  const SQL = await initSqlJs({
    locateFile: (file: string) => join(wasmDir, file),
  })

  _dbPath = join(app.getPath('userData'), 'library.db')

  if (existsSync(_dbPath)) {
    const buf = readFileSync(_dbPath)
    _db = new SQL.Database(buf)
  } else {
    _db = new SQL.Database()
  }

  migrate(_db)
  persist()
  return _db
}

export function persist(): void {
  if (!_db || !_dbPath) return
  const data = _db.export()
  writeFileSync(_dbPath, Buffer.from(data))
}

function migrate(db: Database): void {
  db.run('PRAGMA foreign_keys = ON')
  db.run(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id              INTEGER PRIMARY KEY,
      path            TEXT    UNIQUE NOT NULL,
      playlist        TEXT    NOT NULL,
      title           TEXT,
      artist          TEXT,
      album           TEXT,
      duration        REAL,
      cover_data_url  TEXT,
      mtime           INTEGER,
      added_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_playlist ON tracks(playlist);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist   ON tracks(artist);

    CREATE TABLE IF NOT EXISTS tags (
      id   INTEGER PRIMARY KEY,
      name TEXT    UNIQUE NOT NULL,
      kind TEXT    NOT NULL DEFAULT 'custom'
    );

    CREATE TABLE IF NOT EXISTS track_tags (
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (track_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id    INTEGER NOT NULL REFERENCES tracks(id)    ON DELETE CASCADE,
      added_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);

    CREATE TABLE IF NOT EXISTS library_folders (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      path     TEXT    NOT NULL UNIQUE,
      added_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)
  persist()
}

// Helper: run a SELECT and return rows as objects
export function dbAll<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

// Helper: run a SELECT and return first row or null
export function dbGet<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  params: (string | number | null)[] = []
): T | null {
  const rows = dbAll<T>(db, sql, params)
  return rows[0] ?? null
}
