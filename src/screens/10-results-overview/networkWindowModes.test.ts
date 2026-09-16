/**
 * The metric switch Screen 10's network window offers.
 *
 * The window used to be locked to Temperature. It now carries the result views
 * — the combined Temperature + ΔT, Heat Flow and Rth — and must not quietly
 * grow the two input-only ones back: Node Type and Rth Source say how the model
 * was BUILT, which is 04/05/06's question, not a question anyone opens the
 * overview to ask.
 *
 * It is the same list Screens 08 and 12 read, which is the point: one answer to
 * "which views does this tool have", so the same network cannot say different
 * things depending on which screen you are standing on.
 */

import { describe, expect, it } from 'vitest';

import {
  COMBINED_MODE,
  RESULT_MODES,
  RESULT_VIEW_MODES,
} from '@/screens/07-thermal-network/resultViewModel';

describe('RESULT_VIEW_MODES', () => {
  it('offers exactly the three views that colour by a solved number', () => {
    expect(RESULT_VIEW_MODES.map((mode) => mode.id)).toEqual([
      COMBINED_MODE.id,
      'heat_flow',
      'rth',
    ]);
  });

  it('leaves out the input-only views', () => {
    const ids = new Set<string>(RESULT_VIEW_MODES.map((mode) => mode.id));
    expect(ids.has('node_type')).toBe(false);
    expect(ids.has('rth_source')).toBe(false);
  });

  it('shares Screen 07 entries rather than restating them', () => {
    for (const mode of RESULT_VIEW_MODES) {
      expect(RESULT_MODES).toContain(mode);
    }
  });
});
