import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Gamepad2, Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X,
} from 'lucide-react'
import { GAMES, getGame, type GameId } from '../tools/games'
import { useArcadeStore } from '@/store/arcade'
import { usePlayerStore } from '@/store/player'
import { useUiStore } from '@/store/ui'
import { clampWindow, defaultPosition, windowSize } from '@/lib/arcade-window'
import Visualizer from '../Visualizer'
import { fmtDuration } from '@/lib/ipc'
import { DISPLAY_EVENT, getReduceMotion } from '@/lib/theme'

const RAIL_W = 52

/**
 * The arcade cabinet: the four games behind one dock tile, in a window that floats over the
 * app instead of blacking it out.
 *
 * Three things make a non-modal game window work, and all three are load-bearing:
 *
 * 1. FOCUS OWNS THE KEYBOARD. While the cabinet holds focus the game gets the keys; while it
 *    doesn't, the app does — so parking Snake in a corner doesn't cost you the spacebar in a
 *    music player. The mounted game is told via `active` and skips BINDING its `window`
 *    listener, rather than returning early inside it, so an unfocused game is properly deaf.
 * 2. FOCUS COMES FROM POINTER CONTAINMENT, not from blur events alone. Several in-game buttons
 *    delete themselves when clicked (Snake's "Play again", 2048's "Keep going"), and a
 *    delegated focusout does not survive its target being unmounted in the same commit — so a
 *    blur-only model latches "focused" forever and the app's transport keys never come back.
 *    A capture-phase pointerdown recomputes containment on every press.
 * 3. THE MARQUEE IS THE ONLY GRAB SURFACE, so `clampWindow` keeps it reachable — never above
 *    the 30px title bar (Windows paints caption buttons over web content there) and never so
 *    low that the deck leaves the screen.
 *
 * It sits at z-40, UNDER the CRT scanline layer, so it reads as part of the same surface as
 * the rest of the app rather than a cleaner window floating above it.
 */
export default function Arcade({
  fullscreen,
  focusNonce,
  onClose,
  onFullscreenChange,
}: {
  fullscreen: boolean
  /** Bumped when the ARCADE tile is clicked again — re-focuses an already-open cabinet. */
  focusNonce: number
  onClose: () => void
  onFullscreenChange: (fullscreen: boolean) => Promise<void> | void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  const gameId = useArcadeStore((s) => s.game)
  const setGame = useArcadeStore((s) => s.setGame)
  const setPosition = useArcadeStore((s) => s.setPosition)
  const viz = useArcadeStore((s) => s.viz)
  const setViz = useArcadeStore((s) => s.setViz)

  // A modal stacked on top of the cabinet owns the keyboard outright — otherwise a Shift+Tab
  // could reach a covered cabinet's buttons and re-arm a game the user can no longer see.
  const overlayOpen = useUiStore((s) => s.overlayOpen)

  const [size, setSize] = useState(() => windowSize(window.innerWidth, window.innerHeight))
  const [pos, setPos] = useState(() => {
    const { x, y } = useArcadeStore.getState()
    const s = windowSize(window.innerWidth, window.innerHeight)
    return x === null || y === null
      ? defaultPosition(s.width, s.height, window.innerWidth, window.innerHeight)
      : clampWindow(x, y, s.width, s.height, window.innerWidth, window.innerHeight)
  })
  const [focused, setFocused] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bandHeight, setBandHeight] = useState(() => bandFor(window.innerHeight))

  // Reduce Motion lives on <html>, not in a store (it must apply before React mounts), so read
  // it and follow its change event. It hides the spectrum outright rather than slowing it — the
  // point of the setting is no motion in your peripheral vision while you play.
  const [reduceMotion, setReduceMotion] = useState(getReduceMotion)
  useEffect(() => {
    const sync = () => setReduceMotion(getReduceMotion())
    window.addEventListener(DISPLAY_EVENT, sync)
    return () => window.removeEventListener(DISPLAY_EVENT, sync)
  }, [])

  const game = getGame(gameId)
  const Game = game.Component

  const active = !overlayOpen && (fullscreen || focused)

  const sizeRef = useRef(size)
  sizeRef.current = size
  const posRef = useRef(pos)
  posRef.current = pos

  useEffect(() => {
    rootRef.current?.focus()
    setFocused(true)
  }, [focusNonce])

  // Containment on pointerdown is the source of truth (see the class comment). onFocus/onBlur
  // stay for Tab traversal, which pointer events don't cover.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      setFocused(!!rootRef.current?.contains(e.target as Node | null))
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  // Tell the transport to stand down while we hold the keys, and ALWAYS hand them back on
  // unmount — a cabinet closed mid-focus must not leave the app's spacebar dead.
  useEffect(() => {
    useUiStore.getState().setArcadeFocus(active)
  }, [active])
  useEffect(() => () => useUiStore.getState().setArcadeFocus(false), [])

  // Keep the cabinet whole and reachable as the viewport changes, and keep the spectrum band
  // sized to it. Re-runs on the fullscreen transition, which changes the viewport without
  // reliably firing `resize` first.
  useEffect(() => {
    function measure() {
      const next = windowSize(window.innerWidth, window.innerHeight)
      setSize(next)
      setBandHeight(bandFor(window.innerHeight))
      setPos((p) => clampWindow(p.x, p.y, next.width, next.height, window.innerWidth, window.innerHeight))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [fullscreen])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setPos((p) => {
      const next = clampWindow(
        e.clientX - d.dx, e.clientY - d.dy,
        sizeRef.current.width, sizeRef.current.height,
        window.innerWidth, window.innerHeight
      )
      // Return the SAME object when the clamp pinned us, so a drag along an edge stops
      // re-rendering the whole cabinet — and the mounted game with it — every pointer event.
      return next.x === p.x && next.y === p.y ? p : next
    })
  }, [])

  // Persist where the window came to REST, not every pixel it passed through: a write per
  // pointermove is a synchronous localStorage serialize at pointer rate.
  const endDrag = useCallback(() => {
    if (dragRef.current) setPosition(posRef.current.x, posRef.current.y)
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }, [onPointerMove, setPosition])

  // Listeners live on `window`, not the marquee, so a fast drag that outruns the pointer still
  // tracks — and every way a drag can end (up, cancel, unmount) tears them down.
  function startDrag(e: React.PointerEvent) {
    // The marquee carries the ⛶ and ✕ buttons. Arming a drag from them means any pointer drift
    // between press and release moves the window instead of pressing the button.
    if ((e.target as HTMLElement | null)?.closest('button')) return
    if (fullscreen || e.button !== 0) return
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }
  useEffect(() => endDrag, [endDrag])

  // Escape closes the cabinet ONLY when the cabinet is what the user means. A game in progress
  // is real state: an Escape aimed at a modal, a popover, or a search field must not reach in
  // and destroy it.
  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onClose])

  const pick = useCallback((id: GameId) => {
    setGame(id)
    rootRef.current?.focus()
    setFocused(true)
  }, [setGame])

  const frame: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0 }
    : { position: 'fixed', left: pos.x, top: pos.y, width: size.width, height: size.height }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      className="no-drag z-40 flex flex-col overflow-hidden outline-none"
      style={{
        ...frame,
        background: 'var(--bg-1)',
        border: `1px solid rgb(var(--accent-rgb) / ${active ? 0.45 : 0.18})`,
        boxShadow: fullscreen
          ? 'none'
          : `0 12px 48px rgba(0,0,0,0.55), 0 0 ${active ? 28 : 10}px rgb(var(--accent-rgb) / 0.12)`,
        transition: 'border-color 140ms, box-shadow 140ms',
      }}
    >
      <Marquee
        title={game.title}
        active={active}
        fullscreen={fullscreen}
        onPointerDown={startDrag}
        onFullscreen={() => onFullscreenChange(!fullscreen)}
        onClose={onClose}
      />

      <div className="flex min-h-0 flex-1">
        <CartridgeRail current={gameId} onPick={pick} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* A game that outgrows a small cabinet scrolls rather than being cut off. */}
          <div className="arcade-screen relative flex min-h-0 flex-1 flex-col overflow-auto">
            <Game key={gameId} fullscreen={fullscreen} active={active} />
          </div>

          {/* The spectrum gets its OWN strip along the bottom rather than sitting behind the
              game: Snake and 2048 paint opaque boards, so a band underneath them was invisible
              for exactly the games most likely to be played fullscreen. Masked so it fades
              upward into the screen instead of reading as a second widget. */}
          {fullscreen && viz && !reduceMotion && (
            <div
              className="pointer-events-none relative flex-shrink-0 overflow-hidden"
              style={{
                height: bandHeight,
                opacity: 0.5,
                WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 100%)',
                maskImage: 'linear-gradient(to top, black 30%, transparent 100%)',
              }}
            >
              <Visualizer height={bandHeight} />
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <ArcadeSettings viz={viz} onViz={setViz} />}
      <Deck settingsOpen={settingsOpen} onToggleSettings={() => setSettingsOpen((v) => !v)} />
    </div>
  )
}

function bandFor(viewportH: number): number {
  return Math.max(64, Math.min(160, Math.round(viewportH * 0.16)))
}

function Marquee({
  title, active, fullscreen, onPointerDown, onFullscreen, onClose,
}: {
  title: string
  active: boolean
  fullscreen: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onFullscreen: () => void
  onClose: () => void
}) {
  return (
    <header
      onPointerDown={onPointerDown}
      className="flex h-9 flex-shrink-0 select-none items-center gap-2 px-3"
      style={{
        borderBottom: '1px solid rgb(var(--accent-rgb) / 0.14)',
        background: 'rgba(0,0,0,0.35)',
        cursor: fullscreen ? 'default' : 'grab',
      }}
    >
      <Gamepad2 size={13} style={{ color: 'var(--accent)' }} />
      <span
        className={`font-mono flex-shrink-0 text-[9px] uppercase tracking-[0.22em] ${active ? 'phosphor-glow' : ''}`}
        style={{ color: 'var(--accent)' }}
      >
        Arcade
      </span>
      <span className="font-mono flex-shrink-0 text-[9px] tracking-[2px]" style={{ color: 'rgb(var(--ink-rgb) / 0.22)' }}>/</span>
      <span className="font-term min-w-0 flex-1 truncate text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.55)' }}>
        {title}
      </span>
      {/* Says who has the keyboard — the whole point of a window you can leave open. */}
      <span
        className="font-mono flex-shrink-0 text-[8px] uppercase tracking-[0.16em]"
        style={{ color: active ? 'var(--accent2)' : 'rgb(var(--ink-rgb) / 0.28)' }}
        title={active ? 'Keys go to the game' : 'Keys go to the app — click the cabinet to play'}
      >
        {active ? 'KEYS ▸ GAME' : 'KEYS ▸ APP'}
      </span>
      <button onClick={onFullscreen} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} className="metal-key ml-1 h-6 w-6 flex-shrink-0 justify-center">
        {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </button>
      <button onClick={onClose} title="Close (Esc)" className="metal-key h-6 w-6 flex-shrink-0 justify-center">
        <X size={12} />
      </button>
    </header>
  )
}

function CartridgeRail({ current, onPick }: { current: GameId; onPick: (id: GameId) => void }) {
  return (
    <nav
      className="flex flex-shrink-0 flex-col items-center gap-1 py-2"
      style={{ width: RAIL_W, borderRight: '1px solid rgb(var(--accent-rgb) / 0.12)', background: 'rgba(0,0,0,0.22)' }}
    >
      {GAMES.map((g) => {
        const on = g.id === current
        return (
          <button
            key={g.id}
            onClick={() => onPick(g.id)}
            title={g.title}
            aria-label={g.title}
            aria-current={on ? 'true' : undefined}
            className="flex w-full flex-col items-center gap-0.5 py-1.5 transition-colors"
            style={{
              color: on ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.40)',
              background: on ? 'rgb(var(--accent-rgb) / 0.10)' : 'transparent',
              borderLeft: on ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {g.icon}
            <span className="font-mono text-[7px] tracking-[0.10em]">{g.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** Transport, so the keys the game takes are still reachable by hand. */
function Deck({ settingsOpen, onToggleSettings }: { settingsOpen: boolean; onToggleSettings: () => void }) {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const volume = usePlayerStore((s) => s.volume)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const track = usePlayerStore((s) => s.currentTrack())

  return (
    <footer
      className="flex h-11 flex-shrink-0 items-center gap-2 px-3"
      style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.14)', background: 'rgba(0,0,0,0.35)' }}
    >
      <button onClick={prev} title="Previous" className="metal-key h-7 w-7 flex-shrink-0 justify-center"><SkipBack size={12} /></button>
      <button
        onClick={() => setPlaying(!isPlaying)}
        title={isPlaying ? 'Pause' : 'Play'}
        className="metal-key is-primary h-7 w-7 flex-shrink-0 justify-center"
      >
        {isPlaying ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <button onClick={next} title="Next" className="metal-key h-7 w-7 flex-shrink-0 justify-center"><SkipForward size={12} /></button>

      <div className="min-w-0 flex-1 px-1">
        <p className="font-term truncate text-[11px] leading-tight" style={{ color: 'rgb(var(--ink-rgb) / 0.70)' }}>
          {track?.title || 'nothing playing'}
        </p>
        <p className="font-term truncate text-[10px] leading-tight" style={{ color: 'rgb(var(--ink-rgb) / 0.32)' }}>
          {track ? `${track.artist || '—'} · ${fmtDuration(currentTime)} / ${fmtDuration(duration)}` : '—'}
        </p>
      </div>

      <button
        onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
        title={volume > 0 ? 'Mute' : 'Unmute'}
        className="flex-shrink-0 transition-opacity hover:opacity-70"
        style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}
      >
        {volume > 0 ? <Volume2 size={13} /> : <VolumeX size={13} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        title="Volume"
        aria-label="Volume"
        className="h-1 w-16 flex-shrink-0 cursor-pointer appearance-none"
        style={{ accentColor: 'var(--accent)', background: 'rgb(var(--ink-rgb) / 0.15)' }}
      />
      <button
        onClick={onToggleSettings}
        title="Arcade settings"
        aria-expanded={settingsOpen}
        className="metal-key h-7 w-7 flex-shrink-0 justify-center"
        style={settingsOpen ? { color: 'var(--accent)' } : undefined}
      >
        <span className="font-mono text-[11px] leading-none">⚙</span>
      </button>
    </footer>
  )
}

function ArcadeSettings({ viz, onViz }: { viz: boolean; onViz: (on: boolean) => void }) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-between gap-3 px-3 py-2"
      style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.10)', background: 'rgba(0,0,0,0.22)' }}
    >
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={viz} onChange={(e) => onViz(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
        <span className="font-term text-[11px]" style={{ color: 'rgb(var(--ink-rgb) / 0.65)' }}>
          Spectrum under the game in fullscreen
        </span>
      </label>
      <span className="font-mono text-[8px] uppercase tracking-[0.14em]" style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}>
        Reduce Motion hides it too
      </span>
    </div>
  )
}
