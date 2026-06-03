/**
 * Queue render windowing.
 *
 * The "Coming Up" list can be the entire library (e.g. "play all" over 1700+
 * tracks). Rendering every row — each a full SVG VectorGridCover + a cover image
 * — spikes renderer memory 2.5–8× when the queue opens, and every drag re-renders
 * the whole list. The player store still holds the *full* play order (so playback
 * is unaffected); the panel only renders a bounded window of it, like Spotify /
 * Apple Music. This helper computes that window and how many rows are hidden.
 */
export const COMING_UP_WINDOW = 50

export function windowComingUp<T>(
  remaining: T[],
  limit: number
): { shown: T[]; hidden: number } {
  const capped = Math.max(0, Math.floor(limit))
  const shown = remaining.slice(0, capped)
  return { shown, hidden: Math.max(0, remaining.length - shown.length) }
}
