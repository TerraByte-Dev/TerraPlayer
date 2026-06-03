// Pure, self-contained Minesweeper logic. No DOM, no React, no external imports.
// All updates are immutable: every exported mutator returns a fresh board (and fresh cells where touched).
// Randomness is injected via `rng` so tests can pass a deterministic stub.

export interface Cell {
  mine: boolean
  revealed: boolean
  flagged: boolean
  adj: number // number of adjacent mines (0-8)
}

export type Board = Cell[][]

export interface Coord {
  r: number
  c: number
}

function makeCell(): Cell {
  return { mine: false, revealed: false, flagged: false, adj: 0 }
}

/** Deep-clone a board so callers never mutate the input. */
function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => ({ ...cell })))
}

/** Iterate the (up to) 8 neighbours of (r,c) that lie inside the grid. */
function forEachNeighbor(
  rows: number,
  cols: number,
  r: number,
  c: number,
  fn: (nr: number, nc: number) => void,
) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) fn(nr, nc)
    }
  }
}

/** Recompute every cell's adjacency count from its mine layout. Mutates in place. */
function computeAdjacency(board: Board): void {
  const rows = board.length
  const cols = rows > 0 ? board[0].length : 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) {
        board[r][c].adj = 0
        continue
      }
      let count = 0
      forEachNeighbor(rows, cols, r, c, (nr, nc) => {
        if (board[nr][nc].mine) count++
      })
      board[r][c].adj = count
    }
  }
}

/**
 * Build a fresh board with exactly `mines` mines placed at random, never on the
 * `safe` cell (when provided), and with adjacency counts computed.
 *
 * `mines` is clamped to the number of placeable cells (all cells, minus the safe one).
 */
export function newBoard(
  rows: number,
  cols: number,
  mines: number,
  rng: () => number = Math.random,
  safe?: Coord,
): Board {
  const board: Board = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => makeCell()),
  )

  const total = rows * cols
  // Cells that may hold a mine: everything except the safe cell.
  const placeable: number[] = []
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    if (safe && r === safe.r && c === safe.c) continue
    placeable.push(i)
  }

  const wanted = Math.max(0, Math.min(Math.floor(mines), placeable.length))

  // Partial Fisher–Yates: shuffle the first `wanted` entries to the front, then plant.
  for (let i = 0; i < wanted; i++) {
    const j = i + Math.floor(rng() * (placeable.length - i))
    const tmp = placeable[i]
    placeable[i] = placeable[j]
    placeable[j] = tmp
    const idx = placeable[i]
    board[Math.floor(idx / cols)][idx % cols].mine = true
  }

  computeAdjacency(board)
  return board
}

/**
 * Reveal cell (r,c). Returns a new board. If the cell is a 0-adjacency cell, flood-fills
 * the connected region of 0-adjacency cells and their numbered borders. Revealing a mine
 * simply marks that mine revealed (the caller inspects the cell to detect a loss).
 *
 * Flagged cells and already-revealed cells are not affected.
 */
export function reveal(board: Board, r: number, c: number): Board {
  const rows = board.length
  const cols = rows > 0 ? board[0].length : 0
  if (r < 0 || r >= rows || c < 0 || c >= cols) return board

  const start = board[r][c]
  if (start.revealed || start.flagged) return board

  const next = cloneBoard(board)

  // Revealing a mine: just expose it; the caller detects loss.
  if (next[r][c].mine) {
    next[r][c] = { ...next[r][c], revealed: true }
    return next
  }

  // Flood fill from the clicked cell. We reveal each popped cell; if it is a 0-adjacency
  // cell we enqueue its (non-mine) neighbours so numbered borders are revealed but the
  // flood stops there.
  const stack: number[] = [r * cols + c]
  while (stack.length > 0) {
    const pos = stack.pop()!
    const cr = Math.floor(pos / cols)
    const cc = pos % cols
    const cell = next[cr][cc]
    if (cell.revealed || cell.flagged || cell.mine) continue
    next[cr][cc] = { ...cell, revealed: true }
    if (cell.adj === 0) {
      forEachNeighbor(rows, cols, cr, cc, (nr, nc) => {
        const n = next[nr][nc]
        if (!n.revealed && !n.flagged && !n.mine) stack.push(nr * cols + nc)
      })
    }
  }

  return next
}

/**
 * Toggle the flag on cell (r,c). Returns a new board. Already-revealed cells cannot be
 * flagged. Out-of-range coordinates are ignored.
 */
export function toggleFlag(board: Board, r: number, c: number): Board {
  const rows = board.length
  const cols = rows > 0 ? board[0].length : 0
  if (r < 0 || r >= rows || c < 0 || c >= cols) return board
  if (board[r][c].revealed) return board

  const next = cloneBoard(board)
  next[r][c] = { ...next[r][c], flagged: !next[r][c].flagged }
  return next
}

/** True once every non-mine cell has been revealed (a win). */
export function isWon(board: Board): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.mine && !cell.revealed) return false
    }
  }
  return true
}

/** Number of cells currently flagged. */
export function countFlags(board: Board): number {
  let n = 0
  for (const row of board) for (const cell of row) if (cell.flagged) n++
  return n
}

/** Number of mines on the board. */
export function countMines(board: Board): number {
  let n = 0
  for (const row of board) for (const cell of row) if (cell.mine) n++
  return n
}
