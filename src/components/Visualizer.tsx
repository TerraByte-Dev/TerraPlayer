import React, { useEffect, useRef } from 'react'
import { getAnalyser } from '@/lib/audio'
import { usePlayerStore } from '@/store/player'

const BAR_COUNT = 28
const SOURCE_BARS = BAR_COUNT / 2
const GAP = 2
const SEG_H = 3
const SEG_GAP = 1

// Palette hex → RGB for canvas
const COLOR = {
  lo:   '#00FF88',
  mid:  '#FFB000',
  hi:   '#FF3030',
  peak: '#00E5FF',
}

function logBinRange(barIdx: number, barCount: number, binCount: number): [number, number] {
  const logMax = Math.log2(binCount)
  const lo = Math.round(Math.pow(2, (barIdx / barCount) * logMax))
  const hi = Math.round(Math.pow(2, ((barIdx + 1) / barCount) * logMax))
  return [Math.min(lo, binCount - 1), Math.min(Math.max(hi, lo + 1), binCount)]
}

export default function Visualizer({ height = 40 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const peakRef = useRef<Float32Array>(new Float32Array(BAR_COUNT).fill(0))
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W_CSS = canvas.clientWidth || 240
    const H_CSS = height
    canvas.width = W_CSS * dpr
    canvas.height = H_CSS * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const analyser = getAnalyser()
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const binCount = analyser.frequencyBinCount

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      ctx!.clearRect(0, 0, W_CSS, H_CSS)

      const totalGap = (BAR_COUNT - 1) * GAP
      const barW = (W_CSS - totalGap) / BAR_COUNT

      for (let i = 0; i < BAR_COUNT; i++) {
        const sourceIdx = i < SOURCE_BARS ? SOURCE_BARS - 1 - i : i - SOURCE_BARS
        const [lo, hi] = logBinRange(sourceIdx, SOURCE_BARS, binCount)
        let maxBin = 0
        for (let b = lo; b < hi; b++) maxBin = Math.max(maxBin, dataArray[b])
        const val = maxBin / 255

        peakRef.current[i] = Math.max(val, peakRef.current[i] * 0.94)
        const barH = Math.max(2, peakRef.current[i] * H_CSS)
        const x = i * (barW + GAP)

        const totalSegs = Math.floor(H_CSS / (SEG_H + SEG_GAP))
        const segCount = Math.floor(barH / (SEG_H + SEG_GAP))

        for (let s = 0; s < segCount; s++) {
          const sy = H_CSS - (s + 1) * (SEG_H + SEG_GAP)
          const ratio = (s + 1) / totalSegs
          ctx!.fillStyle = ratio < 0.55 ? COLOR.lo : ratio < 0.8 ? COLOR.mid : COLOR.hi
          ctx!.fillRect(x, sy, barW, SEG_H)
        }

        // Peak indicator (1px line 2px above bar top)
        const py = H_CSS - peakRef.current[i] * H_CSS - 2
        ctx!.fillStyle = COLOR.peak
        ctx!.fillRect(x, py, barW, 1)
      }
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [height])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block' }}
      className={`transition-opacity duration-700 ${isPlaying ? 'opacity-90' : 'opacity-15'}`}
    />
  )
}
