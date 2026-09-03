import React, { useCallback, useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import TrackList from './components/TrackList'
import PlayerBar from './components/PlayerBar'
import MetadataEditor from './components/MetadataEditor'
import TagPanel from './components/TagPanel'
import AddToPlaylist from './components/AddToPlaylist'
import FullscreenVisualizer from './components/FullscreenVisualizer'
import TitleBar from './components/TitleBar'
import ContextMenu from './components/ContextMenu'
import QueuePanel from './components/QueuePanel'
import UtilityOverlay from './components/utilities/UtilityOverlay'
import Arcade from './components/arcade/Arcade'
import UtilityTimerHost from './components/utilities/UtilityTimerHost'
import Settings from './components/Settings'
import Downloader from './components/Downloader'
import DownloaderPanel from './components/DownloaderPanel'
import type { UtilityMode } from './components/utilities/UtilityDock'
import { useLibraryStore } from './store/library'
import { usePlayerStore } from './store/player'
import { useDownloaderStore } from './store/downloader'
import { useUiStore } from './store/ui'
import { THEME_EVENT, getThemeId, getTheme } from './lib/theme'
import { hub } from './lib/ipc'

export default function App() {
  const { load, rightPanelOpen, panelMode, toggleRightPanel, selectedTrackId, addPaths } = useLibraryStore()
  const { vizFullscreen, setVizFullscreen } = usePlayerStore()
  const [dragActive, setDragActive] = useState(false)
  const [utilityMode, setUtilityMode] = useState<UtilityMode | null>(null)
  const [utilityFullscreen, setUtilityFullscreen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The arcade is deliberately NOT a `utilityMode`: it floats over a usable app, so opening the
  // calculator must not close the game you left running.
  const [arcadeOpen, setArcadeOpen] = useState(false)
  const [arcadeFullscreen, setArcadeFullscreen] = useState(false)
  // Bumped when the tile is clicked again, to re-focus a cabinet that is already open.
  const [arcadeNonce, setArcadeNonce] = useState(0)
  const downloaderView = useDownloaderStore((s) => s.view)

  useEffect(() => {
    load()
  }, [])

  // Single, app-level subscription for the downloader's NDJSON stream. Lives here
  // (not in Downloader.tsx) so progress keeps flowing while the downloader is shown
  // in the side panel or the modal is closed — and so events are handled exactly once.
  useEffect(() => {
    const unsubDl = window.hub.onDownloaderEvent((e) => useDownloaderStore.getState().handleEvent(e))
    const unsubInstall = window.hub.onDownloaderInstallEvent((e) =>
      useDownloaderStore.getState().handleInstallEvent(e)
    )
    return () => {
      unsubDl()
      unsubInstall()
    }
  }, [])

  // Let PlayerBar's global transport shortcuts yield while a tool/Settings/Downloader overlay owns the
  // keyboard. Only the full modal grabs it — the side panel leaves the app fully interactive.
  // The arcade is absent on purpose: it is non-modal, so the transport keys stay live behind it and
  // the cabinet's own focus state decides whether the game or the app hears a keypress.
  useEffect(() => {
    useUiStore.getState().setOverlayOpen(!!utilityMode || settingsOpen || downloaderView === 'modal')
  }, [utilityMode, settingsOpen, downloaderView])

  // Relay the app theme to the popout visualizer so the second monitor recolors with the app: publish on
  // every theme change, prime once at mount (covers a popout already open), and answer a popout's request.
  useEffect(() => {
    const onTheme = (e: Event) => {
      const id = (e as CustomEvent).detail as string
      window.hub.publishTheme(id)
      window.hub.setTitleBarOverlay(getTheme(id).swatch.accent) // recolor the native window-control glyphs
    }
    window.addEventListener(THEME_EVENT, onTheme)
    const offRequest = window.hub.onRequestTheme(() => window.hub.publishTheme(getThemeId()))
    window.hub.publishTheme(getThemeId())
    return () => { window.removeEventListener(THEME_EVENT, onTheme); offRequest() }
  }, [])

  useEffect(() => {
    const unsub = window.hub.onMainFullscreenChange((fullscreen) => {
      if (!fullscreen) setArcadeFullscreen(false)
      if (!fullscreen) setUtilityFullscreen(false)
    })
    return unsub
  }, [])

  // Take the overlay down for every way a drag can end, not just a drop the root
  // handler sees. Panels that stop propagation (the downloader) would otherwise
  // leave it painted over the app. Capture phase, so it runs before any handler
  // that stops the event.
  useEffect(() => {
    const clear = () => setDragActive(false)
    window.addEventListener('drop', clear, true)
    window.addEventListener('dragend', clear, true)
    return () => {
      window.removeEventListener('drop', clear, true)
      window.removeEventListener('dragend', clear, true)
    }
  }, [])

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragActive(false)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)

    // Collect every path synchronously: Chromium empties the DataTransfer store
    // the moment this handler yields, so getPathForFile() must run before any
    // await. Folders and files are both just paths here — main stats them.
    const paths: string[] = []
    for (const item of Array.from(e.dataTransfer.items)) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (!file) continue
      try {
        const path = hub.getPathForFile(file)
        if (path) paths.push(path)
      } catch { /* not a real filesystem entry — skip it */ }
    }
    // An in-app drag (reordering the queue) carries no files; stay silent.
    if (paths.length === 0) return
    await addPaths(paths)
  }

  async function handleCloseFullscreen() {
    await window.hub.setMainFullscreen(false)
    setVizFullscreen(false)
  }

  function handleOpenUtility(mode: UtilityMode) {
    if (vizFullscreen) {
      setVizFullscreen(false)
      window.hub.setMainFullscreen(false).catch(() => {})
    }
    setUtilityMode(mode)
  }

  async function handleUtilityFullscreen(fullscreen: boolean) {
    await window.hub.setMainFullscreen(fullscreen)
    setUtilityFullscreen(fullscreen)
  }

  // Stable identities: App re-renders ~4x/sec while a track plays (the currentTime tick), and a
  // fresh callback each time would re-reconcile the whole mounted game for as long as the
  // cabinet is parked open.
  const handleOpenArcade = useCallback(() => {
    if (usePlayerStore.getState().vizFullscreen) {
      setVizFullscreen(false)
      window.hub.setMainFullscreen(false).catch(() => {})
    }
    // Already open: bring it back to the front of the keyboard rather than doing nothing.
    setArcadeOpen(true)
    setArcadeNonce((n) => n + 1)
  }, [setVizFullscreen])

  const handleArcadeFullscreen = useCallback(async (fullscreen: boolean) => {
    await window.hub.setMainFullscreen(fullscreen)
    setArcadeFullscreen(fullscreen)
  }, [])

  const handleCloseArcade = useCallback(async () => {
    if (useUiStore.getState().arcadeFocus) useUiStore.getState().setArcadeFocus(false)
    setArcadeFullscreen((fs) => {
      if (fs) window.hub.setMainFullscreen(false).catch(() => {})
      return false
    })
    setArcadeOpen(false)
  }, [])

  async function handleCloseUtility() {
    if (utilityFullscreen) {
      await window.hub.setMainFullscreen(false)
    }
    setUtilityFullscreen(false)
    setUtilityMode(null)
  }

  const showMetadataPanel = rightPanelOpen && panelMode === 'metadata' && selectedTrackId !== null
  const showQueuePanel = rightPanelOpen && panelMode === 'queue'
  // The downloader panel and its full-screen pop-out are mutually exclusive — only
  // one reads/writes resolve state at a time (the modal owns the keyboard).
  const showDownloaderPanel = rightPanelOpen && panelMode === 'downloader' && downloaderView !== 'modal'

  return (
    <div
      className="term-shell crt-scanlines crt-vignette flex flex-col h-screen overflow-hidden relative"
      style={{ background: '#000' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />

      {/* Drag overlay */}
      {dragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 border-2 border-dashed pointer-events-none"
          style={{ borderColor: 'rgb(var(--accent-rgb) / 0.40)' }}>
          <p className="font-term text-[14px] tracking-[2px] uppercase" style={{ color: 'var(--accent)' }}>
            [ DROP SONGS OR FOLDERS TO INDEX ]
          </p>
        </div>
      )}

      <div className="relative z-[1] flex flex-1 overflow-hidden">
        <Sidebar onOpenUtility={handleOpenUtility} onOpenArcade={handleOpenArcade} />

        <main className="flex-1 flex flex-col overflow-hidden" style={{ background: '#000' }}>
          <TrackList />
        </main>

        {showMetadataPanel && (
          <aside className="w-60 flex-shrink-0 flex flex-col overflow-y-auto border-l"
            style={{ background: 'var(--bg-1)', borderColor: 'rgb(var(--accent-rgb) / 0.18)' }}>
            <div className="sticky top-0 z-10 h-9 flex items-center justify-end px-3 border-b"
              style={{ background: 'var(--bg-1)', borderColor: 'rgb(var(--accent-rgb) / 0.10)' }}>
              <button
                onClick={toggleRightPanel}
                title="Close panel"
                className="metal-key w-7 h-7"
              >
                <X size={12} />
              </button>
            </div>
            <MetadataEditor />
            <div className="mx-4" style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.08)' }} />
            <TagPanel />
            <div className="mx-4" style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.08)' }} />
            <AddToPlaylist />
          </aside>
        )}

        {showQueuePanel && <QueuePanel />}

        {showDownloaderPanel && <DownloaderPanel onOpenSettings={() => setSettingsOpen(true)} />}
      </div>

      <div className="relative z-[1]">
        <PlayerBar />
      </div>

      {!showMetadataPanel && (
        <button
          onClick={toggleRightPanel}
          title="Edit metadata & tags"
          className="metal-key fixed right-4 w-7 h-7 flex items-center justify-center shadow-lg z-10"
          style={{ bottom: 'calc(80px + 12px)' }}
        >
          <Pencil size={12} />
        </button>
      )}

      {vizFullscreen && (
        <FullscreenVisualizer source="analyser" onClose={handleCloseFullscreen} />
      )}

      {arcadeOpen && (
        <Arcade
          focusNonce={arcadeNonce}
          fullscreen={arcadeFullscreen}
          onClose={handleCloseArcade}
          onFullscreenChange={handleArcadeFullscreen}
        />
      )}

      {utilityMode && (
        <UtilityOverlay
          mode={utilityMode}
          fullscreen={utilityFullscreen}
          onClose={handleCloseUtility}
          onFullscreenChange={handleUtilityFullscreen}
        />
      )}

      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          onOpenDownloader={() => {
            setSettingsOpen(false)
            useDownloaderStore.getState().openPanel()
          }}
        />
      )}

      {downloaderView === 'modal' && <Downloader />}

      <UtilityTimerHost onOpenTimer={() => handleOpenUtility('timer')} />

      <ContextMenu />
    </div>
  )
}
