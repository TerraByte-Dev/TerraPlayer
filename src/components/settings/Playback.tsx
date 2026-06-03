import React from 'react'
import { usePlayerStore } from '@/store/player'
import type { RepeatMode } from '@/store/player'
import { Section, SettingRow, Slider, Segmented, Toggle } from './primitives'

const REPEATS: { value: RepeatMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'all', label: 'All' },
  { value: 'one', label: 'One' },
]

export default function Playback() {
  const { volume, setVolume, shuffle, toggleShuffle, repeat } = usePlayerStore()

  // The store models shuffle/repeat as actions (so the shuffled queue stays consistent). Drive them to an
  // explicit target by toggling/cycling until they match.
  const setShuffle = (on: boolean) => { if (shuffle !== on) toggleShuffle() }
  const setRepeat = (mode: RepeatMode) => {
    let guard = 0
    while (usePlayerStore.getState().repeat !== mode && guard++ < 3) usePlayerStore.getState().cycleRepeat()
  }

  return (
    <Section
      title="Playback"
      description="These default modes and your volume are remembered across restarts."
    >
      <SettingRow label="Volume">
        <Slider value={Math.round(volume * 100)} min={0} max={100} step={1} onChange={(v) => setVolume(v / 100)} format={(v) => `${v}%`} />
      </SettingRow>
      <SettingRow label="Shuffle" help={shuffle ? 'On' : 'Off'}>
        <Toggle checked={shuffle} onChange={setShuffle} />
      </SettingRow>
      <SettingRow label="Repeat">
        <Segmented value={repeat} options={REPEATS} onChange={setRepeat} />
      </SettingRow>
    </Section>
  )
}
