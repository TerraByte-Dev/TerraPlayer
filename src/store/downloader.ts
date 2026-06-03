import { create } from 'zustand'
import { hub } from '@/lib/ipc'
import type {
  AuthStatus,
  Confidence,
  DownloaderCandidate,
  DownloaderEvent,
  DownloaderPreflight,
  InstallEvent,
  ResolvedRow,
} from '@/lib/ipc'
import { useLibraryStore } from './library'

// Tools "Fix it for me" can auto-install (mirrors downloader-core.isInstallable).
const INSTALLABLE = new Set(['yt-dlp', 'ytmusicapi', 'ffmpeg', 'deno'])

export type Phase = 'input' | 'preview' | 'downloading' | 'done'

export interface PreviewRow extends ResolvedRow {
  confidence: Confidence
  // client-side augmentation
  accepted: boolean
  editing?: boolean
  draftQuery?: string
  pinDraft?: string
  candidates?: DownloaderCandidate[] | null
  candidatesLoading?: boolean
  swapOpen?: boolean
  // download runtime
  dlStage?: 'queued' | 'downloading' | 'embedding' | 'done' | 'failed' | 'skipped'
  pct?: number
}

export interface DownloadSummary {
  new: number
  skipped: number
  failed: number
  low_confidence: string[]
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

function extractVideoId(input: string): string | null {
  const s = input.trim()
  if (VIDEO_ID_RE.test(s)) return s
  const m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/) || s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

interface DownloaderState {
  open: boolean
  phase: Phase
  preflight: DownloaderPreflight | null
  preflightLoading: boolean
  auth: AuthStatus | null
  browsers: string[]
  connecting: boolean
  installing: boolean
  installLog: string[]
  installingTools: string[]
  inputText: string
  csvPath: string | null
  csvName: string | null
  outDir: string
  outDirIsLibrary: boolean
  resolving: boolean
  busy: boolean
  rows: PreviewRow[]
  downloadOrder: number[]
  summary: DownloadSummary | null
  reindexed: boolean
  error: string | null

  openPanel: () => Promise<void>
  closePanel: () => void
  reset: () => void
  setInputText: (t: string) => void
  ingestFilePath: (path: string) => Promise<void>
  loadPreflight: (fast?: boolean) => Promise<void>
  loadAuth: () => Promise<void>
  connectYouTube: () => Promise<void>
  disconnectYouTube: () => Promise<void>
  setAuthBrowser: (b: string) => Promise<void>
  importCookies: () => Promise<void>
  fixIt: () => Promise<void>
  handleInstallEvent: (e: InstallEvent) => void
  pickOutDir: () => Promise<void>
  addOutDirToLibrary: () => Promise<void>
  runPreview: () => Promise<void>
  backToInput: () => void

  toggleAccept: (i: number) => void
  setAcceptAll: (v: boolean) => void
  removeRow: (i: number) => void
  startEdit: (i: number) => void
  setDraftQuery: (i: number, q: string) => void
  commitEdit: (i: number) => Promise<void>
  cancelEdit: (i: number) => void
  toggleSwap: (i: number) => Promise<void>
  swapTo: (i: number, c: DownloaderCandidate) => void
  setPinDraft: (i: number, url: string) => void
  commitPin: (i: number) => Promise<void>

  startDownload: () => Promise<void>
  cancel: () => Promise<void>
  handleEvent: (e: DownloaderEvent) => void
}

function patchRow(rows: PreviewRow[], i: number, patch: Partial<PreviewRow>): PreviewRow[] {
  return rows.map((r) => (r.i === i ? { ...r, ...patch } : r))
}

export const useDownloaderStore = create<DownloaderState>((set, get) => ({
  open: false,
  phase: 'input',
  preflight: null,
  preflightLoading: false,
  auth: null,
  browsers: ['firefox', 'chrome', 'edge'],
  connecting: false,
  installing: false,
  installLog: [],
  installingTools: [],
  inputText: '',
  csvPath: null,
  csvName: null,
  outDir: '',
  outDirIsLibrary: false,
  resolving: false,
  busy: false,
  rows: [],
  downloadOrder: [],
  summary: null,
  reindexed: false,
  error: null,

  openPanel: async () => {
    set({ open: true })
    get().loadAuth()
    get().loadPreflight()
    // Default the output dir to the library folder the user is currently viewing.
    try {
      const folders = useLibraryStore.getState().folders
      const preferred = folders[0]?.path
      const outDir = await hub.downloaderResolveOutDir(preferred)
      const outDirIsLibrary = folders.some((f) => f.path === outDir)
      set({ outDir, outDirIsLibrary })
    } catch {
      /* leave outDir empty; backend still has its own default */
    }
  },

  closePanel: () => {
    if (get().busy) return // don't close mid-download; user must cancel first
    set({ open: false })
  },

  reset: () =>
    set({
      phase: 'input',
      rows: [],
      downloadOrder: [],
      summary: null,
      reindexed: false,
      error: null,
      csvPath: null,
      csvName: null,
    }),

  setInputText: (t) => set({ inputText: t, csvPath: null, csvName: null }),

  ingestFilePath: async (path) => {
    const lower = path.toLowerCase()
    if (lower.endsWith('.csv')) {
      const name = path.split(/[/\\]/).pop() ?? path
      set({ csvPath: path, csvName: name, error: null })
    } else if (lower.endsWith('.txt')) {
      const text = await hub.downloaderReadText(path)
      const prev = get().inputText.trim()
      set({ inputText: prev ? `${prev}\n${text}` : text, csvPath: null, csvName: null })
    } else {
      set({ error: 'Drop a .txt (one song per line) or a Spotify .csv export.' })
    }
  },

  loadPreflight: async (fast = false) => {
    set({ preflightLoading: true })
    try {
      // The active cookie source is persisted in the main process (ytauth), so
      // we don't pass it here — preflight resolves it itself.
      const pf = await hub.downloaderPreflight({ noAuthProbe: fast })
      set({ preflight: pf, preflightLoading: false })
    } catch (e) {
      set({ preflight: { ok: false, problems: [String(e)], checks: [] }, preflightLoading: false })
    }
  },

  loadAuth: async () => {
    try {
      const [auth, browsers] = await Promise.all([hub.ytauthStatus(), hub.ytauthDetectBrowsers()])
      set({ auth, browsers: browsers.length ? browsers : get().browsers })
    } catch {
      /* leave defaults */
    }
  },

  connectYouTube: async () => {
    set({ connecting: true })
    try {
      const res = await hub.ytauthConnect()
      set({ auth: res.status, connecting: false })
    } catch (e) {
      set({ connecting: false, error: String(e) })
    }
    await get().loadPreflight() // verify the new cookies actually authenticate
  },

  disconnectYouTube: async () => {
    const auth = await hub.ytauthDisconnect()
    set({ auth })
    await get().loadPreflight()
  },

  setAuthBrowser: async (b) => {
    const auth = await hub.ytauthSetBrowser(b)
    set({ auth })
    await get().loadPreflight()
  },

  importCookies: async () => {
    const auth = await hub.ytauthImport()
    set({ auth })
    await get().loadPreflight()
  },

  fixIt: async () => {
    const checks = get().preflight?.checks ?? []
    const tools = [
      ...new Set(
        checks
          .filter((c) => !c.ok && c.fix && c.fix.tool && INSTALLABLE.has(c.fix.tool))
          .map((c) => c.fix!.tool as string)
      ),
    ]
    if (tools.length === 0) return
    set({ installing: true, installLog: [], installingTools: tools })
    try {
      const pf = await hub.downloaderInstall(tools)
      set({ preflight: pf, installing: false })
    } catch (e) {
      set({ installing: false, installLog: [...get().installLog, `install failed: ${e}`] })
    }
  },

  handleInstallEvent: (e) => {
    set((s) => {
      if ('status' in e && e.status === 'start') return { installLog: [...s.installLog, `$ ${e.command}`] }
      if ('line' in e) return { installLog: [...s.installLog, e.line].slice(-300) }
      if ('status' in e && e.status === 'finished')
        return { installLog: [...s.installLog, `— ${e.tool} finished (exit ${e.code}) —`] }
      return {}
    })
  },

  pickOutDir: async () => {
    const picked = await hub.pickFolder()
    if (!picked) return
    const folders = useLibraryStore.getState().folders
    set({ outDir: picked, outDirIsLibrary: folders.some((f) => f.path === picked) })
  },

  addOutDirToLibrary: async () => {
    const { outDir } = get()
    if (!outDir) return
    await hub.addFolder(outDir)
    await useLibraryStore.getState().load()
    set({ outDirIsLibrary: true })
  },

  runPreview: async () => {
    const { inputText, csvPath } = get()
    const lines = inputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
    if (!csvPath && lines.length === 0) {
      set({ error: 'Paste at least one "Artist - Track" line, or drop a .txt / .csv.' })
      return
    }
    set({ resolving: true, error: null })
    try {
      const { rows, problems, error } = await hub.downloaderResolve(
        csvPath ? { csvPath } : { lines }
      )
      if (error && rows.length === 0) {
        set({ resolving: false, error })
        return
      }
      const preview: PreviewRow[] = rows.map((r) => ({
        ...r,
        confidence: r.confidence as Confidence,
        accepted: r.status === 'preview' && !!r.id,
      }))
      set({
        rows: preview,
        phase: 'preview',
        resolving: false,
        preflight: get().preflight ?? { ok: problems.length === 0, problems, checks: [] },
      })
    } catch (e) {
      set({ resolving: false, error: String(e) })
    }
  },

  backToInput: () => set({ phase: 'input', summary: null, reindexed: false }),

  toggleAccept: (i) =>
    set((s) => ({ rows: patchRow(s.rows, i, { accepted: !s.rows.find((r) => r.i === i)?.accepted }) })),

  setAcceptAll: (v) =>
    set((s) => ({
      rows: s.rows.map((r) => ({ ...r, accepted: v && !!r.id && r.status !== 'failed' })),
    })),

  removeRow: (i) => set((s) => ({ rows: s.rows.filter((r) => r.i !== i) })),

  startEdit: (i) =>
    set((s) => ({
      rows: patchRow(s.rows, i, { editing: true, draftQuery: s.rows.find((r) => r.i === i)?.query }),
    })),

  setDraftQuery: (i, q) => set((s) => ({ rows: patchRow(s.rows, i, { draftQuery: q }) })),

  cancelEdit: (i) => set((s) => ({ rows: patchRow(s.rows, i, { editing: false, draftQuery: undefined }) })),

  commitEdit: async (i) => {
    const row = get().rows.find((r) => r.i === i)
    const q = (row?.draftQuery ?? '').trim()
    if (!q) {
      get().cancelEdit(i)
      return
    }
    set((s) => ({ rows: patchRow(s.rows, i, { editing: false, query: q, candidatesLoading: true, swapOpen: false, candidates: null }) }))
    await reresolveRow(i, q, undefined, set, get)
  },

  toggleSwap: async (i) => {
    const row = get().rows.find((r) => r.i === i)
    if (!row) return
    if (row.swapOpen) {
      set((s) => ({ rows: patchRow(s.rows, i, { swapOpen: false }) }))
      return
    }
    set((s) => ({ rows: patchRow(s.rows, i, { swapOpen: true }) }))
    if (!row.candidates) {
      set((s) => ({ rows: patchRow(s.rows, i, { candidatesLoading: true }) }))
      try {
        const candidates = await hub.downloaderCandidates(row.query)
        set((s) => ({ rows: patchRow(s.rows, i, { candidates, candidatesLoading: false }) }))
      } catch {
        set((s) => ({ rows: patchRow(s.rows, i, { candidates: [], candidatesLoading: false }) }))
      }
    }
  },

  swapTo: (i, c) =>
    set((s) => ({
      rows: patchRow(s.rows, i, {
        id: c.id,
        title: c.title,
        channel: c.artist,
        album: c.album,
        duration: c.duration,
        explicit: c.explicit,
        confidence: c.confidence,
        source: c.source,
        status: 'preview',
        accepted: true,
        swapOpen: false,
        reason: undefined,
      }),
    })),

  setPinDraft: (i, url) => set((s) => ({ rows: patchRow(s.rows, i, { pinDraft: url }) })),

  commitPin: async (i) => {
    const row = get().rows.find((r) => r.i === i)
    const vid = extractVideoId(row?.pinDraft ?? '')
    if (!vid) {
      set((s) => ({ rows: patchRow(s.rows, i, { pinDraft: undefined }) }))
      set({ error: 'That doesn’t look like a YouTube URL or 11-char video id.' })
      return
    }
    set((s) => ({ rows: patchRow(s.rows, i, { candidatesLoading: true, pinDraft: undefined, swapOpen: false }) }))
    await reresolveRow(i, row!.query, vid, set, get)
  },

  startDownload: async () => {
    const accepted = get().rows.filter((r) => r.accepted && r.id && r.status !== 'failed')
    if (accepted.length === 0) {
      set({ error: 'Nothing selected to download.' })
      return
    }
    const downloadOrder = accepted.map((r) => r.i)
    const sendRows = accepted.map((r) => ({ stem: r.stem || r.query, id: r.id as string }))
    set((s) => ({
      phase: 'downloading',
      busy: true,
      error: null,
      summary: null,
      reindexed: false,
      downloadOrder,
      rows: s.rows.map((r) =>
        downloadOrder.includes(r.i) ? { ...r, dlStage: 'queued', pct: 0 } : r
      ),
    }))
    const outDir = get().outDir || undefined
    try {
      const { summary, error } = await hub.downloaderDownload(sendRows, outDir as string)
      // The 'summary' streamed event normally drives the transition; this is a backstop.
      if (!summary && error && get().busy) {
        set({ busy: false, error })
      }
    } catch (e) {
      if (get().busy) set({ busy: false, error: String(e) })
    }
  },

  cancel: async () => {
    await hub.downloaderCancel()
    set((s) => {
      const inRun = (i: number) => s.downloadOrder.includes(i)
      const rows = s.rows.map((r) =>
        inRun(r.i) && (r.dlStage === 'downloading' || r.dlStage === 'queued' || r.dlStage === 'embedding')
          ? { ...r, dlStage: 'failed' as const }
          : r
      )
      const inRunRows = rows.filter((r) => inRun(r.i))
      const done = inRunRows.filter((r) => r.dlStage === 'done')
      return {
        busy: false,
        phase: 'done' as const,
        rows,
        summary: {
          new: done.length,
          skipped: inRunRows.filter((r) => r.dlStage === 'skipped').length,
          failed: inRunRows.filter((r) => r.dlStage === 'failed').length,
          low_confidence: done.filter((r) => r.confidence === 'LOW').map((r) => r.stem || r.query),
        },
      }
    })
    // Songs that finished before the cancel are real files — refresh the library.
    useLibraryStore.getState().load().then(() => set({ reindexed: true })).catch(() => {})
  },

  handleEvent: (e) => {
    const { downloadOrder } = get()
    const rowFor = (idx: number): number | undefined => downloadOrder[idx - 1]
    switch (e.event) {
      case 'stage': {
        const ri = rowFor(e.i)
        if (ri !== undefined) {
          set((s) => ({ rows: patchRow(s.rows, ri, { dlStage: e.stage as PreviewRow['dlStage'] }) }))
        }
        break
      }
      case 'progress': {
        const ri = rowFor(e.i)
        if (ri !== undefined) {
          set((s) => ({ rows: patchRow(s.rows, ri, { dlStage: 'downloading', pct: e.pct }) }))
        }
        break
      }
      case 'done': {
        const ri = rowFor(e.i)
        if (ri !== undefined) {
          const stage =
            e.status === 'ok' ? 'done' : e.status === 'skipped' ? 'skipped' : 'failed'
          set((s) => ({ rows: patchRow(s.rows, ri, { dlStage: stage, pct: stage === 'done' ? 100 : undefined }) }))
        }
        break
      }
      case 'summary': {
        set({
          summary: { new: e.new, skipped: e.skipped, failed: e.failed, low_confidence: e.low_confidence },
          phase: 'done',
          busy: false,
        })
        // New files just landed in the library folder — rescan so they show up.
        useLibraryStore
          .getState()
          .load()
          .then(() => set({ reindexed: true }))
          .catch(() => {})
        break
      }
      case 'fatal': {
        set({ busy: false, error: e.message })
        break
      }
      default:
        break
    }
  },
}))

/** Re-resolve a single row (after an inline query edit or a pin) and merge the result. */
async function reresolveRow(
  i: number,
  query: string,
  pinId: string | undefined,
  set: (fn: (s: DownloaderState) => Partial<DownloaderState>) => void,
  get: () => DownloaderState
): Promise<void> {
  const line = pinId ? `${query} | https://www.youtube.com/watch?v=${pinId}` : query
  try {
    const { rows } = await hub.downloaderResolve({ lines: [line] })
    const r = rows[0]
    if (!r) {
      set((s) => ({ rows: patchRow(s.rows, i, { candidatesLoading: false, status: 'failed', reason: 'no candidates' }) }))
      return
    }
    set((s) => ({
      rows: patchRow(s.rows, i, {
        id: r.id,
        title: r.title,
        channel: r.channel,
        album: r.album,
        duration: r.duration,
        explicit: r.explicit,
        confidence: r.confidence as Confidence,
        source: r.source,
        stem: r.stem,
        status: r.status,
        reason: r.reason,
        candidatesLoading: false,
        candidates: null,
        accepted: r.status === 'preview' && !!r.id,
      }),
    }))
  } catch (e) {
    set((s) => ({ rows: patchRow(s.rows, i, { candidatesLoading: false }) }))
    set(() => ({ error: String(e) }))
  }
}
