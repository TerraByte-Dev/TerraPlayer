// Color themes for TerraPlayer. The entire UI chrome is CSS-variable driven (src/styles/index.css):
// every accent / ink / panel color resolves `var(--accent)`, `rgb(var(--accent-rgb) / α)`, etc. A theme is
// just a named bundle of those variables, declared in index.css under `html[data-theme="…"]`. Switching a
// theme only swaps the base tokens on <html>; all the derived `rgb(var(--…-rgb) / α)` colors recolor for
// free because they resolve lazily at use-time on the same element.
//
// Two orthogonal, app-wide display toggles ride alongside the palette:
//   • scanlines   — the CRT scanline + vignette overlay (class `crt-off` on <html> hides it).
//   • reduceMotion — disables blink/pulse/transition flourishes (class `reduce-motion` on <html>).
//
// All three (theme + the two toggles) persist to localStorage so they can be applied before first paint
// (no flash). This module is DOM-free at import time (the DOM is only touched inside the apply/set
// functions) so the pure helpers — getTheme, isKnownThemeId, resolveCrtOff — are unit-testable under node.

export interface ThemeSwatch {
  /** Deepest background (the void behind panels). */
  bg: string
  /** Primary accent (glow, active state, transport). */
  accent: string
  /** Body ink (track titles, secondary text). */
  ink: string
}

export interface Theme {
  id: string
  name: string
  blurb: string
  /** Mirrors the `html[data-theme="<id>"]` block in index.css — drives the picker preview card. */
  swatch: ThemeSwatch
}

// Ordered roughly around the color wheel. The default (mainframe) needs no [data-theme] block — it is the
// `:root` baseline in index.css. Every other id MUST have a matching block there.
export const THEMES: Theme[] = [
  { id: 'mainframe',   name: 'Mainframe',   blurb: 'The original phosphor green on black.',  swatch: { bg: '#000000', accent: '#00FF88', ink: '#9bf5b8' } },
  { id: 'matrix',      name: 'Matrix',      blurb: 'Hacker-terminal lime, pure black.',       swatch: { bg: '#000000', accent: '#39FF14', ink: '#9dff8f' } },
  { id: 'ice',         name: 'Ice',         blurb: 'Cool cyan-white over deep navy.',         swatch: { bg: '#02040c', accent: '#6FE6FF', ink: '#BFEFFF' } },
  { id: 'aqua',        name: 'Aqua',        blurb: 'Teal + seafoam, calm and clean.',         swatch: { bg: '#01100f', accent: '#1EE8C4', ink: '#9defdf' } },
  { id: 'ultraviolet', name: 'Ultraviolet', blurb: 'Electric violet on midnight indigo.',     swatch: { bg: '#050316', accent: '#A06BFF', ink: '#C9B0FF' } },
  { id: 'synthwave',   name: 'Synthwave',   blurb: 'Magenta neon + cyan over deep violet.',   swatch: { bg: '#07021a', accent: '#FF3AC8', ink: '#93E6FF' } },
  { id: 'vapor',       name: 'Vapor',       blurb: 'Vaporwave pink with cyan ink.',           swatch: { bg: '#0a0320', accent: '#FF8AD8', ink: '#93E6FF' } },
  { id: 'crimson',     name: 'Crimson',     blurb: 'Blood-red neon on charred maroon.',       swatch: { bg: '#0a0204', accent: '#FF2E4D', ink: '#FF94A2' } },
  { id: 'tangerine',   name: 'Tangerine',   blurb: 'Hot orange on scorched black.',           swatch: { bg: '#0a0500', accent: '#FF7A18', ink: '#FFC089' } },
  { id: 'amber',       name: 'Amber',       blurb: 'Warm amber CRT terminal glow.',           swatch: { bg: '#080500', accent: '#FFB000', ink: '#FFD79E' } },
  { id: 'gold',        name: 'Gold',        blurb: 'Champagne gold, understated luxe.',       swatch: { bg: '#080703', accent: '#E8C46A', ink: '#EADfb6' } },
  { id: 'slate',       name: 'Slate',       blurb: 'Neutral steel-blue — quiet and flat.',    swatch: { bg: '#0b0e12', accent: '#7FA8D9', ink: '#c3d0de' } },
]

export const DEFAULT_THEME_ID = 'mainframe'

const THEME_KEY = 'tplay-theme'
const CRT_OFF_KEY = 'tplay-crt-off'
const REDUCE_MOTION_KEY = 'tplay-reduce-motion'

export const THEME_EVENT = 'tplay-theme-change'
export const DISPLAY_EVENT = 'tplay-display-change'

/** Resolve an id to a theme, falling back to the default for unknown/missing ids. Pure. */
export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** True when `id` names a real theme — used to validate imported/persisted values. Pure. */
export function isKnownThemeId(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((t) => t.id === id)
}

/**
 * Should the CRT overlay be OFF? Today this simply mirrors the user's manual toggle, but it is extracted as
 * a pure function so the reconciliation has one home and can grow (e.g. a future "flat" theme family that
 * forces it off) without touching the DOM-bound callers. Pure + unit-testable.
 */
export function resolveCrtOff(_theme: Theme, manualCrtOff: boolean): boolean {
  return manualCrtOff
}

// ── localStorage reads (safe in node/SSR: swallow and return defaults) ───────────────────────────────────

export function getThemeId(): string {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return isKnownThemeId(v) ? v : DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function getCrtOff(): boolean {
  try { return localStorage.getItem(CRT_OFF_KEY) === '1' } catch { return false }
}

export function getReduceMotion(): boolean {
  try { return localStorage.getItem(REDUCE_MOTION_KEY) === '1' } catch { return false }
}

// ── DOM appliers (broadcast a CustomEvent so any open surface stays in sync) ─────────────────────────────

/** Apply + persist a theme: set `data-theme` on <html>, reconcile the CRT overlay, broadcast. Returns it. */
export function applyTheme(id: string): Theme {
  const theme = getTheme(id)
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.classList.toggle('crt-off', resolveCrtOff(theme, getCrtOff()))
  try { localStorage.setItem(THEME_KEY, theme.id) } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme.id })) } catch { /* ignore */ }
  return theme
}

/** Persist + apply the manual CRT (scanline) preference. */
export function setCrtOff(off: boolean): void {
  try { localStorage.setItem(CRT_OFF_KEY, off ? '1' : '0') } catch { /* ignore */ }
  document.documentElement.classList.toggle('crt-off', off)
  try { window.dispatchEvent(new CustomEvent(DISPLAY_EVENT, { detail: { crtOff: off } })) } catch { /* ignore */ }
}

/** Persist + apply the reduced-motion preference. */
export function setReduceMotion(on: boolean): void {
  try { localStorage.setItem(REDUCE_MOTION_KEY, on ? '1' : '0') } catch { /* ignore */ }
  document.documentElement.classList.toggle('reduce-motion', on)
  try { window.dispatchEvent(new CustomEvent(DISPLAY_EVENT, { detail: { reduceMotion: on } })) } catch { /* ignore */ }
}

/**
 * Apply all persisted display preferences to <html>. Call once before first paint (main.tsx) so the app
 * boots straight into the user's theme with no flash, and again after an import.
 */
export function bootDisplayPreferences(): void {
  applyTheme(getThemeId())
  document.documentElement.classList.toggle('crt-off', getCrtOff())
  document.documentElement.classList.toggle('reduce-motion', getReduceMotion())
}
