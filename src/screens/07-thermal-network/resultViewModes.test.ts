/**
 * The result views a solved graph offers outside 07's workshop.
 *
 * Only the views that colour by a solved number — the combined Temperature +
 * ΔT, Heat Flow and Rth — and never the two input-only ones: Node Type and Rth
 * Source say how the model was BUILT, which is 04/05's question.
 *
 * It is the same list Screens 08 and 12 read, which is the point: one answer to
 * "which views does this tool have", so the same network cannot say different
 * things depending on which screen you are standing on. (It began as the test
 * for 09's network window; 09 is part of 07 now, 07 §59.)
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
