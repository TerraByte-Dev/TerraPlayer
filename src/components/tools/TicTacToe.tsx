import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { ToolProps } from './types'
import { ToolButton } from './shared'
import {
  bestMove,
  emptyCells,
  winner,
  winningLine,
  type Board,
  type Player,
} from '@/lib/tools/tictactoe'

const SCORE_KEY = 'terraplayer.tictactoe.score'

type Tally = { X: number; O: number; draws: number }
const EMPTY_BOARD: Board = [null, null, null, null, null, null, null, null, null]

// The human is always X; the AI is always O. `humanStarts` toggles who plays first — when false the AI
// (O) opens, so we let it take the first move after a fresh round.
function loadTally(): Tally {
  try {
    const raw = localStorage.getItem(SCORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Tally>
      return {
        X: Number.isFinite(parsed.X) ? Number(parsed.X) : 0,
        O: Number.isFinite(parsed.O) ? Number(parsed.O) : 0,
        draws: Number.isFinite(parsed.draws) ? Number(parsed.draws) : 0,
      }
    }
  } catch {
    /* corrupt/unavailable storage — fall through to a fresh tally */
  }
  return { X: 0, O: 0, draws: 0 }
}

export default function TicTacToe({ fullscreen, active = true }: ToolProps) {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD.slice())
  const [humanStarts, setHumanStarts] = useState(true)
  const [tally, setTally] = useState<Tally>(loadTally)

  const result = winner(board)
  const line = result === 'X' || result === 'O' ? winningLine(board) : null
  const lineSet = line ? new Set<number>(line) : null
  const gameOver = result !== null

  // It's the human's turn when the game is live and the number of empty cells matches the side that
  // moves on this parity. Human = X. If the human starts, X moves on even-count boards; otherwise odd.
  const xCount = board.filter((c) => c === 'X').length
  const oCount = board.filter((c) => c === 'O').length
  const turn: Player = xCount === oCount ? (humanStarts ? 'X' : 'O') : (xCount > oCount ? 'O' : 'X')
  const humanTurn = !gameOver && turn === 'X'

  // Tally persistence + recording. Use a ref to avoid double-counting under StrictMode re-renders:
  // a given board result is only ever recorded once.
  const recordedRef = useRef<Board | null>(null)
  useEffect(() => {
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(tally)) } catch { /* storage unavailable */ }
  }, [tally])

  useEffect(() => {
    if (!gameOver) { recordedRef.current = null; return }
    if (recordedRef.current === board) return
    recordedRef.current = board
    setTally((t) => {
      if (result === 'X') return { ...t, X: t.X + 1 }
      if (result === 'O') return { ...t, O: t.O + 1 }
      return { ...t, draws: t.draws + 1 }
    })
  }, [gameOver, result, board])

  // AI move: whenever it's O's turn and the game is live, reply with the optimal move after a short
  // beat so the human sees their move land first. The timeout is cleared on unmount / dependency change.
  useEffect(() => {
    if (gameOver || turn !== 'O') return
    const handle = window.setTimeout(() => {
      setBoard((prev) => {
        if (winner(prev) !== null) return prev
        const move = bestMove(prev, 'O')
        if (move < 0) return prev
        const next = prev.slice()
        next[move] = 'O'
        return next
      })
    }, 320)
    return () => window.clearTimeout(handle)
  }, [gameOver, turn])

  const play = useCallback((i: number) => {
    if (gameOver) return
    setBoard((prev) => {
      // Only accept the move if it's a human (X) turn and the cell is empty.
      if (prev[i] !== null || winner(prev) !== null) return prev
      const px = prev.filter((c) => c === 'X').length
      const po = prev.filter((c) => c === 'O').length
      const toMove: Player = px === po ? (humanStarts ? 'X' : 'O') : (px > po ? 'O' : 'X')
      if (toMove !== 'X') return prev
      const next = prev.slice()
      next[i] = 'X'
      return next
    })
  }, [gameOver, humanStarts])

  const newRound = useCallback((starts = humanStarts) => {
    recordedRef.current = null
    setHumanStarts(starts)
    setBoard(EMPTY_BOARD.slice())
  }, [humanStarts])

  const resetScore = useCallback(() => {
    setTally({ X: 0, O: 0, draws: 0 })
    recordedRef.current = null
    setBoard(EMPTY_BOARD.slice())
  }, [])

  // Keyboard: 1-9 (numpad-style top-left to bottom-right) place a mark; N starts a new round.
  // Guard against firing while focused in an input/textarea (none here, but house rule).
  useEffect(() => {
    if (!active) return // the arcade cabinet is unfocused — don't bind at all
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey || e.metaKey || e.altKey) return // Ctrl+N is not "new round"
      if (e.key.toLowerCase() === 'n') { newRound(); return }
      const n = Number(e.key)
      if (n >= 1 && n <= 9 && humanTurn) { e.preventDefault(); play(n - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play, newRound, humanTurn, active])

  const statusText = result === 'X' ? 'You win'
    : result === 'O' ? 'AI wins'
    : result === 'draw' ? 'Draw'
    : humanTurn ? 'Your move (X)'
    : 'AI thinking…'

  const cellSize = fullscreen ? 'text-[120px]' : 'text-[64px]'
  const boardMax = fullscreen ? 'max-w-[min(720px,68vh)]' : 'max-w-[380px]'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Score tally */}
      <div
        className="flex flex-shrink-0 items-center justify-center gap-6 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em]"
        style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)', color: 'rgb(var(--ink-rgb) / 0.45)' }}
      >
        <ScorePill label="You (X)" value={tally.X} accent />
        <ScorePill label="Draws" value={tally.draws} />
        <ScorePill label="AI (O)" value={tally.O} />
      </div>

      {/* Centered board + status */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-4 py-5">
        <div
          className="font-term tracking-[0.08em] phosphor-glow"
          style={{
            color: result === 'O' ? 'var(--accent2)' : 'var(--accent)',
            fontSize: fullscreen ? 22 : 16,
            minHeight: fullscreen ? 30 : 22,
          }}
        >
          {statusText}
        </div>

        <div
          className={`grid aspect-square w-full ${boardMax} grid-cols-3 gap-2`}
          style={{ background: 'rgb(var(--accent-rgb) / 0.18)', padding: 8 }}
        >
          {board.map((cell, i) => {
            const inWin = lineSet?.has(i) ?? false
            const clickable = humanTurn && cell === null
            const markColor = cell === 'O' ? 'var(--accent2)' : 'var(--accent)'
            return (
              <button
                key={i}
                onClick={() => play(i)}
                disabled={!clickable}
                aria-label={`Cell ${i + 1}${cell ? `, ${cell}` : ', empty'}`}
                className={`relative flex items-center justify-center font-lcd leading-none transition-colors ${cellSize} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
                style={{
                  background: inWin ? 'rgb(var(--accent-rgb) / 0.16)' : 'var(--bg-0)',
                  border: `1px solid ${inWin ? 'rgb(var(--accent-rgb) / 0.55)' : 'rgb(var(--accent-rgb) / 0.15)'}`,
                  color: markColor,
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = 'rgb(var(--accent-rgb) / 0.07)' }}
                onMouseLeave={(e) => { if (clickable) e.currentTarget.style.background = inWin ? 'rgb(var(--accent-rgb) / 0.16)' : 'var(--bg-0)' }}
              >
                <span className={cell || inWin ? 'phosphor-glow' : ''} style={{ opacity: cell ? 1 : 0 }}>
                  {cell ?? ''}
                </span>
              </button>
            )
          })}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <ToolButton primary onClick={() => newRound()} title="New round (N)">
            <RotateCcw size={13} /> New round
          </ToolButton>
          <button
            onClick={() => newRound(!humanStarts)}
            title="Toggle who plays first"
            className="metal-key gap-1.5 px-4 py-2 font-term text-[13px]"
          >
            First: {humanStarts ? 'You (X)' : 'AI (O)'}
          </button>
          <button
            onClick={resetScore}
            title="Reset the running tally"
            className="metal-key gap-1.5 px-4 py-2 font-term text-[13px]"
          >
            <Trash2 size={12} /> Reset score
          </button>
        </div>

        <p className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: 'rgb(var(--ink-rgb) / 0.35)' }}>
          You are X · keys 1-9 to place · N for new round · {emptyCells(board).length} open
        </p>
      </div>
    </div>
  )
}

function ScorePill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <span
        className="font-lcd text-[18px] leading-none phosphor-glow"
        style={{ color: accent ? 'var(--accent)' : 'var(--accent2)' }}
      >
        {value}
      </span>
    </div>
  )
}
