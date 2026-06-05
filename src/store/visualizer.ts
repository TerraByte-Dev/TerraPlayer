import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Visualizer options, persisted on their own key so both the in-app fullscreen view AND the popout window
// (and restarts) share one source of truth. Colors are NOT here — they follow the active app theme now.
export interface VizSettings {
  bars: boolean
  ring: boolean
  bubbles: boolean
  atmosphere: boolean
  rotation: boolean
  particles: boolean
  grid: boolean
  mirrorBars: boolean
  ringSpeed: number
  glow: number
  intensity: number
}

const DEFAULTS: VizSettings = {
  bars: true,
  ring: true,
  bubbles: true,
  atmosphere: true,
  rotation: true,
  particles: true,
  grid: true,
  mirrorBars: false,
  ringSpeed: 0.5,
  glow: 0.5,
  intensity: 1,
}

interface VizState extends VizSettings {
  setVizSetting: <K extends keyof VizSettings>(key: K, value: VizSettings[K]) => void
  reset: () => void
}

export const useVizStore = create<VizState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setVizSetting: (key, value) => set({ [key]: value } as Partial<VizState>),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'tplay-visualizer',
      // v0→v1: dropped the `colors` preset (now theme-driven) and added rotation/particles/grid/mirrorBars/
      // ringSpeed/glow. Strip the dead field and backfill any missing keys from DEFAULTS.
      version: 1,
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== 'object') return { ...DEFAULTS }
        const { colors: _colors, ...rest } = persisted as Record<string, unknown>
        return { ...DEFAULTS, ...rest }
      },
    }
  )
)
