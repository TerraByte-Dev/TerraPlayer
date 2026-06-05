import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { clampPreamp, clampSpeed, clampFadeSec } from '@/lib/audio-math'

// Audio + playback preferences that live outside the player's transport state but feed the Web Audio graph
// / the <audio> element (lib/audio.ts, PlayerBar). Persisted on their own so they survive restarts;
// PlayerBar applies them whenever they change. Theme / scanline / reduced-motion preferences are owned by
// lib/theme.ts (they must apply to <html> before React mounts), so they are intentionally NOT duplicated here.

interface SettingsState {
  /** Pre-amp gain in dB, applied ahead of the EQ. */
  preampDb: number
  /** Sum L+R to a true mono signal. */
  mono: boolean
  /** Fade in/out duration in seconds (0 = off). Applied on play / pause / track change. */
  fadeSec: number
  /** Playback rate (pitch preserved). 1 = normal. */
  speed: number

  setPreampDb: (db: number) => void
  setMono: (on: boolean) => void
  setFadeSec: (sec: number) => void
  setSpeed: (rate: number) => void
  reset: () => void
}

const DEFAULTS = { preampDb: 0, mono: false, fadeSec: 0, speed: 1 }

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setPreampDb: (db) => set({ preampDb: clampPreamp(db) }),
      setMono: (on) => set({ mono: !!on }),
      setFadeSec: (sec) => set({ fadeSec: clampFadeSec(sec) }),
      setSpeed: (rate) => set({ speed: clampSpeed(rate) }),
      reset: () => set({ ...DEFAULTS }),
    }),
    // fadeSec/speed are additive — older persisted blobs (preampDb/mono only) merge over these defaults.
    { name: 'tplay-settings' }
  )
)
