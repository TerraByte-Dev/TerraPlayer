import React, { useEffect, useRef } from 'react'
import { getAnalyser } from '@/lib/audio'
import { usePlayerStore } from '@/store/player'

const BAR_COUNT = 32
const SOURCE_BARS = BAR_COUNT / 2

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
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const analyser = getAnalyser()
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const binCount = analyser.frequencyBinCount

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const W = canvas!.width
      const H = canvas!.height
      ctx!.clearRect(0, 0, W, H)

      const totalGap = (BAR_COUNT - 1) * 1
      const barW = (W - totalGap) / BAR_COUNT

      const grad = ctx!.createLinearGradient(0, H, 0, 0)
      grad.addColorStop(0, 'rgba(127,233,208,0.9)')
      grad.addColorStop(1, 'rgba(108,197,255,0.6)')

      for (let i = 0; i < BAR_COUNT; i++) {
        const sourceIdx = i < SOURCE_BARS ? SOURCE_BARS - 1 - i : i - SOURCE_BARS
        const [lo, hi] = logBinRange(sourceIdx, SOURCE_BARS, binCount)
        let max = 0
        for (let b = lo; b < hi; b++) max = Math.max(max, dataArray[b])
        const val = max / 255

        // Peak fall-off
        const prev = peakRef.current[i]
        peakRef.current[i] = Math.max(val, prev * 0.84)
        const barH = Math.max(1, peakRef.current[i] * H * 0.92)

        const x = i * (barW + 1)
        const y = H - barH
        ctx!.fillStyle = grad
        ctx!.beginPath()
        ctx!.roundRect(x, y, barW, barH, 1)
        ctx!.fill()
      }
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={height}
      className={`rounded transition-opacity duration-700 ${isPlaying ? 'opacity-90' : 'opacity-15'}`}
    />
  )
}
