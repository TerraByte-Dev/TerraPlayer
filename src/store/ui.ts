import { create } from 'zustand'

// Tiny shared UI flag: true while a blocking overlay that OWNS the keyboard is open — a tool/utility
// (Snake, 2048, Metronome… which bind their own Space/arrow handlers), Settings, or the Downloader.
// PlayerBar's global transport shortcuts early-return when this is set so they don't double-fire with the
// overlay's keys. (The fullscreen visualizer is intentionally NOT counted — transport keys are wanted there.)
interface UiState {
  overlayOpen: boolean
  setOverlayOpen: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  overlayOpen: false,
  setOverlayOpen: (v) => set({ overlayOpen: !!v }),
}))
