// Pure audio math — no Web Audio / DOM dependencies, so it is unit-testable under node and shared by the
// player store (EQ presets), the audio graph (band gains, pre-amp gain), the Settings UI (clamping), and
// the portable settings importer (migration of older saved EQ shapes).

export type AudioPreset =
  | 'off'
  | 'rock'
  | 'pop'
  | 'jazz'
  | 'classical'
  | 'electronic'
  | 'hip-hop'
  | 'vocal'
  | 'acoustic'
  | 'bass-boost'
  | 'treble-boost'
  | 'loudness'
  | 'custom' // user-edited bands — not a fixed table

/** A graphic-EQ setting: a named preset (or 'custom') plus one gain per band in EQ_FREQUENCIES order. */
export interface EqSettings {
  preset: AudioPreset
  bands: number[]
}

/** 10 ISO octave band centers (Hz). Each is a peaking BiquadFilter in lib/audio.ts. */
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_BAND_COUNT = EQ_FREQUENCIES.length
/** Q ≈ √2 → ~1-octave (-3 dB) bandwidth, so adjacent octave-spaced bands sum to a near-flat response. */
export const EQ_Q = 1.414

/** EQ band gain bounds, in dB. */
export const EQ_BAND_MIN = -8
export const EQ_BAND_MAX = 8

/** Pre-amp bounds, in dB. A modest range — enough to tame hot/quiet masters without clipping the graph. */
export const PREAMP_MIN = -12
export const PREAMP_MAX = 12

/** Playback-speed bounds (pitch-preserved). */
export const SPEED_MIN = 0.5
export const SPEED_MAX = 2

/** Fade in/out duration bounds, in seconds (Spotify-style). 0 disables the fade. */
export const FADE_MAX = 6

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

/** Clamp a playback rate; non-finite input falls back to 1× (normal speed). */
export function clampSpeed(value: number): number {
  return Number.isFinite(value) ? clamp(value, SPEED_MIN, SPEED_MAX) : 1
}

/** Clamp a fade duration in seconds; non-finite input falls back to 0 (off). */
export function clampFadeSec(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0, FADE_MAX) : 0
}

/**
 * When (seconds) the end-of-track fade-out should begin, or null when it shouldn't run at all — no fade
 * configured, or an unknown / zero / non-finite duration (e.g. a still-loading or streamed source).
 */
export function fadeStartTime(duration: number, fadeSec: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0 || fadeSec <= 0) return null
  return Math.max(0, duration - fadeSec)
}

/** The named presets (excludes 'custom'). Each is exactly EQ_BAND_COUNT gains in dB, all within ±8. */
export const EQ_PRESETS: Record<Exclude<AudioPreset, 'custom'>, { label: string; bands: number[] }> = {
  off:            { label: 'Flat',         bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  rock:           { label: 'Rock',         bands: [3.5, 3, 1.5, -1, -1.5, 0, 1.5, 2.5, 3, 2.5] },
  pop:            { label: 'Pop',          bands: [2, 2.5, 1.5, 0, -1, 0.5, 1.5, 2.5, 3, 2.5] },
  jazz:           { label: 'Jazz',         bands: [2.5, 2, 1, 0, 0.5, 0, 0.5, 1.5, 2, 1.5] },
  classical:      { label: 'Classical',    bands: [2, 1.5, 0.5, 0, 0, 0, 0, 1, 2, 2.5] },
  electronic:     { label: 'Electronic',   bands: [4.5, 4, 2, -0.5, -1.5, 0, 1, 2.5, 3.5, 4] },
  'hip-hop':      { label: 'Hip-Hop',      bands: [5, 4.5, 2.5, 0.5, -1, 0, 0.5, 1.5, 2, 1.5] },
  vocal:          { label: 'Vocal Boost',  bands: [-1.5, -1, 0, 1, 2, 3, 3.5, 2.5, 1, 0.5] },
  acoustic:       { label: 'Acoustic',     bands: [1.5, 1.5, 1, 0, 0.5, 1, 1.5, 2.5, 2.5, 2] },
  'bass-boost':   { label: 'Bass Boost',   bands: [6, 5, 3.5, 1.5, 0, 0, 0, 0, 0, 0] },
  'treble-boost': { label: 'Treble Boost', bands: [0, 0, 0, 0, 0, 0.5, 1.5, 3, 4.5, 5.5] },
  loudness:       { label: 'Loudness',     bands: [5, 4, 2, -0.5, -2, -2.5, -1.5, 1, 3.5, 5] },
}

/** Display order for the preset picker. 'custom' is shown only when active, never selectable. */
export const EQ_PRESET_ORDER: Exclude<AudioPreset, 'custom'>[] = [
  'off', 'rock', 'pop', 'jazz', 'classical', 'electronic', 'hip-hop', 'vocal', 'acoustic', 'bass-boost', 'treble-boost', 'loudness',
]

function isNamedPreset(v: unknown): v is Exclude<AudioPreset, 'custom'> {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(EQ_PRESETS, v)
}

/** Whether an arbitrary value is a valid preset id (named or 'custom'). */
export function isAudioPreset(v: unknown): v is AudioPreset {
  return v === 'custom' || isNamedPreset(v)
}

/** A fresh EqSettings for a preset (always a NEW bands array — never share the constant's array). */
export function eqPresetGains(preset: AudioPreset): EqSettings {
  const def = isNamedPreset(preset) ? EQ_PRESETS[preset] : EQ_PRESETS.off
  const id: AudioPreset = isNamedPreset(preset) ? preset : 'off'
  return { preset: id, bands: def.bands.map(clampEqBand) }
}

/** Human label for a preset id (incl. 'custom'). */
export function eqPresetLabel(preset: AudioPreset): string {
  if (preset === 'custom') return 'Custom'
  return isNamedPreset(preset) ? EQ_PRESETS[preset].label : EQ_PRESETS.off.label
}

/** Coerce arbitrary input to a valid EQ_BAND_COUNT-length, clamped bands array. */
export function normalizeBands(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : []
  return Array.from({ length: EQ_BAND_COUNT }, (_, i) => clampEqBand(Number(arr[i]) || 0))
}

/**
 * Migrate the pre-2.1.6 EQ shape ({ preset, low, mid, high }) to the 10-band shape, mirroring the old
 * 3-filter graph: low → bands 0-2 (31/62/125 Hz), mid → bands 3-6 (250/500/1k/2k), high → bands 7-9
 * (4k/8k/16k). Tolerates undefined / partial / already-migrated input. A flat result is labeled 'off';
 * anything else becomes 'custom' (the old 'polish'/'bass'/'voice' presets no longer exist).
 */
export function mapLegacyEq(old: unknown): EqSettings {
  const o = old && typeof old === 'object' ? (old as Record<string, unknown>) : {}
  const low = clampEqBand(Number(o.low) || 0)
  const mid = clampEqBand(Number(o.mid) || 0)
  const high = clampEqBand(Number(o.high) || 0)
  const bands = [low, low, low, mid, mid, mid, mid, high, high, high]
  return { preset: bands.every((g) => g === 0) ? 'off' : 'custom', bands }
}

/**
 * Coerce ANY persisted/imported EQ value to a valid new-shape EqSettings. Accepts the new
 * { preset, bands } shape, the legacy { preset, low, mid, high } shape, and garbage. Idempotent.
 */
export function coerceEqSettings(raw: unknown): EqSettings {
  const e = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (Array.isArray(e.bands)) {
    return { preset: isAudioPreset(e.preset) ? e.preset : 'custom', bands: normalizeBands(e.bands) }
  }
  if ('low' in e || 'mid' in e || 'high' in e) return mapLegacyEq(e)
  return eqPresetGains('off')
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
