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
import { connectAudioElement, resumeContext, setEqGains, setPreampDb, setMono, startPublishing, stopPublishing } from '@/lib/audio'
import { useSettingsStore } from '@/store/settings'
import Visualizer from './Visualizer'
import VectorGridCover from './VectorGridCover'
import type { DisplayInfo, QueueSnapshotTrack } from '@/lib/ipc'

const POPOVER_STYLE: React.CSSProperties = {
  background: 'rgba(2,5,3,0.97)',
  border: '1px solid rgb(var(--accent-rgb) / 0.30)',
  borderRadius: 0,
  boxShadow: '0 0 14px rgb(var(--accent-rgb) / 0.15)',
}

// Static progress-bar tick marks — they never change, so build the 21 elements
// once at module load instead of re-running Array.from (and allocating 21 nodes)
// on every PlayerBar render, which happens ~4×/sec as the time updates.
const TICK_MARKS = Array.from({ length: 21 }, (_, i) => (
  <div
    key={i}
    className="absolute"
    style={{
      left: `${i * 5}%`,
      top: 4,
      width: 1,
      height: i % 5 === 0 ? 4 : 2,
      background: 'rgb(var(--accent-rgb) / 0.30)',
    }}
  />
))

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

  const { openPanel, rightPanelOpen, panelMode, selectTrack } = useLibraryStore()
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
    if (popoutOpen) startPublishing(() => usePlayerStore.getState().isPlaying)
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
    if (!popoutOpen) return // no popout consumer — skip IPC entirely
    const state = usePlayerStore.getState()
    const activeQueue = state.activeQueue()
    const queueIndex = state.queueIndex
    const toQueueTrack = (item: typeof activeQueue[number]): QueueSnapshotTrack => ({
      id: item.id, title: item.title, artist: item.artist, duration: item.duration, coverUrl: item.coverUrl,
    })
    window.hub.publishPlaybackState({
      isPlaying, title: track?.title ?? '', artist: track?.artist ?? '', coverUrl: track?.coverUrl ?? null,
      currentTime, duration, volume,
      queue: {
        nowPlaying: track ? toQueueTrack(track) : null,
        upNext: state.upNext.slice(0, 24).map(toQueueTrack),
        comingUp: activeQueue.slice(queueIndex + 1, queueIndex + 25).map(toQueueTrack),
      },
    })
  }, [isPlaying, track?.id, track?.title, track?.artist, track?.coverUrl, currentTime, duration, volume, upNext, popoutOpen])

  useEffect(() => {
    setEqGains(eq.low, eq.mid, eq.high)
  }, [eq.low, eq.mid, eq.high])

  // Apply persisted pre-amp + mono prefs to the Web Audio graph (initial + on change).
  const preampDb = useSettingsStore((s) => s.preampDb)
  const mono = useSettingsStore((s) => s.mono)
  useEffect(() => { setPreampDb(preampDb) }, [preampDb])
  useEffect(() => { setMono(mono) }, [mono])

  function seekTo(t: number) {
    const liveDuration = usePlayerStore.getState().duration || audioRef.current?.duration || duration || 0
    const bounded = Math.max(0, Math.min(liveDuration, t))
    setCurrentTime(bounded)
    if (audioRef.current) audioRef.current.currentTime = bounded
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
      if (el) { el.currentTime = 0; resumeContext(); el.play().catch(() => {}) }
    } else {
      const state = usePlayerStore.getState()
      const atEndOfQueue = state.queueIndex >= state.activeQueue().length - 1
      if (state.repeat === 'off' && state.upNext.length === 0 && atEndOfQueue) { setPlaying(false); return }
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
      { label: 'View / edit tags', icon: <Tag size={12} />, onClick: () => openPanel('metadata') },
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
  const trackId = track?.id ? String(track.id).padStart(3, '0') : '000'

  return (
    <div
      className="relative flex items-center px-[14px] gap-[14px] select-none"
      style={{
        height: 80,
        background: 'linear-gradient(180deg, #060a07 0%, var(--bg-1) 100%)',
        borderTop: '1px solid rgb(var(--accent-rgb) / 0.30)',
        boxShadow: 'inset 0 1px 0 rgb(var(--ink-rgb) / 0.05), 0 -8px 24px rgba(0,0,0,0.6), 0 -1px 0 rgb(var(--accent-rgb) / 0.55)',
      }}
    >
      {/* Scanline overlay (hidden when the CRT effect is toggled off) */}
      <div className="pb-scanline absolute inset-0 pointer-events-none" />


      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* === LEFT: Cover + meta (240px) === */}
      <div
        className="flex items-center gap-3 flex-shrink-0 relative z-[1] cursor-default"
        style={{ width: 240 }}
        onContextMenu={handleCoverContextMenu}
      >
        <VectorGridCover src={track?.coverUrl} label={`A:${trackId}`} size={60} />
        <div className="min-w-0 flex-1">
          <p
            className="font-lcd text-[14px] truncate leading-tight phosphor-glow"
            style={{ color: 'var(--accent)', letterSpacing: '0.5px', cursor: track ? 'pointer' : 'default' }}
            title={track ? 'Open track properties' : undefined}
            onClick={() => {
              if (!track) return
              selectTrack(track.id)
              openPanel('metadata')
            }}
          >
            {track?.title || 'nothing playing'}
          </p>
          <p className="font-term text-[11px] truncate mt-0.5" style={{ color: 'rgb(var(--ink-rgb) / 0.55)', letterSpacing: '0.5px' }}>
            {track?.artist || ''}
          </p>
          <p className="font-term text-[11px] truncate mt-0.5 uppercase" style={{ color: 'rgb(var(--ink-rgb) / 0.30)', letterSpacing: '1px' }}>
            {track?.album ? `[${track.album}]` : ''}
          </p>
        </div>
      </div>

      {/* === TRANSPORT === */}
      <div className="flex items-center gap-[6px] flex-shrink-0 relative z-[1]">
        <button
          onClick={toggleShuffle}
          title="Shuffle"
          className={`metal-key ${shuffle ? 'is-primary' : ''}`}
          style={{ width: 26, height: 26 }}
        >
          <Shuffle size={11} />
        </button>
        <button onClick={prev} className="metal-key" style={{ width: 26, height: 26 }}>
          <SkipBack size={12} />
        </button>
        <button
          onClick={() => setPlaying(!isPlaying)}
          className="metal-key is-primary"
          style={{ width: 36, height: 36 }}
        >
          {isPlaying
            ? <Pause size={14} />
            : <Play size={14} />}
        </button>
        <button onClick={next} className="metal-key" style={{ width: 26, height: 26 }}>
          <SkipForward size={12} />
        </button>
        <button
          onClick={cycleRepeat}
          title={`Repeat: ${repeat}`}
          className={`metal-key ${repeat !== 'off' ? 'is-primary' : ''}`}
          style={{ width: 26, height: 26 }}
        >
          {repeat === 'one'
            ? <Repeat1 size={11} />
            : <Repeat size={11} />}
        </button>
      </div>

      {/* === CENTER: LCD panel (flex 1) === */}
      <div className="lcd-panel flex-1 min-w-0 relative z-[1]" style={{ padding: '6px 10px' }}>
        {/* Row 1: time + progress + duration */}
        <div className="flex items-center gap-3">
          <span className="font-lcd text-[16px] flex-shrink-0" style={{ color: 'var(--accent)', letterSpacing: 1, textShadow: '0 0 6px rgb(var(--accent-rgb) / 0.88)' }}>
            {fmtDuration(currentTime)}
          </span>

          {/* Progress bar — click/drag to seek */}
          <div
            className="flex-1 relative cursor-pointer"
            style={{ height: 18, touchAction: 'none', padding: '4px 0' }}
            onPointerDown={handleSeekPointer}
            onPointerMove={(e) => { if (e.buttons === 1) handleSeekPointer(e) }}
          >
            {/* Track */}
            <div className="absolute" style={{ left: 0, right: 0, top: 8, height: 2, background: 'rgb(var(--accent-rgb) / 0.10)', borderRadius: 1 }} />
            {/* Fill */}
            <div
              className="absolute"
              style={{ left: 0, top: 8, height: 2, width: `${progressPct}%`, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)', borderRadius: 1 }}
            />
            {/* Tick marks (static — hoisted to a module constant) */}
            {TICK_MARKS}
            {/* Playhead */}
            <div
              className="absolute"
              style={{
                left: `${progressPct}%`,
                top: 4,
                width: 2,
                height: 10,
                background: 'var(--accent)',
                boxShadow: '0 0 6px var(--accent)',
                transform: 'translateX(-1px)',
              }}
            />
          </div>

          <span className="font-lcd text-[16px] flex-shrink-0" style={{ color: 'var(--accent-deep)', letterSpacing: 1 }}>
            {fmtDuration(duration)}
          </span>
        </div>

        {/* Row 2: spectrum + bitrate */}
        <div className="flex items-center gap-3 mt-1">
          <span className="font-mono text-[9px] uppercase tracking-[1.5px] flex-shrink-0" style={{ color: 'var(--accent-deep)' }}>
            SPECTRUM
          </span>
          <div className="flex-1 min-w-0">
            <Visualizer height={18} />
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[1px] flex-shrink-0 ml-auto" style={{ color: 'var(--accent-deep)' }}>
            320 KBPS · 44.1 KHZ · STEREO
          </span>
        </div>
      </div>

      {/* === RIGHT: utilities + volume === */}
      <div className="flex items-center gap-[6px] flex-shrink-0 relative z-[1]">
        {/* EQ */}
        <div className="relative">
          <button
            onClick={() => { setShowEnhance((v) => !v); setShowVolume(false); setShowDisplayPicker(false) }}
            className={`metal-key ${eq.preset !== 'off' || eq.low || eq.mid || eq.high ? 'is-primary' : ''}`}
            style={{ width: 26, height: 26 }}
            title="Audio enhancement"
          >
            <SlidersHorizontal size={11} />
          </button>
          {showEnhance && (
            <div className="absolute bottom-10 right-0 z-20 w-52 px-3 py-2.5 shadow-xl" style={POPOVER_STYLE}>
              <p className="font-mono text-[9px] uppercase tracking-[1.5px] mb-2" style={{ color: 'var(--accent2)' }}>ENHANCE</p>
              <div className="grid grid-cols-2 gap-1 mb-3">
                {([['off', 'Flat'], ['polish', 'YT Polish'], ['bass', 'Bass Lift'], ['voice', 'Voice']] as const).map(([preset, label]) => (
                  <button
                    key={preset}
                    onClick={() => setEqPreset(preset)}
                    className="font-term text-[13px] px-2 py-1 transition-colors"
                    style={{
                      border: eq.preset === preset ? '1px solid rgb(var(--accent-rgb) / 0.55)' : '1px solid rgb(var(--accent-rgb) / 0.15)',
                      color: eq.preset === preset ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.55)',
                      background: eq.preset === preset ? 'rgb(var(--accent-rgb) / 0.12)' : 'transparent',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(['low', 'mid', 'high'] as const).map((band) => (
                <label key={band} className="grid grid-cols-[34px_1fr_28px] items-center gap-2 mb-2">
                  <span className="font-mono text-[9px] uppercase tracking-[1px]" style={{ color: 'rgb(var(--ink-rgb) / 0.50)' }}>{band}</span>
                  <input
                    type="range" min={-8} max={8} step={0.5} value={eq[band]}
                    onChange={(e) => setEqBand(band, Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="text-right font-mono text-[9px] tabular-nums" style={{ color: 'var(--ink)' }}>
                    {eq[band] > 0 ? '+' : ''}{eq[band]}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Queue */}
        <button
          onClick={handleQueueToggle}
          title="Up Next queue"
          className={`metal-key relative ${queueActive ? 'is-primary' : ''}`}
          style={{ width: 26, height: 26 }}
        >
          <ListMusic size={11} />
          {upNext.length > 0 && (
            <span
              className="absolute -top-1 -right-1 w-3 h-3 font-mono text-[7px] font-bold flex items-center justify-center leading-none"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {upNext.length > 9 ? '9+' : upNext.length}
            </span>
          )}
        </button>

        {/* Fullscreen viz */}
        <button
          onClick={handleToggleFullscreen}
          title="Fullscreen visualizer"
          className={`metal-key ${vizFullscreen ? 'is-primary' : ''}`}
          style={{ width: 26, height: 26 }}
        >
          <Maximize2 size={11} />
        </button>

        {/* Popout */}
        <div className="relative">
          <button
            onClick={handleDisplayPicker}
            title={popoutOpen ? 'Close visualizer popout' : 'Pop out to display'}
            className={`metal-key ${popoutOpen ? 'is-primary' : ''}`}
            style={{ width: 26, height: 26 }}
          >
            <MonitorPlay size={11} />
          </button>
          {showDisplayPicker && displays.length > 1 && (
            <div className="absolute bottom-10 right-0 z-20 px-3 py-2.5 shadow-xl min-w-[170px]" style={POPOVER_STYLE}>
              <p className="font-mono text-[9px] uppercase tracking-[1.5px] mb-2" style={{ color: 'var(--accent2)' }}>CHOOSE DISPLAY</p>
              {displays.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handlePickDisplay(d.id)}
                  className="w-full text-left font-term text-[13px] py-1.5 px-1.5 flex items-center gap-2 transition-colors"
                  style={{ color: 'rgb(var(--ink-rgb) / 0.65)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgb(var(--ink-rgb) / 0.65)')}
                >
                  <span
                    className="w-1.5 h-1.5 flex-shrink-0"
                    style={{ background: d.primary ? '#7CFF6B' : 'var(--accent2)' }}
                  />
                  <span className="truncate flex-1">{d.label || `Display ${d.id}`}</span>
                  {d.primary && <span className="font-mono text-[9px]" style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}>main</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex-shrink-0 mx-1" style={{ width: 1, height: 20, background: 'rgb(var(--ink-rgb) / 0.10)' }} />

        {/* Volume */}
        <Volume2 size={12} style={{ color: 'rgb(var(--ink-rgb) / 0.55)', flexShrink: 0 }} />
        <div
          className="relative flex-shrink-0"
          style={{ width: 70, height: 4, background: 'rgba(0,0,0,0.5)', border: '1px solid rgb(var(--accent-rgb) / 0.20)', cursor: 'pointer' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
          }}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
          }}
        >
          {/* Fill */}
          <div
            style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${volume * 100}%`, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }}
          />
          {/* Knob */}
          <div
            style={{
              position: 'absolute',
              left: `${volume * 100}%`,
              top: '50%',
              width: 6,
              height: 8,
              background: 'var(--ink)',
              border: '1px solid rgba(0,0,0,0.5)',
              transform: 'translate(-3px, -50%)',
            }}
          />
        </div>
        {volume === 0 && <VolumeX size={12} style={{ color: 'rgb(var(--ink-rgb) / 0.55)', flexShrink: 0, marginLeft: -4 }} />}
      </div>
    </div>
  )
}
