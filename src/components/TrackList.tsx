import React, { useEffect, useState, useCallback } from 'react'
import { ChevronUp, ChevronDown, Play, Pause, FolderPlus, Music, X, AlertCircle, ListPlus, ListEnd, FolderOpen, Tag, ListMusic } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { usePlayerStore } from '@/store/player'
import { useContextMenuStore } from '@/store/contextMenu'
import { fmtDuration, hub } from '@/lib/ipc'
import type { Track } from '@/lib/ipc'
import placeholderCover from '@/assets/y2k-note-placeholder.png'

type SortKey = 'title' | 'artist' | 'album' | 'duration' | 'playlist'

export default function TrackList() {
  const {
    sidebarView, visibleTracks, selectTrack, selectedTrackId,
    loading, folders, addFolder, addFolderByPath, error, lastSummary, clearError,
    openPanel, playlists, loadPlaylists,
  } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, setPlaying, addToUpNext, playNext } = usePlayerStore()
  const { openMenu } = useContextMenuStore()

  const [tracks, setTracks] = useState<Track[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('artist')
  const [sortAsc, setSortAsc] = useState(true)
  const [tagViewLoading, setTagViewLoading] = useState(false)
  const [musicSuggestion, setMusicSuggestion] = useState<{ path: string; exists: boolean } | null>(null)
  const [showReadErrors, setShowReadErrors] = useState(false)

  useEffect(() => {
    if (folders.length === 0) {
      hub.suggestMusicFolder().then(setMusicSuggestion).catch(() => {})
    }
  }, [folders.length])

  const loadTracks = useCallback(async () => {
    if (sidebarView.kind === 'tag') {
      setTagViewLoading(true)
      const t = await hub.getTracksForTag(sidebarView.tagId)
      setTagViewLoading(false)
      setTracks(t)
    } else if (sidebarView.kind === 'playlist') {
      setTagViewLoading(true)
      const t = await hub.getTracksForPlaylist(sidebarView.playlistId)
      setTagViewLoading(false)
      setTracks(t)
    } else {
      setTracks(visibleTracks())
    }
  }, [sidebarView, visibleTracks])

  useEffect(() => { loadTracks() }, [loadTracks])

  const sorted = [...tracks].sort((a, b) => {
    if (sortKey === 'duration') {
      const av = Number(a.duration ?? 0)
      const bv = Number(b.duration ?? 0)
      return sortAsc ? av - bv : bv - av
    }
    const av = String(a[sortKey] ?? '')
    const bv = String(b[sortKey] ?? '')
    return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc
        ? <ChevronUp size={10} className="text-accent" />
        : <ChevronDown size={10} className="text-accent" />
      : null

  const current = currentTrack()

  const viewTitle =
    sidebarView.kind === 'all'
      ? 'All Tracks'
      : sidebarView.kind === 'playlist'
      ? sidebarView.name
      : sidebarView.tagName

  function handleRowClick(track: Track) {
    selectTrack(track.id)
  }

  function handleRowDoubleClick(track: Track) {
    selectTrack(track.id)
    playTrack(track, sorted)
  }

  function handleCoverClick(e: React.MouseEvent, track: Track) {
    e.stopPropagation()
    const isCurrent = current?.id === track.id
    if (isCurrent) {
      setPlaying(!isPlaying)
    } else {
      selectTrack(track.id)
      playTrack(track, sorted)
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
          loadTracks()
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
            loadTracks()
          },
        }]
      : []
    openMenu(e.clientX, e.clientY, [
      {
        label: 'Play',
        icon: <Play size={12} />,
        onClick: () => { selectTrack(track.id); playTrack(track, sorted) },
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
      <div className="flex-1 flex items-center justify-center text-muted/50 text-sm">
        Scanning…
      </div>
    )
  }

  if (folders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center">
          <Music size={22} className="text-muted/40" />
        </div>
        <div>
          <p className="text-white/70 text-sm font-medium">No music folder</p>
          <p className="text-muted/50 text-xs mt-1">Add a folder to get started</p>
        </div>
        <div className="flex flex-col items-center gap-2 w-full max-w-[220px]">
          <button
            onClick={addFolder}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent text-sm font-medium transition-colors"
          >
            <FolderPlus size={14} />
            Choose folder…
          </button>
          {musicSuggestion?.exists && (
            <button
              onClick={() => addFolderByPath(musicSuggestion.path)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-white/60 hover:text-white/80 text-sm transition-colors"
              title={musicSuggestion.path}
            >
              <Music size={14} />
              Use my Music folder
            </button>
          )}
        </div>
        {error && (
          <p className="text-red-400/80 text-xs max-w-xs">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {error && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-[12px]">
          <AlertCircle size={13} className="flex-shrink-0 mt-px" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="flex-shrink-0 hover:text-red-300 transition-colors">
            <X size={12} />
          </button>
        </div>
      )}

      {!error && lastSummary && lastSummary.folders > 0 && lastSummary.scanned === 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-400/80 text-[12px]">
          <AlertCircle size={13} className="flex-shrink-0 mt-px" />
          <span className="flex-1">
            No audio files found. Media Player supports <code className="text-yellow-300/70">.mp3</code> and <code className="text-yellow-300/70">.m4a</code>.
          </span>
        </div>
      )}

      {lastSummary && lastSummary.errors.length > 0 && (
        <div className="px-4 py-2 border-b border-white/[0.04] text-[11px] text-muted/40">
          <button
            onClick={() => setShowReadErrors((v) => !v)}
            className="hover:text-muted/70 transition-colors"
          >
            {lastSummary.errors.length} folder{lastSummary.errors.length > 1 ? 's' : ''} couldn't be read
            {showReadErrors ? ' ▴' : ' ▾'}
          </button>
          {showReadErrors && (
            <ul className="mt-1 space-y-0.5 pl-2">
              {lastSummary.errors.map((e, i) => (
                <li key={i} className="text-muted/30 truncate" title={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="px-6 py-4 flex items-baseline gap-3 border-b border-white/[0.05]">
        <h2 className="text-[15px] font-semibold text-white/90">{viewTitle}</h2>
        <span className="text-[11px] text-muted/50">{sorted.length} tracks</span>
      </div>

      <div className="grid grid-cols-[40px_1fr_1fr_1fr_1fr_52px] px-4 py-2 border-b border-white/[0.04] select-none">
        <span />
        {(['title', 'artist', 'album', 'playlist'] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => handleSort(k)}
            className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted/40 hover:text-muted/70 transition-colors text-left"
          >
            {k === 'playlist' ? 'folder' : k} <SortIcon k={k} />
          </button>
        ))}
        <button
          onClick={() => handleSort('duration')}
          className="flex items-center justify-end gap-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted/40 hover:text-muted/70 transition-colors"
        >
          <SortIcon k="duration" /> Time
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted/40 text-sm">
            No tracks found
          </div>
        )}
        {sorted.map((track) => {
          const isCurrentTrack = current?.id === track.id
          const isSelected = selectedTrackId === track.id

          return (
            <div
              key={track.id}
              onClick={() => handleRowClick(track)}
              onDoubleClick={() => handleRowDoubleClick(track)}
              onContextMenu={(e) => handleContextMenu(e, track)}
              className={`grid grid-cols-[40px_1fr_1fr_1fr_1fr_52px] px-4 py-[7px] items-center cursor-pointer select-none transition-colors group ${
                isSelected
                  ? 'bg-white/[0.07] text-white'
                  : 'hover:bg-white/[0.04] text-muted/70'
              } ${isCurrentTrack ? '!text-accent' : ''}`}
            >
              {/* Cover / play indicator */}
              <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 relative bg-white/[0.05]">
                {track.coverDataUrl ? (
                  <>
                    <img src={track.coverDataUrl} alt="" className="w-full h-full object-cover" />
                    <div
                      onClick={(e) => handleCoverClick(e, track)}
                      className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity cursor-pointer ${
                        isCurrentTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isCurrentTrack && isPlaying
                        ? <Pause size={12} className="text-white fill-white" />
                        : <Play size={12} className="text-white fill-white" />
                      }
                    </div>
                  </>
                ) : (
                  <>
                    <img src={placeholderCover} alt="" className="w-full h-full object-cover" />
                    <div
                      onClick={(e) => handleCoverClick(e, track)}
                      className={`absolute inset-0 bg-black/35 flex items-center justify-center transition-opacity cursor-pointer ${
                        isCurrentTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isCurrentTrack && isPlaying
                        ? <Pause size={12} className="text-white fill-white" />
                        : <Play size={12} className="text-white fill-white" />
                      }
                    </div>
                  </>
                )}
              </div>

              <span className={`truncate text-[13px] ${isCurrentTrack ? 'text-accent' : 'text-white/80'} font-medium`}>
                {track.title || '—'}
              </span>
              <span className="truncate text-[13px]">{track.artist || '—'}</span>
              <span className="truncate text-[13px]">{track.album || '—'}</span>
              <span className="truncate text-[12px] text-muted/40">{track.playlist}</span>
              <span className="text-[11px] text-right font-mono text-muted/40 tabular-nums">
                {fmtDuration(track.duration)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
