// Unit tests for settings-schema.ts — the untrusted-input normalizer + file parser. Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSettings, parseSettingsExport, DEFAULT_SETTINGS, EXPORT_KIND,
} from '../settings-schema.ts'
import { EQ_PRESETS } from '../audio-math.ts'

test('normalizeSettings: garbage in → complete defaults out', () => {
  for (const junk of [null, undefined, 42, 'x', [], { random: true }]) {
    assert.deepEqual(normalizeSettings(junk), DEFAULT_SETTINGS)
  }
})

test('normalizeSettings: clamps out-of-range audio + playback values', () => {
  const n = normalizeSettings({
    audio: { volume: 9, preampDb: 999, eq: { preset: 'custom', bands: [99, -99, 0, 0, 0, 0, 0, 0, 0, 0] } },
    playback: { fadeSec: 99, speed: 99 },
  })
  assert.equal(n.audio.volume, 1)
  assert.equal(n.audio.preampDb, 12)
  assert.equal(n.audio.eq.bands.length, 10)
  assert.equal(n.audio.eq.bands[0], 8)
  assert.equal(n.audio.eq.bands[1], -8)
  assert.equal(n.playback.fadeSec, 6)
  assert.equal(n.playback.speed, 2)
})

test('normalizeSettings: preserves valid values incl. volume 0', () => {
  const n = normalizeSettings({
    theme: 'synthwave',
    display: { scanlines: false, reduceMotion: true },
    audio: { volume: 0, preampDb: -3, mono: true, eq: { preset: 'rock', bands: EQ_PRESETS.rock.bands } },
    playback: { shuffle: true, repeat: 'one', fadeSec: 3, speed: 1.5 },
  })
  assert.equal(n.theme, 'synthwave')
  assert.equal(n.display.scanlines, false)
  assert.equal(n.display.reduceMotion, true)
  assert.equal(n.audio.volume, 0)
  assert.equal(n.audio.preampDb, -3)
  assert.equal(n.audio.mono, true)
  assert.equal(n.audio.eq.preset, 'rock')
  assert.deepEqual(n.audio.eq.bands, EQ_PRESETS.rock.bands)
  assert.equal(n.playback.shuffle, true)
  assert.equal(n.playback.repeat, 'one')
  assert.equal(n.playback.fadeSec, 3)
  assert.equal(n.playback.speed, 1.5)
})

test('normalizeSettings: migrates a legacy v1 EQ ({low,mid,high}) to 10 bands', () => {
  const n = normalizeSettings({ audio: { eq: { preset: 'bass', low: 4, mid: 0, high: 1 } } })
  assert.equal(n.audio.eq.bands.length, 10)
  assert.deepEqual(n.audio.eq.bands, [4, 4, 4, 0, 0, 0, 0, 1, 1, 1])
  assert.equal(n.audio.eq.preset, 'custom')
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
