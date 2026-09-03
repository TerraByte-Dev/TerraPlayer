import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampWindow, defaultPosition, windowSize,
  TITLEBAR_H, GRAB_MARGIN, BOTTOM_MARGIN, PREFERRED_W, PREFERRED_H, MIN_H,
} from '../arcade-window.ts'

const W = 560
const H = 620
const VW = 1280
const VH = 800

test('a position that fully fits is left alone', () => {
  // 620 tall on an 800 viewport leaves 180px of vertical room, so y=120 fits and y=200 does not.
  assert.deepEqual(clampWindow(300, 120, W, H, VW, VH), { x: 300, y: 120 })
  assert.equal(clampWindow(300, 200, W, H, VW, VH).y, VH - H)
})

test('the marquee can never slide under the title bar', () => {
  assert.equal(clampWindow(300, 0, W, H, VW, VH).y, TITLEBAR_H)
  assert.equal(clampWindow(300, -500, W, H, VW, VH).y, TITLEBAR_H)
  assert.equal(clampWindow(300, TITLEBAR_H - 1, W, H, VW, VH).y, TITLEBAR_H)
})

test('the whole cabinet stays on screen, deck included', () => {
  // Not just the marquee: the deck at the bottom carries the transport, and a cabinet whose
  // controls hang off the bottom cannot be rescued by dragging — dragging only moves it down.
  const p = clampWindow(300, 99999, W, H, VW, VH)
  assert.ok(p.y + H <= VH, `bottom ${p.y + H} past viewport ${VH}`)
  assert.equal(p.y, Math.min(VH - BOTTOM_MARGIN, VH - H))
})

test('a grabbable run of marquee always stays on screen horizontally', () => {
  // dragged far left: enough of the window remains to grab
  const left = clampWindow(-99999, 200, W, H, VW, VH)
  assert.equal(left.x, GRAB_MARGIN - W)
  assert.ok(left.x + W >= GRAB_MARGIN, 'nothing left to grab on the left edge')
  // dragged far right
  const right = clampWindow(99999, 200, W, H, VW, VH)
  assert.equal(right.x, VW - GRAB_MARGIN)
  assert.ok(right.x <= VW - GRAB_MARGIN, 'nothing left to grab on the right edge')
})

test('a window wider than the viewport still leaves a grab handle', () => {
  const p = clampWindow(-4000, 200, 2000, 400, 600, VH)
  assert.ok(p.x + 2000 >= 0, 'window pushed entirely off screen')
  assert.ok(Number.isFinite(p.x))
})

test('a viewport shorter than the title bar still yields a reachable marquee', () => {
  // A tiny/at-restore-time viewport must not produce maxY < TITLEBAR_H and invert the clamp.
  const p = clampWindow(100, 500, W, H, 400, 60)
  assert.equal(p.y, TITLEBAR_H)
  assert.ok(p.y >= TITLEBAR_H)
})

test('garbage coordinates resolve to something reachable instead of NaN', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const p = clampWindow(bad, bad, W, H, VW, VH)
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${bad} produced ${JSON.stringify(p)}`)
    assert.ok(p.y >= TITLEBAR_H)
  }
})

test('the default position is centred, lifted, and already clamped', () => {
  const p = defaultPosition(W, 600, VW, VH)
  assert.equal(p.x, Math.round((VW - W) / 2))
  assert.ok(p.y >= TITLEBAR_H)
  assert.ok(p.y <= VH - BOTTOM_MARGIN)
})

test('the default position stays reachable on a small viewport', () => {
  const p = defaultPosition(W, 600, 420, 300)
  assert.ok(p.y >= TITLEBAR_H)
  assert.ok(p.x + W >= GRAB_MARGIN)
  assert.ok(p.x <= 420 - Math.min(GRAB_MARGIN, W))
})

test('clamping is idempotent — restoring a clamped position never moves it again', () => {
  for (const [x, y] of [[-9999, -9999], [9999, 9999], [0, 0], [640, 400]]) {
    const once = clampWindow(x, y, W, H, VW, VH)
    const twice = clampWindow(once.x, once.y, W, H, VW, VH)
    assert.deepEqual(twice, once)
  }
})

// --- windowSize --------------------------------------------------------------

test('the cabinet takes its preferred size on a roomy viewport', () => {
  assert.deepEqual(windowSize(1920, 1080), { width: PREFERRED_W, height: PREFERRED_H })
})

test('the cabinet shrinks to fit a short viewport instead of hanging off it', () => {
  // The regression: a fixed 620px-tall window on a 600px viewport put the deck — and every
  // music control on it — permanently off screen.
  const s = windowSize(1280, 600)
  assert.ok(s.height <= 600 - TITLEBAR_H, `height ${s.height} does not fit`)
  assert.ok(s.height >= MIN_H)
})

test('a shrunk cabinet is still fully placeable', () => {
  for (const [vw, vh] of [[1280, 600], [900, 500], [640, 420], [1920, 1080]]) {
    const s = windowSize(vw, vh)
    const p = clampWindow(99999, 99999, s.width, s.height, vw, vh)
    assert.ok(p.y >= TITLEBAR_H, `${vw}x${vh}: marquee above the title bar`)
    assert.ok(p.y + s.height <= vh || s.height >= vh - TITLEBAR_H, `${vw}x${vh}: deck off screen`)
    assert.ok(p.x + s.width >= Math.min(GRAB_MARGIN, s.width), `${vw}x${vh}: nothing to grab`)
  }
})

test('the cabinet never shrinks below its floor even on a tiny viewport', () => {
  const s = windowSize(200, 200)
  assert.ok(s.height >= MIN_H)
  assert.ok(s.width >= 380)
})
