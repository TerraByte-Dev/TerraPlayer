# README assets

Drop the generated/captured images here so the root `README.md` renders. Expected files:

| File | What | How |
|---|---|---|
| `terraplayer-wordmark.png` | The hero CRT wordmark | GPT Images 2.0 — prompt below |
| `terrabyte-logo.png` | Small TerraByte emblem (footer ×2) | Reuse the existing globe — see note |
| `screenshots/*.png` | App screenshots | Capture live — see [`screenshots/README.md`](screenshots/README.md) |

---

## `terraplayer-wordmark.png` — GPT Images 2.0 prompt

> Target a wide banner, ~**2048 × 854** (≈24:10). The README renders it at 680px wide.

```
A wide horizontal logo wordmark that reads "TERRAPLAYER" in all caps, set in a
retro pixel/bitmap terminal typeface (think VT323 / an early-90s mainframe CRT
monospace). The letters are bright phosphor green (#00FF88) glowing against a
near-black background (#02050 3 — basically black). Heavy CRT bloom and glow
around each letter, faint horizontal scanlines across the entire image, a subtle
dark vignette in the corners, and a touch of chromatic aberration on the edges of
the glyphs. A solid blinking-cursor block "▮" sits just after the final R.
Centered with generous padding; crisp, high-contrast, and perfectly legible. No
tagline, no other text, no icons or logos. y2k hacker-terminal / green-screen
mainframe aesthetic. Banner aspect ratio ~24:10.
```

Tips:
- If it offers a transparent background, take it (renders cleanly on GitHub light **and** dark). Otherwise the near-black field is fine.
- Want a tagline variant? Add a second line in tiny dim-green terminal text: `> offline music player` under the wordmark.
- Keep it readable at 680px — avoid ultra-thin strokes.

## `terrabyte-logo.png` — TerraByte emblem

Easiest: reuse the existing TerraByte globe already in the repo — `src/assets/terrabyte-globe-*.png`
(or `build/icon.ico`) — exported as a square ~**256 × 256** PNG (transparent if possible) saved here as
`terrabyte-logo.png`.

Or generate one to match:

```
A small circular emblem: a phosphor-green (#00FF88) wireframe globe / latitude-
longitude grid glowing on a transparent (or near-black) background, faint scanlines,
y2k CRT terminal style. Simple, iconic, legible at 64px. No text.
```
