import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createDedupeStorage } from '@/lib/perf'
import { purgeTrackFromQueue, removeComingUpAt, moveFutureTrackIn, promoteUpNext, buildShuffled } from '@/lib/queue'
import type { Track } from '@/lib/ipc'
import { eqPresetGains, clampEqBand, coerceEqSettings, type AudioPreset, type EqSettings } from '@/lib/audio-math'

export type RepeatMode = 'off' | 'all' | 'one'
export type { AudioPreset, EqSettings } from '@/lib/audio-math'

interface PlayerState {
  queue: Track[]
  shuffledQueue: Track[]
  queueIndex: number
  upNext: Track[]
  isPlaying: boolean
  volume: number
  currentTime: number
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  vizFullscreen: boolean
  eq: EqSettings

  playTrack: (track: Track, queue?: Track[]) => void
  next: () => void
  prev: () => void
  setPlaying: (v: boolean) => void
  setVolume: (v: number) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  currentTrack: () => Track | null
  activeQueue: () => Track[]
  toggleShuffle: () => void
  cycleRepeat: () => void
  setVizFullscreen: (v: boolean) => void
  setEqPreset: (preset: AudioPreset) => void
  setEqBand: (index: number, value: number) => void
  addToUpNext: (track: Track) => void
  playNext: (track: Track) => void
  removeFromUpNext: (index: number, expectId?: number) => void
  removeFromComingUp: (index: number, expectId?: number) => void
  moveFutureTrack: (
    from: { section: 'upNext' | 'comingUp'; index: number },
    to: { section: 'upNext' | 'comingUp'; index: number }
  ) => void
  clearUpNext: () => void
  purgeTrack: (id: number) => void
}

export const usePlayerStore = create<PlayerState>()(persist((set, get) => ({
  queue: [],
  shuffledQueue: [],
  queueIndex: 0,
  upNext: [],
  isPlaying: false,
  volume: 0.8,
  currentTime: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  vizFullscreen: false,
  eq: eqPresetGains('off'),

  activeQueue: () => {
    const { shuffle, queue, shuffledQueue } = get()
    return shuffle ? shuffledQueue : queue
  },

  currentTrack: () => {
    const { queueIndex } = get()
    return get().activeQueue()[queueIndex] ?? null
  },

  playTrack: (track, queue) => {
    const q = queue ?? get().queue
    const idx = q.findIndex((t) => t.id === track.id)
    const realIdx = idx >= 0 ? idx : 0
    if (get().shuffle) {
      set({ queue: q, shuffledQueue: buildShuffled(q, realIdx), queueIndex: 0, isPlaying: true })
    } else {
      set({ queue: q, queueIndex: realIdx, isPlaying: true })
    }
  },

  next: () => {
    const { queueIndex, repeat, upNext, shuffle, queue, shuffledQueue } = get()

    if (upNext.length > 0) {
      const promoted = promoteUpNext({ queue, shuffledQueue, upNext, queueIndex, shuffle })
      if (promoted) {
        set({ ...promoted, isPlaying: true, currentTime: 0 })
        return
      }
    }

    const aq = get().activeQueue()
    if (queueIndex < aq.length - 1) {
      set({ queueIndex: queueIndex + 1, isPlaying: true, currentTime: 0 })
    } else if (repeat === 'all') {
      set({ queueIndex: 0, isPlaying: true, currentTime: 0 })
    }
  },

  prev: () => {
    const { currentTime, queueIndex } = get()
    if (currentTime > 3) {
      set({ currentTime: 0 })
    } else if (queueIndex > 0) {
      set({ queueIndex: queueIndex - 1, isPlaying: true, currentTime: 0 })
    }
  },

  toggleShuffle: () => {
    const { shuffle, queue, queueIndex, shuffledQueue } = get()
    if (!shuffle) {
      set({ shuffle: true, shuffledQueue: buildShuffled(queue, queueIndex), queueIndex: 0 })
    } else {
      // Both orders hold the SAME Track objects, so identity picks out the copy that is
      // actually playing. Matching by id lands on the first copy instead, which rewinds
      // Coming Up over songs already played whenever the queue holds a song twice.
      const current = shuffledQueue[queueIndex]
      let origIdx = current ? queue.indexOf(current) : -1
      if (origIdx < 0 && current) origIdx = queue.findIndex((t) => t.id === current.id)
      set({ shuffle: false, shuffledQueue: [], queueIndex: origIdx >= 0 ? origIdx : 0 })
    }
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const next = order[(order.indexOf(get().repeat) + 1) % 3]
    set({ repeat: next })
  },

  setPlaying: (v) => set({ isPlaying: v }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setVizFullscreen: (v) => set({ vizFullscreen: v }),
  setEqPreset: (preset) => set({ eq: eqPresetGains(preset) }),
  // Editing a band always yields a NEW bands array (so the [eq.bands]-keyed apply effect + the dedupe
  // persist write actually fire) and flips the preset to 'custom' (never mislabel a manual curve as Flat).
  setEqBand: (index, value) =>
    set((s) => {
      if (index < 0 || index >= s.eq.bands.length) return {} // keep the 10-band invariant in the setter itself
      const bands = s.eq.bands.slice()
      bands[index] = clampEqBand(value)
      return { eq: { preset: 'custom', bands } }
    }),

  addToUpNext: (track) => set((s) => ({ upNext: [...s.upNext, track] })),
  playNext: (track) => set((s) => ({ upNext: [track, ...s.upNext] })),
  // `expectId` is the popout window's staleness guard: it clicks against a snapshot
  // that can be a tick behind, so a mismatched row is ignored rather than removed.
  removeFromUpNext: (index, expectId) =>
    set((s) => {
      if (expectId !== undefined && s.upNext[index]?.id !== expectId) return {}
      return { upNext: s.upNext.filter((_, i) => i !== index) }
    }),
  removeFromComingUp: (index, expectId) =>
    set((s) =>
      removeComingUpAt(
        { queue: s.queue, shuffledQueue: s.shuffledQueue, queueIndex: s.queueIndex, shuffle: s.shuffle },
        index,
        expectId
      ) ?? {}
    ),
  moveFutureTrack: (from, to) =>
    set((s) =>
      moveFutureTrackIn(
        { queue: s.queue, shuffledQueue: s.shuffledQueue, upNext: s.upNext, queueIndex: s.queueIndex, shuffle: s.shuffle },
        from,
        to
      ) ?? {}
    ),
  clearUpNext: () => set({ upNext: [] }),

  // Splice a deleted track out of the play order + upNext and fix the index. If
  // it was the now-playing track, currentTrack() resolves to the next song (or
  // null when the queue empties) — that swaps the <audio> src, releasing the
  // deleted file's handle before the main process trashes it. Called by the
  // library store's deleteTrack BEFORE the IPC delete.
  purgeTrack: (id) =>
    set((s) => {
      const { queue, shuffledQueue, upNext, queueIndex, clearedCurrent } = purgeTrackFromQueue(
        { queue: s.queue, shuffledQueue: s.shuffledQueue, upNext: s.upNext, queueIndex: s.queueIndex, shuffle: s.shuffle },
        id
      )
      const patch: Partial<PlayerState> = { queue, shuffledQueue, upNext, queueIndex }
      if (clearedCurrent) {
        patch.currentTime = 0
        const active = s.shuffle ? shuffledQueue : queue
        if (active.length === 0) patch.isPlaying = false // nothing left — stop
      }
      return patch
    }),
}), {
  name: 'tplay-player',
  // Dedupe writes: zustand's persist re-serializes + writes storage on EVERY
  // set() without diffing, so the ~4×/sec currentTime tick during playback would
  // otherwise fire a synchronous localStorage write of byte-identical JSON
  // (currentTime isn't even in the partial below). The wrapper skips those no-op
  // writes; the first write of any genuinely-changed preference still goes through.
  storage: createJSONStorage(() => createDedupeStorage(localStorage)),
  // Persist only durable preferences — never the transient session (queue, current track, play state).
  // This is what lets volume, the EQ, and the shuffle/repeat modes survive a restart.
  partialize: (s) => ({ volume: s.volume, eq: s.eq, shuffle: s.shuffle, repeat: s.repeat }),
  // v0→v1: the EQ went from { preset, low, mid, high } to { preset, bands[10] }. Run any persisted eq through
  // coerceEqSettings, which normalizes the legacy shape, the new shape, AND null/garbage to a valid value —
  // so a corrupt or missing eq can never leave `undefined` to clobber the default on merge (→ hydration crash).
  // Idempotent. Only touched when an `eq` key is present; absent → the initial default is used as-is.
  version: 1,
  migrate: (persisted) => {
    const p = (persisted ?? {}) as { eq?: unknown } & Record<string, unknown>
    if ('eq' in p) p.eq = coerceEqSettings(p.eq)
    return p as unknown as PlayerState
  },
}))
