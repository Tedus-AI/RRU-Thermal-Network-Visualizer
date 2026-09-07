/**
 * Temperature + ΔT in one view — Screen 08's default mode.
 *
 * The claim it makes is that BOTH colourings are on at once: nodes off the
 * temperature ramp, edges off the ΔT ramp. Either half missing and the reader
 * is looking at a picture that answers half the question while looking like it
 * answers all of it, so both are asserted here against the single-purpose modes
 * they are built from — the node styling must match Temperature exactly, and
 * the edge styling must match ΔT exactly.
 */

import { describe, expect, it } from 'vitest';

import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { buildElements, legendFor } from './SolvedGraphCanvas';
import {
  ANALYSIS_RESULT_MODES,
  COMBINED_MODE,
  RESULT_MODES,
  buildScale,
  isResultMode,
  modeFilenamePart,
  paintsEdgeDelta,
  paintsNodeTemperature,
  type ResultMode,
} from './resultViewModel';

const EDGE = 'EDGE_A_B';
const DISPLAY = { showLabels: true, showPower: false, showLimits: false, showBoundary: true };

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

const solution = {
  node_temperatures_C: { A: 60, B: 52.4 },
  edge_results: {
    [EDGE]: {
      edge_id: EDGE,
      from: 'A',
      to: 'B',
      heat_flow_W: 15.2,
      delta_T_C: 7.6,
      actual_direction: 'forward',
      active_rth_C_per_W: 0.5,
      active_rth_source: 'Analytical',
      rth_origin: 'edge',
    },
  },
} as unknown as ThermalSolution;

const SCALES = {
  temperature: buildScale([52.4, 60]),
  delta: buildScale([7.6]),
  rth: buildScale([0.5]),
  maxFlow: 15.2,
};

function elementsFor(mode: ResultMode) {
  const elements = buildElements(
    network(),
    solution,
    mode,
    DISPLAY,
    'SCN_001',
    'TopBottom',
    SCALES,
    new Set<string>(),
  );
  const find = (id: string) =>
    elements.find((element) => element.data.id === id)!.data as Record<string, unknown>;
  return { node: find('A'), edge: find(EDGE) };
}

describe('the combined Temperature + ΔT mode', () => {
  it('paints nodes exactly as Temperature does', () => {
    const combined = elementsFor(COMBINED_MODE.id);
    const temperature = elementsFor('temperature');
    expect(combined.node.fill).toBe(temperature.node.fill);
    expect(combined.node.textColor).toBe(temperature.node.textColor);
    expect(combined.node.label).toBe(temperature.node.label);
    expect(String(combined.node.label)).toContain('60.0 °C');
  });

  it('paints edges exactly as ΔT does', () => {
    const combined = elementsFor(COMBINED_MODE.id);
    const delta = elementsFor('delta_t');
    expect(combined.edge.color).toBe(delta.edge.color);
    expect(combined.edge.label).toBe(delta.edge.label);
    expect(combined.edge.label).toBe('ΔT 7.6 °C');
  });

  /** The regression it guards: ΔT alone leaves the nodes uncoloured. */
  it('differs from ΔT on the node and from Temperature on the edge', () => {
    const combined = elementsFor(COMBINED_MODE.id);
    expect(combined.node.fill).not.toBe(elementsFor('delta_t').node.fill);
    expect(combined.edge.color).not.toBe(elementsFor('temperature').edge.color);
  });

  it('names both ramps in the legend, so neither is read as the other', () => {
    const rows = legendFor(COMBINED_MODE.id, solution);
    expect(rows.some((row) => row.label.startsWith('Node '))).toBe(true);
    expect(rows.some((row) => row.zh.includes('連線溫差'))).toBe(true);
  });

  it('is a mode the predicates and the persistence guard both recognise', () => {
    expect(paintsNodeTemperature(COMBINED_MODE.id)).toBe(true);
    expect(paintsEdgeDelta(COMBINED_MODE.id)).toBe(true);
    expect(isResultMode(COMBINED_MODE.id)).toBe(true);
    expect(modeFilenamePart(COMBINED_MODE.id)).toBe('TemperatureDeltaT');
  });
});

describe("Screen 08's mode list", () => {
  it('offers the combined view, Heat Flow and Rth — and nothing input-only', () => {
    expect(ANALYSIS_RESULT_MODES.map((entry) => entry.id)).toEqual([
      COMBINED_MODE.id,
      'heat_flow',
      'rth',
    ]);
  });

  /** 07's own toolbar is untouched: the combined mode belongs to 08. */
  it('leaves Screen 07 the six modes it had', () => {
    expect(RESULT_MODES.map((entry) => entry.id)).toEqual([
      'temperature',
      'heat_flow',
      'delta_t',
      'rth',
      'node_type',
      'rth_source',
    ]);
  });
});
