import React, { useEffect, useState } from 'react'
import { Minus, Square, X, Settings, Monitor, MonitorX } from 'lucide-react'
import { setCrtOff } from '@/lib/theme'
import { useDisplayState } from '@/lib/useDisplay'
import logoUrl from '@/assets/brand/terrabyte-globe.png'

// The TerraByte globe ships as a transparent monochrome shape; masking it with the theme accent recolors it
// to match every theme for free.
const LOGO_STYLE: React.CSSProperties = {
  display: 'inline-block',
  width: 18,
  height: 18,
  flexShrink: 0,
  backgroundColor: 'var(--accent)',
  WebkitMaskImage: `url(${logoUrl})`,
  maskImage: `url(${logoUrl})`,
  WebkitMaskSize: 'contain',
  maskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
  filter: 'drop-shadow(0 0 4px rgb(var(--accent-rgb) / 0.5))',
}

function formatDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} · ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function TitleBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const isWindows = window.hub.isWindows
  const [clock, setClock] = useState(() => formatDate(new Date()))
  const { crtOff } = useDisplayState()

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatDate(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      className="drag-region relative z-[1] flex-shrink-0 flex items-center select-none"
      style={{ height: 30, background: '#000', borderBottom: '1px solid rgb(var(--accent-rgb) / 0.18)' }}
    >
      {/* Left: brand */}
      <div className="flex items-center gap-2 px-3 flex-shrink-0">
        <span aria-hidden style={LOGO_STYLE} />
        <span className="font-lcd text-[14px] tracking-[1.5px] phosphor-glow" style={{ color: 'var(--accent)' }}>
          TerraPlayer
        </span>
      </div>

      {/* Center: drag spacer */}
      <div className="flex-1 h-full" />

      {/* Right: clock + display toggles + settings (kept clear of the native window overlay on Windows) */}
      <div className="no-drag flex items-center gap-1.5" style={{ paddingRight: isWindows ? 140 : 6 }}>
        <span className="font-term text-[11px] tracking-[1px] mr-1 hidden sm:inline" style={{ color: 'var(--accent2)' }}>
          {clock}
        </span>

        <TitleButton
          title={crtOff ? 'CRT effect off — click to enable' : 'CRT effect on — click to disable'}
          onClick={() => setCrtOff(!crtOff)}
          ariaPressed={!crtOff}
        >
          {crtOff ? <MonitorX size={14} /> : <Monitor size={14} />}
        </TitleButton>

        <TitleButton title="Settings" onClick={onOpenSettings}>
          <Settings size={14} />
        </TitleButton>

        {/* Custom window controls only off-Windows (Windows draws a native overlay). */}
        {!isWindows && (
          <div className="flex items-center gap-[3px] ml-1">
            <WinControl title="Minimize" onClick={() => window.hub.minimizeWindow()} accent><Minus size={9} /></WinControl>
            <WinControl title="Maximize" onClick={() => window.hub.maximizeWindow()} accent><Square size={9} /></WinControl>
            <WinControl title="Close" onClick={() => window.hub.closeWindow()}><X size={9} /></WinControl>
          </div>
        )}
      </div>
    </div>
  )
}

function TitleButton({ children, onClick, title, ariaPressed }: {
  children: React.ReactNode
  onClick: () => void
  title: string
  ariaPressed?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={ariaPressed}
      className="flex items-center justify-center w-6 h-6 rounded-sm transition-colors"
      style={{ color: 'rgb(var(--ink-rgb) / 0.5)', background: 'transparent', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgb(var(--ink-rgb) / 0.5)')}
    >
      {children}
    </button>
  )
}

function WinControl({ children, onClick, title, accent }: {
  children: React.ReactNode
  onClick: () => void
  title: string
  accent?: boolean
}) {
  const base = accent
    ? { bg: 'rgb(var(--accent-rgb) / 0.06)', bd: 'rgb(var(--accent-rgb) / 0.25)', fg: 'rgb(var(--ink-rgb) / 0.65)', hbg: 'rgb(var(--accent-rgb) / 0.14)', hfg: 'var(--accent)', hbd: 'rgb(var(--accent-rgb) / 0.25)' }
    : { bg: 'rgba(255,48,48,0.06)', bd: 'rgba(255,48,48,0.25)', fg: 'rgba(255,120,120,0.65)', hbg: 'rgba(255,48,48,0.18)', hfg: '#FF3030', hbd: 'rgba(255,48,48,0.55)' }
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center transition-colors"
      style={{ width: 18, height: 18, background: base.bg, border: `1px solid ${base.bd}`, color: base.fg }}
      onMouseEnter={(e) => { e.currentTarget.style.color = base.hfg; e.currentTarget.style.background = base.hbg; e.currentTarget.style.borderColor = base.hbd }}
      onMouseLeave={(e) => { e.currentTarget.style.color = base.fg; e.currentTarget.style.background = base.bg; e.currentTarget.style.borderColor = base.bd }}
    >
      {children}
    </button>
  )
}
