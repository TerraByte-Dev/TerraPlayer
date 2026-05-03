import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ListMusic, Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { getAnalyser } from '@/lib/audio'
import { usePlayerStore } from '@/store/player'
import { fmtDuration } from '@/lib/ipc'
import type { PlaybackSnapshot, QueueSnapshotTrack, VisualizerCommand } from '@/lib/ipc'
import placeholderCover from '@/assets/y2k-note-placeholder.png'

interface Bubble {
  x: number; y: number; r: number
  vy: number; vx: number
  hue: number; alpha: number
  isLime: boolean
}

interface Props {
  source?: 'analyser' | 'ipc'
  onClose?: () => void
}

const BAR_COUNT = 64
const SOURCE_BARS = BAR_COUNT / 2
const RING_TICKS = 96

type ColorPreset = 'aqua' | 'violet' | 'lime'

interface VizSettings {
  bars: boolean
  ring: boolean
  bubbles: boolean
  atmosphere: boolean
  colors: ColorPreset
  intensity: number
}

const COLOR_PRESETS: Record<ColorPreset, { base: number; accent: number; name: string }> = {
  aqua: { base: 185, accent: 205, name: 'Aqua' },
  violet: { base: 265, accent: 315, name: 'Violet' },
  lime: { base: 115, accent: 185, name: 'Lime' },
}

const EMPTY_QUEUE = { nowPlaying: null, upNext: [], comingUp: [] }

function logBinRange(barIdx: number, barCount: number, binCount: number): [number, number] {
  const logMax = Math.log2(binCount)
  const lo = Math.round(Math.pow(2, (barIdx / barCount) * logMax))
  const hi = Math.round(Math.pow(2, ((barIdx + 1) / barCount) * logMax))
  return [Math.min(lo, binCount - 1), Math.min(Math.max(hi, lo + 1), binCount)]
}

export default function FullscreenVisualizer({ source = 'analyser', onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const bubblesRef = useRef<Bubble[]>([])
  const ipcFrameRef = useRef<Uint8Array>(new Uint8Array(128))
  const rollingPeakRef = useRef<number[]>(Array(60).fill(0))
  const barPeakRef = useRef<Float32Array>(new Float32Array(BAR_COUNT).fill(0))
  const ringPeakRef = useRef<Float32Array>(new Float32Array(RING_TICKS).fill(0))
  const ringRadiusRef = useRef<number>(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<VizSettings>({
    bars: true,
    ring: true,
    bubbles: true,
    atmosphere: true,
    colors: 'aqua',
    intensity: 1,
  })
  const [ipcPlayback, setIpcPlayback] = useState<PlaybackSnapshot>({
    isPlaying: false,
    title: '',
    artist: '',
    coverDataUrl: null,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    queue: EMPTY_QUEUE,
  })
  const currentTrack = usePlayerStore((s) => s.currentTrack())
  const localPlaying = usePlayerStore((s) => s.isPlaying)
  const localCurrentTime = usePlayerStore((s) => s.currentTime)
  const localDuration = usePlayerStore((s) => s.duration)
  const localVolume = usePlayerStore((s) => s.volume)
  const localUpNext = usePlayerStore((s) => s.upNext)
  const localQueueIndex = usePlayerStore((s) => s.queueIndex)
  const localActiveQueue = usePlayerStore((s) => s.activeQueue())
  const toQueueTrack = (item: typeof localActiveQueue[number]): QueueSnapshotTrack => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    duration: item.duration,
    coverDataUrl: item.coverDataUrl,
  })

  const playback: PlaybackSnapshot = source === 'ipc'
    ? ipcPlayback
    : {
        isPlaying: localPlaying,
        title: currentTrack?.title ?? '',
        artist: currentTrack?.artist ?? '',
        coverDataUrl: currentTrack?.coverDataUrl ?? null,
        currentTime: localCurrentTime,
        duration: localDuration,
        volume: localVolume,
        queue: {
          nowPlaying: currentTrack ? toQueueTrack(currentTrack) : null,
          upNext: localUpNext.slice(0, 24).map(toQueueTrack),
          comingUp: localActiveQueue.slice(localQueueIndex + 1, localQueueIndex + 25).map(toQueueTrack),
        },
      }

  useEffect(() => {
    if (source !== 'ipc') return
    const unsub = window.hub.onAudioFrame((buf) => { ipcFrameRef.current = buf })
    return unsub
  }, [source])

  useEffect(() => {
    if (source !== 'ipc') return
    const unsub = window.hub.onPlaybackState((state) =>
      setIpcPlayback({
        ...state,
        volume: Number.isFinite(state.volume) ? state.volume : 0.8,
        queue: state.queue ?? EMPTY_QUEUE,
      })
    )
    return unsub
  }, [source])

  useEffect(() => {
    if (!onClose) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose!() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      canvas!.width = window.innerWidth * devicePixelRatio
      canvas!.height = window.innerHeight * devicePixelRatio
      canvas!.style.width = window.innerWidth + 'px'
      canvas!.style.height = window.innerHeight + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    let bgFrame = 0
    let bgOffset = 0
    function getData(): Uint8Array {
      if (source === 'ipc') return ipcFrameRef.current
      const a = getAnalyser()
      const buf = new Uint8Array(a.frequencyBinCount)
      a.getByteFrequencyData(buf)
      return buf
    }

    function spawnBubble(W: number, H: number, bass: number, isLime: boolean) {
      bubblesRef.current.push({
        x: Math.random() * W,
        y: H + 20,
        r: isLime ? 3 + Math.random() * 4 : 4 + Math.random() * 16,
        vy: -(0.3 + Math.random() * 0.6 + bass * 1.8),
        vx: (Math.random() - 0.5) * 0.3,
        hue: isLime ? 115 + Math.random() * 45 : 185 + Math.random() * 30,
        alpha: 0.18 + Math.random() * 0.28,
        isLime,
      })
    }

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      const W = canvas!.width
      const H = canvas!.height
      const data = getData()
      const binCount = data.length

      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
      const bass = Array.from(data.slice(0, 8)).reduce((a, b) => a + b, 0) / (8 * 255)
      const trebleStart = Math.min(96, data.length - 1)
      const treble = Array.from(data.slice(trebleStart)).reduce((a, b) => a + b, 0) / ((data.length - trebleStart) * 255)
      const peak = Math.max(...Array.from(data)) / 255
      rollingPeakRef.current.push(peak)
      rollingPeakRef.current.shift()
      const rollingAvg = rollingPeakRef.current.reduce((a, b) => a + b, 0) / rollingPeakRef.current.length
      const isTransient = peak > rollingAvg * 1.3 && peak > 0.4
      const visualPower = 0.08 + settings.intensity * 1.02

      // === LAYER 1: Background ===
      ctx!.fillStyle = '#061224'
      ctx!.fillRect(0, 0, W, H)

      bgFrame++
      if (bgFrame % 3 === 0) bgOffset += 0.0006
      if (settings.atmosphere) {
        const glowX = W * (0.5 + Math.sin(bgOffset) * 0.12)
        const skyGrad = ctx!.createRadialGradient(glowX, 0, 0, W / 2, H * 0.1, H * 0.75)
        skyGrad.addColorStop(0, `rgba(108,197,255,${(0.02 + avg * 0.08) * visualPower})`)
        skyGrad.addColorStop(0.6, `rgba(127,233,208,${(0.01 + avg * 0.035) * visualPower})`)
        skyGrad.addColorStop(1, 'rgba(6,18,36,0)')
        ctx!.fillStyle = skyGrad
        ctx!.fillRect(0, 0, W, H)

        ctx!.strokeStyle = `rgba(127,233,208,${(0.01 + avg * 0.04) * visualPower})`
        ctx!.lineWidth = 1
        for (let x = 0; x < W; x += W / 18) {
          ctx!.beginPath()
          ctx!.moveTo(x, H * 0.55)
          ctx!.lineTo(W * 0.5 + (x - W * 0.5) * 1.7, H)
          ctx!.stroke()
        }
      }

      // === LAYER 2: Bubbles (reactive, ambient density) ===
      const spawnChance = (0.004 + avg * 0.045 + bass * 0.07 + (isTransient ? peak * 0.06 : 0)) * visualPower
      if (settings.bubbles && Math.random() < spawnChance) spawnBubble(W, H, bass, false)
      if (settings.bubbles && Math.random() < treble * 0.08 * visualPower) spawnBubble(W, H, bass, true)

      bubblesRef.current = bubblesRef.current.filter((b) => {
        b.y += b.vy * (1 + bass * 0.5)
        b.x += b.vx
        b.alpha -= 0.0012
        return b.y > -b.r * 3 && b.alpha > 0.005
      })

      if (settings.bubbles) for (const b of bubblesRef.current) {
        const s = b.isLime ? 82 : 68
        const l = b.isLime ? 66 : 78
        const pulseR = b.r * (1 + (isTransient ? peak * 0.15 : 0))

        const glowGrad = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, pulseR * 2.8)
        glowGrad.addColorStop(0, `hsla(${b.hue},${s}%,${l}%,${b.alpha * 0.22})`)
        glowGrad.addColorStop(1, `hsla(${b.hue},${s}%,${l}%,0)`)
        ctx!.beginPath()
        ctx!.arc(b.x, b.y, pulseR * 2.8, 0, Math.PI * 2)
        ctx!.fillStyle = glowGrad
        ctx!.fill()

        const rx = b.x - pulseR * 0.28
        const ry = b.y - pulseR * 0.28
        const bodyGrad = ctx!.createRadialGradient(rx, ry, pulseR * 0.08, b.x, b.y, pulseR)
        bodyGrad.addColorStop(0, `hsla(${b.hue + 65},95%,96%,${b.alpha * 0.9})`)
        bodyGrad.addColorStop(0.28, `hsla(${b.hue + 145},92%,76%,${b.alpha * 0.45})`)
        bodyGrad.addColorStop(0.55, `hsla(${b.hue},${s}%,${l}%,${b.alpha * 0.34})`)
        bodyGrad.addColorStop(0.78, `hsla(${b.hue + 250},90%,78%,${b.alpha * 0.28})`)
        bodyGrad.addColorStop(1, `hsla(${b.hue + 20},${s - 10}%,${l - 12}%,${b.alpha * 0.16})`)
        ctx!.beginPath()
        ctx!.arc(b.x, b.y, pulseR, 0, Math.PI * 2)
        ctx!.fillStyle = bodyGrad
        ctx!.fill()

        ctx!.beginPath()
        ctx!.arc(b.x, b.y, pulseR * 0.86, 0, Math.PI * 2)
        ctx!.strokeStyle = `hsla(${(b.hue + bgFrame * 0.8) % 360},95%,82%,${b.alpha * 0.46})`
        ctx!.lineWidth = Math.max(0.7, pulseR * 0.08)
        ctx!.stroke()

        ctx!.beginPath()
        ctx!.arc(b.x - pulseR * 0.22, b.y - pulseR * 0.22, pulseR * 0.52, 0.75, 2.2)
        ctx!.strokeStyle = `rgba(255,255,255,${b.alpha * 0.55})`
        ctx!.lineWidth = Math.max(0.5, pulseR * 0.11)
        ctx!.stroke()
      }

      // Lens flare on transients
      if (settings.atmosphere && isTransient) {
        const fx = W * (0.25 + Math.random() * 0.5)
        const fy = H * (0.15 + Math.random() * 0.35)
        const flare = ctx!.createRadialGradient(fx, fy, 0, fx, fy, W * 0.18)
        flare.addColorStop(0, 'rgba(255,255,255,0.12)')
        flare.addColorStop(0.35, 'rgba(108,197,255,0.06)')
        flare.addColorStop(1, 'rgba(6,18,36,0)')
        ctx!.fillStyle = flare
        ctx!.fillRect(0, 0, W, H)
      }

      const horizonY = H * 0.74

      // Bass-reactive horizon line
      if (settings.atmosphere && settings.bars && bass > 0.10) {
        const alpha = (bass - 0.10) * 0.6
        const lineGrad = ctx!.createLinearGradient(0, horizonY, W, horizonY)
        lineGrad.addColorStop(0, 'rgba(127,233,208,0)')
        lineGrad.addColorStop(0.5, `rgba(127,233,208,${alpha})`)
        lineGrad.addColorStop(1, 'rgba(127,233,208,0)')
        ctx!.strokeStyle = lineGrad
        ctx!.lineWidth = 1
        ctx!.beginPath()
        ctx!.moveTo(0, horizonY)
        ctx!.lineTo(W, horizonY)
        ctx!.stroke()
      }

      // === LAYER 3: Spectrum bars ===
      ctx!.save()
      ctx!.globalCompositeOperation = 'lighter'

      const preset = COLOR_PRESETS[settings.colors]
      const hueShift = preset.base + treble * 35
      const saturation = 65 + bass * 25
      const barW = W / BAR_COUNT
      const maxBarH = horizonY * 0.58 * visualPower

      if (settings.bars) for (let i = 0; i < BAR_COUNT; i++) {
        const sourceIdx = i < SOURCE_BARS ? SOURCE_BARS - 1 - i : i - SOURCE_BARS
        const [lo, hi] = logBinRange(sourceIdx, SOURCE_BARS, binCount)
        let maxBin = 0
        for (let b = lo; b < hi; b++) maxBin = Math.max(maxBin, data[b])
        const val = maxBin / 255

        barPeakRef.current[i] = Math.max(val, barPeakRef.current[i] * 0.86)
        const barH = barPeakRef.current[i] * maxBarH

        if (barH < 1) continue

        const x = i * barW
        const brightness = 55 + barPeakRef.current[i] * 30
        const alpha = 0.35 + barPeakRef.current[i] * 0.45

        // Upward bar
        const barGrad = ctx!.createLinearGradient(0, horizonY, 0, horizonY - barH)
        barGrad.addColorStop(0, `hsla(${hueShift},${saturation}%,${brightness}%,${alpha * 0.6})`)
        barGrad.addColorStop(1, `hsla(${hueShift + 15},${saturation + 10}%,${brightness + 15}%,${alpha})`)
        ctx!.fillStyle = barGrad
        ctx!.fillRect(x + 0.5, horizonY - barH, barW - 1, barH)

        // Reflection below horizon
        const reflGrad = ctx!.createLinearGradient(0, horizonY, 0, horizonY + barH * 0.4)
        reflGrad.addColorStop(0, `hsla(${hueShift},${saturation}%,${brightness}%,${alpha * 0.25})`)
        reflGrad.addColorStop(1, `hsla(${hueShift},${saturation}%,${brightness}%,0)`)
        ctx!.fillStyle = reflGrad
        ctx!.fillRect(x + 0.5, horizonY, barW - 1, barH * 0.4)
      }

      // === LAYER 4: Radial ring ===
      const cx = W * 0.5
      const cy = horizonY * 0.52
      const baseRadius = Math.min(W, H) * 0.11

      // Smoothly animate ring expansion on transients
      const targetR = isTransient ? baseRadius * (1 + peak * 0.25) : baseRadius
      ringRadiusRef.current += (targetR - ringRadiusRef.current) * 0.18
      const ringR = ringRadiusRef.current

      if (settings.ring) for (let i = 0; i < RING_TICKS; i++) {
        const sourceIdx = Math.min(i, RING_TICKS - i, RING_TICKS / 2 - 1)
        const [lo, hi] = logBinRange(sourceIdx, RING_TICKS / 2, binCount)
        let maxBin = 0
        for (let b = lo; b < hi; b++) maxBin = Math.max(maxBin, data[b])
        const val = maxBin / 255

        ringPeakRef.current[i] = Math.max(val, ringPeakRef.current[i] * 0.82)
        const maxTickLen = Math.min(W, H) * 0.07 * visualPower
        const tickLen = Math.min(ringPeakRef.current[i] * maxTickLen, Math.min(W, H) * 0.12)

        if (tickLen < 0.5) continue

        const angle = (i / RING_TICKS) * Math.PI * 2 - Math.PI / 2
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        const x1 = cx + cos * ringR
        const y1 = cy + sin * ringR
        const x2 = cx + cos * (ringR + tickLen)
        const y2 = cy + sin * (ringR + tickLen)

        const tickAlpha = 0.3 + ringPeakRef.current[i] * 0.55
        ctx!.strokeStyle = `hsla(${hueShift},${saturation + 15}%,80%,${tickAlpha})`
        ctx!.lineWidth = Math.max(1, barW * 0.6)
        ctx!.beginPath()
        ctx!.moveTo(x1, y1)
        ctx!.lineTo(x2, y2)
        ctx!.stroke()
      }

      // Subtle ring base circle
      if (settings.ring) {
        ctx!.strokeStyle = `hsla(${hueShift},${saturation}%,70%,${0.04 + avg * 0.08})`
        ctx!.lineWidth = 1
        ctx!.beginPath()
        ctx!.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx!.stroke()
      }

      ctx!.restore()
    }

    draw()
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [source, settings])

  function runCommand(command: VisualizerCommand) {
    window.hub.sendVisualizerCommand(command)
  }

  function toggleSetting(key: 'bars' | 'ring' | 'bubbles' | 'atmosphere') {
    setSettings((s) => ({ ...s, [key]: !s[key] }))
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    runCommand({ type: 'seek', time: Number(e.target.value) })
  }

  function handleSeekPointer(e: React.PointerEvent<HTMLDivElement>) {
    if (!Number.isFinite(playback.duration) || playback.duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    runCommand({ type: 'seek', time: ratio * playback.duration })
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    runCommand({ type: 'volume', volume: Number(e.target.value) })
  }

  return (
    <div
      className="fixed inset-0 z-50 no-drag"
      style={{ background: '#061224' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-5 right-6 text-white/20 hover:text-aero-aqua/70 transition-colors z-10 text-[10px] font-mono tracking-[0.15em] uppercase no-drag"
        >
          esc / close
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-5 pt-16 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-[#061224]/85 to-transparent">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-lg border border-aero-aqua/20 bg-[#08172d]/80 px-4 py-3 shadow-[0_0_30px_rgba(127,233,208,0.10)] backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
              <img src={playback.coverDataUrl ?? placeholderCover} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-white/85">{playback.title || 'Nothing playing'}</p>
              <p className="truncate text-[11px] text-muted/70">{playback.artist}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => runCommand({ type: 'prev' })} className="viz-control-button" title="Previous">
              <SkipBack size={16} />
            </button>
            <button onClick={() => runCommand({ type: 'toggle' })} className="viz-control-button h-10 w-10 text-aero-aqua" title="Play / pause">
              {playback.isPlaying ? <Pause size={18} className="fill-aero-aqua" /> : <Play size={18} className="fill-aero-aqua ml-0.5" />}
            </button>
            <button onClick={() => runCommand({ type: 'next' })} className="viz-control-button" title="Next">
              <SkipForward size={16} />
            </button>
            <label className="ml-1 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-white/55">
              {playback.volume <= 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={playback.volume}
                onChange={handleVolume}
                className="w-24"
                title="Volume"
              />
            </label>
            {onClose && (
              <button onClick={onClose} className="viz-control-button" title="Close fullscreen">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <div
          className="mx-auto mt-3 max-w-3xl rounded-lg border border-white/10 bg-[#08172d]/70 px-3 py-2 backdrop-blur-xl cursor-pointer"
          onPointerDown={handleSeekPointer}
          onPointerMove={(e) => {
            if (e.buttons === 1) handleSeekPointer(e)
          }}
        >
          <div className="relative h-3">
            <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-white/10" />
            <div
              className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-fuchsia-400 via-aero-aqua to-aero-lime shadow-[0_0_10px_rgba(127,233,208,0.45)]"
              style={{
                width: `${playback.duration > 0 ? Math.min(100, Math.max(0, (playback.currentTime / playback.duration) * 100)) : 0}%`,
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={playback.duration || 0}
            step={0.1}
            value={Math.min(playback.currentTime, playback.duration || playback.currentTime)}
            onChange={handleSeek}
            className="sr-only"
            tabIndex={-1}
          />
        </div>
      </div>

      <div className="absolute left-5 top-5 z-20 w-48 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border border-aero-aqua/20 bg-[#08172d]/80 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.16em] text-aero-aqua/80 backdrop-blur-xl"
        >
          Visuals
          {settingsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {settingsOpen && (
          <div className="mt-2 rounded-lg border border-white/10 bg-[#08172d]/90 p-2 backdrop-blur-xl">
            {(['bars', 'ring', 'bubbles', 'atmosphere'] as const).map((key) => (
              <button
                key={key}
                onClick={() => toggleSetting(key)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[11px] capitalize text-white/70 hover:bg-white/[0.06]"
              >
                {key}
                <span className={settings[key] ? 'text-aero-aqua' : 'text-muted/35'}>
                  {settings[key] ? 'on' : 'off'}
                </span>
              </button>
            ))}
            <div className="mt-2 grid grid-cols-3 gap-1 border-t border-white/10 pt-2">
              {(Object.keys(COLOR_PRESETS) as ColorPreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSettings((s) => ({ ...s, colors: preset }))}
                  className={`rounded px-1.5 py-1 text-[10px] ${
                    settings.colors === preset
                      ? 'bg-aero-aqua/15 text-aero-aqua'
                      : 'text-muted/60 hover:bg-white/[0.06]'
                  }`}
                >
                  {COLOR_PRESETS[preset].name}
                </button>
              ))}
            </div>
            <label className="mt-3 grid grid-cols-[54px_1fr_28px] items-center gap-2 border-t border-white/10 pt-2 text-[10px] uppercase tracking-[0.08em] text-muted/55">
              <span>Power</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.intensity}
                onChange={(e) => setSettings((s) => ({ ...s, intensity: Number(e.target.value) }))}
                className="w-full"
              />
              <span className="text-right font-mono">{settings.intensity.toFixed(1)}</span>
            </label>
          </div>
        )}
      </div>

      <FullscreenQueueDrawer queue={playback.queue ?? EMPTY_QUEUE} />

      {!playback.isPlaying && (
        <div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none">
          <p className="text-white/10 text-[11px] font-mono tracking-[0.2em] uppercase">paused</p>
        </div>
      )}
    </div>
  )
}

function FullscreenQueueDrawer({
  queue,
}: {
  queue: PlaybackSnapshot['queue']
}) {
  const hasItems = queue.nowPlaying || queue.upNext.length > 0 || queue.comingUp.length > 0

  return (
    <aside className="group absolute right-0 top-0 z-30 flex h-full translate-x-[calc(100%-18px)] items-stretch transition-transform duration-300 hover:translate-x-0 focus-within:translate-x-0">
      <div className="flex w-[18px] items-center justify-center border-l border-aero-aqua/15 bg-[#08172d]/55 backdrop-blur-xl">
        <div className="flex h-28 w-full flex-col items-center justify-center gap-2 text-aero-aqua/55">
          <ListMusic size={13} />
          <span className="writing-vertical text-[9px] font-mono uppercase tracking-[0.18em]">Queue</span>
        </div>
      </div>
      <div className="h-full w-72 border-l border-aero-aqua/20 bg-[#07162b]/86 shadow-[0_0_32px_rgba(127,233,208,0.10)] backdrop-blur-xl">
        <div className="flex h-full flex-col">
          <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-white/10 px-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-aero-aqua/70">Queue</p>
            <p className="text-[10px] font-mono text-white/25">
              {queue.upNext.length + queue.comingUp.length}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {queue.nowPlaying && (
              <section className="mb-4">
                <p className="mb-2 px-1 text-[9px] font-mono uppercase tracking-[0.12em] text-white/25">Now playing</p>
                <FullscreenQueueRow track={queue.nowPlaying} current />
              </section>
            )}

            {queue.upNext.length > 0 && (
              <section className="mb-4">
                <p className="mb-2 px-1 text-[9px] font-mono uppercase tracking-[0.12em] text-white/25">Up next</p>
                {queue.upNext.map((track, i) => (
                  <FullscreenQueueRow key={`up-${track.id ?? track.title}-${i}`} track={track} />
                ))}
              </section>
            )}

            {queue.comingUp.length > 0 && (
              <section>
                <p className="mb-2 px-1 text-[9px] font-mono uppercase tracking-[0.12em] text-white/25">Coming up</p>
                {queue.comingUp.map((track, i) => (
                  <FullscreenQueueRow key={`coming-${track.id ?? track.title}-${i}`} track={track} dim />
                ))}
              </section>
            )}

            {!hasItems && (
              <div className="flex h-40 items-center justify-center text-[11px] text-white/25">
                Queue is empty
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

function FullscreenQueueRow({
  track,
  current,
  dim,
}: {
  track: QueueSnapshotTrack
  current?: boolean
  dim?: boolean
}) {
  return (
    <div className={`mb-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 ${current ? 'bg-aero-aqua/10' : 'bg-white/[0.03]'} ${dim ? 'opacity-45' : ''}`}>
      <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-white/10 bg-white/[0.04]">
        {track.coverDataUrl ? (
          <img src={track.coverDataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music size={11} className="text-white/25" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[11px] font-medium leading-tight ${current ? 'text-aero-aqua/90' : 'text-white/75'}`}>
          {track.title || 'Untitled'}
        </p>
        <p className="truncate text-[10px] text-white/35">{track.artist || 'Unknown artist'}</p>
      </div>
      <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-white/25">
        {fmtDuration(track.duration)}
      </span>
    </div>
  )
}
