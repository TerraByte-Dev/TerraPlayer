import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import type { ToolProps } from './types'
import { ToolButton } from './shared'
import { newGame, step, turn, type Dir, type GameState } from '@/lib/tools/snake'

// Grid + timing. Content colors (snake/food/grid) follow the theme at draw time via getComputedStyle, so
// the canvas recolors with the active phosphor theme.
const GRID_W = 24
const GRID_H = 20
const BASE_MS = 110 // ~9 cells/sec at the start
const MIN_MS = 55 // floor as the snake speeds up
const SPEEDUP_PER_FOOD = 3 // shave a few ms off the tick per food eaten
const BEST_KEY = 'terraplayer.snake.best'

function loadBest(): number {
  try {
    const raw = window.localStorage.getItem(BEST_KEY)
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function tickMs(score: number): number {
  return Math.max(MIN_MS, BASE_MS - score * SPEEDUP_PER_FOOD)
}

const KEY_TO_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
}

export default function Snake({ fullscreen, active = true }: ToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // The authoritative game lives in a ref so the loop reads the latest value without re-subscribing.
  const gameRef = useRef<GameState>(newGame(GRID_W, GRID_H))
  // Pending direction change requested since the last committed step (lets us debounce double-taps so two
  // quick presses can't flip 180° within a single tick).
  const pendingDirRef = useRef<Dir | null>(null)

  const loopRef = useRef<number | null>(null)
  const runningRef = useRef(false)

  const [score, setScore] = useState(0)
  const [best, setBest] = useState<number>(() => loadBest())
  const [dead, setDead] = useState(false)
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(false)

  // Draw the current game onto the canvas, sized to its backing-store resolution.
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const root = getComputedStyle(document.documentElement)
    const accent = root.getPropertyValue('--accent').trim() || '#7CFFB2'
    const accent2 = root.getPropertyValue('--accent2').trim() || '#FFD27C'
    const inkRgb = root.getPropertyValue('--ink-rgb').trim() || '230 255 230'
    const bg0 = root.getPropertyValue('--bg-0').trim() || '#05080a'

    const cw = canvas.width
    const ch = canvas.height
    const cell = Math.min(cw / GRID_W, ch / GRID_H)
    const boardW = cell * GRID_W
    const boardH = cell * GRID_H
    const offX = (cw - boardW) / 2
    const offY = (ch - boardH) / 2

    // Void background.
    ctx.fillStyle = bg0
    ctx.fillRect(0, 0, cw, ch)

    // Faint grid lines.
    ctx.strokeStyle = `rgb(${inkRgb} / 0.06)`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= GRID_W; x++) {
      ctx.moveTo(Math.round(offX + x * cell) + 0.5, offY)
      ctx.lineTo(Math.round(offX + x * cell) + 0.5, offY + boardH)
    }
    for (let y = 0; y <= GRID_H; y++) {
      ctx.moveTo(offX, Math.round(offY + y * cell) + 0.5)
      ctx.lineTo(offX + boardW, Math.round(offY + y * cell) + 0.5)
    }
    ctx.stroke()

    const game = gameRef.current
    const pad = Math.max(1, cell * 0.08)

    // Food — a glowing accent2 pip.
    ctx.save()
    ctx.shadowColor = accent2
    ctx.shadowBlur = cell * 0.6
    ctx.fillStyle = accent2
    const fx = offX + game.food.x * cell
    const fy = offY + game.food.y * cell
    ctx.beginPath()
    ctx.arc(fx + cell / 2, fy + cell / 2, cell / 2 - pad, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Snake — accent, head a touch brighter, with a soft phosphor glow.
    ctx.save()
    ctx.shadowColor = accent
    ctx.shadowBlur = cell * 0.4
    for (let i = game.snake.length - 1; i >= 0; i--) {
      const seg = game.snake[i]
      ctx.fillStyle = accent
      ctx.globalAlpha = i === 0 ? 1 : 0.82
      const sx = offX + seg.x * cell
      const sy = offY + seg.y * cell
      ctx.fillRect(sx + pad, sy + pad, cell - pad * 2, cell - pad * 2)
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }, [])

  // Size the canvas backing store to its container (device-pixel sharp) and redraw.
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    draw()
  }, [draw])

  // One game tick: apply the queued turn, advance, sync React state, handle death + best.
  const advance = useCallback(() => {
    let g = gameRef.current
    const pending = pendingDirRef.current
    if (pending) {
      g = turn(g, pending)
      pendingDirRef.current = null
    }
    const nextState = step(g, GRID_W, GRID_H)
    gameRef.current = nextState
    draw()

    if (nextState.score !== score) setScore(nextState.score)

    if (nextState.dead && !dead) {
      setDead(true)
      runningRef.current = false
      if (loopRef.current) {
        window.clearTimeout(loopRef.current)
        loopRef.current = null
      }
      if (nextState.score > best) {
        setBest(nextState.score)
        try {
          window.localStorage.setItem(BEST_KEY, String(nextState.score))
        } catch {
          /* localStorage may be unavailable; best stays in-memory */
        }
      }
    }
  }, [draw, score, dead, best])

  // Keep a stable ref to `advance` so the self-rescheduling loop never reads a stale closure.
  const advanceRef = useRef(advance)
  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  // (Re)start the loop. A recursive setTimeout recomputes the cadence from the live score EVERY tick, so the
  // snake keeps accelerating with each food eaten (a fixed re-armed interval would only speed up once).
  const startLoop = useCallback(() => {
    if (loopRef.current) {
      window.clearTimeout(loopRef.current)
      loopRef.current = null
    }
    runningRef.current = true
    const tick = () => {
      advanceRef.current()
      if (runningRef.current && !gameRef.current.dead) {
        loopRef.current = window.setTimeout(tick, tickMs(gameRef.current.score))
      }
    }
    loopRef.current = window.setTimeout(tick, tickMs(gameRef.current.score))
  }, [])

  const stopLoop = useCallback(() => {
    runningRef.current = false
    if (loopRef.current) {
      window.clearTimeout(loopRef.current)
      loopRef.current = null
    }
  }, [])

  const restart = useCallback(() => {
    stopLoop()
    gameRef.current = newGame(GRID_W, GRID_H)
    pendingDirRef.current = null
    setScore(0)
    setDead(false)
    setPaused(false)
    setStarted(false)
    draw()
  }, [stopLoop, draw])

  const beginIfNeeded = useCallback(() => {
    if (gameRef.current.dead) return
    if (!started) {
      setStarted(true)
      setPaused(false)
      startLoop()
    }
  }, [started, startLoop])

  const togglePause = useCallback(() => {
    if (gameRef.current.dead) return
    if (!started) {
      beginIfNeeded()
      return
    }
    if (runningRef.current) {
      stopLoop()
      setPaused(true)
    } else {
      setPaused(false)
      startLoop()
    }
  }, [started, beginIfNeeded, stopLoop, startLoop])

  // The cabinet floats over an app you can still use, so clicking away must not cost a run.
  // Pause through the same path Space takes: `runningRef` is read during render, so stopping the
  // loop without setting `paused` would leave the button reading PAUSE while nothing ticks.
  // Resuming is deliberate — never restart a real-time game under the user's hands.
  useEffect(() => {
    if (active || !runningRef.current) return
    stopLoop()
    setPaused(true)
  }, [active, stopLoop])

  // Resize observer + initial draw.
  useEffect(() => {
    resize()
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [resize])

  // Keyboard: turning (arrows + WASD), Space to pause/resume, R to restart. Guarded against firing while
  // typing in an input/textarea. CRITICAL: listener is removed on unmount.
  useEffect(() => {
    if (!active) return // the arcade cabinet is unfocused — don't bind at all
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      // A focused button owns Space and Enter. Swallowing them here means the arcade's own
      // transport and cartridge buttons stop responding once you've clicked one.
      if (tag === 'BUTTON' && (e.key === ' ' || e.code === 'Space' || e.key === 'Enter')) return
      if (e.ctrlKey || e.metaKey || e.altKey) return // Ctrl+R is reload, not restart

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        togglePause()
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        restart()
        return
      }
      const dir = KEY_TO_DIR[e.key]
      if (dir) {
        e.preventDefault()
        if (gameRef.current.dead) return
        // Validate the requested turn against the LATEST committed direction (so a queued turn can't be
        // chained into a 180° flip within one tick).
        const valid = turn(gameRef.current, dir)
        if (valid.dir === dir) pendingDirRef.current = dir
        beginIfNeeded()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause, restart, beginIfNeeded, active])

  // Final safety net: tear the loop down on unmount no matter what (memory discipline).
  useEffect(() => {
    return () => {
      runningRef.current = false
      if (loopRef.current) {
        window.clearTimeout(loopRef.current)
        loopRef.current = null
      }
    }
  }, [])

  const statLabel = 'font-mono text-[9px] uppercase tracking-[0.14em]'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Status bar: score + best. */}
      <div
        className="flex flex-shrink-0 items-end justify-between px-4 py-2"
        style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
      >
        <div>
          <div className={statLabel} style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
            Score
          </div>
          <div
            className={`${fullscreen ? 'text-[44px]' : 'text-[30px]'} font-lcd tabular-nums phosphor-glow leading-none`}
            style={{ color: 'var(--accent)' }}
          >
            {String(score).padStart(3, '0')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ToolButton
            onClick={togglePause}
            disabled={dead}
            title={runningRef.current ? 'Pause (Space)' : 'Play (Space)'}
          >
            {runningRef.current ? <Pause size={13} /> : <Play size={13} />}
            {runningRef.current ? 'Pause' : started && paused ? 'Resume' : 'Play'}
          </ToolButton>
          <ToolButton onClick={restart} title="Restart (R)">
            <RotateCcw size={13} />
            Restart
          </ToolButton>
        </div>
        <div className="text-right">
          <div className={statLabel} style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
            Best
          </div>
          <div
            className={`${fullscreen ? 'text-[44px]' : 'text-[30px]'} font-lcd tabular-nums leading-none`}
            style={{ color: 'rgb(var(--accent2-rgb) / 0.85)' }}
          >
            {String(best).padStart(3, '0')}
          </div>
        </div>
      </div>

      {/* Board. */}
      <div className={`relative min-h-0 flex-1 ${fullscreen ? 'p-6' : 'p-3'}`}>
        <div
          ref={wrapRef}
          className="relative h-full w-full overflow-hidden"
          style={{ background: 'var(--bg-0)', border: '1px solid rgb(var(--accent-rgb) / 0.15)' }}
        >
          <canvas ref={canvasRef} className="block h-full w-full" />

          {/* Pre-start hint overlay. */}
          {!started && !dead && (
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
              style={{ background: 'rgb(var(--bg-rgb, 5 8 10) / 0.35)' }}
            >
              <div
                className={`${fullscreen ? 'text-[28px]' : 'text-[20px]'} font-term phosphor-glow`}
                style={{ color: 'var(--accent)' }}
              >
                SNAKE
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'rgb(var(--ink-rgb) / 0.5)' }}>
                Arrows / WASD to start &middot; Space to pause
              </div>
            </div>
          )}

          {/* Pause overlay. */}
          {paused && started && !dead && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`${fullscreen ? 'text-[40px]' : 'text-[26px]'} font-term phosphor-glow`}
                style={{ color: 'var(--accent)' }}
              >
                PAUSED
              </div>
            </div>
          )}

          {/* Game-over overlay. */}
          {dead && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center"
              style={{ background: 'rgb(var(--bg-rgb, 5 8 10) / 0.55)' }}
            >
              <div
                className={`${fullscreen ? 'text-[52px]' : 'text-[34px]'} font-term phosphor-glow`}
                style={{ color: 'var(--accent)' }}
              >
                GAME OVER
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'rgb(var(--ink-rgb) / 0.6)' }}>
                Score {score}
                {score > 0 && score >= best ? ' — new best' : ` — best ${best}`}
              </div>
              <ToolButton primary onClick={restart}>
                <RotateCcw size={14} />
                Play again
              </ToolButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
