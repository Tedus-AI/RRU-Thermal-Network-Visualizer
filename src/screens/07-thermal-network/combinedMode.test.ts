/**
 * Temperature + ΔT in one view — now the tool's only temperature view.
 *
 * The claim it makes is that BOTH colourings are on at once: nodes off the
 * temperature ramp, edges off the ΔT ramp. Either half missing and the reader
 * is looking at a picture that answers half the question while looking like it
 * answers all of it, so both halves are asserted here against the ramps they
 * are built from.
 *
 * It used to be asserted against the standalone Temperature and ΔT modes.
 * Those are gone — a ΔT is computed FROM temperatures, and splitting them over
 * two buttons made every reader hold one half in their head while looking at
 * the other — so the ramps are the reference now.
 */

import { describe, expect, it } from 'vitest';

import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { buildElements, legendFor } from './SolvedGraphCanvas';
import {
  COMBINED_MODE,
  RESULT_MODES,
  RESULT_VIEW_MODES,
  buildScale,
  edgeQuantity,
  isResultMode,
  migrateResultMode,
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
  it('paints the node off the temperature ramp and labels it in °C', () => {
    const combined = elementsFor(COMBINED_MODE.id);
    expect(combined.node.fill).toBe(SCALES.temperature.colorOf(60));
    expect(String(combined.node.label)).toContain('60.0 °C');
  });

  it('paints the edge off the ΔT ramp and labels it with the drop', () => {
    const combined = elementsFor(COMBINED_MODE.id);
    expect(combined.edge.color).toBe(SCALES.delta.colorOf(7.6));
    expect(combined.edge.label).toBe('ΔT 7.6 °C');
  });

  /** The regression it guards: the two halves must not collapse into one. */
  it('does not paint the node with the edge ramp, or the edge with the node ramp', () => {
    const combined = elementsFor(COMBINED_MODE.id);
    expect(combined.node.fill).not.toBe(SCALES.delta.colorOf(7.6));
    expect(combined.edge.color).not.toBe(SCALES.temperature.colorOf(60));
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

describe('the mode lists after the merge', () => {
  it('offers the combined view, Heat Flow and Rth as the result views', () => {
    expect(RESULT_VIEW_MODES.map((entry) => entry.id)).toEqual([
      COMBINED_MODE.id,
      'heat_flow',
      'rth',
    ]);
  });

  it("gives Screen 07 the result views plus the two that describe the model", () => {
    expect(RESULT_MODES.map((entry) => entry.id)).toEqual([
      COMBINED_MODE.id,
      'heat_flow',
      'rth',
      'node_type',
      'rth_source',
    ]);
  });

  it('no longer offers Temperature and ΔT on their own', () => {
    expect(isResultMode('temperature')).toBe(false);
    expect(isResultMode('delta_t')).toBe(false);
  });
});

describe('reading back a mode an older build wrote', () => {
  it('sends both halves of the old split to the view they became', () => {
    // Otherwise a reader who left the screen on either one comes back to the
    // default, which looks exactly like the setting not being remembered.
    expect(migrateResultMode('temperature')).toBe(COMBINED_MODE.id);
    expect(migrateResultMode('delta_t')).toBe(COMBINED_MODE.id);
  });

  it('passes a mode this build still has straight through', () => {
    for (const mode of RESULT_MODES) {
      expect(migrateResultMode(mode.id), mode.id).toBe(mode.id);
    }
  });

  it('refuses anything that was never a mode', () => {
    expect(migrateResultMode('hierarchical')).toBeNull();
    expect(migrateResultMode(null)).toBeNull();
    expect(migrateResultMode(7)).toBeNull();
  });
});

describe('what a view puts on an edge', () => {
  /**
   * The mode and the quantity stopped being the same word when the two views
   * merged. Comparing the mode directly is what left a parallel pair's brace
   * unlabelled — and so undrawn — in the combined view.
   */
  it('reads ΔT off the combined view, not off a mode named delta_t', () => {
    expect(edgeQuantity(COMBINED_MODE.id)).toBe('delta_t');
  });

  it('maps the other result views to their own quantity', () => {
    expect(edgeQuantity('heat_flow')).toBe('heat_flow');
    expect(edgeQuantity('rth')).toBe('rth');
  });

  it('gives the input-only views no combinable quantity at all', () => {
    expect(edgeQuantity('node_type')).toBe('none');
    expect(edgeQuantity('rth_source')).toBe('none');
  });
});
