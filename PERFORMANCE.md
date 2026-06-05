# Performance

This document records TerraPlayer's performance work: how the codebase was
audited, the behavior-preserving optimizations that shipped, and the higher-risk
items intentionally deferred (with rationale). It's a living doc — add to it when
you do perf work so the next pass starts from the map, not from scratch.

## How this round was audited

A multi-agent sweep read every hot subsystem — React render paths, the audio +
visualizer pipeline, Electron main/IPC + SQLite, the `hub://` stream protocol,
startup/bundle, memory/leaks, and the tools dock. Each candidate finding was then
**double-verified**: one pass confirmed it was real and on a genuine hot path
(per-frame / per-tick / per-render / per-request), a second pass judged whether
the proposed fix could change any observable behavior. Only findings that were
*confirmed real* **and** *confirmed safe* were shipped here. 37 raw findings →
21 confirmed real → the set below.

Guiding rule for this pass: **performance only, zero behavior change.** Anything
that couldn't be proven behavior-preserving was deferred rather than risked.

## Shipped (behavior-preserving)

### Render / subscription storms
The renderer's `<audio onTimeUpdate>` writes `currentTime` to the player store
~4×/sec during playback. Any component subscribed to the whole store re-rendered
on every tick.

- **`TrackList`** used a selector-less `usePlayerStore()`, so each tick
  re-rendered the entire virtualized list (and reconciled every visible row +
  cover SVG). Now uses narrow selectors and a primitive `currentId`, so playback
  ticks no longer touch the list. (`src/components/TrackList.tsx`)
- **`VectorGridCover`** (one cover SVG per row/queue item) and the spectrum
  **`Visualizer`** are now wrapped in `React.memo` — all-primitive props, so they
  skip reconciliation when a parent re-renders without changing their inputs.
  (`src/components/VectorGridCover.tsx`, `src/components/Visualizer.tsx`)
- **`Sidebar`** reduced over the whole library every render to compute total
  duration; now `useMemo`'d on `tracks`. (`src/components/Sidebar.tsx`)
- **`UtilityTimerHost`** (mounted for the whole session) re-rendered 4×/sec
  forever and ran a 250 ms interval even when idle. Now uses narrow selectors,
  subscribes to the ceil-seconds `remaining()` value (re-renders ~1×/sec while
  running, never when idle), and **gates the interval on `running`** — an idle
  app has zero timer wakeups. (`src/components/utilities/UtilityTimerHost.tsx`)
- **`CountdownTimer`** re-rendered its up-to-250-option alarm `<select>` every
  tick; the live readout is now isolated in a `<TimerReadout>` child so only it
  re-renders on the countdown. (`src/components/tools/TimerTools.tsx`)

### Per-frame allocations (60 fps loops)
- **`FullscreenVisualizer`** allocated a fresh `Uint8Array` every frame *and*
  built 3–4 throwaway arrays (`reduce` + `Array.from(slice(...))` ×2 +
  `Math.max(...spread)`) to compute avg/bass/treble/peak. Now reuses one analyser
  buffer and computes the four values in a single pass via `spectrumStats()` —
  verified **byte-for-byte** against the old formula in the unit tests.
  (`src/components/FullscreenVisualizer.tsx`, `src/lib/audio-math.ts`)
- The spectrum **`Visualizer`** rAF loop never stopped — it redrew 28 bars at
  60 fps forever, even paused/idle, because it's always mounted in `PlayerBar`.
  It now lets the bars decay out after pause, then **stops re-queuing** until
  playback resumes. (`src/components/Visualizer.tsx`)
- **`PlayerBar`** rebuilt a 21-element tick-mark array (+ 21 nodes) on every
  ~4 Hz render; the marks are static and now a module constant.
  (`src/components/PlayerBar.tsx`)

### Storage / IPC / I/O
- **Player persist writes** — zustand's `persist` re-serializes and writes
  `localStorage` on *every* `set()` without diffing, so the `currentTime` tick
  fired a synchronous `localStorage.setItem` of byte-identical JSON ~4×/sec for
  the entire duration of playback (`currentTime` isn't even persisted). A
  `createDedupeStorage` wrapper skips writes when the serialized value is
  unchanged — eliminating every redundant write with no change to what's
  persisted. (`src/store/player.ts`, `src/lib/perf.ts`)
- **Audio-frame IPC** to the popout visualizer ran at the display refresh rate
  (~60 fps), structured-cloning the buffer renderer→main→viz-window each frame.
  Now throttled to ~30 fps via `createFrameThrottle` — the analyser is smoothed
  and the visualizer has its own peak decay, so it's visually identical for half
  the cross-process traffic. (`src/lib/audio.ts`, `src/lib/perf.ts`)
- **Cover-art caching** — the `hub://` protocol served covers with no cache
  headers, so the virtualized list re-`statSync`/re-streamed every cover as rows
  unmounted/remounted during scroll. Covers are content-addressed (`saveCoverFile`
  names them by the sha1 of the image bytes), so image responses now carry
  `Cache-Control: public, max-age=31536000, immutable`. Audio responses are
  unchanged, so range/seek behavior is identical.
  (`electron/ipc/stream.ts`, `electron/ipc/stream-core.ts`)

### New pure, unit-tested helpers
Logic-bearing changes were extracted into pure helpers so they're tested, not
just trusted:
- `spectrumStats` (`src/lib/audio-math.ts`) — tested against the exact old formula.
- `createFrameThrottle`, `createDedupeStorage` (`src/lib/perf.ts`).
- `electron/ipc/stream-core.ts` — `contentTypeFor` / `parseRange` /
  `cacheControlFor`, which also adds coverage to the previously-untested HTTP
  range parsing.

## Deferred (real, but not behavior-preserving enough for a perf-polish PR)

These are confirmed-real and worth doing, but they touch the app's core data path
or its IPC contracts and need their own change + manual QA. Listed so they aren't
lost:

- **Library scan blocks the main thread.** `scanLibrary` runs synchronous
  `fs` + per-file metadata parsing on the main thread, freezing IPC during a
  scan. The real fix is a worker / `utilityProcess`; significant re-architecture
  of the core library path. (`electron/ipc/library.ts`)
- **N+1 scan queries.** The scan loop does per-track existing-row / uid / re-fetch
  SELECTs; these can be batched into a single up-front fetch. Safe in principle,
  but it rewrites the scan's correctness-critical loop. (`electron/ipc/library.ts`)
- **`PlayerBar` full-store subscription.** The transport bar re-renders 4×/sec.
  Splitting `currentTime` into an isolated `<ProgressRow>` is the proper fix, but
  `currentTime` is coupled to seek correctness (`audioRef` + the `duration`
  closure) **and** the popout position publish — a multi-touch change. The memo +
  tick-mark work above already removed most of the per-tick cost.
- **Popout snapshot rebuild (M5).** The popout publish rebuilds/maps up to ~49
  queue tracks on every `currentTime` tick (4 Hz, only while a popout is open).
  Decoupling needs a separate lightweight position channel — same `currentTime`
  coupling as above. Low absolute impact (opt-in, 4 Hz).
- **Protocol `statSync` per request / redundant scan-guard probes / a few missing
  SQLite indexes** — minor; some require schema/migration care.

## Verifying a perf change here

```bash
npm test                                    # node --test (incl. the helper tests above)
npx tsc --noEmit -p tsconfig.web.json       # renderer types
npx tsc --noEmit -p tsconfig.node.json      # electron types
npm run compile                             # electron-vite production build
```
Plus a manual smoke test of anything touching playback/seek/visuals (the deferred
list is exactly the stuff that *can't* be proven by the above alone).
