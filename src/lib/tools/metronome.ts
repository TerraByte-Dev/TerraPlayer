// Pure metronome math. No DOM, no React — safe to unit-test in isolation.
// Randomness (none needed here) would be injected as `rng: () => number`; kept the convention in mind,
// but a metronome is fully deterministic.

export const MIN_BPM = 30
export const MAX_BPM = 300

/** Clamp an arbitrary number to a valid, integer BPM. NaN-safe (falls back to MIN_BPM). */
export function clampBpm(n: number): number {
  if (!Number.isFinite(n)) return MIN_BPM
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(n)))
}

/** Milliseconds per beat for a given BPM. bpmToInterval(120) === 500. */
export function bpmToInterval(bpm: number): number {
  return 60000 / bpm
}

/**
 * Derive a tempo (BPM) from a list of tap timestamps (in ms, e.g. performance.now()).
 * Averages the gaps between consecutive taps and converts to a clamped BPM.
 * Returns a NaN-safe fallback (MIN_BPM) when fewer than 2 taps are supplied or the gaps are unusable.
 */
export function tapTempo(timestamps: number[]): number {
  if (!Array.isArray(timestamps) || timestamps.length < 2) return MIN_BPM

  let totalGap = 0
  let count = 0
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1]
    if (Number.isFinite(gap) && gap > 0) {
      totalGap += gap
      count++
    }
  }
  if (count === 0) return MIN_BPM

  const avgGap = totalGap / count
  const bpm = 60000 / avgGap
  return clampBpm(bpm)
}
