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

export interface QueueSnapshot<T> {
  queue: T[]
  shuffledQueue: T[]
  upNext: T[]
  queueIndex: number
  shuffle: boolean
}

export interface PurgeResult<T> {
  queue: T[]
  shuffledQueue: T[]
  upNext: T[]
  queueIndex: number
  /** True when the removed track was the one currently playing (active[queueIndex]). */
  clearedCurrent: boolean
}

/**
 * Remove every occurrence of `deletedId` from the play order (both the in-order
 * `queue` and the `shuffledQueue`) and from `upNext`, then fix `queueIndex`.
 *
 * The index addresses the ACTIVE queue (shuffled when `shuffle`, else `queue`).
 * It shifts left by however many entries strictly before it were removed; if the
 * current track itself was removed the index stays put so it now addresses the
 * track that slid into the slot (i.e. the next song), clamped to the new length,
 * or 0 when the queue empties. `clearedCurrent` tells the caller to swap the
 * now-playing track out (release its audio handle) before the file is trashed.
 */
export function purgeTrackFromQueue<T extends { id: number }>(
  snap: QueueSnapshot<T>,
  deletedId: number
): PurgeResult<T> {
  const active = snap.shuffle ? snap.shuffledQueue : snap.queue
  const clearedCurrent = active[snap.queueIndex]?.id === deletedId

  let removedBefore = 0
  for (let i = 0; i < snap.queueIndex && i < active.length; i++) {
    if (active[i].id === deletedId) removedBefore++
  }

  const queue = snap.queue.filter((t) => t.id !== deletedId)
  const shuffledQueue = snap.shuffledQueue.filter((t) => t.id !== deletedId)
  const upNext = snap.upNext.filter((t) => t.id !== deletedId)
  const newActive = snap.shuffle ? shuffledQueue : queue

  const queueIndex = newActive.length === 0
    ? 0
    : Math.max(0, Math.min(snap.queueIndex - removedBefore, newActive.length - 1))

  return { queue, shuffledQueue, upNext, queueIndex, clearedCurrent }
}
