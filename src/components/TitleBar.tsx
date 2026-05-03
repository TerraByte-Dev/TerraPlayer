import React, { useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'

function formatDate(d: Date) {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}.${mo}.${day} · ${h}:${min}:${s}`
}

export default function TitleBar() {
  const isWindows = window.hub.isWindows
  const [clock, setClock] = useState(() => formatDate(new Date()))

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatDate(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      className="drag-region relative z-[1] flex-shrink-0 flex items-center px-3 select-none"
      style={{ height: 24, background: '#000', borderBottom: '1px solid rgba(0,255,136,0.18)' }}
    >
      {/* Rotating diamond LED */}
      <span
        className="flex-shrink-0 mr-2"
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          background: '#00FF88',
          transform: 'rotate(45deg)',
          boxShadow: '0 0 6px #00FF88',
          animation: 'term-blink 2s steps(2) infinite',
        }}
      />

      {/* Logotype */}
      <span
        className="font-term text-[12px] tracking-[1.5px] phosphor-glow"
        style={{ color: '#00FF88' }}
      >
        MAINFRAME//PLAY
      </span>

      <span className="mx-2 font-term text-[12px]" style={{ color: 'rgba(155,245,184,0.30)' }}>—</span>

      {/* Live clock */}
      <span className="font-term text-[12px] tracking-[1px]" style={{ color: '#00E5FF' }}>
        {clock}
      </span>

      <div className="flex-1" />

      {/* Right: status + window controls (non-Windows) */}
      {!isWindows && (
        <div className="flex items-center gap-3 no-drag">
          <span className="font-term text-[11px]" style={{ color: '#FFB000' }}>● TX</span>
          <span className="font-term text-[11px]" style={{ color: 'rgba(155,245,184,0.30)' }}>cpu 38% · 320k</span>
          <div className="flex items-center gap-[3px]">
            <button
              onClick={() => window.hub.minimizeWindow()}
              title="Minimize"
              className="flex items-center justify-center transition-colors"
              style={{
                width: 18, height: 18,
                background: 'rgba(0,255,136,0.06)',
                border: '1px solid rgba(0,255,136,0.25)',
                color: 'rgba(155,245,184,0.65)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#00FF88'; e.currentTarget.style.background = 'rgba(0,255,136,0.14)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(155,245,184,0.65)'; e.currentTarget.style.background = 'rgba(0,255,136,0.06)' }}
            >
              <Minus size={9} />
            </button>
            <button
              onClick={() => window.hub.maximizeWindow()}
              title="Maximize"
              className="flex items-center justify-center transition-colors"
              style={{
                width: 18, height: 18,
                background: 'rgba(0,255,136,0.06)',
                border: '1px solid rgba(0,255,136,0.25)',
                color: 'rgba(155,245,184,0.65)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#00FF88'; e.currentTarget.style.background = 'rgba(0,255,136,0.14)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(155,245,184,0.65)'; e.currentTarget.style.background = 'rgba(0,255,136,0.06)' }}
            >
              <Square size={9} />
            </button>
            <button
              onClick={() => window.hub.closeWindow()}
              title="Close"
              className="flex items-center justify-center transition-colors"
              style={{
                width: 18, height: 18,
                background: 'rgba(255,48,48,0.06)',
                border: '1px solid rgba(255,48,48,0.25)',
                color: 'rgba(255,120,120,0.65)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FF3030'; e.currentTarget.style.background = 'rgba(255,48,48,0.18)'; e.currentTarget.style.borderColor = 'rgba(255,48,48,0.55)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,120,120,0.65)'; e.currentTarget.style.background = 'rgba(255,48,48,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,48,48,0.25)' }}
            >
              <X size={9} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
