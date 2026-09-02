/**
 * A remembered flag has to survive a build change, and survive a broken store.
 *
 * The `tnv.` namespace is cleared whenever the build stamp moves, because
 * project data written against an older schema cannot be trusted. A view
 * preference has no schema, so it lives under `tnvui.` with the panel sizes and
 * the column widths — the same reason, the same prefix.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PANEL_STORAGE_PREFIX } from './panelSize';
import { readRememberedFlag, writeRememberedFlag } from './rememberedFlag';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remembered view flags', () => {
  it('keeps the reader’s answer under the build-safe prefix', () => {
    writeRememberedFlag('07.legend', true);

    expect([...store.keys()]).toEqual([`${PANEL_STORAGE_PREFIX}flag.07.legend`]);
    expect(readRememberedFlag('07.legend', false)).toBe(true);
  });

  it('round-trips false, rather than reading it as "nothing stored"', () => {
    writeRememberedFlag('07.legend', false);

    // The bug this guards: treating a stored `false` as absent would make a
    // flag whose fallback is true impossible to switch off.
    expect(readRememberedFlag('07.legend', true)).toBe(false);
  });

  it('falls back when nothing was ever stored', () => {
    expect(readRememberedFlag('07.legend', false)).toBe(false);
    expect(readRememberedFlag('05.legend', true)).toBe(true);
  });

  it('falls back on a value it did not write', () => {
    store.set(`${PANEL_STORAGE_PREFIX}flag.07.legend`, 'yes please');

    expect(readRememberedFlag('07.legend', false)).toBe(false);
  });

  it('survives a store that throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
      },
    });

    expect(() => writeRememberedFlag('07.legend', true)).not.toThrow();
    expect(readRememberedFlag('07.legend', true)).toBe(true);
  });
});
