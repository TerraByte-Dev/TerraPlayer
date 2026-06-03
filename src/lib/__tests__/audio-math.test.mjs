// Unit tests for audio-math.ts — pure DSP/clamp math. Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dbToGain, clamp, clampEqBand, clampPreamp, eqPresetGains, EQ_PRESETS,
  EQ_BAND_MIN, EQ_BAND_MAX, PREAMP_MIN, PREAMP_MAX,
} from '../audio-math.ts'

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
