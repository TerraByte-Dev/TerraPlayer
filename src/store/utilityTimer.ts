import { create } from 'zustand'

export type AlarmAction = 'song' | 'stop'

const STORAGE_KEY = 'hamilton.utilityTimer.v1'
const DEFAULT_SECONDS = 5 * 60

interface PersistedTimerState {
  minutes: number
  seconds: number
  remainingWhenPaused: number
  endAt: number | null
  running: boolean
  ringing: boolean
  alarmAction: AlarmAction
  alarmPath: string
  now: number
}

interface UtilityTimerState extends PersistedTimerState {
  setNow: (now: number) => void
  setDurationInput: (minutes: number, seconds: number) => void
  setAlarmAction: (action: AlarmAction) => void
  setAlarmPath: (path: string) => void
  start: () => void
  pause: () => void
  reset: () => void
  dismiss: () => void
  markExpired: () => void
  remaining: () => number
  inputSeconds: () => number
}

function readInitialState(): PersistedTimerState {
  const fallback: PersistedTimerState = {
    minutes: 5,
    seconds: 0,
    remainingWhenPaused: DEFAULT_SECONDS,
    endAt: null,
    running: false,
    ringing: false,
    alarmAction: 'song',
    alarmPath: '',
    now: Date.now(),
  }

  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PersistedTimerState>
    const now = Date.now()
    const running = Boolean(parsed.running && parsed.endAt && parsed.endAt > now)
    const expired = Boolean(parsed.running && parsed.endAt && parsed.endAt <= now)
    return {
      minutes: clampInt(parsed.minutes, 0, 1439, fallback.minutes),
      seconds: clampInt(parsed.seconds, 0, 59, fallback.seconds),
      remainingWhenPaused: expired
        ? 0
        : clampInt(parsed.remainingWhenPaused, 1, 86399, fallback.remainingWhenPaused),
      endAt: running ? parsed.endAt! : null,
      running,
      ringing: Boolean(parsed.ringing || expired),
      alarmAction: parsed.alarmAction === 'stop' ? 'stop' : 'song',
      alarmPath: typeof parsed.alarmPath === 'string' ? parsed.alarmPath : '',
      now,
    }
  } catch {
    return fallback
  }
}

function persist(state: PersistedTimerState) {
  if (typeof window === 'undefined') return
  const { now: _now, ...stored } = state
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const useUtilityTimerStore = create<UtilityTimerState>((set, get) => ({
  ...readInitialState(),

  inputSeconds: () => {
    const { minutes, seconds } = get()
    return Math.max(1, Math.min(86399, minutes * 60 + seconds))
  },

  remaining: () => {
    const { running, endAt, now, remainingWhenPaused } = get()
    if (!running || !endAt) return remainingWhenPaused
    return Math.max(0, Math.ceil((endAt - now) / 1000))
  },

  setNow: (now) => set((s) => ({ ...s, now })),

  setDurationInput: (minutes, seconds) =>
    set((s) => {
      const next = {
        ...s,
        minutes: clampInt(minutes, 0, 1439, s.minutes),
        seconds: clampInt(seconds, 0, 59, s.seconds),
      }
      const remainingWhenPaused = next.running
        ? next.remainingWhenPaused
        : Math.max(1, Math.min(86399, next.minutes * 60 + next.seconds))
      const updated = { ...next, remainingWhenPaused }
      persist(updated)
      return updated
    }),

  setAlarmAction: (alarmAction) =>
    set((s) => {
      const updated = { ...s, alarmAction }
      persist(updated)
      return updated
    }),

  setAlarmPath: (alarmPath) =>
    set((s) => {
      const updated = { ...s, alarmPath }
      persist(updated)
      return updated
    }),

  start: () =>
    set((s) => {
      const base = Math.max(1, s.remainingWhenPaused || get().inputSeconds())
      const updated = {
        ...s,
        running: true,
        ringing: false,
        remainingWhenPaused: base,
        endAt: Date.now() + base * 1000,
        now: Date.now(),
      }
      persist(updated)
      return updated
    }),

  pause: () =>
    set((s) => {
      const remainingWhenPaused = get().remaining()
      const updated = { ...s, running: false, endAt: null, remainingWhenPaused }
      persist(updated)
      return updated
    }),

  reset: () =>
    set((s) => {
      const remainingWhenPaused = get().inputSeconds()
      const updated = {
        ...s,
        running: false,
        ringing: false,
        endAt: null,
        remainingWhenPaused,
        now: Date.now(),
      }
      persist(updated)
      return updated
    }),

  dismiss: () =>
    set((s) => {
      const remainingWhenPaused = get().inputSeconds()
      const updated = {
        ...s,
        running: false,
        ringing: false,
        endAt: null,
        remainingWhenPaused,
        now: Date.now(),
      }
      persist(updated)
      return updated
    }),

  markExpired: () =>
    set((s) => {
      if (!s.running && s.ringing) return s
      const updated = {
        ...s,
        running: false,
        ringing: true,
        endAt: null,
        remainingWhenPaused: 0,
        now: Date.now(),
      }
      persist(updated)
      return updated
    }),
}))
