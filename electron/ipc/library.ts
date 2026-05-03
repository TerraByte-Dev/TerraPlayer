import { readdirSync, statSync, type Dirent } from 'fs'
import { join, basename, extname } from 'path'
import { app } from 'electron'
import type { Database } from 'sql.js'
import { getDb, dbAll, dbGet, persist } from './db'
import { readMeta } from './metadata'

const AUDIO_EXTS = new Set(['.m4a', '.mp3'])

export interface TrackRow {
  id: number
  path: string
  playlist: string
  title: string
  artist: string
  album: string
  duration: number
  coverDataUrl: string | null
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

function rowToTrack(r: Record<string, unknown>): TrackRow {
  return {
    id: r.id as number,
    path: r.path as string,
    playlist: r.playlist as string,
    title: (r.title as string) ?? '',
    artist: (r.artist as string) ?? '',
    album: (r.album as string) ?? '',
    duration: (r.duration as number) ?? 0,
    coverDataUrl: (r.cover_data_url as string | null) ?? null,
    mtime: (r.mtime as number) ?? 0,
  }
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function ensurePlaylist(db: Database, name: string): number {
  const clean = normalizeName(name)
  if (!clean) throw new Error('Playlist name is required')
  db.run('INSERT OR IGNORE INTO playlists (name, created_at) VALUES (?, ?)', [
    clean,
    Math.floor(Date.now() / 1000),
  ])
  const row = dbGet<{ id: number }>(db, 'SELECT id FROM playlists WHERE name = ?', [clean])
  if (!row) throw new Error('Unable to create playlist')
  return row.id
}

function seedLegacyPlaylists(db: Database): void {
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

  for (const group of groups) {
    const playlistId = ensurePlaylist(db, group.playlist)
    const tracks = dbAll<{ id: number }>(
      db,
      'SELECT id FROM tracks WHERE playlist = ?',
      [group.playlist]
    )
    for (const track of tracks) {
      db.run(
        'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)',
        [playlistId, track.id, Math.floor(Date.now() / 1000)]
      )
    }
  }

  db.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
    'playlist_seed_v1',
    '1',
  ])
}

export async function listLibraryFolders(): Promise<LibraryFolder[]> {
  const db = await getDb()
  return dbAll<LibraryFolder>(db, 'SELECT * FROM library_folders ORDER BY added_at', [])
}

export async function addLibraryFolder(folderPath: string): Promise<LibraryFolder[]> {
  const db = await getDb()
  db.run('INSERT OR IGNORE INTO library_folders (path, added_at) VALUES (?, ?)', [
    folderPath,
    Math.floor(Date.now() / 1000),
  ])
  persist()
  return listLibraryFolders()
}

export async function removeLibraryFolder(folderPath: string): Promise<void> {
  const db = await getDb()
  const allPaths = dbAll<{ id: number; path: string }>(db, 'SELECT id, path FROM tracks', [])
  for (const { id, path } of allPaths) {
    if (path.startsWith(folderPath)) {
      db.run('DELETE FROM tracks WHERE id = ?', [id])
    }
  }
  db.run('DELETE FROM library_folders WHERE path = ?', [folderPath])
  persist()
}

async function walkDir(
  db: Database,
  dir: string,
  root: string,
  stats: ScanSummary,
  forceMetadataRefresh = false
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
      await walkDir(db, fullPath, root, stats, forceMetadataRefresh)
    } else if (AUDIO_EXTS.has(extname(entry.name).toLowerCase())) {
      stats.scanned++

      let mtime = 0
      try { mtime = Math.floor(statSync(fullPath).mtimeMs) } catch { continue }

      const rel = fullPath.slice(root.length).replace(/^[/\\]/, '')
      const parts = rel.split(/[/\\]/)
      const playlist = parts.length > 1 ? parts[0] : basename(root)

      const existing = dbGet<{ id: number; mtime: number }>(db, 'SELECT id, mtime FROM tracks WHERE path = ?', [fullPath])
      if (existing && existing.mtime === mtime && !forceMetadataRefresh) continue

      let title = basename(fullPath, extname(fullPath))
      let artist = '', album = '', duration = 0, coverDataUrl: string | null = null
      try {
        const raw = await readMeta(fullPath)
        title = raw.title || title
        artist = raw.artist
        album = raw.album
        duration = raw.duration
        coverDataUrl = raw.coverDataUrl
      } catch { /* use filename fallback */ }

      db.run(
        `INSERT INTO tracks (path, playlist, title, artist, album, duration, cover_data_url, mtime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           title          = excluded.title,
           artist         = excluded.artist,
           album          = excluded.album,
           duration       = excluded.duration,
           cover_data_url = excluded.cover_data_url,
           mtime          = excluded.mtime`,
        [fullPath, playlist, title, artist, album, duration, coverDataUrl, mtime]
      )

      if (!existing) {
        const track = dbGet<{ id: number }>(db, 'SELECT id FROM tracks WHERE path = ?', [fullPath])
        if (track) {
          const playlistId = ensurePlaylist(db, playlist)
          db.run(
            'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)',
            [playlistId, track.id, Math.floor(Date.now() / 1000)]
          )
        }
      }
    }
  }
}

export async function scanLibrary(): Promise<{ playlists: PlaylistSummary[]; tracks: TrackRow[]; summary: ScanSummary }> {
  const db = await getDb()
  seedLegacyPlaylists(db)
  const folders = await listLibraryFolders()

  if (folders.length === 0) {
    return { playlists: [], tracks: [], summary: { folders: 0, scanned: 0, errors: [] } }
  }

  const summary: ScanSummary = { folders: folders.length, scanned: 0, errors: [] }
  const forceCoverNormalization = !dbGet<{ value: string }>(
    db,
    'SELECT value FROM app_meta WHERE key = ?',
    ['cover_art_normalized_v1']
  )

  for (const folder of folders) {
    await walkDir(db, folder.path, folder.path, summary, forceCoverNormalization)
  }

  if (forceCoverNormalization) {
    db.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
      'cover_art_normalized_v1',
      '1',
    ])
  }

  // Remove stale rows (file no longer exists on disk)
  const allPaths = dbAll<{ path: string }>(db, 'SELECT path FROM tracks', [])
  for (const { path } of allPaths) {
    try { statSync(path) } catch {
      db.run('DELETE FROM tracks WHERE path = ?', [path])
    }
  }

  persist()

  const tracks = dbAll(db, 'SELECT * FROM tracks ORDER BY artist, title', []).map(rowToTrack)
  const playlists = await listPlaylists()

  return { playlists, tracks, summary }
}

export async function refreshTrack(filePath: string): Promise<TrackRow | null> {
  const db = await getDb()
  let mtime = 0
  try { mtime = Math.floor(statSync(filePath).mtimeMs) } catch { return null }

  const raw = await readMeta(filePath)
  db.run(
    'UPDATE tracks SET title=?, artist=?, album=?, duration=?, cover_data_url=?, mtime=? WHERE path=?',
    [raw.title, raw.artist, raw.album, raw.duration, raw.coverDataUrl, mtime, filePath]
  )
  persist()

  const row = dbGet(db, 'SELECT * FROM tracks WHERE path = ?', [filePath])
  return row ? rowToTrack(row as Record<string, unknown>) : null
}

export async function listTags(): Promise<TagRow[]> {
  const db = await getDb()
  return dbAll<TagRow>(db, 'SELECT * FROM tags ORDER BY kind, name', [])
}

export async function listPlaylists(): Promise<PlaylistSummary[]> {
  const db = await getDb()
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

export async function createPlaylist(name: string): Promise<PlaylistSummary> {
  const db = await getDb()
  const id = ensurePlaylist(db, name)
  persist()
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

export async function deletePlaylist(playlistId: number): Promise<void> {
  const db = await getDb()
  db.run('DELETE FROM playlists WHERE id = ?', [playlistId])
  persist()
}

export async function getTracksForPlaylist(playlistId: number): Promise<TrackRow[]> {
  const db = await getDb()
  const rows = dbAll(
    db,
    `SELECT t.* FROM tracks t
     JOIN playlist_tracks pt ON pt.track_id = t.id
     WHERE pt.playlist_id = ?
     ORDER BY pt.added_at, t.artist, t.title`,
    [playlistId]
  )
  return rows.map(rowToTrack)
}

export async function addTrackToPlaylist(playlistId: number, trackId: number): Promise<void> {
  const db = await getDb()
  db.run(
    'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)',
    [playlistId, trackId, Math.floor(Date.now() / 1000)]
  )
  persist()
}

export async function removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  const db = await getDb()
  db.run('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [playlistId, trackId])
  persist()
}

export async function createTag(name: string, kind: string): Promise<TagRow> {
  const db = await getDb()
  db.run('INSERT OR IGNORE INTO tags (name, kind) VALUES (?, ?)', [name, kind])
  persist()
  return dbGet<TagRow>(db, 'SELECT * FROM tags WHERE name = ?', [name])!
}

export async function deleteTag(tagId: number): Promise<void> {
  const db = await getDb()
  db.run('DELETE FROM tags WHERE id = ?', [tagId])
  persist()
}

export async function getTrackTags(trackId: number): Promise<TagRow[]> {
  const db = await getDb()
  return dbAll<TagRow>(
    db,
    `SELECT t.* FROM tags t
     JOIN track_tags tt ON tt.tag_id = t.id
     WHERE tt.track_id = ?
     ORDER BY t.kind, t.name`,
    [trackId]
  )
}

export async function setTrackTags(trackId: number, tagIds: number[]): Promise<void> {
  const db = await getDb()
  db.run('DELETE FROM track_tags WHERE track_id = ?', [trackId])
  for (const tid of tagIds) {
    db.run('INSERT INTO track_tags (track_id, tag_id) VALUES (?, ?)', [trackId, tid])
  }
  persist()
}

export async function getTracksForTag(tagId: number): Promise<TrackRow[]> {
  const db = await getDb()
  const rows = dbAll(
    db,
    `SELECT t.* FROM tracks t
     JOIN track_tags tt ON tt.track_id = t.id
     WHERE tt.tag_id = ?
     ORDER BY t.artist, t.title`,
    [tagId]
  )
  return rows.map(rowToTrack)
}
