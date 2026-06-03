import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame, step, turn } from '../snake.ts'

// A deterministic rng that always returns 0 (picks the first empty cell).
const rngZero = () => 0

// An rng that cycles through preset values, then returns 0.
function seq(values) {
  let i = 0
  return () => (i < values.length ? values[i++] : 0)
}

test('newGame produces a centered length-2 snake heading right', () => {
  const g = newGame(10, 10, rngZero)
  assert.equal(g.snake.length, 2)
  assert.deepEqual(g.snake[0], { x: 5, y: 5 })
  assert.deepEqual(g.snake[1], { x: 4, y: 5 })
  assert.equal(g.dir, 'right')
  assert.equal(g.dead, false)
  assert.equal(g.score, 0)
  // Food must land on an empty cell (not on the snake).
  assert.ok(!g.snake.some((s) => s.x === g.food.x && s.y === g.food.y))
})

test('a normal step moves the head one cell forward and drops the tail', () => {
  const g = newGame(10, 10, rngZero)
  // Move food out of the way so this step is a plain move.
  const state = { ...g, food: { x: 0, y: 0 } }
  const head = state.snake[0]
  const next = step(state, 10, 10, rngZero)
  assert.equal(next.snake.length, 2, 'length unchanged on a plain move')
  assert.deepEqual(next.snake[0], { x: head.x + 1, y: head.y }, 'head advanced right')
  assert.deepEqual(next.snake[1], head, 'second segment took the old head cell')
  assert.equal(next.score, 0)
  assert.equal(next.dead, false)
})

test('step does not mutate the input state', () => {
  const g = newGame(10, 10, rngZero)
  const state = { ...g, food: { x: 0, y: 0 } }
  const snapshot = JSON.stringify(state)
  step(state, 10, 10, rngZero)
  assert.equal(JSON.stringify(state), snapshot, 'input state untouched')
})

test('eating food grows length by 1, increments score, and relocates food', () => {
  // Put food directly in front of the head so the next step eats it.
  const base = newGame(10, 10, rngZero)
  const head = base.snake[0]
  const state = { ...base, food: { x: head.x + 1, y: head.y } }
  // rng picks an empty cell for the new food.
  const next = step(state, 10, 10, rngZero)
  assert.equal(next.snake.length, base.snake.length + 1, 'grew by one')
  assert.equal(next.score, base.score + 1, 'score +1')
  assert.deepEqual(next.snake[0], { x: head.x + 1, y: head.y }, 'head moved onto food')
  // New food is not on the old food cell and not on the snake.
  assert.ok(
    !(next.food.x === state.food.x && next.food.y === state.food.y),
    'food relocated off the eaten cell',
  )
  assert.ok(!next.snake.some((s) => s.x === next.food.x && s.y === next.food.y), 'food not on snake')
})

test('wall hit kills the snake without moving', () => {
  // Snake at the right edge heading right.
  const state = {
    snake: [{ x: 9, y: 0 }, { x: 8, y: 0 }],
    dir: 'right',
    food: { x: 0, y: 9 },
    dead: false,
    score: 3,
  }
  const next = step(state, 10, 10, rngZero)
  assert.equal(next.dead, true, 'dead after wall hit')
  assert.deepEqual(next.snake, state.snake, 'snake did not move')
  assert.equal(next.score, 3, 'score preserved')
})

test('wall hit at the top edge kills the snake', () => {
  const state = {
    snake: [{ x: 4, y: 0 }, { x: 4, y: 1 }],
    dir: 'up',
    food: { x: 9, y: 9 },
    dead: false,
    score: 0,
  }
  const next = step(state, 10, 10, rngZero)
  assert.equal(next.dead, true)
})

test('self hit kills the snake', () => {
  // A coiled snake; moving down drives the head into its own body.
  // Body: head at (2,1) heading down; (2,2) is occupied by the body below.
  const state = {
    snake: [
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ],
    dir: 'down',
    food: { x: 9, y: 9 },
    dead: false,
    score: 4,
  }
  const next = step(state, 10, 10, rngZero)
  assert.equal(next.dead, true, 'dead after running into own body')
  assert.deepEqual(next.snake, state.snake, 'snake did not move')
})

test('moving into the current tail cell is allowed (tail vacates)', () => {
  // A snake in a tight loop where the cell the head would enter is the current tail cell.
  // Head (1,0) heading down would move to (1,1), which is the tail — and the tail moves away this tick.
  const state = {
    snake: [
      { x: 1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }, // tail
    ],
    dir: 'down',
    food: { x: 9, y: 9 },
    dead: false,
    score: 0,
  }
  const next = step(state, 10, 10, rngZero)
  assert.equal(next.dead, false, 'not dead — tail cell is freed as we step in')
  assert.deepEqual(next.snake[0], { x: 1, y: 1 }, 'head entered the freed tail cell')
})

test('turn changes direction', () => {
  const g = newGame(10, 10, rngZero) // heading right
  const turned = turn(g, 'up')
  assert.equal(turned.dir, 'up')
  // turn returns a new object, not the same reference.
  assert.notEqual(turned, g)
})

test('turn ignores a 180-degree reversal into the neck', () => {
  const g = newGame(10, 10, rngZero) // heading right, length 2
  const reversed = turn(g, 'left')
  assert.equal(reversed.dir, 'right', 'reversal ignored, still heading right')
})

test('turn does not mutate input and is a no-op for the same direction', () => {
  const g = newGame(10, 10, rngZero)
  const same = turn(g, 'right')
  assert.equal(same.dir, 'right')
  // Reversal on a length-1 snake (no neck) is allowed.
  const single = { snake: [{ x: 5, y: 5 }], dir: 'right', food: { x: 0, y: 0 }, dead: false, score: 0 }
  assert.equal(turn(single, 'left').dir, 'left', 'single-segment snake may reverse')
})

test('turn on a dead game is a no-op', () => {
  const dead = { snake: [{ x: 0, y: 0 }], dir: 'right', food: { x: 5, y: 5 }, dead: true, score: 0 }
  assert.equal(turn(dead, 'up').dir, 'right')
})

test('food relocation uses the injected rng deterministically', () => {
  // Force the head to eat, and force rng to select a specific empty cell index.
  const base = newGame(6, 6, rngZero)
  const head = base.snake[0]
  const state = { ...base, food: { x: head.x + 1, y: head.y }, snake: base.snake.map((p) => ({ ...p })) }
  // After eating, the grown snake occupies 3 cells. Pick rng=0 -> first empty cell (0,0).
  const next = step(state, 6, 6, seq([0]))
  assert.deepEqual(next.food, { x: 0, y: 0 })
})
