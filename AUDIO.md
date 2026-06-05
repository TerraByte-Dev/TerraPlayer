# Audio & playback controls

TerraPlayer's audio runs entirely on the Web Audio graph, so every control here is
**native and effectively free on the JS side** — there is no per-frame work added
by the EQ, fades, or speed. The graph is built once in `src/lib/audio.ts`:

```
<audio> → MediaElementSource → preamp → EQ b0…b9 → mono → fade → analyser → destination
```

- `preamp` — overall level trim (dB), ahead of the EQ.
- `b0…b9` — the **10-band graphic EQ** (peaking biquads at ISO octave centers).
- `mono` — optional true L+R downmix.
- `fade` — the gain node the fade-in/out automates.
- `analyser` — the single edge into `destination`; it also feeds the visualizer,
  so the spectrum fades together with the audible output.

Pure, unit-tested math (band tables, presets, migration, clamps, fade timing)
lives in `src/lib/audio-math.ts`.

## Equalizer (Settings → Audio)

A **10-band graphic EQ** at `31 / 62 / 125 / 250 / 500 / 1k / 2k / 4k / 8k / 16k Hz`,
each ±8 dB, Q ≈ √2 (≈ one octave, so octave-spaced bands sum to a near-flat
response). Band changes are smoothed (`setTargetAtTime`) so dragging is click-free.

**Presets** (`EQ_PRESETS`): Flat, Rock, Pop, Jazz, Classical, Electronic, Hip-Hop,
Vocal Boost, Acoustic, Bass Boost, Treble Boost, Loudness. Picking one sets all 10
bands; nudging any band switches the preset to **Custom** (it never mislabels a
manual curve as "Flat"). A quick preset switcher also lives in the player-bar
**EQUALIZER** popover; the full per-band faders are in Settings.

Pre-amp and mono downmix sit in the same pane (**Output**).

### Saved-EQ migration (v0 → v1)

Before 2.1.6 the EQ was a 3-band `{ preset, low, mid, high }`. The persisted player
store is versioned (`version: 1` + `migrate`); a returning user's saved EQ is
mapped to the 10-band shape — low → 31/62/125, mid → 250/500/1k/2k, high →
4k/8k/16k — by `mapLegacyEq`. `coerceEqSettings` accepts both shapes (and garbage),
so old exported settings files (`EXPORT_VERSION` bumped 1 → 2) still import cleanly.
The migration is idempotent.

## Fade in / out (Settings → Playback)

A 0–6 s fade (`fadeSec`, 0 = off) applied by ramping the fade gain:

- **Play / resume** → fade in. **Pause / stop** → fade out, then the `<audio>`
  element is paused only *after* the ramp (so audio stays audible through the fade).
- **Track change** → the new track starts from silence and fades in.
- **End of track** → fades out over the last `fadeSec` seconds (armed via
  `onTimeUpdate`), then advances.

`rampFade` cancels any in-flight ramp, pins the live value, and uses a
definite-endpoint linear ramp, so rapid play/pause can't click or strand the gain
at 0. Re-arm logic covers seeking back out of the end-fade window and repeat-one.
With `fadeSec = 0` the behavior is identical to before (instant, immediate pause).

> Note: this is fade-to-silence-then-in (single audio element), not an overlapping
> crossfade. True gapless crossfade would need a second audio element + source node
> — a deliberate non-goal here to keep the core playback path simple and stable.

## Playback speed (Settings → Playback)

`0.5×–2×` via the media element's `playbackRate`, with `preservesPitch = true`
(tempo changes, pitch doesn't). Re-asserted after each track loads (a fresh
`load()` resets the rate). Graph-free.

## Keyboard shortcuts

Global transport, bound in `PlayerBar`. Suppressed while a text field
(input/textarea/select/contentEditable) is focused, and ignored with Ctrl/Cmd/Alt
held, so they never fight the library search box.

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `← / →` | Seek −/+ 5 s |
| `Shift + ← / →` | Previous / next track |
| `↑ / ↓` | Volume up / down |
| `M` | Mute / unmute |

## Tests

`npm test` covers the pure helpers: EQ presets (10 bands, all within ±8, fresh
copies), `mapLegacyEq` / `coerceEqSettings` (old↔new shapes, idempotent, garbage),
`clampSpeed` / `clampFadeSec`, `fadeStartTime`, and the settings-schema
normalization incl. the legacy-EQ migration path.
