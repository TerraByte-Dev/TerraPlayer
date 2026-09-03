import { create } from 'zustand'

// Tiny shared UI flag: true while a blocking overlay that OWNS the keyboard is open — a tool/utility
// (Snake, 2048, Metronome… which bind their own Space/arrow handlers), Settings, or the Downloader.
// PlayerBar's global transport shortcuts early-return when this is set so they don't double-fire with the
// overlay's keys. (The fullscreen visualizer is intentionally NOT counted — transport keys are wanted there.)
//
// `arcadeFocus` is the finer-grained sibling. The arcade cabinet is NON-modal — it floats over an
// app you can still use — so it deliberately does not set `overlayOpen`. Instead it reports whether
// it currently holds focus, and the transport yields only then. That is what lets you park a game
// in the corner, click the library, and still have the spacebar play music.
interface UiState {
  overlayOpen: boolean
  arcadeFocus: boolean
  setOverlayOpen: (v: boolean) => void
  setArcadeFocus: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  overlayOpen: false,
  arcadeFocus: false,
  setOverlayOpen: (v) => set({ overlayOpen: !!v }),
  setArcadeFocus: (v) => set({ arcadeFocus: !!v }),
}))
