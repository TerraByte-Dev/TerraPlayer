// Pure audio math — no Web Audio / DOM dependencies, so it is unit-testable under node and shared by the
// player store (EQ presets), the audio graph (pre-amp gain), and the Settings UI (clamping).

export type AudioPreset = 'off' | 'polish' | 'bass' | 'voice'

export interface EqSettings {
  preset: AudioPreset
  low: number
  mid: number
  high: number
}

/** EQ band gain bounds, in dB. Mirrors the BiquadFilter shelves/peak in lib/audio.ts. */
export const EQ_BAND_MIN = -8
export const EQ_BAND_MAX = 8

/** Pre-amp bounds, in dB. A modest range — enough to tame hot/quiet masters without clipping the graph. */
export const PREAMP_MIN = -12
export const PREAMP_MAX = 12

/** The named presets. `off` is flat; the rest are gentle, musical curves. */
export const EQ_PRESETS: Record<AudioPreset, EqSettings> = {
  off:    { preset: 'off',    low: 0,    mid: 0,     high: 0   },
  polish: { preset: 'polish', low: 1.5,  mid: -0.75, high: 2.5 },
  bass:   { preset: 'bass',   low: 4,    mid: 0,     high: 1   },
  voice:  { preset: 'voice',  low: -1.5, mid: 2.5,   high: 1.5 },
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

/** Clamp an EQ band gain into the allowed dB range. */
export function clampEqBand(value: number): number {
  return clamp(value, EQ_BAND_MIN, EQ_BAND_MAX)
}

/** Clamp a pre-amp value into the allowed dB range. */
export function clampPreamp(value: number): number {
  return clamp(value, PREAMP_MIN, PREAMP_MAX)
}

/** A fresh copy of a preset's settings (never hand out the shared constant). */
export function eqPresetGains(preset: AudioPreset): EqSettings {
  return { ...(EQ_PRESETS[preset] ?? EQ_PRESETS.off) }
}

/**
 * Convert a decibel value to a linear gain multiplier for a Web Audio GainNode.
 * 0 dB → 1.0, +6 dB → ~2.0, −6 dB → ~0.5. The canonical 20·log10 relationship.
 */
export function dbToGain(db: number): number {
  return Math.pow(10, clampPreamp(db) / 20)
}
