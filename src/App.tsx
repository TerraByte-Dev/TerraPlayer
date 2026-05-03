import React, { useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import TrackList from './components/TrackList'
import PlayerBar from './components/PlayerBar'
import MetadataEditor from './components/MetadataEditor'
import TagPanel from './components/TagPanel'
import FullscreenVisualizer from './components/FullscreenVisualizer'
import TitleBar from './components/TitleBar'
import ContextMenu from './components/ContextMenu'
import QueuePanel from './components/QueuePanel'
import UtilityOverlay from './components/utilities/UtilityOverlay'
import UtilityTimerHost from './components/utilities/UtilityTimerHost'
import type { UtilityMode } from './components/utilities/UtilityDock'
import { useLibraryStore } from './store/library'
import { usePlayerStore } from './store/player'
import { hub } from './lib/ipc'

export default function App() {
  const { load, rightPanelOpen, panelMode, toggleRightPanel, selectedTrackId, addFolderByPath } = useLibraryStore()
  const { vizFullscreen, setVizFullscreen } = usePlayerStore()
  const [dragActive, setDragActive] = useState(false)
  const [utilityMode, setUtilityMode] = useState<UtilityMode | null>(null)
  const [utilityFullscreen, setUtilityFullscreen] = useState(false)

  useEffect(() => {
    load()
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
      className="y2k-shell flex flex-col h-screen bg-surface-400 text-white overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TitleBar />

      {/* Drag overlay */}
      {dragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 border-2 border-dashed border-aero-aqua/40 pointer-events-none">
          <div className="text-center">
            <p className="text-ink-100/80 text-sm font-medium">Drop folder to add to library</p>
          </div>
        </div>
      )}

      <div className="relative z-[1] flex flex-1 overflow-hidden">
        <Sidebar onOpenUtility={handleOpenUtility} />

        <main className="flex-1 flex flex-col overflow-hidden bg-surface-200">
          <TrackList />
        </main>

        {showMetadataPanel && (
          <aside className="w-60 flex-shrink-0 bg-surface-300 border-l border-white/[0.05] overflow-y-auto">
            <div className="sticky top-0 z-10 h-9 flex items-center justify-end px-3 bg-surface-300/95 backdrop-blur border-b border-white/[0.05]">
              <button
                onClick={toggleRightPanel}
                title="Close panel"
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted/50 hover:text-aero-aqua hover:bg-white/[0.06] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <MetadataEditor />
            <div className="border-t border-white/[0.05] mx-4" />
            <TagPanel />
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
          className="fixed bottom-[70px] right-4 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-colors z-10 bg-white/[0.06] text-muted/50 hover:text-ink-100/70 hover:bg-white/[0.1] border border-white/[0.06]"
        >
          <Pencil size={14} />
        </button>
      )}

      {/* Fullscreen in-window visualizer overlay */}
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

      <UtilityTimerHost onOpenTimer={() => handleOpenUtility('timer')} />

      {/* Global context menu */}
      <ContextMenu />
    </div>
  )
}
