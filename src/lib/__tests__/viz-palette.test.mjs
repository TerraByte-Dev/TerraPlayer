// Unit tests for viz-palette.ts — the pure theme→palette helpers the visualizer draw loop depends on.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTriple, hexToRgb, tintWhite, rgbStr, buildPalette, lerpStops, DEFAULT_PALETTE,
} from '../viz-palette.ts'

const FB = [1, 2, 3]

test('parseTriple: space-separated rgb, with fallback for blank/malformed', () => {
  assert.deepEqual(parseTriple('0 255 136', FB), [0, 255, 136])
  assert.deepEqual(parseTriple('  12   34  56 ', FB), [12, 34, 56]) // extra whitespace
  assert.deepEqual(parseTriple('', FB), FB)                          // blank (CSS var not applied)
  assert.deepEqual(parseTriple('0,255,136', FB), FB)                 // comma form is NOT this format
  assert.deepEqual(parseTriple('0 255', FB), FB)                     // wrong arity
  assert.deepEqual(parseTriple('a b c', FB), FB)                     // non-numeric
})

test('hexToRgb: #rrggbb (with or without #), with fallback', () => {
  assert.deepEqual(hexToRgb('#1f5e3a', FB), [31, 94, 58])
  assert.deepEqual(hexToRgb('1f5e3a', FB), [31, 94, 58])
  assert.deepEqual(hexToRgb('#FFFFFF', FB), [255, 255, 255])
  assert.deepEqual(hexToRgb('#000000', FB), [0, 0, 0])
  assert.deepEqual(hexToRgb('', FB), FB)
  assert.deepEqual(hexToRgb('#fff', FB), FB)      // 3-digit not supported → fallback
  assert.deepEqual(hexToRgb('nope', FB), FB)
})

test('tintWhite: mixes toward white by k', () => {
  assert.deepEqual(tintWhite([0, 100, 200], 0), [0, 100, 200])
  assert.deepEqual(tintWhite([0, 100, 200], 1), [255, 255, 255])
  assert.deepEqual(tintWhite([0, 0, 0], 0.5), [128, 128, 128]) // round(127.5)=128
})

test('rgbStr: comma-joined', () => {
  assert.equal(rgbStr([0, 255, 136]), '0,255,136')
})

test('buildPalette: strings + 3-stop gradients (deep→accent→bright / →accent2)', () => {
  const accent = [0, 255, 136], accent2 = [0, 229, 255], ink = [155, 245, 184], deep = [31, 94, 58]
  const p = buildPalette(accent, accent2, ink, deep)
  assert.equal(p.accentStr, '0,255,136')
  assert.equal(p.accent2Str, '0,229,255')
  assert.equal(p.inkStr, '155,245,184')
  assert.deepEqual(p.bright, tintWhite(accent, 0.45))
  assert.equal(p.barStops.length, 3)
  assert.deepEqual([p.barStops[0].r, p.barStops[0].g, p.barStops[0].b], deep)      // bottom = deep
  assert.deepEqual([p.barStops[2].r, p.barStops[2].g, p.barStops[2].b], p.bright)  // top = bright
  assert.deepEqual([p.ringStops[2].r, p.ringStops[2].g, p.ringStops[2].b], accent2) // ring tip = accent2
  assert.deepEqual([p.barStops.map((s) => s.at)], [[0, 0.55, 1]])
})

test('DEFAULT_PALETTE: the mainframe colors', () => {
  assert.deepEqual(DEFAULT_PALETTE.accent, [0, 255, 136])
  assert.deepEqual(DEFAULT_PALETTE.accent2, [0, 229, 255])
  assert.deepEqual(DEFAULT_PALETTE.accentDeep, [31, 94, 58])
})

test('lerpStops: endpoints, interpolation, alpha — and never an empty channel', () => {
  const p = DEFAULT_PALETTE
  // Below/at first stop → first color.
  assert.equal(lerpStops(p.barStops, 0), 'rgba(31,94,58,1)')
  assert.equal(lerpStops(p.barStops, -1), 'rgba(31,94,58,1)')
  // At/above last stop → last color, with alpha honored.
  assert.equal(lerpStops(p.barStops, 1, 0.5), `rgba(${p.bright[0]},${p.bright[1]},${p.bright[2]},0.5)`)
  assert.equal(lerpStops(p.barStops, 2), `rgba(${p.bright[0]},${p.bright[1]},${p.bright[2]},1)`)
  // Exactly the middle stop (0.55) → accent.
  assert.equal(lerpStops(p.barStops, 0.55), 'rgba(0,255,136,1)')
  // Interpolated value is a valid rgba() with integer channels (no NaN / empty).
  const mid = lerpStops(p.barStops, 0.3)
  assert.match(mid, /^rgba\(\d+,\d+,\d+,1\)$/)
})
