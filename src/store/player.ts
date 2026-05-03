import { create } from 'zustand'
import type { Track } from '@/lib/ipc'

export type RepeatMode = 'off' | 'all' | 'one'
export type AudioPreset = 'off' | 'polish' | 'bass' | 'voice'

export interface EqSettings {
  preset: AudioPreset
  low: number
  mid: number
  high: number
}

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
  setEqBand: (band: keyof Omit<EqSettings, 'preset'>, value: number) => void
  addToUpNext: (track: Track) => void
  playNext: (track: Track) => void
  removeFromUpNext: (index: number) => void
  reorderUpNext: (from: number, to: number) => void
  moveFutureTrack: (
    from: { section: 'upNext' | 'comingUp'; index: number },
    to: { section: 'upNext' | 'comingUp'; index: number }
  ) => void
  clearUpNext: () => void
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

export const usePlayerStore = create<PlayerState>((set, get) => ({
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
  eq: { preset: 'off', low: 0, mid: 0, high: 0 },

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
  setEqPreset: (preset) => {
    const presets: Record<AudioPreset, EqSettings> = {
      off: { preset: 'off', low: 0, mid: 0, high: 0 },
      polish: { preset: 'polish', low: 1.5, mid: -0.75, high: 2.5 },
      bass: { preset: 'bass', low: 4, mid: 0, high: 1 },
      voice: { preset: 'voice', low: -1.5, mid: 2.5, high: 1.5 },
    }
    set({ eq: presets[preset] })
  },
  setEqBand: (band, value) =>
    set((s) => ({ eq: { ...s.eq, preset: 'off', [band]: Math.max(-8, Math.min(8, value)) } })),

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
}))
