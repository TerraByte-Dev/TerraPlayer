# Visualizer

The visualizer is TerraPlayer's hero — a fullscreen, reactive phosphor field meant for a second monitor.
It draws entirely from the **active app theme**: change the theme and the whole visualizer (and the mini
spectrum in the player bar, and the popout on your other display) recolors instantly.

## Theme-driven color

There are no color presets. Every color comes from the theme's CSS variables, resolved into a cached
**palette** (`src/lib/viz-palette.ts`):

- `resolvePalette()` reads `--accent-rgb` / `--accent2-rgb` / `--ink-rgb` (space-separated triples) and
  `--accent-deep` (hex) off `<html>` and builds a `Palette`: the four colors, a `bright` tint of the accent,
  ready-made comma strings (`accentStr`…), and two gradient stop arrays — **bars** (`deep → accent → bright`)
  and **ring** (`deep → accent → accent2`).
- It's resolved **once on mount and again on every theme change** — never inside the draw loop. The draw
  loop reads `paletteRef.current` and `lerpStops()` (pure arithmetic, one string, zero allocation), so the
  recolor costs nothing per frame.
- Reactivity: `applyTheme()` (`theme.ts`) sets `<html data-theme>` then fires a `THEME_EVENT`; an effect
  listens and **mutates the palette ref in place** (no `setState`, so the running rAF loop is never torn
  down — it just reads the new palette next frame).

## The scene (layers)

1. **Grid** — a faint accent reference grid (toggle).
2. **Atmosphere** — a central accent→accent2 radial glow, a bass-reactive horizon line, transient scanlines.
3. **Particles** — rising phosphor specks, plus **orbiting comets** that streak the ring rim on transients
   (both reuse one pool; comets are tagged with an `orbit`).
4. **Spectrum bars** — segmented LEDs in the bar gradient, an **accent2 peak cap** (with optional bloom), and
   a faint reflection below the horizon. **Mirror Bars** lays them symmetrically (lows center, highs at the
   edges); off keeps the signature block-shuffled layout with dead-bar relocation.
5. **Radial ring** — the showpiece: a primary spectrum ring plus a fainter **counter-rotating** second ring,
   **bloom** on loud spokes, a **bass-breathe** pulse, a crisp accent base arc + a soft accent2 halo, and a
   single **shockwave** arc kicked outward by each transient. All theme-colored.
6. **Crosshair HUD** — theme-ink guide lines.

## Options (Settings, hover the top-left "VISUALS" panel)

Persisted in `tplay-visualizer` (shared across the in-app view, the popout, and restarts):

| Option | Type | Default | Effect |
|---|---|---|---|
| Bars | toggle | on | Segmented spectrum bars (+ reflection) |
| Mirror Bars | toggle | off | Symmetric layout (lows center) vs the block-shuffle |
| Ring | toggle | on | The radial frequency ring |
| Rotation | toggle | on | Spin the ring + its counter-rotating layer |
| Particles | toggle | on | Rising specks + orbiting ring comets |
| Bubbles | toggle | on | The rising-phosphor layer |
| Atmosphere | toggle | on | Glow, horizon line, scanlines |
| Grid | toggle | on | The reference grid |
| PWR (intensity) | 0–1 | 1.0 | Master reactivity/sensitivity |
| GLOW | 0–1 | 0.5 | Bloom on loud ring spokes + bar peaks (`0` = no shadow ops, fastest) |
| SPIN (ringSpeed) | 0–1 | 0.5 | Ring rotation + breathe rate |

"↺ Randomize Layout" reshuffles the bar/ring frequency mapping.

## Second monitor (popout)

`Pop out` opens the visualizer (`source="ipc"`) in a borderless window on a chosen display. It receives audio
frames + playback state over IPC, and now the **theme** too:

- It applies the persisted theme on boot (shared-origin `localStorage`).
- The main window relays theme changes over a one-directional **`viz:theme`** channel
  (`renderer → main → vizWindow`); the popout calls `applyTheme()` locally, which fires its own `THEME_EVENT`
  and repaints the palette. The popout never publishes back, so there's no loop.
- On open, a `did-finish-load` ping asks the main renderer to push the current theme — closing the
  initial-sync race. Option changes cross via the `storage` event (a rehydrate), no extra IPC.

## Perf

All native canvas ops; the only moderately expensive one is `shadowBlur`, gated behind `GLOW > 0` and limited
to loud ring spokes + active bar caps, reset immediately after each gated stroke. No `getComputedStyle` and no
new allocations per frame (the palette, gradient stops, and layout maps are all built outside the loop).

## Tests

`npm test` covers the pure palette helpers (`viz-palette.test.mjs`): CSS-var triple/hex parsing with
fallbacks (never an empty channel), `tintWhite`, `buildPalette`'s gradient stops, and `lerpStops`
interpolation at the endpoints + midpoints.
