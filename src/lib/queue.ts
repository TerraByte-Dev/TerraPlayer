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

export interface RemoveResult<T> {
  queue: T[]
  shuffledQueue: T[]
}

/**
 * Drop ONE row out of "Coming Up" — the auto-generated tail of the play order.
 *
 * `index` is relative to the future window (0 = the row right after the current
 * track), the same convention `moveFutureTrack`'s 'comingUp' section uses. Only
 * the tail is addressable, so history, the now-playing track and `upNext` are
 * untouchable here and `queueIndex` never has to move.
 *
 * Both representations are edited, not just the active one: `queue` and
 * `shuffledQueue` hold the same SET in different orders, and `toggleShuffle`
 * re-derives the index by finding the current track in the other array. Leaving
 * a removed row in the mirror would resurrect it the moment shuffle flips. The
 * mirror occurrence that IS the current track is never the one taken (only
 * reachable when the same id sits in the queue twice — `next()` can splice an
 * upNext entry in alongside its own copy), or that lookup would miss.
 *
 * Returns null when the removal is refused — out of range, or `expectId` doesn't
 * match the row actually sitting there. The popout window clicks against a
 * snapshot that is up to one currentTime tick stale, and removing the wrong song
 * is far worse than ignoring a click.
 */
export function removeComingUpAt<T extends { id: number }>(
  snap: Pick<QueueSnapshot<T>, 'queue' | 'shuffledQueue' | 'queueIndex' | 'shuffle'>,
  index: number,
  expectId?: number
): RemoveResult<T> | null {
  if (!Number.isInteger(index) || index < 0) return null

  const active = snap.shuffle ? snap.shuffledQueue : snap.queue
  const abs = snap.queueIndex + 1 + index
  if (abs < 1 || abs >= active.length) return null

  const target = active[abs]
  if (expectId !== undefined && target.id !== expectId) return null

  const nextActive = [...active.slice(0, abs), ...active.slice(abs + 1)]

  const mirror = snap.shuffle ? snap.queue : snap.shuffledQueue
  let nextMirror = mirror
  if (mirror.length > 0) {
    const currentId = active[snap.queueIndex]?.id
    const anchor = currentId === undefined ? -1 : mirror.findIndex((t) => t.id === currentId)
    const mi = mirror.findIndex((t, i) => t.id === target.id && i !== anchor)
    if (mi >= 0) nextMirror = [...mirror.slice(0, mi), ...mirror.slice(mi + 1)]
  }

  return snap.shuffle
    ? { queue: nextMirror, shuffledQueue: nextActive }
    : { queue: nextActive, shuffledQueue: nextMirror }
}
