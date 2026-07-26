// Unit tests for library-core.ts — run with:
//   node --no-warnings --experimental-strip-types --test src/lib/__tests__/*.test.mjs
// (npm test). Pure logic only — no electron/node-fs dependencies.
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeName, validateRename, isInPlaylist, describeDrop } from '../library-core.ts'

const drop = (over = {}) => ({
  folders: 0, indexed: 0, unchanged: 0, skipped: 0, duplicates: 0, unsupported: 0, errors: [], ...over,
})

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

test('describeDrop stays quiet when the revealed song is the whole story', () => {
  assert.equal(describeDrop(drop({ indexed: 1 }), true), null)
  assert.equal(describeDrop(drop({ folders: 1 }), false), null)
  assert.equal(describeDrop(drop({ skipped: 2 }), true), null)
})

test('describeDrop reports rejected files even when something else landed', () => {
  // The bug this guards: a .flac dropped alongside a folder used to vanish
  // silently because a folder had registered successfully.
  const msg = describeDrop(drop({ folders: 1, unsupported: 1 }), true)
  assert.match(msg, /\.mp3 and \.m4a/)
  assert.match(describeDrop(drop({ unsupported: 3 }), false), /Skipped 3 files/)
  assert.match(describeDrop(drop({ unsupported: 1 }), false), /Skipped 1 file —/)
})

test('describeDrop surfaces a read error over staying silent', () => {
  assert.equal(describeDrop(drop({ errors: ['C:\\a.mp3: EPERM'] }), false), 'C:\\a.mp3: EPERM')
})

test('describeDrop explains a reveal that landed on a different copy', () => {
  // revealPath points at the song already indexed, not at what was dropped —
  // without a message the selection implies the drop was added.
  assert.match(describeDrop(drop({ duplicates: 1 }), true), /already in your library/i)
  assert.match(describeDrop(drop({ duplicates: 2 }), true), /2 songs are/)
  // ...but not when real work also happened; the reveal is then honest.
  assert.equal(describeDrop(drop({ duplicates: 1, indexed: 1 }), true), null)
})

test('describeDrop never leaves a drop wholly unanswered', () => {
  // Nothing indexed, nothing rejected, nothing revealed — the fingerprint-twin case.
  assert.match(describeDrop(drop(), false), /already in your library/i)
})
