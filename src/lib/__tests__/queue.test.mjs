import test from 'node:test'
import assert from 'node:assert/strict'
import { windowComingUp, COMING_UP_WINDOW } from '../queue.ts'

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
