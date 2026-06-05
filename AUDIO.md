# Audio & playback controls

TerraPlayer's audio runs entirely on the Web Audio graph, so every control here is
**native and effectively free on the JS side** — there is no per-frame work added
by the EQ, fades, or speed. The graph is built once in `src/lib/audio.ts`:

```
deck A (<audio>→source→gainA) ┐
                              ├→ preamp → EQ b0…b9 → mono → analyser → destination
deck B (<audio>→source→gainB) ┘
```

- **Two decks** — each an `<audio>` element with its own source + gain, summed at
  the preamp. Crossfading is just ramping one deck's gain up while the other's
  goes down, so two songs can overlap. The EQ/preamp/mono/visualizer are shared.
- `preamp` — overall level trim (dB), ahead of the EQ.
- `b0…b9` — the **10-band graphic EQ** (peaking biquads at ISO octave centers).
- `mono` — optional true L+R downmix.
- `analyser` — the single edge into `destination`; it also feeds the visualizer,
  so the spectrum reflects whatever you hear (including both tracks mid-crossfade).

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

## Crossfade (Settings → Playback)

A 0–6 s **crossfade between songs** (`fadeSec`, 0 = off) — a real overlap, not a
fade-to-silence. It is strictly a *song→song* transition: play/pause is always
instant and never fades.

- **Track change** (manual skip or natural end) → the incoming song starts on the
  idle deck and ramps **up** while the outgoing song keeps playing its tail and
  ramps **down** — the two overlap for `fadeSec` seconds. The outgoing deck is
  paused once its ramp completes.
- **Natural end** → near the tail (`duration − fadeSec`), `next()` is called early
  (armed once via `onTimeUpdate`) so the overlap happens *before* the song ends —
  no gap. Only when there's a next song; the last song just ends.
- **First play / play-after-stop / track change while paused** → instant, no
  fade-in (there's no outgoing song to blend from).
- `fadeSec = 0` → instant cut between songs.

`rampDeck` cancels any in-flight ramp, pins the live value, and uses a
definite-endpoint linear ramp, so rapid skips can't click or strand a gain. Very
short tracks (≤ `fadeSec`) don't crossfade (they'd skip immediately); repeat-one
restarts cleanly without a crossfade.

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
