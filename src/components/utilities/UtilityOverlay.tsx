import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Brush,
  Dice5,
  Eraser,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { fmtDuration } from '@/lib/ipc'
import { formatTimer, useUtilityTimerStore, type AlarmAction } from '@/store/utilityTimer'
import type { UtilityMode } from './UtilityDock'

interface UtilityOverlayProps {
  mode: UtilityMode
  fullscreen: boolean
  onClose: () => void
  onFullscreenChange: (fullscreen: boolean) => Promise<void>
}

type BoardTool = 'brush' | 'eraser'
type TimerTab = 'timer' | 'stopwatch' | 'clock'
type RngMode = 'custom' | 'coin' | 'dice'
type ClockInfo = { id: string; label: string; zone: string }

const BOARD_SURFACE = '#f1efe7'

const BOARD_COLORS = [
  { name: 'Black',  value: '#111827' },
  { name: 'Blue',   value: '#2563eb' },
  { name: 'Red',    value: '#dc2626' },
  { name: 'Green',  value: '#16a34a' },
  { name: 'Purple', value: '#7c3aed' },
]

const DEFAULT_CLOCKS: ClockInfo[] = [
  { id: 'default-est', label: 'EST', zone: 'America/New_York' },
]

const INPUT_STYLE: React.CSSProperties = {
  background: '#000',
  border: '1px solid rgba(0,255,136,0.25)',
  color: '#9bf5b8',
  borderRadius: 0,
  outline: 'none',
}

const INPUT_FOCUS_BORDER = 'rgba(0,255,136,0.55)'
const INPUT_BLUR_BORDER  = 'rgba(0,255,136,0.25)'

export default function UtilityOverlay({
  mode,
  fullscreen,
  onClose,
  onFullscreenChange,
}: UtilityOverlayProps) {
  const title = mode === 'board'
    ? 'Dry Erase Board'
    : mode === 'timer'
      ? 'Timer Tools'
      : 'Random Number'

  return (
    <UtilityShell
      title={title}
      fullscreen={fullscreen}
      onClose={onClose}
      onFullscreenChange={onFullscreenChange}
    >
      {mode === 'board' && <DryEraseBoard fullscreen={fullscreen} />}
      {mode === 'timer' && <TimerTools fullscreen={fullscreen} />}
      {mode === 'rng' && <RandomNumberTool fullscreen={fullscreen} />}
    </UtilityShell>
  )
}

function UtilityShell({
  title,
  fullscreen,
  onClose,
  onFullscreenChange,
  children,
}: {
  title: string
  fullscreen: boolean
  onClose: () => void
  onFullscreenChange: (fullscreen: boolean) => Promise<void>
  children: React.ReactNode
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 z-40 no-drag ${
        fullscreen ? '' : 'flex items-center justify-center px-4 py-6'
      }`}
      style={{ background: fullscreen ? '#000' : 'rgba(0,0,0,0.60)' }}
    >
      <section
        className={`flex min-h-0 flex-col overflow-hidden ${
          fullscreen ? 'h-full w-full' : 'h-[min(720px,calc(100vh-48px))] w-[min(920px,calc(100vw-32px))]'
        }`}
        style={{
          background: '#020503',
          border: '1px solid rgba(0,255,136,0.25)',
          boxShadow: '0 0 36px rgba(0,255,136,0.10)',
          borderRadius: 0,
        }}
      >
        <header
          className="flex h-10 flex-shrink-0 items-center justify-between px-4"
          style={{ borderBottom: '1px solid rgba(0,255,136,0.12)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2"
              style={{
                background: '#00FF88',
                boxShadow: '0 0 8px rgba(0,255,136,0.8)',
                borderRadius: 0,
              }}
            />
            <p className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: '#00E5FF' }}>
              {title}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onFullscreenChange(!fullscreen)}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="metal-key w-7 h-7 justify-center"
            >
              {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button onClick={onClose} title="Close" className="metal-key w-7 h-7 justify-center">
              <X size={13} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </div>
  )
}

function DryEraseBoard({ fullscreen }: { fullscreen: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [tool, setTool] = useState<BoardTool>('brush')
  const [color, setColor] = useState(BOARD_COLORS[1].value)
  const [strokeSize, setStrokeSize] = useState(6)
  const [confirmClear, setConfirmClear] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    function resize() {
      const rect = wrap!.getBoundingClientRect()
      const prev = document.createElement('canvas')
      prev.width = canvas!.width
      prev.height = canvas!.height
      const prevCtx = prev.getContext('2d')
      if (prevCtx && canvas!.width > 0 && canvas!.height > 0) prevCtx.drawImage(canvas!, 0, 0)

      canvas!.width = Math.max(1, Math.floor(rect.width * devicePixelRatio))
      canvas!.height = Math.max(1, Math.floor(rect.height * devicePixelRatio))
      canvas!.style.width = `${rect.width}px`
      canvas!.style.height = `${rect.height}px`

      const ctx = canvas!.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = BOARD_SURFACE
      ctx.fillRect(0, 0, canvas!.width, canvas!.height)
      if (prev.width > 0 && prev.height > 0) {
        ctx.drawImage(prev, 0, 0, canvas!.width, canvas!.height)
      }
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * devicePixelRatio,
      y: (e.clientY - rect.top) * devicePixelRatio,
    }
  }

  function draw(from: { x: number; y: number }, to: { x: number; y: number }) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = (tool === 'eraser' ? strokeSize * 2 : strokeSize) * devicePixelRatio
    ctx.strokeStyle = tool === 'eraser' ? BOARD_SURFACE : color
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const point = pointFromEvent(e)
    lastPointRef.current = point
    draw(point, point)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!lastPointRef.current) return
    const point = pointFromEvent(e)
    draw(lastPointRef.current, point)
    lastPointRef.current = point
  }

  function stopDrawing() {
    lastPointRef.current = null
  }

  function clearBoard() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = BOARD_SURFACE
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setConfirmClear(false)
    setSavedPath(null)
  }

  async function saveBoard() {
    const canvas = canvasRef.current
    if (!canvas) return
    const saved = await window.hub.saveImage(canvas.toDataURL('image/png'), 'hamilton-board.png')
    setSavedPath(saved)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex flex-shrink-0 flex-wrap items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.10)' }}
      >
        <SegmentedButton active={tool === 'brush'} onClick={() => setTool('brush')} title="Brush">
          <Brush size={13} />
        </SegmentedButton>
        <SegmentedButton active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser">
          <Eraser size={13} />
        </SegmentedButton>
        <div className="mx-1 h-4 w-px" style={{ background: 'rgba(0,255,136,0.15)' }} />
        <div className="flex items-center gap-1.5">
          {BOARD_COLORS.map((item) => (
            <button
              key={item.value}
              onClick={() => setColor(item.value)}
              title={item.name}
              className={`h-5 w-5 rounded-full border transition-transform ${
                color === item.value && tool === 'brush'
                  ? 'scale-110 border-white/80'
                  : 'border-white/25 hover:scale-105'
              }`}
              style={{ backgroundColor: item.value }}
            />
          ))}
        </div>
        <label className="ml-1 flex min-w-36 items-center gap-2 font-term text-[11px] uppercase tracking-[0.08em]" style={{ color: 'rgba(155,245,184,0.45)' }}>
          <span>Size</span>
          <input
            type="range"
            min={2}
            max={28}
            step={1}
            value={strokeSize}
            onChange={(e) => setStrokeSize(Number(e.target.value))}
            className="w-28"
          />
          <span className="w-5 text-right font-term">{strokeSize}</span>
        </label>
        <div className="flex-1" />
        {savedPath && (
          <span className="max-w-[180px] truncate font-term text-[11px]" style={{ color: 'rgba(0,229,255,0.60)' }} title={savedPath}>
            Saved
          </span>
        )}
        {confirmClear ? (
          <button
            onClick={clearBoard}
            className="metal-key px-3 py-1 font-term text-[12px]"
            style={{ color: '#FF3030', borderColor: 'rgba(255,48,48,0.40)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,48,48,0.10)'; e.currentTarget.style.color = '#ff6060' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#FF3030' }}
          >
            Clear now
          </button>
        ) : (
          <button onClick={() => setConfirmClear(true)} className="metal-key gap-1.5 px-2.5 py-1 font-term text-[12px]" title="Clear board">
            <Trash2 size={12} />
            Clear
          </button>
        )}
        <button onClick={saveBoard} className="metal-key gap-1.5 px-2.5 py-1 font-term text-[12px]" title="Save PNG">
          <Save size={12} />
          Save
        </button>
      </div>
      <div className={`min-h-0 flex-1 p-3 ${fullscreen ? 'p-5' : ''}`}>
        <div
          ref={wrapRef}
          className="h-full overflow-hidden bg-[#f1efe7]"
          style={{ border: '1px solid rgba(0,255,136,0.15)' }}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full cursor-crosshair touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
        </div>
      </div>
    </div>
  )
}

function TimerTools({ fullscreen }: { fullscreen: boolean }) {
  const [tab, setTab] = useState<TimerTab>('timer')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex flex-shrink-0 items-center gap-1 px-3 py-2"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.10)' }}
      >
        <TextTab active={tab === 'timer'} onClick={() => setTab('timer')}>Timer</TextTab>
        <TextTab active={tab === 'stopwatch'} onClick={() => setTab('stopwatch')}>Stopwatch</TextTab>
        <TextTab active={tab === 'clock'} onClick={() => setTab('clock')}>World Clock</TextTab>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'timer' && <CountdownTimer fullscreen={fullscreen} />}
        {tab === 'stopwatch' && <Stopwatch fullscreen={fullscreen} />}
        {tab === 'clock' && <WorldClock fullscreen={fullscreen} />}
      </div>
    </div>
  )
}

function CountdownTimer({ fullscreen }: { fullscreen: boolean }) {
  const tracks = useLibraryStore((s) => s.tracks)
  const {
    minutes,
    seconds,
    running,
    ringing,
    alarmAction,
    alarmPath,
    setDurationInput,
    setAlarmAction,
    setAlarmPath,
    start,
    pause,
    reset,
    dismiss,
    remaining,
  } = useUtilityTimerStore()

  const alarmTracks = useMemo(() => tracks.slice(0, 250), [tracks])

  useEffect(() => {
    if (!alarmPath && tracks[0]) setAlarmPath(tracks[0].path)
  }, [alarmPath, setAlarmPath, tracks])

  const liveRemaining = remaining()

  return (
    <div className={`mx-auto flex max-w-3xl flex-col gap-5 ${fullscreen ? 'pt-14' : ''}`}>
      <div className="text-center">
        <p
          className={`${fullscreen ? 'text-[96px]' : 'text-[64px]'} font-lcd tabular-nums phosphor-glow leading-none`}
          style={{ color: '#00FF88' }}
        >
          {formatTimer(liveRemaining)}
        </p>
        {ringing && (
          <button
            onClick={dismiss}
            className="mt-3 metal-key is-primary px-4 py-2 font-term text-[12px]"
          >
            Dismiss
          </button>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-3">
        <NumberField
          label="Min"
          value={minutes}
          max={1439}
          disabled={running}
          onChange={(value) => setDurationInput(value, seconds)}
        />
        <NumberField
          label="Sec"
          value={seconds}
          max={59}
          disabled={running}
          onChange={(value) => setDurationInput(minutes, value)}
        />
      </div>

      <div className="mx-auto flex flex-wrap items-center justify-center gap-2">
        <button onClick={running ? pause : start} className="metal-key is-primary gap-1.5 px-4 py-2 font-term text-[13px]">
          {running ? <Pause size={13} /> : <Play size={13} />}
          {running ? 'Pause' : 'Start'}
        </button>
        <button onClick={reset} className="metal-key gap-1.5 px-4 py-2 font-term text-[13px]">
          <RotateCcw size={12} />
          Reset
        </button>
      </div>

      <div
        className="mx-auto grid w-full max-w-xl min-w-0 gap-3 p-3"
        style={{ border: '1px solid rgba(0,255,136,0.15)', background: 'rgba(0,255,136,0.03)' }}
      >
        <label className="grid min-w-0 gap-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgba(155,245,184,0.45)' }}>
          Alarm action
          <select
            value={alarmAction}
            onChange={(e) => setAlarmAction(e.target.value as AlarmAction)}
            className="min-w-0 w-full max-w-full px-2 py-2 font-term text-[12px] normal-case tracking-normal"
            style={INPUT_STYLE}
            onFocus={(e) => (e.currentTarget.style.borderColor = INPUT_FOCUS_BORDER)}
            onBlur={(e) => (e.currentTarget.style.borderColor = INPUT_BLUR_BORDER)}
          >
            <option value="song">Play selected song</option>
            <option value="stop">Stop current music</option>
          </select>
        </label>
        {alarmAction === 'song' && (
          <label className="grid min-w-0 gap-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgba(155,245,184,0.45)' }}>
            Alarm song
            <select
              value={alarmPath}
              onChange={(e) => setAlarmPath(e.target.value)}
              className="min-w-0 w-full max-w-full truncate px-2 py-2 font-term text-[12px] normal-case tracking-normal"
              style={INPUT_STYLE}
              onFocus={(e) => (e.currentTarget.style.borderColor = INPUT_FOCUS_BORDER)}
              onBlur={(e) => (e.currentTarget.style.borderColor = INPUT_BLUR_BORDER)}
            >
              {alarmTracks.map((track) => (
                <option key={track.path} value={track.path}>
                  {track.title} - {track.artist || 'Unknown artist'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

function Stopwatch({ fullscreen }: { fullscreen: boolean }) {
  const startRef = useRef(0)
  const baseRef = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [laps, setLaps] = useState<number[]>([])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setElapsed(baseRef.current + Date.now() - startRef.current)
    }, 34)
    return () => window.clearInterval(id)
  }, [running])

  function start() {
    startRef.current = Date.now()
    baseRef.current = elapsed
    setRunning(true)
  }

  function pause() {
    baseRef.current = elapsed
    setRunning(false)
  }

  function reset() {
    baseRef.current = 0
    setElapsed(0)
    setRunning(false)
    setLaps([])
  }

  return (
    <div className={`mx-auto flex max-w-2xl flex-col items-center gap-5 ${fullscreen ? 'pt-20' : ''}`}>
      <p
        className={`${fullscreen ? 'text-[96px]' : 'text-[64px]'} font-lcd tabular-nums phosphor-glow leading-none`}
        style={{ color: '#00FF88' }}
      >
        {formatMs(elapsed)}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={running ? pause : start} className="metal-key is-primary gap-1.5 px-4 py-2 font-term text-[13px]">
          {running ? <Pause size={13} /> : <Play size={13} />}
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={() => setLaps((items) => [elapsed, ...items].slice(0, 12))}
          className="metal-key px-4 py-2 font-term text-[13px]"
          disabled={elapsed <= 0}
        >
          Lap
        </button>
        <button onClick={reset} className="metal-key gap-1.5 px-4 py-2 font-term text-[13px]">
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
      <div
        className="grid max-h-60 w-full gap-1 overflow-y-auto p-2"
        style={{ border: '1px solid rgba(0,255,136,0.12)', background: 'rgba(0,255,136,0.02)' }}
      >
        {laps.length === 0 ? (
          <p className="py-8 text-center font-term text-[12px]" style={{ color: 'rgba(155,245,184,0.25)' }}>
            No laps
          </p>
        ) : laps.map((lap, index) => (
          <div
            key={`${lap}-${index}`}
            className="flex items-center justify-between px-3 py-2"
            style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.08)' }}
          >
            <span className="font-mono text-[11px]" style={{ color: 'rgba(155,245,184,0.40)' }}>
              Lap {laps.length - index}
            </span>
            <span className="font-lcd tabular-nums text-[13px]" style={{ color: '#9bf5b8' }}>
              {formatMs(lap)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorldClock({ fullscreen }: { fullscreen: boolean }) {
  const [now, setNow] = useState(new Date())
  const [clocks, setClocks] = useState<ClockInfo[]>(() => readClocks())
  const [adding, setAdding] = useState(false)
  const timeZones = useMemo(() => getSupportedTimeZones(), [])
  const [selectedZone, setSelectedZone] = useState(timeZones[0] ?? 'America/New_York')
  const [newClockName, setNewClockName] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('hamilton.worldClocks.v1', JSON.stringify(clocks))
  }, [clocks])

  function addClock() {
    if (!selectedZone) return
    setClocks((items) => [
      ...items,
      {
        id: makeClockId(),
        label: newClockName.trim() || defaultClockLabel(selectedZone),
        zone: selectedZone,
      },
    ])
    setNewClockName('')
    setAdding(false)
  }

  function renameClock(id: string, label: string) {
    setClocks((items) =>
      items.map((clock) => clock.id === id ? { ...clock, label } : clock)
    )
  }

  function removeClock(id: string) {
    setClocks((items) => items.length <= 1 ? items : items.filter((clock) => clock.id !== id))
  }

  return (
    <div className={`mx-auto max-w-4xl ${fullscreen ? 'pt-14' : ''}`}>
      <div className="mb-3 flex items-center justify-end gap-2">
        {adding && (
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(90px,160px)_minmax(120px,1fr)] gap-2">
            <input
              value={newClockName}
              onChange={(e) => setNewClockName(e.target.value)}
              placeholder="clock name"
              className="min-w-0 px-2 py-1.5 font-term text-[12px] placeholder:opacity-30"
              style={{ ...INPUT_STYLE }}
              onFocus={(e) => (e.currentTarget.style.borderColor = INPUT_FOCUS_BORDER)}
              onBlur={(e) => (e.currentTarget.style.borderColor = INPUT_BLUR_BORDER)}
            />
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="min-w-0 w-full px-2 py-1.5 font-term text-[12px]"
              style={INPUT_STYLE}
              onFocus={(e) => (e.currentTarget.style.borderColor = INPUT_FOCUS_BORDER)}
              onBlur={(e) => (e.currentTarget.style.borderColor = INPUT_BLUR_BORDER)}
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </div>
        )}
        {adding ? (
          <button
            onClick={addClock}
            className="metal-key is-primary gap-1.5 px-3 py-1.5 font-term text-[12px]"
            disabled={timeZones.length === 0}
          >
            <Plus size={12} />
            Add
          </button>
        ) : (
          <button
            onClick={() => {
              if (timeZones[0]) setSelectedZone(timeZones[0])
              setAdding(true)
            }}
            className="metal-key gap-1.5 px-3 py-1.5 font-term text-[12px]"
            disabled={timeZones.length === 0}
          >
            <Plus size={12} />
            Clock
          </button>
        )}
      </div>
      <div className={`grid gap-3 ${fullscreen ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {clocks.map((clock) => (
          <div
            key={clock.id}
            className="p-4"
            style={{ border: '1px solid rgba(0,255,136,0.15)', background: 'rgba(0,255,136,0.03)' }}
          >
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <input
                value={clock.label}
                onChange={(e) => renameClock(clock.id, e.target.value)}
                title="Clock name"
                className="min-w-0 flex-1 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] bg-transparent border border-transparent transition-colors"
                style={{ color: '#00E5FF', borderRadius: 0, outline: 'none' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.30)')}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'transparent'
                  if (!clock.label.trim()) renameClock(clock.id, defaultClockLabel(clock.zone))
                }}
              />
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 truncate font-term text-[10px]" style={{ color: 'rgba(155,245,184,0.25)' }}>
                  {clock.zone}
                </p>
                <button
                  onClick={() => removeClock(clock.id)}
                  disabled={clocks.length <= 1}
                  className="transition-colors disabled:opacity-20"
                  style={{ color: 'rgba(155,245,184,0.30)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#9bf5b8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(155,245,184,0.30)')}
                  title="Remove clock"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            <p className="font-lcd text-3xl tabular-nums phosphor-glow" style={{ color: '#00FF88' }}>
              {now.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: clock.zone,
              })}
            </p>
            <p className="mt-1.5 font-term text-[11px]" style={{ color: 'rgba(155,245,184,0.40)' }}>
              {now.toLocaleDateString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                timeZone: clock.zone,
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function readClocks(): ClockInfo[] {
  try {
    const raw = window.localStorage.getItem('hamilton.worldClocks.v1')
    if (!raw) return DEFAULT_CLOCKS
    const parsed = JSON.parse(raw) as Array<Partial<ClockInfo>>
    const valid = parsed.filter((clock) =>
      typeof clock.label === 'string' &&
      typeof clock.zone === 'string' &&
      isValidTimeZone(clock.zone)
    ).map((clock) => ({
      id: typeof clock.id === 'string' ? clock.id : makeClockId(),
      label: clock.label!.trim() || defaultClockLabel(clock.zone!),
      zone: clock.zone!,
    }))
    return valid.length > 0 ? valid : DEFAULT_CLOCKS
  } catch {
    return DEFAULT_CLOCKS
  }
}

function getSupportedTimeZones(): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }
  const zones = intlWithSupportedValues.supportedValuesOf?.('timeZone') ?? [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'UTC',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Australia/Sydney',
  ]
  return [...zones].sort((a, b) => a.localeCompare(b))
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function defaultClockLabel(zone: string): string {
  const part = zone.split('/').pop() || zone
  return part.replace(/_/g, ' ')
}

function makeClockId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `clock-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function RandomNumberTool({ fullscreen }: { fullscreen: boolean }) {
  const [max, setMax] = useState(100)
  const [result, setResult] = useState<number | null>(null)
  const [mode, setMode] = useState<RngMode>('custom')

  function roll(nextMode = mode, nextMax = max) {
    const boundedMax = Math.max(1, Math.min(1000000, Math.floor(nextMax)))
    setMode(nextMode)
    setMax(boundedMax)
    setResult(Math.floor(Math.random() * boundedMax) + 1)
  }

  const resultLabel = mode === 'coin' && result
    ? result === 1 ? 'Heads' : 'Tails'
    : result?.toString() ?? '--'

  const repeatLabel = mode === 'coin'
    ? 'Flip again'
    : mode === 'dice'
      ? 'Roll again'
      : 'Again'

  return (
    <div className={`mx-auto flex max-w-2xl flex-col items-center gap-5 px-2 ${fullscreen ? 'pt-24' : 'pt-6'}`}>
      <div className="text-center">
        <div
          className={`${fullscreen ? 'text-[140px]' : 'text-[88px]'} min-h-[1em] font-lcd font-semibold leading-none tabular-nums phosphor-glow`}
          style={{ color: '#00FF88' }}
        >
          {resultLabel}
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'rgba(0,229,255,0.50)' }}>
          {mode === 'coin' ? 'Coin flip' : mode === 'dice' ? 'Dice roll' : `1 to ${max}`}
        </p>
      </div>

      <div
        className="grid w-full max-w-md gap-3 p-3"
        style={{ border: '1px solid rgba(0,255,136,0.15)', background: 'rgba(0,255,136,0.02)' }}
      >
        <label className="grid gap-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgba(155,245,184,0.45)' }}>
          Maximum
          <input
            type="number"
            min={1}
            max={1000000}
            value={max}
            onChange={(e) => {
              setMax(Number(e.target.value))
              setMode('custom')
            }}
            className="px-2 py-2 font-term text-[13px] normal-case tracking-normal"
            style={INPUT_STYLE}
            onFocus={(e) => (e.currentTarget.style.borderColor = INPUT_FOCUS_BORDER)}
            onBlur={(e) => (e.currentTarget.style.borderColor = INPUT_BLUR_BORDER)}
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => roll('coin', 2)}
            className="metal-key justify-center font-term text-[12px]"
          >
            Coin
          </button>
          <button
            onClick={() => roll('dice', 6)}
            className="metal-key justify-center gap-1.5 font-term text-[12px]"
          >
            <Dice5 size={12} />
            Dice
          </button>
          <button
            onClick={() => roll('custom', max)}
            className="metal-key is-primary justify-center font-term text-[12px]"
          >
            {result === null ? 'Pick' : repeatLabel}
          </button>
        </div>
      </div>

      {fullscreen && result !== null && (
        <button onClick={() => roll(mode, max)} className="metal-key is-primary px-5 py-2.5 font-term text-[13px]">
          {repeatLabel}
        </button>
      )}
    </div>
  )
}

function SegmentedButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-8 items-center justify-center transition-colors"
      style={{
        border: active ? '1px solid rgba(0,255,136,0.40)' : '1px solid rgba(0,255,136,0.15)',
        background: active ? 'rgba(0,255,136,0.12)' : 'transparent',
        color: active ? '#00FF88' : 'rgba(155,245,184,0.45)',
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(0,255,136,0.08)'
          e.currentTarget.style.color = '#9bf5b8'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(155,245,184,0.45)'
        }
      }}
    >
      {children}
    </button>
  )
}

function TextTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 font-term text-[12px] transition-colors"
      style={{
        background: active ? 'rgba(0,255,136,0.12)' : 'transparent',
        border: active ? '1px solid rgba(0,255,136,0.35)' : '1px solid transparent',
        color: active ? '#00FF88' : 'rgba(155,245,184,0.50)',
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(0,255,136,0.06)'
          e.currentTarget.style.color = '#9bf5b8'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(155,245,184,0.50)'
        }
      }}
    >
      {children}
    </button>
  )
}

function NumberField({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string
  value: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgba(155,245,184,0.45)' }}>
      {label}
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        className="px-2 py-2 font-term text-[13px] normal-case tracking-normal disabled:opacity-45"
        style={INPUT_STYLE}
        onFocus={(e) => (e.currentTarget.style.borderColor = INPUT_FOCUS_BORDER)}
        onBlur={(e) => (e.currentTarget.style.borderColor = INPUT_BLUR_BORDER)}
      />
    </label>
  )
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hundredths = Math.floor((ms % 1000) / 10)
  return `${fmtDuration(totalSeconds)}.${hundredths.toString().padStart(2, '0')}`
}
