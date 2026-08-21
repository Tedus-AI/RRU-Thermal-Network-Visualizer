import { describe, expect, it } from 'vitest';

import { clampRect, MIN_H, MIN_W } from './FloatingPanel';

/**
 * The panel remembers where it was left. A position saved on a 27" monitor and
 * restored on a laptop must not put the title bar — the only way to drag it
 * back — outside the window.
 */
describe('clampRect', () => {
  it('leaves a comfortable position alone', () => {
    const rect = { x: 900, y: 100, w: 420, h: 600 };
    expect(clampRect(rect, 1920, 1080)).toEqual(rect);
  });

  it('pulls a panel back when the viewport shrinks under it', () => {
    const saved = { x: 2200, y: 1300, w: 420, h: 600 };
    const clamped = clampRect(saved, 1280, 800);
    expect(clamped.x).toBeLessThanOrEqual(1280);
    expect(clamped.y).toBeLessThanOrEqual(800);
  });

  it('always keeps part of the header on screen, from either edge', () => {
    const offRight = clampRect({ x: 5000, y: 10, w: 420, h: 600 }, 1280, 800);
    expect(offRight.x).toBeLessThan(1280);

    // Dragged off the left, enough must remain to grab it by.
    const offLeft = clampRect({ x: -5000, y: 10, w: 420, h: 600 }, 1280, 800);
    expect(offLeft.x + offLeft.w).toBeGreaterThan(0);
  });

  it('never lets the header be dragged above the top of the window', () => {
    expect(clampRect({ x: 100, y: -400, w: 420, h: 600 }, 1280, 800).y).toBe(0);
  });

  it('refuses a size too small to hold a form', () => {
    const tiny = clampRect({ x: 10, y: 10, w: 20, h: 20 }, 1280, 800);
    expect(tiny.w).toBe(MIN_W);
    expect(tiny.h).toBe(MIN_H);
  });

  it('caps a size larger than the window', () => {
    const huge = clampRect({ x: 0, y: 0, w: 9000, h: 9000 }, 1280, 800);
    expect(huge.w).toBe(1280);
    expect(huge.h).toBe(800);
  });

  // A window narrower than the minimum is real (a phone, a split view); the
  // clamp must still return something usable rather than an inverted range.
  it('survives a viewport smaller than the minimum size', () => {
    const rect = clampRect({ x: 0, y: 0, w: 420, h: 600 }, 200, 200);
    expect(rect.w).toBe(MIN_W);
    expect(rect.h).toBe(MIN_H);
    expect(Number.isFinite(rect.x)).toBe(true);
    expect(Number.isFinite(rect.y)).toBe(true);
  });
});
