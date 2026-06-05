// Unit tests for lib/perf.ts — pure perf utilities. Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createFrameThrottle, createDedupeStorage } from '../perf.ts'

test('createFrameThrottle: emits on the first call', () => {
  const gate = createFrameThrottle(33)
  assert.equal(gate(0), true)
})

test('createFrameThrottle: suppresses calls inside the interval, allows at/after it', () => {
  const gate = createFrameThrottle(33)
  assert.equal(gate(0), true)      // first
  assert.equal(gate(16), false)    // 16ms later — too soon
  assert.equal(gate(32), false)    // 32ms — still under 33
  assert.equal(gate(33), true)     // exactly 33ms — allowed
  assert.equal(gate(40), false)    // 7ms after last emit
  assert.equal(gate(66), true)     // 33ms after last emit
})

test('createFrameThrottle: throttles a 60fps loop and never emits twice within the interval', () => {
  const interval = 1000 / 30 // ~33.33ms target gate
  const gate = createFrameThrottle(interval)
  const emits = []
  // 60 frames over 1s at ~16.67ms spacing (typical rAF cadence)
  for (let f = 0; f < 60; f++) {
    const t = f * (1000 / 60)
    if (gate(t)) emits.push(t)
  }
  // Throttled well below the 60 input frames, and at most the interval allows (ceil(1000/33.33)+1).
  assert.ok(emits.length < 60 && emits.length <= 31, `expected throttled emits, got ${emits.length}`)
  assert.ok(emits.length >= 15, `expected meaningful emit rate, got ${emits.length}`)
  // Hard contract: consecutive emits are always at least one interval apart.
  for (let i = 1; i < emits.length; i++) {
    assert.ok(emits[i] - emits[i - 1] >= interval, `gap ${emits[i] - emits[i - 1]} < ${interval}`)
  }
})

function fakeStorage() {
  const map = new Map()
  const calls = { set: 0, remove: 0 }
  return {
    map,
    calls,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { calls.set++; map.set(k, v) },
    removeItem: (k) => { calls.remove++; map.delete(k) },
  }
}

test('createDedupeStorage: skips identical consecutive writes, lets new values through', () => {
  const inner = fakeStorage()
  const s = createDedupeStorage(inner)

  s.setItem('k', 'a')           // write
  s.setItem('k', 'a')           // identical — skipped
  s.setItem('k', 'a')           // identical — skipped
  assert.equal(inner.calls.set, 1)
  assert.equal(inner.map.get('k'), 'a')

  s.setItem('k', 'b')           // changed — write
  assert.equal(inner.calls.set, 2)
  assert.equal(inner.map.get('k'), 'b')

  s.setItem('k', 'b')           // identical again — skipped
  assert.equal(inner.calls.set, 2)
})

test('createDedupeStorage: dedupe is per-key', () => {
  const inner = fakeStorage()
  const s = createDedupeStorage(inner)
  s.setItem('a', '1')
  s.setItem('b', '1')   // same value, different key — must still write
  assert.equal(inner.calls.set, 2)
})

test('createDedupeStorage: getItem passes through; removeItem clears the dedupe memory', () => {
  const inner = fakeStorage()
  const s = createDedupeStorage(inner)
  s.setItem('k', 'a')
  assert.equal(s.getItem('k'), 'a')
  assert.equal(s.getItem('missing'), null)

  s.removeItem('k')
  assert.equal(inner.calls.remove, 1)
  // After removal, writing the same value as before must go through (not be deduped).
  s.setItem('k', 'a')
  assert.equal(inner.calls.set, 2)
})
