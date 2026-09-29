// Pure decisions for swipe mode (filling a tag song by song). No DOM / store / electron imports, so
// it is unit-tested in src/lib/__tests__/swipe-core.test.mjs and the card stays a thin shell.

export type SwipeVerdict = 'yes' | 'no'

/** How far the card must travel, as a fraction of its width, before a drag counts. */
export const SWIPE_THRESHOLD = 0.35

/**
 * Turn a finished drag into a verdict: right is yes, left is no, anything short of the threshold
 * is null (the card snaps back). Reaching the threshold exactly counts. A card with no width
 * can't be judged, so it never produces a verdict.
 */
export function swipeVerdict(dx: number, cardWidth: number): SwipeVerdict | null {
  if (!(cardWidth > 0)) return null
  const need = cardWidth * SWIPE_THRESHOLD
  if (dx >= need) return 'yes'
  if (dx <= -need) return 'no'
  return null
}

/**
 * How many `next()` calls land on the first song not yet decided for the tag, or null when every
 * song ahead is decided. `upcomingIds` must be in the order `next()` walks: the Up Next ids, then
 * the active queue after the current song. No wrap-around, so repeat-all never loops back to
 * songs already judged.
 */
export function stepsToNextUndecided(upcomingIds: readonly number[], decided: ReadonlySet<number>): number | null {
  const i = upcomingIds.findIndex((id) => !decided.has(id))
  return i < 0 ? null : i + 1
}
