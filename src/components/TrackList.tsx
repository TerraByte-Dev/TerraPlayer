import React, { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronUp, ChevronDown, Play, Pause, FolderPlus, Music, X, AlertCircle, ListPlus, ListEnd, FolderOpen, Tag, ListMusic } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { usePlayerStore } from '@/store/player'
import { useContextMenuStore } from '@/store/contextMenu'
import { fmtDuration, hub } from '@/lib/ipc'
import type { Track } from '@/lib/ipc'
import VectorGridCover from './VectorGridCover'

type SortKey = 'title' | 'artist' | 'album' | 'duration' | 'playlist'

const ROW_HEIGHT = 30 // py-[3px] (6px) + 24px cover = 30px per row
const OVERSCAN = 8   // rows rendered outside viewport for smooth scrolling

export default function TrackList() {
  const {
    sidebarView, visibleTracks, selectTrack, selectedTrackId,
    loading, folders, addFolder, addFolderByPath, error, lastSummary, clearError,
    openPanel, playlists, loadPlaylists,
    tracks: storeTracks,
  } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, setPlaying, addToUpNext, playNext } = usePlayerStore()
  const { openMenu } = useContextMenuStore()

  // asyncTracks holds results for tag/playlist views (requires IPC)
  const [asyncTracks, setAsyncTracks] = useState<Track[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('artist')
  const [sortAsc, setSortAsc] = useState(true)
  const [tagViewLoading, setTagViewLoading] = useState(false)
  const [musicSuggestion, setMusicSuggestion] = useState<{ path: string; exists: boolean } | null>(null)
  const [showReadErrors, setShowReadErrors] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Virtualizer state
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)

  useLayoutEffect(() => {
    if (scrollRef.current) setViewportH(scrollRef.current.clientHeight)
  }, [])

  useEffect(() => {
    if (folders.length === 0) {
      hub.suggestMusicFolder().then(setMusicSuggestion).catch(() => {})
    }
  }, [folders.length])

  const loadAsyncTracks = useCallback(async () => {
    if (sidebarView.kind === 'tag') {
      setTagViewLoading(true)
      const t = await hub.getTracksForTag(sidebarView.tagId)
      setTagViewLoading(false)
      setAsyncTracks(t)
    } else if (sidebarView.kind === 'playlist') {
      setTagViewLoading(true)
      const t = await hub.getTracksForPlaylist(sidebarView.playlistId)
      setTagViewLoading(false)
      setAsyncTracks(t)
    } else {
      setAsyncTracks([])
    }
  }, [sidebarView])

  useEffect(() => { loadAsyncTracks() }, [loadAsyncTracks])

  // Sorted + filtered — memoized to avoid recomputing on every player tick
  const filtered = useMemo(() => {
    const base: Track[] = sidebarView.kind === 'all' ? visibleTracks() : asyncTracks
    const sorted = [...base].sort((a, b) => {
      if (sortKey === 'duration') {
        const av = Number(a.duration ?? 0)
        const bv = Number(b.duration ?? 0)
        return sortAsc ? av - bv : bv - av
      }
      const av = String(a[sortKey] ?? '')
      const bv = String(b[sortKey] ?? '')
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    })
    if (!searchQuery.trim()) return sorted
    const q = searchQuery.toLowerCase()
    return sorted.filter((t) =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.artist || '').toLowerCase().includes(q) ||
      (t.album || '').toLowerCase().includes(q)
    )
  }, [sidebarView, asyncTracks, storeTracks, visibleTracks, sortKey, sortAsc, searchQuery])

  // Virtualizer derived values — computed each render, not state
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx = Math.min(
    filtered.length - 1,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN
  )
  const visibleRows = filtered.slice(startIdx, endIdx + 1)
  const topPad = startIdx * ROW_HEIGHT
  const bottomPad = Math.max(0, (filtered.length - 1 - endIdx) * ROW_HEIGHT)

  function handleScrollEvent(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    setScrollTop(el.scrollTop)
    if (el.clientHeight !== viewportH) setViewportH(el.clientHeight)
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc
        ? <ChevronUp size={10} style={{ color: '#00FF88' }} />
        : <ChevronDown size={10} style={{ color: '#00FF88' }} />
      : null

  const current = currentTrack()

  const viewTitle =
    sidebarView.kind === 'all'
      ? 'all tracks'
      : sidebarView.kind === 'playlist'
      ? sidebarView.name
      : sidebarView.tagName

  function handleRowClick(track: Track) {
    selectTrack(track.id)
  }

  function handleRowDoubleClick(track: Track) {
    selectTrack(track.id)
    playTrack(track, filtered)
  }

  function handleCoverClick(e: React.MouseEvent, track: Track) {
    e.stopPropagation()
    const isCurrent = current?.id === track.id
    if (isCurrent) {
      setPlaying(!isPlaying)
    } else {
      selectTrack(track.id)
      playTrack(track, filtered)
    }
  }

  function handleContextMenu(e: React.MouseEvent, track: Track) {
    e.preventDefault()
    selectTrack(track.id)
    const playlistItems = playlists.map((playlist) => ({
      label: `Add to ${playlist.name}`,
      icon: <ListMusic size={12} />,
      onClick: async () => {
        await hub.addTrackToPlaylist(playlist.id, track.id)
        await loadPlaylists()
        if (sidebarView.kind === 'playlist' && sidebarView.playlistId === playlist.id) {
          loadAsyncTracks()
        }
      },
    }))
    const removeFromPlaylistItem = sidebarView.kind === 'playlist'
      ? [{
          label: 'Remove from this playlist',
          icon: <X size={12} />,
          danger: true,
          onClick: async () => {
            await hub.removeTrackFromPlaylist(sidebarView.playlistId, track.id)
            await loadPlaylists()
            loadAsyncTracks()
          },
        }]
      : []
    openMenu(e.clientX, e.clientY, [
      {
        label: 'Play',
        icon: <Play size={12} />,
        onClick: () => { selectTrack(track.id); playTrack(track, filtered) },
      },
      {
        label: 'Play next',
        icon: <ListPlus size={12} />,
        onClick: () => playNext(track),
      },
      {
        label: 'Add to queue',
        icon: <ListEnd size={12} />,
        onClick: () => addToUpNext(track),
      },
      ...(playlistItems.length > 0 ? [{ separator: true }, ...playlistItems] : []),
      ...(removeFromPlaylistItem.length > 0 ? [{ separator: true }, ...removeFromPlaylistItem] : []),
      { separator: true },
      {
        label: 'View / edit tags',
        icon: <Tag size={12} />,
        onClick: () => { selectTrack(track.id); openPanel('metadata') },
      },
      {
        label: 'Reveal in folder',
        icon: <FolderOpen size={12} />,
        onClick: () => window.hub.revealInFolder(track.path),
      },
    ])
  }

  if (loading || tagViewLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-term text-[14px]"
        style={{ color: 'rgba(155,245,184,0.55)' }}>
        scanning...
      </div>
    )
  }

  if (folders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center track-scan">
        <div
          className="w-14 h-14 flex items-center justify-center"
          style={{ border: '1px solid rgba(0,255,136,0.25)', background: 'rgba(0,255,136,0.04)' }}
        >
          <Music size={22} style={{ color: 'rgba(0,255,136,0.40)' }} />
        </div>
        <div>
          <p className="font-term text-[14px]" style={{ color: '#9bf5b8' }}>no music folder</p>
          <p className="font-term text-[13px] mt-1" style={{ color: 'rgba(155,245,184,0.55)' }}>
            add a folder to get started
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 w-full max-w-[220px]">
          <button
            onClick={addFolder}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 font-term text-[14px] tracking-[1px] transition-colors"
            style={{ border: '1px solid #00FF88', color: '#00FF88', background: 'rgba(0,255,136,0.08)' }}
          >
            <FolderPlus size={14} />
            choose folder...
          </button>
          {musicSuggestion?.exists && (
            <button
              onClick={() => addFolderByPath(musicSuggestion.path)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 font-term text-[14px] transition-colors"
              title={musicSuggestion.path}
              style={{
                border: '1px solid rgba(0,255,136,0.25)',
                color: 'rgba(155,245,184,0.55)',
                background: 'rgba(0,255,136,0.03)',
              }}
            >
              <Music size={14} />
              use my Music folder
            </button>
          )}
        </div>
        {error && (
          <p className="font-term text-[13px] max-w-xs" style={{ color: '#FF3030' }}>{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden track-scan">
      {error && (
        <div className="flex items-start gap-2 px-4 py-2.5 text-[12px]"
          style={{
            background: 'rgba(255,48,48,0.06)',
            borderBottom: '1px solid rgba(255,48,48,0.20)',
            color: '#FF3030',
          }}>
          <AlertCircle size={13} className="flex-shrink-0 mt-px" />
          <span className="flex-1 font-term">{error}</span>
          <button onClick={clearError} className="flex-shrink-0 hover:opacity-70 transition-opacity">
            <X size={12} />
          </button>
        </div>
      )}

      {!error && lastSummary && lastSummary.folders > 0 && lastSummary.scanned === 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 text-[12px]"
          style={{
            background: 'rgba(255,176,0,0.06)',
            borderBottom: '1px solid rgba(255,176,0,0.20)',
            color: '#FFB000',
          }}>
          <AlertCircle size={13} className="flex-shrink-0 mt-px" />
          <span className="font-term flex-1">
            no audio files found — supports{' '}
            <code className="font-mono" style={{ color: '#FFB000' }}>.mp3</code>
            {' '}and{' '}
            <code className="font-mono" style={{ color: '#FFB000' }}>.m4a</code>
          </span>
        </div>
      )}

      {lastSummary && lastSummary.errors.length > 0 && (
        <div className="px-4 py-2 text-[11px]"
          style={{ borderBottom: '1px solid rgba(0,255,136,0.06)', color: 'rgba(155,245,184,0.40)' }}>
          <button
            onClick={() => setShowReadErrors((v) => !v)}
            className="font-term hover:opacity-80 transition-opacity"
          >
            {lastSummary.errors.length} folder{lastSummary.errors.length > 1 ? 's' : ''} couldn't be read
            {showReadErrors ? ' ▴' : ' ▾'}
          </button>
          {showReadErrors && (
            <ul className="mt-1 space-y-0.5 pl-2">
              {lastSummary.errors.map((e, i) => (
                <li key={i} className="font-term truncate" style={{ color: 'rgba(155,245,184,0.25)' }} title={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* View header */}
      <div
        className="px-[18px] py-[12px] flex items-end justify-between"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.18)' }}
      >
        <div className="min-w-0">
          <div className="font-term text-[11px]" style={{ color: '#00E5FF' }}>
            library /
          </div>
          <div className="font-lcd text-[20px] tracking-[2px] phosphor-glow leading-none" style={{ color: '#00FF88' }}>
            {viewTitle}
          </div>
          <div className="font-term text-[11px] mt-1" style={{ color: '#1f5e3a' }}>
            · {filtered.length} entries · sorted={sortKey} {sortAsc ? 'asc' : 'desc'}
          </div>
        </div>

        {/* Search */}
        <div
          className="flex items-center px-[10px] py-[4px] ml-4 flex-shrink-0"
          style={{
            background: '#000',
            border: '1px solid #00FF88',
            boxShadow: '0 0 8px rgba(0,255,136,0.20), inset 0 0 8px rgba(0,255,136,0.05)',
          }}
        >
          <span className="font-term text-[14px] mr-1" style={{ color: '#00E5FF' }}>?</span>
          <span className="font-term text-[14px] mr-1" style={{ color: 'rgba(155,245,184,0.30)' }}>grep</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="font-term text-[14px] bg-transparent outline-none w-28"
            style={{ color: '#00FF88' }}
            placeholder=""
          />
          {!searchQuery && (
            <span className="font-term text-[14px] term-caret" style={{ color: '#00FF88' }}>█</span>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div
        className="grid px-[10px] py-[4px] select-none flex-shrink-0"
        style={{
          gridTemplateColumns: '40px 36px 1fr 1fr 1fr 110px 60px',
          background: 'rgba(0,255,136,0.05)',
          borderBottom: '1px solid rgba(0,255,136,0.18)',
        }}
      >
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase" style={{ color: '#00E5FF' }}>id</span>
        <span />
        {(['title', 'artist', 'album'] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => handleSort(k)}
            className="flex items-center gap-1 font-mono text-[9px] tracking-[1.5px] uppercase text-left transition-opacity hover:opacity-80"
            style={{ color: '#00E5FF' }}
          >
            {k} <SortIcon k={k} />
          </button>
        ))}
        <button
          onClick={() => handleSort('playlist')}
          className="flex items-center gap-1 font-mono text-[9px] tracking-[1.5px] uppercase text-left"
          style={{ color: '#00E5FF' }}
        >
          path <SortIcon k="playlist" />
        </button>
        <button
          onClick={() => handleSort('duration')}
          className="flex items-center justify-end gap-1 font-mono text-[9px] tracking-[1.5px] uppercase"
          style={{ color: '#00E5FF' }}
        >
          <SortIcon k="duration" /> dur
        </button>
      </div>

      {/* Virtualized track list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScrollEvent}>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 font-term text-[14px]"
            style={{ color: 'rgba(155,245,184,0.30)' }}>
            no tracks found
          </div>
        )}

        {/* Top spacer */}
        {topPad > 0 && <div style={{ height: topPad }} />}

        {visibleRows.map((track, relIdx) => {
          const idx = startIdx + relIdx
          const isCurrentTrack = current?.id === track.id
          const isSelected = selectedTrackId === track.id

          return (
            <div
              key={track.id}
              onClick={() => handleRowClick(track)}
              onDoubleClick={() => handleRowDoubleClick(track)}
              onContextMenu={(e) => handleContextMenu(e, track)}
              className="grid px-[10px] py-[3px] items-center cursor-pointer select-none transition-colors group"
              style={{
                gridTemplateColumns: '40px 36px 1fr 1fr 1fr 110px 60px',
                borderLeft: isSelected || isCurrentTrack ? '2px solid #00FF88' : '2px solid transparent',
                background: isSelected
                  ? 'rgba(0,255,136,0.15)'
                  : isCurrentTrack
                  ? 'rgba(0,255,136,0.08)'
                  : undefined,
              }}
            >
              {/* ID / play indicator */}
              <span className="font-term text-[12px]" style={{ color: 'rgba(155,245,184,0.30)' }}>
                {isCurrentTrack ? '▶' : String(idx + 1).padStart(4, '0')}
              </span>

              {/* Cover */}
              <div className="relative cursor-pointer" onClick={(e) => handleCoverClick(e, track)}>
                <VectorGridCover src={track.coverUrl} label={`A:${String(idx + 1).padStart(3, '0')}`} size={24} />
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                    isCurrentTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  style={{ background: 'rgba(0,0,0,0.5)' }}
                >
                  {isCurrentTrack && isPlaying
                    ? <Pause size={10} className="fill-current" style={{ color: '#fff' }} />
                    : <Play size={10} className="fill-current" style={{ color: '#fff' }} />
                  }
                </div>
              </div>

              {/* Title */}
              <span
                className={`font-term text-[14px] truncate px-2 ${isCurrentTrack ? 'phosphor-glow' : ''}`}
                style={{ color: isCurrentTrack ? '#00FF88' : '#9bf5b8' }}
              >
                {isCurrentTrack ? `▶ ${track.title || '—'}` : (track.title || '—')}
              </span>

              {/* Artist */}
              <span className="font-term text-[14px] truncate" style={{ color: 'rgba(155,245,184,0.55)' }}>
                {track.artist || '—'}
              </span>

              {/* Album */}
              <span className="font-term text-[14px] truncate" style={{ color: 'rgba(155,245,184,0.55)' }}>
                {track.album || '—'}
              </span>

              {/* Path */}
              <span className="font-term text-[12px] truncate" style={{ color: 'rgba(155,245,184,0.30)' }}>
                ./{track.playlist || ''}
              </span>

              {/* Duration */}
              <span
                className="font-term text-[12px] text-right tabular-nums"
                style={{ color: isCurrentTrack ? '#00FF88' : 'rgba(155,245,184,0.55)' }}
              >
                {fmtDuration(track.duration)}
              </span>
            </div>
          )
        })}

        {/* Bottom spacer */}
        {bottomPad > 0 && <div style={{ height: bottomPad }} />}

        {/* Trailing prompt (All Tracks view only) */}
        {sidebarView.kind === 'all' && filtered.length > 0 && (
          <div className="px-[10px] py-[8px] font-term text-[13px] select-none">
            <span style={{ color: '#00E5FF' }}>tracks@mainframe</span>
            <span style={{ color: '#9bf5b8' }}>:</span>
            <span style={{ color: '#FFB000' }}>~/library</span>
            <span style={{ color: '#9bf5b8' }}>$ </span>
            <span className="term-caret" style={{ color: '#00FF88' }}>█</span>
          </div>
        )}
      </div>
    </div>
  )
}
