// Unit tests for game2048.ts — pure slide/merge/spawn/win/lose logic.
// Run: node --no-warnings --experimental-strip-types --test src/lib/tools/__tests__/game2048.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  newGame, move, spawnRandom, hasWon, isGameOver, emptyCells, emptyBoard, maxTile,
  SIZE, CELLS, WIN_VALUE,
} from '../game2048.ts'

// Helpers ---------------------------------------------------------------------------------------------
const countNonZero = (b) => b.filter((v) => v !== 0).length

test('newGame spawns exactly two tiles, each a 2 or 4, in a 16-cell board', () => {
  const b = newGame(() => 0) // rng=0 -> first empty cell, value 2
  assert.equal(b.length, CELLS)
  assert.equal(countNonZero(b), 2)
  for (const v of b) assert.ok(v === 0 || v === 2 || v === 4)
})

test('move left: [2,2,0,0] -> [4,0,0,0], gained 4', () => {
  const board = [
    2, 2, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  const r = move(board, 'left')
  assert.deepEqual(r.board.slice(0, 4), [4, 0, 0, 0])
  assert.equal(r.gained, 4)
  assert.equal(r.moved, true)
})

test('move left: [2,2,2,2] -> [4,4,0,0], gained 8', () => {
  const board = [
    2, 2, 2, 2,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  const r = move(board, 'left')
  assert.deepEqual(r.board.slice(0, 4), [4, 4, 0, 0])
  assert.equal(r.gained, 8)
})

test('merges happen once per move — no chaining: [4,2,2,0] left -> [4,4,0,0]', () => {
  const board = [
    4, 2, 2, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  const r = move(board, 'left')
  assert.deepEqual(r.board.slice(0, 4), [4, 4, 0, 0])
  assert.equal(r.gained, 4)
})

test('a tile produced by a merge does not merge again: [2,2,4,0] left -> [4,4,0,0]', () => {
  const board = [
    2, 2, 4, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  const r = move(board, 'left')
  assert.deepEqual(r.board.slice(0, 4), [4, 4, 0, 0])
  assert.equal(r.gained, 4)
})

test('move right slides toward the right edge: [2,2,0,0] right -> [0,0,0,4]', () => {
  const board = [
    2, 2, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  const r = move(board, 'right')
  assert.deepEqual(r.board.slice(0, 4), [0, 0, 0, 4])
  assert.equal(r.gained, 4)
})

test('move up merges down a column: col0 = [2,2,0,0] up -> [4,0,0,0]', () => {
  const board = [
    2, 0, 0, 0,
    2, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  const r = move(board, 'up')
  assert.equal(r.board[0], 4)
  assert.equal(r.board[4], 0)
  assert.equal(r.gained, 4)
})

test('move down stacks a column to the bottom: col0 = [2,0,0,2] down -> [...,4]', () => {
  const board = [
    2, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    2, 0, 0, 0,
  ]
  const r = move(board, 'down')
  assert.equal(r.board[12], 4) // bottom-left
  assert.equal(r.board[0], 0)
  assert.equal(r.gained, 4)
})

test('moved=false when the move changes nothing', () => {
  const board = [
    2, 4, 8, 16,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  // Already packed against the left edge with no merges -> left is a no-op.
  const r = move(board, 'left')
  assert.equal(r.moved, false)
  assert.equal(r.gained, 0)
  assert.deepEqual(r.board, board)
})

test('move does NOT mutate its input', () => {
  const board = [
    2, 2, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  const snapshot = board.slice()
  move(board, 'left')
  assert.deepEqual(board, snapshot)
})

test('hasWon is true when a 2048 tile is present, false otherwise', () => {
  const won = emptyBoard()
  won[5] = WIN_VALUE
  assert.equal(hasWon(won), true)
  const notYet = emptyBoard()
  notYet[5] = 1024
  assert.equal(hasWon(notYet), false)
})

test('isGameOver is true on a full board with no possible merge', () => {
  // Checkerboard of distinct neighbors — no two adjacent cells equal, no empties.
  const board = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ]
  assert.equal(isGameOver(board), true)
})

test('isGameOver is false when a merge is available even on a full board', () => {
  const board = [
    2, 2, 4, 8,   // the two 2s can merge -> not over
    16, 32, 64, 128,
    256, 512, 1024, 8,
    4, 2, 4, 2,
  ]
  assert.equal(isGameOver(board), false)
})

test('isGameOver is false whenever an empty cell exists', () => {
  const board = emptyBoard()
  board[0] = 2
  assert.equal(isGameOver(board), false)
})

test('spawnRandom only fills empty cells and adds exactly one tile', () => {
  const board = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 0, 2, // single empty at index 14
  ]
  const next = spawnRandom(board, () => 0)
  assert.equal(next[14] === 2 || next[14] === 4, true)
  assert.equal(countNonZero(next), CELLS) // now full
  // the prior occupied cells are untouched
  for (let i = 0; i < CELLS; i++) if (i !== 14) assert.equal(next[i], board[i])
})

test('spawnRandom: rng<0.9 yields a 2, rng>=0.9 yields a 4', () => {
  const base = emptyBoard()
  const two = spawnRandom(base, () => 0.5)
  assert.equal(maxTile(two), 2)
  const four = spawnRandom(base, () => 0.95)
  assert.equal(maxTile(four), 4)
})

test('spawnRandom on a full board returns an equal (cloned, non-mutating) board', () => {
  const full = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ]
  const snapshot = full.slice()
  const next = spawnRandom(full, () => 0)
  assert.deepEqual(next, full)
  assert.notEqual(next, full) // a clone, not the same reference
  assert.deepEqual(full, snapshot) // input untouched
})

test('spawnRandom places into the chosen empty index based on rng', () => {
  const board = emptyBoard()
  // two empties would all be present; force rng to pick the last empty cell
  const next = spawnRandom(board, () => 0.999999)
  // rng()=~1 -> floor(rng*16) = 15 for cell pick, and rng>=0.9 -> value 4
  assert.equal(next[CELLS - 1], 4)
  assert.equal(emptyCells(next).length, CELLS - 1)
})

test('SIZE/CELLS constants are 4 and 16', () => {
  assert.equal(SIZE, 4)
  assert.equal(CELLS, 16)
})
