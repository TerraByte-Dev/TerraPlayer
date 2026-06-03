// Pure parse + normalization for the portable settings document. No DOM / store / Web Audio imports, so it
// is unit-testable under node and so a hand-edited or corrupt file can never push malformed data into the
// app: every imported value is clamped/validated and merged over a complete set of defaults.

import { isKnownThemeId, DEFAULT_THEME_ID } from './theme.ts'
import { clampPreamp, clampEqBand, clamp, EQ_PRESETS, type AudioPreset, type EqSettings } from './audio-math.ts'

export const EXPORT_KIND = 'terraplayer-settings'
export const EXPORT_VERSION = 1

export type RepeatMode = 'off' | 'all' | 'one'

export interface SettingsPayload {
  theme: string
  display: { scanlines: boolean; reduceMotion: boolean }
  audio: { volume: number; preampDb: number; mono: boolean; eq: EqSettings }
  playback: { shuffle: boolean; repeat: RepeatMode }
}

export interface SettingsExport extends SettingsPayload {
  kind: typeof EXPORT_KIND
  version: number
  exportedAt: string
}

export const DEFAULT_SETTINGS: SettingsPayload = {
  theme: DEFAULT_THEME_ID,
  display: { scanlines: true, reduceMotion: false },
  audio: { volume: 0.8, preampDb: 0, mono: false, eq: { ...EQ_PRESETS.off } },
  playback: { shuffle: false, repeat: 'off' },
}

const REPEATS: ReadonlySet<string> = new Set<RepeatMode>(['off', 'all', 'one'])
const PRESETS: ReadonlySet<string> = new Set<AudioPreset>(['off', 'polish', 'bass', 'voice'])

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function coerceEq(raw: unknown): EqSettings {
  const e = obj(raw)
  const preset = PRESETS.has(e.preset as string) ? (e.preset as AudioPreset) : 'off'
  return {
    preset,
    low: clampEqBand(Number(e.low) || 0),
    mid: clampEqBand(Number(e.mid) || 0),
    high: clampEqBand(Number(e.high) || 0),
  }
}

/**
 * Build a COMPLETE, VALID SettingsPayload from arbitrary untrusted input. Unknown keys are ignored,
 * out-of-range numbers are clamped, an unknown theme id falls back to the default, and missing sections
 * inherit DEFAULT_SETTINGS. Never throws — always returns something the app can safely apply.
 */
export function normalizeSettings(raw: unknown): SettingsPayload {
  const r = obj(raw)
  const display = obj(r.display)
  const audio = obj(r.audio)
  const playback = obj(r.playback)
  return {
    theme: isKnownThemeId(r.theme) ? r.theme : DEFAULT_SETTINGS.theme,
    display: {
      scanlines: bool(display.scanlines, DEFAULT_SETTINGS.display.scanlines),
      reduceMotion: bool(display.reduceMotion, DEFAULT_SETTINGS.display.reduceMotion),
    },
    audio: {
      volume: Number.isFinite(Number(audio.volume)) ? clamp(Number(audio.volume), 0, 1) : DEFAULT_SETTINGS.audio.volume,
      preampDb: clampPreamp(Number(audio.preampDb) || 0),
      mono: bool(audio.mono, DEFAULT_SETTINGS.audio.mono),
      eq: coerceEq(audio.eq),
    },
    playback: {
      shuffle: bool(playback.shuffle, DEFAULT_SETTINGS.playback.shuffle),
      repeat: REPEATS.has(playback.repeat as string) ? (playback.repeat as RepeatMode) : 'off',
    },
  }
}

/** Parse + validate a settings file's text. Throws a friendly error on anything unrecognizable. */
export function parseSettingsExport(text: string): SettingsExport {
  let parsed: unknown
  try { parsed = JSON.parse(text) }
  catch { throw new Error("That file isn't valid JSON.") }
  const o = obj(parsed)
  if (o.kind !== EXPORT_KIND) throw new Error('Not a TerraPlayer settings file.')
  return {
    kind: EXPORT_KIND,
    version: typeof o.version === 'number' ? o.version : EXPORT_VERSION,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
    ...normalizeSettings(o),
  }
}
