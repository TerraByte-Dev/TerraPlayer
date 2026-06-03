import React from 'react'
import { THEMES, applyTheme, setCrtOff, setReduceMotion } from '@/lib/theme'
import { useDisplayState } from '@/lib/useDisplay'
import { Section, SettingRow, Toggle } from './primitives'

export default function Appearance() {
  const { themeId, crtOff, reduceMotion } = useDisplayState()

  return (
    <>
      <Section
        title="Theme"
        description="Recolor the entire interface. Applies instantly and is remembered across restarts."
      >
        <div className="grid grid-cols-2 gap-2.5">
          {THEMES.map((t) => {
            const active = themeId === t.id
            return (
              <button
                key={t.id}
                onClick={() => applyTheme(t.id)}
                className="text-left p-2.5 transition-colors"
                style={{
                  border: active ? '1px solid var(--accent)' : '1px solid rgb(var(--ink-rgb) / 0.12)',
                  background: active ? 'rgb(var(--accent-rgb) / 0.06)' : 'transparent',
                }}
              >
                {/* Swatch preview */}
                <div className="flex items-center gap-2 mb-2 p-2" style={{ background: t.swatch.bg, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="w-5 h-5 flex-shrink-0 rounded-full" style={{ background: t.swatch.accent, boxShadow: `0 0 8px ${t.swatch.accent}` }} />
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="block h-1.5" style={{ background: t.swatch.accent, opacity: 0.85, width: '65%' }} />
                    <span className="block h-1.5" style={{ background: t.swatch.ink, opacity: 0.5, width: '90%' }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: active ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.3)' }}>
                    {active && <span className="w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} />}
                  </span>
                  <span className="font-term text-[12px]" style={{ color: active ? 'var(--accent)' : 'var(--ink)' }}>{t.name}</span>
                </div>
                <p className="font-term text-[10px] mt-1 leading-snug" style={{ color: 'rgb(var(--ink-rgb) / 0.4)' }}>{t.blurb}</p>
              </button>
            )
          })}
        </div>
      </Section>

      <Section
        title="Display"
        description="Retro overlays and motion. Independent of the chosen theme."
      >
        <SettingRow label="Scanlines & glow" help={crtOff ? 'Off — flat, maximum readability' : 'On — CRT scanlines + vignette'}>
          <Toggle checked={!crtOff} onChange={(on) => setCrtOff(!on)} />
        </SettingRow>
        <SettingRow label="Reduce motion" help={reduceMotion ? 'Animations & transitions disabled' : 'Blinks, pulses & transitions on'}>
          <Toggle checked={reduceMotion} onChange={setReduceMotion} />
        </SettingRow>
      </Section>
    </>
  )
}
