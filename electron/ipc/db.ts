import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, copyFileSync, cpSync } from 'fs'
import { createHash } from 'crypto'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const newUserData = app.getPath('userData')
  const newDbCheck = join(newUserData, 'library.db')

  // One-time migration: copy library + covers from T-Play userData (rename → TerraPlayer)
  const tPlayRoot = join(newUserData, '..', 'T-Play')
  const tPlayDb = join(tPlayRoot, 'library.db')
  if (!existsSync(newDbCheck) && existsSync(tPlayDb)) {
    try {
      copyFileSync(tPlayDb, newDbCheck)
      const tPlayCovers = join(tPlayRoot, 'covers')
      if (existsSync(tPlayCovers)) {
        cpSync(tPlayCovers, join(newUserData, 'covers'), { recursive: true })
      }
    } catch { /* non-fatal — start fresh if migration fails */ }
  }

  // One-time migration: copy library + covers from legacy tb-media-player userData
  const legacyRoot = join(newUserData, '..', 'tb-media-player')
  const legacyDb = join(legacyRoot, 'library.db')
  if (!existsSync(newDbCheck) && existsSync(legacyDb)) {
    try {
      copyFileSync(legacyDb, newDbCheck)
      const legacyCovers = join(legacyRoot, 'covers')
      if (existsSync(legacyCovers)) {
        cpSync(legacyCovers, join(newUserData, 'covers'), { recursive: true })
      }
    } catch { /* non-fatal — start fresh if migration fails */ }
  }

  const dbPath = join(app.getPath('userData'), 'library.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('synchronous = NORMAL')
  _db.pragma('foreign_keys = ON')

  migrate(_db)
  return _db
}

function migrate(db: Database.Database): void {
  db.exec(`
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

  try {
    db.exec('ALTER TABLE tracks ADD COLUMN cover_path TEXT')
  } catch {
    // Column already exists — ignore
  }
}

function mimeToExt(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png')  return 'png'
  if (mime === 'image/gif')  return 'gif'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

export function getCoversDir(): string {
  const dir = join(app.getPath('userData'), 'covers')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function saveCoverFile(data: Buffer, format: string): string {
  const dir = getCoversDir()
  const ext = mimeToExt(format)
  const hash = createHash('sha1').update(data).digest('hex').slice(0, 20)
  const filename = `${hash}.${ext}`
  const fullPath = join(dir, filename)
  if (!existsSync(fullPath)) {
    writeFileSync(fullPath, data)
  }
  return fullPath
}

export function migrateCoversToDisk(db: Database.Database): void {
  const alreadyDone = dbGet<{ value: string }>(
    db, 'SELECT value FROM app_meta WHERE key = ?', ['covers_on_disk_v1']
  )
  if (alreadyDone) return

  const rows = dbAll<{ id: number; cover_data_url: string }>(
    db,
    'SELECT id, cover_data_url FROM tracks WHERE cover_data_url IS NOT NULL AND cover_path IS NULL',
    []
  )

  db.transaction(() => {
    for (const row of rows) {
      try {
        const m = /^data:(image\/[\w]+);base64,(.+)$/.exec(row.cover_data_url)
        if (!m) continue
        const format = m[1]
        const data = Buffer.from(m[2], 'base64')
        const coverPath = saveCoverFile(data, format)
        dbRun(db, 'UPDATE tracks SET cover_path = ?, cover_data_url = NULL WHERE id = ?', [coverPath, row.id])
      } catch {
        // If individual cover fails, continue with others
      }
    }
    dbRun(db, 'UPDATE tracks SET cover_data_url = NULL WHERE cover_data_url IS NOT NULL', [])
    dbRun(db, 'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', ['covers_on_disk_v1', '1'])
  })()
}

export function dbAll<T = Record<string, unknown>>(
  db: Database.Database,
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  return db.prepare(sql).all(...params) as T[]
}

export function dbGet<T = Record<string, unknown>>(
  db: Database.Database,
  sql: string,
  params: (string | number | null)[] = []
): T | null {
  return (db.prepare(sql).get(...params) as T) ?? null
}

export function dbRun(
  db: Database.Database,
  sql: string,
  params: (string | number | null)[] = []
): void {
  db.prepare(sql).run(...params)
}
