import React from 'react'
import { PenLine, Timer, Dice5, Calculator, Gauge, StickyNote, Grid2x2, Worm, Bomb, Hash } from 'lucide-react'
import type { ToolId, ToolProps } from './types'
import Whiteboard from './Whiteboard'
import TimerTools from './TimerTools'
import RandomNumber from './RandomNumber'
import Calc from './Calculator'
import Metronome from './Metronome'
import Notes from './Notes'
import Game2048 from './Game2048'
import Snake from './Snake'
import Minesweeper from './Minesweeper'
import TicTacToe from './TicTacToe'

export interface ToolDef {
  id: ToolId
  title: string          // shown in the Shell header
  hint: string           // tooltip on the dock grid (icons are unlabelled)
  icon: React.ReactNode
  Component: React.ComponentType<ToolProps>
}

// Order = grid order in the TOOLS popover. Icons are unlabelled in the grid (hint is the tooltip).
export const TOOLS: ToolDef[] = [
  { id: 'board',       title: 'Dry-Erase Board',  hint: 'Dry-erase board',     icon: <PenLine size={16} strokeWidth={1.6} />,    Component: Whiteboard },
  { id: 'timer',       title: 'Timer Tools',       hint: 'Timer / stopwatch',   icon: <Timer size={16} strokeWidth={1.6} />,      Component: TimerTools },
  { id: 'rng',         title: 'Random Number',     hint: 'Random number',       icon: <Dice5 size={16} strokeWidth={1.6} />,      Component: RandomNumber },
  { id: 'calc',        title: 'Calculator',        hint: 'Calculator',          icon: <Calculator size={16} strokeWidth={1.6} />, Component: Calc },
  { id: 'metronome',   title: 'Metronome',         hint: 'Metronome',           icon: <Gauge size={16} strokeWidth={1.6} />,      Component: Metronome },
  { id: 'notes',       title: 'Scratchpad',        hint: 'Scratchpad notes',    icon: <StickyNote size={16} strokeWidth={1.6} />, Component: Notes },
  { id: 'game2048',    title: '2048',              hint: '2048',                icon: <Grid2x2 size={16} strokeWidth={1.6} />,    Component: Game2048 },
  { id: 'snake',       title: 'Snake',             hint: 'Snake',               icon: <Worm size={16} strokeWidth={1.6} />,       Component: Snake },
  { id: 'minesweeper', title: 'Minesweeper',       hint: 'Minesweeper',         icon: <Bomb size={16} strokeWidth={1.6} />,       Component: Minesweeper },
  { id: 'tictactoe',   title: 'Tic-Tac-Toe',       hint: 'Tic-tac-toe',         icon: <Hash size={16} strokeWidth={1.6} />,       Component: TicTacToe },
]

export function getTool(id: ToolId): ToolDef {
  return TOOLS.find((t) => t.id === id) ?? TOOLS[0]
}
