// The contract every tool implements. The overlay Shell supplies the framed window (title bar, close,
// fullscreen toggle); a tool just renders its body and is told whether it is currently fullscreen so it can
// scale its display. Tools mount only while open and must clean up timers / rafs / listeners on unmount
// (memory discipline — the whole app targets < 300 MB resident).

export interface ToolProps {
  fullscreen: boolean
}

export type ToolId =
  | 'board'
  | 'timer'
  | 'rng'
  | 'calc'
  | 'metronome'
  | 'notes'
  | 'game2048'
  | 'snake'
  | 'minesweeper'
  | 'tictactoe'
