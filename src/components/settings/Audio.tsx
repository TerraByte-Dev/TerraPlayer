import React from 'react'
import { usePlayerStore } from '@/store/player'
import { useSettingsStore } from '@/store/settings'
import { EQ_BAND_MIN, EQ_BAND_MAX, PREAMP_MIN, PREAMP_MAX, type AudioPreset } from '@/lib/audio-math'
import { Section, SettingRow, Slider, Segmented, Toggle } from './primitives'

const PRESETS: { value: AudioPreset; label: string }[] = [
  { value: 'off', label: 'Flat' },
  { value: 'polish', label: 'YT Polish' },
  { value: 'bass', label: 'Bass Lift' },
  { value: 'voice', label: 'Voice' },
]

const dbFmt = (v: number) => `${v > 0 ? '+' : ''}${v} dB`

export default function Audio() {
  const { eq, setEqPreset, setEqBand } = usePlayerStore()
  const { preampDb, mono, setPreampDb, setMono } = useSettingsStore()

  return (
    <>
      <Section
        title="Equalizer"
        description="A gentle 3-band EQ. Presets are starting points; nudging any band switches to manual. Applies live and is remembered."
      >
        <SettingRow label="Preset">
          <Segmented value={eq.preset} options={PRESETS} onChange={setEqPreset} />
        </SettingRow>
        {(['low', 'mid', 'high'] as const).map((band) => (
          <SettingRow key={band} label={band[0].toUpperCase() + band.slice(1)}>
            <Slider value={eq[band]} min={EQ_BAND_MIN} max={EQ_BAND_MAX} step={0.5} onChange={(v) => setEqBand(band, v)} format={dbFmt} />
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
