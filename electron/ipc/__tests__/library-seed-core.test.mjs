// Unit tests for library-seed-core.ts — run with:
//   node --no-warnings --experimental-strip-types --test electron/ipc/__tests__/*.test.mjs
// (npm test). Pure logic only — no electron/node-fs dependencies.
import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldSeedFolder } from '../library-seed-core.ts'

test('shouldSeedFolder: NULL means never seeded → seed', () => {
  assert.equal(shouldSeedFolder(null), true)
})

test('shouldSeedFolder: undefined (column absent on old row) → seed', () => {
  assert.equal(shouldSeedFolder(undefined), true)
})

test('shouldSeedFolder: a stamped timestamp → do NOT seed', () => {
  assert.equal(shouldSeedFolder(1_718_323_200), false)
})

test('shouldSeedFolder: epoch 0 still counts as already seeded', () => {
  // We never stamp 0 (we use strftime('%s','now')), but a 0 must read as seeded
  // rather than re-seeding forever.
  assert.equal(shouldSeedFolder(0), false)
})
