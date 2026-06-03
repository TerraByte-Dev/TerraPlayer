// Unit tests for theme.ts — pure helpers only (no DOM). Run via npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, DEFAULT_THEME_ID, getTheme, isKnownThemeId, resolveCrtOff } from '../theme.ts'

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
