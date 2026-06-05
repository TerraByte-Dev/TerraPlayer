// Theme-derived color palette for the visualizers. The whole point: resolve the active theme's colors ONCE
// per theme (never inside a draw loop) into a cached palette of pre-split numbers + ready-made strings, so
// the 60fps canvas loop only reads cheap precomputed values. The pure helpers (parse / build / lerp) are
// unit-tested; resolvePalette is the thin DOM glue that reads the live <html> CSS variables.

export type RGB = [number, number, number]

/** A gradient stop with pre-split channels — no per-frame string parsing in the hot loop. */
export interface NumStop { at: number; r: number; g: number; b: number }

export interface Palette {
  accent: RGB
  accent2: RGB
  ink: RGB
  accentDeep: RGB
  bright: RGB
  /** Comma-joined strings for cheap `rgba(${str},a)` interpolation in draw(). */
  accentStr: string
  accent2Str: string
  inkStr: string
  /** Vertical LED gradient: deep → accent → bright. */
  barStops: NumStop[]
  /** Ring spoke gradient: deep → accent → accent2. */
  ringStops: NumStop[]
}

// Mainframe (:root) defaults — used before the first resolve, and as the fallback when a CSS var is blank or
// a theme omits a token, so the canvas can never paint `rgba(,,,a)`.
const FALLBACK_ACCENT: RGB = [0, 255, 136]
const FALLBACK_ACCENT2: RGB = [0, 229, 255]
const FALLBACK_INK: RGB = [155, 245, 184]
const FALLBACK_ACCENT_DEEP: RGB = [31, 94, 58] // #1f5e3a

/** Parse a space-separated rgb triple ("0 255 136"); fall back when blank/malformed. */
export function parseTriple(v: string, fallback: RGB): RGB {
  const p = v.trim().split(/\s+/).map(Number)
  return p.length === 3 && p.every(Number.isFinite) ? [p[0], p[1], p[2]] : fallback
}

/** Parse a #rrggbb hex (e.g. the --accent-deep token); fall back when blank/malformed. */
export function hexToRgb(v: string, fallback: RGB): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim())
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mix a color toward white by k (0–1). */
export function tintWhite(c: RGB, k: number): RGB {
  return [
    Math.round(c[0] + (255 - c[0]) * k),
    Math.round(c[1] + (255 - c[1]) * k),
    Math.round(c[2] + (255 - c[2]) * k),
  ]
}

export function rgbStr(c: RGB): string {
  return `${c[0]},${c[1]},${c[2]}`
}

const stop = (at: number, c: RGB): NumStop => ({ at, r: c[0], g: c[1], b: c[2] })

/** Build a full Palette (gradient stops + cached strings) from the four theme colors. Pure. */
export function buildPalette(accent: RGB, accent2: RGB, ink: RGB, accentDeep: RGB): Palette {
  const bright = tintWhite(accent, 0.45)
  return {
    accent,
    accent2,
    ink,
    accentDeep,
    bright,
    accentStr: rgbStr(accent),
    accent2Str: rgbStr(accent2),
    inkStr: rgbStr(ink),
    barStops: [stop(0, accentDeep), stop(0.55, accent), stop(1, bright)],
    ringStops: [stop(0, accentDeep), stop(0.55, accent), stop(1, accent2)],
  }
}

/** The mainframe (default) palette — used before the first resolve and as a fallback. */
export const DEFAULT_PALETTE: Palette = buildPalette(
  FALLBACK_ACCENT, FALLBACK_ACCENT2, FALLBACK_INK, FALLBACK_ACCENT_DEEP,
)

/**
 * Interpolate a NumStop gradient at t (0–1) → a single rgba() string. Pure arithmetic + ONE string, with NO
 * array allocation — the draw loop calls this thousands of times/sec across bar segments + ring spokes, so
 * it must not churn garbage (the old version did `.split(',').map(Number)` per call).
 */
export function lerpStops(stops: NumStop[], t: number, alpha = 1): string {
  if (t <= stops[0].at) { const s = stops[0]; return `rgba(${s.r},${s.g},${s.b},${alpha})` }
  const last = stops[stops.length - 1]
  if (t >= last.at) return `rgba(${last.r},${last.g},${last.b},${alpha})`
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i]
    if (t <= b.at) {
      const a = stops[i - 1]
      const k = (t - a.at) / (b.at - a.at)
      return `rgba(${Math.round(a.r + (b.r - a.r) * k)},${Math.round(a.g + (b.g - a.g) * k)},${Math.round(a.b + (b.b - a.b) * k)},${alpha})`
    }
  }
  const s = stops[0]
  return `rgba(${s.r},${s.g},${s.b},${alpha})`
}

/**
 * Read the live theme variables off <html> and build a Palette. DOM glue — call ONLY on mount + on a theme
 * change, never per frame. Safe in non-DOM contexts (returns the default).
 */
export function resolvePalette(): Palette {
  if (typeof document === 'undefined') return DEFAULT_PALETTE
  const cs = getComputedStyle(document.documentElement)
  return buildPalette(
    parseTriple(cs.getPropertyValue('--accent-rgb'), FALLBACK_ACCENT),
    parseTriple(cs.getPropertyValue('--accent2-rgb'), FALLBACK_ACCENT2),
    parseTriple(cs.getPropertyValue('--ink-rgb'), FALLBACK_INK),
    hexToRgb(cs.getPropertyValue('--accent-deep'), FALLBACK_ACCENT_DEEP),
  )
}
