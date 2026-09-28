// Unit tests for swipe-core.ts — run with:
//   node --no-warnings --experimental-strip-types --test src/lib/__tests__/*.test.mjs
// (npm test). Pure logic only — no DOM/store dependencies.
import test from 'node:test'
import assert from 'node:assert/strict'
import { swipeVerdict, stepsToNextUndecided, SWIPE_THRESHOLD } from '../swipe-core.ts'

test('swipeVerdict: below the threshold either way is no verdict', () => {
  assert.equal(swipeVerdict(0, 260), null)
  assert.equal(swipeVerdict(80, 260), null)
  assert.equal(swipeVerdict(-80, 260), null)
})

test('swipeVerdict: past the threshold, right is yes and left is no', () => {
  assert.equal(swipeVerdict(200, 260), 'yes')
  assert.equal(swipeVerdict(-200, 260), 'no')
})

test('swipeVerdict: exactly at the threshold counts', () => {
  const at = 200 * SWIPE_THRESHOLD
  assert.equal(swipeVerdict(at, 200), 'yes')
  assert.equal(swipeVerdict(-at, 200), 'no')
})

test('swipeVerdict: a card with zero (or bogus) width never judges', () => {
  assert.equal(swipeVerdict(500, 0), null)
  assert.equal(swipeVerdict(-500, 0), null)
  assert.equal(swipeVerdict(500, NaN), null)
})

test('stepsToNextUndecided: the next song undecided is one step', () => {
  assert.equal(stepsToNextUndecided([5, 6, 7], new Set()), 1)
})

test('stepsToNextUndecided: jumps over tagged and skipped songs', () => {
  const decided = new Set([5, 6]) // e.g. 5 tagged, 6 skipped
  assert.equal(stepsToNextUndecided([5, 6, 7, 8], decided), 3)
})

test('stepsToNextUndecided: everything ahead decided, or nothing ahead, is null', () => {
  assert.equal(stepsToNextUndecided([5, 6], new Set([5, 6])), null)
  assert.equal(stepsToNextUndecided([], new Set()), null)
})

test('stepsToNextUndecided: the current song appearing again later is jumped over once judged', () => {
  // Current song 3 was just skipped, so its later copy in the queue is decided too.
  assert.equal(stepsToNextUndecided([4, 3, 9], new Set([4, 3])), 3)
})
