import React, { useEffect, useState } from 'react'
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
import UtilityTimerHost from './components/utilities/UtilityTimerHost'
import Settings from './components/Settings'
import Downloader from './components/Downloader'
import type { UtilityMode } from './components/utilities/UtilityDock'
import { useLibraryStore } from './store/library'
import { usePlayerStore } from './store/player'
import { useUiStore } from './store/ui'
import { THEME_EVENT, getThemeId } from './lib/theme'
import { hub } from './lib/ipc'

export default function App() {
  const { load, rightPanelOpen, panelMode, toggleRightPanel, selectedTrackId, addFolderByPath } = useLibraryStore()
  const { vizFullscreen, setVizFullscreen } = usePlayerStore()
  const [dragActive, setDragActive] = useState(false)
  const [utilityMode, setUtilityMode] = useState<UtilityMode | null>(null)
  const [utilityFullscreen, setUtilityFullscreen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [downloaderOpen, setDownloaderOpen] = useState(false)

  useEffect(() => {
    load()
  }, [])

  // Let PlayerBar's global transport shortcuts yield while a tool/Settings/Downloader overlay owns the keyboard.
  useEffect(() => {
    useUiStore.getState().setOverlayOpen(!!utilityMode || settingsOpen || downloaderOpen)
  }, [utilityMode, settingsOpen, downloaderOpen])

  // Relay the app theme to the popout visualizer so the second monitor recolors with the app: publish on
  // every theme change, prime once at mount (covers a popout already open), and answer a popout's request.
  useEffect(() => {
    const onTheme = (e: Event) => window.hub.publishTheme((e as CustomEvent).detail as string)
    window.addEventListener(THEME_EVENT, onTheme)
    const offRequest = window.hub.onRequestTheme(() => window.hub.publishTheme(getThemeId()))
    window.hub.publishTheme(getThemeId())
    return () => { window.removeEventListener(THEME_EVENT, onTheme); offRequest() }
  }, [])

  useEffect(() => {
    const unsub = window.hub.onMainFullscreenChange((fullscreen) => {
      if (!fullscreen) setUtilityFullscreen(false)
    })
    return unsub
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

    const items = Array.from(e.dataTransfer.items)
    for (const item of items) {
      const entry = item.webkitGetAsEntry()
      if (entry?.isDirectory) {
        const file = item.getAsFile()
        if (file) {
          const path = hub.getPathForFile(file)
          await addFolderByPath(path)
        }
        return
      }
    }
    useLibraryStore.setState({ error: 'Drop a folder, not a file.' })
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

  async function handleCloseUtility() {
    if (utilityFullscreen) {
      await window.hub.setMainFullscreen(false)
    }
    setUtilityFullscreen(false)
    setUtilityMode(null)
  }

  const showMetadataPanel = rightPanelOpen && panelMode === 'metadata' && selectedTrackId !== null
  const showQueuePanel = rightPanelOpen && panelMode === 'queue'

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
            [ DROP FOLDER TO INDEX ]
          </p>
        </div>
      )}

      <div className="relative z-[1] flex flex-1 overflow-hidden">
        <Sidebar onOpenUtility={handleOpenUtility} />

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
            setDownloaderOpen(true)
          }}
        />
      )}

      {downloaderOpen && <Downloader onClose={() => setDownloaderOpen(false)} />}

      <UtilityTimerHost onOpenTimer={() => handleOpenUtility('timer')} />

      <ContextMenu />
    </div>
  )
}
