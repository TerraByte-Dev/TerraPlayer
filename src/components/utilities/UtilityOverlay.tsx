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
  { name: 'Black', value: '#111827' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Purple', value: '#7c3aed' },
]

const DEFAULT_CLOCKS: ClockInfo[] = [
  { id: 'default-est', label: 'EST', zone: 'America/New_York' },
]

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
        fullscreen
          ? 'bg-[#061224]'
          : 'flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm'
      }`}
    >
      <section
        className={`flex min-h-0 flex-col overflow-hidden border border-aero-aqua/16 bg-[#07162b]/94 shadow-[0_0_36px_rgba(127,233,208,0.12)] backdrop-blur-xl ${
          fullscreen
            ? 'h-full w-full rounded-none'
            : 'h-[min(720px,calc(100vh-48px))] w-[min(920px,calc(100vw-32px))] rounded-lg'
        }`}
      >
        <header className="flex h-11 flex-shrink-0 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-aero-aqua/70 shadow-[0_0_10px_rgba(127,233,208,0.7)]" />
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-aero-aqua/70">
              {title}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onFullscreenChange(!fullscreen)}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="utility-icon-button"
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={onClose} title="Close" className="utility-icon-button">
              <X size={15} />
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
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <SegmentedButton active={tool === 'brush'} onClick={() => setTool('brush')} title="Brush">
          <Brush size={14} />
        </SegmentedButton>
        <SegmentedButton active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser">
          <Eraser size={14} />
        </SegmentedButton>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <div className="flex items-center gap-1.5">
          {BOARD_COLORS.map((item) => (
            <button
              key={item.value}
              onClick={() => setColor(item.value)}
              title={item.name}
              className={`h-5 w-5 rounded-full border transition-transform ${
                color === item.value && tool === 'brush'
                  ? 'scale-110 border-white/70'
                  : 'border-white/20 hover:scale-105'
              }`}
              style={{ backgroundColor: item.value }}
            />
          ))}
        </div>
        <label className="ml-1 flex min-w-36 items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-muted/55">
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
          <span className="w-5 text-right font-mono">{strokeSize}</span>
        </label>
        <div className="flex-1" />
        {savedPath && (
          <span className="max-w-[180px] truncate text-[10px] text-aero-aqua/55" title={savedPath}>
            Saved
          </span>
        )}
        {confirmClear ? (
          <button onClick={clearBoard} className="utility-danger-button">
            Clear now
          </button>
        ) : (
          <button onClick={() => setConfirmClear(true)} className="utility-quiet-button" title="Clear board">
            <Trash2 size={13} />
            Clear
          </button>
        )}
        <button onClick={saveBoard} className="utility-quiet-button" title="Save PNG">
          <Save size={13} />
          Save
        </button>
      </div>
      <div className={`min-h-0 flex-1 p-3 ${fullscreen ? 'p-5' : ''}`}>
        <div
          ref={wrapRef}
          className="h-full overflow-hidden rounded-md border border-aero-sky/20 bg-[#f1efe7] shadow-[inset_0_0_24px_rgba(108,197,255,0.13)]"
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
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-white/10 px-3 py-2">
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
        <p className={`${fullscreen ? 'text-[96px]' : 'text-[64px]'} font-mono tabular-nums text-white/90`}>
          {formatTimer(liveRemaining)}
        </p>
        {ringing && (
          <button onClick={dismiss} className="mt-3 rounded-md border border-aero-aqua/35 bg-aero-aqua/12 px-4 py-2 text-[12px] text-aero-aqua">
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
        <button onClick={running ? pause : start} className="utility-primary-button">
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : 'Start'}
        </button>
        <button onClick={reset} className="utility-quiet-button">
          <RotateCcw size={13} />
          Reset
        </button>
      </div>

      <div className="mx-auto grid w-full max-w-xl min-w-0 gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <label className="grid min-w-0 gap-1 text-[10px] uppercase tracking-[0.1em] text-muted/50">
          Alarm action
          <select
            value={alarmAction}
            onChange={(e) => setAlarmAction(e.target.value as AlarmAction)}
            className="min-w-0 w-full max-w-full rounded-md border border-white/10 bg-surface-100 px-2 py-2 text-[12px] normal-case tracking-normal text-white/75 outline-none"
          >
            <option value="song">Play selected song</option>
            <option value="stop">Stop current music</option>
          </select>
        </label>
        {alarmAction === 'song' && (
          <label className="grid min-w-0 gap-1 text-[10px] uppercase tracking-[0.1em] text-muted/50">
            Alarm song
            <select
              value={alarmPath}
              onChange={(e) => setAlarmPath(e.target.value)}
              className="min-w-0 w-full max-w-full truncate rounded-md border border-white/10 bg-surface-100 px-2 py-2 text-[12px] normal-case tracking-normal text-white/75 outline-none"
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
      <p className={`${fullscreen ? 'text-[96px]' : 'text-[64px]'} font-mono tabular-nums text-white/90`}>
        {formatMs(elapsed)}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={running ? pause : start} className="utility-primary-button">
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : 'Start'}
        </button>
        <button onClick={() => setLaps((items) => [elapsed, ...items].slice(0, 12))} className="utility-quiet-button" disabled={elapsed <= 0}>
          Lap
        </button>
        <button onClick={reset} className="utility-quiet-button">
          <RotateCcw size={13} />
          Reset
        </button>
      </div>
      <div className="grid max-h-60 w-full gap-1 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] p-2">
        {laps.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-white/25">No laps</p>
        ) : laps.map((lap, index) => (
          <div key={`${lap}-${index}`} className="flex items-center justify-between rounded-md bg-white/[0.035] px-3 py-2 text-[12px]">
            <span className="font-mono text-white/35">Lap {laps.length - index}</span>
            <span className="font-mono tabular-nums text-white/75">{formatMs(lap)}</span>
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
              className="min-w-0 rounded-md border border-white/10 bg-surface-100 px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/25"
            />
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="min-w-0 w-full rounded-md border border-white/10 bg-surface-100 px-2 py-1.5 text-[11px] text-white/75 outline-none"
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
        )}
        {adding ? (
          <button onClick={addClock} className="utility-primary-button" disabled={timeZones.length === 0}>
            <Plus size={13} />
            Add
          </button>
        ) : (
          <button
            onClick={() => {
              if (timeZones[0]) setSelectedZone(timeZones[0])
              setAdding(true)
            }}
            className="utility-quiet-button"
            disabled={timeZones.length === 0}
          >
            <Plus size={13} />
            Clock
          </button>
        )}
      </div>
      <div className={`grid gap-3 ${fullscreen ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {clocks.map((clock) => (
          <div key={clock.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-4 flex min-w-0 items-center justify-between gap-2">
              <input
                value={clock.label}
                onChange={(e) => renameClock(clock.id, e.target.value)}
                onBlur={() => {
                  if (!clock.label.trim()) renameClock(clock.id, defaultClockLabel(clock.zone))
                }}
                title="Clock name"
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] text-aero-aqua/70 outline-none transition-colors hover:border-white/10 hover:bg-white/[0.035] focus:border-aero-aqua/25 focus:bg-white/[0.05]"
              />
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 truncate text-[10px] text-white/25">{clock.zone}</p>
                <button
                  onClick={() => removeClock(clock.id)}
                  disabled={clocks.length <= 1}
                  className="text-white/20 transition-colors hover:text-white/60 disabled:opacity-20 disabled:hover:text-white/20"
                  title="Remove clock"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            <p className="font-mono text-3xl tabular-nums text-white/90">
              {now.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: clock.zone,
              })}
            </p>
            <p className="mt-2 text-[11px] text-white/35">
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
        <div className={`${fullscreen ? 'text-[140px]' : 'text-[88px]'} min-h-[1em] font-mono font-semibold leading-none tabular-nums text-white/90`}>
          {resultLabel}
        </div>
        <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.14em] text-aero-aqua/45">
          {mode === 'coin' ? 'Coin flip' : mode === 'dice' ? 'Dice roll' : `1 to ${max}`}
        </p>
      </div>

      <div className="grid w-full max-w-md gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <label className="grid gap-1 text-[10px] uppercase tracking-[0.1em] text-muted/50">
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
            className="rounded-md border border-white/10 bg-surface-100 px-2 py-2 text-[13px] normal-case tracking-normal text-white/80 outline-none"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => roll('coin', 2)} className="utility-quiet-button justify-center">
            Coin
          </button>
          <button onClick={() => roll('dice', 6)} className="utility-quiet-button justify-center">
            <Dice5 size={13} />
            Dice
          </button>
          <button onClick={() => roll('custom', max)} className="utility-primary-button justify-center">
            {result === null ? 'Pick' : repeatLabel}
          </button>
        </div>
      </div>

      {fullscreen && result !== null && (
        <button onClick={() => roll(mode, max)} className="utility-primary-button px-5 py-2.5">
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
      className={`flex h-7 w-8 items-center justify-center rounded-md border transition-colors ${
        active
          ? 'border-aero-aqua/35 bg-aero-aqua/12 text-aero-aqua'
          : 'border-white/10 bg-white/[0.035] text-white/45 hover:text-white/75'
      }`}
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
      className={`rounded-md px-3 py-1.5 text-[11px] transition-colors ${
        active
          ? 'bg-aero-aqua/12 text-aero-aqua'
          : 'text-muted/55 hover:bg-white/[0.04] hover:text-white/75'
      }`}
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
    <label className="grid gap-1 text-[10px] uppercase tracking-[0.1em] text-muted/50">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        className="rounded-md border border-white/10 bg-surface-100 px-2 py-2 text-[13px] normal-case tracking-normal text-white/80 outline-none disabled:opacity-45"
      />
    </label>
  )
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hundredths = Math.floor((ms % 1000) / 10)
  return `${fmtDuration(totalSeconds)}.${hundredths.toString().padStart(2, '0')}`
}
