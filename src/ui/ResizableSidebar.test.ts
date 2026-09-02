import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clampSidebarWidth,
  readSidebarState,
  SIDEBAR_MAX_PX,
  SIDEBAR_MAX_VIEWPORT_FRACTION,
  SIDEBAR_MIN_PX,
} from './ResizableSidebar';

describe('how wide the sidebar is allowed to be', () => {
  it('keeps a dragged width between the floor and the ceiling', () => {
    expect(clampSidebarWidth(400, 1920)).toBe(400);
    expect(clampSidebarWidth(10, 1920)).toBe(SIDEBAR_MIN_PX);
    expect(clampSidebarWidth(5000, 1920)).toBe(SIDEBAR_MAX_PX);
  });

  /**
   * The panel exists to annotate the graph beside it. A width chosen on a 27"
   * monitor and reopened on a laptop would otherwise leave nothing to annotate.
   */
  it('never lets the panel take more than its share of a narrow window', () => {
    const laptop = 1024;
    expect(clampSidebarWidth(SIDEBAR_MAX_PX, laptop)).toBe(
      Math.round(laptop * SIDEBAR_MAX_VIEWPORT_FRACTION),
    );
    expect(clampSidebarWidth(SIDEBAR_MAX_PX, laptop)).toBeLessThan(SIDEBAR_MAX_PX);
  });

  it('still honours the floor on a window too small for it', () => {
    // 60% of 300 is below the minimum; a panel narrower than that is unusable,
    // and at this width the layout has already stacked anyway.
    expect(clampSidebarWidth(400, 300)).toBe(SIDEBAR_MIN_PX);
  });

  it('falls back to the floor rather than propagating a bad number', () => {
    expect(clampSidebarWidth(Number.NaN, 1920)).toBe(SIDEBAR_MIN_PX);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY, 1920)).toBe(SIDEBAR_MIN_PX);
  });
});

describe('what the sidebar remembers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function withStorage(value: string | null) {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => value,
        setItem: () => undefined,
      },
    });
  }

  it('reads back a width and a collapsed state it wrote', () => {
    withStorage(JSON.stringify({ width: 420, collapsed: true }));
    expect(readSidebarState('k', 304)).toEqual({ width: 420, collapsed: true });
  });

  it('uses the screen default when nothing was ever saved', () => {
    withStorage(null);
    expect(readSidebarState('k', 469)).toEqual({ width: 469, collapsed: false });
  });

  /** A half-written or hand-edited entry must not leave the panel unusable. */
  it('ignores a stored entry that is not a width', () => {
    withStorage('{"width":"wide"}');
    expect(readSidebarState('k', 304)).toEqual({ width: 304, collapsed: false });

    withStorage('not json at all');
    expect(readSidebarState('k', 304)).toEqual({ width: 304, collapsed: false });
  });

  it('treats a missing collapsed flag as expanded', () => {
    withStorage(JSON.stringify({ width: 360 }));
    expect(readSidebarState('k', 304)).toEqual({ width: 360, collapsed: false });
  });
});
