// Small, pure performance utilities shared across the renderer. No DOM/Web Audio
// dependencies so they're unit-testable under node (run via npm test).
import type { StateStorage } from 'zustand/middleware'

/**
 * A gate for rate-limiting work inside a requestAnimationFrame loop. Call it
 * with the frame timestamp (the value rAF passes its callback, or
 * performance.now()); it returns true at most once per `minIntervalMs`. The rAF
 * keeps firing at the display refresh rate, but the gated work runs at the
 * target rate. Used to publish audio frames to the popout at ~30 fps instead of
 * ~60 — the analyser is smoothed (smoothingTimeConstant 0.8) and the visualizer
 * has its own peak decay, so the result is visually identical for half the
 * cross-process structured-clone traffic.
 */
export function createFrameThrottle(minIntervalMs: number): (now: number) => boolean {
  let last = -Infinity
  return (now: number): boolean => {
    if (now - last >= minIntervalMs) {
      last = now
      return true
    }
    return false
  }
}

/**
 * Wraps a string key/value store so identical consecutive writes to the same key
 * are skipped. zustand's `persist` middleware re-serializes and writes storage
 * on EVERY store mutation and does not diff the output, so transient
 * high-frequency setters (e.g. the player's `currentTime` tick, ~4×/sec during
 * playback) each trigger a synchronous `localStorage.setItem` of byte-identical
 * JSON — `currentTime` isn't even in the persisted partial. Deduping turns those
 * redundant writes into no-ops with ZERO change to what is ultimately persisted
 * (the first write of any new value still goes through). Returns a StateStorage
 * suitable for `createJSONStorage(() => createDedupeStorage(localStorage))`.
 */
export function createDedupeStorage(inner: StateStorage): StateStorage {
  const lastWritten = new Map<string, string>()
  return {
    getItem: (name) => inner.getItem(name),
    setItem: (name, value) => {
      if (lastWritten.get(name) === value) return
      lastWritten.set(name, value)
      return inner.setItem(name, value)
    },
    removeItem: (name) => {
      lastWritten.delete(name)
      return inner.removeItem(name)
    },
  }
}
