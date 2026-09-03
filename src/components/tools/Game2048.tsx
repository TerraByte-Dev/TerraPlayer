import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { ToolProps } from './types'
import { ToolButton } from './shared'
import {
  newGame, move, spawnRandom, hasWon, isGameOver, maxTile,
  type Board, type Direction,
} from '@/lib/tools/game2048'

const BEST_KEY = 'terraplayer.2048.best'

// Tile palette — game CONTENT colors (per the contract, literal hex is allowed for game tiles). Classic
// 2048 ramp: warm beiges climbing to hot oranges, then a "graduate" indigo for the very large tiles.
const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  0:    { bg: 'rgba(238,228,218,0.18)', fg: 'transparent' },
  2:    { bg: '#eee4da', fg: '#776e65' },
  4:    { bg: '#ede0c8', fg: '#776e65' },
  8:    { bg: '#f2b179', fg: '#f9f6f2' },
  16:   { bg: '#f59563', fg: '#f9f6f2' },
  32:   { bg: '#f67c5f', fg: '#f9f6f2' },
  64:   { bg: '#f65e3b', fg: '#f9f6f2' },
  128:  { bg: '#edcf72', fg: '#f9f6f2' },
  256:  { bg: '#edcc61', fg: '#f9f6f2' },
  512:  { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' },
}
const SUPER_TILE = { bg: '#3c3a32', fg: '#f9f6f2' } // 4096+

function tileColors(v: number) {
  return TILE_COLORS[v] ?? SUPER_TILE
}

// Scale the displayed font down as the digit count grows so big numbers still fit a square cell.
function tileFontScale(v: number): number {
  if (v >= 1024) return 0.5
  if (v >= 128) return 0.62
  return 0.78
}

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
}

function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export default function Game2048({ fullscreen, active = true }: ToolProps) {
  const [board, setBoard] = useState<Board>(() => newGame())
  const [score, setScore] = useState(0)
  const [best, setBest] = useState<number>(loadBest)
  const [won, setWon] = useState(false)
  const [keepGoing, setKeepGoing] = useState(false) // dismiss the win overlay and keep playing
  const [over, setOver] = useState(false)

  // Refs mirror the latest state so the (once-installed) key listener never reads stale closures.
  const boardRef = useRef(board)
  const scoreRef = useRef(score)
  const wonRef = useRef(won)
  const keepGoingRef = useRef(keepGoing)
  const overRef = useRef(over)
  boardRef.current = board
  scoreRef.current = score
  wonRef.current = won
  keepGoingRef.current = keepGoing
  overRef.current = over

  const persistBest = useCallback((value: number) => {
    setBest((prevBest) => {
      if (value <= prevBest) return prevBest
      try { localStorage.setItem(BEST_KEY, String(value)) } catch { /* storage may be unavailable */ }
      return value
    })
  }, [])

  const startNew = useCallback(() => {
    setBoard(newGame())
    setScore(0)
    setWon(false)
    setKeepGoing(false)
    setOver(false)
  }, [])

  const applyMove = useCallback((dir: Direction) => {
    if (overRef.current) return
    if (wonRef.current && !keepGoingRef.current) return // win overlay is blocking input
    const result = move(boardRef.current, dir)
    if (!result.moved) return
    const next = spawnRandom(result.board)
    const newScore = scoreRef.current + result.gained
    setBoard(next)
    setScore(newScore)
    persistBest(newScore)
    if (!wonRef.current && hasWon(next)) setWon(true)
    if (isGameOver(next)) setOver(true)
  }, [persistBest])

  // Keyboard: arrows + WASD. Installed once; reads live state through refs. Ignored while typing in inputs.
  useEffect(() => {
    if (!active) return // the arcade cabinet is unfocused — don't bind at all
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return // Ctrl+W is close-window, not "up"
      const dir = KEY_TO_DIR[e.key.length === 1 ? e.key.toLowerCase() : e.key]
      if (!dir) return
      e.preventDefault()
      applyMove(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyMove, active])

  const highest = useMemo(() => maxTile(board), [board])

  // Sizing: the board is a square that scales with the available space. Fullscreen gets a bigger cap.
  // Fullscreen means the whole display now, not a 920px Shell — scale to the viewport.
  const boardMax = fullscreen ? Math.min(880, Math.round(window.innerHeight * 0.72)) : 420
  const gapPx = fullscreen ? 12 : 10

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: score + best + new game */}
      <div
        className="flex flex-shrink-0 flex-wrap items-center gap-3 px-3 py-2.5"
        style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
      >
        <div className="font-term text-[15px] tracking-[0.12em]" style={{ color: 'var(--accent)' }}>
          2048
        </div>
        <div className="flex-1" />
        <ScorePanel label="Score" value={score} />
        <ScorePanel label="Best" value={best} accent2 />
        <ToolButton primary onClick={startNew} title="New game">
          <RotateCcw size={13} />New
        </ToolButton>
      </div>

      {/* Board area */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
        <div
          className="relative w-full"
          style={{ maxWidth: boardMax, aspectRatio: '1 / 1' }}
        >
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateColumns: 'repeat(4, 1fr)',
              gridTemplateRows: 'repeat(4, 1fr)',
              gap: gapPx,
              padding: gapPx,
              background: 'rgb(var(--accent-rgb) / 0.06)',
              border: '1px solid rgb(var(--accent-rgb) / 0.20)',
            }}
          >
            {board.map((value, i) => {
              const { bg, fg } = tileColors(value)
              return (
                <div
                  key={i}
                  className="flex items-center justify-center select-none"
                  style={{
                    background: bg,
                    color: fg,
                    borderRadius: 2,
                  }}
                >
                  <span
                    className="font-lcd tabular-nums leading-none"
                    style={{
                      fontSize: `calc((${boardMax}px / 4) * ${tileFontScale(value)})`,
                      visibility: value === 0 ? 'hidden' : 'visible',
                    }}
                  >
                    {value || ''}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Win overlay (only when not yet dismissed by "Keep going") */}
          {won && !keepGoing && (
            <Overlay>
              <div className="font-lcd phosphor-glow text-[42px] leading-none" style={{ color: 'var(--accent)' }}>
                2048
              </div>
              <p className="font-term text-[14px]" style={{ color: 'var(--ink)' }}>
                You reached the {highest} tile.
              </p>
              <div className="flex gap-2">
                <ToolButton primary onClick={() => setKeepGoing(true)}>Keep going</ToolButton>
                <ToolButton onClick={startNew}>New game</ToolButton>
              </div>
            </Overlay>
          )}

          {/* Game-over overlay */}
          {over && (
            <Overlay>
              <div className="font-lcd phosphor-glow text-[36px] leading-none" style={{ color: 'var(--accent)' }}>
                GAME OVER
              </div>
              <p className="font-term text-[14px]" style={{ color: 'var(--ink)' }}>
                Score {score} &middot; best tile {highest}
              </p>
              <ToolButton primary onClick={startNew}>
                <RotateCcw size={13} />New game
              </ToolButton>
            </Overlay>
          )}
        </div>
      </div>

      {/* Hint */}
      <div
        className="flex-shrink-0 px-3 py-2 text-center font-mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'rgb(var(--ink-rgb) / 0.4)', borderTop: '1px solid rgb(var(--accent-rgb) / 0.08)' }}
      >
        Arrow keys or WASD to slide &middot; merge matching tiles
      </div>
    </div>
  )
}

function ScorePanel({ label, value, accent2 }: { label: string; value: number; accent2?: boolean }) {
  return (
    <div
      className="flex min-w-[78px] flex-col items-center px-3 py-1"
      style={{ background: 'rgb(var(--accent-rgb) / 0.06)', border: '1px solid rgb(var(--accent-rgb) / 0.15)' }}
    >
      <span className="font-mono text-[8px] uppercase tracking-[0.18em]" style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
        {label}
      </span>
      <span
        className="font-lcd tabular-nums text-[20px] leading-none"
        style={{ color: accent2 ? 'var(--accent2)' : 'var(--accent)' }}
      >
        {value}
      </span>
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center"
      style={{ background: 'rgba(0, 0, 0, 0.82)', backdropFilter: 'blur(2px)' }}
    >
      {children}
    </div>
  )
}
