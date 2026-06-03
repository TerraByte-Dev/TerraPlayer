// Pure Tic-Tac-Toe logic — no DOM, no React, self-contained. The component layer (TicTacToe.tsx) renders
// these results. Randomness is injected (`rng`) only to break ties between equally-optimal moves so the AI
// feels less robotic; the minimax decision itself is fully deterministic and unbeatable.

export type Player = 'X' | 'O'
export type Cell = Player | null
export type Board = Cell[] // length 9, index 0..8 left-to-right, top-to-bottom
export type Outcome = Player | 'draw' | null // null = game still in progress

// The 8 winning triples (3 rows, 3 cols, 2 diagonals).
export const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
]

/** The opponent of a player. */
export function opponent(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}

/** Indices of the empty cells, in ascending order. */
export function emptyCells(board: Board): number[] {
  const out: number[] = []
  for (let i = 0; i < board.length; i++) if (board[i] === null) out.push(i)
  return out
}

/**
 * Returns the winning line ([a, b, c]) if there is one, else null. Useful for highlighting
 * the three cells that won the game in the UI.
 */
export function winningLine(board: Board): readonly [number, number, number] | null {
  for (const line of LINES) {
    const [a, b, c] = line
    const v = board[a]
    if (v !== null && v === board[b] && v === board[c]) return line
  }
  return null
}

/**
 * Game outcome: 'X' or 'O' if that player has three in a row, 'draw' if the board is full with no
 * winner, or null if the game is still in progress.
 */
export function winner(board: Board): Outcome {
  const line = winningLine(board)
  if (line) return board[line[0]] as Player
  return emptyCells(board).length === 0 ? 'draw' : null
}

/**
 * Minimax score for `board` from the perspective of `aiPlayer`, assuming it is `toMove`'s turn.
 * +depth-weighted positive = AI wins (sooner is better), negative = AI loses (later is better),
 * 0 = draw. `depth` counts plies played so far; weighting by depth makes the AI prefer the
 * quickest win and the most-delayed loss, which yields natural-looking optimal play.
 */
function minimax(board: Board, aiPlayer: Player, toMove: Player, depth: number): number {
  const result = winner(board)
  if (result === aiPlayer) return 10 - depth
  if (result === opponent(aiPlayer)) return depth - 10
  if (result === 'draw') return 0

  const moves = emptyCells(board)
  if (toMove === aiPlayer) {
    let best = -Infinity
    for (const i of moves) {
      board[i] = toMove
      best = Math.max(best, minimax(board, aiPlayer, opponent(toMove), depth + 1))
      board[i] = null
    }
    return best
  } else {
    let best = Infinity
    for (const i of moves) {
      board[i] = toMove
      best = Math.min(best, minimax(board, aiPlayer, opponent(toMove), depth + 1))
      board[i] = null
    }
    return best
  }
}

/**
 * The optimal move index for `player` on `board` using full minimax (unbeatable). Returns -1 if there
 * are no moves available. When several moves share the top score, one is chosen at random via `rng`
 * so the AI does not always play identically; the chosen move is still strictly optimal.
 */
export function bestMove(board: Board, player: Player, rng: () => number = Math.random): number {
  const moves = emptyCells(board)
  if (moves.length === 0) return -1

  let bestScore = -Infinity
  const bestMoves: number[] = []
  for (const i of moves) {
    board[i] = player
    const score = minimax(board, player, opponent(player), 1)
    board[i] = null
    if (score > bestScore) {
      bestScore = score
      bestMoves.length = 0
      bestMoves.push(i)
    } else if (score === bestScore) {
      bestMoves.push(i)
    }
  }
  return bestMoves[Math.floor(rng() * bestMoves.length)]
}
