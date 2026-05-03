import React, { useState } from 'react'
import {
  Music2,
  ListMusic,
  Tag,
  RefreshCw,
  Play,
  Shuffle,
  Trash2,
  Plus,
} from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { usePlayerStore } from '@/store/player'
import { useContextMenuStore } from '@/store/contextMenu'
import { hub } from '@/lib/ipc'
import type { TagKind } from '@/lib/ipc'
import UtilityDock, { type UtilityMode } from './utilities/UtilityDock'

export default function Sidebar({ onOpenUtility }: { onOpenUtility: (mode: UtilityMode) => void }) {
  const { playlists, tags, sidebarView, setSidebarView, load, loadTags, loadPlaylists, loading } =
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

  return (
    <aside className="w-56 flex-shrink-0 bg-surface-300 flex flex-col overflow-y-auto border-r border-white/[0.05]">
      {/* App title */}
      <div className="px-4 pt-3 pb-5 select-none">
        <h1 className="text-[15px] font-semibold text-white/90 tracking-tight">Media Player</h1>
      </div>

      {/* Library */}
      <Section label="Music">
        <NavItem
          label="All Tracks"
          active={isActive('all')}
          onClick={() => setSidebarView({ kind: 'all' })}
          icon={<Music2 size={13} />}
        />
      </Section>

      {/* Playlists */}
      <Section
        label="Playlists"
        action={
          <button
            className="text-muted/50 hover:text-accent transition-colors"
            onClick={() => setShowPlaylistInput((v) => !v)}
            title="New playlist"
          >
            <Plus size={11} />
          </button>
        }
      >
        {showPlaylistInput && (
          <div className="px-3 pb-2 flex gap-1">
            <input
              autoFocus
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
              placeholder="playlist name..."
              className="flex-1 bg-surface-100 text-white text-[11px] rounded px-2 py-1 outline-none border border-white/[0.08] focus:border-accent/40 transition-colors"
            />
            <button
              onClick={handleCreatePlaylist}
              className="text-[11px] px-2 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent transition-colors"
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
            icon={<ListMusic size={13} />}
          />
        ))}
        {playlists.length === 0 && !showPlaylistInput && (
          <p className="px-4 pb-2 text-[11px] text-muted/40">No playlists</p>
        )}
      </Section>

      {/* Tags */}
      <Section
        label="Tags"
        action={
          <button
            className="text-muted/50 hover:text-accent transition-colors"
            onClick={() => setShowTagInput((v) => !v)}
            title="New tag"
          >
            <Tag size={11} />
          </button>
        }
      >
        {showTagInput && (
          <div className="px-3 pb-2 flex gap-1">
            <input
              autoFocus
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
              placeholder="tag name…"
              className="flex-1 bg-surface-100 text-white text-[11px] rounded px-2 py-1 outline-none border border-white/[0.08] focus:border-accent/40 transition-colors"
            />
            <button
              onClick={handleCreateTag}
              className="text-[11px] px-2 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent transition-colors"
            >
              Add
            </button>
          </div>
        )}
        {tags.map((tag) => (
          <NavItem
            key={tag.id}
            label={tag.name}
            active={isActive('tag', tag.id)}
            onClick={() => setSidebarView({ kind: 'tag', tagId: tag.id, tagName: tag.name })}
            onContextMenu={(e) => handleTagContextMenu(e, tag.id, tag.name)}
            icon={<Tag size={13} />}
          />
        ))}
        {tags.length === 0 && !showTagInput && (
          <p className="px-4 pb-2 text-[11px] text-muted/40">No tags yet</p>
        )}
      </Section>

      {/* Spacer + refresh */}
      <div className="flex-1" />
      <UtilityDock onOpen={onOpenUtility} />
      <div className="p-3 border-t border-white/[0.05]">
        <button
          onClick={load}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 text-[11px] py-2 rounded-md bg-surface-100 hover:bg-white/[0.07] text-muted hover:text-white/80 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Scanning…' : 'Refresh'}
        </button>
      </div>
    </aside>
  )
}

function Section({
  label,
  children,
  action,
}: {
  label: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mt-1">
      <div className="flex items-center px-4 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted/40 flex-1">
          {label}
        </span>
        {action}
      </div>
      {children}
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
      className={`w-full flex items-center gap-2.5 px-4 py-1.5 text-[12px] text-left transition-colors ${
        active
          ? 'text-white bg-white/[0.07]'
          : 'text-muted/70 hover:text-white/80 hover:bg-white/[0.04]'
      }`}
    >
      <span className={`flex-shrink-0 ${active ? 'text-accent' : 'text-muted/30'}`}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] text-muted/30 tabular-nums">{count}</span>
      )}
    </button>
  )
}
