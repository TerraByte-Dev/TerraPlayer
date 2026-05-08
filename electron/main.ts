import { app, BrowserWindow, ipcMain, shell, dialog, screen } from 'electron'
import { join, dirname } from 'path'
import { statSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { registerHubProtocol, handleHubProtocol } from './ipc/stream'
import {
  scanLibrary,
  refreshTrack,
  listTags,
  createTag,
  deleteTag,
  getTrackTags,
  setTrackTags,
  getTracksForTag,
  listPlaylists,
  createPlaylist,
  deletePlaylist,
  getTracksForPlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  listLibraryFolders,
  addLibraryFolder,
  removeLibraryFolder,
  getDriveStats,
} from './ipc/library'
import { writeTags } from './ipc/metadata'
import { autoUpdater } from 'electron-updater'

registerHubProtocol()

let mainWindow: BrowserWindow | null = null
let vizWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#020503',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#000000',
      symbolColor: '#00FF88',
      height: 24,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Forward native fullscreen state changes to renderer
  mainWindow.on('enter-full-screen', () =>
    mainWindow?.webContents.send('viz:fullscreen-change', true)
  )
  mainWindow.on('leave-full-screen', () =>
    mainWindow?.webContents.send('viz:fullscreen-change', false)
  )

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  handleHubProtocol()

  // Auto-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('update-available', (info) =>
    mainWindow?.webContents.send('updater:available', { version: info.version })
  )
  autoUpdater.on('update-not-available', () =>
    mainWindow?.webContents.send('updater:not-available')
  )
  autoUpdater.on('download-progress', (p) =>
    mainWindow?.webContents.send('updater:progress', { percent: Math.floor(p.percent) })
  )
  autoUpdater.on('update-downloaded', () =>
    mainWindow?.webContents.send('updater:downloaded')
  )
  autoUpdater.on('error', (err) =>
    mainWindow?.webContents.send('updater:error', { message: err.message })
  )
  ipcMain.handle('updater:get-version', () => app.getVersion())
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { available: false, devMode: true }
    try { await autoUpdater.checkForUpdates() } catch (e) {
      mainWindow?.webContents.send('updater:error', { message: (e as Error).message })
    }
    return { available: false }
  })
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('updater:install', () => { autoUpdater.quitAndInstall() })

  // Library
  ipcMain.handle('lib:scan', () => scanLibrary())
  ipcMain.handle('lib:refreshTrack', (_, path: string) => refreshTrack(path))
  ipcMain.handle('lib:listFolders', () => listLibraryFolders())
  ipcMain.handle('lib:addFolder', (_, path: string) => addLibraryFolder(path))
  ipcMain.handle('lib:removeFolder', (_, path: string) => removeLibraryFolder(path))
  ipcMain.handle('lib:pickFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('lib:suggestMusicFolder', () => {
    const path = app.getPath('music')
    let exists = false
    try { statSync(path); exists = true } catch { /* noop */ }
    return { path, exists }
  })
  ipcMain.handle('lib:getDriveStats', () => getDriveStats())

  // Metadata / tags
  ipcMain.handle('meta:writeTags', (_, path: string, tags: Record<string, string | number>) =>
    writeTags(path, tags)
  )
  ipcMain.handle('tag:list', () => listTags())
  ipcMain.handle('tag:create', (_, name: string, kind: string) => createTag(name, kind))
  ipcMain.handle('tag:delete', (_, tagId: number) => deleteTag(tagId))
  ipcMain.handle('tag:getForTrack', (_, trackId: number) => getTrackTags(trackId))
  ipcMain.handle('tag:setForTrack', (_, trackId: number, tagIds: number[]) =>
    setTrackTags(trackId, tagIds)
  )
  ipcMain.handle('tag:getTracksForTag', (_, tagId: number) => getTracksForTag(tagId))

  // Playlists
  ipcMain.handle('playlist:list', () => listPlaylists())
  ipcMain.handle('playlist:create', (_, name: string) => createPlaylist(name))
  ipcMain.handle('playlist:delete', (_, playlistId: number) => deletePlaylist(playlistId))
  ipcMain.handle('playlist:getTracks', (_, playlistId: number) => getTracksForPlaylist(playlistId))
  ipcMain.handle('playlist:addTrack', (_, playlistId: number, trackId: number) =>
    addTrackToPlaylist(playlistId, trackId)
  )
  ipcMain.handle('playlist:removeTrack', (_, playlistId: number, trackId: number) =>
    removeTrackFromPlaylist(playlistId, trackId)
  )

  // Display list
  ipcMain.handle('displays:list', () =>
    screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label || '',
      primary: d.id === screen.getPrimaryDisplay().id,
      bounds: d.bounds,
    }))
  )

  // Visualizer fullscreen state
  ipcMain.handle('viz:fullscreen-set', (_, fullscreen: boolean) => {
    if (!mainWindow) return
    mainWindow.setFullScreen(fullscreen)
  })

  // Open popout visualizer on a chosen display
  ipcMain.handle('viz:popout', async (_, displayId: number) => {
    if (vizWindow && !vizWindow.isDestroyed()) {
      vizWindow.close()
      vizWindow = null
      return
    }
    const displays = screen.getAllDisplays()
    const display = displays.find((d) => d.id === displayId) ?? displays[0]

    vizWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      fullscreen: true,
      frame: false,
      backgroundColor: '#061224',
      webPreferences: {
        preload: join(__dirname, '../preload/preload.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      vizWindow.loadURL(process.env.ELECTRON_RENDERER_URL + '/visualizer.html')
    } else {
      vizWindow.loadFile(join(__dirname, '../renderer/visualizer.html'))
    }

    vizWindow.on('closed', () => {
      vizWindow = null
      mainWindow?.webContents.send('viz:popout-closed')
    })
  })

  // App utilities
  ipcMain.handle('app:uninstall', () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev-mode' }
    const uninstaller = join(dirname(app.getPath('exe')), 'Uninstall T-Play.exe')
    try {
      spawn(uninstaller, [], { detached: true, stdio: 'ignore' }).unref()
    } catch (e) {
      return { ok: false, reason: (e as Error).message }
    }
    setTimeout(() => app.quit(), 250)
    return { ok: true }
  })
  ipcMain.handle('app:revealInFolder', (_, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('app:saveImage', async (event, dataUrl: string, defaultName: string) => {
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
    if (!match) throw new Error('Only PNG image data can be saved.')

    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined
    const result = await dialog.showSaveDialog(win, {
      title: 'Save board',
      defaultPath: defaultName || 'board.png',
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    })
    if (result.canceled || !result.filePath) return null

    const filePath = result.filePath.toLowerCase().endsWith('.png')
      ? result.filePath
      : `${result.filePath}.png`
    writeFileSync(filePath, Buffer.from(match[1], 'base64'))
    return filePath
  })
  ipcMain.handle('win:minimize', () => mainWindow?.minimize())
  ipcMain.handle('win:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('win:close', () => mainWindow?.close())

  // Close popout
  ipcMain.handle('viz:close', () => {
    if (vizWindow && !vizWindow.isDestroyed()) {
      vizWindow.close()
      vizWindow = null
    }
  })

  // Relay audio frames from main renderer → viz window
  ipcMain.on('viz:audio-frame', (_event, buf: Uint8Array) => {
    if (vizWindow && !vizWindow.isDestroyed()) {
      vizWindow.webContents.send('viz:audio-frame', buf)
    }
  })

  ipcMain.on('viz:playback-state', (_event, state: unknown) => {
    if (vizWindow && !vizWindow.isDestroyed()) {
      vizWindow.webContents.send('viz:playback-state', state)
    }
  })

  ipcMain.on('viz:control', (_event, command: unknown) => {
    mainWindow?.webContents.send('viz:control', command)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
