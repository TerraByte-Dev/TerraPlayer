// Unit tests for library-core.ts — run with:
//   node --no-warnings --experimental-strip-types --test src/lib/__tests__/*.test.mjs
// (npm test). Pure logic only — no electron/node-fs dependencies.
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeName, validateRename, isInPlaylist } from '../library-core.ts'

test('normalizeName trims and collapses internal whitespace', () => {
  assert.equal(normalizeName('  Road   Trip  '), 'Road Trip')
  assert.equal(normalizeName('Lo-Fi\tBeats'), 'Lo-Fi Beats')
  assert.equal(normalizeName(''), '')
  assert.equal(normalizeName('   '), '')
})

test('validateRename rejects empty / whitespace-only names', () => {
  const a = validateRename('', ['Rock'])
  assert.equal(a.ok, false)
  assert.equal(a.reason, 'empty')
  assert.equal(typeof a.message, 'string')
  assert.ok(a.message.length > 0)
  assert.equal(validateRename('   ', []).reason, 'empty')
})

test('validateRename rejects duplicates case-insensitively', () => {
  const r = validateRename('rock', ['Jazz', 'Rock'])
  assert.equal(r.ok, false)
  assert.equal(r.ok ? '' : r.reason, 'duplicate')
  // Whitespace differences still collide once normalized.
  assert.equal(validateRename('Road  Trip', ['road trip']).ok, false)
})

test('validateRename returns the normalized name on success', () => {
  const r = validateRename('  Chill   Vibes ', ['Rock', 'Jazz'])
  assert.deepEqual(r, { ok: true, name: 'Chill Vibes' })
})

test('validateRename allows a no-op / case-only edit when self is excluded', () => {
  // `others` excludes the item being renamed, so renaming "rock" -> "Rock" is fine.
  assert.deepEqual(validateRename('Rock', ['Jazz', 'Pop']), { ok: true, name: 'Rock' })
})

test('isInPlaylist reflects membership for dedupe-on-add', () => {
  assert.equal(isInPlaylist([1, 2, 3], 2), true)
  assert.equal(isInPlaylist([1, 2, 3], 9), false)
  assert.equal(isInPlaylist([], 1), false)
})
