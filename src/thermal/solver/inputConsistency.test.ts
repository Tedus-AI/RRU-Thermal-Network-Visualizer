/**
 * Checking a scenario and solving it must produce the SAME network.
 *
 * This is the invariant Screen 08 rests on. Screen 07 stores a solution; the
 * store then hands Screen 08 that solution plus a solve input, and Screen 08
 * modifies the input to ask "what if this segment were better". If the input is
 * not the network the solution came from, every answer carries the difference
 * between two networks.
 *
 * That is not hypothetical. The finite-Bi spreading refinement used to be
 * applied inside `solveScenario`, after `checkScenario` had returned, so:
 *
 *   solutionStore.solve()   → input WITH the refinement (the solved network)
 *   solutionStore.refresh() → input WITHOUT it (a plain rebuild)
 *
 * and `loadFor()` — which every screen calls on mount — ends in `refresh()`.
 * Opening Screen 08 therefore swapped the network under the stored solution,
 * and on STARKCORE the two disagreed by 12.9 °C at the PA junctions.
 */

import { defaultMaterials } from '@/domain/materials';
import { describe, expect, it } from 'vitest';

import { createRth } from '../rth';
import { DEFAULT_SOLVER_SETTINGS, type ThermalEdge, type ThermalNetwork, type ThermalNode } from '../types';
import { createBoundarySet } from '../boundary/types';
import { deriveBoundaryPorts } from '../boundary/boundaryPorts';
import { solveNetwork } from '../networkSolver';
import { checkScenario, solveScenario } from './solveScenario';

function node(
  id: string,
  options: { power?: number; type?: ThermalNode['type']; ambient?: boolean; limit?: number } = {},
): ThermalNode {
  return {
    id,
    name: id,
    type: options.type ?? (options.ambient ? 'ambient' : 'custom'),
    power_W: options.power ?? 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    boundary_role: options.ambient ? 'placeholder' : undefined,
    component_ref: options.power ? 'CMP' : undefined,
    limit_C: options.limit ?? null,
    limit_type: options.limit == null ? null : 'Tj',
  };
}

/** A spreading edge onto a plate is what the refinement acts on. */
function spreadingNetwork(): ThermalNetwork {
  const edges: ThermalEdge[] = [
    {
      id: 'E_SPREAD',
      from: 'SRC',
      to: 'PLATE',
      type: 'spreading',
      method: 'spreading_disc',
      parameters: {
        source_area_mm2: 900,
        plate_area_mm2: 60000,
        thickness_mm: 7.3,
        k_W_mK: 155,
        devices: 1,
      },
      rth: createRth(0.05, 'Analytical', 'high'),
      heat_flow_W: null,
      delta_T_C: null,
      resolution: 'resolved',
      enabled: true,
    },
    {
      id: 'E_OUT',
      from: 'PLATE',
      to: 'AMB',
      type: 'conduction',
      method: 'direct_rth',
      rth: createRth(0.2, 'Analytical', 'high'),
      heat_flow_W: null,
      delta_T_C: null,
      resolution: 'resolved',
      enabled: true,
    },
  ];

  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    status: 'VALID',
    nodes: Object.fromEntries(
      [
        node('SRC', { power: 45, limit: 125 }),
        node('PLATE', { type: 'heat_sink_base' }),
        node('AMB', { ambient: true }),
      ].map((entry) => [entry.id, entry]),
    ),
    edges: Object.fromEntries(edges.map((entry) => [entry.id, entry])),
    templates: {},
    zones: {},
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

const scenarioId = 'SCN_A';
const optionsFor = (network: ThermalNetwork) => ({
  materials: defaultMaterials(),
  network,
  boundarySet: createBoundarySet({
    projectId: 'TEST',
    networkId: 'Main Thermal Network',
    scenarioId,
    topologyVersion: 1,
    ambient_C: 45,
  }),
  ports: deriveBoundaryPorts(network),
  scenarioId,
});

describe('check and solve build the same network', () => {
  it('refines the spreading edge on the CHECK path too', () => {
    const net = spreadingNetwork();
    const checked = checkScenario(optionsFor(net));
    expect(checked.spreading_refinements.length).toBeGreaterThan(0);
  });

  it('gives both paths the same resistance on every edge', () => {
    const net = spreadingNetwork();
    const checked = checkScenario(optionsFor(net));
    const solved = solveScenario(optionsFor(net));

    for (const id of Object.keys(solved.input.network.edges)) {
      const fromCheck = checked.input.network.edges[id].scenario_overrides?.[scenarioId];
      const fromSolve = solved.input.network.edges[id].scenario_overrides?.[scenarioId];
      expect(fromCheck?.R_C_per_W).toBe(fromSolve?.R_C_per_W);
    }
  });

  it('reproduces the stored solution from the checked input, to the last digit', () => {
    const net = spreadingNetwork();
    const solved = solveScenario(optionsFor(net));
    // What Screen 08 does: take the input the store is holding and solve it.
    const checked = checkScenario(optionsFor(net));
    const again = solveNetwork(checked.input.network, {
      scenarioId,
      powerScale: 1,
      settings: DEFAULT_SOLVER_SETTINGS,
    });

    expect(again.ok).toBe(true);
    for (const [id, value] of Object.entries(solved.solution.node_temperatures_C)) {
      expect(again.temperatures[id]).toBeCloseTo(value, 9);
    }
  });

  it('keeps the signature stable across the move', () => {
    // The signature is taken before the refinement, so solutions stored by an
    // earlier build are not invalidated by it.
    const net = spreadingNetwork();
    expect(checkScenario(optionsFor(net)).signature).toBe(solveScenario(optionsFor(net)).signature);
  });
});
