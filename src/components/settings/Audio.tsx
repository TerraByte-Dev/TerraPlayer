import React from 'react'
import { usePlayerStore } from '@/store/player'
import { useSettingsStore } from '@/store/settings'
import {
  EQ_BAND_MIN, EQ_BAND_MAX, PREAMP_MIN, PREAMP_MAX,
  EQ_FREQUENCIES, EQ_PRESETS, EQ_PRESET_ORDER, eqPresetLabel,
} from '@/lib/audio-math'
import { Section, SettingRow, Slider, Toggle, KeyButton } from './primitives'

const dbFmt = (v: number) => `${v > 0 ? '+' : ''}${v} dB`
const freqLabel = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`)

export default function Audio() {
  const { eq, setEqPreset, setEqBand } = usePlayerStore()
  const { preampDb, mono, setPreampDb, setMono } = useSettingsStore()

  return (
    <>
      <Section
        title="Equalizer"
        description="A 10-band graphic EQ (±8 dB). Pick a preset or shape any band — nudging a band switches to Custom. Applies live and is remembered."
      >
        {/* Preset grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {EQ_PRESET_ORDER.map((id) => {
            const active = eq.preset === id
            return (
              <button
                key={id}
                onClick={() => setEqPreset(id)}
                className="font-term text-[12px] px-2 py-1.5 transition-colors"
                style={{
                  border: active ? '1px solid rgb(var(--accent-rgb) / 0.55)' : '1px solid rgb(var(--accent-rgb) / 0.15)',
                  color: active ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.55)',
                  background: active ? 'rgb(var(--accent-rgb) / 0.12)' : 'transparent',
                }}
              >
                {EQ_PRESETS[id].label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between">
          <span className="font-term text-[11px]" style={{ color: 'rgb(var(--ink-rgb) / 0.4)' }}>
            {eq.preset === 'custom' ? 'Custom curve' : eqPresetLabel(eq.preset)}
          </span>
          <KeyButton onClick={() => setEqPreset('off')} disabled={eq.preset === 'off'}>Reset to flat</KeyButton>
        </div>

        {/* Bands */}
        {EQ_FREQUENCIES.map((hz, i) => (
          <SettingRow key={hz} label={`${freqLabel(hz)} Hz`}>
            <Slider value={eq.bands[i]} min={EQ_BAND_MIN} max={EQ_BAND_MAX} step={0.5} onChange={(v) => setEqBand(i, v)} format={dbFmt} />
          </SettingRow>
        ))}
      </Section>

      <Section
        title="Output"
        description="Pre-amp trims overall level ahead of the EQ; mono sums left + right to a single signal."
      >
        <SettingRow label="Pre-amp" help="Tame hot masters or lift quiet ones">
          <Slider value={preampDb} min={PREAMP_MIN} max={PREAMP_MAX} step={0.5} onChange={setPreampDb} format={dbFmt} />
        </SettingRow>
        <SettingRow label="Mono downmix" help={mono ? 'On — L+R summed' : 'Off — full stereo'}>
          <Toggle checked={mono} onChange={setMono} />
        </SettingRow>
      </Section>
    </>
  )
}
