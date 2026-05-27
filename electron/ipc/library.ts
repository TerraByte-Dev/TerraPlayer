import { readdirSync, statSync, type Dirent } from 'fs'
import { join, basename, extname } from 'path'
import type Database from 'better-sqlite3'
import { getDb, dbAll, dbGet, dbRun, saveCoverFile, migrateCoversToDisk, fingerprint } from './db'
import { readMeta } from './metadata'

type Db = Database.Database

const AUDIO_EXTS = new Set(['.m4a', '.mp3'])

export interface TrackRow {
  id: number
  path: string
  playlist: string
  title: string
  artist: string
  album: string
  duration: number
  coverUrl: string | null
  mtime: number
}

export interface PlaylistSummary {
  id: number
  name: string
  count: number
}

export interface TagRow {
  id: number
  name: string
  kind: string
}

export interface LibraryFolder {
  id: number
  path: string
  added_at: number
}

export interface ScanSummary {
  folders: number
  scanned: number
  errors: string[]
}

function coverUrlFromPath(coverPath: unknown): string | null {
  if (!coverPath) return null
  return `hub://localhost/${encodeURIComponent(coverPath as string)}`
}

function rowToTrack(r: Record<string, unknown>): TrackRow {
  return {
    id: r.id as number,
    path: r.path as string,
    playlist: r.playlist as string,
    title: (r.title as string) ?? '',
    artist: (r.artist as string) ?? '',
    album: (r.album as string) ?? '',
    duration: (r.duration as number) ?? 0,
    coverUrl: coverUrlFromPath(r.cover_path),
    mtime: (r.mtime as number) ?? 0,
  }
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function ensurePlaylist(db: Db, name: string): number {
  const clean = normalizeName(name)
  if (!clean) throw new Error('Playlist name is required')
  dbRun(db, 'INSERT OR IGNORE INTO playlists (name, created_at) VALUES (?, ?)', [
    clean,
    Math.floor(Date.now() / 1000),
  ])
  const row = dbGet<{ id: number }>(db, 'SELECT id FROM playlists WHERE name = ?', [clean])
  if (!row) throw new Error('Unable to create playlist')
  return row.id
}

function seedLegacyPlaylists(db: Db): void {
  const seeded = dbGet<{ value: string }>(
    db,
    'SELECT value FROM app_meta WHERE key = ?',
    ['playlist_seed_v1']
  )
  if (seeded) return

  const groups = dbAll<{ playlist: string }>(
    db,
    'SELECT DISTINCT playlist FROM tracks WHERE playlist IS NOT NULL AND playlist <> ?',
    ['']
  )

  db.transaction(() => {
    for (const group of groups) {
      const playlistId = ensurePlaylist(db, group.playlist)
      const tracks = dbAll<{ id: number }>(
        db,
        'SELECT id FROM tracks WHERE playlist = ?',
        [group.playlist]
      )
      for (const track of tracks) {
        dbRun(
          db,
          'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)',
          [playlistId, track.id, Math.floor(Date.now() / 1000)]
        )
      }
    }
    dbRun(db, 'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', ['playlist_seed_v1', '1'])
  })()
}

export function listLibraryFolders(): LibraryFolder[] {
  const db = getDb()
  return dbAll<LibraryFolder>(db, 'SELECT * FROM library_folders ORDER BY added_at', [])
}

export function addLibraryFolder(folderPath: string): LibraryFolder[] {
  const db = getDb()
  dbRun(db, 'INSERT OR IGNORE INTO library_folders (path, added_at) VALUES (?, ?)', [
    folderPath,
    Math.floor(Date.now() / 1000),
  ])
  return listLibraryFolders()
}

export function removeLibraryFolder(folderPath: string): void {
  const db = getDb()
  db.transaction(() => {
    dbRun(db, 'DELETE FROM tracks WHERE SUBSTR(path, 1, ?) = ?', [folderPath.length, folderPath])
    dbRun(db, 'DELETE FROM library_folders WHERE path = ?', [folderPath])
  })()
}

async function walkDir(
  db: Db,
  dir: string,
  root: string,
  stats: ScanSummary
): Promise<void> {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    if (stats.errors.length < 5) {
      stats.errors.push(`${dir}: ${(e as Error).message}`)
    }
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDir(db, fullPath, root, stats)
    } else if (AUDIO_EXTS.has(extname(entry.name).toLowerCase())) {
      stats.scanned++

      let mtime = 0, size = 0
      try { const st = statSync(fullPath); mtime = Math.floor(st.mtimeMs); size = st.size } catch { continue }

      const rel = fullPath.slice(root.length).replace(/^[/\\]/, '')
      const parts = rel.split(/[/\\]/)
      const playlist = parts.length > 1 ? parts[0] : basename(root)

      const existing = dbGet<{ id: number; mtime: number }>(db, 'SELECT id, mtime FROM tracks WHERE path = ?', [fullPath])
      if (existing && existing.mtime === mtime) continue

      let title = basename(fullPath, extname(fullPath))
      let artist = '', album = '', duration = 0, coverPath: string | null = null
      try {
        const raw = await readMeta(fullPath)
        title = raw.title || title
        artist = raw.artist
        album = raw.album
        duration = raw.duration
        if (raw.coverBuf) {
          try { coverPath = saveCoverFile(raw.coverBuf.data, raw.coverBuf.format) } catch { /* noop */ }
        }
      } catch { /* use filename fallback */ }

      const uid = fingerprint(size, duration, artist, title, album)

      try {
        // Re-link a moved/renamed file to its existing row (by content uid) so its
        // tags and playlist membership follow the song instead of being orphaned.
        if (!existing) {
          const byUid = dbGet<{ id: number; path: string }>(db, 'SELECT id, path FROM tracks WHERE uid = ?', [uid])
          if (byUid && byUid.path !== fullPath) {
            let oldExists = true
            try { statSync(byUid.path) } catch { oldExists = false }
            if (!oldExists) {
              // The original file is gone — repoint the existing row at the new path.
              // id is preserved, so track_tags / playlist_tracks stay attached.
              dbRun(
                db,
                `UPDATE tracks SET path=?, playlist=?, title=?, artist=?, album=?,
                   duration=?, cover_path=COALESCE(?, cover_path), mtime=? WHERE id=?`,
                [fullPath, playlist, title, artist, album, duration, coverPath, mtime, byUid.id]
              )
            }
            // else: a byte-identical file already exists — uid is UNIQUE, so we keep
            // the existing row and skip adding a duplicate (content-fingerprint tradeoff).
            continue
          }
        }

        dbRun(
          db,
          `INSERT INTO tracks (uid, path, playlist, title, artist, album, duration, cover_path, mtime)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET
             uid        = excluded.uid,
             title      = excluded.title,
             artist     = excluded.artist,
             album      = excluded.album,
             duration   = excluded.duration,
             cover_path = COALESCE(excluded.cover_path, tracks.cover_path),
             mtime      = excluded.mtime`,
          [uid, fullPath, playlist, title, artist, album, duration, coverPath, mtime]
        )

        if (!existing) {
          const track = dbGet<{ id: number }>(db, 'SELECT id FROM tracks WHERE path = ?', [fullPath])
          if (track) {
            const playlistId = ensurePlaylist(db, playlist)
            dbRun(
              db,
              'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)',
              [playlistId, track.id, Math.floor(Date.now() / 1000)]
            )
          }
        }
      } catch (e) {
        // Don't let one problematic file (e.g. a uid collision from edited metadata)
        // roll back the whole scan.
        if (stats.errors.length < 5) stats.errors.push(`${fullPath}: ${(e as Error).message}`)
      }
    }
  }
}

export async function scanLibrary(): Promise<{ playlists: PlaylistSummary[]; tracks: TrackRow[]; summary: ScanSummary }> {
  const db = getDb()

  migrateCoversToDisk(db)
  seedLegacyPlaylists(db)
  const folders = listLibraryFolders()

  if (folders.length === 0) {
    return { playlists: [], tracks: [], summary: { folders: 0, scanned: 0, errors: [] } }
  }

  const summary: ScanSummary = { folders: folders.length, scanned: 0, errors: [] }

  // Manual BEGIN/COMMIT because db.transaction() doesn't support async callbacks
  db.exec('BEGIN')
  try {
    for (const folder of folders) {
      await walkDir(db, folder.path, folder.path, summary)
    }

    const allPaths = dbAll<{ path: string }>(db, 'SELECT path FROM tracks', [])
    for (const { path } of allPaths) {
      try { statSync(path) } catch {
        dbRun(db, 'DELETE FROM tracks WHERE path = ?', [path])
      }
    }

    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  const tracks = dbAll(
    db,
    'SELECT id, path, playlist, title, artist, album, duration, cover_path, mtime FROM tracks ORDER BY artist, title',
    []
  ).map(rowToTrack)
  const playlists = listPlaylists()

  return { playlists, tracks, summary }
}

export async function refreshTrack(filePath: string): Promise<TrackRow | null> {
  const db = getDb()
  let mtime = 0, size = 0
  try { const st = statSync(filePath); mtime = Math.floor(st.mtimeMs); size = st.size } catch { return null }

  const raw = await readMeta(filePath)
  let coverPath: string | null = null
  if (raw.coverBuf) {
    try { coverPath = saveCoverFile(raw.coverBuf.data, raw.coverBuf.format) } catch { /* noop */ }
  }

  // Recompute the content uid; only adopt it when it won't collide with a
  // different track (UNIQUE) — the row id stays put either way, so tags are safe.
  const uid = fingerprint(size, raw.duration, raw.artist, raw.title, raw.album)
  const clash = dbGet<{ path: string }>(db, 'SELECT path FROM tracks WHERE uid = ? AND path <> ?', [uid, filePath])

  if (clash) {
    dbRun(
      db,
      'UPDATE tracks SET title=?, artist=?, album=?, duration=?, cover_path=COALESCE(?, cover_path), mtime=? WHERE path=?',
      [raw.title, raw.artist, raw.album, raw.duration, coverPath, mtime, filePath]
    )
  } else {
    dbRun(
      db,
      'UPDATE tracks SET uid=?, title=?, artist=?, album=?, duration=?, cover_path=COALESCE(?, cover_path), mtime=? WHERE path=?',
      [uid, raw.title, raw.artist, raw.album, raw.duration, coverPath, mtime, filePath]
    )
  }

  const row = dbGet(db, 'SELECT id, path, playlist, title, artist, album, duration, cover_path, mtime FROM tracks WHERE path = ?', [filePath])
  return row ? rowToTrack(row as Record<string, unknown>) : null
}

export function listTags(): TagRow[] {
  const db = getDb()
  return dbAll<TagRow>(db, 'SELECT * FROM tags ORDER BY kind, name', [])
}

export function listPlaylists(): PlaylistSummary[] {
  const db = getDb()
  seedLegacyPlaylists(db)
  return dbAll<PlaylistSummary>(
    db,
    `SELECT p.id, p.name, COUNT(pt.track_id) AS count
     FROM playlists p
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     GROUP BY p.id, p.name
     ORDER BY p.name`,
    []
  )
}

export function createPlaylist(name: string): PlaylistSummary {
  const db = getDb()
  const id = ensurePlaylist(db, name)
  return dbGet<PlaylistSummary>(
    db,
    `SELECT p.id, p.name, COUNT(pt.track_id) AS count
     FROM playlists p
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     WHERE p.id = ?
     GROUP BY p.id, p.name`,
    [id]
  )!
}

export function deletePlaylist(playlistId: number): void {
  const db = getDb()
  dbRun(db, 'DELETE FROM playlists WHERE id = ?', [playlistId])
}

export function getTracksForPlaylist(playlistId: number): TrackRow[] {
  const db = getDb()
  const rows = dbAll(
    db,
    `SELECT t.id, t.path, t.playlist, t.title, t.artist, t.album, t.duration, t.cover_path, t.mtime
     FROM tracks t
     JOIN playlist_tracks pt ON pt.track_id = t.id
     WHERE pt.playlist_id = ?
     ORDER BY pt.added_at, t.artist, t.title`,
    [playlistId]
  )
  return rows.map(rowToTrack)
}

export function addTrackToPlaylist(playlistId: number, trackId: number): void {
  const db = getDb()
  dbRun(
    db,
    'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)',
    [playlistId, trackId, Math.floor(Date.now() / 1000)]
  )
}

export function removeTrackFromPlaylist(playlistId: number, trackId: number): void {
  const db = getDb()
  dbRun(db, 'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [playlistId, trackId])
}

export function createTag(name: string, kind: string): TagRow {
  const db = getDb()
  dbRun(db, 'INSERT OR IGNORE INTO tags (name, kind) VALUES (?, ?)', [name, kind])
  return dbGet<TagRow>(db, 'SELECT * FROM tags WHERE name = ?', [name])!
}

export function deleteTag(tagId: number): void {
  const db = getDb()
  dbRun(db, 'DELETE FROM tags WHERE id = ?', [tagId])
}

export function getTrackTags(trackId: number): TagRow[] {
  const db = getDb()
  return dbAll<TagRow>(
    db,
    `SELECT t.* FROM tags t
     JOIN track_tags tt ON tt.tag_id = t.id
     WHERE tt.track_id = ?
     ORDER BY t.kind, t.name`,
    [trackId]
  )
}

export function setTrackTags(trackId: number, tagIds: number[]): void {
  const db = getDb()
  db.transaction(() => {
    dbRun(db, 'DELETE FROM track_tags WHERE track_id = ?', [trackId])
    for (const tid of tagIds) {
      dbRun(db, 'INSERT INTO track_tags (track_id, tag_id) VALUES (?, ?)', [trackId, tid])
    }
  })()
}

export function getTracksForTag(tagId: number): TrackRow[] {
  const db = getDb()
  const rows = dbAll(
    db,
    `SELECT t.id, t.path, t.playlist, t.title, t.artist, t.album, t.duration, t.cover_path, t.mtime
     FROM tracks t
     JOIN track_tags tt ON tt.track_id = t.id
     WHERE tt.tag_id = ?
     ORDER BY t.artist, t.title`,
    [tagId]
  )
  return rows.map(rowToTrack)
}

export function getDriveStats(): { totalBytes: number } {
  const db = getDb()
  const paths = dbAll<{ path: string }>(db, 'SELECT path FROM tracks', [])
  let totalBytes = 0
  for (const { path } of paths) {
    try { totalBytes += statSync(path).size } catch { /* file missing */ }
  }
  return { totalBytes }
}
