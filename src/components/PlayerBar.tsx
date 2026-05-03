import React, { useEffect, useRef, useState } from 'react'
import {
  SkipBack, Play, Pause, SkipForward,
  Volume2, VolumeX,
  Shuffle, Repeat, Repeat1,
  Maximize2, MonitorPlay, ListMusic,
  Tag, X, SlidersHorizontal,
} from 'lucide-react'
import { usePlayerStore } from '@/store/player'
import { useLibraryStore } from '@/store/library'
import { useContextMenuStore } from '@/store/contextMenu'
import { trackUrl, fmtDuration } from '@/lib/ipc'
import { connectAudioElement, resumeContext, setEqGains, startPublishing, stopPublishing } from '@/lib/audio'
import Visualizer from './Visualizer'
import type { DisplayInfo, QueueSnapshotTrack } from '@/lib/ipc'
import placeholderCover from '@/assets/y2k-note-placeholder.png'

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying, setPlaying,
    volume, setVolume,
    currentTime, setCurrentTime,
    duration, setDuration,
    next, prev,
    shuffle, toggleShuffle,
    repeat, cycleRepeat,
    vizFullscreen, setVizFullscreen,
    upNext, clearUpNext,
    eq, setEqPreset, setEqBand,
  } = usePlayerStore()

  const { openPanel, rightPanelOpen, panelMode } = useLibraryStore()
  const { openMenu } = useContextMenuStore()

  const audioRef = useRef<HTMLAudioElement>(null)
  const connectedRef = useRef(false)
  const [showVolume, setShowVolume] = useState(false)
  const [showEnhance, setShowEnhance] = useState(false)
  const [showDisplayPicker, setShowDisplayPicker] = useState(false)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [popoutOpen, setPopoutOpen] = useState(false)
  const track = currentTrack()

  useEffect(() => {
    const el = audioRef.current
    if (!el || connectedRef.current) return
    connectAudioElement(el)
    connectedRef.current = true
  }, [])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !track) return
    el.src = trackUrl(track.path)
    el.load()
    if (isPlaying) {
      resumeContext()
      el.play().catch(() => {})
    }
  }, [track?.id])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (isPlaying) {
      resumeContext()
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [isPlaying])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    if (popoutOpen) startPublishing()
    else stopPublishing()
    return stopPublishing
  }, [popoutOpen])

  useEffect(() => {
    const unsub = window.hub.onMainFullscreenChange((fs) => {
      if (!fs) setVizFullscreen(false)
    })
    return unsub
  }, [setVizFullscreen])

  useEffect(() => {
    const unsub = window.hub.onPopoutClosed(() => setPopoutOpen(false))
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.hub.onVisualizerCommand((command) => {
      if (command.type === 'prev') prev()
      if (command.type === 'next') next()
      if (command.type === 'toggle') setPlaying(!usePlayerStore.getState().isPlaying)
      if (command.type === 'seek') seekTo(command.time)
      if (command.type === 'volume') setVolume(command.volume)
    })
    return unsub
  }, [next, prev, setPlaying, setVolume])

  useEffect(() => {
    const state = usePlayerStore.getState()
    const activeQueue = state.activeQueue()
    const queueIndex = state.queueIndex
    const toQueueTrack = (item: typeof activeQueue[number]): QueueSnapshotTrack => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      duration: item.duration,
      coverDataUrl: item.coverDataUrl,
    })

    window.hub.publishPlaybackState({
      isPlaying,
      title: track?.title ?? '',
      artist: track?.artist ?? '',
      coverDataUrl: track?.coverDataUrl ?? null,
      currentTime,
      duration,
      volume,
      queue: {
        nowPlaying: track ? toQueueTrack(track) : null,
        upNext: state.upNext.slice(0, 24).map(toQueueTrack),
        comingUp: activeQueue.slice(queueIndex + 1, queueIndex + 25).map(toQueueTrack),
      },
    })
  }, [isPlaying, track?.id, track?.title, track?.artist, track?.coverDataUrl, currentTime, duration, volume, upNext])

  useEffect(() => {
    setEqGains(eq.low, eq.mid, eq.high)
  }, [eq.low, eq.mid, eq.high])

  function seekTo(t: number) {
    const liveDuration = usePlayerStore.getState().duration || audioRef.current?.duration || duration || 0
    const bounded = Math.max(0, Math.min(liveDuration, t))
    setCurrentTime(bounded)
    if (audioRef.current) audioRef.current.currentTime = bounded
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    seekTo(Number(e.target.value))
  }

  function handleSeekPointer(e: React.PointerEvent<HTMLDivElement>) {
    if (!Number.isFinite(duration) || duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seekTo(ratio * duration)
  }

  function handleEnded() {
    if (repeat === 'one') {
      const el = audioRef.current
      setCurrentTime(0)
      if (el) {
        el.currentTime = 0
        resumeContext()
        el.play().catch(() => {})
      }
    } else {
      const state = usePlayerStore.getState()
      const atEndOfQueue = state.queueIndex >= state.activeQueue().length - 1
      if (state.repeat === 'off' && state.upNext.length === 0 && atEndOfQueue) {
        setPlaying(false)
        return
      }
      next()
    }
  }

  async function handleToggleFullscreen() {
    const entering = !vizFullscreen
    await window.hub.setMainFullscreen(entering)
    setVizFullscreen(entering)
  }

  async function handleDisplayPicker() {
    if (popoutOpen) {
      await window.hub.closeVisualizerPopout()
      setPopoutOpen(false)
      setShowDisplayPicker(false)
      return
    }
    const list = await window.hub.listDisplays()
    setDisplays(list)
    if (list.length === 1) {
      await window.hub.openVisualizerPopout(list[0].id)
      setPopoutOpen(true)
    } else {
      setShowDisplayPicker((v) => !v)
    }
  }

  async function handlePickDisplay(displayId: number) {
    await window.hub.openVisualizerPopout(displayId)
    setPopoutOpen(true)
    setShowDisplayPicker(false)
  }

  function handleCoverContextMenu(e: React.MouseEvent) {
    if (!track) return
    e.preventDefault()
    openMenu(e.clientX, e.clientY, [
      {
        label: 'View / edit tags',
        icon: <Tag size={12} />,
        onClick: () => openPanel('metadata'),
      },
      ...(upNext.length > 0 ? [{
        label: 'Clear Up Next',
        icon: <X size={12} />,
        onClick: clearUpNext,
        danger: true,
      }] : []),
    ])
  }

  function handleQueueToggle() {
    if (rightPanelOpen && panelMode === 'queue') {
      useLibraryStore.setState({ rightPanelOpen: false })
    } else {
      openPanel('queue')
    }
  }

  const queueActive = rightPanelOpen && panelMode === 'queue'

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  const repeatIcon = repeat === 'one'
    ? <Repeat1 size={14} className="text-aero-aqua" />
    : <Repeat size={14} className={repeat === 'all' ? 'text-aero-aqua' : 'text-muted/40'} />

  return (
    <div className="relative h-[62px] glass border-t border-aero-sky/10 flex items-center px-4 gap-3 select-none">
      {/* Seekbar — hairline at top */}
      <div
        className="absolute top-0 left-0 right-0 h-3 group cursor-pointer"
        onPointerDown={handleSeekPointer}
        onPointerMove={(e) => {
          if (e.buttons === 1) handleSeekPointer(e)
        }}
      >
        <div className="absolute left-0 right-0 top-0 h-[3px] bg-white/[0.06]" />
        <div
          className="absolute left-0 top-0 h-[3px] bg-gradient-to-r from-fuchsia-400 via-aero-aqua to-aero-lime transition-none shadow-[0_0_10px_rgba(127,233,208,0.55)]"
          style={{ width: `${progressPct}%` }}
        />
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* Cover + track info */}
      <div
        className="flex items-center gap-3 w-52 flex-shrink-0 cursor-default"
        onContextMenu={handleCoverContextMenu}
      >
        <div className="w-9 h-9 rounded-md overflow-hidden bg-white/[0.05] flex-shrink-0 ring-1 ring-aero-aqua/15 shadow-[0_0_16px_rgba(127,233,208,0.10)]">
          <img src={track?.coverDataUrl ?? placeholderCover} alt="cover" className="w-full h-full object-cover" />
        </div>
        {track ? (
          <div className="min-w-0">
            <p className="text-ink-100/90 text-[13px] font-medium truncate leading-tight">{track.title}</p>
            <p className="text-muted/60 text-[11px] truncate mt-0.5">{track.artist}</p>
          </div>
        ) : (
          <p className="text-muted/40 text-[12px]">Nothing playing</p>
        )}
      </div>

      {/* Transport + shuffle/repeat */}
      <div className="flex-1 flex items-center justify-center gap-3">
        <span className="text-[11px] font-mono text-muted/30 w-8 text-right tabular-nums">
          {fmtDuration(currentTime)}
        </span>

        <button
          onClick={toggleShuffle}
          title="Shuffle"
          className="transition-colors"
        >
          <Shuffle size={14} className={shuffle ? 'text-aero-aqua' : 'text-muted/35 hover:text-muted/70'} />
        </button>

        <button onClick={prev} className="text-muted/50 hover:text-ink-100/80 transition-colors">
          <SkipBack size={17} />
        </button>

        <button
          onClick={() => setPlaying(!isPlaying)}
          className="pill-glossy w-8 h-8 rounded-full flex items-center justify-center text-ink-100/90 transition-all"
        >
          {isPlaying
            ? <Pause size={14} className="fill-ink-100/90" />
            : <Play size={14} className="fill-ink-100/90 ml-0.5" />
          }
        </button>

        <button onClick={next} className="text-muted/50 hover:text-ink-100/80 transition-colors">
          <SkipForward size={17} />
        </button>

        <button
          onClick={cycleRepeat}
          title={`Repeat: ${repeat}`}
          className="transition-colors"
        >
          {repeatIcon}
        </button>

        <span className="text-[11px] font-mono text-muted/30 w-8 tabular-nums">
          {fmtDuration(duration)}
        </span>
      </div>

      {/* Visualizer + fullscreen controls + queue + volume */}
      <div className="flex items-center gap-2 w-64 flex-shrink-0 justify-end">
        <Visualizer height={32} />

        {/* Queue toggle */}
        <button
          onClick={handleQueueToggle}
          title="Up Next queue"
          className="relative text-muted/35 hover:text-aero-aqua transition-colors"
        >
          <ListMusic size={14} className={queueActive ? 'text-aero-aqua' : ''} />
          {upNext.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-aero-aqua text-[7px] font-bold text-surface-400 flex items-center justify-center leading-none">
              {upNext.length > 9 ? '9+' : upNext.length}
            </span>
          )}
        </button>

        <button
          onClick={handleToggleFullscreen}
          title="Fullscreen visualizer"
          className="text-muted/35 hover:text-aero-aqua transition-colors"
        >
          <Maximize2 size={14} className={vizFullscreen ? 'text-aero-aqua' : ''} />
        </button>

        {/* Popout display picker */}
        <div className="relative">
          <button
            onClick={handleDisplayPicker}
            title={popoutOpen ? 'Close visualizer popout' : 'Pop out to display'}
            className="text-muted/35 hover:text-aero-sky transition-colors"
          >
            <MonitorPlay size={14} className={popoutOpen ? 'text-aero-sky' : ''} />
          </button>

          {showDisplayPicker && displays.length > 1 && (
            <div className="absolute bottom-10 right-0 glass rounded-xl px-3 py-2.5 shadow-2xl min-w-[170px] z-20">
              <p className="text-[9px] font-mono text-muted/40 uppercase tracking-[0.12em] mb-2">
                Choose display
              </p>
              {displays.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handlePickDisplay(d.id)}
                  className="w-full text-left text-[12px] py-1.5 px-1.5 rounded flex items-center gap-2 text-ink-100/65 hover:text-aero-aqua hover:bg-white/[0.05] transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      d.primary ? 'bg-aero-lime' : 'bg-aero-sky'
                    }`}
                  />
                  <span className="truncate flex-1">{d.label || `Display ${d.id}`}</span>
                  {d.primary && (
                    <span className="text-[9px] text-muted/40 font-mono">main</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Volume */}
        <div className="relative flex items-center">
          <button
            onClick={() => setShowEnhance((v) => !v)}
            className={`text-muted/40 hover:text-aero-aqua transition-colors ${eq.preset !== 'off' || eq.low || eq.mid || eq.high ? 'text-aero-aqua' : ''}`}
            title="Audio enhancement"
          >
            <SlidersHorizontal size={15} />
          </button>
          {showEnhance && (
            <div className="absolute bottom-9 right-0 glass rounded-xl px-3 py-2.5 shadow-xl w-56">
              <p className="text-[9px] font-mono text-muted/40 uppercase tracking-[0.12em] mb-2">Enhance</p>
              <div className="grid grid-cols-2 gap-1 mb-3">
                {([
                  ['off', 'Flat'],
                  ['polish', 'YT Polish'],
                  ['bass', 'Bass Lift'],
                  ['voice', 'Voice'],
                ] as const).map(([preset, label]) => (
                  <button
                    key={preset}
                    onClick={() => setEqPreset(preset)}
                    className={`rounded-md px-2 py-1 text-[10px] transition-colors ${
                      eq.preset === preset
                        ? 'bg-aero-aqua/15 text-aero-aqua'
                        : 'bg-white/[0.04] text-muted/70 hover:text-white/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(['low', 'mid', 'high'] as const).map((band) => (
                <label key={band} className="grid grid-cols-[34px_1fr_28px] items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-muted/50 mb-2">
                  <span>{band}</span>
                  <input
                    type="range"
                    min={-8}
                    max={8}
                    step={0.5}
                    value={eq[band]}
                    onChange={(e) => setEqBand(band, Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="text-right font-mono tabular-nums">{eq[band] > 0 ? '+' : ''}{eq[band]}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex items-center gap-1.5">
          <button
            onClick={() => setShowVolume((v) => !v)}
            className="text-muted/40 hover:text-muted/80 transition-colors"
          >
            {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          {showVolume && (
            <div className="absolute bottom-9 right-0 glass rounded-xl px-3 py-2 shadow-xl">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20 cursor-pointer"
                style={{ writingMode: 'horizontal-tb' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
