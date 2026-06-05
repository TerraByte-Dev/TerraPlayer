// Pure parse + normalization for the portable settings document. No DOM / store / Web Audio imports, so it
// is unit-testable under node and so a hand-edited or corrupt file can never push malformed data into the
// app: every imported value is clamped/validated and merged over a complete set of defaults.

import { isKnownThemeId, DEFAULT_THEME_ID } from './theme.ts'
import { coerceEqSettings, eqPresetGains, clampPreamp, clampSpeed, clampFadeSec, clamp, type EqSettings } from './audio-math.ts'

export const EXPORT_KIND = 'terraplayer-settings'
// v2: EQ shape moved from { low, mid, high } to { bands[10] } and playback gained fade + speed.
// coerceEqSettings/normalizeSettings accept BOTH shapes, so older v1 files still import cleanly.
export const EXPORT_VERSION = 2

export type RepeatMode = 'off' | 'all' | 'one'

export interface SettingsPayload {
  theme: string
  display: { scanlines: boolean; reduceMotion: boolean }
  audio: { volume: number; preampDb: number; mono: boolean; eq: EqSettings }
  playback: { shuffle: boolean; repeat: RepeatMode; fadeSec: number; speed: number }
}

export interface SettingsExport extends SettingsPayload {
  kind: typeof EXPORT_KIND
  version: number
  exportedAt: string
}

export const DEFAULT_SETTINGS: SettingsPayload = {
  theme: DEFAULT_THEME_ID,
  display: { scanlines: true, reduceMotion: false },
  audio: { volume: 0.8, preampDb: 0, mono: false, eq: eqPresetGains('off') },
  playback: { shuffle: false, repeat: 'off', fadeSec: 0, speed: 1 },
}

const REPEATS: ReadonlySet<string> = new Set<RepeatMode>(['off', 'all', 'one'])

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/**
 * Build a COMPLETE, VALID SettingsPayload from arbitrary untrusted input. Unknown keys are ignored,
 * out-of-range numbers are clamped, an unknown theme id falls back to the default, and missing sections
 * inherit DEFAULT_SETTINGS. The EQ accepts both the current { preset, bands } shape and the legacy
 * { preset, low, mid, high } shape (via coerceEqSettings). Never throws.
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
      eq: coerceEqSettings(audio.eq),
    },
    playback: {
      shuffle: bool(playback.shuffle, DEFAULT_SETTINGS.playback.shuffle),
      repeat: REPEATS.has(playback.repeat as string) ? (playback.repeat as RepeatMode) : 'off',
      fadeSec: clampFadeSec(Number(playback.fadeSec) || 0),
      speed: clampSpeed(Number(playback.speed) || 1),
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
