import React, { useEffect, useState } from 'react'
import {
  Music2,
  ListMusic,
  Tag,
  Play,
  Shuffle,
  Trash2,
  Plus,
  MoreVertical,
} from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { usePlayerStore } from '@/store/player'
import { useContextMenuStore } from '@/store/contextMenu'
import { hub } from '@/lib/ipc'
import type { TagKind } from '@/lib/ipc'
import UtilityDock, { type UtilityMode } from './utilities/UtilityDock'

// Section hex codes for display
const SECTION_CODES: Record<string, string> = {
  Music: '0x01',
  Playlists: '0x02',
  Tags: '0x03',
}

// Isolated uptime component — only this re-renders every second, not the whole Sidebar
function UptimeClock() {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setSecs((v) => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const h = String(Math.floor(secs / 3600)).padStart(2, '0')
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return (
    <span className="font-lcd text-[11px] tabular-nums" style={{ color: '#1f5e3a' }}>
      {`${h}:${m}:${s}`}
    </span>
  )
}

export default function Sidebar({ onOpenUtility, onOpenSettings }: { onOpenUtility: (mode: UtilityMode) => void; onOpenSettings: () => void }) {
  const { playlists, tags, sidebarView, setSidebarView, load, loadTags, loadPlaylists, loading, tracks, driveBytes } =
    useLibraryStore()
  const { playTrack } = usePlayerStore()
  const { openMenu } = useContextMenuStore()
  const [newTagName, setNewTagName] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [showPlaylistInput, setShowPlaylistInput] = useState(false)

  async function handleCreateTag() {
    if (!newTagName.trim()) return
    await hub.createTag(newTagName.trim(), 'custom' as TagKind)
    setNewTagName('')
    setShowTagInput(false)
    loadTags()
  }

  async function handleCreatePlaylist() {
    if (!newPlaylistName.trim()) return
    const playlist = await hub.createPlaylist(newPlaylistName.trim())
    setNewPlaylistName('')
    setShowPlaylistInput(false)
    await loadPlaylists()
    setSidebarView({ kind: 'playlist', playlistId: playlist.id, name: playlist.name })
  }

  const isActive = (kind: string, id?: string | number) => {
    if (kind === 'all' && sidebarView.kind === 'all') return true
    if (kind === 'playlist' && sidebarView.kind === 'playlist' && sidebarView.playlistId === id) return true
    if (kind === 'tag' && sidebarView.kind === 'tag' && sidebarView.tagId === id) return true
    return false
  }

  function handlePlaylistContextMenu(e: React.MouseEvent, playlistId: number, playlistName: string) {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, [
      {
        label: 'Play all',
        icon: <Play size={12} />,
        onClick: async () => {
          setSidebarView({ kind: 'playlist', playlistId, name: playlistName })
          const playlistTracks = await hub.getTracksForPlaylist(playlistId)
          if (playlistTracks.length > 0) playTrack(playlistTracks[0], playlistTracks)
        },
      },
      {
        label: 'Shuffle play',
        icon: <Shuffle size={12} />,
        onClick: async () => {
          setSidebarView({ kind: 'playlist', playlistId, name: playlistName })
          const playlistTracks = await hub.getTracksForPlaylist(playlistId)
          if (playlistTracks.length > 0) {
            const idx = Math.floor(Math.random() * playlistTracks.length)
            playTrack(playlistTracks[idx], playlistTracks)
          }
        },
      },
      { separator: true },
      {
        label: 'Delete playlist',
        icon: <Trash2 size={12} />,
        danger: true,
        onClick: async () => {
          await hub.deletePlaylist(playlistId)
          await loadPlaylists()
          if (sidebarView.kind === 'playlist' && sidebarView.playlistId === playlistId) {
            setSidebarView({ kind: 'all' })
          }
        },
      },
    ])
  }

  function handleTagContextMenu(e: React.MouseEvent, tagId: number, tagName: string) {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, [
      {
        label: 'Play all tracks',
        icon: <Play size={12} />,
        onClick: async () => {
          setSidebarView({ kind: 'tag', tagId, tagName })
          const tagTracks = await hub.getTracksForTag(tagId)
          if (tagTracks.length > 0) playTrack(tagTracks[0], tagTracks)
        },
      },
      { separator: true },
      {
        label: 'Rename tag',
        icon: <Tag size={12} />,
        disabled: true,
      },
      {
        label: 'Delete tag',
        icon: <Trash2 size={12} />,
        danger: true,
        onClick: async () => {
          await hub.deleteTag(tagId)
          loadTags()
          if (sidebarView.kind === 'tag' && sidebarView.tagId === tagId) {
            setSidebarView({ kind: 'all' })
          }
        },
      },
    ])
  }

  const totalCount = tracks.length
  const totalSeconds = tracks.reduce((s, t) => s + (t.duration || 0), 0)
  const totalHours = Math.floor(totalSeconds / 3600)
  const totalMins = Math.floor((totalSeconds % 3600) / 60)
  const totalSecs = Math.floor(totalSeconds % 60)
  const lengthDisplay = `${String(totalHours).padStart(2, '0')}:${String(totalMins).padStart(2, '0')}:${String(totalSecs).padStart(2, '0')}`
  const GB_50 = 50 * 1024 * 1024 * 1024
  const spaceRatio = Math.min(1, driveBytes / GB_50)
  const spaceGB = (driveBytes / (1024 * 1024 * 1024)).toFixed(1)

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-y-auto"
      style={{ width: 210, borderRight: '1px solid rgba(0,255,136,0.18)', background: '#020503' }}
    >
      {/* Header block */}
      <div
        className="flex-shrink-0 px-[14px] pt-[14px] pb-[10px]"
        style={{ background: '#000', borderBottom: '1px solid rgba(0,255,136,0.18)' }}
      >
        <div className="flex items-center justify-between">
          <div className="font-lcd text-[18px] tracking-[2px] phosphor-glow" style={{ color: '#00FF88' }}>
            MAINFRAME
          </div>
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="flex items-center justify-center w-6 h-6 rounded-sm transition-opacity"
            style={{ color: 'rgba(0,255,136,0.40)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#00FF88')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,255,136,0.40)')}
          >
            <MoreVertical size={14} />
          </button>
        </div>
        <div className="font-term text-[11px] tracking-[1.5px] mt-0.5" style={{ color: '#00E5FF' }}>
          music library · v2.0
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              background: '#00FF88',
              transform: 'rotate(45deg)',
              boxShadow: '0 0 5px #00FF88',
            }}
          />
          <span className="font-term text-[11px]" style={{ color: '#1f5e3a' }}>
            link.ok · {totalCount} tracks
          </span>
        </div>
      </div>

      {/* Library */}
      <SectionLabel label="LIBRARY" code={SECTION_CODES.Music} />
      <NavItem
        label="all tracks"
        active={isActive('all')}
        onClick={() => setSidebarView({ kind: 'all' })}
        count={totalCount}
        icon={<Music2 size={12} />}
      />

      {/* Playlists */}
      <SectionLabel
        label="PLAYLISTS"
        code={SECTION_CODES.Playlists}
        action={
          <button
            style={{ color: 'rgba(155,245,184,0.40)' }}
            className="font-term text-[11px] hover:text-phosphor transition-colors"
            onClick={() => setShowPlaylistInput((v) => !v)}
            title="New playlist"
          >
            +
          </button>
        }
      />
      {showPlaylistInput && (
        <div className="px-[10px] pb-2 flex gap-1">
          <input
            autoFocus
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
            placeholder="playlist name..."
            className="flex-1 font-term text-[13px] px-2 py-0.5 outline-none"
            style={{
              background: '#000',
              border: '1px solid rgba(0,255,136,0.35)',
              color: '#00FF88',
              borderRadius: 0,
            }}
          />
          <button
            onClick={handleCreatePlaylist}
            className="font-term text-[12px] px-2 transition-colors"
            style={{
              background: 'rgba(0,255,136,0.10)',
              border: '1px solid rgba(0,255,136,0.35)',
              color: '#00FF88',
            }}
          >
            Add
          </button>
        </div>
      )}
      {playlists.map((p) => (
        <NavItem
          key={p.id}
          label={p.name}
          count={p.count}
          active={isActive('playlist', p.id)}
          onClick={() => setSidebarView({ kind: 'playlist', playlistId: p.id, name: p.name })}
          onContextMenu={(e) => handlePlaylistContextMenu(e, p.id, p.name)}
          icon={<ListMusic size={12} />}
        />
      ))}
      {playlists.length === 0 && !showPlaylistInput && (
        <p className="px-[14px] pb-2 font-term text-[12px]" style={{ color: 'rgba(155,245,184,0.30)' }}>
          no playlists
        </p>
      )}

      {/* Tags */}
      <SectionLabel
        label="TAGS"
        code={SECTION_CODES.Tags}
        action={
          <button
            style={{ color: 'rgba(155,245,184,0.40)' }}
            className="font-term text-[11px] hover:text-phosphor transition-colors"
            onClick={() => setShowTagInput((v) => !v)}
            title="New tag"
          >
            #
          </button>
        }
      />
      {showTagInput && (
        <div className="px-[10px] pb-2 flex gap-1">
          <input
            autoFocus
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
            placeholder="tag name..."
            className="flex-1 font-term text-[13px] px-2 py-0.5 outline-none"
            style={{
              background: '#000',
              border: '1px solid rgba(0,255,136,0.35)',
              color: '#00FF88',
              borderRadius: 0,
            }}
          />
          <button
            onClick={handleCreateTag}
            className="font-term text-[12px] px-2 transition-colors"
            style={{
              background: 'rgba(0,255,136,0.10)',
              border: '1px solid rgba(0,255,136,0.35)',
              color: '#00FF88',
            }}
          >
            Add
          </button>
        </div>
      )}
      {tags.map((tag) => (
        <NavItem
          key={tag.id}
          label={`#${tag.name}`}
          active={isActive('tag', tag.id)}
          onClick={() => setSidebarView({ kind: 'tag', tagId: tag.id, tagName: tag.name })}
          onContextMenu={(e) => handleTagContextMenu(e, tag.id, tag.name)}
          icon={<Tag size={12} />}
        />
      ))}
      {tags.length === 0 && !showTagInput && (
        <p className="px-[14px] pb-2 font-term text-[12px]" style={{ color: 'rgba(155,245,184,0.30)' }}>
          no tags
        </p>
      )}

      <div className="flex-1" />

      {/* Utility dock */}
      <UtilityDock onOpen={onOpenUtility} />

      {/* Status footer */}
      <div
        className="px-[10px] py-[8px]"
        style={{ borderTop: '1px solid rgba(0,255,136,0.18)', background: '#000' }}
      >
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(0,255,136,0.12)' }}>
          <span className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: '#00E5FF' }}>MEDIA.DRIVE</span>
          <span style={{ display: 'inline-block', width: 5, height: 5, background: '#00FF88', boxShadow: '0 0 5px #00FF88' }} />
        </div>

        {/* Songs */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="font-mono text-[9px] flex-shrink-0" style={{ color: 'rgba(155,245,184,0.40)', width: 36 }}>SONGS</span>
          <span className="font-mono text-[9px] tabular-nums" style={{ color: '#00FF88' }}>{totalCount}</span>
        </div>

        {/* Space */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="font-mono text-[9px] flex-shrink-0" style={{ color: 'rgba(155,245,184,0.40)', width: 36 }}>SPACE</span>
          <div className="flex-1 relative" style={{ height: 4, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.12)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${spaceRatio * 100}%`, background: '#FFB000', boxShadow: '0 0 4px #FFB000' }} />
          </div>
          <span className="font-mono text-[9px] flex-shrink-0 text-right tabular-nums" style={{ color: '#FFB000', width: 32 }}>{spaceGB}G</span>
        </div>

        {/* Length */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="font-mono text-[9px] flex-shrink-0" style={{ color: 'rgba(155,245,184,0.40)', width: 36 }}>LENGTH</span>
          <span className="font-mono text-[9px] tabular-nums" style={{ color: '#00E5FF' }}>{lengthDisplay}</span>
        </div>
        <div className="flex items-center justify-between pt-1.5 mt-0.5" style={{ borderTop: '1px dashed rgba(0,255,136,0.10)' }}>
          <span className="font-mono text-[9px] uppercase tracking-[1px]" style={{ color: 'rgba(155,245,184,0.30)' }}>UPTIME</span>
          <UptimeClock />
        </div>
      </div>

      {/* Reindex button */}
      <div className="px-[12px] pb-[10px]" style={{ background: '#000' }}>
        <button
          onClick={load}
          disabled={loading}
          className="w-full font-term text-[13px] tracking-[1.5px] uppercase py-[6px] transition-colors disabled:opacity-40"
          style={{
            background: 'transparent',
            border: '1px solid #00FF88',
            color: '#00FF88',
            textShadow: '0 0 4px #00FF88',
            borderRadius: 0,
          }}
        >
          {loading ? '> scanning...' : '> reindex'}
        </button>
      </div>
    </aside>
  )
}

function SectionLabel({
  label,
  code,
  action,
}: {
  label: string
  code?: string
  action?: React.ReactNode
}) {
  return (
    <div
      className="flex items-center px-[14px] pt-[12px] pb-[6px]"
      style={{ borderTop: '1px dashed rgba(0,255,136,0.08)' }}
    >
      <span className="font-term text-[12px] tracking-[1.5px]" style={{ color: '#00E5FF' }}>
        ▼ {label}
      </span>
      <div className="flex-1" />
      {code && (
        <span className="font-mono text-[9px] mr-1" style={{ color: 'rgba(155,245,184,0.30)' }}>
          {code}
        </span>
      )}
      {action}
    </div>
  )
}

function NavItem({
  label,
  active,
  onClick,
  onContextMenu,
  icon,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  icon?: React.ReactNode
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="w-full flex items-center gap-2 px-[14px] py-[4px] text-left transition-colors"
      style={
        active
          ? {
              color: '#00FF88',
              background: 'linear-gradient(90deg, rgba(0,255,136,0.15), transparent)',
              textShadow: '0 0 6px #00FF88',
            }
          : { color: 'rgba(155,245,184,0.55)' }
      }
    >
      <span className="font-term text-[14px] w-3 flex-shrink-0 select-none">
        {active ? '>' : ' '}
      </span>
      <span className="flex-shrink-0" style={{ opacity: active ? 1 : 0.4 }}>{icon}</span>
      <span className="flex-1 font-term text-[14px] truncate">{label}</span>
      {count !== undefined && (
        <span className="font-term text-[12px]" style={{ color: 'rgba(155,245,184,0.30)' }}>
          {String(count).padStart(4, '0')}
        </span>
      )}
    </button>
  )
}
