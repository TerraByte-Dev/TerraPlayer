# Settings & theming

TerraPlayer's Settings panel (the gear in the sidebar) is a full control surface:
**Appearance · Audio · Playback · Library · Add Music · Updates · About**. Every
preference applies live and is remembered across restarts.

```
┌──────────────── Settings ────────────────────────────────┐
│ APPEARANCE │  theme picker · scanlines · reduce motion    │
│ AUDIO      │  3-band EQ + presets · pre-amp · mono        │
│ PLAYBACK   │  volume · shuffle · repeat (all remembered)  │
│ LIBRARY    │  stats · add / remove / rescan folders       │
│ ADD MUSIC  │  open the downloader                         │
│ UPDATES    │  check / download / install · uninstall      │
│ ABOUT      │  version · runtime · links · backup          │
└───────────────────────────────────────────────────────────┘
```

## Theme system

The entire UI **chrome** is CSS-variable driven (`src/styles/index.css`). A theme is a
named bundle of variable overrides under `html[data-theme="…"]`; switching a theme just
swaps the base tokens on `<html>` and everything recolors for free, because the derived
colors (`rgb(var(--accent-rgb) / α)`) resolve lazily at use-time on the same element.

### Tokens

| Variable | Role |
|---|---|
| `--accent` / `--accent-rgb` | primary phosphor — glow, active state, transport, progress |
| `--accent2` / `--accent2-rgb` | secondary highlight — clock, headers, peaks |
| `--ink` / `--ink-rgb` | body text |
| `--accent-deep` | dim accent — duration readout, spectrum labels |
| `--bg-0` / `--bg-1` / `--bg-lcd` | void / raised panels / LCD surface |

Backgrounds stay a constant deep dark across every theme (neon-on-black); only the
accent / secondary / ink / dim-accent recolor. That keeps all 12 themes cohesive and the
conversion safe — no per-theme background tuning, no contrast regressions.

### Adding a theme

1. Add an entry to `THEMES` in `src/lib/theme.ts` (id, name, blurb, swatch).
2. Add a matching `html[data-theme="<id>"] { … }` block in `src/styles/index.css` with the
   six accent/ink tokens (and their `-rgb` forms).

The `theme.test.mjs` suite asserts the `THEMES` list stays well-formed (unique ids, valid
hex swatches, default present).

### What is *not* themed (by design)

Canvas surfaces can't read CSS variables, and some of their palettes are intentional
semantics, so they keep fixed colors:

- **Spectrum visualizer** (`Visualizer.tsx`) — a classic green→amber→red VU ramp.
- **Fullscreen visualizer** (`FullscreenVisualizer.tsx`) — its own gradient art palette.
- **Whiteboard utility** (`utilities/UtilityOverlay.tsx`) — a drawing-tool color palette.

## Display toggles

Two app-wide toggles ride alongside the palette, both classes on `<html>`:

- **Scanlines & glow** (`crt-off`) — the CRT scanline + vignette + PlayerBar overlay.
- **Reduce motion** (`reduce-motion`) — disables blinks, pulses, and transitions.

## Persistence

Everything is renderer-side and instant — no IPC round-trip.

| What | Where | Applied |
|---|---|---|
| theme, scanlines, reduce-motion | `localStorage` (`tplay-theme`, `tplay-crt-off`, `tplay-reduce-motion`) | `bootDisplayPreferences()` in `main.tsx`, **before first paint** (no flash) |
| volume, EQ, shuffle, repeat | `localStorage` `tplay-player` (zustand `persist`, partialized — transient queue/playback state is **not** saved) | player store |
| pre-amp, mono | `localStorage` `tplay-settings` (zustand `persist`) | a PlayerBar effect feeds the audio graph |

## Audio graph

`src/lib/audio.ts` builds one Web Audio chain:

```
source → preamp(gain) → low → mid → high → mono(downmix) → analyser → destination
```

- **Pre-amp** — a `GainNode` ahead of the EQ; level set in dB via `dbToGain` (`audio-math.ts`).
- **EQ** — low-shelf @120 Hz, peaking @1.2 kHz, high-shelf @7.2 kHz, ±8 dB each.
- **Mono** — a `GainNode` with `channelCount=1, channelCountMode='explicit'` sums L+R to a
  true mono signal (the destination upmixes it back to both speakers).

The pure math (`dbToGain`, clamps, EQ presets) lives in `src/lib/audio-math.ts` and is
unit-tested.

## Backup (export / import)

About → Backup exports every preference as a portable JSON file
(`terraplayer-settings-YYYY-MM-DD.json`) and imports one back. Import is **validated and
clamped** through `normalizeSettings` (`src/lib/settings-schema.ts`) before it touches the
app, so a hand-edited or corrupt file can never push bad data in — unknown theme ids fall
back, out-of-range numbers clamp, missing sections inherit defaults.

## Tests

```bash
npm test          # node --test — theme integrity, audio math, settings schema (+ downloader)
npm run typecheck # tsc for renderer + electron
```

Pure, DOM-free logic (`theme.ts` helpers, `audio-math.ts`, `settings-schema.ts`) is covered
by `src/lib/__tests__/*.test.mjs`.
