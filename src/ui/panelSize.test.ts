import { afterEach, describe, expect, it, vi } from 'vitest';

import { clampPanelSize, readPanelSize } from './panelSize';
import { clampPaneHeight, PANE_MAX_PX, PANE_MAX_VIEWPORT_FRACTION, PANE_MIN_PX } from './ResizablePane';

describe('how tall a stacked pane is allowed to be', () => {
  it('keeps a dragged height between the floor and the ceiling', () => {
    expect(clampPaneHeight(400, 1200)).toBe(400);
    expect(clampPaneHeight(10, 1200)).toBe(PANE_MIN_PX);
    expect(clampPaneHeight(5000, 2000)).toBe(PANE_MAX_PX);
  });

  /** The results table must not crowd out the graph it reports on. */
  it('never lets the pane take more than its share of a short window', () => {
    const laptop = 800;
    expect(clampPaneHeight(PANE_MAX_PX, laptop)).toBe(
      Math.round(laptop * PANE_MAX_VIEWPORT_FRACTION),
    );
    expect(clampPaneHeight(PANE_MAX_PX, laptop)).toBeLessThan(PANE_MAX_PX);
  });

  it('falls back to the floor rather than propagating a bad number', () => {
    expect(clampPaneHeight(Number.NaN, 1200)).toBe(PANE_MIN_PX);
  });
});

describe('the shared clamp', () => {
  it('honours the floor even when the viewport fraction falls below it', () => {
    expect(clampPanelSize(400, { min: 240, max: 760, viewport: 300, fraction: 0.6 })).toBe(240);
  });
});

describe('what a panel remembers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function withStorage(value: string | null) {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => value, setItem: () => undefined },
    });
  }

  it('reads back a size and a collapsed state it wrote', () => {
    withStorage(JSON.stringify({ size: 420, collapsed: true }));
    expect(readPanelSize('k', 320)).toEqual({ size: 420, collapsed: true });
  });

  /**
   * The side panels shipped first and wrote `width`. Reading that back as a
   * size means an engineer who had already sized Screen 06 keeps it.
   */
  it('accepts the width the side panels wrote before the shape was shared', () => {
    withStorage(JSON.stringify({ width: 469, collapsed: false }));
    expect(readPanelSize('k', 304)).toEqual({ size: 469, collapsed: false });
  });

  it('uses the default when nothing was ever saved', () => {
    withStorage(null);
    expect(readPanelSize('k', 320)).toEqual({ size: 320, collapsed: false });
  });

  it('ignores a stored entry that is not a size', () => {
    withStorage('{"size":"tall"}');
    expect(readPanelSize('k', 320)).toEqual({ size: 320, collapsed: false });

    withStorage('not json at all');
    expect(readPanelSize('k', 320)).toEqual({ size: 320, collapsed: false });
  });
});
