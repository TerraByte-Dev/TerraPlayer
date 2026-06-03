import React, { useEffect } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'

// The framed window every tool renders inside. Centered overlay by default; edge-to-edge when fullscreen.
// Escape closes. Theme-aware.
export default function Shell({ title, fullscreen, onClose, onFullscreenChange, children }: {
  title: string
  fullscreen: boolean
  onClose: () => void
  onFullscreenChange: (fullscreen: boolean) => Promise<void> | void
  children: React.ReactNode
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 z-40 no-drag ${fullscreen ? '' : 'flex items-center justify-center px-4 py-6'}`}
      style={{ background: fullscreen ? 'var(--bg-0)' : 'rgba(0,0,0,0.60)' }}
      onClick={(e) => { if (!fullscreen && e.target === e.currentTarget) onClose() }}
    >
      <section
        className={`flex min-h-0 flex-col overflow-hidden ${
          fullscreen ? 'h-full w-full' : 'h-[min(720px,calc(100vh-48px))] w-[min(920px,calc(100vw-32px))]'
        }`}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid rgb(var(--accent-rgb) / 0.25)',
          boxShadow: '0 0 36px rgb(var(--accent-rgb) / 0.10)',
          borderRadius: 0,
        }}
      >
        <header className="flex h-10 flex-shrink-0 items-center justify-between px-4" style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.12)' }}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2" style={{ background: 'var(--accent)', boxShadow: '0 0 8px rgb(var(--accent-rgb) / 0.8)' }} />
            <p className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: 'var(--accent2)' }}>{title}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onFullscreenChange(!fullscreen)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} className="metal-key w-7 h-7 justify-center">
              {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button onClick={onClose} title="Close" className="metal-key w-7 h-7 justify-center">
              <X size={13} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </div>
  )
}
