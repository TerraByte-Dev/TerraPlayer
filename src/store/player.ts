import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createDedupeStorage } from '@/lib/perf'
import { purgeTrackFromQueue } from '@/lib/queue'
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

  setQueue: (tracks: Track[], startIndex?: number) => void
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
  removeFromUpNext: (index: number) => void
  reorderUpNext: (from: number, to: number) => void
  moveFutureTrack: (
    from: { section: 'upNext' | 'comingUp'; index: number },
    to: { section: 'upNext' | 'comingUp'; index: number }
  ) => void
  clearUpNext: () => void
  purgeTrack: (id: number) => void
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildShuffled(queue: Track[], anchorId: number): Track[] {
  const anchor = queue.find((t) => t.id === anchorId)
  const rest = fisherYates(queue.filter((t) => t.id !== anchorId))
  return anchor ? [anchor, ...rest] : rest
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
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

  setQueue: (tracks, startIndex = 0) => {
    const { shuffle } = get()
    if (shuffle) {
      const anchor = tracks[startIndex]
      set({ queue: tracks, shuffledQueue: buildShuffled(tracks, anchor?.id ?? -1), queueIndex: 0 })
    } else {
      set({ queue: tracks, queueIndex: startIndex })
    }
  },

  playTrack: (track, queue) => {
    const q = queue ?? get().queue
    const idx = q.findIndex((t) => t.id === track.id)
    const realIdx = idx >= 0 ? idx : 0
    if (get().shuffle) {
      set({ queue: q, shuffledQueue: buildShuffled(q, q[realIdx]?.id ?? -1), queueIndex: 0, isPlaying: true })
    } else {
      set({ queue: q, queueIndex: realIdx, isPlaying: true })
    }
  },

  next: () => {
    const { queueIndex, repeat, upNext, shuffle, queue, shuffledQueue } = get()

    if (upNext.length > 0) {
      const [nextTrack, ...remaining] = upNext
      if (shuffle) {
        const sq = [...shuffledQueue]
        sq.splice(queueIndex + 1, 0, nextTrack)
        set({ shuffledQueue: sq, upNext: remaining, queueIndex: queueIndex + 1, isPlaying: true, currentTime: 0 })
      } else {
        const q = [...queue]
        q.splice(queueIndex + 1, 0, nextTrack)
        set({ queue: q, upNext: remaining, queueIndex: queueIndex + 1, isPlaying: true, currentTime: 0 })
      }
      return
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
      const current = queue[queueIndex]
      set({ shuffle: true, shuffledQueue: buildShuffled(queue, current?.id ?? -1), queueIndex: 0 })
    } else {
      const current = shuffledQueue[queueIndex]
      const origIdx = queue.findIndex((t) => t.id === current?.id)
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
  removeFromUpNext: (index) =>
    set((s) => ({ upNext: s.upNext.filter((_, i) => i !== index) })),
  reorderUpNext: (from, to) =>
    set((s) => {
      return { upNext: moveItem(s.upNext, from, to) }
    }),

  moveFutureTrack: (from, to) =>
    set((s) => {
      if (from.section === to.section && from.index === to.index) return {}

      const queueKey = s.shuffle ? 'shuffledQueue' : 'queue'
      const activeQueue = s.shuffle ? [...s.shuffledQueue] : [...s.queue]
      const futureStart = s.queueIndex + 1

      if (from.section === 'upNext' && to.section === 'upNext') {
        return { upNext: moveItem(s.upNext, from.index, to.index) }
      }

      if (from.section === 'comingUp' && to.section === 'comingUp') {
        const fromAbs = futureStart + from.index
        const toAbs = futureStart + to.index
        if (fromAbs < futureStart || fromAbs >= activeQueue.length) return {}
        return { [queueKey]: moveItem(activeQueue, fromAbs, Math.min(toAbs, activeQueue.length - 1)) }
      }

      if (from.section === 'comingUp' && to.section === 'upNext') {
        const fromAbs = futureStart + from.index
        if (fromAbs < futureStart || fromAbs >= activeQueue.length) return {}
        const [track] = activeQueue.splice(fromAbs, 1)
        const upNext = [...s.upNext]
        upNext.splice(Math.max(0, Math.min(to.index, upNext.length)), 0, track)
        return { [queueKey]: activeQueue, upNext }
      }

      const upNext = [...s.upNext]
      const [track] = upNext.splice(from.index, 1)
      if (!track) return {}
      const toAbs = Math.max(futureStart, Math.min(futureStart + to.index, activeQueue.length))
      activeQueue.splice(toAbs, 0, track)
      return { [queueKey]: activeQueue, upNext }
    }),
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
