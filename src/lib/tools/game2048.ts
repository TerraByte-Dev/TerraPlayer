// Pure game logic for 2048. No DOM, no React, no imports from other modules — this file is self-contained
// so it can be unit-tested under `node --experimental-strip-types`.
//
// BOARD MODEL: a flat `number[]` of length 16, row-major (index = row * 4 + col). 0 means an empty cell;
// any other value is a power of two (2, 4, 8, ...). This flat layout keeps slide/merge math simple and the
// whole board trivially cloneable.

export type Board = number[]
export type Direction = 'up' | 'down' | 'left' | 'right'

export interface MoveResult {
  /** A NEW board (the input is never mutated). */
  board: Board
  /** Whether the move changed the board at all. */
  moved: boolean
  /** Points earned this move = sum of every merged tile's resulting value. */
  gained: number
}

export const SIZE = 4
export const CELLS = SIZE * SIZE
export const WIN_VALUE = 2048

/** Default randomness — replaceable in tests via the `rng` parameter. */
const defaultRng = Math.random

/** A fresh empty board (all zeros). */
export function emptyBoard(): Board {
  return new Array(CELLS).fill(0)
}

/** Indices of every empty (0) cell. */
export function emptyCells(board: Board): number[] {
  const out: number[] = []
  for (let i = 0; i < board.length; i++) if (board[i] === 0) out.push(i)
  return out
}

/**
 * Place one new tile (2 with 90% probability, 4 with 10%) in a uniformly-random empty cell.
 * Returns a NEW board; if the board is full it is returned unchanged (cloned).
 */
export function spawnRandom(board: Board, rng: () => number = defaultRng): Board {
  const next = board.slice()
  const empties = emptyCells(next)
  if (empties.length === 0) return next
  const cell = empties[Math.floor(rng() * empties.length)]
  next[cell] = rng() < 0.9 ? 2 : 4
  return next
}

/** A new game: an empty board with two spawned tiles. */
export function newGame(rng: () => number = defaultRng): Board {
  return spawnRandom(spawnRandom(emptyBoard(), rng), rng)
}

/**
 * Slide+merge a single line (length 4) toward index 0 (i.e. "left"). Classic 2048 rules:
 * tiles slide over gaps, equal adjacent tiles merge once, and a tile produced by a merge cannot merge
 * again on the same move (so [4,2,2] -> [4,4,0,0], NOT [8,...]).
 * Returns the resulting line plus the points gained from merges on this line.
 */
function collapseLine(line: number[]): { line: number[]; gained: number } {
  const tiles = line.filter((v) => v !== 0)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2
      out.push(merged)
      gained += merged
      i++ // consume the partner so it cannot merge again
    } else {
      out.push(tiles[i])
    }
  }
  while (out.length < SIZE) out.push(0)
  return { line: out, gained }
}

/**
 * Extract the 4 cells that form a line for a given direction, ordered so that the FIRST element is the one
 * a tile slides toward. Returns the flat board indices in that order.
 */
function lineIndices(dir: Direction, n: number): number[] {
  const idx: number[] = []
  for (let k = 0; k < SIZE; k++) {
    switch (dir) {
      case 'left':  idx.push(n * SIZE + k); break          // row n, left -> right
      case 'right': idx.push(n * SIZE + (SIZE - 1 - k)); break // row n, right -> left
      case 'up':    idx.push(k * SIZE + n); break          // col n, top -> bottom
      case 'down':  idx.push((SIZE - 1 - k) * SIZE + n); break // col n, bottom -> top
    }
  }
  return idx
}

/**
 * Apply a move. Slides and merges every line once toward `dir`. Does NOT mutate the input board and does NOT
 * spawn a new tile (the caller spawns only when `moved` is true).
 */
export function move(board: Board, dir: Direction): MoveResult {
  const next = board.slice()
  let moved = false
  let gained = 0
  for (let n = 0; n < SIZE; n++) {
    const indices = lineIndices(dir, n)
    const before = indices.map((i) => board[i])
    const { line: after, gained: g } = collapseLine(before)
    gained += g
    for (let k = 0; k < SIZE; k++) {
      if (next[indices[k]] !== after[k]) moved = true
      next[indices[k]] = after[k]
    }
  }
  return { board: next, moved, gained }
}

/** True if any tile has reached the win value (2048 by default). */
export function hasWon(board: Board, target: number = WIN_VALUE): boolean {
  for (let i = 0; i < board.length; i++) if (board[i] >= target) return true
  return false
}

/** True if no move in any direction would change the board (board full + no adjacent equal tiles). */
export function isGameOver(board: Board): boolean {
  if (emptyCells(board).length > 0) return false
  const dirs: Direction[] = ['up', 'down', 'left', 'right']
  for (const d of dirs) if (move(board, d).moved) return false
  return true
}

/** The current highest tile on the board. */
export function maxTile(board: Board): number {
  let m = 0
  for (let i = 0; i < board.length; i++) if (board[i] > m) m = board[i]
  return m
}
