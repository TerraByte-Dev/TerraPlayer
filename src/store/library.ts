import { create } from 'zustand'
import type { Track, PlaylistSummary, Tag, LibraryFolder, ScanSummary } from '@/lib/ipc'
import { hub } from '@/lib/ipc'

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
  panelMode: 'metadata' | 'queue'
  driveBytes: number

  load: () => Promise<void>
  refreshTrack: (path: string) => Promise<void>
  loadPlaylists: () => Promise<void>
  loadTags: () => Promise<void>
  addFolder: () => Promise<void>
  addFolderByPath: (path: string) => Promise<void>
  removeFolder: (path: string) => Promise<void>
  clearError: () => void
  setSidebarView: (v: SidebarView) => void
  selectTrack: (id: number | null) => void
  toggleRightPanel: () => void
  openPanel: (mode: 'metadata' | 'queue') => void
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
  panelMode: 'metadata' as 'metadata' | 'queue',
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

  clearError: () => set({ error: null }),

  setSidebarView: (v) => set({ sidebarView: v }),
  selectTrack: (id) => set({ selectedTrackId: id }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen, panelMode: 'metadata' })),
  openPanel: (mode) => set({ rightPanelOpen: true, panelMode: mode }),

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
