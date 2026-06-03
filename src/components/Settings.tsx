import React, { useEffect, useState } from 'react'
import { X, Download, Palette, SlidersHorizontal, Play, Library as LibraryIcon, Music, RefreshCw, Info } from 'lucide-react'
import Appearance from './settings/Appearance'
import Audio from './settings/Audio'
import Playback from './settings/Playback'
import Library from './settings/Library'
import Updates from './settings/Updates'
import About from './settings/About'

type Section = 'appearance' | 'audio' | 'playback' | 'library' | 'music' | 'updates' | 'about'

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'APPEARANCE', icon: <Palette size={12} /> },
  { id: 'audio',      label: 'AUDIO',      icon: <SlidersHorizontal size={12} /> },
  { id: 'playback',   label: 'PLAYBACK',   icon: <Play size={12} /> },
  { id: 'library',    label: 'LIBRARY',    icon: <LibraryIcon size={12} /> },
  { id: 'music',      label: 'ADD MUSIC',  icon: <Music size={12} /> },
  { id: 'updates',    label: 'UPDATES',    icon: <RefreshCw size={12} /> },
  { id: 'about',      label: 'ABOUT',      icon: <Info size={12} /> },
]

export default function Settings({ onClose, onOpenDownloader }: { onClose: () => void; onOpenDownloader: () => void }) {
  const [section, setSection] = useState<Section>('appearance')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center no-drag"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col"
        style={{
          width: 'min(760px, calc(100vw - 32px))',
          height: 'min(560px, calc(100vh - 48px))',
          background: 'var(--bg-1)',
          border: '1px solid rgb(var(--accent-rgb) / 0.25)',
          boxShadow: '0 0 40px rgb(var(--accent-rgb) / 0.08)',
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 h-10 flex items-center justify-between px-4"
          style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.15)', background: 'var(--bg-0)' }}>
          <div className="flex items-center gap-2">
            <span style={{ display: 'inline-block', width: 5, height: 5, background: 'var(--accent2)', transform: 'rotate(45deg)', boxShadow: '0 0 6px var(--accent2)' }} />
            <span className="font-term text-[11px] tracking-[2.5px]" style={{ color: 'var(--accent2)' }}>SETTINGS</span>
          </div>
          <button className="metal-key w-7 h-7" onClick={onClose}><X size={13} /></button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left nav rail */}
          <div className="flex-shrink-0 w-36 flex flex-col pt-3 overflow-y-auto" style={{ borderRight: '1px solid rgb(var(--accent-rgb) / 0.12)' }}>
            {NAV.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className="text-left px-4 py-2 font-term text-[10px] tracking-[1.5px] transition-colors flex items-center gap-2"
                style={{
                  color: section === id ? 'var(--accent)' : 'rgb(var(--accent-rgb) / 0.45)',
                  background: section === id ? 'rgb(var(--accent-rgb) / 0.06)' : 'transparent',
                  borderLeft: section === id ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <span style={{ opacity: 0.8 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>

          {/* Content pane */}
          <div className="flex-1 overflow-y-auto p-6">
            {section === 'appearance' && <Appearance />}
            {section === 'audio' && <Audio />}
            {section === 'playback' && <Playback />}
            {section === 'library' && <Library />}
            {section === 'music' && <MusicPane onOpenDownloader={onOpenDownloader} />}
            {section === 'updates' && <Updates />}
            {section === 'about' && <About />}
          </div>
        </div>
      </div>
    </div>
  )
}

function MusicPane({ onOpenDownloader }: { onOpenDownloader: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="font-term text-[10px] tracking-[2px] mb-1" style={{ color: 'rgb(var(--accent-rgb) / 0.35)' }}>ADD MUSIC</div>
        <p className="font-term text-[13px] leading-[1.5]" style={{ color: 'rgb(var(--ink-rgb) / 0.7)' }}>
          Download songs straight into your library. Paste an{' '}
          <span style={{ color: 'var(--accent)' }}>Artist - Track</span> list (or a YouTube URL), preview the
          chosen version with a confidence flag, then grab the explicit / original master — not a clean
          or radio edit.
        </p>
      </div>
      <button
        className="metal-key is-primary px-4 h-9 font-term text-[11px] tracking-[1.5px] self-start flex items-center gap-2"
        onClick={onOpenDownloader}
      >
        <Download size={14} /> OPEN MUSIC DOWNLOADER
      </button>
      <p className="font-term text-[11px]" style={{ color: 'rgb(var(--ink-rgb) / 0.3)' }}>
        First run? The downloader checks your environment and can install what's missing.
      </p>
    </div>
  )
}
