import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { getAnalyser } from '@/lib/audio'
import { spectrumStats } from '@/lib/audio-math'
import { DEFAULT_PALETTE, lerpStops, resolvePalette, type Palette } from '@/lib/viz-palette'
import { useVizStore } from '@/store/visualizer'
import { applyTheme, THEME_EVENT } from '@/lib/theme'
import { usePlayerStore } from '@/store/player'
import { fmtDuration } from '@/lib/ipc'
import type { PlaybackSnapshot, QueueSnapshotTrack, VisualizerCommand } from '@/lib/ipc'
import VectorGridCover from './VectorGridCover'

// Bubbles also double as the ring's orbiting "comets" — same pool, an optional orbit tag drives the rim path.
interface Bubble { x: number; y: number; r: number; vy: number; vx: number; alpha: number; orbit?: { a: number; spd: number } }

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
const TAU = Math.PI * 2
const RING_GLOW_MAX = 18
const BAR_GLOW_MAX = 12

// Position→frequency map for "Mirror Bars" (lows center, highs at the edges) + a plain identity position map
// (mirror mode skips the dead-bar relocation). Module-level so they're never re-allocated per frame.
const BAR_MIRROR = Array.from({ length: BAR_COUNT }, (_, i) => (i < SOURCE_BARS ? SOURCE_BARS - 1 - i : i - SOURCE_BARS))
const BAR_IDENTITY = Array.from({ length: BAR_COUNT }, (_, i) => i)

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
  // Scalar-only ring animation state (no per-frame arrays).
  const ringRotRef = useRef(0)
  const ringRot2Ref = useRef(0)
  const bassPulseRef = useRef(0)
  const shockRef = useRef(0)
  // Theme palette: resolved off <html> once per theme and cached. The draw loop only reads paletteRef.current.
  const paletteRef = useRef<Palette>(DEFAULT_PALETTE)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Options live in a shared persisted store (synced across the in-app view + popout + restarts).
  const bars = useVizStore((s) => s.bars)
  const ring = useVizStore((s) => s.ring)
  const bubbles = useVizStore((s) => s.bubbles)
  const atmosphere = useVizStore((s) => s.atmosphere)
  const rotation = useVizStore((s) => s.rotation)
  const particles = useVizStore((s) => s.particles)
  const grid = useVizStore((s) => s.grid)
  const mirrorBars = useVizStore((s) => s.mirrorBars)
  const ringSpeed = useVizStore((s) => s.ringSpeed)
  const glow = useVizStore((s) => s.glow)
  const intensity = useVizStore((s) => s.intensity)
  // Read the dragged sliders through refs so a drag never re-inits the RAF effect (which would re-run
  // resize() + reallocate/clear the canvas + analyser buffer). Same idea as the palette ref above.
  const glowRef = useRef(glow); glowRef.current = glow
  const intensityRef = useRef(intensity); intensityRef.current = intensity
  const ringSpeedRef = useRef(ringSpeed); ringSpeedRef.current = ringSpeed
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
    isPlaying: false, title: '', artist: '', coverUrl: null,
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
    duration: item.duration, coverUrl: item.coverUrl,
  })

  const playback: PlaybackSnapshot = source === 'ipc'
    ? ipcPlayback
    : {
        isPlaying: localPlaying,
        title: currentTrack?.title ?? '',
        artist: currentTrack?.artist ?? '',
        coverUrl: currentTrack?.coverUrl ?? null,
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

  // Announce readiness. The main window publishes the moment it opens this window, long
  // before this renderer has an 'viz:playback-state' listener, so that first snapshot is
  // dropped; while paused nothing else would ever trigger another one.
  useEffect(() => {
    if (source !== 'ipc') return
    window.hub.sendVisualizerCommand({ type: 'requestState' })
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

  // Theme palette: resolve on mount + on every theme change. applyTheme() fires THEME_EVENT in the SAME
  // window (the main window's Appearance picker; the popout after onThemeChange below), so this repaints the
  // palette by MUTATING the ref in place — no setState, so the running RAF loop is never torn down.
  useEffect(() => {
    const recompute = () => { paletteRef.current = resolvePalette() }
    recompute()
    window.addEventListener(THEME_EVENT, recompute)
    return () => window.removeEventListener(THEME_EVENT, recompute)
  }, [])

  // Popout only: the main window relays its theme over IPC; applying it sets <html data-theme> here and fires
  // THEME_EVENT locally so the palette repaints. One-directional — the popout never publishes back (no loop).
  useEffect(() => {
    if (source !== 'ipc') return
    return window.hub.onThemeChange((id) => applyTheme(id))
  }, [source])

  // Popout only: live-sync the option store across windows. A toggle in the main window writes localStorage,
  // firing a 'storage' event here → rehydrate so the popout reflects it near-instantly (no extra IPC).
  useEffect(() => {
    if (source !== 'ipc') return
    const onStorage = (e: StorageEvent) => { if (e.key === 'tplay-visualizer') useVizStore.persist.rehydrate() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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

    // Reused across frames — getByteFrequencyData overwrites it in place, and
    // the result is consumed entirely within the same draw() call. ipc mode
    // reads the shared ipcFrameRef instead, so no analyser/AudioContext is
    // created in the popout window. (Previously this allocated a fresh
    // Uint8Array every frame → ~60 throwaway typed arrays/sec.)
    const analyserBuf = source === 'ipc' ? null : new Uint8Array(getAnalyser().frequencyBinCount)

    function getData(): Uint8Array {
      if (source === 'ipc') return ipcFrameRef.current
      getAnalyser().getByteFrequencyData(analyserBuf!)
      return analyserBuf!
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
      const pal = paletteRef.current                 // theme palette — read-only, resolved outside the loop
      const visualPower = 0.08 + intensityRef.current * 1.02

      // Single pass, zero per-frame allocation (verified byte-for-byte in audio-math tests).
      const { avg, bass, peak } = spectrumStats(data)
      rollingPeakRef.current.push(peak)
      rollingPeakRef.current.shift()
      const rollingAvg = rollingPeakRef.current.reduce((a, b) => a + b, 0) / rollingPeakRef.current.length
      const isTransient = peak > rollingAvg * 1.3 && peak > 0.4

      bgFrame++

      // === LAYER 1: Background + theme grid ===
      ctx!.fillStyle = '#000000'
      ctx!.fillRect(0, 0, W, H)
      if (grid) {
        const gridSize = 32 * dpr
        ctx!.strokeStyle = `rgba(${pal.accentStr},0.04)`
        ctx!.lineWidth = 0.5
        for (let x = 0; x <= W; x += gridSize) { ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, H); ctx!.stroke() }
        for (let y = 0; y <= H; y += gridSize) { ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(W, y); ctx!.stroke() }
      }

      const horizonY = H * 0.72

      // === LAYER 2: Atmosphere (theme-tinted) ===
      if (atmosphere) {
        const glowGrad = ctx!.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, Math.min(W, H) * 0.52)
        glowGrad.addColorStop(0, `rgba(${pal.accentStr},${(0.025 + avg * 0.07) * visualPower})`)
        glowGrad.addColorStop(0.5, `rgba(${pal.accent2Str},${(0.01 + avg * 0.025) * visualPower})`)
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx!.fillStyle = glowGrad
        ctx!.fillRect(0, 0, W, H)

        if (bass > 0.08) {
          const bAlpha = (bass - 0.08) * 0.55 * visualPower
          const horizGrad = ctx!.createLinearGradient(0, horizonY, W, horizonY)
          horizGrad.addColorStop(0, `rgba(${pal.accentStr},0)`)
          horizGrad.addColorStop(0.5, `rgba(${pal.accentStr},${bAlpha})`)
          horizGrad.addColorStop(1, `rgba(${pal.accentStr},0)`)
          ctx!.strokeStyle = horizGrad
          ctx!.lineWidth = 1
          ctx!.beginPath(); ctx!.moveTo(0, horizonY); ctx!.lineTo(W, horizonY); ctx!.stroke()
        }

        if (isTransient) {
          const scanY = H * (0.1 + Math.random() * 0.8)
          ctx!.strokeStyle = `rgba(${pal.accentStr},${0.06 * peak})`
          ctx!.lineWidth = dpr
          ctx!.beginPath(); ctx!.moveTo(0, scanY); ctx!.lineTo(W, scanY); ctx!.stroke()
        }
      }

      // Ring geometry — computed here because the orbiting comets (Layer 3) ride it. Bass "breathe" + a
      // transient kick drive the radius; eased for smoothness.
      const cx = W * 0.5
      const cy = horizonY * 0.52
      const baseRadius = Math.min(W, H) * 0.11
      bassPulseRef.current += (bass - bassPulseRef.current) * 0.22
      const targetR = baseRadius * (1 + bassPulseRef.current * 0.28 + (isTransient ? peak * 0.18 : 0))
      ringRadiusRef.current += (targetR - ringRadiusRef.current) * 0.18
      const ringR = ringRadiusRef.current

      // === LAYER 3: Rising phosphor particles + orbiting ring comets (shared pool, theme accent) ===
      const spawnChance = (0.003 + avg * 0.04 + bass * 0.06 + (isTransient ? peak * 0.05 : 0)) * visualPower
      if (bubbles && Math.random() < spawnChance) spawnBubble(W, H, bass)
      if (particles && isTransient && Math.random() < 0.5) {
        const n = 1 + (Math.random() < 0.4 ? 1 : 0)
        for (let k = 0; k < n; k++) {
          bubblesRef.current.push({
            x: cx, y: cy, r: (2 + Math.random() * 2) * dpr, vy: 0, vx: 0,
            alpha: 0.6 + Math.random() * 0.3, orbit: { a: Math.random() * TAU, spd: 0.04 + Math.random() * 0.05 },
          })
        }
      }

      bubblesRef.current = bubblesRef.current.filter((b) => {
        if (b.orbit) {
          b.orbit.a += b.orbit.spd
          b.x = cx + Math.cos(b.orbit.a) * (ringR + 8 * dpr)
          b.y = cy + Math.sin(b.orbit.a) * (ringR + 8 * dpr)
          b.alpha -= 0.006
          return b.alpha > 0.01
        }
        b.y += b.vy * (1 + bass * 0.5)
        b.x += b.vx
        b.alpha -= 0.007
        return b.y > -b.r * 3 && b.alpha > 0.01
      })

      if (bubbles || particles) for (const b of bubblesRef.current) {
        if (b.orbit ? !particles : !bubbles) continue   // each kind respects its own toggle
        const g = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 4)
        g.addColorStop(0, `rgba(${pal.accentStr},${b.alpha * 0.5})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx!.fillStyle = g
        ctx!.beginPath(); ctx!.arc(b.x, b.y, b.r * 4, 0, TAU); ctx!.fill()
        ctx!.fillStyle = `rgba(${pal.accentStr},${b.alpha})`
        ctx!.fillRect(b.x - b.r * 0.5, b.y - b.r * 0.5, b.r, b.r)
      }

      // === LAYER 4: Spectrum bars (segmented LED, theme gradient) ===
      if (bars) {
        const segH = SEG_H * dpr
        const segGap = SEG_GAP * dpr
        const barGapPx = BAR_GAP * dpr
        const totalGap = (BAR_COUNT - 1) * barGapPx
        const barW = (W - totalGap) / BAR_COUNT
        const maxH = horizonY * 0.88 * visualPower
        const totalSegs = Math.floor(maxH / (segH + segGap))
        const srcMap = mirrorBars ? BAR_MIRROR : barPerm   // frequency source per the active layout

        // Pass 1: update all peaks
        for (let i = 0; i < BAR_COUNT; i++) {
          const [lo, hi] = logBinRange(srcMap[i], SOURCE_BARS, binCount)
          let maxBin = 0
          for (let b = lo; b < hi; b++) maxBin = Math.max(maxBin, data[b])
          barPeakRef.current[i] = Math.max(maxBin / 255, barPeakRef.current[i] * 0.86)
        }

        // Pass 2: positions. Mirror mode = clean symmetric identity layout (lows center via BAR_MIRROR).
        // Otherwise relocate the few quietest "dead" bars to the outer edges (today's signature look).
        let renderAt: number[]
        if (mirrorBars) {
          renderAt = BAR_IDENTITY
        } else {
          renderAt = Array.from({ length: BAR_COUNT }, (_, i) => i)
          const barAtPos = Array.from({ length: BAR_COUNT }, (_, i) => i)
          const DEAD_THRESHOLD = 0.015
          const MAX_RELOCATE = 4
          const deadBars = Array.from({ length: BAR_COUNT }, (_, i) => i)
            .filter((i) => barPeakRef.current[i] < DEAD_THRESHOLD)
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
        }

        // Pass 3: segments (deep→accent→bright) + an accent2 peak cap (optional bloom) + a faint reflection.
        const barGlow = glowRef.current * BAR_GLOW_MAX * dpr
        for (let i = 0; i < BAR_COUNT; i++) {
          const x = renderAt[i] * (barW + barGapPx)
          const segCount = Math.floor(barPeakRef.current[i] * totalSegs * barJitter[i])
          for (let s = 0; s < segCount; s++) {
            const sy = horizonY - (s + 1) * (segH + segGap)
            if (sy < 0) break
            ctx!.fillStyle = lerpStops(pal.barStops, (s + 1) / totalSegs)
            ctx!.fillRect(x, sy, barW, segH)
          }
          if (segCount > 0) {
            const py = horizonY - segCount * (segH + segGap) - segGap
            if (py >= 0) {
              if (glowRef.current > 0) { ctx!.shadowBlur = barGlow; ctx!.shadowColor = `rgba(${pal.accent2Str},1)` }
              ctx!.fillStyle = `rgba(${pal.accent2Str},1)`
              ctx!.fillRect(x, py, barW, Math.max(1, 1.5 * dpr))
              if (glowRef.current > 0) ctx!.shadowBlur = 0
            }
            const reflSegs = Math.min(segCount, 6)
            for (let s = 0; s < reflSegs; s++) {
              const sy = horizonY + (s + 1) * (segH + segGap)
              ctx!.fillStyle = `rgba(${pal.accentStr},${0.1 * (1 - s / reflSegs)})`
              ctx!.fillRect(x, sy, barW, segH)
            }
          }
        }
      }

      // === LAYER 5: Radial ring — dual counter-rotation, bloom spokes, base arcs + shockwave ===
      if (ring) {
        if (rotation) {
          ringRotRef.current += (0.002 + avg * 0.006) * ringSpeedRef.current
          ringRot2Ref.current += (0.002 + avg * 0.006) * ringSpeedRef.current * 0.6
        }
        const rot = ringRotRef.current
        const rot2 = ringRot2Ref.current
        const maxTickLen = Math.min(W, H) * 0.07 * visualPower
        const tickCap = Math.min(W, H) * 0.12
        const ringGlow = glowRef.current * RING_GLOW_MAX
        const lineW = Math.max(1, (W / BAR_COUNT) * 0.5)
        for (let i = 0; i < RING_TICKS; i++) {
          const [lo, hi] = logBinRange(ringPerm[i], RING_TICKS / 2, binCount)
          let maxBin = 0
          for (let b = lo; b < hi; b++) maxBin = Math.max(maxBin, data[b])
          ringPeakRef.current[i] = Math.max(maxBin / 255, ringPeakRef.current[i] * 0.82)
          const rp = ringPeakRef.current[i]
          const tickLen = Math.min(rp * maxTickLen, tickCap)
          if (tickLen < 0.5) continue
          const baseAngle = (i / RING_TICKS) * TAU - Math.PI / 2
          const tickAlpha = 0.3 + rp * 0.55
          // Primary spoke (one rotation) — bloom on loud spokes only.
          const a1 = baseAngle + rot
          const c1 = Math.cos(a1), s1 = Math.sin(a1)
          ctx!.lineWidth = lineW
          ctx!.strokeStyle = lerpStops(pal.ringStops, rp, tickAlpha)
          if (glowRef.current > 0 && rp > 0.55) { ctx!.shadowBlur = ringGlow * rp * dpr; ctx!.shadowColor = `rgba(${pal.accent2Str},1)` }
          ctx!.beginPath(); ctx!.moveTo(cx + c1 * ringR, cy + s1 * ringR); ctx!.lineTo(cx + c1 * (ringR + tickLen), cy + s1 * (ringR + tickLen)); ctx!.stroke()
          if (glowRef.current > 0 && rp > 0.55) ctx!.shadowBlur = 0
          // Fainter counter-rotating spoke (shorter), same peak value.
          const a2 = baseAngle - rot2
          const c2 = Math.cos(a2), s2 = Math.sin(a2)
          ctx!.strokeStyle = lerpStops(pal.ringStops, rp, tickAlpha * 0.45)
          ctx!.beginPath(); ctx!.moveTo(cx + c2 * ringR, cy + s2 * ringR); ctx!.lineTo(cx + c2 * (ringR + tickLen * 0.6), cy + s2 * (ringR + tickLen * 0.6)); ctx!.stroke()
        }
        // Dual base arc: a crisp accent ring + a soft accent2 halo just outside it.
        ctx!.strokeStyle = `rgba(${pal.accentStr},${0.12 + avg * 0.18})`
        ctx!.lineWidth = 1.5 * dpr
        ctx!.beginPath(); ctx!.arc(cx, cy, ringR, 0, TAU); ctx!.stroke()
        ctx!.strokeStyle = `rgba(${pal.accent2Str},${0.05 + bass * 0.12})`
        ctx!.lineWidth = 3 * dpr
        ctx!.beginPath(); ctx!.arc(cx, cy, ringR + 2 * dpr, 0, TAU); ctx!.stroke()
        // Shockwave: one expanding arc kicked by each transient; fades as it grows (a single scalar).
        if (isTransient) shockRef.current = ringR
        if (shockRef.current > ringR * 0.5) {
          shockRef.current += (ringR * 2.4 - shockRef.current) * 0.08
          const shockAlpha = Math.max(0, 0.4 - ((shockRef.current - ringR) / (ringR * 1.4)) * 0.4)
          if (shockAlpha > 0.01) {
            ctx!.strokeStyle = `rgba(${pal.accent2Str},${shockAlpha})`
            ctx!.lineWidth = 2 * dpr
            ctx!.beginPath(); ctx!.arc(cx, cy, shockRef.current, 0, TAU); ctx!.stroke()
          }
        }
      }

      // === LAYER 6: Crosshair HUD (theme ink) ===
      const hudAlpha = 0.10 + avg * 0.06
      ctx!.strokeStyle = `rgba(${pal.inkStr},${hudAlpha})`
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
  }, [source, bars, ring, bubbles, atmosphere, rotation, particles, grid, mirrorBars, barPerm, ringPerm, barJitter])

  function runCommand(command: VisualizerCommand) {
    window.hub.sendVisualizerCommand(command)
  }

  // The drawer renders a serialized snapshot in both modes, so a row is addressed by
  // section+index. In the popout that has to travel back over IPC to the window that
  // owns the store; in the in-app overlay the store is right here. `id` rides along
  // as the staleness guard either way (see removeComingUpAt).
  function removeQueueRow(section: 'upNext' | 'comingUp', index: number, id?: number) {
    if (source === 'ipc') {
      runCommand({ type: 'queueRemove', section, index, id })
      return
    }
    const store = usePlayerStore.getState()
    if (section === 'upNext') store.removeFromUpNext(index, id)
    else store.removeFromComingUp(index, id)
  }

  type BoolKey = 'bars' | 'ring' | 'bubbles' | 'atmosphere' | 'rotation' | 'particles' | 'grid' | 'mirrorBars'
  function toggle(key: BoolKey) {
    useVizStore.getState().setVizSetting(key, !useVizStore.getState()[key])
  }
  function setSlider(key: 'ringSpeed' | 'glow' | 'intensity', v: number) {
    useVizStore.getState().setVizSetting(key, v)
  }
  const VIZ_TOGGLES: { key: BoolKey; label: string; on: boolean }[] = [
    { key: 'bars', label: 'Bars', on: bars },
    { key: 'mirrorBars', label: 'Mirror Bars', on: mirrorBars },
    { key: 'ring', label: 'Ring', on: ring },
    { key: 'rotation', label: 'Rotation', on: rotation },
    { key: 'particles', label: 'Particles', on: particles },
    { key: 'bubbles', label: 'Bubbles', on: bubbles },
    { key: 'atmosphere', label: 'Atmosphere', on: atmosphere },
    { key: 'grid', label: 'Grid', on: grid },
  ]
  const VIZ_SLIDERS: { key: 'ringSpeed' | 'glow' | 'intensity'; label: string; value: number }[] = [
    { key: 'intensity', label: 'PWR', value: intensity },
    { key: 'glow', label: 'GLOW', value: glow },
    { key: 'ringSpeed', label: 'SPIN', value: ringSpeed },
  ]

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
      <div className="absolute top-3 left-3 z-10 pointer-events-none font-term text-[12px]" style={{ color: 'rgb(var(--accent2-rgb) / 0.35)' }}>
        BPM <span style={{ color: 'rgb(var(--accent-rgb) / 0.50)' }}>120</span>
      </div>
      <div className="absolute top-3 right-16 z-10 pointer-events-none font-term text-[12px] tabular-nums text-right" style={{ color: 'rgb(var(--accent2-rgb) / 0.35)' }}>
        {fmtDuration(playback.currentTime)}
      </div>
      <div className="absolute bottom-36 left-3 z-10 pointer-events-none font-term text-[11px]" style={{ color: 'rgb(var(--accent2-rgb) / 0.25)' }}>
        SUB · MID
      </div>
      <div className="absolute bottom-36 right-3 z-10 pointer-events-none font-term text-[11px] text-right" style={{ color: 'rgb(var(--accent2-rgb) / 0.25)' }}>
        HI · TREBLE
      </div>

      {/* ESC button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 font-term text-[12px] tracking-[2px] opacity-25 hover:opacity-70 transition-opacity no-drag"
          style={{ color: 'var(--ink)' }}
        >
          [ESC]
        </button>
      )}

      {/* Settings panel (top-left hover) */}
      <div className="absolute left-3 top-8 z-20 w-44 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 no-drag">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-1.5 font-term text-[12px] transition-colors"
          style={{ background: '#000', border: '1px solid rgb(var(--accent-rgb) / 0.35)', color: 'var(--ink)' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--accent-rgb) / 0.70)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--accent-rgb) / 0.35)')}
        >
          VISUALS
          {settingsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {settingsOpen && (
          <div className="mt-0.5 p-1.5" style={{ background: '#000', border: '1px solid rgb(var(--accent-rgb) / 0.25)', boxShadow: '0 0 16px rgb(var(--accent-rgb) / 0.12)' }}>
            {VIZ_TOGGLES.map(({ key, label, on }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className="flex w-full items-center justify-between px-2 py-1.5 font-term text-[12px] transition-colors"
                style={{ color: 'var(--ink)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgb(var(--accent-rgb) / 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <span>{label}</span>
                <span style={{ color: on ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.28)' }}>{on ? 'ON' : 'OFF'}</span>
              </button>
            ))}
            <button
              onClick={() => setPermSeed((s) => s + 1)}
              className="w-full mt-1.5 pt-2 px-2 py-1 font-term text-[11px] text-left transition-colors"
              style={{ borderTop: '1px dashed rgb(var(--accent-rgb) / 0.12)', background: 'transparent', color: 'rgb(var(--ink-rgb) / 0.45)', borderRadius: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgb(var(--ink-rgb) / 0.45)' }}
            >
              ↺ RANDOMIZE LAYOUT
            </button>
            <div className="mt-1.5 pt-2 flex flex-col gap-2" style={{ borderTop: '1px dashed rgb(var(--accent-rgb) / 0.12)' }}>
              {VIZ_SLIDERS.map(({ key, label, value }) => (
                <label key={key} className="flex items-center gap-1.5 font-term text-[11px]" style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
                  <span className="w-8">{label}</span>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={value}
                    onChange={(e) => setSlider(key, Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-6 text-right" style={{ color: 'rgb(var(--ink-rgb) / 0.55)' }}>{value.toFixed(1)}</span>
                </label>
              ))}
            </div>
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
                    background: isCurrent ? 'var(--accent2)' : isPast ? 'var(--accent)' : 'rgb(var(--accent-rgb) / 0.18)',
                    boxShadow: isCurrent ? '0 0 8px var(--accent2)' : isPast ? '0 0 3px rgb(var(--accent-rgb) / 0.35)' : 'none',
                    borderRadius: 0,
                  }}
                />
              )
            })}
          </div>
          <div className="flex justify-between font-term text-[11px] mt-1" style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}>
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
          style={{ background: '#000', border: '1px solid rgb(var(--accent-rgb) / 0.40)', boxShadow: '0 0 20px rgb(var(--accent-rgb) / 0.12)' }}
        >
          {/* Cover + metadata */}
          <div className="flex items-center gap-3 min-w-0 flex-shrink-0" style={{ width: 180 }}>
            <VectorGridCover src={playback.coverUrl} size={40} label="A:VIZ" />
            <div className="min-w-0">
              <p className="font-lcd text-[13px] truncate phosphor-glow" style={{ color: 'var(--accent)' }}>
                {playback.title || '—'}
              </p>
              <p className="font-term text-[12px] truncate" style={{ color: 'rgb(var(--ink-rgb) / 0.55)' }}>
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
            <span style={{ color: playback.volume <= 0 ? 'rgb(var(--ink-rgb) / 0.30)' : 'rgb(var(--ink-rgb) / 0.50)', flexShrink: 0 }}>
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

      <FullscreenQueueDrawer queue={playback.queue ?? EMPTY_QUEUE} onRemove={removeQueueRow} />

      {!playback.isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '12%' }}>
          <p className="font-term text-[12px] tracking-[6px]" style={{ color: 'rgb(var(--accent-rgb) / 0.10)' }}>
            PAUSED
          </p>
        </div>
      )}
    </div>
  )
}

function FullscreenQueueDrawer({
  queue,
  onRemove,
}: {
  queue: PlaybackSnapshot['queue']
  onRemove: (section: 'upNext' | 'comingUp', index: number, id?: number) => void
}) {
  const hasItems = queue.nowPlaying || queue.upNext.length > 0 || queue.comingUp.length > 0

  return (
    <aside className="group absolute right-0 top-0 z-30 flex h-full translate-x-[calc(100%-20px)] items-stretch transition-transform duration-300 hover:translate-x-0 focus-within:translate-x-0">
      <div
        className="flex w-5 items-center justify-center"
        style={{ background: 'rgba(2,5,3,0.85)', borderLeft: '1px solid rgb(var(--accent-rgb) / 0.15)' }}
      >
        <div className="flex h-28 w-full flex-col items-center justify-center gap-2">
          <ListMusic size={12} style={{ color: 'rgb(var(--accent-rgb) / 0.55)' }} />
          <span
            className="writing-vertical font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--accent2)' }}
          >
            Queue
          </span>
        </div>
      </div>
      <div
        className="h-full w-72 flex flex-col"
        style={{ background: '#020503', borderLeft: '1px solid rgb(var(--accent-rgb) / 0.20)', boxShadow: '-8px 0 24px rgb(var(--accent-rgb) / 0.06)' }}
      >
        <div
          className="flex h-10 flex-shrink-0 items-center justify-between px-4"
          style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
        >
          <p className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--accent2)' }}>QUEUE</p>
          <p className="font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}>
            {queue.upNext.length + queue.comingUp.length}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {queue.nowPlaying && (
            <section className="mb-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--accent2)' }}>NOW PLAYING</p>
              <FullscreenQueueRow track={queue.nowPlaying} current />
            </section>
          )}
          {queue.upNext.length > 0 && (
            <section className="mb-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--accent2)' }}>UP NEXT</p>
              {queue.upNext.map((track, i) => (
                <FullscreenQueueRow
                  key={`up-${track.id ?? track.title}-${i}`}
                  track={track}
                  onRemove={() => onRemove('upNext', i, track.id)}
                />
              ))}
            </section>
          )}
          {queue.comingUp.length > 0 && (
            <section>
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--accent2)' }}>COMING UP</p>
              {queue.comingUp.map((track, i) => (
                <FullscreenQueueRow
                  key={`coming-${track.id ?? track.title}-${i}`}
                  track={track}
                  dim
                  onRemove={() => onRemove('comingUp', i, track.id)}
                />
              ))}
            </section>
          )}
          {!hasItems && (
            <div className="flex h-40 items-center justify-center font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}>
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
  onRemove,
}: {
  track: QueueSnapshotTrack
  current?: boolean
  dim?: boolean
  onRemove?: () => void
}) {
  const label = track.id ? `A:${String(track.id).padStart(3, '0')}` : 'A:000'
  return (
    <div
      className="mb-1.5 flex min-w-0 items-center gap-2 px-1.5 py-1.5"
      style={{
        background: current ? 'rgb(var(--accent-rgb) / 0.08)' : 'transparent',
        borderLeft: current ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {/* The dim wraps the CONTENT, not the row: an X inside it would composite down to
          ~0.1 alpha and be invisible on exactly the rows it exists for. Same split QueuePanel
          uses, where the button is a sibling of the dimmed QueueRow. */}
      <div className={`flex min-w-0 flex-1 items-center gap-2 ${dim ? 'opacity-40' : ''}`}>
        <div className="flex-shrink-0">
          <VectorGridCover src={track.coverUrl} size={28} label={label} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`font-term text-[12px] truncate leading-tight ${current ? 'phosphor-glow' : ''}`}
            style={{ color: current ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.75)' }}
          >
            {current ? '▶ ' : ''}{track.title || '—'}
          </p>
          <p className="font-term text-[11px] truncate" style={{ color: 'rgb(var(--ink-rgb) / 0.40)' }}>
            {track.artist || '—'}
          </p>
        </div>
        <span className="font-term text-[11px] flex-shrink-0 tabular-nums" style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}>
          {fmtDuration(track.duration)}
        </span>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          title="remove from queue"
          aria-label={`remove ${track.title || 'track'} from queue`}
          className="flex-shrink-0 transition-opacity hover:opacity-70"
          style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}
