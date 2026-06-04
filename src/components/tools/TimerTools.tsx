import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { fmtDuration } from '@/lib/ipc'
import { formatTimer, useUtilityTimerStore, type AlarmAction } from '@/store/utilityTimer'
import type { ToolProps } from './types'
import { NumberField, Readout, TextTab, ToolButton, inputStyle, focusInput, blurInput } from './shared'

type TimerTab = 'timer' | 'stopwatch' | 'clock'
type ClockInfo = { id: string; label: string; zone: string }

const CLOCKS_KEY = 'terraplayer.worldClocks.v1'
const DEFAULT_CLOCKS: ClockInfo[] = [{ id: 'default-est', label: 'EST', zone: 'America/New_York' }]

export default function TimerTools({ fullscreen }: ToolProps) {
  const [tab, setTab] = useState<TimerTab>('timer')
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-1 px-3 py-2" style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}>
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
  // Narrow selectors so the per-second countdown tick (the store's `now`) does
  // not re-render this whole panel — most importantly the alarm-song <select>,
  // which can carry up to 250 <option>s. The live value is isolated in the
  // <TimerReadout> child below.
  const minutes = useUtilityTimerStore((s) => s.minutes)
  const seconds = useUtilityTimerStore((s) => s.seconds)
  const running = useUtilityTimerStore((s) => s.running)
  const ringing = useUtilityTimerStore((s) => s.ringing)
  const alarmAction = useUtilityTimerStore((s) => s.alarmAction)
  const alarmPath = useUtilityTimerStore((s) => s.alarmPath)
  const setDurationInput = useUtilityTimerStore((s) => s.setDurationInput)
  const setAlarmAction = useUtilityTimerStore((s) => s.setAlarmAction)
  const setAlarmPath = useUtilityTimerStore((s) => s.setAlarmPath)
  const start = useUtilityTimerStore((s) => s.start)
  const pause = useUtilityTimerStore((s) => s.pause)
  const reset = useUtilityTimerStore((s) => s.reset)
  const dismiss = useUtilityTimerStore((s) => s.dismiss)
  const alarmTracks = useMemo(() => tracks.slice(0, 250), [tracks])
  useEffect(() => { if (!alarmPath && tracks[0]) setAlarmPath(tracks[0].path) }, [alarmPath, setAlarmPath, tracks])

  return (
    <div className={`mx-auto flex max-w-3xl flex-col gap-5 ${fullscreen ? 'pt-14' : ''}`}>
      <div className="text-center">
        <TimerReadout fullscreen={fullscreen} />
        {ringing && <button onClick={dismiss} className="mt-3 metal-key is-primary px-4 py-2 font-term text-[12px]">Dismiss</button>}
      </div>
      <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-3">
        <NumberField label="Min" value={minutes} max={1439} disabled={running} onChange={(v) => setDurationInput(v, seconds)} />
        <NumberField label="Sec" value={seconds} max={59} disabled={running} onChange={(v) => setDurationInput(minutes, v)} />
      </div>
      <div className="mx-auto flex flex-wrap items-center justify-center gap-2">
        <ToolButton primary onClick={running ? pause : start}>{running ? <Pause size={13} /> : <Play size={13} />}{running ? 'Pause' : 'Start'}</ToolButton>
        <ToolButton onClick={reset}><RotateCcw size={12} />Reset</ToolButton>
      </div>
      <div className="mx-auto grid w-full max-w-xl min-w-0 gap-3 p-3" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.15)', background: 'rgb(var(--accent-rgb) / 0.03)' }}>
        <label className="grid min-w-0 gap-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
          Alarm action
          <select value={alarmAction} onChange={(e) => setAlarmAction(e.target.value as AlarmAction)} className="min-w-0 w-full max-w-full px-2 py-2 font-term text-[12px] normal-case tracking-normal" style={inputStyle} onFocus={focusInput} onBlur={blurInput}>
            <option value="song">Play selected song</option>
            <option value="stop">Stop current music</option>
          </select>
        </label>
        {alarmAction === 'song' && (
          <label className="grid min-w-0 gap-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
            Alarm song
            <select value={alarmPath} onChange={(e) => setAlarmPath(e.target.value)} className="min-w-0 w-full max-w-full truncate px-2 py-2 font-term text-[12px] normal-case tracking-normal" style={inputStyle} onFocus={focusInput} onBlur={blurInput}>
              {alarmTracks.map((t) => <option key={t.path} value={t.path}>{t.title} - {t.artist || 'Unknown artist'}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

// Isolated so only this tiny node re-renders on the once-per-second countdown
// tick — keeping the parent panel (and its up-to-250-option alarm <select>) out
// of the per-tick render path. remaining() returns ceil-seconds, so this
// re-renders ~1×/sec while running and not at all when paused.
function TimerReadout({ fullscreen }: { fullscreen: boolean }) {
  const remainingSecs = useUtilityTimerStore((s) => s.remaining())
  return <Readout fullscreen={fullscreen}>{formatTimer(remainingSecs)}</Readout>
}

function Stopwatch({ fullscreen }: { fullscreen: boolean }) {
  const startRef = useRef(0)
  const baseRef = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [laps, setLaps] = useState<number[]>([])
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setElapsed(baseRef.current + Date.now() - startRef.current), 34)
    return () => window.clearInterval(id)
  }, [running])
  const start = () => { startRef.current = Date.now(); baseRef.current = elapsed; setRunning(true) }
  const pause = () => { baseRef.current = elapsed; setRunning(false) }
  const reset = () => { baseRef.current = 0; setElapsed(0); setRunning(false); setLaps([]) }
  return (
    <div className={`mx-auto flex max-w-2xl flex-col items-center gap-5 ${fullscreen ? 'pt-20' : ''}`}>
      <Readout fullscreen={fullscreen}>{formatMs(elapsed)}</Readout>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <ToolButton primary onClick={running ? pause : start}>{running ? <Pause size={13} /> : <Play size={13} />}{running ? 'Pause' : 'Start'}</ToolButton>
        <ToolButton onClick={() => setLaps((l) => [elapsed, ...l].slice(0, 12))} disabled={elapsed <= 0}>Lap</ToolButton>
        <ToolButton onClick={reset}><RotateCcw size={12} />Reset</ToolButton>
      </div>
      <div className="grid max-h-60 w-full gap-1 overflow-y-auto p-2" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.12)', background: 'rgb(var(--accent-rgb) / 0.02)' }}>
        {laps.length === 0 ? (
          <p className="py-8 text-center font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}>No laps</p>
        ) : laps.map((lap, i) => (
          <div key={`${lap}-${i}`} className="flex items-center justify-between px-3 py-2" style={{ background: 'rgb(var(--accent-rgb) / 0.04)', border: '1px solid rgb(var(--accent-rgb) / 0.08)' }}>
            <span className="font-mono text-[11px]" style={{ color: 'rgb(var(--ink-rgb) / 0.40)' }}>Lap {laps.length - i}</span>
            <span className="font-lcd tabular-nums text-[13px]" style={{ color: 'var(--ink)' }}>{formatMs(lap)}</span>
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
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id) }, [])
  useEffect(() => { window.localStorage.setItem(CLOCKS_KEY, JSON.stringify(clocks)) }, [clocks])

  function addClock() {
    if (!selectedZone) return
    setClocks((items) => [...items, { id: makeClockId(), label: newClockName.trim() || defaultClockLabel(selectedZone), zone: selectedZone }])
    setNewClockName(''); setAdding(false)
  }
  const renameClock = (id: string, label: string) => setClocks((items) => items.map((c) => c.id === id ? { ...c, label } : c))
  const removeClock = (id: string) => setClocks((items) => items.length <= 1 ? items : items.filter((c) => c.id !== id))

  return (
    <div className={`mx-auto max-w-4xl ${fullscreen ? 'pt-14' : ''}`}>
      <div className="mb-3 flex items-center justify-end gap-2">
        {adding && (
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(90px,160px)_minmax(120px,1fr)] gap-2">
            <input value={newClockName} onChange={(e) => setNewClockName(e.target.value)} placeholder="clock name" className="min-w-0 px-2 py-1.5 font-term text-[12px] placeholder:opacity-30" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
            <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)} className="min-w-0 w-full px-2 py-1.5 font-term text-[12px]" style={inputStyle} onFocus={focusInput} onBlur={blurInput}>
              {timeZones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        )}
        {adding ? (
          <button onClick={addClock} className="metal-key is-primary gap-1.5 px-3 py-1.5 font-term text-[12px]" disabled={timeZones.length === 0}><Plus size={12} />Add</button>
        ) : (
          <button onClick={() => { if (timeZones[0]) setSelectedZone(timeZones[0]); setAdding(true) }} className="metal-key gap-1.5 px-3 py-1.5 font-term text-[12px]" disabled={timeZones.length === 0}><Plus size={12} />Clock</button>
        )}
      </div>
      <div className={`grid gap-3 ${fullscreen ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {clocks.map((clock) => (
          <div key={clock.id} className="p-4" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.15)', background: 'rgb(var(--accent-rgb) / 0.03)' }}>
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <input value={clock.label} onChange={(e) => renameClock(clock.id, e.target.value)} title="Clock name"
                className="min-w-0 flex-1 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] bg-transparent border border-transparent transition-colors"
                style={{ color: 'var(--accent2)', borderRadius: 0, outline: 'none' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--accent-rgb) / 0.30)')}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; if (!clock.label.trim()) renameClock(clock.id, defaultClockLabel(clock.zone)) }} />
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 truncate font-term text-[10px]" style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}>{clock.zone}</p>
                <button onClick={() => removeClock(clock.id)} disabled={clocks.length <= 1} className="transition-colors disabled:opacity-20" style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgb(var(--ink-rgb) / 0.30)')} title="Remove clock"><X size={12} /></button>
              </div>
            </div>
            <p className="font-lcd text-3xl tabular-nums phosphor-glow" style={{ color: 'var(--accent)' }}>
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: clock.zone })}
            </p>
            <p className="mt-1.5 font-term text-[11px]" style={{ color: 'rgb(var(--ink-rgb) / 0.40)' }}>
              {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: clock.zone })}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function readClocks(): ClockInfo[] {
  try {
    const raw = window.localStorage.getItem(CLOCKS_KEY)
    if (!raw) return DEFAULT_CLOCKS
    const parsed = JSON.parse(raw) as Array<Partial<ClockInfo>>
    const valid = parsed.filter((c) => typeof c.label === 'string' && typeof c.zone === 'string' && isValidTimeZone(c.zone))
      .map((c) => ({ id: typeof c.id === 'string' ? c.id : makeClockId(), label: c.label!.trim() || defaultClockLabel(c.zone!), zone: c.zone! }))
    return valid.length > 0 ? valid : DEFAULT_CLOCKS
  } catch { return DEFAULT_CLOCKS }
}

function getSupportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (k: 'timeZone') => string[] }
  const zones = intl.supportedValuesOf?.('timeZone') ?? ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney']
  return [...zones].sort((a, b) => a.localeCompare(b))
}
function isValidTimeZone(zone: string): boolean { try { new Intl.DateTimeFormat(undefined, { timeZone: zone }).format(new Date()); return true } catch { return false } }
function defaultClockLabel(zone: string): string { return (zone.split('/').pop() || zone).replace(/_/g, ' ') }
function makeClockId(): string { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `clock-${Date.now()}-${Math.random().toString(36).slice(2)}` }
function formatMs(ms: number): string { const s = Math.floor(ms / 1000); const h = Math.floor((ms % 1000) / 10); return `${fmtDuration(s)}.${h.toString().padStart(2, '0')}` }
