import React from 'react'
import { useSettingsStore } from '@/store/settings'
import { FADE_MAX, SPEED_MIN, SPEED_MAX } from '@/lib/audio-math'
import { Section, SettingRow, Slider } from './primitives'

// Transport mode + volume live on the player bar (HUD), so they're intentionally NOT duplicated here.
// This pane is for the things the HUD doesn't expose.

const SHORTCUTS: [keys: string, action: string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Seek −/+ 5s'],
  ['Shift + ← / →', 'Previous / next track'],
  ['↑ / ↓', 'Volume up / down'],
  ['M', 'Mute / unmute'],
]

export default function Playback() {
  const { fadeSec, speed, setFadeSec, setSpeed } = useSettingsStore()

  return (
    <>
      <Section
        title="Playback"
        description="Applied to the audio engine live and remembered across restarts."
      >
        <SettingRow label="Crossfade" help="Blend the end of each song into the start of the next">
          <Slider
            value={fadeSec}
            min={0}
            max={FADE_MAX}
            step={0.5}
            onChange={setFadeSec}
            format={(v) => (v === 0 ? 'Off' : `${v}s`)}
          />
        </SettingRow>
        <SettingRow label="Speed" help="Tempo only — pitch is preserved">
          <Slider
            value={speed}
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={0.05}
            onChange={setSpeed}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </SettingRow>
      </Section>

      <Section
        title="Keyboard shortcuts"
        description="Work anywhere in the app, except while typing in a text field."
      >
        <div className="flex flex-col gap-2">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={action} className="flex items-center justify-between gap-4">
              <span className="font-term text-[13px]" style={{ color: 'var(--ink)' }}>{action}</span>
              <kbd
                className="font-mono text-[11px] px-2 py-0.5 flex-shrink-0"
                style={{ color: 'var(--accent)', border: '1px solid rgb(var(--accent-rgb) / 0.3)', background: 'rgb(var(--accent-rgb) / 0.06)', borderRadius: 2 }}
              >
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}
