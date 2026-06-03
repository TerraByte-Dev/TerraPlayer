import React from 'react'

// Theme-aware primitives shared across the tools. Everything resolves the CSS theme variables so each tool
// recolors with the active theme for free. Canvas/game *content* colors (board ink, tile palettes) are kept
// literal inside their own tools — these helpers are for the chrome (toolbars, inputs, tabs, buttons).

export const inputStyle: React.CSSProperties = {
  background: 'var(--bg-0)',
  border: '1px solid rgb(var(--accent-rgb) / 0.25)',
  color: 'var(--ink)',
  borderRadius: 0,
  outline: 'none',
}
export const INPUT_FOCUS = 'rgb(var(--accent-rgb) / 0.55)'
export const INPUT_BLUR = 'rgb(var(--accent-rgb) / 0.25)'

export function focusInput(e: React.FocusEvent<HTMLElement>) { e.currentTarget.style.borderColor = INPUT_FOCUS }
export function blurInput(e: React.FocusEvent<HTMLElement>) { e.currentTarget.style.borderColor = INPUT_BLUR }

/** An icon/segment button with an active state (used by tool toolbars). */
export function SegmentedButton({ active, onClick, title, children }: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 min-w-8 items-center justify-center px-2 transition-colors"
      style={{
        border: active ? '1px solid rgb(var(--accent-rgb) / 0.40)' : '1px solid rgb(var(--accent-rgb) / 0.15)',
        background: active ? 'rgb(var(--accent-rgb) / 0.12)' : 'transparent',
        color: active ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.45)',
        borderRadius: 0,
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgb(var(--accent-rgb) / 0.08)'; e.currentTarget.style.color = 'var(--ink)' } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgb(var(--ink-rgb) / 0.45)' } }}
    >
      {children}
    </button>
  )
}

/** A text tab (used by Timer Tools). */
export function TextTab({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 font-term text-[12px] transition-colors"
      style={{
        background: active ? 'rgb(var(--accent-rgb) / 0.12)' : 'transparent',
        border: active ? '1px solid rgb(var(--accent-rgb) / 0.35)' : '1px solid transparent',
        color: active ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.5)',
        borderRadius: 0,
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgb(var(--accent-rgb) / 0.06)'; e.currentTarget.style.color = 'var(--ink)' } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgb(var(--ink-rgb) / 0.5)' } }}
    >
      {children}
    </button>
  )
}

/** A labelled numeric input. */
export function NumberField({ label, value, max, min = 0, disabled, onChange }: {
  label: string
  value: number
  max: number
  min?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        className="px-2 py-2 font-term text-[13px] normal-case tracking-normal disabled:opacity-45"
        style={inputStyle}
        onFocus={focusInput}
        onBlur={blurInput}
      />
    </label>
  )
}

/** The big phosphor LCD readout used by Timer / Stopwatch / RNG / game scores. */
export function Readout({ children, fullscreen, size }: {
  children: React.ReactNode
  fullscreen?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const cls = size === 'lg'
    ? (fullscreen ? 'text-[140px]' : 'text-[88px]')
    : (fullscreen ? 'text-[96px]' : 'text-[64px]')
  return (
    <div className={`${cls} font-lcd tabular-nums phosphor-glow leading-none`} style={{ color: 'var(--accent)' }}>
      {children}
    </div>
  )
}

/** A standard primary/secondary tool action button (metal-key styled). */
export function ToolButton({ children, onClick, primary, disabled, title, className = '' }: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  disabled?: boolean
  title?: string
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`metal-key ${primary ? 'is-primary' : ''} gap-1.5 px-4 py-2 font-term text-[13px] ${className}`}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      {children}
    </button>
  )
}
