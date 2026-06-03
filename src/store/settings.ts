import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { clampPreamp } from '@/lib/audio-math'

// Audio preferences that live outside the player's transport state but feed the Web Audio graph
// (lib/audio.ts). Persisted on their own so they survive restarts; PlayerBar applies them to the graph
// whenever they change. Theme / scanline / reduced-motion preferences are owned by lib/theme.ts (they
// must apply to <html> before React mounts), so they are intentionally NOT duplicated here.

interface SettingsState {
  /** Pre-amp gain in dB, applied ahead of the EQ. */
  preampDb: number
  /** Sum L+R to a true mono signal. */
  mono: boolean

  setPreampDb: (db: number) => void
  setMono: (on: boolean) => void
  reset: () => void
}

const DEFAULTS = { preampDb: 0, mono: false }

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setPreampDb: (db) => set({ preampDb: clampPreamp(db) }),
      setMono: (on) => set({ mono: !!on }),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: 'tplay-settings' }
  )
)
