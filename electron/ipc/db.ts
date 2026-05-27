import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, copyFileSync, cpSync, statSync } from 'fs'
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

  migrateTrackUid(db)
}

/**
 * Stable, content-derived identity for a track. Survives file rename/move
 * (the path is deliberately excluded) so tags/playlists stay attached to the
 * song rather than to a volatile rowid. Two byte-identical files collapse to
 * one identity by design.
 */
export function fingerprint(
  size: number,
  duration: number,
  artist: string,
  title: string,
  album: string
): string {
  const norm = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const key = `${size}|${Math.round(duration || 0)}|${norm(artist)}|${norm(title)}|${norm(album)}`
  return createHash('sha1').update(key).digest('hex')
}

/**
 * One-time migration (guarded by app_meta 'tracks_uid_v1'):
 *  - rebuilds `tracks` with `id INTEGER PRIMARY KEY AUTOINCREMENT` so deleted
 *    ids are never reused (kills the "tag jumps to a different song" drift),
 *  - adds a `uid` content fingerprint column with a UNIQUE index,
 *  - backfills uid from columns already in the DB plus on-disk file size.
 * Row ids are preserved so existing track_tags / playlist_tracks FKs stay valid.
 */
function migrateTrackUid(db: Database.Database): void {
  const done = dbGet<{ value: string }>(
    db, 'SELECT value FROM app_meta WHERE key = ?', ['tracks_uid_v1']
  )
  if (done) return

  type OldRow = {
    id: number; path: string; playlist: string
    title: string | null; artist: string | null; album: string | null
    duration: number | null; cover_data_url: string | null; cover_path: string | null
    mtime: number | null; added_at: number
  }
  const rows = dbAll<OldRow>(
    db,
    `SELECT id, path, playlist, title, artist, album, duration,
            cover_data_url, cover_path, mtime, added_at
     FROM tracks`,
    []
  )

  // foreign_keys must be toggled outside a transaction; otherwise DROP TABLE
  // tracks would cascade-delete every track_tags / playlist_tracks row.
  db.pragma('foreign_keys = OFF')
  try {
    db.exec('BEGIN')
    try {
      db.exec(`
        CREATE TABLE tracks_new (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          uid             TEXT,
          path            TEXT    UNIQUE NOT NULL,
          playlist        TEXT    NOT NULL,
          title           TEXT,
          artist          TEXT,
          album           TEXT,
          duration        REAL,
          cover_data_url  TEXT,
          cover_path      TEXT,
          mtime           INTEGER,
          added_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
      `)

      const insert = db.prepare(
        `INSERT INTO tracks_new
           (id, uid, path, playlist, title, artist, album, duration,
            cover_data_url, cover_path, mtime, added_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )

      const seen = new Set<string>()
      for (const r of rows) {
        let size = 0
        try { size = statSync(r.path).size } catch { /* file missing — size 0 */ }
        let uid = size > 0
          ? fingerprint(size, r.duration ?? 0, r.artist ?? '', r.title ?? '', r.album ?? '')
          : `path:${createHash('sha1').update(r.path).digest('hex').slice(0, 24)}`
        // Preserve UNIQUE(uid): disambiguate genuine duplicates by row id.
        if (seen.has(uid)) uid = `${uid}#${r.id}`
        seen.add(uid)
        insert.run(
          r.id, uid, r.path, r.playlist, r.title, r.artist, r.album,
          r.duration, r.cover_data_url, r.cover_path, r.mtime, r.added_at
        )
      }

      db.exec('DROP TABLE tracks')
      db.exec('ALTER TABLE tracks_new RENAME TO tracks')
      db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_playlist ON tracks(playlist)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_artist   ON tracks(artist)')
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_uid ON tracks(uid)')

      // Keep AUTOINCREMENT issuing ids above every existing id.
      const maxId = dbGet<{ m: number | null }>(db, 'SELECT MAX(id) AS m FROM tracks', [])?.m ?? 0
      dbRun(db, "DELETE FROM sqlite_sequence WHERE name IN ('tracks','tracks_new')", [])
      dbRun(db, "INSERT INTO sqlite_sequence (name, seq) VALUES ('tracks', ?)", [maxId])

      dbRun(db, 'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', ['tracks_uid_v1', '1'])
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  } finally {
    db.pragma('foreign_keys = ON')
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
