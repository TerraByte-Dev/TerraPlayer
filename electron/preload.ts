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
  getTrackTags: (trackId: number) => ipcRenderer.invoke('tag:getForTrack', trackId),
  setTrackTags: (trackId: number, tagIds: number[]) =>
    ipcRenderer.invoke('tag:setForTrack', trackId, tagIds),
  getTracksForTag: (tagId: number) => ipcRenderer.invoke('tag:getTracksForTag', tagId),
  listPlaylists: () => ipcRenderer.invoke('playlist:list'),
  createPlaylist: (name: string) => ipcRenderer.invoke('playlist:create', name),
  deletePlaylist: (playlistId: number) => ipcRenderer.invoke('playlist:delete', playlistId),
  getTracksForPlaylist: (playlistId: number) => ipcRenderer.invoke('playlist:getTracks', playlistId),
  addTrackToPlaylist: (playlistId: number, trackId: number) =>
    ipcRenderer.invoke('playlist:addTrack', playlistId, trackId),
  removeTrackFromPlaylist: (playlistId: number, trackId: number) =>
    ipcRenderer.invoke('playlist:removeTrack', playlistId, trackId),

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
  revealInFolder: (path: string) => ipcRenderer.invoke('app:revealInFolder', path),
  saveImage: (dataUrl: string, defaultName: string) =>
    ipcRenderer.invoke('app:saveImage', dataUrl, defaultName),
  minimizeWindow: () => ipcRenderer.invoke('win:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('win:maximize'),
  closeWindow: () => ipcRenderer.invoke('win:close'),
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
})
