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

export interface SpectrumStats {
  /** Mean bin energy across the whole spectrum, normalized 0–1. */
  avg: number
  /** Low-end energy (first 8 bins) over a fixed 8-bin window, 0–1. */
  bass: number
  /** High-end energy (bins ≥ trebleStart) over its window, 0–1. */
  treble: number
  /** Loudest single bin, normalized 0–1. */
  peak: number
}

/**
 * One-pass spectrum summary for the visualizer draw loop. Returns exactly the
 * same four 0–1 values the fullscreen visualizer computes per frame, but in a
 * single pass over the typed array with ZERO intermediate allocations — the old
 * code ran `reduce` + two `Array.from(slice(...))` + `Math.max(...spread)` every
 * frame (~60 fps), churning 3–4 throwaway arrays. The divisors are preserved
 * verbatim: bass over a fixed 8-bin window, treble over (n − trebleStart) bins
 * where trebleStart = min(96, n − 1). Pure + unit-tested so the hot loop can
 * trust it. (Bytes are read straight from a `Uint8Array`; `ArrayLike` keeps it
 * testable with plain arrays.)
 */
export function spectrumStats(data: ArrayLike<number>): SpectrumStats {
  const n = data.length
  if (n === 0) return { avg: 0, bass: 0, treble: 0, peak: 0 }
  const trebleStart = Math.min(96, n - 1)
  let sum = 0
  let bassSum = 0
  let trebleSum = 0
  let max = 0
  for (let i = 0; i < n; i++) {
    const v = data[i]
    sum += v
    if (v > max) max = v
    if (i < 8) bassSum += v
    if (i >= trebleStart) trebleSum += v
  }
  return {
    avg: sum / n / 255,
    bass: bassSum / (8 * 255),
    treble: trebleSum / ((n - trebleStart) * 255),
    peak: max / 255,
  }
}
