import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clampColumnWidth,
  COLUMN_MAX_PX,
  COLUMN_MIN_PX,
  readColumnWidths,
} from './columnWidths';

const DEFAULTS = { on: 56, component: 210, qty: 64 };

describe('how wide a column may be dragged', () => {
  it('keeps a width between the floor and the ceiling', () => {
    expect(clampColumnWidth(180)).toBe(180);
    expect(clampColumnWidth(2)).toBe(COLUMN_MIN_PX);
    expect(clampColumnWidth(5000)).toBe(COLUMN_MAX_PX);
  });

  it('falls back to the floor rather than propagating a bad number', () => {
    expect(clampColumnWidth(Number.NaN)).toBe(COLUMN_MIN_PX);
  });
});

describe('what the table remembers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function withStorage(value: string | null) {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => value, setItem: () => undefined },
    });
  }

  it('reads back the widths it wrote', () => {
    withStorage(JSON.stringify({ component: 320 }));
    expect(readColumnWidths('k', DEFAULTS)).toEqual({ ...DEFAULTS, component: 320 });
  });

  /**
   * Adding a column must not leave it at zero for everyone who had already
   * dragged another one, so defaults fill any gap rather than the stored entry
   * replacing them wholesale.
   */
  it('keeps the default for a column the stored entry never mentions', () => {
    withStorage(JSON.stringify({ component: 320 }));
    expect(readColumnWidths('k', DEFAULTS).qty).toBe(DEFAULTS.qty);
  });

  /** A renamed column must not widen the table by a phantom. */
  it('ignores a stored column the table no longer has', () => {
    withStorage(JSON.stringify({ component: 320, retired_column: 400 }));
    expect(readColumnWidths('k', DEFAULTS)).toEqual({ ...DEFAULTS, component: 320 });
  });

  it('clamps a stored width that is out of range', () => {
    withStorage(JSON.stringify({ component: 9999 }));
    expect(readColumnWidths('k', DEFAULTS).component).toBe(COLUMN_MAX_PX);
  });

  it('uses the defaults when nothing was saved, or the entry is unreadable', () => {
    withStorage(null);
    expect(readColumnWidths('k', DEFAULTS)).toEqual(DEFAULTS);

    withStorage('not json');
    expect(readColumnWidths('k', DEFAULTS)).toEqual(DEFAULTS);

    withStorage('[1,2,3]');
    expect(readColumnWidths('k', DEFAULTS)).toEqual(DEFAULTS);
  });
});
