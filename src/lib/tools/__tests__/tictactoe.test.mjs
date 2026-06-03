import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  winner,
  emptyCells,
  bestMove,
  winningLine,
  opponent,
  LINES,
} from '../tictactoe.ts'

const _ = null

/** Build a 9-cell board from a compact string of 'X', 'O', and '.' (empty). */
function b(s) {
  const cells = s.replace(/\s+/g, '').split('')
  assert.equal(cells.length, 9, 'board string must describe 9 cells')
  return cells.map((c) => (c === 'X' ? 'X' : c === 'O' ? 'O' : null))
}

test('opponent flips the player', () => {
  assert.equal(opponent('X'), 'O')
  assert.equal(opponent('O'), 'X')
})

test('winner detects all 3 rows', () => {
  for (const [a, b2, c] of LINES.slice(0, 3)) {
    const board = [_, _, _, _, _, _, _, _, _]
    board[a] = 'X'; board[b2] = 'X'; board[c] = 'X'
    assert.equal(winner(board), 'X', `row ${[a, b2, c]} should win for X`)
  }
})

test('winner detects all 3 columns', () => {
  for (const [a, b2, c] of LINES.slice(3, 6)) {
    const board = [_, _, _, _, _, _, _, _, _]
    board[a] = 'O'; board[b2] = 'O'; board[c] = 'O'
    assert.equal(winner(board), 'O', `col ${[a, b2, c]} should win for O`)
  }
})

test('winner detects both diagonals', () => {
  assert.equal(winner(b('X..' + '.X.' + '..X')), 'X') // 0,4,8
  assert.equal(winner(b('..O' + '.O.' + 'O..')), 'O') // 2,4,6
})

test('winner detects a draw on a full board with no line', () => {
  // X O X
  // X O O
  // O X X   -> full, nobody has three in a row
  assert.equal(winner(b('XOX' + 'XOO' + 'OXX')), 'draw')
})

test('winner returns null while the game is in progress', () => {
  assert.equal(winner(b('X.O' + '.X.' + 'O..')), null)
  assert.equal(winner([_, _, _, _, _, _, _, _, _]), null) // empty board
})

test('emptyCells lists open indices in ascending order', () => {
  assert.deepEqual(emptyCells(b('X.O' + '.X.' + 'O..')), [1, 3, 5, 7, 8])
  assert.deepEqual(emptyCells([_, _, _, _, _, _, _, _, _]), [0, 1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(emptyCells(b('XOX' + 'XOO' + 'OXX')), [])
})

test('winningLine returns the exact winning triple, else null', () => {
  assert.deepEqual(winningLine(b('XXX' + '.O.' + 'O..')), [0, 1, 2])
  assert.deepEqual(winningLine(b('O..' + 'O..' + 'OXX')), [0, 3, 6])
  assert.equal(winningLine(b('X.O' + '.X.' + 'O..')), null)
})

test('bestMove takes an immediate winning move', () => {
  // X X .   X can win by playing index 2.
  // . O .
  // O . .
  const board = b('XX.' + '.O.' + 'O..')
  assert.equal(bestMove(board, 'X'), 2)

  // Vertical win available at index 6 for O.
  const board2 = b('OX.' + 'OX.' + '...')
  assert.equal(bestMove(board2, 'O'), 6)
})

test('bestMove blocks the opponent immediate win', () => {
  // O O .   It's X's turn. O threatens to win at index 2, so X must block there.
  // . X .
  // . . .
  const board = b('OO.' + '.X.' + '...')
  assert.equal(bestMove(board, 'X'), 2)

  // X threatens a diagonal win (0,4,8); O to move must block at index 8.
  const board2 = b('X..' + '.X.' + 'O..')
  assert.equal(bestMove(board2, 'O'), 8)
})

test('bestMove prefers winning over merely blocking', () => {
  // X to move. X can win immediately at index 2 (top row). O also threatens
  // bottom row (6,7 filled, 8 open) but winning beats blocking.
  // X X .
  // . . .
  // O O .
  const board = b('XX.' + '...' + 'OO.')
  assert.equal(bestMove(board, 'X'), 2)
})

test('a deterministic rng selects among equally-optimal moves predictably', () => {
  // Empty board: the optimal first-move set for X includes multiple cells. With rng()=0 we should
  // always get the first candidate in ascending order; this proves rng injection works.
  const board = [_, _, _, _, _, _, _, _, _]
  const move = bestMove(board, 'X', () => 0)
  assert.ok(move >= 0 && move <= 8)
  assert.equal(board.every((c) => c === null), true, 'bestMove must not mutate the board')
})

test('minimax from empty never loses: AI vs AI always draws', () => {
  // Two perfect players from the empty board must always draw. Run several deterministic rng seeds
  // so different optimal-move tie-breaks are exercised; none may produce a winner.
  const seeds = [0, 0.17, 0.33, 0.5, 0.66, 0.83, 0.999]
  for (const seed of seeds) {
    const board = [_, _, _, _, _, _, _, _, _]
    let toMove = 'X'
    let guard = 0
    while (winner(board) === null) {
      const move = bestMove(board, toMove, () => seed)
      assert.ok(move >= 0, 'AI must always find a move while in progress')
      board[move] = toMove
      toMove = opponent(toMove)
      assert.ok(++guard <= 9, 'a 3x3 game cannot exceed 9 plies')
    }
    assert.equal(winner(board), 'draw', `perfect play (seed ${seed}) must end in a draw`)
  }
})

test('AI never loses regardless of how the human plays (exhaustive vs optimal AI)', () => {
  // The human (X) plays EVERY possible sequence of legal moves; the AI (O) always responds with
  // bestMove. The AI must never lose under any human line of play.
  function play(board, toMove) {
    const result = winner(board)
    if (result !== null) {
      assert.notEqual(result, 'X', 'the optimal AI (O) must never lose to the human (X)')
      return
    }
    if (toMove === 'O') {
      const move = bestMove(board, 'O', () => 0)
      board[move] = 'O'
      play(board, 'X')
      board[move] = null
      return
    }
    for (const i of emptyCells(board)) {
      board[i] = 'X'
      play(board, 'O')
      board[i] = null
    }
  }
  play([_, _, _, _, _, _, _, _, _], 'X')
})
