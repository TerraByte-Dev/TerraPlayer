// Unit tests for audio-math.ts — pure DSP/clamp math. Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dbToGain, clamp, clampEqBand, clampPreamp, eqPresetGains, EQ_PRESETS,
  EQ_BAND_MIN, EQ_BAND_MAX, PREAMP_MIN, PREAMP_MAX, spectrumStats,
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

test('eqPresetGains: returns a fresh copy, never the shared constant', () => {
  const a = eqPresetGains('bass')
  assert.deepEqual(a, EQ_PRESETS.bass)
  assert.notEqual(a, EQ_PRESETS.bass) // different object reference
  a.low = 999
  assert.notEqual(EQ_PRESETS.bass.low, 999) // mutating the copy can't corrupt the preset
})

test('eqPresetGains: unknown preset falls back to flat', () => {
  assert.deepEqual(eqPresetGains('bogus'), EQ_PRESETS.off)
})

test('EQ_PRESETS: every preset is fully formed and within band range', () => {
  for (const [name, p] of Object.entries(EQ_PRESETS)) {
    assert.equal(p.preset, name)
    for (const band of ['low', 'mid', 'high']) {
      assert.ok(p[band] >= EQ_BAND_MIN && p[band] <= EQ_BAND_MAX, `${name}.${band} out of range`)
    }
  }
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
