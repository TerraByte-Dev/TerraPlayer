// Pure, self-contained Snake game logic. No DOM, no React, no imports.
// Randomness is injected via an `rng: () => number` parameter (defaults to Math.random) so tests can
// pass a deterministic stub. The board is a W x H grid; cell (0,0) is the top-left.

export interface Point {
  x: number
  y: number
}

export type Dir = 'up' | 'down' | 'left' | 'right'

export interface GameState {
  snake: Point[] // head first, tail last
  dir: Dir
  food: Point
  dead: boolean
  score: number
}

type Rng = () => number

const DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

/**
 * Pick a uniformly random empty cell (one not occupied by the snake) using the injected rng.
 * Returns null only when the snake fills the entire board (no empty cell exists).
 */
function randomEmptyCell(snake: Point[], w: number, h: number, rng: Rng): Point | null {
  const occupied = new Set<number>()
  for (const seg of snake) occupied.add(seg.y * w + seg.x)
  const empties: Point[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!occupied.has(y * w + x)) empties.push({ x, y })
    }
  }
  if (empties.length === 0) return null
  const idx = Math.min(empties.length - 1, Math.max(0, Math.floor(rng() * empties.length)))
  return empties[idx]
}

/**
 * Build a fresh game. The snake is length 2, centered, heading right; food drops on a random empty cell.
 */
export function newGame(w: number, h: number, rng: Rng = Math.random): GameState {
  const cx = Math.floor(w / 2)
  const cy = Math.floor(h / 2)
  // Head first, then the cell behind it (to the left, since we start moving right).
  const snake: Point[] = [
    { x: cx, y: cy },
    { x: Math.max(0, cx - 1), y: cy },
  ]
  const food = randomEmptyCell(snake, w, h, rng) ?? { x: 0, y: 0 }
  return {
    snake,
    dir: 'right',
    food,
    dead: false,
    score: 0,
  }
}

/**
 * Change direction. A 180° reversal (turning straight back into the neck) is ignored. When the snake is a
 * single segment there is no neck, so any direction is allowed. Returns a NEW state (no mutation).
 */
export function turn(state: GameState, dir: Dir): GameState {
  if (state.dead) return state
  // Block reversing into the neck only when the snake actually has a neck to collide with.
  if (state.snake.length > 1 && dir === OPPOSITE[state.dir]) return state
  if (dir === state.dir) return state
  return { ...state, dir }
}

/**
 * Advance the game one tick. Does NOT mutate the input state.
 * - Compute the new head from the current direction.
 * - Hitting a wall or the snake's own body → dead (no move).
 * - Landing on food → grow (keep the tail), score + 1, drop new food on a random empty cell.
 * - Otherwise → move forward (advance head, drop the tail).
 */
export function step(state: GameState, w: number, h: number, rng: Rng = Math.random): GameState {
  if (state.dead) return state

  const head = state.snake[0]
  const d = DELTA[state.dir]
  const next: Point = { x: head.x + d.x, y: head.y + d.y }

  // Wall collision.
  if (next.x < 0 || next.y < 0 || next.x >= w || next.y >= h) {
    return { ...state, snake: state.snake.map((p) => ({ ...p })), dead: true }
  }

  const eating = samePoint(next, state.food)

  // Self collision. When moving (not eating), the tail vacates its cell this tick, so colliding with the
  // current tail cell is allowed. When eating, the tail stays, so every body cell is solid.
  const body = eating ? state.snake : state.snake.slice(0, state.snake.length - 1)
  for (const seg of body) {
    if (samePoint(seg, next)) {
      return { ...state, snake: state.snake.map((p) => ({ ...p })), dead: true }
    }
  }

  if (eating) {
    const grown: Point[] = [next, ...state.snake.map((p) => ({ ...p }))]
    const food = randomEmptyCell(grown, w, h, rng) ?? state.food
    return {
      snake: grown,
      dir: state.dir,
      food,
      dead: false,
      score: state.score + 1,
    }
  }

  // Plain move: new head in front, drop the old tail.
  const moved: Point[] = [next, ...state.snake.slice(0, state.snake.length - 1).map((p) => ({ ...p }))]
  return {
    snake: moved,
    dir: state.dir,
    food: { ...state.food },
    dead: false,
    score: state.score,
  }
}
