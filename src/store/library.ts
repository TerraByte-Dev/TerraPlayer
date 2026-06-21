import { create } from 'zustand'
import type { Track, PlaylistSummary, Tag, LibraryFolder, ScanSummary } from '@/lib/ipc'
import { hub } from '@/lib/ipc'
import { usePlayerStore } from './player'

export type SidebarView =
  | { kind: 'all' }
  | { kind: 'playlist'; playlistId: number; name: string }
  | { kind: 'tag'; tagId: number; tagName: string }

interface LibraryState {
  tracks: Track[]
  playlists: PlaylistSummary[]
  tags: Tag[]
  folders: LibraryFolder[]
  loading: boolean
  error: string | null
  lastSummary: ScanSummary | null
  sidebarView: SidebarView
  selectedTrackId: number | null
  rightPanelOpen: boolean
  panelMode: 'metadata' | 'queue' | 'downloader'
  driveBytes: number

  load: () => Promise<void>
  refreshTrack: (path: string) => Promise<void>
  loadPlaylists: () => Promise<void>
  loadTags: () => Promise<void>
  renamePlaylist: (id: number, name: string) => Promise<void>
  renameTag: (id: number, name: string) => Promise<void>
  addFolder: () => Promise<void>
  addFolderByPath: (path: string) => Promise<void>
  removeFolder: (path: string) => Promise<void>
  deleteTrack: (id: number) => Promise<void>
  clearError: () => void
  setSidebarView: (v: SidebarView) => void
  selectTrack: (id: number | null) => void
  toggleRightPanel: () => void
  openPanel: (mode: 'metadata' | 'queue' | 'downloader') => void
  closeDownloaderPanel: () => void
  visibleTracks: () => Track[]
  selectedTrack: () => Track | null
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tracks: [],
  playlists: [],
  tags: [],
  folders: [],
  loading: false,
  error: null,
  lastSummary: null,
  sidebarView: { kind: 'all' },
  selectedTrackId: null,
  rightPanelOpen: false,
  panelMode: 'metadata' as 'metadata' | 'queue' | 'downloader',
  driveBytes: 0,

  load: async () => {
    set({ loading: true, error: null })
    try {
      // scanLibrary must finish first — it may insert into library_folders on first run,
      // and listFolders run in parallel would read before that insert completes.
      const { playlists, tracks, summary } = await hub.scanLibrary()
      const [tags, folders, { totalBytes }] = await Promise.all([
        hub.listTags(),
        hub.listFolders(),
        hub.getDriveStats(),
      ])
      // Drop a stale selection if its track no longer exists, so tag edits can't
      // land on a different song that may have inherited a reused row.
      const { selectedTrackId } = get()
      const stillExists = selectedTrackId != null && tracks.some((t) => t.id === selectedTrackId)
      set({
        playlists, tracks, tags, folders, loading: false, lastSummary: summary, driveBytes: totalBytes,
        selectedTrackId: stillExists ? selectedTrackId : null,
      })
    } catch (e) {
      set({ loading: false, error: String(e) })
    }
  },

  refreshTrack: async (path: string) => {
    const updated = await hub.refreshTrack(path)
    if (!updated) return
    set((s) => ({
      tracks: s.tracks.map((t) => (t.path === path ? updated : t)),
    }))
  },

  loadTags: async () => {
    const tags = await hub.listTags()
    set({ tags })
  },

  loadPlaylists: async () => {
    const playlists = await hub.listPlaylists()
    set({ playlists })
  },

  // Rename throws (rejects) on an empty/duplicate name — the DB guards too — so
  // callers can surface the message inline. On success we refresh the sidebar
  // list and patch the active view so its header retitles to the new name.
  renamePlaylist: async (id, name) => {
    const updated = await hub.renamePlaylist(id, name)
    await get().loadPlaylists()
    const { sidebarView } = get()
    if (sidebarView.kind === 'playlist' && sidebarView.playlistId === id) {
      set({ sidebarView: { ...sidebarView, name: updated.name } })
    }
  },

  renameTag: async (id, name) => {
    const updated = await hub.renameTag(id, name)
    await get().loadTags()
    const { sidebarView } = get()
    if (sidebarView.kind === 'tag' && sidebarView.tagId === id) {
      set({ sidebarView: { ...sidebarView, tagName: updated.name } })
    }
  },

  addFolder: async () => {
    const picked = await hub.pickFolder()
    if (!picked) return
    await get().addFolderByPath(picked)
  },

  addFolderByPath: async (path: string) => {
    set({ error: null })
    try {
      await hub.addFolder(path)
      await get().load()
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  removeFolder: async (path: string) => {
    await hub.removeFolder(path)
    await get().load()
  },

  deleteTrack: async (id: number) => {
    // Purge from the player first (esp. if it's now-playing) so the <audio> src
    // changes and the file handle is released before main trashes it.
    usePlayerStore.getState().purgeTrack(id)
    const res = await hub.deleteTrack(id)
    if (res.cancelled) return
    if (res.ok) {
      set((s) => ({
        tracks: s.tracks.filter((t) => t.id !== id),
        selectedTrackId: s.selectedTrackId === id ? null : s.selectedTrackId,
      }))
      // Cascade removed playlist memberships — refresh the counts/views.
      get().loadPlaylists()
    } else {
      set({ error: res.reason ?? 'Could not delete the song.' })
    }
  },

  clearError: () => set({ error: null }),

  setSidebarView: (v) => set({ sidebarView: v }),
  selectTrack: (id) => set({ selectedTrackId: id }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen, panelMode: 'metadata' })),
  openPanel: (mode) => set({ rightPanelOpen: true, panelMode: mode }),
  closeDownloaderPanel: () => set((s) => (s.panelMode === 'downloader' ? { rightPanelOpen: false } : {})),

  visibleTracks: () => {
    const { sidebarView, tracks } = get()
    if (sidebarView.kind === 'all') return tracks
    return []
  },

  selectedTrack: () => {
    const { selectedTrackId, tracks } = get()
    return tracks.find((t) => t.id === selectedTrackId) ?? null
  },
}))
