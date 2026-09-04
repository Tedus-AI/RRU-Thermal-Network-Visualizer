/**
 * Screen 07's toolbar has to remember how the engineer chose to read the graph.
 *
 * Which result colours it, which labels are on, how it is laid out — every one
 * of those reset to its default on mount, so stepping to Screen 08 to check a
 * number and coming back meant re-choosing ΔT, re-ticking Limits and re-picking
 * the layout. Every single time.
 *
 * The risk in remembering is the other half: what comes back was written by a
 * PREVIOUS build. A mode or layout that has since been renamed would fall
 * through every branch of the canvas's switch and paint an uncoloured graph
 * from a toolbar showing nothing selected — worse than forgetting. So each
 * value is validated on the way in.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isLayoutMode, LAYOUT_MODES } from '@/screens/05-thermal-path-builder/GraphToolbar';
import { readRememberedFlag, writeRememberedFlag } from '@/ui/rememberedFlag';

import { isDisplayOptions } from './SolvedGraphCanvas';
import { isResultMode, RESULT_MODES } from './resultViewModel';

const store = new Map<string, string>();

// `rememberedFlag` reads `window.localStorage`, so `window` is what has to be
// stubbed — a bare `localStorage` global leaves it reading nothing and the
// helper's own try/catch swallows it, which would make this pass vacuously.
beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
});

describe('what may be restored as a result mode', () => {
  it('accepts every mode this build offers', () => {
    for (const mode of RESULT_MODES) {
      expect(isResultMode(mode.id), mode.id).toBe(true);
    }
  });

  /** A mode an older build wrote, and this one no longer has. */
  it('rejects a mode that no longer exists', () => {
    expect(isResultMode('hierarchical')).toBe(false);
    expect(isResultMode('')).toBe(false);
  });

  it('rejects anything that is not a mode at all', () => {
    for (const value of [null, undefined, 0, {}, [], true]) {
      expect(isResultMode(value)).toBe(false);
    }
  });
});

describe('what may be restored as a layout', () => {
  it('accepts every layout this build offers', () => {
    for (const layout of LAYOUT_MODES) {
      expect(isLayoutMode(layout.value), layout.value).toBe(true);
    }
  });

  /**
   * `Hierarchical` is the real case: it was offered, then removed. Restoring it
   * would ask Dagre for a layout name it does not have.
   */
  it('rejects a layout that has been removed', () => {
    expect(isLayoutMode('Hierarchical')).toBe(false);
    expect(isLayoutMode(null)).toBe(false);
  });
});

describe('what may be restored as display options', () => {
  it('accepts a complete set', () => {
    expect(
      isDisplayOptions({
        showLabels: true,
        showPower: true,
        showLimits: false,
        showBoundary: true,
      }),
    ).toBe(true);
  });

  /**
   * Every flag is checked, not just the shape. A partial object leaves one
   * `undefined`, which reads as false — so a label the engineer had left ON
   * would come back off with nothing on screen to say why.
   */
  it('rejects a set missing a flag', () => {
    expect(isDisplayOptions({ showLabels: true, showPower: true, showLimits: false })).toBe(
      false,
    );
  });

  it('rejects a flag that is not a boolean', () => {
    expect(
      isDisplayOptions({
        showLabels: 'yes',
        showPower: true,
        showLimits: false,
        showBoundary: true,
      }),
    ).toBe(false);
  });

  it('rejects anything that is not an object', () => {
    for (const value of [null, undefined, 'true', 1, []]) {
      expect(isDisplayOptions(value)).toBe(false);
    }
  });
});

/**
 * The `tnvui.` namespace, not `tnv.`.
 *
 * `syncBuildStamp` clears every `tnv.` key when the build changes, because
 * project data written against an older schema cannot be trusted. How someone
 * chose to read a graph has no schema, and clearing it on every deploy would
 * put the reset back exactly where it started.
 */
describe('where the choice is kept', () => {
  it('stores under tnvui., which a build change does not clear', () => {
    writeRememberedFlag('07.legend', true);

    expect([...store.keys()]).toEqual(['tnvui.flag.07.legend']);
    expect(readRememberedFlag('07.legend', false)).toBe(true);
  });
});
