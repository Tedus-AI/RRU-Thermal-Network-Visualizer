/**
 * The margin ranking and the what-if solve — the two things Screen 08 is now
 * built on.
 *
 * The network here is deliberately shaped like the real question: a hot part
 * with a generous limit and a cool part with a tight one. Ranking by
 * temperature picks the wrong one; ranking by margin picks the one a review
 * would actually stop on.
 */

import { defaultMaterials } from '@/domain/materials';
import { describe, expect, it } from 'vitest';

import { createRth } from '../rth';
import { DEFAULT_SOLVER_SETTINGS, type ThermalEdge, type ThermalNetwork, type ThermalNode } from '../types';
import { createBoundarySet } from '../boundary/types';
import { deriveBoundaryPorts } from '../boundary/boundaryPorts';
import { solveScenario } from '../solver/solveScenario';

import { marginRanking } from './marginRanking';
import { chainSegments, networkWithAdjustments, solveWithAdjustments } from './whatIf';

function node(
  id: string,
  options: { power?: number; ambient?: boolean; component?: string; limit?: number } = {},
): ThermalNode {
  return {
    id,
    name: id,
    type: options.ambient ? 'ambient' : 'custom',
    power_W: options.power ?? 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    boundary_role: options.ambient ? 'placeholder' : undefined,
    component_ref: options.component,
    limit_C: options.limit ?? null,
    limit_type: options.limit == null ? null : 'Tj',
  };
}

function edge(id: string, from: string, to: string, R: number): ThermalEdge {
  return {
    id,
    from,
    to,
    type: 'conduction',
    method: 'direct_rth',
    rth: createRth(R, 'Analytical', 'high'),
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
  };
}

/** HOT runs at 100 W with a 200 °C limit; TIGHT at 5 W with a 60 °C limit. */
const net: ThermalNetwork = {
  schema_version: '1.0',
  project_id: 'TEST',
  network_name: 'Main Thermal Network',
  mode: 'analytical',
  status: 'VALID',
  nodes: Object.fromEntries(
    [
      node('HOT', { power: 100, component: 'CMP_HOT', limit: 200 }),
      node('HOT_CASE', { component: 'CMP_HOT' }),
      node('TIGHT', { power: 5, component: 'CMP_TIGHT', limit: 60 }),
      node('BASE'),
      node('AMB', { ambient: true }),
    ].map((entry) => [entry.id, entry]),
  ),
  edges: Object.fromEntries(
    [
      edge('E_HOT_JC', 'HOT', 'HOT_CASE', 0.6),
      edge('E_HOT_BASE', 'HOT_CASE', 'BASE', 0.2),
      edge('E_TIGHT_BASE', 'TIGHT', 'BASE', 0.3),
      edge('E_BASE_AMB', 'BASE', 'AMB', 0.15),
    ].map((entry) => [entry.id, entry]),
  ),
  templates: {},
  zones: {},
  layout: { mode: 'Auto', positions: {} },
  flotherm_mappings: {},
  solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
};

const scenarioId = 'SCN_A';
const outcome = solveScenario({
  materials: defaultMaterials(),
  network: net,
  boundarySet: createBoundarySet({
    projectId: 'TEST',
    networkId: 'Main Thermal Network',
    scenarioId,
    topologyVersion: 1,
    ambient_C: 20,
  }),
  ports: deriveBoundaryPorts(net),
  scenarioId,
});
const temperatures = outcome.solution.node_temperatures_C;

describe('marginRanking', () => {
  it('ranks by what is left, not by what is hottest', () => {
    const ranked = marginRanking(outcome.input.network, temperatures);
    expect(temperatures.HOT).toBeGreaterThan(temperatures.TIGHT);
    // The hotter part is not the one in trouble.
    expect(ranked[0].node_id).toBe('TIGHT');
    expect(ranked[0].margin_C).toBeLessThan(ranked[1].margin_C);
  });

  it('reports the limit and its type alongside the margin', () => {
    const [worst] = marginRanking(outcome.input.network, temperatures);
    expect(worst.limit_C).toBe(60);
    expect(worst.limit_type).toBe('Tj');
    expect(worst.margin_C).toBeCloseTo(60 - temperatures.TIGHT, 9);
  });

  it('returns only the parts that carry a limit, capped at the count asked for', () => {
    const ranked = marginRanking(outcome.input.network, temperatures, 1);
    expect(ranked).toHaveLength(1);
    expect(marginRanking(outcome.input.network, temperatures, 0).map((r) => r.node_id)).toEqual([
      'TIGHT',
      'HOT',
    ]);
  });
});

describe('chainSegments', () => {
  const visible = new Set(['HOT', 'HOT_CASE', 'BASE', 'AMB']);
  const own = new Set(['HOT', 'HOT_CASE']);
  const segments = chainSegments(outcome.input.network, outcome.solution, visible, own);

  it('offers the segments of that path, biggest drop first', () => {
    expect(segments.map((s) => s.edge_id)).toEqual([
      'E_HOT_JC',
      'E_HOT_BASE',
      'E_BASE_AMB',
    ]);
    expect(segments[0].delta_T_C).toBeGreaterThan(segments[1].delta_T_C);
  });

  it('leaves the other component out of this path', () => {
    expect(segments.map((s) => s.edge_id)).not.toContain('E_TIGHT_BASE');
  });

  it('marks the segment that carries more than this device', () => {
    expect(segments.find((s) => s.edge_id === 'E_BASE_AMB')?.shared).toBe(true);
    expect(segments.find((s) => s.edge_id === 'E_HOT_JC')?.shared).toBe(false);
  });

  it('reports resistance as well as drop, so the ranking hides nothing', () => {
    expect(segments[0].rth_C_per_W).toBeCloseTo(0.6, 9);
    expect(segments[0].heat_flow_W).toBeCloseTo(100, 6);
  });
});

describe('solveWithAdjustments', () => {
  it('cuts exactly the segment asked for and leaves the rest alone', () => {
    const adjusted = networkWithAdjustments(outcome.input.network, scenarioId, [
      { edge_id: 'E_HOT_JC', reduction_pct: 20 },
    ]);
    expect(adjusted.edges.E_HOT_JC.scenario_overrides?.[scenarioId]?.R_C_per_W).toBeCloseTo(0.48, 9);
    expect(adjusted.edges.E_HOT_BASE.scenario_overrides?.[scenarioId]?.R_C_per_W).toBeUndefined();
    // The stored network is not touched (08 §22).
    expect(outcome.input.network.edges.E_HOT_JC.scenario_overrides?.[scenarioId]?.R_C_per_W).not.toBe(
      0.48,
    );
  });

  it('drops the junction by exactly Q·ΔR for a series segment', () => {
    const result = solveWithAdjustments(outcome.input.network, scenarioId, DEFAULT_SOLVER_SETTINGS, [
      { edge_id: 'E_HOT_JC', reduction_pct: 20 },
    ]);
    expect(result.ok).toBe(true);
    // 100 W through a 0.6 → 0.48 °C/W segment is 12 °C, and nothing else moves.
    expect(temperatures.HOT - result.temperatures.HOT).toBeCloseTo(12, 6);
    expect(result.temperatures.TIGHT).toBeCloseTo(temperatures.TIGHT, 9);
  });

  it('carries the whole board when the shared segment improves', () => {
    const result = solveWithAdjustments(outcome.input.network, scenarioId, DEFAULT_SOLVER_SETTINGS, [
      { edge_id: 'E_BASE_AMB', reduction_pct: 20 },
    ]);
    // 105 W through the base link: everything above it comes down together.
    expect(temperatures.HOT - result.temperatures.HOT).toBeCloseTo(105 * 0.15 * 0.2, 6);
    expect(temperatures.TIGHT - result.temperatures.TIGHT).toBeCloseTo(105 * 0.15 * 0.2, 6);
  });

  it('adds up when several segments move at once', () => {
    const result = solveWithAdjustments(outcome.input.network, scenarioId, DEFAULT_SOLVER_SETTINGS, [
      { edge_id: 'E_HOT_JC', reduction_pct: 20 },
      { edge_id: 'E_BASE_AMB', reduction_pct: 20 },
    ]);
    expect(temperatures.HOT - result.temperatures.HOT).toBeCloseTo(12 + 105 * 0.15 * 0.2, 6);
  });

  it('resolves a fractional step, which is what a 0.1 % control needs', () => {
    const tenth = solveWithAdjustments(outcome.input.network, scenarioId, DEFAULT_SOLVER_SETTINGS, [
      { edge_id: 'E_HOT_JC', reduction_pct: 0.1 },
    ]);
    expect(temperatures.HOT - tenth.temperatures.HOT).toBeCloseTo(100 * 0.6 * 0.001, 9);
  });

  it('changes nothing at 0 %', () => {
    const result = solveWithAdjustments(outcome.input.network, scenarioId, DEFAULT_SOLVER_SETTINGS, [
      { edge_id: 'E_HOT_JC', reduction_pct: 0 },
    ]);
    for (const [id, value] of Object.entries(temperatures)) {
      expect(result.temperatures[id]).toBeCloseTo(value, 9);
    }
  });
});
