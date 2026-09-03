import React from 'react'
import { Grid2x2, Worm, Bomb, Hash } from 'lucide-react'
import type { ToolProps } from './types'
import Game2048 from './Game2048'
import Snake from './Snake'
import Minesweeper from './Minesweeper'
import TicTacToe from './TicTacToe'

// The arcade's cartridge rack. These four used to sit in `registry.tsx` alongside the tools and
// take four of the dock's ten slots; they now live behind the single ARCADE tile. Kept in its own
// module rather than in the registry so `Arcade` can import the list without an import cycle
// (registry -> Arcade -> registry). The game components themselves have not moved.

export type GameId = 'game2048' | 'snake' | 'minesweeper' | 'tictactoe'

export interface GameDef {
  id: GameId
  title: string
  /** Shown under the cartridge icon in the rail — one short word. */
  label: string
  icon: React.ReactNode
  Component: React.ComponentType<ToolProps>
}

export const GAMES: GameDef[] = [
  { id: 'game2048', title: '2048', label: '2048', icon: <Grid2x2 size={18} strokeWidth={1.6} />, Component: Game2048 },
  { id: 'snake', title: 'Snake', label: 'SNAKE', icon: <Worm size={18} strokeWidth={1.6} />, Component: Snake },
  { id: 'minesweeper', title: 'Minesweeper', label: 'MINES', icon: <Bomb size={18} strokeWidth={1.6} />, Component: Minesweeper },
  { id: 'tictactoe', title: 'Tic-Tac-Toe', label: 'T-T-T', icon: <Hash size={18} strokeWidth={1.6} />, Component: TicTacToe },
]

export function getGame(id: GameId): GameDef {
  return GAMES.find((g) => g.id === id) ?? GAMES[0]
}
