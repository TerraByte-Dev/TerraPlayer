import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { getAnalyser } from '@/lib/audio'
import { usePlayerStore } from '@/store/player'
import { fmtDuration } from '@/lib/ipc'
import type { PlaybackSnapshot, QueueSnapshotTrack, VisualizerCommand } from '@/lib/ipc'
import VectorGridCover from './VectorGridCover'

interface Bubble { x: number; y: number; r: number; vy: number; vx: number; alpha: number }

interface Props {
  source?: 'analyser' | 'ipc'
  onClose?: () => void
}

const BAR_COUNT = 64
const SOURCE_BARS = BAR_COUNT / 2
const RING_TICKS = 96
const SEG_H = 4
const SEG_GAP = 1
const BAR_GAP = 2

const SEG_COLORS = { peak: '#00E5FF' }

interface Stop { at: number; rgb: string }

function lerpStops(stops: Stop[], t: number, alpha = 1): string {
  if (t <= stops[0].at) return `rgba(${stops[0].rgb},${alpha})`
  if (t >= stops[stops.length - 1].at) return `rgba(${stops[stops.length - 1].rgb},${alpha})`
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].at) {
      const a = stops[i - 1], b = stops[i]
      const k = (t - a.at) / (b.at - a.at)
      const [ar, ag, ab] = a.rgb.split(',').map(Number)
      const [br, bg, bb] = b.rgb.split(',').map(Number)
      const r = Math.round(ar + (br - ar) * k)
      const g = Math.round(ag + (bg - ag) * k)
      const bl = Math.round(ab + (bb - ab) * k)
      return `rgba(${r},${g},${bl},${alpha})`
    }
  }
  return `rgba(${stops[0].rgb},${alpha})`
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildBlockShuffle(baseMapping: number[], blockSize: number, seed: number): Uint16Array {
  const rng = mulberry32(seed)
  const out = new Uint16Array(baseMapping)
  for (let start = 0; start < out.length; start += blockSize) {
    const end = Math.min(start + blockSize, out.length)
    for (let i = end - 1; i > start; i--) {
      const j = start + Math.floor(rng() * (i - start + 1))
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp
    }
  }
  return out
}

type ColorPreset = 'spectrum' | 'phosphor' | 'cyan' | 'amber'

interface VizSettings {
  bars: boolean
  ring: boolean
  bubbles: boolean
  atmosphere: boolean
  colors: ColorPreset
  intensity: number
}

const COLOR_PRESETS: Record<ColorPreset, { glowRgb: string; ringHue: number; name: string; stops: Stop[] }> = {
  spectrum: {
    glowRgb: '0,255,136', ringHue: 150, name: 'Spectrum',
    stops: [
      { at: 0.00, rgb: '0,77,41' },
      { at: 0.30, rgb: '0,255,136' },
      { at: 0.60, rgb: '255,176,0' },
      { at: 0.85, rgb: '255,119,0' },
      { at: 1.00, rgb: '255,48,48' },
    ],
  },
  phosphor: {
    glowRgb: '0,255,136', ringHue: 150, name: 'Phosphor',
    stops: [
      { at: 0.00, rgb: '0,51,34' },
      { at: 0.50, rgb: '0,255,136' },
      { at: 1.00, rgb: '170,255,204' },
    ],
  },
  cyan: {
    glowRgb: '0,229,255', ringHue: 185, name: 'Cyan',
    stops: [
      { at: 0.00, rgb: '0,31,51' },
      { at: 0.50, rgb: '0,229,255' },
      { at: 1.00, rgb: '204,247,255' },
    ],
  },
  amber: {
    glowRgb: '255,176,0', ringHue: 42, name: 'Amber',
    stops: [
      { at: 0.00, rgb: '51,26,0' },
      { at: 0.50, rgb: '255,176,0' },
      { at: 1.00, rgb: '255,230,153' },
    ],
  },
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
    bars: true, ring: true, bubbles: true, atmosphere: true,
    colors: 'spectrum', intensity: 1,
  })
  const [permSeed, setPermSeed] = useState(1)
  const barPerm = useMemo(() => {
    const base = Array.from({ length: BAR_COUNT }, (_, i) =>
      i < SOURCE_BARS ? SOURCE_BARS - 1 - i : i - SOURCE_BARS)
    return buildBlockShuffle(base, 8, permSeed)
  }, [permSeed])
  const ringPerm = useMemo(() => {
    const base = Array.from({ length: RING_TICKS }, (_, i) =>
      Math.min(i, RING_TICKS - i, RING_TICKS / 2 - 1))
    return buildBlockShuffle(base, 12, permSeed * 7919)
  }, [permSeed])
  const barJitter = useMemo(() => {
    const rng = mulberry32(permSeed * 31337)
    return Float32Array.from({ length: BAR_COUNT }, () => 0.93 + rng() * 0.14)
  }, [permSeed])
  const [ipcPlayback, setIpcPlayback] = useState<PlaybackSnapshot>({
    isPlaying: false, title: '', artist: '', coverDataUrl: null,
    currentTime: 0, duration: 0, volume: 0.8, queue: EMPTY_QUEUE,
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
    id: item.id, title: item.title, artist: item.artist,
    duration: item.duration, coverDataUrl: item.coverDataUrl,
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
    const dpr = window.devicePixelRatio || 1

    function resize() {
      canvas!.width = window.innerWidth * dpr
      canvas!.height = window.innerHeight * dpr
      canvas!.style.width = window.innerWidth + 'px'
      canvas!.style.height = window.innerHeight + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    let bgFrame = 0

    function getData(): Uint8Array {
      if (source === 'ipc') return ipcFrameRef.current
      const a = getAnalyser()
      const buf = new Uint8Array(a.frequencyBinCount)
      a.getByteFrequencyData(buf)
      return buf
    }

    function spawnBubble(W: number, H: number, bass: number) {
      bubblesRef.current.push({
        x: Math.random() * W,
        y: H + 10 * dpr,
        r: (2 + Math.random() * 3) * dpr,
        vy: -(0.3 + Math.random() * 0.6 + bass * 1.8) * dpr,
        vx: (Math.random() - 0.5) * 0.3 * dpr,
        alpha: 0.5 + Math.random() * 0.4,
      })
    }

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      const W = canvas!.width
      const H = canvas!.height
      const data = getData()
      const binCount = data.length
      const preset = COLOR_PRESETS[settings.colors]
      const visualPower = 0.08 + settings.intensity * 1.02

      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
      const bass = Array.from(data.slice(0, 8)).reduce((a, b) => a + b, 0) / (8 * 255)
      const trebleStart = Math.min(96, data.length - 1)
      const treble = Array.from(data.slice(trebleStart)).reduce((a, b) => a + b, 0) / ((data.length - trebleStart) * 255)
      const peak = Math.max(...Array.from(data)) / 255
      rollingPeakRef.current.push(peak)
      rollingPeakRef.current.shift()
      const rollingAvg = rollingPeakRef.current.reduce((a, b) => a + b, 0) / rollingPeakRef.current.length
      const isTransient = peak > rollingAvg * 1.3 && peak > 0.4

      bgFrame++

      // === LAYER 1: Background + vector grid ===
      ctx!.fillStyle = '#000000'
      ctx!.fillRect(0, 0, W, H)
      const gridSize = 32 * dpr
      ctx!.strokeStyle = 'rgba(0,255,136,0.04)'
      ctx!.lineWidth = 0.5
      for (let x = 0; x <= W; x += gridSize) {
        ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, H); ctx!.stroke()
      }
      for (let y = 0; y <= H; y += gridSize) {
        ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(W, y); ctx!.stroke()
      }

      const horizonY = H * 0.72

      // === LAYER 2: Atmosphere ===
      if (settings.atmosphere) {
        const glowGrad = ctx!.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, Math.min(W, H) * 0.52)
        glowGrad.addColorStop(0, `rgba(${preset.glowRgb},${(0.025 + avg * 0.07) * visualPower})`)
        glowGrad.addColorStop(0.5, `rgba(0,229,255,${(0.01 + avg * 0.025) * visualPower})`)
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx!.fillStyle = glowGrad
        ctx!.fillRect(0, 0, W, H)

        if (bass > 0.08) {
          const bAlpha = (bass - 0.08) * 0.55 * visualPower
          const horizGrad = ctx!.createLinearGradient(0, horizonY, W, horizonY)
          horizGrad.addColorStop(0, `rgba(${preset.glowRgb},0)`)
          horizGrad.addColorStop(0.5, `rgba(${preset.glowRgb},${bAlpha})`)
          horizGrad.addColorStop(1, `rgba(${preset.glowRgb},0)`)
          ctx!.strokeStyle = horizGrad
          ctx!.lineWidth = 1
          ctx!.beginPath(); ctx!.moveTo(0, horizonY); ctx!.lineTo(W, horizonY); ctx!.stroke()
        }

        if (isTransient) {
          const scanY = H * (0.1 + Math.random() * 0.8)
          ctx!.strokeStyle = `rgba(${preset.glowRgb},${0.06 * peak})`
          ctx!.lineWidth = dpr
          ctx!.beginPath(); ctx!.moveTo(0, scanY); ctx!.lineTo(W, scanY); ctx!.stroke()
        }
      }

      // === LAYER 3: Bubbles (phosphor particles) ===
      const spawnChance = (0.003 + avg * 0.04 + bass * 0.06 + (isTransient ? peak * 0.05 : 0)) * visualPower
      if (settings.bubbles && Math.random() < spawnChance) spawnBubble(W, H, bass)

      bubblesRef.current = bubblesRef.current.filter((b) => {
        b.y += b.vy * (1 + bass * 0.5)
        b.x += b.vx
        b.alpha -= 0.007
        return b.y > -b.r * 3 && b.alpha > 0.01
      })

      if (settings.bubbles) for (const b of bubblesRef.current) {
        const glow = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 4)
        glow.addColorStop(0, `rgba(${preset.glowRgb},${b.alpha * 0.5})`)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx!.fillStyle = glow
        ctx!.beginPath(); ctx!.arc(b.x, b.y, b.r * 4, 0, Math.PI * 2); ctx!.fill()
        ctx!.fillStyle = `rgba(${preset.glowRgb},${b.alpha})`
        ctx!.fillRect(b.x - b.r * 0.5, b.y - b.r * 0.5, b.r, b.r)
      }

      // === LAYER 4: Spectrum bars (segmented LED) ===
      if (settings.bars) {
        const segH = SEG_H * dpr
        const segGap = SEG_GAP * dpr
        const barGapPx = BAR_GAP * dpr
        const totalGap = (BAR_COUNT - 1) * barGapPx
        const barW = (W - totalGap) / BAR_COUNT
        const maxH = horizonY * 0.88 * visualPower
        const totalSegs = Math.floor(maxH / (segH + segGap))

        // Pass 1: update all peaks
        for (let i = 0; i < BAR_COUNT; i++) {
          const sourceIdx = barPerm[i]
          const [lo, hi] = logBinRange(sourceIdx, SOURCE_BARS, binCount)
          let maxBin = 0
          for (let b = lo; b < hi; b++) maxBin = Math.max(maxBin, data[b])
          barPeakRef.current[i] = Math.max(maxBin / 255, barPeakRef.current[i] * 0.86)
        }

        // Pass 2: relocate only the 3-4 quietest dead bars to the outermost edges.
        // All other bars stay in their block-shuffled positions so the layout stays
        // non-mirrored and Randomize has visible effect.
        const DEAD_THRESHOLD = 0.015
        const MAX_RELOCATE = 4
        const renderAt = Array.from({ length: BAR_COUNT }, (_, i) => i)
        const barAtPos = Array.from({ length: BAR_COUNT }, (_, i) => i)
        const deadBars = Array.from({ length: BAR_COUNT }, (_, i) => i)
          .filter(i => barPeakRef.current[i] < DEAD_THRESHOLD)
          .sort((a, b) => barPeakRef.current[a] - barPeakRef.current[b])
          .slice(0, MAX_RELOCATE)
        let outerL = 0, outerR = BAR_COUNT - 1
        for (let d = 0; d < deadBars.length; d++) {
          const deadBar = deadBars[d]
          const targetPos = d % 2 === 0 ? outerL++ : outerR--
          const currentPos = renderAt[deadBar]
          if (currentPos === targetPos) continue
          const displaced = barAtPos[targetPos]
          renderAt[deadBar] = targetPos
          renderAt[displaced] = currentPos
          barAtPos[currentPos] = displaced
          barAtPos[targetPos] = deadBar
        }

        // Pass 3: draw at computed positions
        for (let i = 0; i < BAR_COUNT; i++) {
          const x = renderAt[i] * (barW + barGapPx)
          const segCount = Math.floor(barPeakRef.current[i] * totalSegs * barJitter[i])

          for (let s = 0; s < segCount; s++) {
            const sy = horizonY - (s + 1) * (segH + segGap)
            if (sy < 0) break
            const ratio = (s + 1) / totalSegs
            ctx!.fillStyle = lerpStops(preset.stops, ratio)
            ctx!.fillRect(x, sy, barW, segH)
          }

          if (segCount > 0) {
            const py = horizonY - segCount * (segH + segGap) - segGap
            if (py >= 0) {
              ctx!.fillStyle = SEG_COLORS.peak
              ctx!.fillRect(x, py, barW, Math.max(1, dpr))
            }
          }
        }
      }

      // === LAYER 5: Radial ring ===
      const cx = W * 0.5
      const cy = horizonY * 0.52
      const baseRadius = Math.min(W, H) * 0.11
      const targetR = isTransient ? baseRadius * (1 + peak * 0.25) : baseRadius
      ringRadiusRef.current += (targetR - ringRadiusRef.current) * 0.18
      const ringR = ringRadiusRef.current

      if (settings.ring) {
        for (let i = 0; i < RING_TICKS; i++) {
          const sourceIdx = ringPerm[i]
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
          const tickAlpha = 0.3 + ringPeakRef.current[i] * 0.55
          ctx!.strokeStyle = lerpStops(preset.stops, ringPeakRef.current[i], tickAlpha)
          ctx!.lineWidth = Math.max(1, (W / BAR_COUNT) * 0.5)
          ctx!.beginPath()
          ctx!.moveTo(cx + cos * ringR, cy + sin * ringR)
          ctx!.lineTo(cx + cos * (ringR + tickLen), cy + sin * (ringR + tickLen))
          ctx!.stroke()
        }
        ctx!.strokeStyle = `rgba(${preset.glowRgb},${0.04 + avg * 0.08})`
        ctx!.lineWidth = 1
        ctx!.beginPath(); ctx!.arc(cx, cy, ringR, 0, Math.PI * 2); ctx!.stroke()
      }

      // === LAYER 6: Crosshair HUD ===
      const hudAlpha = 0.10 + avg * 0.06
      ctx!.strokeStyle = `rgba(255,176,0,${hudAlpha})`
      ctx!.lineWidth = dpr * 0.5
      ctx!.setLineDash([4 * dpr, 6 * dpr])
      ctx!.beginPath(); ctx!.moveTo(0, cy); ctx!.lineTo(W, cy); ctx!.stroke()
      ctx!.beginPath(); ctx!.moveTo(cx, 0); ctx!.lineTo(cx, horizonY); ctx!.stroke()
      ctx!.setLineDash([])
    }

    draw()
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [source, settings, barPerm, ringPerm, barJitter])

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

  const TICK_COUNT = 21
  const progressRatio = playback.duration > 0 ? playback.currentTime / playback.duration : 0

  return (
    <div
      className="fixed inset-0 z-50 no-drag"
      style={{ background: '#000' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Corner HUD readouts */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none font-term text-[12px]" style={{ color: 'rgba(0,229,255,0.35)' }}>
        BPM <span style={{ color: 'rgba(0,255,136,0.50)' }}>120</span>
      </div>
      <div className="absolute top-3 right-16 z-10 pointer-events-none font-term text-[12px] tabular-nums text-right" style={{ color: 'rgba(0,229,255,0.35)' }}>
        {fmtDuration(playback.currentTime)}
      </div>
      <div className="absolute bottom-36 left-3 z-10 pointer-events-none font-term text-[11px]" style={{ color: 'rgba(0,229,255,0.25)' }}>
        SUB · MID
      </div>
      <div className="absolute bottom-36 right-3 z-10 pointer-events-none font-term text-[11px] text-right" style={{ color: 'rgba(0,229,255,0.25)' }}>
        HI · TREBLE
      </div>

      {/* ESC button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 font-term text-[12px] tracking-[2px] opacity-25 hover:opacity-70 transition-opacity no-drag"
          style={{ color: '#9bf5b8' }}
        >
          [ESC]
        </button>
      )}

      {/* Settings panel (top-left hover) */}
      <div className="absolute left-3 top-8 z-20 w-44 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 no-drag">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-1.5 font-term text-[12px] transition-colors"
          style={{ background: '#000', border: '1px solid rgba(0,255,136,0.35)', color: '#9bf5b8' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.70)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.35)')}
        >
          VISUALS
          {settingsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {settingsOpen && (
          <div className="mt-0.5 p-1.5" style={{ background: '#000', border: '1px solid rgba(0,255,136,0.25)', boxShadow: '0 0 16px rgba(0,255,136,0.12)' }}>
            {(['bars', 'ring', 'bubbles', 'atmosphere'] as const).map((key) => (
              <button
                key={key}
                onClick={() => toggleSetting(key)}
                className="flex w-full items-center justify-between px-2 py-1.5 font-term text-[12px] transition-colors"
                style={{ color: '#9bf5b8' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,255,136,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <span className="capitalize">{key}</span>
                <span style={{ color: settings[key] ? '#00FF88' : 'rgba(155,245,184,0.28)' }}>
                  {settings[key] ? 'ON' : 'OFF'}
                </span>
              </button>
            ))}
            <div className="grid grid-cols-2 gap-1 mt-1.5 pt-1.5" style={{ borderTop: '1px dashed rgba(0,255,136,0.12)' }}>
              {(Object.keys(COLOR_PRESETS) as ColorPreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSettings((s) => ({ ...s, colors: preset }))}
                  className="px-1 py-1 font-term text-[11px] transition-colors"
                  style={{
                    background: settings.colors === preset ? 'rgba(0,255,136,0.15)' : 'transparent',
                    border: settings.colors === preset ? '1px solid rgba(0,255,136,0.55)' : '1px solid rgba(0,255,136,0.15)',
                    color: settings.colors === preset ? '#00FF88' : 'rgba(155,245,184,0.45)',
                    borderRadius: 0,
                  }}
                >
                  {COLOR_PRESETS[preset].name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPermSeed((s) => s + 1)}
              className="w-full mt-1 px-2 py-1 font-term text-[11px] transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid rgba(0,255,136,0.15)',
                color: 'rgba(155,245,184,0.45)',
                borderRadius: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,255,136,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#9bf5b8' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(155,245,184,0.45)' }}
            >
              ↺ RANDOMIZE LAYOUT
            </button>
            <label className="flex items-center gap-1.5 mt-1.5 pt-1.5 font-term text-[11px]" style={{ borderTop: '1px dashed rgba(0,255,136,0.12)', color: 'rgba(155,245,184,0.40)' }}>
              <span>PWR</span>
              <input
                type="range" min={0} max={1} step={0.05}
                value={settings.intensity}
                onChange={(e) => setSettings((s) => ({ ...s, intensity: Number(e.target.value) }))}
                className="flex-1"
              />
              <span className="font-term text-[11px] w-6 text-right" style={{ color: 'rgba(155,245,184,0.55)' }}>
                {settings.intensity.toFixed(1)}
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Bottom controls (hover-reveal) */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-20 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 no-drag"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)' }}
      >
        {/* Seek bar */}
        <div
          className="mx-auto max-w-2xl mb-3 cursor-pointer"
          onPointerDown={handleSeekPointer}
          onPointerMove={(e) => { if (e.buttons === 1) handleSeekPointer(e) }}
        >
          <div className="flex items-end gap-px h-5">
            {Array.from({ length: TICK_COUNT }, (_, i) => {
              const tickRatio = i / (TICK_COUNT - 1)
              const isFifth = i % 5 === 0
              const isCurrent = Math.abs(tickRatio - progressRatio) < 1 / (TICK_COUNT - 1) * 0.6
              const isPast = tickRatio <= progressRatio
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: isFifth ? 8 : 5,
                    background: isCurrent ? '#00E5FF' : isPast ? '#00FF88' : 'rgba(0,255,136,0.18)',
                    boxShadow: isCurrent ? '0 0 8px #00E5FF' : isPast ? '0 0 3px rgba(0,255,136,0.35)' : 'none',
                    borderRadius: 0,
                  }}
                />
              )
            })}
          </div>
          <div className="flex justify-between font-term text-[11px] mt-1" style={{ color: 'rgba(155,245,184,0.30)' }}>
            <span>{fmtDuration(playback.currentTime)}</span>
            <span>{fmtDuration(playback.duration)}</span>
          </div>
          <input
            type="range" min={0} max={playback.duration || 0} step={0.1}
            value={Math.min(playback.currentTime, playback.duration || playback.currentTime)}
            onChange={handleSeek} className="sr-only" tabIndex={-1}
          />
        </div>

        {/* Control bar */}
        <div
          className="mx-auto max-w-2xl flex items-center gap-4 px-4 py-3"
          style={{ background: '#000', border: '1px solid rgba(0,255,136,0.40)', boxShadow: '0 0 20px rgba(0,255,136,0.12)' }}
        >
          {/* Cover + metadata */}
          <div className="flex items-center gap-3 min-w-0 flex-shrink-0" style={{ width: 180 }}>
            <VectorGridCover src={playback.coverDataUrl} size={40} label="A:VIZ" />
            <div className="min-w-0">
              <p className="font-lcd text-[13px] truncate phosphor-glow" style={{ color: '#00FF88' }}>
                {playback.title || '—'}
              </p>
              <p className="font-term text-[12px] truncate" style={{ color: 'rgba(155,245,184,0.55)' }}>
                {playback.artist || '—'}
              </p>
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center gap-2 flex-1 justify-center">
            <button
              onClick={() => runCommand({ type: 'prev' })}
              className="metal-key w-8 h-8 justify-center"
            >
              <SkipBack size={14} />
            </button>
            <button
              onClick={() => runCommand({ type: 'toggle' })}
              className="metal-key is-primary w-10 h-10 justify-center"
            >
              {playback.isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
            </button>
            <button
              onClick={() => runCommand({ type: 'next' })}
              className="metal-key w-8 h-8 justify-center"
            >
              <SkipForward size={14} />
            </button>
          </div>

          {/* Volume + close */}
          <div className="flex items-center gap-2 flex-shrink-0 min-w-0" style={{ width: 180 }}>
            <span style={{ color: playback.volume <= 0 ? 'rgba(155,245,184,0.30)' : 'rgba(155,245,184,0.50)', flexShrink: 0 }}>
              {playback.volume <= 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={playback.volume}
              onChange={handleVolume}
              className="flex-1"
              title="Volume"
            />
            {onClose && (
              <button onClick={onClose} className="metal-key w-7 h-7 justify-center ml-1 flex-shrink-0">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      <FullscreenQueueDrawer queue={playback.queue ?? EMPTY_QUEUE} />

      {!playback.isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '12%' }}>
          <p className="font-term text-[12px] tracking-[6px]" style={{ color: 'rgba(0,255,136,0.10)' }}>
            PAUSED
          </p>
        </div>
      )}
    </div>
  )
}

function FullscreenQueueDrawer({ queue }: { queue: PlaybackSnapshot['queue'] }) {
  const hasItems = queue.nowPlaying || queue.upNext.length > 0 || queue.comingUp.length > 0

  return (
    <aside className="group absolute right-0 top-0 z-30 flex h-full translate-x-[calc(100%-20px)] items-stretch transition-transform duration-300 hover:translate-x-0 focus-within:translate-x-0">
      <div
        className="flex w-5 items-center justify-center"
        style={{ background: 'rgba(2,5,3,0.85)', borderLeft: '1px solid rgba(0,255,136,0.15)' }}
      >
        <div className="flex h-28 w-full flex-col items-center justify-center gap-2">
          <ListMusic size={12} style={{ color: 'rgba(0,255,136,0.55)' }} />
          <span
            className="writing-vertical font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: '#00E5FF' }}
          >
            Queue
          </span>
        </div>
      </div>
      <div
        className="h-full w-72 flex flex-col"
        style={{ background: '#020503', borderLeft: '1px solid rgba(0,255,136,0.20)', boxShadow: '-8px 0 24px rgba(0,255,136,0.06)' }}
      >
        <div
          className="flex h-10 flex-shrink-0 items-center justify-between px-4"
          style={{ borderBottom: '1px solid rgba(0,255,136,0.10)' }}
        >
          <p className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: '#00E5FF' }}>QUEUE</p>
          <p className="font-term text-[12px]" style={{ color: 'rgba(155,245,184,0.25)' }}>
            {queue.upNext.length + queue.comingUp.length}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {queue.nowPlaying && (
            <section className="mb-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px]" style={{ color: '#00E5FF' }}>NOW PLAYING</p>
              <FullscreenQueueRow track={queue.nowPlaying} current />
            </section>
          )}
          {queue.upNext.length > 0 && (
            <section className="mb-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px]" style={{ color: '#00E5FF' }}>UP NEXT</p>
              {queue.upNext.map((track, i) => (
                <FullscreenQueueRow key={`up-${track.id ?? track.title}-${i}`} track={track} />
              ))}
            </section>
          )}
          {queue.comingUp.length > 0 && (
            <section>
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px]" style={{ color: '#00E5FF' }}>COMING UP</p>
              {queue.comingUp.map((track, i) => (
                <FullscreenQueueRow key={`coming-${track.id ?? track.title}-${i}`} track={track} dim />
              ))}
            </section>
          )}
          {!hasItems && (
            <div className="flex h-40 items-center justify-center font-term text-[12px]" style={{ color: 'rgba(155,245,184,0.25)' }}>
              queue is empty
            </div>
          )}
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
  const label = track.id ? `A:${String(track.id).padStart(3, '0')}` : 'A:000'
  return (
    <div
      className={`mb-1.5 flex min-w-0 items-center gap-2 px-1.5 py-1.5 ${dim ? 'opacity-40' : ''}`}
      style={{
        background: current ? 'rgba(0,255,136,0.08)' : 'transparent',
        borderLeft: current ? '2px solid #00FF88' : '2px solid transparent',
      }}
    >
      <div className="flex-shrink-0">
        <VectorGridCover src={track.coverDataUrl} size={28} label={label} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`font-term text-[12px] truncate leading-tight ${current ? 'phosphor-glow' : ''}`}
          style={{ color: current ? '#00FF88' : 'rgba(155,245,184,0.75)' }}
        >
          {current ? '▶ ' : ''}{track.title || '—'}
        </p>
        <p className="font-term text-[11px] truncate" style={{ color: 'rgba(155,245,184,0.40)' }}>
          {track.artist || '—'}
        </p>
      </div>
      <span className="font-term text-[11px] flex-shrink-0 tabular-nums" style={{ color: 'rgba(155,245,184,0.25)' }}>
        {fmtDuration(track.duration)}
      </span>
    </div>
  )
}
