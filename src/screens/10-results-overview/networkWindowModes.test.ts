/**
 * The metric switch Screen 10's network window offers.
 *
 * The window used to be locked to Temperature. It now carries the four result
 * views, and must not quietly grow the two input-only ones back: Node Type and
 * Rth Source say how the model was BUILT, which is 04/05/06's question, not a
 * question anyone opens the overview to ask.
 */

import { describe, expect, it } from 'vitest';

import {
  OVERVIEW_RESULT_MODES,
  RESULT_MODES,
} from '@/screens/07-thermal-network/resultViewModel';

describe('OVERVIEW_RESULT_MODES', () => {
  it('offers exactly the four result views', () => {
    expect(OVERVIEW_RESULT_MODES.map((mode) => mode.id)).toEqual([
      'temperature',
      'heat_flow',
      'delta_t',
      'rth',
    ]);
  });

  it('leaves out the input-only views', () => {
    const ids = new Set<string>(OVERVIEW_RESULT_MODES.map((mode) => mode.id));
    expect(ids.has('node_type')).toBe(false);
    expect(ids.has('rth_source')).toBe(false);
  });

  it('shares Screen 07 entries rather than restating them', () => {
    for (const mode of OVERVIEW_RESULT_MODES) {
      expect(RESULT_MODES).toContain(mode);
    }
  });
});
