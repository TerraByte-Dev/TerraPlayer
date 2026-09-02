import test from 'node:test'
import assert from 'node:assert/strict'
import { windowComingUp, COMING_UP_WINDOW, purgeTrackFromQueue, removeComingUpAt } from '../queue.ts'

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
  // queue [1,2,3,2,4] with index 1 (id 2) playing; Coming Up [3,2,4] — the 2 is a dupe
  // next() spliced in from upNext. Removing it must not orphan toggleShuffle's lookup.
  const snap = {
    queue: [T(1), T(2), T(3), T(2), T(4)],
    shuffledQueue: [T(2), T(4), T(2), T(1), T(3)],
    queueIndex: 1,
    shuffle: false,
  }
  const r = removeComingUpAt(snap, 1, 2) // the second copy of id 2
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 3, 4])
  // the mirror drops one id-2, and the surviving one is still findable as "current"
  assert.equal(r.shuffledQueue.filter((t) => t.id === 2).length, 1)
  assert.ok(r.shuffledQueue.some((t) => t.id === 2))
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
