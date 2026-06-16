import { app, BrowserWindow, ipcMain, shell, dialog, screen } from 'electron'
import { join, dirname, basename } from 'path'
import { statSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { registerHubProtocol, handleHubProtocol } from './ipc/stream'
import {
  scanLibrary,
  refreshTrack,
  listTags,
  createTag,
  deleteTag,
  renameTag,
  getTrackTags,
  setTrackTags,
  getTracksForTag,
  listPlaylists,
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  getTracksForPlaylist,
  addTrackToPlaylist,
  addPathsToPlaylist,
  getPlaylistIdsForTrack,
  removeTrackFromPlaylist,
  listLibraryFolders,
  addLibraryFolder,
  removeLibraryFolder,
  getTrackPath,
  deleteTrackRow,
  getDriveStats,
} from './ipc/library'
import { isPathUnderAnyFolder } from './ipc/downloader-core'
import { writeTags } from './ipc/metadata'
import * as downloader from './ipc/downloader'
import * as ytauth from './ipc/ytauth'
import type { DownloadRow } from './ipc/downloader-core'
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
      height: 30,
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
  ipcMain.handle('lib:isPathInLibrary', (_, path: string) =>
    isPathUnderAnyFolder(path, listLibraryFolders().map((f) => f.path))
  )
  ipcMain.handle('lib:deleteTrack', async (event, trackId: number) => {
    const path = getTrackPath(trackId)
    if (path == null) return { ok: false as const, reason: 'Track not found' }
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      type: 'warning' as const,
      buttons: ['Move to Recycle Bin', 'Cancel'],
      defaultId: 1, // Cancel is the safe default
      cancelId: 1,
      noLink: true,
      title: 'Delete song',
      message: `Move “${basename(path)}” to the Recycle Bin?`,
      detail: 'You can restore it from the Recycle Bin.',
    }
    const { response } = await (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
    if (response !== 0) return { cancelled: true as const }

    // Trash the file if it still exists; an already-missing file is fine — just
    // drop the row. Retry once after a beat: a just-stopped track may still be
    // briefly locked while the renderer releases its <audio> handle (Windows).
    let exists = true
    try { statSync(path) } catch { exists = false }
    if (exists) {
      for (let attempt = 0; ; attempt++) {
        try { await shell.trashItem(path); break }
        catch (e) {
          if (attempt >= 1) return { ok: false as const, reason: String((e as Error)?.message ?? e) }
          await new Promise((r) => setTimeout(r, 250))
        }
      }
    }
    deleteTrackRow(trackId)
    return { ok: true as const, path }
  })

  // Music downloader (wraps download_music.py --json)
  ipcMain.handle('dl:preflight', (_, opts?: downloader.CookieOpts & { noAuthProbe?: boolean }) =>
    downloader.preflight(opts)
  )
  ipcMain.handle('dl:install', (event, tools: string[], cookieOpts?: downloader.CookieOpts) =>
    downloader.installTools(event.sender, tools, cookieOpts)
  )
  ipcMain.handle('dl:resolve', (_, payload: downloader.ResolvePayload) =>
    downloader.resolve(payload)
  )
  ipcMain.handle('dl:candidates', (_, query: string) => downloader.candidates(query))
  ipcMain.handle('dl:download', (event, rows: DownloadRow[], outDir: string, cookieOpts?: downloader.CookieOpts) =>
    downloader.download(event.sender, rows, outDir, cookieOpts)
  )
  ipcMain.handle('dl:cancel', () => downloader.cancelDownload())
  ipcMain.handle('dl:resolveOutDir', () => downloader.resolveOutputDir())
  ipcMain.handle('dl:readText', (_, path: string) => downloader.readTextFile(path))

  // YouTube auth (in-app login / browser / cookies.txt — see ytauth.ts)
  ipcMain.handle('ytauth:status', () => ytauth.status())
  ipcMain.handle('ytauth:connect', (event) =>
    ytauth.connect(BrowserWindow.fromWebContents(event.sender) ?? mainWindow)
  )
  ipcMain.handle('ytauth:disconnect', () => ytauth.disconnect())
  ipcMain.handle('ytauth:setBrowser', (_, browser: string) => ytauth.setBrowser(browser))
  ipcMain.handle('ytauth:detectBrowsers', () => ytauth.detectBrowsers())
  ipcMain.handle('ytauth:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    const opts = {
      title: 'Select a cookies.txt (Netscape format)',
      filters: [{ name: 'Cookies', extensions: ['txt'] }],
      properties: ['openFile' as const],
    }
    const result = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
    if (result.canceled || !result.filePaths[0]) return ytauth.status()
    return ytauth.importFile(result.filePaths[0])
  })

  // Metadata / tags
  ipcMain.handle('meta:writeTags', (_, path: string, tags: Record<string, string | number>) =>
    writeTags(path, tags)
  )
  ipcMain.handle('tag:list', () => listTags())
  ipcMain.handle('tag:create', (_, name: string, kind: string) => createTag(name, kind))
  ipcMain.handle('tag:delete', (_, tagId: number) => deleteTag(tagId))
  ipcMain.handle('tag:rename', (_, tagId: number, name: string) => renameTag(tagId, name))
  ipcMain.handle('tag:getForTrack', (_, trackId: number) => getTrackTags(trackId))
  ipcMain.handle('tag:setForTrack', (_, trackId: number, tagIds: number[]) =>
    setTrackTags(trackId, tagIds)
  )
  ipcMain.handle('tag:getTracksForTag', (_, tagId: number) => getTracksForTag(tagId))

  // Playlists
  ipcMain.handle('playlist:list', () => listPlaylists())
  ipcMain.handle('playlist:create', (_, name: string) => createPlaylist(name))
  ipcMain.handle('playlist:delete', (_, playlistId: number) => deletePlaylist(playlistId))
  ipcMain.handle('playlist:rename', (_, playlistId: number, name: string) =>
    renamePlaylist(playlistId, name)
  )
  ipcMain.handle('playlist:getTracks', (_, playlistId: number) => getTracksForPlaylist(playlistId))
  ipcMain.handle('playlist:addTrack', (_, playlistId: number, trackId: number) =>
    addTrackToPlaylist(playlistId, trackId)
  )
  ipcMain.handle('playlist:addPaths', (_, playlistName: string, paths: string[]) =>
    addPathsToPlaylist(playlistName, paths)
  )
  ipcMain.handle('playlist:idsForTrack', (_, trackId: number) => getPlaylistIdsForTrack(trackId))
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

    // Once the popout has loaded (and registered its theme listener), ask the main renderer to push the
    // current theme so it recolors immediately even when opened mid-session.
    vizWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('viz:request-theme')
    })

    vizWindow.on('closed', () => {
      vizWindow = null
      mainWindow?.webContents.send('viz:popout-closed')
    })
  })

  // App utilities
  ipcMain.handle('app:uninstall', () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev-mode' }
    const uninstaller = join(dirname(app.getPath('exe')), 'Uninstall TerraPlayer.exe')
    try {
      spawn(uninstaller, [], { detached: true, stdio: 'ignore' }).unref()
    } catch (e) {
      return { ok: false, reason: (e as Error).message }
    }
    setTimeout(() => app.quit(), 250)
    return { ok: true }
  })
  ipcMain.handle('app:revealInFolder', (_, path: string) => shell.showItemInFolder(path))
  // Open an external URL in the user's default browser. Guarded to http(s) only so a compromised
  // renderer can't launch arbitrary protocols/handlers.
  ipcMain.handle('app:openExternal', (_, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url)
  })
  ipcMain.handle('app:saveImage', async (event, dataUrl: string, defaultName: string) => {
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
    if (!match) throw new Error('Only PNG image data can be saved.')

    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    const saveOpts = {
      title: 'Save board',
      defaultPath: defaultName || 'board.png',
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    }
    const result = await (win
      ? dialog.showSaveDialog(win, saveOpts)
      : dialog.showSaveDialog(saveOpts))
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

  // Relay the app theme from the main renderer → viz window so the popout recolors live. One-directional;
  // never echoed back to mainWindow (unlike viz:control), so there's no feedback loop.
  ipcMain.on('viz:theme', (_event, id: string) => {
    if (vizWindow && !vizWindow.isDestroyed()) vizWindow.webContents.send('viz:theme', id)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
