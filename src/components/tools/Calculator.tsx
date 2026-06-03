import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ToolProps } from './types'
import { evaluate, formatResult } from '@/lib/tools/calculator'

// Calculator tool — a real, keyboard-driven calculator.
//
// The component owns a single `expr` string that the user builds up via the button grid or the keyboard.
// "=" runs the pure evaluate() from src/lib/tools/calculator.ts and shows the formatted result; that
// result then becomes the next operand so chained calculations work. Invalid input flips an `error`
// flag, which paints the LCD with an "ERR" state until the next keypress.

const HISTORY_KEY = 'terraplayer.calc.lastResult'

// Operators that should not be appended directly onto another operator (a fresh operator replaces the
// dangling one instead, so "5 * +" becomes "5 +"). Percent / parens are intentionally excluded.
const BINARY_OPS = new Set(['+', '-', '*', '/', '^'])

type KeyKind = 'digit' | 'op' | 'paren' | 'fn' | 'equals'

interface KeyDef {
  label: string
  /** What gets appended to the expression (defaults to label). */
  ins?: string
  kind: KeyKind
  /** Optional spanning / accent styling. */
  span?: boolean
  accent?: boolean
}

export default function Calculator({ fullscreen }: ToolProps) {
  // The expression being edited.
  const [expr, setExpr] = useState('')
  // Last evaluated result, shown beneath the live expression (and rolled into the next operand).
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // True right after "=" so the next digit starts a fresh expression instead of appending to the result.
  const [justEvaluated, setJustEvaluated] = useState(false)

  const displayRef = useRef<HTMLDivElement>(null)

  // Restore the last result across opens (nice-to-have continuity), but start with an empty editor.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HISTORY_KEY)
      if (saved) setResult(saved)
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [])

  // Keep the long expression scrolled to its right edge as it grows.
  useEffect(() => {
    const el = displayRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [expr])

  const clearAll = useCallback(() => {
    setExpr('')
    setResult(null)
    setError(null)
    setJustEvaluated(false)
  }, [])

  const backspace = useCallback(() => {
    setError(null)
    if (justEvaluated) {
      // Editing the result: drop into it as the working expression first.
      setJustEvaluated(false)
      setExpr((prev) => (result ?? prev).slice(0, -1))
      return
    }
    setExpr((prev) => prev.slice(0, -1))
  }, [justEvaluated, result])

  const append = useCallback(
    (raw: string, kind: KeyKind) => {
      setError(null)
      setExpr((prev) => {
        let base = prev
        // After "=", a digit/open-paren/fn starts fresh from the result-as-operand; an operator
        // continues the calculation using the result.
        if (justEvaluated) {
          if (kind === 'op' || (kind === 'paren' && raw === ')') || raw === '%') {
            base = result ?? ''
          } else {
            base = ''
          }
        }

        if (kind === 'op' && BINARY_OPS.has(raw)) {
          const last = base.trimEnd().slice(-1)
          // Allow a leading unary minus, but otherwise replace a dangling binary operator rather
          // than stacking two. ("5*" + "+" -> "5+"). Keep "(" + "-" so unary minus in groups works.
          if (BINARY_OPS.has(last) && !(raw === '-' && (last === '(' || last === ''))) {
            // Replace the trailing operator (and any space) with the new one.
            base = base.replace(/[+\-*/^]\s*$/, '')
          }
        }
        return base + raw
      })
      setJustEvaluated(false)
    },
    [justEvaluated, result],
  )

  const doEvaluate = useCallback(() => {
    // Evaluate the current expression, or re-show the standing result if the editor is empty.
    const source = justEvaluated ? result ?? '' : expr || result || ''
    if (source.trim() === '') return
    try {
      const value = evaluate(source)
      const formatted = formatResult(value)
      setResult(formatted)
      setExpr(source)
      setError(null)
      setJustEvaluated(true)
      try {
        window.localStorage.setItem(HISTORY_KEY, formatted)
      } catch {
        /* ignore */
      }
    } catch {
      setError('ERR')
      setJustEvaluated(false)
    }
  }, [expr, result, justEvaluated])

  const toggleSign = useCallback(() => {
    setError(null)
    // Wrap the current expression (or result) in a unary minus, toggling if already negated.
    setExpr((prev) => {
      const src = justEvaluated ? result ?? prev : prev
      if (src.trim() === '') return src
      if (src.startsWith('-(') && src.endsWith(')')) return src.slice(2, -1)
      if (src.startsWith('-')) return src.slice(1)
      return `-(${src})`
    })
    setJustEvaluated(false)
  }, [justEvaluated, result])

  // Keyboard support. Guard against firing while focus is in a text field elsewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      const k = e.key

      if (k === 'Enter' || k === '=') {
        e.preventDefault()
        doEvaluate()
        return
      }
      if (k === 'Backspace') {
        e.preventDefault()
        backspace()
        return
      }
      if (k === 'Escape' || k === 'c' || k === 'C') {
        e.preventDefault()
        clearAll()
        return
      }
      if (k >= '0' && k <= '9') {
        e.preventDefault()
        append(k, 'digit')
        return
      }
      if (k === '.') {
        e.preventDefault()
        append('.', 'digit')
        return
      }
      if (k === '+' || k === '-' || k === '*' || k === '/' || k === '^') {
        e.preventDefault()
        append(k, 'op')
        return
      }
      if (k === '(' || k === ')') {
        e.preventDefault()
        append(k, 'paren')
        return
      }
      if (k === '%') {
        e.preventDefault()
        append('%', 'op')
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [append, backspace, clearAll, doEvaluate])

  // Button grid layout. Order matters — top function row, then the classic 4-wide numpad.
  const KEYS: KeyDef[][] = [
    [
      { label: 'C', kind: 'fn', accent: true },
      { label: '( )', ins: '(', kind: 'paren' },
      { label: '%', kind: 'op' },
      { label: '⌫', ins: 'back', kind: 'fn' }, // ⌫
    ],
    [
      { label: '7', kind: 'digit' },
      { label: '8', kind: 'digit' },
      { label: '9', kind: 'digit' },
      { label: '÷', ins: '/', kind: 'op' }, // ÷
    ],
    [
      { label: '4', kind: 'digit' },
      { label: '5', kind: 'digit' },
      { label: '6', kind: 'digit' },
      { label: '×', ins: '*', kind: 'op' }, // ×
    ],
    [
      { label: '1', kind: 'digit' },
      { label: '2', kind: 'digit' },
      { label: '3', kind: 'digit' },
      { label: '−', ins: '-', kind: 'op' }, // −
    ],
    [
      { label: '±', ins: 'sign', kind: 'fn' }, // ±
      { label: '0', kind: 'digit' },
      { label: '.', kind: 'digit' },
      { label: '+', kind: 'op' },
    ],
    [
      { label: 'xʸ', ins: '^', kind: 'op' }, // xʸ exponent
      { label: ')', kind: 'paren' },
      { label: '=', kind: 'equals', accent: true, span: true },
    ],
  ]

  function handleKey(def: KeyDef) {
    const ins = def.ins ?? def.label
    switch (def.kind) {
      case 'equals':
        doEvaluate()
        break
      case 'fn':
        if (ins === 'back') backspace()
        else if (ins === 'sign') toggleSign()
        else if (def.label === 'C') clearAll()
        break
      default:
        append(ins, def.kind)
    }
  }

  // Display sizing scales up in fullscreen.
  const exprSize = fullscreen ? 'text-[36px]' : 'text-[22px]'
  const resultSize = fullscreen ? 'text-[120px]' : 'text-[72px]'
  const keyPad = fullscreen ? 'py-6 text-[26px]' : 'py-4 text-[18px]'
  const gridGap = fullscreen ? 'gap-3' : 'gap-2'

  // What the big readout shows: the error, the live result, or a placeholder.
  const bigReadout = error ? 'ERR' : result ?? '0'
  const showExpr = error ? (expr || ' ') : expr || (result !== null ? ' ' : ' ')

  return (
    <div className={`mx-auto flex h-full min-h-0 w-full flex-col ${fullscreen ? 'max-w-2xl px-8 py-8' : 'max-w-md px-4 py-4'}`}>
      {/* LCD display */}
      <div
        className="lcd-panel relative flex min-h-0 flex-shrink-0 flex-col justify-end gap-1 px-4 py-3"
        style={{ marginBottom: fullscreen ? 20 : 14 }}
      >
        {/* Live expression (small, right-aligned, scrolls) */}
        <div
          ref={displayRef}
          className={`overflow-x-auto whitespace-nowrap text-right font-lcd tabular-nums leading-none ${exprSize}`}
          style={{ color: 'rgb(var(--accent-rgb) / 0.55)', scrollbarWidth: 'none' }}
          title={expr}
        >
          {showExpr}
        </div>
        {/* Result (big, glowing) */}
        <div
          className={`overflow-x-auto whitespace-nowrap text-right font-lcd tabular-nums leading-none phosphor-glow ${resultSize}`}
          style={{ color: error ? '#FF4040' : 'var(--accent)', textShadow: error ? '0 0 8px rgba(255,64,64,0.6)' : undefined, scrollbarWidth: 'none' }}
          title={error ? 'Invalid expression' : result ?? ''}
        >
          {bigReadout}
        </div>
      </div>

      {/* Button grid */}
      <div className={`flex min-h-0 flex-1 flex-col ${gridGap}`}>
        {KEYS.map((row, ri) => (
          <div key={ri} className={`grid flex-1 grid-cols-4 ${gridGap}`}>
            {row.map((def) => (
              <button
                key={def.label}
                onClick={() => handleKey(def)}
                className={`metal-key ${def.accent ? 'is-primary' : ''} ${def.span ? 'col-span-2' : ''} font-term tabular-nums ${keyPad}`}
                style={{
                  color: def.kind === 'op' || def.kind === 'paren' ? 'var(--accent2)' : undefined,
                }}
                title={def.label}
                tabIndex={-1}
              >
                {def.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
