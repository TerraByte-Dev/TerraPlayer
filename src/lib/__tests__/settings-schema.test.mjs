// Unit tests for settings-schema.ts — the untrusted-input normalizer + file parser. Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSettings, parseSettingsExport, DEFAULT_SETTINGS, EXPORT_KIND,
} from '../settings-schema.ts'

test('normalizeSettings: garbage in → complete defaults out', () => {
  for (const junk of [null, undefined, 42, 'x', [], { random: true }]) {
    assert.deepEqual(normalizeSettings(junk), DEFAULT_SETTINGS)
  }
})

test('normalizeSettings: clamps out-of-range audio values', () => {
  const n = normalizeSettings({ audio: { volume: 9, preampDb: 999, eq: { preset: 'off', low: 99, mid: -99, high: 0 } } })
  assert.equal(n.audio.volume, 1)
  assert.equal(n.audio.preampDb, 12)
  assert.equal(n.audio.eq.low, 8)
  assert.equal(n.audio.eq.mid, -8)
})

test('normalizeSettings: preserves valid values incl. volume 0', () => {
  const n = normalizeSettings({
    theme: 'synthwave',
    display: { scanlines: false, reduceMotion: true },
    audio: { volume: 0, preampDb: -3, mono: true, eq: { preset: 'bass', low: 4, mid: 0, high: 1 } },
    playback: { shuffle: true, repeat: 'one' },
  })
  assert.equal(n.theme, 'synthwave')
  assert.equal(n.display.scanlines, false)
  assert.equal(n.display.reduceMotion, true)
  assert.equal(n.audio.volume, 0)
  assert.equal(n.audio.preampDb, -3)
  assert.equal(n.audio.mono, true)
  assert.equal(n.audio.eq.preset, 'bass')
  assert.equal(n.playback.shuffle, true)
  assert.equal(n.playback.repeat, 'one')
})

test('normalizeSettings: unknown theme / repeat / preset fall back', () => {
  const n = normalizeSettings({ theme: 'nope', audio: { eq: { preset: 'nope' } }, playback: { repeat: 'nope' } })
  assert.equal(n.theme, DEFAULT_SETTINGS.theme)
  assert.equal(n.audio.eq.preset, 'off')
  assert.equal(n.playback.repeat, 'off')
})

test('parseSettingsExport: rejects non-JSON and wrong kind', () => {
  assert.throws(() => parseSettingsExport('not json{'), /valid JSON/)
  assert.throws(() => parseSettingsExport(JSON.stringify({ kind: 'something-else' })), /TerraPlayer settings file/)
})

test('parseSettingsExport: accepts a valid file and normalizes its body', () => {
  const file = JSON.stringify({
    kind: EXPORT_KIND, version: 1, exportedAt: '2026-06-03',
    theme: 'amber', audio: { volume: 2 /* over-range */ },
  })
  const out = parseSettingsExport(file)
  assert.equal(out.kind, EXPORT_KIND)
  assert.equal(out.theme, 'amber')
  assert.equal(out.audio.volume, 1) // clamped during normalization
})
