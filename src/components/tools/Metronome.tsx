import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Play, Plus, Square, Timer } from 'lucide-react'
import type { ToolProps } from './types'
import { Readout, ToolButton, SegmentedButton } from './shared'
import { MIN_BPM, MAX_BPM, clampBpm, bpmToInterval, tapTempo } from '@/lib/tools/metronome'

const BPM_KEY = 'terraplayer.metronome.bpm'
const BEATS_KEY = 'terraplayer.metronome.beats'

const TIME_SIGS = [2, 3, 4, 6] as const
const LOOKAHEAD_MS = 25 // how often the scheduler wakes up
const SCHEDULE_AHEAD = 0.1 // seconds of audio to schedule into the future
const TAP_WINDOW = 6 // most recent taps to average
const TAP_RESET_MS = 2000 // forget the tap streak after this idle gap

function readStoredInt(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

export default function Metronome({ fullscreen }: ToolProps) {
  const [bpm, setBpm] = useState(() => clampBpm(readStoredInt(BPM_KEY, 120)))
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(() => {
    const stored = readStoredInt(BEATS_KEY, 4)
    return (TIME_SIGS as readonly number[]).includes(stored) ? stored : 4
  })
  const [running, setRunning] = useState(false)
  // The beat index that is currently sounding (-1 = idle), used to pulse the dots.
  const [activeBeat, setActiveBeat] = useState(-1)

  // --- Audio scheduling refs (kept out of React state so the scheduler reads fresh values) ---
  const audioCtxRef = useRef<AudioContext | null>(null)
  const schedulerTimerRef = useRef<number | null>(null)
  const nextNoteTimeRef = useRef(0) // AudioContext time of the next beat to schedule
  const beatCounterRef = useRef(0) // which beat in the measure comes next
  const bpmRef = useRef(bpm)
  const beatsRef = useRef(beatsPerMeasure)
  // Pending UI pulses: {time, beat} queued by the scheduler, flushed by a rAF loop on the clock.
  const pulseQueueRef = useRef<Array<{ time: number; beat: number }>>([])
  const rafRef = useRef<number | null>(null)
  // Oscillators scheduled into the near future but not yet sounded — so Stop can silence them and they
  // can't fire as a stray click on the next Start.
  const scheduledRef = useRef<OscillatorNode[]>([])
  // Tap-tempo state.
  const tapTimesRef = useRef<number[]>([])

  useEffect(() => { bpmRef.current = bpm }, [bpm])
  useEffect(() => { beatsRef.current = beatsPerMeasure }, [beatsPerMeasure])

  // Persist preferences.
  useEffect(() => { try { localStorage.setItem(BPM_KEY, String(bpm)) } catch { /* ignore */ } }, [bpm])
  useEffect(() => { try { localStorage.setItem(BEATS_KEY, String(beatsPerMeasure)) } catch { /* ignore */ } }, [beatsPerMeasure])

  /** Synthesize one click. The first beat of the measure is accented (higher pitch + louder). */
  function scheduleClick(time: number, accent: boolean) {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? 1500 : 1000
    const peak = accent ? 0.5 : 0.32
    // Fast attack, exponential-ish decay for a tight, percussive tick.
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(time)
    osc.stop(time + 0.05)
    scheduledRef.current.push(osc)
    // Free the nodes once they have finished so they don't pile up in memory.
    osc.onended = () => {
      scheduledRef.current = scheduledRef.current.filter((o) => o !== osc)
      try { osc.disconnect(); gain.disconnect() } catch { /* already gone */ }
    }
  }

  /** Lookahead scheduler: queue every beat that falls inside the next SCHEDULE_AHEAD window. */
  const scheduler = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
      const beat = beatCounterRef.current
      const accent = beat === 0
      scheduleClick(nextNoteTimeRef.current, accent)
      pulseQueueRef.current.push({ time: nextNoteTimeRef.current, beat })
      // Advance to the next beat using the *current* bpm so tempo changes apply immediately.
      nextNoteTimeRef.current += bpmToInterval(bpmRef.current) / 1000
      beatCounterRef.current = (beat + 1) % beatsRef.current
    }
  }, [])

  /** Drive the visual beat dots in sync with the audio clock. */
  const visualLoop = useCallback(() => {
    const ctx = audioCtxRef.current
    if (ctx) {
      const now = ctx.currentTime
      const q = pulseQueueRef.current
      while (q.length > 0 && q[0].time <= now) {
        const next = q.shift()!
        setActiveBeat(next.beat)
      }
    }
    rafRef.current = requestAnimationFrame(visualLoop)
  }, [])

  const stop = useCallback(() => {
    if (schedulerTimerRef.current != null) {
      window.clearInterval(schedulerTimerRef.current)
      schedulerTimerRef.current = null
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    pulseQueueRef.current = []
    // Silence any clicks scheduled into the near future so they can't fire as a stray click on next Start.
    for (const osc of scheduledRef.current.slice()) { try { osc.onended = null; osc.stop(); osc.disconnect() } catch { /* already stopped */ } }
    scheduledRef.current = []
    setRunning(false)
    setActiveBeat(-1)
    // Suspend (not close) so Start is instant and cheap; full teardown happens on unmount.
    audioCtxRef.current?.suspend().catch(() => { /* ignore */ })
  }, [])

  const start = useCallback(() => {
    let ctx = audioCtxRef.current
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
      audioCtxRef.current = ctx
    }
    ctx.resume().catch(() => { /* ignore */ })
    beatCounterRef.current = 0
    nextNoteTimeRef.current = ctx.currentTime + 0.06 // tiny offset so the first click isn't clipped
    pulseQueueRef.current = []
    setRunning(true)
    setActiveBeat(-1)
    scheduler()
    schedulerTimerRef.current = window.setInterval(scheduler, LOOKAHEAD_MS)
    rafRef.current = requestAnimationFrame(visualLoop)
  }, [scheduler, visualLoop])

  const toggle = useCallback(() => { running ? stop() : start() }, [running, start, stop])

  // Tap tempo: record a timestamp, derive BPM from the recent window.
  const tap = useCallback(() => {
    const now = performance.now()
    const taps = tapTimesRef.current
    // Restart the streak if the user paused too long between taps.
    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_RESET_MS) taps.length = 0
    taps.push(now)
    if (taps.length > TAP_WINDOW) taps.shift()
    if (taps.length >= 2) setBpm(tapTempo(taps))
  }, [])

  const nudge = useCallback((delta: number) => setBpm((b) => clampBpm(b + delta)), [])

  // Keyboard: Space toggles, arrows nudge, T taps. Guarded against firing while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === ' ') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); nudge(1) }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1) }
      else if (e.key.toLowerCase() === 't') { e.preventDefault(); tap() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, nudge, tap])

  // CRITICAL: full teardown on unmount — stop audio, clear timers, cancel rAF, close the AudioContext.
  useEffect(() => {
    return () => {
      if (schedulerTimerRef.current != null) window.clearInterval(schedulerTimerRef.current)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => { /* ignore */ })
    }
  }, [])

  const dotSize = fullscreen ? 'h-7 w-7' : 'h-5 w-5'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 ${fullscreen ? 'gap-10 py-10' : 'py-4'}`}>
        {/* BPM readout */}
        <div className="flex flex-col items-center">
          <Readout fullscreen={fullscreen} size="lg">{bpm}</Readout>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'rgb(var(--accent2-rgb) / 0.6)' }}>
            BPM &middot; {beatsPerMeasure}/4
          </p>
        </div>

        {/* Beat dots */}
        <div className={`flex items-center justify-center gap-3 ${fullscreen ? 'gap-5' : ''}`}>
          {Array.from({ length: beatsPerMeasure }, (_, i) => {
            const isActive = running && activeBeat === i
            const isAccent = i === 0
            return (
              <div
                key={i}
                className={`${dotSize} rounded-full transition-all duration-75`}
                style={{
                  background: isActive
                    ? (isAccent ? 'var(--accent)' : 'rgb(var(--accent-rgb) / 0.85)')
                    : 'rgb(var(--accent-rgb) / 0.10)',
                  border: isAccent
                    ? '2px solid rgb(var(--accent-rgb) / 0.65)'
                    : '1px solid rgb(var(--accent-rgb) / 0.30)',
                  boxShadow: isActive ? '0 0 14px 2px rgb(var(--accent-rgb) / 0.65)' : 'none',
                  transform: isActive ? 'scale(1.2)' : 'scale(1)',
                }}
              />
            )
          })}
        </div>

        {/* BPM slider + nudge buttons */}
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <div className="flex w-full items-center gap-3">
            <button
              onClick={() => nudge(-1)}
              title="Slower (Down)"
              className="metal-key h-8 w-8 flex-shrink-0 justify-center"
            >
              <Minus size={14} />
            </button>
            <input
              type="range"
              min={MIN_BPM}
              max={MAX_BPM}
              step={1}
              value={bpm}
              onChange={(e) => setBpm(clampBpm(Number(e.target.value)))}
              className="w-full"
              aria-label="Tempo in beats per minute"
              style={{ accentColor: 'var(--accent)' }}
            />
            <button
              onClick={() => nudge(1)}
              title="Faster (Up)"
              className="metal-key h-8 w-8 flex-shrink-0 justify-center"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex w-full justify-between font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--ink-rgb) / 0.35)' }}>
            <span>{MIN_BPM}</span>
            <span>{MAX_BPM}</span>
          </div>
        </div>

        {/* Time signature */}
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
            Time signature
          </span>
          <div className="flex items-center gap-1.5">
            {TIME_SIGS.map((n) => (
              <SegmentedButton
                key={n}
                active={beatsPerMeasure === n}
                onClick={() => setBeatsPerMeasure(n)}
                title={`${n}/4 time`}
              >
                <span className="font-term text-[13px]">{n}/4</span>
              </SegmentedButton>
            ))}
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-3">
          <ToolButton primary onClick={toggle} title={running ? 'Stop (Space)' : 'Start (Space)'}>
            {running ? <Square size={13} /> : <Play size={13} />}
            {running ? 'Stop' : 'Start'}
          </ToolButton>
          <ToolButton onClick={tap} title="Tap Tempo (T)">
            <Timer size={13} />
            Tap
          </ToolButton>
        </div>
      </div>
    </div>
  )
}
