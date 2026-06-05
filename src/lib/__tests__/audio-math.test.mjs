// Unit tests for audio-math.ts — pure DSP/clamp math. Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dbToGain, clamp, clampEqBand, clampPreamp, eqPresetGains, eqPresetLabel, EQ_PRESETS,
  EQ_BAND_MIN, EQ_BAND_MAX, PREAMP_MIN, PREAMP_MAX, spectrumStats,
  EQ_BAND_COUNT, EQ_PRESET_ORDER, mapLegacyEq, coerceEqSettings,
  clampSpeed, clampFadeSec, fadeStartTime, SPEED_MIN, SPEED_MAX, FADE_MAX,
} from '../audio-math.ts'

// Reference = the EXACT pre-optimization expression from FullscreenVisualizer's
// draw loop (reduce + Array.from(slice) + Math.max spread). spectrumStats must
// reproduce it byte-for-byte; this guards the hot-loop rewrite against drift.
function refStats(data) {
  const arr = Array.from(data)
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length / 255
  const bass = Array.from(data.slice(0, 8)).reduce((a, b) => a + b, 0) / (8 * 255)
  const trebleStart = Math.min(96, arr.length - 1)
  const treble = Array.from(data.slice(trebleStart)).reduce((a, b) => a + b, 0) / ((arr.length - trebleStart) * 255)
  const peak = Math.max(...arr) / 255
  return { avg, bass, treble, peak }
}

function buf(n, fn) {
  const a = new Uint8Array(n)
  for (let i = 0; i < n; i++) a[i] = fn(i)
  return a
}

test('dbToGain: 0 dB is unity, ±6 dB ≈ ×2 / ÷2', () => {
  assert.equal(dbToGain(0), 1)
  assert.ok(Math.abs(dbToGain(6) - 1.9953) < 0.001)
  assert.ok(Math.abs(dbToGain(-6) - 0.5012) < 0.001)
})

test('dbToGain: clamps the dB input to the pre-amp range before converting', () => {
  assert.equal(dbToGain(999), dbToGain(PREAMP_MAX))
  assert.equal(dbToGain(-999), dbToGain(PREAMP_MIN))
})

test('clamp: bounds and NaN → min', () => {
  assert.equal(clamp(5, 0, 10), 5)
  assert.equal(clamp(-1, 0, 10), 0)
  assert.equal(clamp(11, 0, 10), 10)
  assert.equal(clamp(NaN, 0, 10), 0)
})

test('clampEqBand / clampPreamp: respect their ranges', () => {
  assert.equal(clampEqBand(100), EQ_BAND_MAX)
  assert.equal(clampEqBand(-100), EQ_BAND_MIN)
  assert.equal(clampEqBand(3.5), 3.5)
  assert.equal(clampPreamp(100), PREAMP_MAX)
  assert.equal(clampPreamp(-100), PREAMP_MIN)
})

test('eqPresetGains: returns a fresh bands array, never the shared constant', () => {
  const a = eqPresetGains('bass-boost')
  assert.deepEqual(a.bands, EQ_PRESETS['bass-boost'].bands)
  assert.notEqual(a.bands, EQ_PRESETS['bass-boost'].bands) // different array reference
  a.bands[0] = 999
  assert.notEqual(EQ_PRESETS['bass-boost'].bands[0], 999) // mutating the copy can't corrupt the preset
  assert.equal(a.preset, 'bass-boost')
})

test('eqPresetGains: unknown / custom preset falls back to flat (off)', () => {
  for (const p of ['bogus', 'custom']) {
    const r = eqPresetGains(p)
    assert.equal(r.preset, 'off')
    assert.deepEqual(r.bands, new Array(EQ_BAND_COUNT).fill(0))
  }
})

test('eqPresetLabel: named + custom', () => {
  assert.equal(eqPresetLabel('off'), 'Flat')
  assert.equal(eqPresetLabel('rock'), 'Rock')
  assert.equal(eqPresetLabel('custom'), 'Custom')
  assert.equal(eqPresetLabel('bogus'), 'Flat')
})

test('EQ_PRESETS: every preset is 10 bands within ±8; off is flat; order matches the table', () => {
  for (const [id, p] of Object.entries(EQ_PRESETS)) {
    assert.equal(p.bands.length, EQ_BAND_COUNT, `${id} band count`)
    for (const g of p.bands) assert.ok(g >= EQ_BAND_MIN && g <= EQ_BAND_MAX, `${id} band ${g} out of range`)
  }
  assert.deepEqual(EQ_PRESETS.off.bands, new Array(EQ_BAND_COUNT).fill(0))
  assert.deepEqual([...EQ_PRESET_ORDER].sort(), Object.keys(EQ_PRESETS).sort())
})

test('mapLegacyEq: spreads {low,mid,high} across 10 bands (clamped); flat→off else custom; tolerates junk', () => {
  const m = mapLegacyEq({ preset: 'bass', low: 4, mid: 0, high: 1 })
  assert.deepEqual(m.bands, [4, 4, 4, 0, 0, 0, 0, 1, 1, 1])
  assert.equal(m.preset, 'custom')
  assert.deepEqual(mapLegacyEq({ low: 99, mid: -99, high: 0 }).bands, [8, 8, 8, -8, -8, -8, -8, 0, 0, 0])
  assert.equal(mapLegacyEq({ low: 0, mid: 0, high: 0 }).preset, 'off')
  assert.equal(mapLegacyEq(null).bands.length, EQ_BAND_COUNT)
  assert.deepEqual(mapLegacyEq(undefined).bands, new Array(EQ_BAND_COUNT).fill(0))
})

test('coerceEqSettings: accepts new + legacy + garbage shapes, normalizes length, idempotent', () => {
  const fresh = coerceEqSettings({ preset: 'rock', bands: [3.5, 3, 1.5, -1, -1.5, 0, 1.5, 2.5, 3, 2.5] })
  assert.equal(fresh.preset, 'rock')
  assert.equal(fresh.bands.length, EQ_BAND_COUNT)
  assert.deepEqual(coerceEqSettings(fresh), fresh) // idempotent
  assert.equal(coerceEqSettings({ preset: 'off', bands: [1, 2, 3] }).bands.length, EQ_BAND_COUNT) // padded
  assert.equal(coerceEqSettings({ preset: 'nope', bands: new Array(10).fill(0) }).preset, 'custom') // unknown→custom
  assert.deepEqual(coerceEqSettings({ low: 4, mid: 0, high: 1 }).bands, [4, 4, 4, 0, 0, 0, 0, 1, 1, 1]) // legacy
  assert.deepEqual(coerceEqSettings(null), eqPresetGains('off')) // garbage→flat
})

test('clampSpeed / clampFadeSec: ranges + non-finite fallbacks', () => {
  assert.equal(clampSpeed(1), 1)
  assert.equal(clampSpeed(0.1), SPEED_MIN)
  assert.equal(clampSpeed(9), SPEED_MAX)
  assert.equal(clampSpeed(NaN), 1) // non-finite → normal speed (not min)
  assert.equal(clampSpeed(undefined), 1)
  assert.equal(clampFadeSec(3), 3)
  assert.equal(clampFadeSec(99), FADE_MAX)
  assert.equal(clampFadeSec(-1), 0)
  assert.equal(clampFadeSec(NaN), 0)
})

test('fadeStartTime: only with a real duration + a positive fade', () => {
  assert.equal(fadeStartTime(200, 6), 194)
  assert.equal(fadeStartTime(4, 6), 0) // fade longer than the track clamps to 0
  assert.equal(fadeStartTime(200, 0), null) // no fade
  assert.equal(fadeStartTime(0, 6), null) // unknown/zero duration
  assert.equal(fadeStartTime(NaN, 6), null)
  assert.equal(fadeStartTime(Infinity, 6), null)
})

test('spectrumStats: matches the original reduce/slice/spread formula exactly', () => {
  // The real shape (128 bins = fftSize 256), plus widths around the bass(8)/treble(96) boundaries.
  const cases = [
    buf(128, (i) => (i * 37 + 13) % 256),        // realistic full spectrum
    buf(128, () => 0),                            // silence
    buf(128, () => 255),                          // full scale
    buf(128, (i) => (i < 8 ? 200 : 5)),           // bass-heavy
    buf(128, (i) => (i >= 96 ? 180 : 2)),         // treble-heavy
    buf(96, (i) => (i * 11) % 256),               // n === trebleStart boundary
    buf(8, (i) => i * 30),                         // exactly the bass window
    buf(1, () => 123),                             // single bin
  ]
  for (const data of cases) {
    const got = spectrumStats(data)
    const want = refStats(data)
    for (const k of ['avg', 'bass', 'treble', 'peak']) {
      assert.ok(Math.abs(got[k] - want[k]) < 1e-12, `${k}: got ${got[k]} want ${want[k]} (n=${data.length})`)
    }
  }
})

test('spectrumStats: empty input is all zeros (no NaN/Infinity), never hit in practice', () => {
  assert.deepEqual(spectrumStats(new Uint8Array(0)), { avg: 0, bass: 0, treble: 0, peak: 0 })
})

test('spectrumStats: values stay normalized to 0–1', () => {
  const s = spectrumStats(buf(128, (i) => (i * 53) % 256))
  for (const k of ['avg', 'bass', 'treble', 'peak']) {
    assert.ok(s[k] >= 0 && s[k] <= 1, `${k} out of 0–1: ${s[k]}`)
  }
})
