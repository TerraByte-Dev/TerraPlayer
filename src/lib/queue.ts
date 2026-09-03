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
 * Both representations are edited, not just the active one — see `mirrorRemoveOne`.
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
  const nextMirror = snap.shuffle ? mirrorRemoveOne(mirror, target.id, active[snap.queueIndex]?.id) : mirror

  return snap.shuffle
    ? { queue: nextMirror, shuffledQueue: nextActive }
    : { queue: nextActive, shuffledQueue: nextMirror }
}

export type QueueSection = 'upNext' | 'comingUp'

export interface MoveResult<T> {
  queue: T[]
  shuffledQueue: T[]
  upNext: T[]
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Take ONE occurrence of `id` out of the inactive mirror, never the occurrence that is
 * the now-playing track (`toggleShuffle` finds the current track there by id — take that
 * one and the index lookup misses and silently falls back to 0).
 *
 * Callers decide whether a mirror exists at all — with shuffle off there is none, and
 * `shuffledQueue` must stay `[]` for `toggleShuffle` to rebuild it. Don't infer that from
 * an empty array here: with shuffle ON the mirror is `queue`, where `[]` is a real, empty
 * play order that still has to receive the edit.
 */
export function mirrorRemoveOne<T extends { id: number }>(mirror: T[], id: number, currentId?: number): T[] {
  const anchor = currentId === undefined ? -1 : mirror.findIndex((t) => t.id === currentId)
  const i = mirror.findIndex((t, idx) => t.id === id && idx !== anchor)
  return i < 0 ? mirror : [...mirror.slice(0, i), ...mirror.slice(i + 1)]
}

/**
 * Put `track` into the inactive mirror, directly after the now-playing track so it lands
 * in the FUTURE half — inserted anywhere before it, toggling shuffle would file a song
 * you just queued under already-played. Appends when the current track isn't in the
 * mirror, since there is then no position to be "after" — including an empty mirror,
 * which yields `[track]`. See `mirrorRemoveOne` on why emptiness is never read as
 * "there is no mirror" here.
 */
export function mirrorInsert<T extends { id: number }>(mirror: T[], track: T, currentId?: number): T[] {
  const anchor = currentId === undefined ? -1 : mirror.findIndex((t) => t.id === currentId)
  const at = anchor >= 0 ? anchor + 1 : mirror.length
  return [...mirror.slice(0, at), track, ...mirror.slice(at)]
}

/**
 * Drag a row within, or between, the two future sections — "Up Next" and "Coming Up".
 *
 * `queue` and `shuffledQueue` hold the same SET in two orders, so any move that changes
 * which songs are in the play order has to land in BOTH. A reorder inside one section
 * doesn't (membership is unchanged); the two cross-section moves do, because Coming Up
 * is part of the play order and Up Next is not.
 *
 * Returns null when nothing should change, and returns the ORIGINAL array references for
 * whichever lists a given move leaves alone — the popout's snapshot publisher keys off
 * reference identity, so a no-op reorder must not look like a queue change.
 */
export function moveFutureTrackIn<T extends { id: number }>(
  snap: QueueSnapshot<T>,
  from: { section: QueueSection; index: number },
  to: { section: QueueSection; index: number }
): MoveResult<T> | null {
  if (from.section === to.section && from.index === to.index) return null

  const activeIn = snap.shuffle ? snap.shuffledQueue : snap.queue
  const mirrorIn = snap.shuffle ? snap.queue : snap.shuffledQueue
  const currentId = activeIn[snap.queueIndex]?.id
  const futureStart = snap.queueIndex + 1

  const out = (active: T[], mirror: T[], upNext: T[]): MoveResult<T> =>
    snap.shuffle
      ? { queue: mirror, shuffledQueue: active, upNext }
      : { queue: active, shuffledQueue: mirror, upNext }

  if (from.section === 'upNext' && to.section === 'upNext') {
    // The one branch that used to take its index on faith. A drag begun against a list
    // that has since shrunk spliced `undefined` in, and the next render threw on it.
    if (!Number.isInteger(from.index) || from.index < 0 || from.index >= snap.upNext.length) return null
    const at = Math.max(0, Math.min(to.index, snap.upNext.length - 1))
    return out(activeIn, mirrorIn, moveItem(snap.upNext, from.index, at))
  }

  if (from.section === 'comingUp' && to.section === 'comingUp') {
    const fromAbs = futureStart + from.index
    const toAbs = futureStart + to.index
    if (fromAbs < futureStart || fromAbs >= activeIn.length) return null
    // Membership is unchanged, so the mirror — a different order of the same set — still holds.
    return out(moveItem(activeIn, fromAbs, Math.min(toAbs, activeIn.length - 1)), mirrorIn, snap.upNext)
  }

  if (from.section === 'comingUp' && to.section === 'upNext') {
    const fromAbs = futureStart + from.index
    if (fromAbs < futureStart || fromAbs >= activeIn.length) return null
    const active = [...activeIn]
    const [track] = active.splice(fromAbs, 1)
    const upNext = [...snap.upNext]
    upNext.splice(Math.max(0, Math.min(to.index, upNext.length)), 0, track)
    return out(active, snap.shuffle ? mirrorRemoveOne(mirrorIn, track.id, currentId) : mirrorIn, upNext)
  }

  const upNext = [...snap.upNext]
  const [track] = upNext.splice(from.index, 1)
  if (!track) return null
  const active = [...activeIn]
  const toAbs = Math.max(futureStart, Math.min(futureStart + to.index, active.length))
  active.splice(toAbs, 0, track)
  return out(active, snap.shuffle ? mirrorInsert(mirrorIn, track, currentId) : mirrorIn, upNext)
}

export interface PromoteResult<T> {
  queue: T[]
  shuffledQueue: T[]
  upNext: T[]
  queueIndex: number
}

/**
 * Promote the head of "Up Next" into the play order and make it the current track — what
 * `next()` does whenever anything is queued by hand.
 *
 * This ADDS a song to the play order, so like the cross-section drag it has to land in
 * both orderings. And the insert position has to be clamped: `splice` tolerates an index
 * past the end but `queueIndex` doesn't, so promoting into an empty play order (where
 * every launch starts — the queue is never persisted) used to file the song at 0 and
 * point the index at 1, leaving nothing playing and the song in no list at all.
 */
export function promoteUpNext<T extends { id: number }>(snap: QueueSnapshot<T>): PromoteResult<T> | null {
  const [track, ...remaining] = snap.upNext
  if (!track) return null

  const active = snap.shuffle ? snap.shuffledQueue : snap.queue
  const mirror = snap.shuffle ? snap.queue : snap.shuffledQueue
  const at = Math.min(snap.queueIndex + 1, active.length)
  const nextActive = [...active.slice(0, at), track, ...active.slice(at)]
  const nextMirror = snap.shuffle ? mirrorInsert(mirror, track, active[snap.queueIndex]?.id) : mirror

  return snap.shuffle
    ? { queue: nextMirror, shuffledQueue: nextActive, upNext: remaining, queueIndex: at }
    : { queue: nextActive, shuffledQueue: nextMirror, upNext: remaining, queueIndex: at }
}

/**
 * Fisher-Yates. `rand` is injectable purely so the shuffle is testable; production passes
 * nothing and gets Math.random.
 */
export function fisherYates<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build the shuffled order for `queue`, keeping the track at `anchorIdx` in front so the
 * song that is playing keeps playing across a shuffle toggle.
 *
 * The anchor is taken by POSITION, not by id. Taking it by id filtered out *every* copy of
 * that id and put one back, so a play order holding the same song twice — which `next()`
 * creates whenever you queue a song that is already in the list — came back one row short,
 * breaking the same-set invariant one button press after the rest of this module restored it.
 */
export function buildShuffled<T>(queue: T[], anchorIdx: number, rand: () => number = Math.random): T[] {
  const anchor = queue[anchorIdx]
  if (!anchor) return fisherYates(queue, rand)
  const rest = [...queue.slice(0, anchorIdx), ...queue.slice(anchorIdx + 1)]
  return [anchor, ...fisherYates(rest, rand)]
}
