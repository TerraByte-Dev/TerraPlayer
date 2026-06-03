// Unit tests for notes.ts — pure text statistics for the Scratchpad tool.
// Run: node --no-warnings --experimental-strip-types --test src/lib/tools/__tests__/notes.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { textStats } from '../notes.ts'

test('empty string → all zero (no lines for "")', () => {
  assert.deepEqual(textStats(''), { chars: 0, words: 0, lines: 0 })
})

test('single word, single line', () => {
  assert.deepEqual(textStats('hello'), { chars: 5, words: 1, lines: 1 })
})

test('multi-word single line', () => {
  // "the quick brown fox" => 19 chars, 4 words, 1 line
  assert.deepEqual(textStats('the quick brown fox'), { chars: 19, words: 4, lines: 1 })
})

test('multi-line counts', () => {
  const text = 'line one\nline two\nline three'
  const stats = textStats(text)
  assert.equal(stats.lines, 3)
  assert.equal(stats.words, 6)
  assert.equal(stats.chars, text.length)
})

test('trailing newline adds a final (empty) row', () => {
  // "a\n" renders as two rows in an editor: "a" and an empty line where the cursor sits.
  assert.deepEqual(textStats('a\n'), { chars: 2, words: 1, lines: 2 })
})

test('multiple trailing newlines each add a row', () => {
  const stats = textStats('a\n\n\n')
  assert.equal(stats.lines, 4)
  assert.equal(stats.words, 1)
  assert.equal(stats.chars, 4)
})

test('leading/trailing whitespace does not inflate word count', () => {
  const stats = textStats('   padded words   ')
  assert.equal(stats.words, 2)
  assert.equal(stats.chars, 18) // whitespace still counts toward chars
  assert.equal(stats.lines, 1)
})

test('whitespace-only string: 0 words but counts chars and lines', () => {
  const stats = textStats('   \t  ')
  assert.equal(stats.words, 0)
  assert.equal(stats.chars, 6)
  assert.equal(stats.lines, 1)
})

test('whitespace-only with newlines: 0 words, line rows from newlines', () => {
  const stats = textStats('\n\n')
  assert.equal(stats.words, 0)
  assert.equal(stats.chars, 2)
  assert.equal(stats.lines, 3)
})

test('words separated by mixed/runs of whitespace collapse correctly', () => {
  const stats = textStats('one   two\t\tthree\nfour')
  assert.equal(stats.words, 4)
  assert.equal(stats.lines, 2)
})

test('unicode characters count by code unit length', () => {
  // "café" is 4 code units; one word; one line.
  const stats = textStats('café')
  assert.equal(stats.chars, 4)
  assert.equal(stats.words, 1)
  assert.equal(stats.lines, 1)
})

test('windows-style CRLF: \\r stays attached, lines split on \\n', () => {
  const text = 'a\r\nb'
  const stats = textStats(text)
  assert.equal(stats.lines, 2)
  assert.equal(stats.chars, 4)
  assert.equal(stats.words, 2)
})
