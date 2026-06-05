import React, { useEffect, useRef } from 'react'
import { AlarmClock } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { usePlayerStore } from '@/store/player'
import { formatTimer, useUtilityTimerStore } from '@/store/utilityTimer'
import { trackUrl } from '@/lib/ipc'

export default function UtilityTimerHost({ onOpenTimer }: { onOpenTimer: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const alarmStartedRef = useRef(false)
  const tracks = useLibraryStore((s) => s.tracks)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const volume = usePlayerStore((s) => s.volume)
  // Narrow selectors: this host is mounted for the whole app lifetime, so a
  // selector-less subscription would re-render it ~4×/sec forever (setNow fires
  // every 250ms). remainingSecs is the ceil-seconds value, so it re-renders the
  // floating label only when the displayed second changes (~1×/sec, and only
  // while running — remaining() is constant when paused).
  const running = useUtilityTimerStore((s) => s.running)
  const ringing = useUtilityTimerStore((s) => s.ringing)
  const alarmAction = useUtilityTimerStore((s) => s.alarmAction)
  const alarmPath = useUtilityTimerStore((s) => s.alarmPath)
  const setNow = useUtilityTimerStore((s) => s.setNow)
  const dismiss = useUtilityTimerStore((s) => s.dismiss)
  const remainingSecs = useUtilityTimerStore((s) => s.remaining())

  // Only tick while a timer is actually running. When idle there's nothing to
  // count down, so this drops a permanent 4×/sec background wakeup + re-render
  // to zero. markExpired flips running→false, which tears the interval down.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const state = useUtilityTimerStore.getState()
      state.setNow(Date.now())
      if (state.running && state.remaining() <= 0) state.markExpired()
    }, 250)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    setNow(Date.now())
  }, [setNow])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!ringing) {
      alarmStartedRef.current = false
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      return
    }

    if (alarmAction === 'stop') {
      if (alarmStartedRef.current) return
      alarmStartedRef.current = true
      setPlaying(false)
      return
    }

    const track = tracks.find((item) => item.path === alarmPath) ?? tracks[0]
    if (!audio || !track) return
    if (alarmStartedRef.current) return
    alarmStartedRef.current = true
    audio.src = trackUrl(track.path)
    audio.loop = true
    audio.volume = volume
    audio.play().catch(() => {})
  }, [alarmAction, alarmPath, ringing, setPlaying, tracks, volume])

  if (!running && !ringing) return <audio ref={audioRef} />

  const label = ringing ? 'TIMER DONE' : formatTimer(remainingSecs)

  return (
    <>
      <audio ref={audioRef} />
      <button
        onClick={onOpenTimer}
        onContextMenu={(e) => {
          e.preventDefault()
          if (ringing) dismiss()
        }}
        title={ringing ? 'Open timer. Right-click to dismiss.' : 'Open running timer'}
        className={`fixed bottom-[92px] left-60 z-20 flex h-7 items-center gap-2 px-3 font-term text-[12px] tabular-nums shadow-lg transition-colors ${
          ringing ? 'metal-key is-primary' : 'metal-key'
        }`}
        style={ringing ? undefined : { color: 'rgb(var(--ink-rgb) / 0.65)' }}
      >
        <AlarmClock size={12} />
        {label}
      </button>
    </>
  )
}
