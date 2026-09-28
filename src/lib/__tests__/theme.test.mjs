// Unit tests for theme.ts — pure helpers only (no DOM). Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  THEMES, DEFAULT_THEME_ID, getTheme, isKnownThemeId, resolveCrtOff,
  UI_SCALES, DEFAULT_UI_SCALE_ID, getUiScale, isKnownUiScaleId,
} from '../theme.ts'

test('THEMES: ids are unique and the default exists', () => {
  const ids = THEMES.map((t) => t.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate theme id')
  assert.ok(ids.includes(DEFAULT_THEME_ID), 'default theme id missing from THEMES')
})

test('THEMES: every theme has a name, blurb, and 3 valid hex swatch colors', () => {
  const hex = /^#[0-9a-fA-F]{6}$/
  for (const t of THEMES) {
    assert.ok(t.name && t.blurb, `${t.id} missing name/blurb`)
    for (const k of ['bg', 'accent', 'ink']) {
      assert.match(t.swatch[k], hex, `${t.id}.swatch.${k} is not a 6-digit hex`)
    }
  }
})

test('getTheme: resolves known ids, falls back to default for unknown/missing', () => {
  assert.equal(getTheme('amber').id, 'amber')
  assert.equal(getTheme('does-not-exist').id, THEMES[0].id)
  assert.equal(getTheme(null).id, THEMES[0].id)
  assert.equal(getTheme(undefined).id, THEMES[0].id)
})

test('isKnownThemeId: only true for real ids', () => {
  assert.equal(isKnownThemeId('synthwave'), true)
  assert.equal(isKnownThemeId('nope'), false)
  assert.equal(isKnownThemeId(42), false)
  assert.equal(isKnownThemeId(undefined), false)
})

test('resolveCrtOff: mirrors the manual preference', () => {
  const t = THEMES[0]
  assert.equal(resolveCrtOff(t, true), true)
  assert.equal(resolveCrtOff(t, false), false)
})

test('UI_SCALES: unique ids, ascending factors within 1–2, default present at 1', () => {
  const ids = UI_SCALES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate ui scale id')
  assert.equal(getUiScale(DEFAULT_UI_SCALE_ID).factor, 1)
  assert.equal(UI_SCALES[0].id, DEFAULT_UI_SCALE_ID, 'default must be the fallback (first) preset')
  for (let i = 0; i < UI_SCALES.length; i++) {
    const f = UI_SCALES[i].factor
    assert.ok(f >= 1 && f <= 2, `${UI_SCALES[i].id} factor ${f} outside 1–2 (main rejects it)`)
    if (i > 0) assert.ok(f > UI_SCALES[i - 1].factor, `${UI_SCALES[i].id} is not larger than the one before`)
    assert.ok(UI_SCALES[i].label, `${UI_SCALES[i].id} missing label`)
  }
})

test('getUiScale / isKnownUiScaleId: unknown, missing and non-string ids fall back to default', () => {
  assert.equal(getUiScale('largest').factor, 1.5)
  for (const junk of ['nope', '', null, undefined, 1.3, {}]) {
    assert.equal(getUiScale(junk).id, DEFAULT_UI_SCALE_ID)
    assert.equal(isKnownUiScaleId(junk), false)
  }
  assert.equal(isKnownUiScaleId('larger'), true)
})
