/**
 * Which way the arrow points, and what the number beside it says.
 *
 * Two faults, one cause. 07 §22 asks the arrow to show where the heat actually
 * goes, but only Heat Flow read `actual_direction`; every other mode drew the
 * arrow along the edge's stored from→to and left the sign of the number to
 * carry the direction instead. So a ΔT label read `+7.6 °C` on an arrow that
 * might be pointing the wrong way, and `+` invites the reading "add 7.6 going
 * downstream" when the truth is the opposite: the upstream end is 7.6 hotter.
 *
 * Fixed together, because neither half is safe alone — an unsigned number on a
 * wrong arrow is worse than a signed one.
 */

import { describe, expect, it } from 'vitest';

import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { buildElements, legendFor } from './SolvedGraphCanvas';
import { buildScale, temperatureDrop, type ResultMode } from './resultViewModel';

const EDGE = 'EDGE_A_B';
const DISPLAY = { showLabels: true, showPower: true, showLimits: false, showBoundary: true };
const MODES: ResultMode[] = ['temperature', 'heat_flow', 'delta_t', 'rth', 'rth_source', 'node_type'];

/** Two nodes, one edge — the smallest graph that can point an arrow. */
function network(): ThermalNetwork {
  const node = (id: string) => ({
    id,
    name: id,
    type: 'custom',
    power_W: 0,
    limit_C: null,
    component_ref: null,
    disabled: false,
  });
  return {
    nodes: { A: node('A'), B: node('B') },
    edges: {
      [EDGE]: {
        id: EDGE,
        from: 'A',
        to: 'B',
        enabled: true,
        rth: { analytical: 0.5, active_source: 'Analytical', provenance: {} },
      },
    },
    templates: {},
    layout: { positions: { A: { x: 0, y: 0 }, B: { x: 0, y: 120 } } },
  } as unknown as ThermalNetwork;
}

function solution(direction: 'forward' | 'reverse', deltaT: number): ThermalSolution {
  return {
    node_temperatures_C: { A: 60, B: 52.4 },
    edge_results: {
      [EDGE]: {
        edge_id: EDGE,
        from: 'A',
        to: 'B',
        heat_flow_W: direction === 'forward' ? 15.2 : -15.2,
        delta_T_C: deltaT,
        actual_direction: direction,
        active_rth_C_per_W: 0.5,
        active_rth_source: 'Analytical',
        rth_origin: 'edge',
      },
    },
  } as unknown as ThermalSolution;
}

const SCALES = {
  temperature: buildScale([52.4, 60]),
  delta: buildScale([7.6]),
  rth: buildScale([0.5]),
  maxFlow: 15.2,
};

function edgeData(mode: ResultMode, solved: ThermalSolution | null) {
  const elements = buildElements(
    network(),
    solved,
    mode,
    DISPLAY,
    'SCN_001',
    'TopBottom',
    SCALES,
    new Set<string>(),
  );
  return elements.find((element) => element.data.id === EDGE)!.data as Record<string, unknown>;
}

describe('the arrow follows the solved heat direction', () => {
  it('points at the target when the heat runs the stored way — in every mode', () => {
    for (const mode of MODES) {
      const data = edgeData(mode, solution('forward', 7.6));
      expect(data.tgtArrow, mode).toBe('triangle');
      expect(data.srcArrow, mode).toBe('none');
    }
  });

  /** The regression: only Heat Flow used to turn round. */
  it('turns round on a reverse solve — in every mode, not just Heat Flow', () => {
    for (const mode of MODES) {
      const data = edgeData(mode, solution('reverse', -7.6));
      expect(data.srcArrow, mode).toBe('triangle');
      expect(data.tgtArrow, mode).toBe('none');
    }
  });

  /** No solve, no claim: the arrow falls back to the edge as it was drawn. */
  it('keeps the stored direction when nothing has been solved', () => {
    const data = edgeData('rth', null);
    expect(data.tgtArrow).toBe('triangle');
    expect(data.srcArrow).toBe('none');
  });
});

describe('ΔT is written as the fall it is', () => {
  it('labels the drop with ↓ and no sign', () => {
    expect(edgeData('delta_t', solution('forward', 7.6)).label).toBe('↓7.6 °C');
  });

  /**
   * A reverse solve gives a negative ΔT. The magnitude is unchanged — the fall
   * is the same 7.6 °C — and the arrow, now turned round, says which way.
   */
  it('shows the same magnitude when the heat runs the other way', () => {
    const data = edgeData('delta_t', solution('reverse', -7.6));
    expect(data.label).toBe('↓7.6 °C');
    expect(data.srcArrow).toBe('triangle');
  });

  it('says N/A rather than ↓0.0 when there is no value', () => {
    expect(temperatureDrop(null)).toBe('N/A');
    expect(temperatureDrop(Number.NaN)).toBe('N/A');
  });

  /** The legend has to explain the mark, and no longer promise a sign. */
  it('keys ↓ in the ΔT legend', () => {
    const rows = legendFor('delta_t', solution('forward', 7.6));
    expect(rows.some((row) => row.label.includes('↓'))).toBe(true);
    expect(rows.some((row) => row.zh.includes('正負號'))).toBe(false);
  });
});
