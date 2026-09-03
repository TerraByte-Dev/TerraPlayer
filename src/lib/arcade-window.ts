/**
 * Geometry for the floating arcade cabinet.
 *
 * The cabinet is dragged by its marquee — the strip across its top — and that strip is the
 * ONLY grab surface. So the clamp's real job is not "keep the window on screen", it is
 * "never let the marquee become unreachable": above the 30px custom title bar it slides
 * under Windows' native caption buttons, which the OS paints over web content, and past the
 * bottom edge there is nothing left to grab. Either one strands the window with no recovery
 * short of clearing localStorage. Horizontally the window may hang off an edge — a partly
 * offscreen cabinet is still draggable — as long as a usable run of marquee stays visible.
 */

/** Height of the app's custom title bar; the marquee can never go above it. */
export const TITLEBAR_H = 30
/** Marquee that must stay on screen for the window to remain draggable. */
export const GRAB_MARGIN = 140
/** Room kept below the marquee so it never hides behind the player bar. */
export const BOTTOM_MARGIN = 80

/** Cabinet size, and the floor it will not shrink past (below which the screen just scrolls). */
export const PREFERRED_W = 620
export const PREFERRED_H = 680
export const MIN_W = 380
export const MIN_H = 320

export interface Point {
  x: number
  y: number
}

export function clampWindow(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportW: number,
  viewportH: number
): Point {
  const grab = Math.min(GRAB_MARGIN, width)
  const minX = grab - width
  const maxX = viewportW - grab
  // Vertically the whole window is kept on screen, not just the marquee — the deck at its
  // bottom carries the transport, and a cabinet whose controls hang off the bottom edge can't
  // be fixed by dragging, because dragging can only ever move it further down.
  const maxY = Math.max(TITLEBAR_H, Math.min(viewportH - BOTTOM_MARGIN, viewportH - height))

  return {
    x: Math.round(clamp(x, Math.min(minX, maxX), Math.max(minX, maxX))),
    y: Math.round(clamp(y, TITLEBAR_H, maxY)),
  }
}

/**
 * The cabinet's size for a given viewport. Capped so the whole thing — marquee, screen and
 * deck — always fits between the title bar and the bottom of the window.
 */
export function windowSize(viewportW: number, viewportH: number): { width: number; height: number } {
  return {
    width: Math.max(MIN_W, Math.min(PREFERRED_W, viewportW - 32)),
    height: Math.max(MIN_H, Math.min(PREFERRED_H, viewportH - TITLEBAR_H - 24)),
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Where the cabinet sits the first time it is opened: centred horizontally, a little above
 * centre so the player bar and the deck don't collide.
 */
export function defaultPosition(width: number, height: number, viewportW: number, viewportH: number): Point {
  return clampWindow(
    Math.round((viewportW - width) / 2),
    Math.round((viewportH - height) / 2) - 24,
    width,
    height,
    viewportW,
    viewportH
  )
}
