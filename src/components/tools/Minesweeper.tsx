import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bomb, Flag, RotateCcw } from 'lucide-react'
import type { ToolProps } from './types'
import { SegmentedButton, Readout } from './shared'
import {
  newBoard,
  reveal as revealCell,
  toggleFlag as toggleCell,
  isWon,
  countFlags,
  countMines,
  type Board,
  type Coord,
} from '@/lib/tools/minesweeper'

type Difficulty = 'beginner' | 'intermediate'
type Status = 'idle' | 'playing' | 'won' | 'lost'

interface Preset {
  label: string
  rows: number
  cols: number
  mines: number
}

const PRESETS: Record<Difficulty, Preset> = {
  beginner: { label: 'Beginner', rows: 9, cols: 9, mines: 10 },
  intermediate: { label: 'Intermediate', rows: 16, cols: 16, mines: 40 },
}

const BEST_KEY = 'terraplayer.minesweeper.best'

// Classic Minesweeper number palette. These are CONTENT colors (the numbers themselves),
// not chrome, so literal hex is allowed by the contract.
const NUMBER_COLORS: Record<number, string> = {
  1: '#4aa3ff',
  2: '#3fbf6f',
  3: '#ff5c5c',
  4: '#b07cff',
  5: '#ff9d3f',
  6: '#3fd6d6',
  7: '#d6d6d6',
  8: '#9aa0a6',
}

function loadBest(): Partial<Record<Difficulty, number>> {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function formatTime(secs: number): string {
  const s = Math.min(999, Math.max(0, Math.floor(secs)))
  return s.toString().padStart(3, '0')
}

export default function Minesweeper({ fullscreen, active = true }: ToolProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner')
  const preset = PRESETS[difficulty]

  const [board, setBoard] = useState<Board>(() => newBoard(preset.rows, preset.cols, preset.mines))
  const [status, setStatus] = useState<Status>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [best, setBest] = useState<Partial<Record<Difficulty, number>>>(() => loadBest())

  const timerRef = useRef<number | null>(null)
  // `status` mirror so the interval callback (set once) reads the live value without re-arming.
  const statusRef = useRef<Status>('idle')
  statusRef.current = status

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Start a fresh game for the given difficulty.
  const resetGame = useCallback((diff: Difficulty) => {
    const p = PRESETS[diff]
    clearTimer()
    setDifficulty(diff)
    setBoard(newBoard(p.rows, p.cols, p.mines))
    setStatus('idle')
    setElapsed(0)
  }, [clearTimer])

  // Clean up the timer on unmount (memory discipline).
  useEffect(() => () => clearTimer(), [clearTimer])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = window.setInterval(() => {
      setElapsed((e) => Math.min(999, e + 1))
    }, 1000)
  }, [clearTimer])

  const minesTotal = countMines(board)
  const remaining = minesTotal - countFlags(board)

  const handleReveal = useCallback((r: number, c: number) => {
    if (statusRef.current === 'won' || statusRef.current === 'lost') return
    setBoard((prev) => {
      const cell = prev[r][c]
      if (cell.revealed || cell.flagged) return prev

      // First reveal: rebuild the board so this cell (and ideally its neighbours) are safe,
      // then reveal. This guarantees a non-losing, flood-friendly first click.
      let working = prev
      if (statusRef.current === 'idle') {
        const safe: Coord = { r, c }
        working = newBoard(preset.rows, preset.cols, preset.mines, Math.random, safe)
        setStatus('playing')
        startTimer()
      }

      const next = revealCell(working, r, c)

      if (next[r][c].mine) {
        // Loss: expose all mines for the post-mortem view.
        clearTimer()
        setStatus('lost')
        return next.map((row) =>
          row.map((cl) => (cl.mine ? { ...cl, revealed: true } : cl)),
        )
      }

      if (isWon(next)) {
        clearTimer()
        setStatus('won')
        // Record best time for this difficulty.
        setElapsed((finalSecs) => {
          setBest((prevBest) => {
            const current = prevBest[difficulty]
            if (current === undefined || finalSecs < current) {
              const updated = { ...prevBest, [difficulty]: finalSecs }
              try { localStorage.setItem(BEST_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
              return updated
            }
            return prevBest
          })
          return finalSecs
        })
      }

      return next
    })
  }, [preset.rows, preset.cols, preset.mines, difficulty, startTimer, clearTimer])

  const handleFlag = useCallback((r: number, c: number) => {
    if (statusRef.current === 'won' || statusRef.current === 'lost') return
    setBoard((prev) => {
      if (prev[r][c].revealed) return prev
      // Flagging before the first reveal still arms the game/timer.
      if (statusRef.current === 'idle') {
        setStatus('playing')
        startTimer()
      }
      return toggleCell(prev, r, c)
    })
  }, [startTimer])

  // Keyboard: R resets, 1/2 switch difficulty. Guard against firing while typing.
  useEffect(() => {
    if (!active) return // the arcade cabinet is unfocused — don't bind at all
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'r') { e.preventDefault(); resetGame(difficulty) }
      else if (k === '1') { e.preventDefault(); resetGame('beginner') }
      else if (k === '2') { e.preventDefault(); resetGame('intermediate') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [difficulty, resetGame, active])

  // Cell sizing: scale up in fullscreen, and shrink for the larger Intermediate grid so it fits.
  const cellSize = fullscreen
    ? (difficulty === 'beginner' ? 46 : 34)
    : (difficulty === 'beginner' ? 34 : 26)
  const fontPx = Math.round(cellSize * 0.52)

  const bestTime = best[difficulty]
  const faceLabel = status === 'lost' ? 'lost' : status === 'won' ? 'cleared' : 'mines left'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar: difficulty + reset */}
      <div
        className="flex flex-shrink-0 flex-wrap items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
      >
        <SegmentedButton active={difficulty === 'beginner'} onClick={() => resetGame('beginner')} title="Beginner 9x9 / 10 mines (1)">
          Beginner
        </SegmentedButton>
        <SegmentedButton active={difficulty === 'intermediate'} onClick={() => resetGame('intermediate')} title="Intermediate 16x16 / 40 mines (2)">
          Intermediate
        </SegmentedButton>

        <div className="flex-1" />

        {bestTime !== undefined && (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'rgb(var(--accent2-rgb) / 0.7)' }}>
            Best {formatTime(bestTime)}
          </span>
        )}
        <button
          onClick={() => resetGame(difficulty)}
          className="metal-key is-primary gap-1.5 px-3 py-1.5 font-term text-[12px]"
          title="Reset (R)"
        >
          <RotateCcw size={12} />Reset
        </button>
      </div>

      {/* Status readouts: mines remaining + timer */}
      <div className="flex flex-shrink-0 items-end justify-center gap-10 px-3 pt-3">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <Bomb size={fullscreen ? 18 : 14} style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }} />
            <Readout fullscreen={fullscreen}>{(remaining < 0 ? '-' : '') + Math.abs(remaining).toString().padStart(2, '0')}</Readout>
          </div>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: 'rgb(var(--accent2-rgb) / 0.6)' }}>
            {faceLabel}
          </p>
        </div>
        <div className="text-center">
          <Readout fullscreen={fullscreen}>{formatTime(elapsed)}</Readout>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: 'rgb(var(--accent2-rgb) / 0.6)' }}>
            time
          </p>
        </div>
      </div>

      {/* Win / lose banner */}
      <div className="flex h-6 flex-shrink-0 items-center justify-center">
        {status === 'won' && (
          <span className="font-term text-[15px] phosphor-glow" style={{ color: 'var(--accent)' }}>
            FIELD CLEARED
          </span>
        )}
        {status === 'lost' && (
          <span className="font-term text-[15px]" style={{ color: '#FF4D4D' }}>
            BOOM — game over
          </span>
        )}
      </div>

      {/* Board */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        <div
          role="grid"
          className="grid select-none"
          style={{
            gridTemplateColumns: `repeat(${preset.cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${preset.rows}, ${cellSize}px)`,
            gap: 2,
            padding: 6,
            background: 'var(--bg-1)',
            border: '1px solid rgb(var(--accent-rgb) / 0.20)',
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const key = `${r}-${c}`
              const showNumber = cell.revealed && !cell.mine && cell.adj > 0
              const showMine = cell.revealed && cell.mine

              // Cell chrome is themed; the dug surface reads slightly darker (void), the
              // un-dug surface reads as a raised panel (accent tint).
              const baseStyle: React.CSSProperties = cell.revealed
                ? {
                    background: 'rgb(var(--bg-0) / 1)',
                    border: '1px solid rgb(var(--accent-rgb) / 0.08)',
                  }
                : {
                    background: 'rgb(var(--accent-rgb) / 0.08)',
                    border: '1px solid rgb(var(--accent-rgb) / 0.18)',
                    boxShadow: 'inset 0 0 0 1px rgb(var(--accent-rgb) / 0.05)',
                  }

              return (
                <button
                  key={key}
                  role="gridcell"
                  aria-label={`row ${r + 1} column ${c + 1}`}
                  disabled={status === 'won' || status === 'lost'}
                  onClick={() => handleReveal(r, c)}
                  onContextMenu={(e) => { e.preventDefault(); handleFlag(r, c) }}
                  className="flex items-center justify-center font-lcd leading-none transition-colors"
                  style={{
                    ...baseStyle,
                    width: cellSize,
                    height: cellSize,
                    fontSize: fontPx,
                    cursor: status === 'won' || status === 'lost' ? 'default' : 'pointer',
                    padding: 0,
                    borderRadius: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!cell.revealed && status !== 'won' && status !== 'lost') {
                      e.currentTarget.style.background = 'rgb(var(--accent-rgb) / 0.16)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!cell.revealed && status !== 'won' && status !== 'lost') {
                      e.currentTarget.style.background = 'rgb(var(--accent-rgb) / 0.08)'
                    }
                  }}
                >
                  {showMine ? (
                    <Bomb
                      size={Math.round(cellSize * 0.6)}
                      style={{ color: status === 'lost' ? '#FF4D4D' : 'var(--ink)' }}
                    />
                  ) : cell.flagged && !cell.revealed ? (
                    <Flag size={Math.round(cellSize * 0.52)} style={{ color: 'var(--accent2)' }} />
                  ) : showNumber ? (
                    <span style={{ color: NUMBER_COLORS[cell.adj] ?? 'var(--ink)' }}>{cell.adj}</span>
                  ) : null}
                </button>
              )
            }),
          )}
        </div>
      </div>

      <p className="flex-shrink-0 pb-2 text-center font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: 'rgb(var(--ink-rgb) / 0.32)' }}>
        Left-click reveal · Right-click flag · R reset
      </p>
    </div>
  )
}
