import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  newBoard,
  reveal,
  toggleFlag,
  isWon,
  countFlags,
  countMines,
} from '../minesweeper.ts'

// A deterministic rng stub: returns the queued values in order, then 0 forever.
// Useful for steering the partial Fisher–Yates shuffle in newBoard.
function seq(values) {
  let i = 0
  return () => (i < values.length ? values[i++] : 0)
}

// Build a board by hand from a layout string. '*' = mine, '.' = empty.
// Returns the board with adjacency recomputed (via a mine-only newBoard trick).
function fromLayout(rows) {
  const grid = rows.map((line) => line.split(''))
  const R = grid.length
  const C = grid[0].length
  // Start with a zero-mine board, then plant mines and let reveal/adjacency helpers
  // see them. We recompute adjacency by re-deriving through newBoard semantics:
  // easiest is to construct cells directly and count neighbours here.
  const board = grid.map((line) =>
    line.map((ch) => ({ mine: ch === '*', revealed: false, flagged: false, adj: 0 })),
  )
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (board[r][c].mine) continue
      let n = 0
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr
          const nc = c + dc
          if (nr >= 0 && nr < R && nc >= 0 && nc < C && board[nr][nc].mine) n++
        }
      board[r][c].adj = n
    }
  }
  return board
}

test('newBoard places exactly the requested number of mines', () => {
  const b = newBoard(9, 9, 10, Math.random)
  assert.equal(countMines(b), 10)
  assert.equal(b.length, 9)
  assert.equal(b[0].length, 9)
})

test('newBoard never places a mine on the safe cell', () => {
  // Run many times with real randomness to be confident the safe cell stays clear.
  for (let i = 0; i < 200; i++) {
    const safe = { r: 4, c: 4 }
    const b = newBoard(9, 9, 80, Math.random, safe) // very dense field
    assert.equal(b[safe.r][safe.c].mine, false)
    assert.equal(countMines(b), 80)
  }
})

test('newBoard clamps mines to the number of placeable cells', () => {
  // 3x3 with a safe cell => 8 placeable. Asking for 100 should clamp to 8.
  const b = newBoard(3, 3, 100, Math.random, { r: 1, c: 1 })
  assert.equal(countMines(b), 8)
  assert.equal(b[1][1].mine, false)
})

test('newBoard with deterministic rng places mines at predictable spots', () => {
  // 1x4 row, 2 mines, no safe cell. placeable = [0,1,2,3].
  // Partial F-Y, wanted=2:
  //  i=0: j = 0 + floor(rng()*4). rng()=0 -> j=0, swap(0,0), plant idx 0 -> (0,0)
  //  i=1: j = 1 + floor(rng()*3). rng()=0 -> j=1, swap(1,1), plant idx 1 -> (0,1)
  const b = newBoard(1, 4, 2, seq([0, 0]))
  assert.equal(b[0][0].mine, true)
  assert.equal(b[0][1].mine, true)
  assert.equal(b[0][2].mine, false)
  assert.equal(b[0][3].mine, false)
  assert.equal(countMines(b), 2)
})

test('adjacency counts are correct for a deterministic layout', () => {
  // 3x3, single mine in the center => all 8 borders read 1, center reads 0.
  const b = fromLayout([
    '...',
    '.*.',
    '...',
  ])
  assert.equal(b[1][1].adj, 0) // mine cell's adj is irrelevant/0
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 1) continue
      assert.equal(b[r][c].adj, 1, `cell ${r},${c}`)
    }

  // Corner mine: only the 3 cells touching it read 1.
  const b2 = fromLayout([
    '*..',
    '...',
    '...',
  ])
  assert.equal(b2[0][1].adj, 1)
  assert.equal(b2[1][0].adj, 1)
  assert.equal(b2[1][1].adj, 1)
  assert.equal(b2[0][2].adj, 0)
  assert.equal(b2[2][2].adj, 0)
})

test('reveal floods a zero region and stops at numbered borders', () => {
  // 5x5 with a single mine in the bottom-right corner. Clicking top-left (0,0),
  // which has adj 0, should flood the whole open region and reveal the numbered
  // cells bordering the mine, but never the mine itself.
  const b = fromLayout([
    '.....',
    '.....',
    '.....',
    '.....',
    '....*',
  ])
  const out = reveal(b, 0, 0)

  // Mine stays hidden.
  assert.equal(out[4][4].revealed, false)

  // The numbered cells adjacent to the mine are revealed (border of the flood).
  assert.equal(out[3][3].revealed, true)
  assert.equal(out[3][4].revealed, true)
  assert.equal(out[4][3].revealed, true)

  // A far open cell got revealed by the flood.
  assert.equal(out[0][0].revealed, true)
  assert.equal(out[2][2].revealed, true)

  // Every non-mine cell should be revealed (the whole field is one open region).
  let hidden = 0
  for (const row of out) for (const cell of row) if (!cell.mine && !cell.revealed) hidden++
  assert.equal(hidden, 0)
})

test('reveal of a numbered cell reveals only that cell', () => {
  // Center mine: clicking a bordering numbered cell reveals just it.
  const b = fromLayout([
    '...',
    '.*.',
    '...',
  ])
  const out = reveal(b, 0, 0) // adj 1, not a flood seed
  assert.equal(out[0][0].revealed, true)
  // Neighbours stay hidden.
  assert.equal(out[0][1].revealed, false)
  assert.equal(out[1][0].revealed, false)
})

test('reveal does not affect flagged or already-revealed cells', () => {
  const b = fromLayout(['...', '.*.', '...'])
  const flagged = toggleFlag(b, 0, 0)
  const out = reveal(flagged, 0, 0)
  assert.equal(out[0][0].revealed, false)
  assert.equal(out[0][0].flagged, true)
})

test('revealing a mine marks it revealed (caller detects loss)', () => {
  const b = fromLayout([
    '*..',
    '...',
    '...',
  ])
  const out = reveal(b, 0, 0)
  assert.equal(out[0][0].revealed, true)
  assert.equal(out[0][0].mine, true)
  // No flood: other cells stay hidden.
  assert.equal(out[1][1].revealed, false)
})

test('reveal is immutable — input board is untouched', () => {
  const b = fromLayout(['...', '.*.', '...'])
  reveal(b, 0, 0)
  for (const row of b) for (const cell of row) assert.equal(cell.revealed, false)
})

test('toggleFlag flips flag state and is immutable', () => {
  const b = fromLayout(['..', '.*'])
  const f1 = toggleFlag(b, 0, 0)
  assert.equal(f1[0][0].flagged, true)
  assert.equal(b[0][0].flagged, false, 'input untouched')

  const f2 = toggleFlag(f1, 0, 0)
  assert.equal(f2[0][0].flagged, false)
})

test('toggleFlag cannot flag a revealed cell', () => {
  const b = fromLayout(['...', '.*.', '...'])
  const revealed = reveal(b, 0, 0) // reveals the open region (all but mine)
  const out = toggleFlag(revealed, 0, 0)
  assert.equal(out[0][0].flagged, false)
})

test('countFlags counts only flagged cells', () => {
  const b = fromLayout(['...', '...', '...'])
  assert.equal(countFlags(b), 0)
  let x = toggleFlag(b, 0, 0)
  x = toggleFlag(x, 2, 2)
  assert.equal(countFlags(x), 2)
})

test('isWon is true exactly when all non-mine cells are revealed', () => {
  // Corner mine leaves a connected open region (the bottom-right cell has adj 0),
  // so a single flood from there reveals every non-mine cell.
  const b = fromLayout([
    '*..',
    '...',
    '...',
  ])
  assert.equal(isWon(b), false)
  const out = reveal(b, 2, 2)
  assert.equal(isWon(out), true)
})

test('isWon stays false while any safe cell is hidden', () => {
  // Center mine: every non-mine cell is numbered (adj >= 1), so revealing one
  // numbered cell reveals only it and the win condition is not met.
  const b = fromLayout([
    '...',
    '.*.',
    '...',
  ])
  const out = reveal(b, 0, 0)
  assert.equal(out[0][0].revealed, true)
  assert.equal(out[0][1].revealed, false)
  assert.equal(isWon(out), false)
})

test('isWon ignores mines (unrevealed mines do not block a win)', () => {
  // 2x1: one mine, one safe. Reveal the safe cell only.
  const b = fromLayout(['*', '.'])
  const out = reveal(b, 1, 0)
  assert.equal(out[1][0].revealed, true)
  assert.equal(out[0][0].revealed, false) // mine still hidden
  assert.equal(isWon(out), true)
})

test('newBoard with safe cell guarantees the first click floods safely', () => {
  // First-click-safe contract: building the board around a safe cell means the
  // clicked cell is never a mine, so revealing it can flood.
  const safe = { r: 0, c: 0 }
  const b = newBoard(5, 5, 5, seq([0.1, 0.2, 0.3, 0.4, 0.5]), safe)
  assert.equal(b[safe.r][safe.c].mine, false)
  const out = reveal(b, safe.r, safe.c)
  assert.equal(out[safe.r][safe.c].revealed, true)
})
