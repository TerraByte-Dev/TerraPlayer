import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameId } from '@/components/tools/games'

// Arcade cabinet preferences. Its own persist key so the cabinet reopens where you left it,
// on the game you were playing. Deliberately two settings and no more: everything else the
// cabinet does (remembering its position, pausing an unfocused game's clock) is behaviour
// that is simply correct, not a preference to litigate.
interface ArcadeState {
  /** Last game played — the cabinet reopens on it. */
  game: GameId
  /** Remembered window position, viewport-clamped on restore. */
  x: number | null
  y: number | null
  /** Spectrum band behind the game in fullscreen. The one genuine fork: some people can't
   *  play with motion in their peripheral vision, reduced-motion setting or not. */
  viz: boolean

  setGame: (id: GameId) => void
  setPosition: (x: number, y: number) => void
  setViz: (on: boolean) => void
}

export const useArcadeStore = create<ArcadeState>()(
  persist(
    (set) => ({
      game: 'game2048',
      x: null,
      y: null,
      viz: true,

      setGame: (id) => set({ game: id }),
      setPosition: (x, y) => set({ x, y }),
      setViz: (on) => set({ viz: !!on }),
    }),
    { name: 'tplay-arcade' }
  )
)
