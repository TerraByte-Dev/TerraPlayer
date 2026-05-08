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

export type VisualizerCommand =
  | { type: 'prev' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'seek'; time: number }
  | { type: 'volume'; volume: number }

declare global {
  interface Window {
    hub: {
      scanLibrary(): Promise<{ playlists: PlaylistSummary[]; tracks: Track[]; summary: ScanSummary }>
      refreshTrack(path: string): Promise<Track | null>
      listFolders(): Promise<LibraryFolder[]>
      addFolder(path: string): Promise<LibraryFolder[]>
      removeFolder(path: string): Promise<void>
      pickFolder(): Promise<string | null>
      suggestMusicFolder(): Promise<{ path: string; exists: boolean }>
      getDriveStats(): Promise<{ totalBytes: number }>
      getPathForFile(file: File): string
      writeTags(path: string, tags: StandardTags): Promise<void>
      listTags(): Promise<Tag[]>
      createTag(name: string, kind: TagKind): Promise<Tag>
      deleteTag(tagId: number): Promise<void>
      getTrackTags(trackId: number): Promise<Tag[]>
      setTrackTags(trackId: number, tagIds: number[]): Promise<void>
      getTracksForTag(tagId: number): Promise<Track[]>
      listPlaylists(): Promise<PlaylistSummary[]>
      createPlaylist(name: string): Promise<PlaylistSummary>
      deletePlaylist(playlistId: number): Promise<void>
      getTracksForPlaylist(playlistId: number): Promise<Track[]>
      addTrackToPlaylist(playlistId: number, trackId: number): Promise<void>
      removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void>
      // App utilities
      uninstallApp(): Promise<{ ok: boolean; reason?: string }>
      revealInFolder(path: string): Promise<void>
      saveImage(dataUrl: string, defaultName: string): Promise<string | null>
      minimizeWindow(): Promise<void>
      maximizeWindow(): Promise<void>
      closeWindow(): Promise<void>
      isWindows: boolean
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
  removeFolder: (path: string) => window.hub.removeFolder(path),
  pickFolder: () => window.hub.pickFolder(),
  suggestMusicFolder: () => window.hub.suggestMusicFolder(),
  getDriveStats: () => window.hub.getDriveStats(),
  getPathForFile: (file: File) => window.hub.getPathForFile(file),
  writeTags: (path: string, tags: StandardTags) => window.hub.writeTags(path, tags),
  listTags: () => window.hub.listTags(),
  createTag: (name: string, kind: TagKind) => window.hub.createTag(name, kind),
  deleteTag: (tagId: number) => window.hub.deleteTag(tagId),
  getTrackTags: (trackId: number) => window.hub.getTrackTags(trackId),
  setTrackTags: (trackId: number, tagIds: number[]) => window.hub.setTrackTags(trackId, tagIds),
  getTracksForTag: (tagId: number) => window.hub.getTracksForTag(tagId),
  listPlaylists: () => window.hub.listPlaylists(),
  createPlaylist: (name: string) => window.hub.createPlaylist(name),
  deletePlaylist: (playlistId: number) => window.hub.deletePlaylist(playlistId),
  getTracksForPlaylist: (playlistId: number) => window.hub.getTracksForPlaylist(playlistId),
  addTrackToPlaylist: (playlistId: number, trackId: number) =>
    window.hub.addTrackToPlaylist(playlistId, trackId),
  removeTrackFromPlaylist: (playlistId: number, trackId: number) =>
    window.hub.removeTrackFromPlaylist(playlistId, trackId),
  saveImage: (dataUrl: string, defaultName: string) =>
    window.hub.saveImage(dataUrl, defaultName),
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
