// Unit tests for stream-core.ts — pure hub:// protocol helpers. Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { contentTypeFor, parseRange, cacheControlFor } from '../stream-core.ts'

test('contentTypeFor: audio + image extensions, case-insensitive, with fallback', () => {
  assert.equal(contentTypeFor('x.m4a'), 'audio/mp4')
  assert.equal(contentTypeFor('x.MP4'), 'audio/mp4')
  assert.equal(contentTypeFor('x.mp3'), 'audio/mpeg')
  assert.equal(contentTypeFor('x.wav'), 'audio/wav')
  assert.equal(contentTypeFor('x.flac'), 'audio/flac')
  assert.equal(contentTypeFor('cover.JPG'), 'image/jpeg')
  assert.equal(contentTypeFor('cover.jpeg'), 'image/jpeg')
  assert.equal(contentTypeFor('cover.png'), 'image/png')
  assert.equal(contentTypeFor('cover.webp'), 'image/webp')
  assert.equal(contentTypeFor('cover.gif'), 'image/gif')
  assert.equal(contentTypeFor('weird.xyz'), 'application/octet-stream')
  assert.equal(contentTypeFor('noext'), 'application/octet-stream')
})

test('parseRange: null/garbage/empty → null (full-content path)', () => {
  assert.equal(parseRange(null, 1000), null)
  assert.equal(parseRange('', 1000), null)
  assert.equal(parseRange('kg=0-10', 1000), null)
  assert.equal(parseRange('bytes=-', 1000), null)
})

test('parseRange: explicit start-end is clamped to the last byte', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 })
  assert.deepEqual(parseRange('bytes=100-', 1000), { start: 100, end: 999 })
  assert.deepEqual(parseRange('bytes=0-99999', 1000), { start: 0, end: 999 }) // end clamped
})

test('parseRange: suffix range (last N bytes)', () => {
  assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 })
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, end: 999 }) // suffix > size → from 0
})

test('parseRange: unsatisfiable / inverted ranges → null (caller returns 416)', () => {
  assert.equal(parseRange('bytes=1000-', 1000), null) // start === size
  assert.equal(parseRange('bytes=2000-3000', 1000), null) // start beyond size
  assert.equal(parseRange('bytes=500-100', 1000), null) // start > end
})

test('cacheControlFor: images cache immutably (content-addressed), audio/other do not', () => {
  assert.equal(cacheControlFor('image/jpeg'), 'public, max-age=31536000, immutable')
  assert.equal(cacheControlFor('image/png'), 'public, max-age=31536000, immutable')
  assert.equal(cacheControlFor('image/webp'), 'public, max-age=31536000, immutable')
  assert.equal(cacheControlFor('audio/mp4'), null)
  assert.equal(cacheControlFor('audio/mpeg'), null)
  assert.equal(cacheControlFor('application/octet-stream'), null)
})
