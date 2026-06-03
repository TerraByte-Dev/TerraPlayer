import test from 'node:test'
import assert from 'node:assert/strict'
import { MIN_BPM, MAX_BPM, clampBpm, bpmToInterval, tapTempo } from '../metronome.ts'

test('constants', () => {
  assert.equal(MIN_BPM, 30)
  assert.equal(MAX_BPM, 300)
})

test('bpmToInterval converts BPM to ms per beat', () => {
  assert.equal(bpmToInterval(120), 500)
  assert.equal(bpmToInterval(60), 1000)
  assert.equal(bpmToInterval(300), 200)
  assert.equal(bpmToInterval(30), 2000)
})

test('clampBpm clamps to bounds and rounds', () => {
  assert.equal(clampBpm(120), 120)
  assert.equal(clampBpm(29), MIN_BPM)
  assert.equal(clampBpm(0), MIN_BPM)
  assert.equal(clampBpm(-100), MIN_BPM)
  assert.equal(clampBpm(301), MAX_BPM)
  assert.equal(clampBpm(99999), MAX_BPM)
  assert.equal(clampBpm(120.4), 120)
  assert.equal(clampBpm(120.6), 121)
})

test('clampBpm is NaN-safe', () => {
  // Non-finite inputs all fall back to the safe MIN_BPM via the Number.isFinite guard.
  assert.equal(clampBpm(NaN), MIN_BPM)
  assert.equal(clampBpm(Infinity), MIN_BPM)
  assert.equal(clampBpm(-Infinity), MIN_BPM)
})

test('tapTempo from evenly spaced timestamps yields the right BPM', () => {
  // 500ms gaps -> 120 BPM
  assert.equal(tapTempo([0, 500, 1000, 1500, 2000]), 120)
  // 1000ms gaps -> 60 BPM
  assert.equal(tapTempo([0, 1000, 2000]), 60)
  // 250ms gaps -> 240 BPM
  assert.equal(tapTempo([1000, 1250, 1500, 1750]), 240)
})

test('tapTempo averages uneven gaps', () => {
  // gaps: 500, 600, 700 -> avg 600 -> 100 BPM
  assert.equal(tapTempo([0, 500, 1100, 1800]), 100)
})

test('tapTempo clamps to valid range', () => {
  // very fast taps -> clamp to MAX_BPM
  assert.equal(tapTempo([0, 10, 20, 30]), MAX_BPM)
  // very slow taps -> clamp to MIN_BPM
  assert.equal(tapTempo([0, 5000, 10000]), MIN_BPM)
})

test('tapTempo handles fewer than 2 taps', () => {
  assert.equal(tapTempo([]), MIN_BPM)
  assert.equal(tapTempo([1000]), MIN_BPM)
  assert.equal(tapTempo(undefined), MIN_BPM)
  assert.equal(tapTempo(null), MIN_BPM)
})

test('tapTempo ignores non-positive / non-finite gaps', () => {
  // duplicate timestamps produce a zero gap, ignored; remaining 500ms gap -> 120 BPM
  assert.equal(tapTempo([0, 0, 500]), 120)
  // backwards timestamp produces negative gap, ignored
  assert.equal(tapTempo([1000, 500, 1000]), 120)
})

test('tapTempo with no usable gaps falls back', () => {
  assert.equal(tapTempo([1000, 1000, 1000]), MIN_BPM)
})
