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
  const {
    running,
    ringing,
    alarmAction,
    alarmPath,
    setNow,
    markExpired,
    dismiss,
    remaining,
  } = useUtilityTimerStore()

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      useUtilityTimerStore.getState().setNow(now)
      const state = useUtilityTimerStore.getState()
      if (state.running && state.remaining() <= 0) state.markExpired()
    }, 250)
    return () => window.clearInterval(id)
  }, [])

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

  const label = ringing ? 'Timer done' : formatTimer(remaining())

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
        className={`fixed bottom-[70px] left-60 z-20 flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-mono tabular-nums shadow-lg backdrop-blur-xl transition-colors ${
          ringing
            ? 'border-aero-aqua/40 bg-aero-aqua/14 text-aero-aqua'
            : 'border-white/[0.07] bg-white/[0.055] text-muted/65 hover:text-aero-aqua'
        }`}
      >
        <AlarmClock size={13} />
        {label}
      </button>
    </>
  )
}
