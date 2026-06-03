import React, { useEffect, useRef, useState } from 'react'
import { Coins, Dice5 } from 'lucide-react'
import type { ToolProps } from './types'
import { Readout, ToolButton, inputStyle, focusInput, blurInput } from './shared'

type RngMode = 'custom' | 'coin' | 'dice'

export default function RandomNumber({ fullscreen }: ToolProps) {
  const [max, setMax] = useState(100)
  const [result, setResult] = useState<number | null>(null)
  const [mode, setMode] = useState<RngMode>('custom')
  const [rolling, setRolling] = useState(false)
  const rollTimer = useRef<number | null>(null)

  // Clean up the roll animation interval on unmount (memory discipline).
  useEffect(() => () => { if (rollTimer.current) window.clearInterval(rollTimer.current) }, [])

  function roll(nextMode = mode, nextMax = max) {
    const bounded = Math.max(1, Math.min(1_000_000, Math.floor(nextMax)))
    setMode(nextMode)
    setMax(bounded)
    if (rollTimer.current) window.clearInterval(rollTimer.current)
    // Quick shuffle flourish, then settle on the final value.
    setRolling(true)
    let ticks = 0
    rollTimer.current = window.setInterval(() => {
      setResult(Math.floor(Math.random() * bounded) + 1)
      if (++ticks >= 8) {
        window.clearInterval(rollTimer.current!)
        rollTimer.current = null
        setResult(Math.floor(Math.random() * bounded) + 1)
        setRolling(false)
      }
    }, 45)
  }

  const resultLabel = mode === 'coin' && result ? (result === 1 ? 'Heads' : 'Tails') : (result?.toString() ?? '--')
  const repeatLabel = mode === 'coin' ? 'Flip again' : mode === 'dice' ? 'Roll again' : 'Again'

  return (
    <div className={`mx-auto flex max-w-2xl flex-col items-center gap-5 px-2 ${fullscreen ? 'pt-24' : 'pt-6'}`}>
      <div className="text-center">
        <div style={{ opacity: rolling ? 0.7 : 1, transition: 'opacity 120ms' }}>
          <Readout fullscreen={fullscreen} size="lg">{resultLabel}</Readout>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'rgb(var(--accent2-rgb) / 0.6)' }}>
          {mode === 'coin' ? 'Coin flip' : mode === 'dice' ? 'Dice roll' : `1 to ${max}`}
        </p>
      </div>

      <div className="grid w-full max-w-md gap-3 p-3" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.15)', background: 'rgb(var(--accent-rgb) / 0.02)' }}>
        <label className="grid gap-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
          Maximum
          <input type="number" min={1} max={1_000_000} value={max} onChange={(e) => { setMax(Number(e.target.value)); setMode('custom') }}
            className="px-2 py-2 font-term text-[13px] normal-case tracking-normal" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => roll('coin', 2)} className="metal-key justify-center gap-1.5 font-term text-[12px]"><Coins size={12} />Coin</button>
          <button onClick={() => roll('dice', 6)} className="metal-key justify-center gap-1.5 font-term text-[12px]"><Dice5 size={12} />Dice</button>
          <button onClick={() => roll('custom', max)} className="metal-key is-primary justify-center font-term text-[12px]">{result === null ? 'Pick' : repeatLabel}</button>
        </div>
      </div>

      {fullscreen && result !== null && (
        <ToolButton primary onClick={() => roll(mode, max)}>{repeatLabel}</ToolButton>
      )}
    </div>
  )
}
