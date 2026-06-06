import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Music2,
  ListMusic,
  Tag,
  Play,
  Shuffle,
  Trash2,
  Plus,
  Pencil,
} from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { usePlayerStore } from '@/store/player'
import { useContextMenuStore } from '@/store/contextMenu'
import { hub } from '@/lib/ipc'
import type { TagKind } from '@/lib/ipc'
import { validateRename } from '@/lib/library-core'
import UtilityDock, { type UtilityMode } from './utilities/UtilityDock'

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
    <span className="font-lcd text-[11px] tabular-nums" style={{ color: 'var(--accent-deep)' }}>
      {`${h}:${m}:${s}`}
    </span>
  )
}

export default function Sidebar({ onOpenUtility }: { onOpenUtility: (mode: UtilityMode) => void }) {
  const { playlists, tags, sidebarView, setSidebarView, load, loadTags, loadPlaylists, renamePlaylist, renameTag, loading, tracks, driveBytes } =
    useLibraryStore()
  const { playTrack } = usePlayerStore()
  const { openMenu } = useContextMenuStore()
  const [newTagName, setNewTagName] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [showPlaylistInput, setShowPlaylistInput] = useState(false)

  // Inline rename — one item at a time, keyed by kind+id.
  const [editing, setEditing] = useState<{ kind: 'playlist' | 'tag'; id: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const savingRef = useRef(false)

  function beginEdit(kind: 'playlist' | 'tag', id: number, currentName: string) {
    setEditing({ kind, id })
    setEditValue(currentName)
    setEditError(null)
  }

  function cancelEdit() {
    setEditing(null)
    setEditValue('')
    setEditError(null)
    savingRef.current = false
  }

  async function commitEdit(fromBlur: boolean) {
    if (!editing || savingRef.current) return
    // Validate against the OTHER items' names so a no-op / case-only edit passes.
    const others =
      editing.kind === 'playlist'
        ? playlists.filter((p) => p.id !== editing.id).map((p) => p.name)
        : tags.filter((t) => t.id !== editing.id).map((t) => t.name)
    const check = validateRename(editValue, others)
    if (!check.ok) {
      // Losing focus with an invalid name abandons the edit rather than trapping the user.
      if (fromBlur) cancelEdit()
      else setEditError(check.message)
      return
    }
    savingRef.current = true
    try {
      if (editing.kind === 'playlist') await renamePlaylist(editing.id, check.name)
      else await renameTag(editing.id, check.name)
      cancelEdit()
    } catch (e) {
      savingRef.current = false
      const msg = e instanceof Error ? e.message : String(e)
      if (fromBlur) cancelEdit()
      else setEditError(msg)
    }
  }

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
        label: 'Rename playlist',
        icon: <Pencil size={12} />,
        onClick: () => beginEdit('playlist', playlistId, playlistName),
      },
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
        icon: <Pencil size={12} />,
        onClick: () => beginEdit('tag', tagId, tagName),
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
  // `tracks` only changes on a scan/refresh, but Sidebar re-renders on any
  // library-store change (view/selection/panel toggles). Memoize so the O(n)
  // walk over the whole library doesn't run on those unrelated re-renders.
  const totalSeconds = useMemo(() => tracks.reduce((s, t) => s + (t.duration || 0), 0), [tracks])
  const totalHours = Math.floor(totalSeconds / 3600)
  const totalMins = Math.floor((totalSeconds % 3600) / 60)
  const totalSecs = Math.floor(totalSeconds % 60)
  const lengthDisplay = `${String(totalHours).padStart(2, '0')}:${String(totalMins).padStart(2, '0')}:${String(totalSecs).padStart(2, '0')}`
  const GB_50 = 50 * 1024 * 1024 * 1024
  const spaceRatio = Math.min(1, driveBytes / GB_50)
  const spaceGB = (driveBytes / (1024 * 1024 * 1024)).toFixed(1)

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{ width: 210, borderRight: '1px solid rgb(var(--accent-rgb) / 0.18)', background: 'var(--bg-1)' }}
    >
      {/* Scrolling region — library / playlists / tags (the only part that scrolls) */}
      <div className="flex-1 overflow-y-auto min-h-0">
      {/* Library */}
      <SectionLabel label="LIBRARY" />
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
        action={<AddButton title="New playlist" active={showPlaylistInput} onClick={() => setShowPlaylistInput((v) => !v)} />}
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
              border: '1px solid rgb(var(--accent-rgb) / 0.35)',
              color: 'var(--accent)',
              borderRadius: 0,
            }}
          />
          <button
            onClick={handleCreatePlaylist}
            className="font-term text-[12px] px-2 transition-colors"
            style={{
              background: 'rgb(var(--accent-rgb) / 0.10)',
              border: '1px solid rgb(var(--accent-rgb) / 0.35)',
              color: 'var(--accent)',
            }}
          >
            Add
          </button>
        </div>
      )}
      {playlists.map((p) =>
        editing?.kind === 'playlist' && editing.id === p.id ? (
          <RenameRow
            key={p.id}
            icon={<ListMusic size={12} />}
            value={editValue}
            error={editError}
            onChange={(v) => { setEditValue(v); if (editError) setEditError(null) }}
            onCommit={commitEdit}
            onCancel={cancelEdit}
          />
        ) : (
          <NavItem
            key={p.id}
            label={p.name}
            count={p.count}
            active={isActive('playlist', p.id)}
            onClick={() => setSidebarView({ kind: 'playlist', playlistId: p.id, name: p.name })}
            onDoubleClick={() => beginEdit('playlist', p.id, p.name)}
            onContextMenu={(e) => handlePlaylistContextMenu(e, p.id, p.name)}
            icon={<ListMusic size={12} />}
          />
        )
      )}
      {playlists.length === 0 && !showPlaylistInput && (
        <p className="px-[14px] pb-2 font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}>
          no playlists
        </p>
      )}

      {/* Tags */}
      <SectionLabel
        label="TAGS"
        action={<AddButton title="New tag" active={showTagInput} onClick={() => setShowTagInput((v) => !v)} />}
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
              border: '1px solid rgb(var(--accent-rgb) / 0.35)',
              color: 'var(--accent)',
              borderRadius: 0,
            }}
          />
          <button
            onClick={handleCreateTag}
            className="font-term text-[12px] px-2 transition-colors"
            style={{
              background: 'rgb(var(--accent-rgb) / 0.10)',
              border: '1px solid rgb(var(--accent-rgb) / 0.35)',
              color: 'var(--accent)',
            }}
          >
            Add
          </button>
        </div>
      )}
      {tags.map((tag) =>
        editing?.kind === 'tag' && editing.id === tag.id ? (
          <RenameRow
            key={tag.id}
            icon={<Tag size={12} />}
            value={editValue}
            error={editError}
            onChange={(v) => { setEditValue(v); if (editError) setEditError(null) }}
            onCommit={commitEdit}
            onCancel={cancelEdit}
          />
        ) : (
          <NavItem
            key={tag.id}
            label={`#${tag.name}`}
            active={isActive('tag', tag.id)}
            onClick={() => setSidebarView({ kind: 'tag', tagId: tag.id, tagName: tag.name })}
            onDoubleClick={() => beginEdit('tag', tag.id, tag.name)}
            onContextMenu={(e) => handleTagContextMenu(e, tag.id, tag.name)}
            icon={<Tag size={12} />}
          />
        )
      )}
      {tags.length === 0 && !showTagInput && (
        <p className="px-[14px] pb-2 font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}>
          no tags
        </p>
      )}

      </div>

      {/* Fixed bottom — tools, MEDIA.DRIVE, reindex */}
      <div className="flex-shrink-0">
      {/* Utility dock */}
      <UtilityDock onOpen={onOpenUtility} />

      {/* Status footer */}
      <div
        className="px-[10px] py-[8px]"
        style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.18)', background: '#000' }}
      >
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.12)' }}>
          <span className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--accent2)' }}>MEDIA.DRIVE</span>
          <span style={{ display: 'inline-block', width: 5, height: 5, background: 'var(--accent)', boxShadow: '0 0 5px var(--accent)' }} />
        </div>

        {/* Songs */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="font-mono text-[9px] flex-shrink-0" style={{ color: 'rgb(var(--ink-rgb) / 0.40)', width: 36 }}>SONGS</span>
          <span className="font-mono text-[9px] tabular-nums" style={{ color: 'var(--accent)' }}>{totalCount}</span>
        </div>

        {/* Space */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="font-mono text-[9px] flex-shrink-0" style={{ color: 'rgb(var(--ink-rgb) / 0.40)', width: 36 }}>SPACE</span>
          <div className="flex-1 relative" style={{ height: 4, background: 'rgb(var(--accent-rgb) / 0.06)', border: '1px solid rgb(var(--accent-rgb) / 0.12)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${spaceRatio * 100}%`, background: '#FFB000', boxShadow: '0 0 4px #FFB000' }} />
          </div>
          <span className="font-mono text-[9px] flex-shrink-0 text-right tabular-nums" style={{ color: '#FFB000', width: 32 }}>{spaceGB}G</span>
        </div>

        {/* Length */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="font-mono text-[9px] flex-shrink-0" style={{ color: 'rgb(var(--ink-rgb) / 0.40)', width: 36 }}>LENGTH</span>
          <span className="font-mono text-[9px] tabular-nums" style={{ color: 'var(--accent2)' }}>{lengthDisplay}</span>
        </div>
        <div className="flex items-center justify-between pt-1.5 mt-0.5" style={{ borderTop: '1px dashed rgb(var(--accent-rgb) / 0.10)' }}>
          <span className="font-mono text-[9px] uppercase tracking-[1px]" style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}>UPTIME</span>
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
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            textShadow: '0 0 4px var(--accent)',
            borderRadius: 0,
          }}
        >
          {loading ? '> scanning...' : '> reindex'}
        </button>
      </div>
      </div>
    </aside>
  )
}

function SectionLabel({
  label,
  action,
}: {
  label: string
  action?: React.ReactNode
}) {
  return (
    <div
      className="flex items-center px-[14px] pt-[12px] pb-[6px]"
      style={{ borderTop: '1px dashed rgb(var(--accent-rgb) / 0.08)' }}
    >
      <span className="font-term text-[12px] tracking-[1.5px]" style={{ color: 'var(--accent2)' }}>
        ▼ {label}
      </span>
      <div className="flex-1" />
      {action}
    </div>
  )
}

// A clearly-visible "add" button for the Playlists / Tags section headers (the old faint +/# glyphs were
// easy to miss). The Plus rotates to an × while its inline input is open.
function AddButton({ onClick, title, active }: { onClick: () => void; title: string; active?: boolean }) {
  const idle = 'rgb(var(--accent-rgb) / 0.10)'
  const on = 'rgb(var(--accent-rgb) / 0.22)'
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className="flex items-center justify-center transition-colors"
      style={{ width: 18, height: 18, border: '1px solid rgb(var(--accent-rgb) / 0.45)', background: active ? on : idle, color: 'var(--accent)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = on)}
      onMouseLeave={(e) => (e.currentTarget.style.background = active ? on : idle)}
    >
      <Plus size={12} style={{ transform: active ? 'rotate(45deg)' : 'none', transition: 'transform 120ms' }} />
    </button>
  )
}

// Inline editor that replaces a NavItem while its playlist/tag is being renamed.
// Enter saves, Escape reverts, blur saves (or reverts on an invalid name).
function RenameRow({
  value,
  error,
  icon,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string
  error: string | null
  icon?: React.ReactNode
  onChange: (v: string) => void
  onCommit: (fromBlur: boolean) => void
  onCancel: () => void
}) {
  return (
    <div className="px-[14px] py-[4px]">
      <div className="flex items-center gap-2">
        <span className="font-term text-[14px] w-3 flex-shrink-0 select-none" style={{ color: 'var(--accent)' }}>›</span>
        <span className="flex-shrink-0" style={{ color: 'var(--accent)' }}>{icon}</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onCommit(false) }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          }}
          onBlur={() => onCommit(true)}
          className="flex-1 min-w-0 font-term text-[14px] px-1.5 py-0.5 outline-none"
          style={{
            background: '#000',
            border: error ? '1px solid #FF3030' : '1px solid rgb(var(--accent-rgb) / 0.55)',
            color: 'var(--accent)',
            borderRadius: 0,
          }}
        />
      </div>
      {error && (
        <p className="font-term text-[11px] mt-1 pl-7" style={{ color: '#FF3030' }}>{error}</p>
      )}
    </div>
  )
}

function NavItem({
  label,
  active,
  onClick,
  onDoubleClick,
  onContextMenu,
  icon,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  icon?: React.ReactNode
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="w-full flex items-center gap-2 px-[14px] py-[4px] text-left transition-colors"
      style={
        active
          ? {
              color: 'var(--accent)',
              background: 'linear-gradient(90deg, rgb(var(--accent-rgb) / 0.15), transparent)',
              textShadow: '0 0 6px var(--accent)',
            }
          : { color: 'rgb(var(--ink-rgb) / 0.55)' }
      }
    >
      <span className="font-term text-[14px] w-3 flex-shrink-0 select-none">
        {active ? '>' : ' '}
      </span>
      <span className="flex-shrink-0" style={{ opacity: active ? 1 : 0.4 }}>{icon}</span>
      <span className="flex-1 font-term text-[14px] truncate">{label}</span>
      {count !== undefined && (
        <span className="font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}>
          {String(count).padStart(4, '0')}
        </span>
      )}
    </button>
  )
}
