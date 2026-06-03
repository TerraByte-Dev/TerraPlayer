import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, Dice5, PenLine, Wrench, ChevronUp } from 'lucide-react'

export type UtilityMode = 'board' | 'timer' | 'rng'

const TOOLS: Array<{ mode: UtilityMode; title: string; icon: React.ReactNode }> = [
  { mode: 'board', title: 'Dry-erase board', icon: <PenLine size={14} strokeWidth={1.6} /> },
  { mode: 'timer', title: 'Timer', icon: <Clock3 size={14} strokeWidth={1.6} /> },
  { mode: 'rng', title: 'Random number', icon: <Dice5 size={14} strokeWidth={1.6} /> },
]

export default function UtilityDock({ onOpen }: { onOpen: (mode: UtilityMode) => void }) {
  const barRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  function toggle() {
    if (!open && barRef.current) setRect(barRef.current.getBoundingClientRect())
    setOpen((v) => !v)
  }

  // Close on Escape (clicking outside is handled by the backdrop).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function pick(mode: UtilityMode) {
    setOpen(false)
    onOpen(mode)
  }

  return (
    <div className="px-3 pb-2">
      <button
        ref={barRef}
        onClick={toggle}
        title="Tools"
        className="w-full flex items-center gap-2 px-2.5 h-7 transition-colors"
        style={{
          border: `1px solid rgb(var(--accent-rgb) / ${open ? 0.4 : 0.18})`,
          background: open ? 'rgb(var(--accent-rgb) / 0.10)' : 'rgba(0,0,0,0.25)',
          color: open ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.6)',
        }}
      >
        <Wrench size={12} />
        <span className="font-term text-[11px] tracking-[2px] flex-1 text-left">TOOLS</span>
        <ChevronUp size={12} style={{ transform: open ? 'none' : 'rotate(180deg)', transition: 'transform 120ms' }} />
      </button>

      {open && rect && createPortal(
        <>
          {/* Click-anywhere-out backdrop */}
          <div className="fixed inset-0" style={{ zIndex: 60 }} onClick={() => setOpen(false)} />
          {/* Popover — rises above the TOOLS bar, aligned to its width */}
          <div
            className="fixed p-1"
            style={{
              zIndex: 61,
              left: rect.left,
              width: rect.width,
              bottom: window.innerHeight - rect.top + 6,
              background: 'var(--bg-1)',
              border: '1px solid rgb(var(--accent-rgb) / 0.30)',
              boxShadow: '0 0 18px rgb(var(--accent-rgb) / 0.15)',
            }}
          >
            <div className="font-mono text-[9px] uppercase tracking-[2px] px-2 pt-1 pb-1.5" style={{ color: 'var(--accent2)' }}>
              TOOLS
            </div>
            {TOOLS.map((tool) => (
              <button
                key={tool.mode}
                onClick={() => pick(tool.mode)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 text-left transition-colors"
                style={{ color: 'rgb(var(--ink-rgb) / 0.7)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgb(var(--accent-rgb) / 0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgb(var(--ink-rgb) / 0.7)'; e.currentTarget.style.background = 'transparent' }}
              >
                <span className="flex-shrink-0" style={{ color: 'var(--accent)' }}>{tool.icon}</span>
                <span className="font-term text-[13px]">{tool.title}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
