import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Wrench, ChevronUp } from 'lucide-react'
import { TOOLS } from '../tools/registry'
import type { ToolId } from '../tools/types'

// Kept here for back-compat with App.tsx / UtilityOverlay which import `UtilityMode` from this module.
export type UtilityMode = ToolId

// A slim "TOOLS" bar that opens a grid of unlabelled tool icons above it. Portaled to <body> so it floats
// over the player bar; a full-screen backdrop closes it on any outside click (Escape too).
export default function UtilityDock({ onOpen }: { onOpen: (mode: UtilityMode) => void }) {
  const barRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  function toggle() {
    if (!open && barRef.current) setRect(barRef.current.getBoundingClientRect())
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function pick(mode: ToolId) {
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
          <div className="fixed inset-0" style={{ zIndex: 60 }} onClick={() => setOpen(false)} />
          <div
            className="fixed p-2"
            style={{
              zIndex: 61,
              left: rect.left,
              width: Math.max(rect.width, 200),
              bottom: window.innerHeight - rect.top + 6,
              background: 'var(--bg-1)',
              border: '1px solid rgb(var(--accent-rgb) / 0.30)',
              boxShadow: '0 0 18px rgb(var(--accent-rgb) / 0.15)',
            }}
          >
            <div className="font-mono text-[9px] uppercase tracking-[2px] px-1 pb-2" style={{ color: 'var(--accent2)' }}>TOOLS</div>
            <div className="grid grid-cols-5 gap-1.5">
              {TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => pick(tool.id)}
                  title={tool.hint}
                  aria-label={tool.hint}
                  className="metal-key flex items-center justify-center"
                  style={{ aspectRatio: '1 / 1' }}
                >
                  {tool.icon}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
