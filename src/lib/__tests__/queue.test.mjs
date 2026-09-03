import test from 'node:test'
import assert from 'node:assert/strict'
import {
  windowComingUp, COMING_UP_WINDOW, purgeTrackFromQueue, removeComingUpAt,
  mirrorRemoveOne, mirrorInsert, moveFutureTrackIn, promoteUpNext, buildShuffled, fisherYates,
} from '../queue.ts'

const T = (id) => ({ id })
// queue [a,b,c,d] with c (index 2) playing, shuffle off, empty upNext.
const base = () => ({
  queue: [T(1), T(2), T(3), T(4)],
  shuffledQueue: [],
  upNext: [],
  queueIndex: 2,
  shuffle: false,
})

test('returns everything when under the limit', () => {
  const r = windowComingUp([1, 2, 3], 50)
  assert.deepEqual(r.shown, [1, 2, 3])
  assert.equal(r.hidden, 0)
})

test('caps a huge queue and reports the hidden count', () => {
  const arr = Array.from({ length: 1700 }, (_, i) => i)
  const r = windowComingUp(arr, 50)
  assert.equal(r.shown.length, 50)
  assert.equal(r.hidden, 1650)
  assert.equal(r.shown[0], 0)
  assert.equal(r.shown[49], 49) // window is the FRONT of the queue (next up)
})

test('exact boundary hides nothing', () => {
  const arr = Array.from({ length: 50 }, (_, i) => i)
  const r = windowComingUp(arr, 50)
  assert.equal(r.shown.length, 50)
  assert.equal(r.hidden, 0)
})

test('empty / zero / negative / fractional limits are safe', () => {
  assert.deepEqual(windowComingUp([], 50), { shown: [], hidden: 0 })
  assert.deepEqual(windowComingUp([1, 2, 3], 0), { shown: [], hidden: 3 })
  assert.deepEqual(windowComingUp([1, 2, 3], -5), { shown: [], hidden: 3 })
  assert.deepEqual(windowComingUp([1, 2, 3], 1.9), { shown: [1], hidden: 2 })
})

test('expanding the limit grows the window (does not blow past the data)', () => {
  const arr = Array.from({ length: 120 }, (_, i) => i)
  assert.equal(windowComingUp(arr, 50).shown.length, 50)
  assert.equal(windowComingUp(arr, 100).shown.length, 100)
  assert.equal(windowComingUp(arr, 1000).shown.length, 120) // can't exceed available
  assert.equal(windowComingUp(arr, 1000).hidden, 0)
})

test('COMING_UP_WINDOW is a sane bounded default', () => {
  assert.ok(COMING_UP_WINDOW >= 10 && COMING_UP_WINDOW <= 200)
})

test('purge: deleting before the current track shifts the index left', () => {
  const r = purgeTrackFromQueue(base(), 1) // remove a (index 0); current is c
  assert.deepEqual(r.queue.map((t) => t.id), [2, 3, 4])
  assert.equal(r.queueIndex, 1) // still points at c
  assert.equal(r.clearedCurrent, false)
})

test('purge: deleting the current track points at the next (slid-in) track', () => {
  const r = purgeTrackFromQueue(base(), 3) // remove c (current, index 2)
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 4])
  assert.equal(r.queueIndex, 2) // d slid into the slot
  assert.equal(r.clearedCurrent, true)
})

test('purge: deleting the current LAST track clamps to the new end', () => {
  const r = purgeTrackFromQueue({ ...base(), queue: [T(1), T(2), T(3)], queueIndex: 2 }, 3)
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2])
  assert.equal(r.queueIndex, 1)
  assert.equal(r.clearedCurrent, true)
})

test('purge: deleting the only track empties the queue to index 0', () => {
  const r = purgeTrackFromQueue({ ...base(), queue: [T(9)], queueIndex: 0 }, 9)
  assert.deepEqual(r.queue, [])
  assert.equal(r.queueIndex, 0)
  assert.equal(r.clearedCurrent, true)
})

test('purge: deleting after the current track leaves the index unchanged', () => {
  const r = purgeTrackFromQueue(base(), 4) // remove d (index 3); current c at 2
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 3])
  assert.equal(r.queueIndex, 2)
  assert.equal(r.clearedCurrent, false)
})

test('purge: deleting from upNext only leaves the play order + index untouched', () => {
  const r = purgeTrackFromQueue({ ...base(), upNext: [T(5), T(6)] }, 5)
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 3, 4])
  assert.deepEqual(r.upNext.map((t) => t.id), [6])
  assert.equal(r.queueIndex, 2)
  assert.equal(r.clearedCurrent, false)
})

test('purge: an absent id is a no-op', () => {
  const r = purgeTrackFromQueue(base(), 999)
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 3, 4])
  assert.equal(r.queueIndex, 2)
  assert.equal(r.clearedCurrent, false)
})

test('purge: shuffle mode indexes the shuffled queue', () => {
  // active = shuffledQueue [d,a,c,b]; current is index 1 (a). Remove a (current).
  const r = purgeTrackFromQueue(
    { queue: [T(1), T(2), T(3), T(4)], shuffledQueue: [T(4), T(1), T(3), T(2)], upNext: [], queueIndex: 1, shuffle: true },
    1
  )
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [4, 3, 2])
  assert.deepEqual(r.queue.map((t) => t.id), [2, 3, 4]) // removed from both lists
  assert.equal(r.queueIndex, 1) // points at the track that slid in (id 3)
  assert.equal(r.clearedCurrent, true)
})

// --- removeComingUpAt --------------------------------------------------------
// queue [1,2,3,4,5] with 2 (index 1) playing → Coming Up is [3,4,5].
const cu = (over = {}) => ({
  queue: [T(1), T(2), T(3), T(4), T(5)],
  shuffledQueue: [],
  queueIndex: 1,
  shuffle: false,
  ...over,
})

test('removes the addressed Coming Up row and leaves the index alone', () => {
  const r = removeComingUpAt(cu(), 1) // [3,>4<,5]
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 3, 5])
  assert.deepEqual(r.shuffledQueue, [])
})

test('index 0 is the row right after the current track', () => {
  const r = removeComingUpAt(cu(), 0)
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 4, 5])
})

test('never reaches the current track or history', () => {
  assert.equal(removeComingUpAt(cu(), -1), null)
  assert.equal(removeComingUpAt(cu(), 1.5), null)
  assert.equal(removeComingUpAt(cu(), NaN), null)
  assert.equal(removeComingUpAt(cu(), 3), null) // one past the end
  assert.equal(removeComingUpAt(cu(), 999), null)
})

test('the id guard refuses a stale row rather than removing the wrong song', () => {
  assert.equal(removeComingUpAt(cu(), 1, 99), null)
  const ok = removeComingUpAt(cu(), 1, 4)
  assert.deepEqual(ok.queue.map((t) => t.id), [1, 2, 3, 5])
})

test('shuffled: removes from the shuffled order AND the in-order mirror', () => {
  // shuffled [5,1,3,2,4], playing 1 (index 1) → Coming Up is [3,2,4].
  const r = removeComingUpAt(
    cu({ shuffle: true, shuffledQueue: [T(5), T(1), T(3), T(2), T(4)], queueIndex: 1 }),
    0 // id 3
  )
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [5, 1, 2, 4])
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 4, 5]) // mirror lost id 3 too
})

test('a removed row does not come back when shuffle is toggled off', () => {
  const r = removeComingUpAt(
    cu({ shuffle: true, shuffledQueue: [T(5), T(1), T(3), T(2), T(4)], queueIndex: 1 }),
    0
  )
  assert.ok(!r.queue.some((t) => t.id === 3))
})

test('a duplicate id removes exactly one row, never the now-playing copy', () => {
  // Shuffled, so the mirror is the in-order `queue`. id 2 appears twice in both orders —
  // the dupe next() splices in from upNext. Playing the FIRST copy (shuffled index 0).
  const snap = {
    queue: [T(1), T(2), T(3), T(2), T(4)],
    shuffledQueue: [T(2), T(4), T(2), T(1), T(3)],
    queueIndex: 0,
    shuffle: true,
  }
  const r = removeComingUpAt(snap, 1, 2) // Coming Up is [4,2,1,3] -> the second copy of id 2
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [2, 4, 1, 3])
  assert.equal(r.queue.filter((t) => t.id === 2).length, 1)
  // toggleShuffle finds the playing track in the mirror by id — that copy must survive
  assert.ok(r.queue.some((t) => t.id === 2))
})

test('emptying Coming Up entirely leaves the current track playing', () => {
  let snap = cu()
  for (let i = 0; i < 3; i++) {
    const r = removeComingUpAt(snap, 0)
    snap = { ...snap, queue: r.queue, shuffledQueue: r.shuffledQueue }
  }
  assert.deepEqual(snap.queue.map((t) => t.id), [1, 2])
  assert.equal(snap.queue[snap.queueIndex].id, 2)
  assert.equal(removeComingUpAt(snap, 0), null)
})

// --- mirror helpers ----------------------------------------------------------

test('mirrorRemoveOne takes exactly one occurrence', () => {
  assert.deepEqual(mirrorRemoveOne([T(1), T(2), T(3)], 2).map((t) => t.id), [1, 3])
  assert.deepEqual(mirrorRemoveOne([T(1), T(2), T(2)], 2).map((t) => t.id), [1, 2])
})

test('mirrorRemoveOne never takes the now-playing occurrence', () => {
  // id 2 twice; the FIRST is the current track, so the second is the one that goes
  const r = mirrorRemoveOne([T(2), T(1), T(2)], 2, 2)
  assert.deepEqual(r.map((t) => t.id), [2, 1])
  // only occurrence IS the anchor -> nothing removable, array untouched
  const only = [T(2), T(1)]
  assert.equal(mirrorRemoveOne(only, 2, 2), only)
})

test('mirrorRemoveOne is a no-op with no mirror or no match', () => {
  const empty = []
  assert.equal(mirrorRemoveOne(empty, 9), empty)
  const m = [T(1)]
  assert.equal(mirrorRemoveOne(m, 9), m)
})

test('mirrorInsert lands the track in the future half, just after the current one', () => {
  assert.deepEqual(mirrorInsert([T(5), T(1), T(3)], T(9), 1).map((t) => t.id), [5, 1, 9, 3])
  // no anchor to be "after" -> appended, never dropped into the past
  assert.deepEqual(mirrorInsert([T(5), T(1)], T(9), 42).map((t) => t.id), [5, 1, 9])
})

test('mirrorInsert fills an EMPTY mirror rather than treating it as no mirror', () => {
  // With shuffle on the mirror is `queue`, and [] there is a real empty play order — every
  // launch starts that way. Skipping it dropped the song out of the in-order list entirely.
  assert.deepEqual(mirrorInsert([], T(9), undefined).map((t) => t.id), [9])
  assert.deepEqual(mirrorInsert([], T(9), 1).map((t) => t.id), [9])
})

test('an empty play order still gets the song into BOTH orders', () => {
  const r = moveFutureTrackIn(
    { queue: [], shuffledQueue: [], upNext: [T(42)], queueIndex: 0, shuffle: true },
    { section: 'upNext', index: 0 },
    { section: 'comingUp', index: 0 }
  )
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [42])
  assert.deepEqual(r.queue.map((t) => t.id), [42]) // used to come back [] and vanish on toggle
  assert.deepEqual(r.upNext, [])
})

test('with shuffle OFF the mirror stays empty so toggleShuffle can rebuild it', () => {
  const r = moveFutureTrackIn(
    { queue: [T(1), T(2)], shuffledQueue: [], upNext: [T(42)], queueIndex: 0, shuffle: false },
    { section: 'upNext', index: 0 },
    { section: 'comingUp', index: 0 }
  )
  assert.deepEqual(r.queue.map((t) => t.id), [1, 42, 2])
  assert.deepEqual(r.shuffledQueue, [])
})

test('a stale Up Next drag index is refused instead of splicing a hole', () => {
  const snap = { queue: [T(1), T(2), T(3)], shuffledQueue: [], upNext: [T(8)], queueIndex: 1, shuffle: false }
  // index 1 was valid when the drag began; the list has since shrunk to one row
  assert.equal(moveFutureTrackIn(snap, { section: 'upNext', index: 1 }, { section: 'upNext', index: 0 }), null)
  assert.equal(moveFutureTrackIn(snap, { section: 'upNext', index: -1 }, { section: 'upNext', index: 0 }), null)
  // a valid drag onto an out-of-range target clamps instead of failing
  const two = { ...snap, upNext: [T(8), T(9)] }
  const r = moveFutureTrackIn(two, { section: 'upNext', index: 0 }, { section: 'upNext', index: 99 })
  assert.deepEqual(r.upNext.map((t) => t.id), [9, 8])
  assert.ok(r.upNext.every(Boolean))
})

// --- moveFutureTrackIn -------------------------------------------------------
// queue [1,2,3,4,5], 2 (index 1) playing, upNext [7,8].
const mv = (over = {}) => ({
  queue: [T(1), T(2), T(3), T(4), T(5)],
  shuffledQueue: [],
  upNext: [T(7), T(8)],
  queueIndex: 1,
  shuffle: false,
  ...over,
})
// shuffled [2,5,3,1,4] with 2 (index 0) playing; Coming Up is [5,3,1,4].
const shuffled = (over = {}) =>
  mv({ shuffle: true, shuffledQueue: [T(2), T(5), T(3), T(1), T(4)], queueIndex: 0, ...over })

test('a no-op move returns null', () => {
  assert.equal(moveFutureTrackIn(mv(), { section: 'upNext', index: 1 }, { section: 'upNext', index: 1 }), null)
})

test('reordering within Up Next leaves both play orders untouched by reference', () => {
  const snap = mv()
  const r = moveFutureTrackIn(snap, { section: 'upNext', index: 0 }, { section: 'upNext', index: 1 })
  assert.deepEqual(r.upNext.map((t) => t.id), [8, 7])
  assert.equal(r.queue, snap.queue) // identity preserved — the popout must not see a queue change
  assert.equal(r.shuffledQueue, snap.shuffledQueue)
})

test('reordering within Coming Up does not disturb the mirror', () => {
  const snap = shuffled()
  const r = moveFutureTrackIn(snap, { section: 'comingUp', index: 0 }, { section: 'comingUp', index: 2 })
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [2, 3, 1, 5, 4])
  assert.equal(r.queue, snap.queue) // membership unchanged, so the other order still holds
})

test('shuffled: dragging Coming Up -> Up Next takes the song out of BOTH orders', () => {
  const r = moveFutureTrackIn(shuffled(), { section: 'comingUp', index: 0 }, { section: 'upNext', index: 0 })
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [2, 3, 1, 4])
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 3, 4]) // 5 left the in-order mirror too
  assert.deepEqual(r.upNext.map((t) => t.id), [5, 7, 8])
})

test('shuffled: Coming Up -> Up Next no longer duplicates the song on a shuffle toggle', () => {
  const r = moveFutureTrackIn(shuffled(), { section: 'comingUp', index: 0 }, { section: 'upNext', index: 0 })
  // the regression: id 5 sat in upNext AND in the stale in-order queue at once
  assert.ok(!r.queue.some((t) => t.id === 5))
  assert.ok(r.upNext.some((t) => t.id === 5))
})

test('shuffled: dragging Up Next -> Coming Up adds the song to BOTH orders', () => {
  const r = moveFutureTrackIn(shuffled(), { section: 'upNext', index: 0 }, { section: 'comingUp', index: 0 })
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [2, 7, 5, 3, 1, 4])
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 7, 3, 4, 5]) // inserted after the playing track
  assert.deepEqual(r.upNext.map((t) => t.id), [8])
})

test('shuffled: Up Next -> Coming Up no longer loses the song on a shuffle toggle', () => {
  const r = moveFutureTrackIn(shuffled(), { section: 'upNext', index: 0 }, { section: 'comingUp', index: 0 })
  assert.ok(r.queue.some((t) => t.id === 7)) // the regression: it vanished entirely
  assert.ok(!r.upNext.some((t) => t.id === 7))
})

test('the mirror insert always lands after the current track, never behind it', () => {
  const r = moveFutureTrackIn(shuffled(), { section: 'upNext', index: 0 }, { section: 'comingUp', index: 3 })
  const cur = r.queue.findIndex((t) => t.id === 2)
  const added = r.queue.findIndex((t) => t.id === 7)
  assert.ok(added > cur, 'a just-queued song must not toggle into the already-played half')
})

test('out-of-range Coming Up indices are refused', () => {
  assert.equal(moveFutureTrackIn(mv(), { section: 'comingUp', index: 99 }, { section: 'upNext', index: 0 }), null)
  assert.equal(moveFutureTrackIn(mv(), { section: 'upNext', index: 99 }, { section: 'comingUp', index: 0 }), null)
})

test('unshuffled moves leave the empty mirror empty', () => {
  const r = moveFutureTrackIn(mv(), { section: 'comingUp', index: 0 }, { section: 'upNext', index: 0 })
  assert.deepEqual(r.shuffledQueue, [])
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 4, 5])
})

// Property: whatever run of future-queue edits you make while shuffled, the two orderings
// must keep the SAME multiset — that equality is the whole reason the bug bit.
test('both orderings hold the same songs after any run of moves (fuzz)', () => {
  const ids = (a) => a.map((t) => t.id).sort((x, y) => x - y)
  let checked = 0
  for (let seed = 1; seed <= 4000; seed++) {
    let rnd = seed
    const rand = (n) => {
      rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
      return rnd % n
    }
    // Every fourth seed starts from an EMPTY play order — the state every launch begins in,
    // and the one the first version of this fix got wrong.
    const bare = seed % 4 === 0
    let snap = bare
      ? { queue: [], shuffledQueue: [], upNext: [T(7), T(8)], queueIndex: 0, shuffle: true }
      : {
          queue: [T(1), T(2), T(3), T(4), T(5), T(6)],
          shuffledQueue: [T(4), T(1), T(6), T(2), T(5), T(3)],
          upNext: [T(7), T(8)],
          queueIndex: 0,
          shuffle: true,
        }
    for (let step = 0; step < 12; step++) {
      const sections = ['upNext', 'comingUp']
      const from = { section: sections[rand(2)], index: rand(5) }
      const to = { section: sections[rand(2)], index: rand(5) }
      const r = moveFutureTrackIn(snap, from, to)
      if (!r) continue
      snap = { ...snap, queue: r.queue, shuffledQueue: r.shuffledQueue, upNext: r.upNext }

      assert.deepEqual(ids(snap.queue), ids(snap.shuffledQueue),
        `seed ${seed} step ${step}: the two orderings drifted apart`)
      // toggleShuffle finds the current track in the mirror by id — it must be there
      assert.ok(snap.upNext.every(Boolean), `seed ${seed} step ${step}: a hole was spliced into upNext`)
      const current = snap.shuffledQueue[snap.queueIndex]
      if (current) {
        assert.ok(snap.queue.some((t) => t.id === current.id),
          `seed ${seed} step ${step}: the playing track fell out of the in-order queue`)
      }
      checked++
    }
  }
  assert.ok(checked > 10000, `expected a real workout, only ran ${checked} moves`)
})

// --- promoteUpNext -----------------------------------------------------------

test('promoting into an empty play order leaves the song PLAYING, not orphaned', () => {
  const r = promoteUpNext({ queue: [], shuffledQueue: [], upNext: [T(42)], queueIndex: 0, shuffle: false })
  assert.deepEqual(r.queue.map((t) => t.id), [42])
  assert.equal(r.queueIndex, 0) // used to be 1 -> currentTrack() was null and the song vanished
  assert.equal(r.queue[r.queueIndex].id, 42)
  assert.deepEqual(r.upNext, [])
})

test('promoting into an empty play order while SHUFFLED fills both orders', () => {
  const r = promoteUpNext({ queue: [], shuffledQueue: [], upNext: [T(42)], queueIndex: 0, shuffle: true })
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [42])
  assert.deepEqual(r.queue.map((t) => t.id), [42])
  assert.equal(r.shuffledQueue[r.queueIndex].id, 42)
})

test('promoting mid-queue inserts right after the current track', () => {
  const r = promoteUpNext({
    queue: [T(1), T(2), T(3)], shuffledQueue: [], upNext: [T(9), T(8)], queueIndex: 1, shuffle: false,
  })
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 9, 3])
  assert.equal(r.queueIndex, 2)
  assert.equal(r.queue[r.queueIndex].id, 9)
  assert.deepEqual(r.upNext.map((t) => t.id), [8])
  assert.deepEqual(r.shuffledQueue, []) // shuffle off: the mirror stays empty
})

test('promoting while shuffled keeps the two orders in step', () => {
  const r = promoteUpNext({
    queue: [T(1), T(2), T(3)], shuffledQueue: [T(3), T(1), T(2)], upNext: [T(9)], queueIndex: 0, shuffle: true,
  })
  assert.deepEqual(r.shuffledQueue.map((t) => t.id), [3, 9, 1, 2])
  assert.deepEqual([...r.queue].map((t) => t.id).sort((a, b) => a - b), [1, 2, 3, 9])
  // playing id 3, which sits last in the in-order mirror -> the promoted song goes after it
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 3, 9])
  assert.equal(r.shuffledQueue[r.queueIndex].id, 9)
})

test('promoting an empty Up Next is refused', () => {
  assert.equal(promoteUpNext({ queue: [T(1)], shuffledQueue: [], upNext: [], queueIndex: 0, shuffle: false }), null)
})

// --- buildShuffled -----------------------------------------------------------
// Deterministic rand so the shuffle is reproducible; the properties below hold for any.
const rng = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return (seed >>> 8) / 0x7fffff
}

test('buildShuffled keeps the anchored track in front', () => {
  const q = [T(1), T(2), T(3), T(4)]
  assert.equal(buildShuffled(q, 2, rng(7))[0].id, 3)
  assert.equal(buildShuffled(q, 0, rng(7))[0].id, 1)
})

test('buildShuffled preserves the play order EXACTLY, duplicates included', () => {
  // The regression: anchoring by id filtered out every copy of it and put one back, so a
  // queue holding the same song twice came back a row short the moment shuffle was pressed.
  const q = [T(4), T(1), T(4), T(2), T(3)]
  for (let anchor = 0; anchor < q.length; anchor++) {
    const r = buildShuffled(q, anchor, rng(anchor + 1))
    assert.equal(r.length, q.length, `anchor ${anchor}: lost a row`)
    assert.deepEqual(
      r.map((t) => t.id).sort((a, b) => a - b),
      q.map((t) => t.id).sort((a, b) => a - b),
      `anchor ${anchor}: the multiset changed`
    )
    assert.equal(r[0], q[anchor], `anchor ${anchor}: wrong track in front`)
  }
})

test('buildShuffled anchors the OCCURRENCE, not every track sharing its id', () => {
  const q = [T(4), T(1), T(4)]
  const r = buildShuffled(q, 2, rng(3))
  assert.equal(r[0], q[2])          // the second copy, by identity
  assert.ok(r.includes(q[0]))       // the first copy is still in there
  assert.equal(r.filter((t) => t.id === 4).length, 2)
})

test('buildShuffled with no anchor still returns every track', () => {
  const q = [T(1), T(2), T(3)]
  assert.deepEqual(buildShuffled(q, 99, rng(1)).map((t) => t.id).sort(), [1, 2, 3])
  assert.deepEqual(buildShuffled([], 0, rng(1)), [])
})

test('fisherYates is a permutation, never a resize', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8]
  for (let s = 1; s <= 200; s++) {
    const r = fisherYates(a, rng(s))
    assert.deepEqual([...r].sort((x, y) => x - y), a)
  }
})

test('a shuffle ON/OFF round-trip keeps every song, even with a duplicate', () => {
  // The full loop the fuzz could not reach before: promote a song already in the queue,
  // then toggle shuffle both ways, and nothing may be lost, gained, or rewound.
  const promoted = promoteUpNext({
    queue: [T(1), T(2), T(3)], shuffledQueue: [], upNext: [T(1)], queueIndex: 0, shuffle: false,
  })
  assert.deepEqual(promoted.queue.map((t) => t.id), [1, 1, 2, 3])
  assert.equal(promoted.queueIndex, 1)

  const on = buildShuffled(promoted.queue, promoted.queueIndex, rng(11))
  assert.equal(on.length, 4)
  assert.deepEqual(on.map((t) => t.id).sort((a, b) => a - b), [1, 1, 2, 3])
  assert.equal(on[0], promoted.queue[1]) // the promoted copy keeps playing

  // ...and toggling back off resolves to that same copy, not the first one sharing its id
  const back = promoted.queue.indexOf(on[0])
  assert.equal(back, 1)
})
