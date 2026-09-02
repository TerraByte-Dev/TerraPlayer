export interface Track {
  id: number
  path: string
  playlist: string
  title: string
  artist: string
  album: string
  duration: number
  coverUrl: string | null
  mtime: number
  /** No library folder covers this file — it can be removed without deleting it. */
  loose: boolean
}

export interface PlaylistSummary {
  id: number
  name: string
  count: number
}

export interface Tag {
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

/** Outcome of dropping a mixed bag of folders and loose audio files on the window. */
export interface AddPathsResult {
  folders: number
  indexed: number
  unchanged: number
  skipped: number
  duplicates: number
  unsupported: number
  /** Library path of the first dropped song, added or already present. */
  revealPath: string | null
  errors: string[]
}

export type TagKind = 'genre' | 'mood' | 'custom'

export interface StandardTags {
  title?: string
  artist?: string
  album?: string
  year?: number
}

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
  bounds: { x: number; y: number; width: number; height: number }
}

export interface QueueSnapshotTrack {
  id?: number
  title: string
  artist: string
  duration: number
  coverUrl: string | null
}

export interface PlaybackSnapshot {
  isPlaying: boolean
  title: string
  artist: string
  coverUrl: string | null
  currentTime: number
  duration: number
  volume: number
  queue: {
    nowPlaying: QueueSnapshotTrack | null
    upNext: QueueSnapshotTrack[]
    comingUp: QueueSnapshotTrack[]
  }
}

// --- Music downloader -------------------------------------------------------

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'PINNED'

export interface PreflightCheck {
  id: string
  ok: boolean
  severity: 'ok' | 'warn' | 'error'
  label: string
  detail: string
  fix?: { kind: 'pip' | 'winget' | 'manual' | 'login'; tool?: string; command?: string }
}

export interface DownloaderPreflight {
  ok: boolean
  problems: string[]
  checks: PreflightCheck[]
}

export interface CookieOpts {
  cookiesFromBrowser?: string
  cookiesFile?: string
}

export interface AuthStatus {
  method: 'in-app' | 'browser' | 'file'
  browser?: string
  file?: string
  connected: boolean
}

export interface ConnectResult {
  ok: boolean
  detail: string
  status: AuthStatus
}

/** Streamed while "Fix it for me" installs tools. */
export type InstallEvent =
  | { tool: string; status: 'start'; command: string }
  | { tool: string; line: string }
  | { tool: string; status: 'finished'; code: number }
  | { status: 'complete' }

/** One previewed song row (from a --json --dry-run resolve). */
export interface ResolvedRow {
  i: number
  query: string
  id: string | null
  title: string | null
  channel: string | null
  album: string | null
  duration: number | null
  confidence: Confidence
  source: string
  explicit: boolean | null
  stem: string | null
  status: string // 'preview' | 'skipped' | 'failed'
  reason?: string
}

/** One alternate version for the "swap version" picker. */
export interface DownloaderCandidate {
  source: string
  id: string
  artist: string
  title: string
  album: string | null
  duration: number | null
  explicit: boolean | null
  confidence: Confidence
}

/** NDJSON events streamed during a download. */
export type DownloaderEvent =
  | { event: 'preflight'; ok: boolean; problems: string[] }
  | { event: 'resolved'; i: number; id: string; stem: string; confidence: Confidence; [k: string]: unknown }
  | { event: 'candidates'; query: string; candidates: DownloaderCandidate[] }
  | { event: 'stage'; i: number; id: string; stage: string }
  | { event: 'progress'; i: number; id: string; pct: number }
  | { event: 'done'; i: number; status: string; stem: string; path: string | null; query?: string; reason?: string; confidence?: Confidence }
  | { event: 'summary'; new: number; skipped: number; failed: number; low_confidence: string[] }
  | { event: 'closed'; code: number | null }
  | { event: 'fatal'; message: string }

export type VisualizerCommand =
  | { type: 'prev' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'seek'; time: number }
  | { type: 'volume'; volume: number }
  // section+index address the snapshot row the popout actually rendered; `id` is the
  // staleness guard the main window checks before it removes anything.
  | { type: 'queueRemove'; section: 'upNext' | 'comingUp'; index: number; id?: number }
  // The popout asks for a snapshot once it has actually booted — the open-time publish
  // races the window's renderer and is dropped, which left a paused popout showing an
  // empty queue (and no rows to click) until playback resumed.
  | { type: 'requestState' }

declare global {
  interface Window {
    hub: {
      scanLibrary(): Promise<{ playlists: PlaylistSummary[]; tracks: Track[]; summary: ScanSummary }>
      refreshTrack(path: string): Promise<Track | null>
      listFolders(): Promise<LibraryFolder[]>
      addFolder(path: string): Promise<LibraryFolder[]>
      addPaths(paths: string[]): Promise<AddPathsResult>
      removeFolder(path: string, keepTracks: boolean): Promise<void>
      removeTrackFromLibrary(trackId: number): Promise<{ ok: boolean; reason?: string; cancelled?: boolean }>
      pickFolder(): Promise<string | null>
      suggestMusicFolder(): Promise<{ path: string; exists: boolean }>
      getDriveStats(): Promise<{ totalBytes: number }>
      isPathInLibrary(path: string): Promise<boolean>
      deleteTrack(trackId: number): Promise<{ ok?: boolean; path?: string; reason?: string; cancelled?: boolean }>
      getPathForFile(file: File): string
      writeTags(path: string, tags: StandardTags): Promise<void>
      listTags(): Promise<Tag[]>
      createTag(name: string, kind: TagKind): Promise<Tag>
      deleteTag(tagId: number): Promise<void>
      renameTag(tagId: number, name: string): Promise<Tag>
      getTrackTags(trackId: number): Promise<Tag[]>
      setTrackTags(trackId: number, tagIds: number[]): Promise<void>
      getTracksForTag(tagId: number): Promise<Track[]>
      listPlaylists(): Promise<PlaylistSummary[]>
      createPlaylist(name: string): Promise<PlaylistSummary>
      deletePlaylist(playlistId: number): Promise<void>
      renamePlaylist(playlistId: number, name: string): Promise<PlaylistSummary>
      getTracksForPlaylist(playlistId: number): Promise<Track[]>
      addTrackToPlaylist(playlistId: number, trackId: number): Promise<void>
      addPathsToPlaylist(playlistName: string, paths: string[]): Promise<{ added: number }>
      getPlaylistIdsForTrack(trackId: number): Promise<number[]>
      removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void>
      // App utilities
      uninstallApp(): Promise<{ ok: boolean; reason?: string }>
      revealInFolder(path: string): Promise<void>
      openExternal(url: string): Promise<void>
      saveImage(dataUrl: string, defaultName: string): Promise<string | null>
      minimizeWindow(): Promise<void>
      maximizeWindow(): Promise<void>
      closeWindow(): Promise<void>
      /** Recolor the native Windows titlebar overlay glyphs to the theme accent. */
      setTitleBarOverlay(symbolColor: string): void
      isWindows: boolean
      // Music downloader
      downloaderPreflight(opts?: CookieOpts & { noAuthProbe?: boolean }): Promise<DownloaderPreflight>
      downloaderInstall(tools: string[], cookieOpts?: CookieOpts): Promise<DownloaderPreflight>
      ytauthStatus(): Promise<AuthStatus>
      ytauthConnect(): Promise<ConnectResult>
      ytauthDisconnect(): Promise<AuthStatus>
      ytauthSetBrowser(browser: string): Promise<AuthStatus>
      ytauthDetectBrowsers(): Promise<string[]>
      ytauthImport(): Promise<AuthStatus>
      downloaderResolve(payload: { lines?: string[]; csvPath?: string }): Promise<{ rows: ResolvedRow[]; problems: string[]; error?: string }>
      downloaderCandidates(query: string): Promise<DownloaderCandidate[]>
      downloaderDownload(rows: { stem: string; id: string }[], outDir: string, cookieOpts?: CookieOpts): Promise<{ summary: { new: number; skipped: number; failed: number; low_confidence: string[] } | null; error?: string }>
      downloaderCancel(): Promise<{ cancelled: boolean }>
      downloaderResolveOutDir(): Promise<string>
      downloaderReadText(path: string): Promise<string>
      onDownloaderEvent(cb: (e: DownloaderEvent) => void): () => void
      onDownloaderInstallEvent(cb: (e: InstallEvent) => void): () => void
      // Visualizer / display
      listDisplays(): Promise<DisplayInfo[]>
      openVisualizerPopout(displayId: number): Promise<void>
      closeVisualizerPopout(): Promise<void>
      setMainFullscreen(fullscreen: boolean): Promise<void>
      onMainFullscreenChange(cb: (fullscreen: boolean) => void): () => void
      onPopoutClosed(cb: () => void): () => void
      publishAudioFrame(buf: Uint8Array): void
      onAudioFrame(cb: (buf: Uint8Array) => void): () => void
      publishPlaybackState(state: PlaybackSnapshot): void
      onPlaybackState(cb: (state: PlaybackSnapshot) => void): () => void
      sendVisualizerCommand(command: VisualizerCommand): void
      onVisualizerCommand(cb: (command: VisualizerCommand) => void): () => void
      publishTheme(id: string): void
      onThemeChange(cb: (id: string) => void): () => void
      onRequestTheme(cb: () => void): () => void
      // Updater
      getAppVersion(): Promise<string>
      checkForUpdate(): Promise<{ available: boolean; devMode?: boolean }>
      downloadUpdate(): Promise<void>
      installUpdate(): Promise<void>
      onUpdateAvailable(cb: (info: { version: string }) => void): () => void
      onUpdateNotAvailable(cb: () => void): () => void
      onUpdateProgress(cb: (info: { percent: number }) => void): () => void
      onUpdateDownloaded(cb: () => void): () => void
      onUpdateError(cb: (info: { message: string }) => void): () => void
    }
  }
}

export const hub = {
  scanLibrary: () => window.hub.scanLibrary(),
  refreshTrack: (path: string) => window.hub.refreshTrack(path),
  listFolders: () => window.hub.listFolders(),
  addFolder: (path: string) => window.hub.addFolder(path),
  addPaths: (paths: string[]) => window.hub.addPaths(paths),
  removeFolder: (path: string, keepTracks: boolean) => window.hub.removeFolder(path, keepTracks),
  removeTrackFromLibrary: (trackId: number) => window.hub.removeTrackFromLibrary(trackId),
  pickFolder: () => window.hub.pickFolder(),
  suggestMusicFolder: () => window.hub.suggestMusicFolder(),
  getDriveStats: () => window.hub.getDriveStats(),
  deleteTrack: (trackId: number) => window.hub.deleteTrack(trackId),
  getPathForFile: (file: File) => window.hub.getPathForFile(file),
  writeTags: (path: string, tags: StandardTags) => window.hub.writeTags(path, tags),
  listTags: () => window.hub.listTags(),
  createTag: (name: string, kind: TagKind) => window.hub.createTag(name, kind),
  deleteTag: (tagId: number) => window.hub.deleteTag(tagId),
  renameTag: (tagId: number, name: string) => window.hub.renameTag(tagId, name),
  getTrackTags: (trackId: number) => window.hub.getTrackTags(trackId),
  setTrackTags: (trackId: number, tagIds: number[]) => window.hub.setTrackTags(trackId, tagIds),
  getTracksForTag: (tagId: number) => window.hub.getTracksForTag(tagId),
  listPlaylists: () => window.hub.listPlaylists(),
  createPlaylist: (name: string) => window.hub.createPlaylist(name),
  deletePlaylist: (playlistId: number) => window.hub.deletePlaylist(playlistId),
  renamePlaylist: (playlistId: number, name: string) =>
    window.hub.renamePlaylist(playlistId, name),
  getTracksForPlaylist: (playlistId: number) => window.hub.getTracksForPlaylist(playlistId),
  addTrackToPlaylist: (playlistId: number, trackId: number) =>
    window.hub.addTrackToPlaylist(playlistId, trackId),
  addPathsToPlaylist: (playlistName: string, paths: string[]) =>
    window.hub.addPathsToPlaylist(playlistName, paths),
  getPlaylistIdsForTrack: (trackId: number) => window.hub.getPlaylistIdsForTrack(trackId),
  removeTrackFromPlaylist: (playlistId: number, trackId: number) =>
    window.hub.removeTrackFromPlaylist(playlistId, trackId),
  isPathInLibrary: (path: string) => window.hub.isPathInLibrary(path),
  saveImage: (dataUrl: string, defaultName: string) =>
    window.hub.saveImage(dataUrl, defaultName),
  openExternal: (url: string) => window.hub.openExternal(url),
  // Music downloader
  downloaderPreflight: (opts?: CookieOpts & { noAuthProbe?: boolean }) =>
    window.hub.downloaderPreflight(opts),
  downloaderInstall: (tools: string[], cookieOpts?: CookieOpts) =>
    window.hub.downloaderInstall(tools, cookieOpts),
  ytauthStatus: () => window.hub.ytauthStatus(),
  ytauthConnect: () => window.hub.ytauthConnect(),
  ytauthDisconnect: () => window.hub.ytauthDisconnect(),
  ytauthSetBrowser: (browser: string) => window.hub.ytauthSetBrowser(browser),
  ytauthDetectBrowsers: () => window.hub.ytauthDetectBrowsers(),
  ytauthImport: () => window.hub.ytauthImport(),
  downloaderResolve: (payload: { lines?: string[]; csvPath?: string }) =>
    window.hub.downloaderResolve(payload),
  downloaderCandidates: (query: string) => window.hub.downloaderCandidates(query),
  downloaderDownload: (rows: { stem: string; id: string }[], outDir: string, cookieOpts?: CookieOpts) =>
    window.hub.downloaderDownload(rows, outDir, cookieOpts),
  downloaderCancel: () => window.hub.downloaderCancel(),
  downloaderResolveOutDir: () => window.hub.downloaderResolveOutDir(),
  downloaderReadText: (path: string) => window.hub.downloaderReadText(path),
  onDownloaderEvent: (cb: (e: DownloaderEvent) => void) => window.hub.onDownloaderEvent(cb),
  onDownloaderInstallEvent: (cb: (e: InstallEvent) => void) => window.hub.onDownloaderInstallEvent(cb),
}

export function trackUrl(path: string): string {
  return `hub://localhost/${encodeURIComponent(path)}`
}

export function fmtDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
