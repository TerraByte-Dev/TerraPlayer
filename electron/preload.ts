import { contextBridge, ipcRenderer, webUtils, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('hub', {
  // Library
  scanLibrary: () => ipcRenderer.invoke('lib:scan'),
  refreshTrack: (path: string) => ipcRenderer.invoke('lib:refreshTrack', path),
  listFolders: () => ipcRenderer.invoke('lib:listFolders'),
  addFolder: (path: string) => ipcRenderer.invoke('lib:addFolder', path),
  removeFolder: (path: string) => ipcRenderer.invoke('lib:removeFolder', path),
  pickFolder: () => ipcRenderer.invoke('lib:pickFolder'),
  suggestMusicFolder: () => ipcRenderer.invoke('lib:suggestMusicFolder'),
  getDriveStats: () => ipcRenderer.invoke('lib:getDriveStats'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  writeTags: (path: string, tags: Record<string, string | number>) =>
    ipcRenderer.invoke('meta:writeTags', path, tags),
  listTags: () => ipcRenderer.invoke('tag:list'),
  createTag: (name: string, kind: string) => ipcRenderer.invoke('tag:create', name, kind),
  deleteTag: (tagId: number) => ipcRenderer.invoke('tag:delete', tagId),
  renameTag: (tagId: number, name: string) => ipcRenderer.invoke('tag:rename', tagId, name),
  getTrackTags: (trackId: number) => ipcRenderer.invoke('tag:getForTrack', trackId),
  setTrackTags: (trackId: number, tagIds: number[]) =>
    ipcRenderer.invoke('tag:setForTrack', trackId, tagIds),
  getTracksForTag: (tagId: number) => ipcRenderer.invoke('tag:getTracksForTag', tagId),
  listPlaylists: () => ipcRenderer.invoke('playlist:list'),
  createPlaylist: (name: string) => ipcRenderer.invoke('playlist:create', name),
  deletePlaylist: (playlistId: number) => ipcRenderer.invoke('playlist:delete', playlistId),
  renamePlaylist: (playlistId: number, name: string) =>
    ipcRenderer.invoke('playlist:rename', playlistId, name),
  getTracksForPlaylist: (playlistId: number) => ipcRenderer.invoke('playlist:getTracks', playlistId),
  addTrackToPlaylist: (playlistId: number, trackId: number) =>
    ipcRenderer.invoke('playlist:addTrack', playlistId, trackId),
  addPathsToPlaylist: (playlistName: string, paths: string[]) =>
    ipcRenderer.invoke('playlist:addPaths', playlistName, paths),
  getPlaylistIdsForTrack: (trackId: number) =>
    ipcRenderer.invoke('playlist:idsForTrack', trackId),
  removeTrackFromPlaylist: (playlistId: number, trackId: number) =>
    ipcRenderer.invoke('playlist:removeTrack', playlistId, trackId),
  isPathInLibrary: (path: string) => ipcRenderer.invoke('lib:isPathInLibrary', path),
  deleteTrack: (trackId: number) => ipcRenderer.invoke('lib:deleteTrack', trackId),

  // Music downloader
  downloaderPreflight: (opts?: { cookiesFromBrowser?: string; cookiesFile?: string; noAuthProbe?: boolean }) =>
    ipcRenderer.invoke('dl:preflight', opts),
  downloaderInstall: (tools: string[], cookieOpts?: { cookiesFromBrowser?: string; cookiesFile?: string }) =>
    ipcRenderer.invoke('dl:install', tools, cookieOpts),
  // YouTube auth
  ytauthStatus: () => ipcRenderer.invoke('ytauth:status'),
  ytauthConnect: () => ipcRenderer.invoke('ytauth:connect'),
  ytauthDisconnect: () => ipcRenderer.invoke('ytauth:disconnect'),
  ytauthSetBrowser: (browser: string) => ipcRenderer.invoke('ytauth:setBrowser', browser),
  ytauthDetectBrowsers: () => ipcRenderer.invoke('ytauth:detectBrowsers'),
  ytauthImport: () => ipcRenderer.invoke('ytauth:import'),
  downloaderResolve: (payload: { lines?: string[]; csvPath?: string }) =>
    ipcRenderer.invoke('dl:resolve', payload),
  downloaderCandidates: (query: string) => ipcRenderer.invoke('dl:candidates', query),
  downloaderDownload: (
    rows: { stem: string; id: string }[],
    outDir: string,
    cookieOpts?: { cookiesFromBrowser?: string; cookiesFile?: string }
  ) => ipcRenderer.invoke('dl:download', rows, outDir, cookieOpts),
  downloaderCancel: () => ipcRenderer.invoke('dl:cancel'),
  downloaderResolveOutDir: () => ipcRenderer.invoke('dl:resolveOutDir'),
  downloaderReadText: (path: string) => ipcRenderer.invoke('dl:readText', path),
  onDownloaderEvent: (cb: (e: Record<string, unknown>) => void) => {
    const handler = (_: IpcRendererEvent, e: Record<string, unknown>) => cb(e)
    ipcRenderer.on('dl:event', handler)
    return () => ipcRenderer.off('dl:event', handler)
  },
  onDownloaderInstallEvent: (cb: (e: Record<string, unknown>) => void) => {
    const handler = (_: IpcRendererEvent, e: Record<string, unknown>) => cb(e)
    ipcRenderer.on('dl:install-event', handler)
    return () => ipcRenderer.off('dl:install-event', handler)
  },

  // Displays
  listDisplays: () => ipcRenderer.invoke('displays:list'),

  // Visualizer - fullscreen on the main window
  setMainFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('viz:fullscreen-set', fullscreen),
  onMainFullscreenChange: (cb: (fullscreen: boolean) => void) => {
    const handler = (_: IpcRendererEvent, fs: boolean) => cb(fs)
    ipcRenderer.on('viz:fullscreen-change', handler)
    return () => ipcRenderer.off('viz:fullscreen-change', handler)
  },

  // Visualizer — popout window
  openVisualizerPopout: (displayId: number) => ipcRenderer.invoke('viz:popout', displayId),
  closeVisualizerPopout: () => ipcRenderer.invoke('viz:close'),
  onPopoutClosed: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('viz:popout-closed', handler)
    return () => ipcRenderer.off('viz:popout-closed', handler)
  },

  // App utilities
  uninstallApp: (): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke('app:uninstall'),
  revealInFolder: (path: string) => ipcRenderer.invoke('app:revealInFolder', path),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  saveImage: (dataUrl: string, defaultName: string) =>
    ipcRenderer.invoke('app:saveImage', dataUrl, defaultName),
  minimizeWindow: () => ipcRenderer.invoke('win:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('win:maximize'),
  closeWindow: () => ipcRenderer.invoke('win:close'),
  setTitleBarOverlay: (symbolColor: string) => ipcRenderer.send('win:set-overlay', symbolColor),
  isWindows: process.platform === 'win32',

  // Audio frame publishing (main renderer → main process → viz window)
  publishAudioFrame: (buf: Uint8Array) => ipcRenderer.send('viz:audio-frame', buf),
  onAudioFrame: (cb: (buf: Uint8Array) => void) => {
    const handler = (_: IpcRendererEvent, buf: Uint8Array) => cb(buf)
    ipcRenderer.on('viz:audio-frame', handler)
    return () => ipcRenderer.off('viz:audio-frame', handler)
  },
  publishPlaybackState: (state: unknown) => ipcRenderer.send('viz:playback-state', state),
  onPlaybackState: (cb: (state: unknown) => void) => {
    const handler = (_: IpcRendererEvent, state: unknown) => cb(state)
    ipcRenderer.on('viz:playback-state', handler)
    return () => ipcRenderer.off('viz:playback-state', handler)
  },
  sendVisualizerCommand: (command: unknown) => ipcRenderer.send('viz:control', command),
  onVisualizerCommand: (cb: (command: unknown) => void) => {
    const handler = (_: IpcRendererEvent, command: unknown) => cb(command)
    ipcRenderer.on('viz:control', handler)
    return () => ipcRenderer.off('viz:control', handler)
  },
  // Theme sync (main renderer → main process → viz window) so the popout recolors with the app.
  publishTheme: (id: string) => ipcRenderer.send('viz:theme', id),
  onThemeChange: (cb: (id: string) => void) => {
    const handler = (_: IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on('viz:theme', handler)
    return () => ipcRenderer.off('viz:theme', handler)
  },
  // A freshly-opened popout pings this; the main renderer answers by re-publishing the current theme.
  onRequestTheme: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('viz:request-theme', handler)
    return () => ipcRenderer.off('viz:request-theme', handler)
  },

  // Updater
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('updater:get-version'),
  checkForUpdate: (): Promise<{ available: boolean; devMode?: boolean }> =>
    ipcRenderer.invoke('updater:check'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (cb: (info: { version: string }) => void) => {
    const handler = (_: IpcRendererEvent, info: { version: string }) => cb(info)
    ipcRenderer.on('updater:available', handler)
    return () => ipcRenderer.off('updater:available', handler)
  },
  onUpdateNotAvailable: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('updater:not-available', handler)
    return () => ipcRenderer.off('updater:not-available', handler)
  },
  onUpdateProgress: (cb: (info: { percent: number }) => void) => {
    const handler = (_: IpcRendererEvent, info: { percent: number }) => cb(info)
    ipcRenderer.on('updater:progress', handler)
    return () => ipcRenderer.off('updater:progress', handler)
  },
  onUpdateDownloaded: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('updater:downloaded', handler)
    return () => ipcRenderer.off('updater:downloaded', handler)
  },
  onUpdateError: (cb: (info: { message: string }) => void) => {
    const handler = (_: IpcRendererEvent, info: { message: string }) => cb(info)
    ipcRenderer.on('updater:error', handler)
    return () => ipcRenderer.off('updater:error', handler)
  },
})
