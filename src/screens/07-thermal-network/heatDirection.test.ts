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

/**
 * The other half of the same report: Screen 07's braces.
 *
 * 05 and 07 draw the identical brace from the identical module, so what the
 * shared tests pin about 05 holds here too. What is 07's own is that the value
 * follows the result MODE, that its branches are named the way 05's are, and
 * that the numbers are the SOLVED ones — 07 re-solves a spreading edge at the
 * scenario's real Biot number, so its branch reads 0.322 where 05 reads ≥0.057.
 */
describe("Screen 07's brace over a parallel pair", () => {
  const SPREAD = 'EDGE_SPREAD';
  const PIPE = 'EDGE_PIPE';

  function pairNetwork(): ThermalNetwork {
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
      nodes: { TIM: node('TIM'), BASE: node('BASE') },
      edges: {
        [SPREAD]: {
          id: SPREAD,
          from: 'TIM',
          to: 'BASE',
          type: 'spreading',
          method: 'spreading_disc',
          enabled: true,
          parameters: {},
          rth: { analytical: 0.056823, active_source: 'Analytical', provenance: {} },
        },
        [PIPE]: {
          id: PIPE,
          from: 'TIM',
          to: 'BASE',
          type: 'heat_pipe',
          method: 'direct_rth',
          enabled: true,
          parameters: { pipes: 2 },
          rth: { analytical: 0.065, active_source: 'Analytical', provenance: {} },
        },
      },
      templates: {},
      layout: { positions: { TIM: { x: 0, y: 0 }, BASE: { x: 400, y: 0 } } },
    } as unknown as ThermalNetwork;
  }

  /** The real solve: the spreading edge re-solved at Bi = 0.106. */
  function pairSolution(): ThermalSolution {
    const result = (id: string, R: number, Q: number) => ({
      edge_id: id,
      from: 'TIM',
      to: 'BASE',
      heat_flow_W: Q,
      delta_T_C: 1.8931,
      actual_direction: 'forward',
      active_rth_C_per_W: R,
      active_rth_source: 'Analytical',
      rth_origin: id === SPREAD ? 'spreading_biot' : 'edge',
    });
    return {
      node_temperatures_C: { TIM: 88.98, BASE: 87.09 },
      edge_results: {
        [SPREAD]: result(SPREAD, 0.32220417417963326, 5.875453189057279),
        [PIPE]: result(PIPE, 0.065, 29.124546810942974),
      },
    } as unknown as ThermalSolution;
  }

  const build = (mode: ResultMode) =>
    buildElements(
      pairNetwork(),
      pairSolution(),
      mode,
      DISPLAY,
      'SCN_001',
      'TopBottom',
      { ...SCALES, rth: buildScale([0.065, 0.3222]), delta: buildScale([1.8931]), maxFlow: 29.12 },
      new Set<string>(),
    );

  const braceLabel = (mode: ResultMode) =>
    build(mode).find((element) => String(element.classes ?? '').includes('parallel-brace'))?.data
      .label;

  it('combines the SOLVED resistances, and names both branches', () => {
    // 1/(1/0.32220 + 1/0.065) = 0.054088 — not 0.030, which is the 05 floor.
    expect(braceLabel('rth')).toBe('Spreading ∥ Heat Pipe ×2\n∥ 0.054 °C/W');
  });

  it('adds the flows in Heat Flow, and says so in the connector', () => {
    expect(braceLabel('heat_flow')).toBe('Spreading + Heat Pipe ×2\n∑ 35.0 W');
  });

  it('names the one ΔT the pair shares', () => {
    expect(braceLabel('delta_t')).toBe('Spreading, Heat Pipe ×2\nshared ↓1.9 °C');
  });

  /** Nothing combinable, nothing to say — and no stray °C/W in a °C graph. */
  it('draws no brace where there is no combinable quantity', () => {
    for (const mode of ['temperature', 'node_type', 'rth_source'] as ResultMode[]) {
      expect(braceLabel(mode), mode).toBeUndefined();
    }
  });

  /**
   * The second half of the report: the branches themselves were two bare
   * numbers with nothing saying which was the pipe.
   */
  it('names each branch of the pair, as Screen 05 does', () => {
    const elements = build('rth');
    const labelOf = (id: string) =>
      elements.find((element) => element.data.id === id)!.data.label;

    // One line each, not the bar's two: a pair between two boxes has only the
    // gap between them to write in, and two stacked lines collided there.
    expect(labelOf(SPREAD)).toBe('Spreading 0.322 °C/W');
    expect(labelOf(PIPE)).toBe('Heat Pipe ×2 0.065 °C/W');
  });
});
