import React from 'react'

// Shared, theme-aware building blocks for the Settings panes. Everything resolves the CSS theme variables
// (var(--accent), rgb(var(--ink-rgb) / α), …) so it recolors with the active theme for free.

/** A titled block with an optional description, separated by a faint rule. */
export function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 pb-5 mb-5" style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}>
      <div>
        <h3 className="font-term text-[10px] tracking-[2px]" style={{ color: 'rgb(var(--accent-rgb) / 0.5)' }}>
          {title.toUpperCase()}
        </h3>
        {description && (
          <p className="font-term text-[12px] leading-[1.5] mt-1" style={{ color: 'rgb(var(--ink-rgb) / 0.55)' }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

/** A label (+ optional help line) on the left, a control on the right. */
export function SettingRow({ label, help, children }: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-term text-[13px]" style={{ color: 'var(--ink)' }}>{label}</div>
        {help && <div className="font-term text-[11px] mt-0.5" style={{ color: 'rgb(var(--ink-rgb) / 0.4)' }}>{help}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

/** A sliding on/off switch. */
export function Toggle({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative transition-colors"
      style={{
        width: 38, height: 20, borderRadius: 10,
        background: checked ? 'rgb(var(--accent-rgb) / 0.25)' : 'rgba(0,0,0,0.5)',
        border: `1px solid ${checked ? 'rgb(var(--accent-rgb) / 0.6)' : 'rgb(var(--ink-rgb) / 0.2)'}`,
      }}
    >
      <span
        className="absolute transition-all"
        style={{
          top: 2, left: checked ? 20 : 2, width: 14, height: 14, borderRadius: '50%',
          background: checked ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.5)',
          boxShadow: checked ? '0 0 8px var(--accent)' : 'none',
        }}
      />
    </button>
  )
}

/** A range slider with an aligned numeric readout. */
export function Slider({ value, min, max, step = 1, onChange, format }: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <div className="flex items-center gap-3" style={{ width: 220 }}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="text-right font-mono text-[11px] tabular-nums flex-shrink-0" style={{ width: 48, color: 'var(--ink)' }}>
        {format ? format(value) : value}
      </span>
    </div>
  )
}

/** A small segmented selector (radio-style button group). */
export function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.15)' }}>
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="font-term text-[12px] px-3 py-1 transition-colors"
            style={{
              color: active ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.55)',
              background: active ? 'rgb(var(--accent-rgb) / 0.12)' : 'transparent',
              borderLeft: i > 0 ? '1px solid rgb(var(--accent-rgb) / 0.15)' : 'none',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A metal-key styled action button. */
export function KeyButton({ children, onClick, primary, danger, disabled, title }: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  danger?: boolean
  disabled?: boolean
  title?: string
}) {
  if (danger) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className="px-3 h-8 font-term text-[11px] tracking-[1px] transition-colors"
        style={{ color: '#ff6b6b', background: 'rgba(255,85,85,0.06)', border: '1px solid rgba(255,85,85,0.35)' }}
      >
        {children}
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`metal-key ${primary ? 'is-primary' : ''} px-3 h-8 font-term text-[11px] tracking-[1px]`}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      {children}
    </button>
  )
}
