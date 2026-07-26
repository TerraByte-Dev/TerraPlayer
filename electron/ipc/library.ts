import { readdirSync, statSync, type Dirent } from 'fs'
import { join, basename, dirname, extname } from 'path'
import type Database from 'better-sqlite3'
import { getDb, dbAll, dbGet, dbRun, saveCoverFile, migrateCoversToDisk, fingerprint } from './db'
import { readMeta } from './metadata'
import { shouldSeedFolder } from './library-seed-core'
import { isPathUnderAnyFolder } from './downloader-core'

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
  /**
   * True when no library folder covers this file — a song dragged in on its own,
   * or one kept when its folder was unregistered. Only these can be taken out of
   * the library non-destructively: a folder-covered track would be re-inserted by
   * the very next scan, with a new id and its tags already cascaded away.
   */
  loose: boolean
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
  /** NULL until the folder's playlists have been seeded once (import-once model). */
  seeded_at: number | null
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

function rowToTrack(r: Record<string, unknown>, roots: readonly string[]): TrackRow {
  const path = r.path as string
  return {
    id: r.id as number,
    path,
    playlist: r.playlist as string,
    title: (r.title as string) ?? '',
    artist: (r.artist as string) ?? '',
    album: (r.album as string) ?? '',
    duration: (r.duration as number) ?? 0,
    coverUrl: coverUrlFromPath(r.cover_path),
    mtime: (r.mtime as number) ?? 0,
    loose: !isPathUnderAnyFolder(path, roots),
  }
}

/** Registered scan roots — resolved once per query to flag each track's `loose`. */
function folderPaths(): string[] {
  return listLibraryFolders().map((f) => f.path)
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function ensurePlaylist(db: Db, name: string): number {
  const clean = normalizeName(name)
  if (!clean) throw new Error('Playlist name is required')
  // Reuse a case-insensitive match so "rock" and "Rock" resolve to ONE playlist,
  // matching renamePlaylist's uniqueness contract. A bare INSERT OR IGNORE on the
  // BINARY-collated UNIQUE(name) would instead spawn a case-variant duplicate that
  // rename then refuses to merge.
  const existing = dbGet<{ id: number }>(
    db,
    'SELECT id FROM playlists WHERE lower(name) = lower(?)',
    [clean]
  )
  if (existing) return existing.id
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

/**
 * Every track whose file lives inside `folderPath`.
 *
 * Deliberately a JS filter rather than a SQL prefix test. `SUBSTR(path, 1, ?) = ?`
 * with folderPath.length was wrong three ways: it has no separator boundary (so
 * "C:\Music" also matched C:\Music2 and C:\Music Videos), it is case-sensitive
 * (so it missed "c:\music\…" rows the shell can produce), and it fed a JS UTF-16
 * code-unit count to a SQLite call that counts characters — so a folder name
 * containing an emoji cut one character short and matched NOTHING, ever. The
 * predicate was already non-sargable (EXPLAIN reports SCAN tracks), so nothing
 * is given up by filtering here, and isPathUnderAnyFolder is the same containment
 * check addPaths already uses to answer this exact question.
 */
function tracksUnderFolder(db: Db, folderPath: string): { id: number; playlist: string }[] {
  return dbAll<{ id: number; path: string; playlist: string }>(
    db, 'SELECT id, path, playlist FROM tracks', []
  ).filter((t) => isPathUnderAnyFolder(t.path, [folderPath]))
}

/**
 * Seed folder→playlist memberships for ONE library folder, exactly once.
 * Group the folder's tracks by their derived `playlist` (top subfolder name)
 * and add each to that playlist. INSERT OR IGNORE makes this safe against overlap
 * with seedLegacyPlaylists and against accidental re-runs. The caller gates this
 * on seeded_at and stamps it, so a user who later renames a folder-playlist never
 * sees it respawned by a routine rescan (the import-once contract).
 *
 * Uses the same containment test as removeLibraryFolder, and must keep doing so:
 * if seeding and removal disagreed about which tracks belong to a folder, a folder
 * could seed a playlist from tracks its own removal would never clean up.
 */
function seedFolderPlaylists(db: Db, folderPath: string): void {
  const groups = new Map<string, number[]>()
  for (const track of tracksUnderFolder(db, folderPath)) {
    // normalizeName is what ensurePlaylist will apply, and it throws on an empty
    // result. A directory named with only a non-breaking space trims to nothing,
    // and that throw would roll back the entire scan.
    if (!normalizeName(track.playlist ?? '')) continue
    const ids = groups.get(track.playlist)
    if (ids) ids.push(track.id)
    else groups.set(track.playlist, [track.id])
  }
  for (const [playlist, trackIds] of groups) {
    const playlistId = ensurePlaylist(db, playlist)
    for (const trackId of trackIds) {
      dbRun(
        db,
        'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)',
        [playlistId, trackId, Math.floor(Date.now() / 1000)]
      )
    }
  }
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

/**
 * Stop scanning a folder.
 *
 * A library folder is a *source* of songs and the name its playlist was seeded
 * from — it does not own them. So dropping the songs is the caller's explicit
 * choice, never implied by unregistering the root. `keepTracks` leaves them in
 * the library as ordinary folder-less tracks: same row ids, so they keep their
 * tags, their playlist memberships, and their place in "order added". That also
 * makes remove-then-re-add lossless, where before it renumbered every track and
 * cascaded its tags away.
 *
 * `keepTracks` is required rather than defaulted: a default would quietly pick a
 * semantic at every call site, and one of the two destroys data.
 */
export function removeLibraryFolder(folderPath: string, keepTracks: boolean): void {
  const db = getDb()
  db.transaction(() => {
    if (!keepTracks) {
      const drop = db.prepare('DELETE FROM tracks WHERE id = ?')
      for (const track of tracksUnderFolder(db, folderPath)) drop.run(track.id)
    }
    dbRun(db, 'DELETE FROM library_folders WHERE path = ?', [folderPath])
  })()
}

/**
 * The playlist bucket a file belongs to: its top subfolder name relative to the
 * scan root, or the root's own name when the file sits directly in it.
 *
 * The loose-file drop path passes the file's own parent as the root, so a dropped
 * song is bucketed by the folder it came from. That deliberately does NOT always
 * match what the walk would produce for the same file — a file two or more levels
 * under a scan root yields its immediate parent here and the top subfolder there.
 * Dropped files under a registered root are left to the walk precisely so the two
 * can't disagree; a file only gets the parent-folder answer while it belongs to
 * no root at all.
 */
function derivePlaylist(fullPath: string, root: string): string {
  const rel = fullPath.slice(root.length).replace(/^[/\\]/, '')
  const parts = rel.split(/[/\\]/)
  return parts.length > 1 ? parts[0] : basename(root)
}

/**
 * Every outcome that leaves the song present in the library carries the path it
 * lives at, so a caller can point the user straight at it — including the cases
 * where nothing was written, which are exactly the ones that otherwise look like
 * the app ignored the file.
 */
type IndexOutcome =
  | { status: 'indexed'; path: string }
  /** File unchanged since the last scan (mtime match) — already in the library. */
  | { status: 'unchanged'; path: string }
  /** A moved/renamed file was matched to its existing row by content uid. */
  | { status: 'relinked'; path: string }
  /** A byte-identical song is already indexed; `path` is where that one lives. */
  | { status: 'duplicate'; path: string }
  | { status: 'unreadable' }
  | { status: 'error'; message: string }

/**
 * Read one audio file's metadata and upsert its `tracks` row. This is the single
 * implementation of the uid contract (content fingerprint → survives rename/move,
 * keeps tags and playlist membership attached to the song rather than to a path),
 * shared by the folder walk and by the drop-a-loose-file path. Never throws: a
 * problematic file reports itself so one bad song can't roll back a whole scan.
 */
async function indexFile(db: Db, fullPath: string, playlist: string): Promise<IndexOutcome> {
  let mtime = 0, size = 0
  try { const st = statSync(fullPath); mtime = Math.floor(st.mtimeMs); size = st.size }
  catch { return { status: 'unreadable' } }

  const existing = dbGet<{ id: number; mtime: number }>(db, 'SELECT id, mtime FROM tracks WHERE path = ?', [fullPath])
  if (existing && existing.mtime === mtime) return { status: 'unchanged', path: fullPath }

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
          // id is preserved, so track_tags / playlist_tracks stay attached (and the
          // song keeps its original place in "order added").
          dbRun(
            db,
            `UPDATE tracks SET path=?, playlist=?, title=?, artist=?, album=?,
               duration=?, cover_path=COALESCE(?, cover_path), mtime=? WHERE id=?`,
            [fullPath, playlist, title, artist, album, duration, coverPath, mtime, byUid.id]
          )
          return { status: 'relinked', path: fullPath }
        }
        // else: a byte-identical file already exists — uid is UNIQUE, so we keep
        // the existing row and skip adding a duplicate (content-fingerprint tradeoff).
        return { status: 'duplicate', path: byUid.path }
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

    // NOTE: playlist membership is NOT seeded here. Per-new-track seeding on every
    // scan was the folder↔playlist drift footgun (a renamed folder-playlist
    // respawned when a new file landed in its folder). Seeding happens once per
    // folder in scanLibrary, gated by seeded_at.
    return { status: 'indexed', path: fullPath }
  } catch (e) {
    return { status: 'error', message: (e as Error).message }
  }
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
      const outcome = await indexFile(db, fullPath, derivePlaylist(fullPath, root))
      if (outcome.status === 'error' && stats.errors.length < 5) {
        stats.errors.push(`${fullPath}: ${outcome.message}`)
      }
    }
  }
}

export async function scanLibrary(): Promise<{ playlists: PlaylistSummary[]; tracks: TrackRow[]; summary: ScanSummary }> {
  const db = getDb()

  migrateCoversToDisk(db)
  seedLegacyPlaylists(db)
  // No early return when there are zero folders: tracks dropped in as loose files
  // belong to no folder, so the walk being empty must not stop us from purging,
  // reading the table, and returning what's there.
  const folders = listLibraryFolders()

  const summary: ScanSummary = { folders: folders.length, scanned: 0, errors: [] }

  // Manual BEGIN/COMMIT because db.transaction() doesn't support async callbacks
  db.exec('BEGIN')
  try {
    for (const folder of folders) {
      await walkDir(db, folder.path, folder.path, summary)
    }

    // Purge rows whose file is genuinely gone — and ONLY those. Dropping a row
    // cascades away its tags and playlist memberships (db.ts ON DELETE CASCADE);
    // a folder-scanned track comes back on the next walk, but a track that
    // belongs to no scan root would be gone for good.
    //
    // ENOENT alone does NOT mean "deleted": an unplugged USB drive and a
    // disconnected share report ENOENT for every path on them, so trusting it
    // would wipe an entire offline library. Require the containing directory to
    // still be there — that distinguishes one deleted file from a volume that
    // simply isn't mounted right now. Directory results are cached because whole
    // albums share a parent.
    const dirReachable = new Map<string, boolean>()
    const parentIsThere = (filePath: string): boolean => {
      const dir = dirname(filePath)
      const cached = dirReachable.get(dir)
      if (cached !== undefined) return cached
      let there = false
      try { statSync(dir); there = true } catch { there = false }
      dirReachable.set(dir, there)
      return there
    }

    const allPaths = dbAll<{ path: string }>(db, 'SELECT path FROM tracks', [])
    const purge = db.prepare('DELETE FROM tracks WHERE path = ?')
    for (const { path } of allPaths) {
      try { statSync(path) } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT' && parentIsThere(path)) {
          purge.run(path)
        }
      }
    }

    // Import-once seeding: each folder seeds its playlists exactly once — when
    // seeded_at IS NULL (freshly added, or removed+re-added). Already-seeded
    // folders are skipped so playlists the user renamed/edited are never
    // recreated or overwritten. `folders` carries seeded_at (listLibraryFolders
    // does SELECT *); runs after the walk so the folder's tracks all exist.
    for (const folder of folders) {
      if (!shouldSeedFolder(folder.seeded_at)) continue
      seedFolderPlaylists(db, folder.path)
      dbRun(db, "UPDATE library_folders SET seeded_at = strftime('%s','now') WHERE path = ?", [folder.path])
    }

    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  // ORDER BY id = the order songs were added. id is AUTOINCREMENT (db.ts) so it
  // is strictly monotonic and never reused, which makes it the only total,
  // stable "added" ordering available — added_at is 1-second granularity, so a
  // bulk import lands hundreds of rows on the same value.
  const roots = folders.map((f) => f.path)
  const tracks = dbAll(
    db,
    'SELECT id, path, playlist, title, artist, album, duration, cover_path, mtime FROM tracks ORDER BY id',
    []
  ).map((r) => rowToTrack(r, roots))
  const playlists = listPlaylists()

  return { playlists, tracks, summary }
}

export interface AddPathsResult {
  /** Folders newly registered as scan roots. */
  folders: number
  /** Loose files indexed straight into the library. */
  indexed: number
  /** Dropped files that were already in the library, unchanged. */
  unchanged: number
  /** Audio files already covered by a library folder — the scan owns those. */
  skipped: number
  /** A byte-identical song is already in the library under another path. */
  duplicates: number
  /** Dropped files that aren't .mp3 / .m4a. */
  unsupported: number
  /**
   * Where to point the user afterwards: the library path of the first dropped
   * song, whether it was just added or already there. Null only when nothing the
   * user dropped ended up in the library.
   */
  revealPath: string | null
  errors: string[]
}

/**
 * Take whatever the user dropped on the window and make it part of the library.
 *
 * Folders become scan roots exactly as before. Individual audio files are indexed
 * directly, with no folder registered — the library deliberately supports tracks
 * that belong to no scan root, so "drag a couple of songs in" doesn't force the
 * user to adopt their whole containing directory. A dropped file that already
 * sits under a registered folder is left alone: the rescan that follows owns it,
 * and letting it derive its own `playlist` here would disagree with walkDir's
 * (relative-to-root) value that the mtime short-circuit would then never correct.
 */
export async function addPaths(paths: string[]): Promise<AddPathsResult> {
  const db = getDb()
  const result: AddPathsResult = {
    folders: 0, indexed: 0, unchanged: 0, skipped: 0, duplicates: 0, unsupported: 0,
    revealPath: null, errors: [],
  }

  const dirs: string[] = []
  const files: string[] = []
  for (const path of paths) {
    let isDir = false
    try { isDir = statSync(path).isDirectory() }
    catch (e) {
      if (result.errors.length < 5) result.errors.push(`${path}: ${(e as Error).message}`)
      continue
    }
    if (isDir) dirs.push(path)
    else if (AUDIO_EXTS.has(extname(path).toLowerCase())) files.push(path)
    else result.unsupported++
  }

  // Shortest path first so a parent always registers before its children (a child
  // is strictly longer), letting the containment check drop the children of a
  // folder dropped alongside them — otherwise one gesture registers overlapping
  // roots that walk the same files twice. Note this only collapses downward:
  // dropping a folder that CONTAINS an already-registered root still adds it,
  // same as picking that folder from the dialog would.
  dirs.sort((a, b) => a.length - b.length)
  const roots = listLibraryFolders().map((f) => f.path)
  for (const dir of dirs) {
    if (isPathUnderAnyFolder(dir, roots)) continue
    addLibraryFolder(dir)
    roots.push(dir)
    result.folders++
  }

  // Deliberately NOT wrapped in a transaction. indexFile awaits metadata reads, so
  // a manual BEGIN would stay open across the event loop — and better-sqlite3 has
  // one connection, so a scan starting meanwhile (boot, the downloader's rescan,
  // the rescan button) would throw "cannot start a transaction within a
  // transaction" and lose the drop. Each file autocommits instead: a drop that
  // fails part-way leaves the songs it did index, which is the better outcome here.
  for (const file of files) {
    if (isPathUnderAnyFolder(file, roots)) {
      // Already covered by a scan root — the rescan indexes it with the playlist
      // derived from that root, which is the value walkDir would have used.
      result.skipped++
      if (!result.revealPath) result.revealPath = file
      continue
    }
    const outcome = await indexFile(db, file, derivePlaylist(file, dirname(file)))
    switch (outcome.status) {
      case 'indexed':
      case 'relinked':
        result.indexed++
        break
      case 'unchanged':
        result.unchanged++
        break
      case 'duplicate':
        result.duplicates++
        break
      case 'unreadable':
        if (result.errors.length < 5) result.errors.push(`${file}: could not be read`)
        break
      case 'error':
        if (result.errors.length < 5) result.errors.push(`${file}: ${outcome.message}`)
        break
    }
    // Every non-failing outcome means the song IS in the library at outcome.path
    // (for a duplicate, under the name it was first indexed as).
    if (outcome.status !== 'unreadable' && outcome.status !== 'error' && !result.revealPath) {
      result.revealPath = outcome.path
    }
  }

  return result
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
  return row ? rowToTrack(row as Record<string, unknown>, folderPaths()) : null
}

export function getTrackPath(id: number): string | null {
  const db = getDb()
  return dbGet<{ path: string }>(db, 'SELECT path FROM tracks WHERE id = ?', [id])?.path ?? null
}

/** Delete a track row. ON DELETE CASCADE cleans its playlist + tag memberships. */
export function deleteTrackRow(id: number): void {
  const db = getDb()
  dbRun(db, 'DELETE FROM tracks WHERE id = ?', [id])
}

/**
 * Take a song out of the library without touching the file on disk.
 *
 * Refuses a track any library folder still covers, and that refusal is the whole
 * point: the next scan would walk that file straight back in with a fresh id,
 * having already cascaded away the tags and playlist memberships the user built.
 * The way out of a folder is to stop scanning the folder.
 */
export function removeTrackFromLibrary(id: number): { ok: boolean; reason?: string } {
  const db = getDb()
  const track = dbGet<{ path: string }>(db, 'SELECT path FROM tracks WHERE id = ?', [id])
  if (!track) return { ok: false, reason: 'Track not found' }
  if (isPathUnderAnyFolder(track.path, folderPaths())) {
    return { ok: false, reason: 'That song is in a library folder — remove the folder instead.' }
  }
  deleteTrackRow(id)
  return { ok: true }
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

export function renamePlaylist(playlistId: number, name: string): PlaylistSummary {
  const db = getDb()
  const clean = normalizeName(name)
  if (!clean) throw new Error('Playlist name is required')
  // Case-insensitive collision check (excluding self) — friendlier than the
  // case-sensitive UNIQUE(name) constraint, which is the final backstop.
  const clash = dbGet<{ id: number }>(
    db,
    'SELECT id FROM playlists WHERE lower(name) = lower(?) AND id <> ?',
    [clean, playlistId]
  )
  if (clash) throw new Error('A playlist with that name already exists')
  dbRun(db, 'UPDATE playlists SET name = ? WHERE id = ?', [clean, playlistId])
  return dbGet<PlaylistSummary>(
    db,
    `SELECT p.id, p.name, COUNT(pt.track_id) AS count
     FROM playlists p
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     WHERE p.id = ?
     GROUP BY p.id, p.name`,
    [playlistId]
  )!
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
  const roots = folderPaths()
  return rows.map((r) => rowToTrack(r, roots))
}

export function addTrackToPlaylist(playlistId: number, trackId: number): void {
  const db = getDb()
  dbRun(
    db,
    'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)',
    [playlistId, trackId, Math.floor(Date.now() / 1000)]
  )
}

/**
 * Add tracks (by file path) to a playlist by name, creating it if needed.
 * Path-based so the downloader can drop a finished batch into the "Downloaded"
 * bucket after the post-download rescan inserts the rows. INSERT OR IGNORE keeps
 * repeat downloads idempotent (no duplicate memberships). Returns the count of
 * memberships newly added.
 */
export function addPathsToPlaylist(playlistName: string, paths: string[]): { added: number } {
  const db = getDb()
  if (!paths.length) return { added: 0 }
  let added = 0
  db.transaction(() => {
    const playlistId = ensurePlaylist(db, playlistName)
    const now = Math.floor(Date.now() / 1000)
    for (const path of paths) {
      const track = dbGet<{ id: number }>(db, 'SELECT id FROM tracks WHERE path = ?', [path])
      if (!track) continue
      const res = db
        .prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_at) VALUES (?, ?, ?)')
        .run(playlistId, track.id, now)
      added += res.changes
    }
  })()
  return { added }
}

export function getPlaylistIdsForTrack(trackId: number): number[] {
  const db = getDb()
  return dbAll<{ playlist_id: number }>(
    db,
    'SELECT playlist_id FROM playlist_tracks WHERE track_id = ?',
    [trackId]
  ).map((r) => r.playlist_id)
}

export function removeTrackFromPlaylist(playlistId: number, trackId: number): void {
  const db = getDb()
  dbRun(db, 'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [playlistId, trackId])
}

export function createTag(name: string, kind: string): TagRow {
  const db = getDb()
  const clean = normalizeName(name)
  if (!clean) throw new Error('Tag name is required')
  // Reuse a case-insensitive match so "rock"/"Rock" collapse to one tag, matching
  // renameTag's contract (same reasoning as ensurePlaylist).
  const existing = dbGet<TagRow>(db, 'SELECT * FROM tags WHERE lower(name) = lower(?)', [clean])
  if (existing) return existing
  dbRun(db, 'INSERT OR IGNORE INTO tags (name, kind) VALUES (?, ?)', [clean, kind])
  return dbGet<TagRow>(db, 'SELECT * FROM tags WHERE name = ?', [clean])!
}

export function deleteTag(tagId: number): void {
  const db = getDb()
  dbRun(db, 'DELETE FROM tags WHERE id = ?', [tagId])
}

export function renameTag(tagId: number, name: string): TagRow {
  const db = getDb()
  const clean = normalizeName(name)
  if (!clean) throw new Error('Tag name is required')
  // Case-insensitive collision check (excluding self); UNIQUE(name) is the backstop.
  const clash = dbGet<{ id: number }>(
    db,
    'SELECT id FROM tags WHERE lower(name) = lower(?) AND id <> ?',
    [clean, tagId]
  )
  if (clash) throw new Error('A tag with that name already exists')
  dbRun(db, 'UPDATE tags SET name = ? WHERE id = ?', [clean, tagId])
  return dbGet<TagRow>(db, 'SELECT * FROM tags WHERE id = ?', [tagId])!
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
  const roots = folderPaths()
  return rows.map((r) => rowToTrack(r, roots))
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
