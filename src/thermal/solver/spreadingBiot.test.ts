/**
 * Finite-Bi spreading refinement — see `spreadingBiot.ts`.
 *
 * The shape under test throughout is the real one: a source hands heat to an
 * HSK base through a spreading edge, the base reaches ambient through a fin
 * conduction edge and a convection edge, and the scenario supplies h.
 */

import { defaultMaterials } from '@/domain/materials';
import { describe, expect, it } from 'vitest';

import { createRth } from '../rth';
import { discSpreadingResistance } from '../resistance/spreading';
import { DEFAULT_SOLVER_SETTINGS, type ThermalEdge, type ThermalNetwork, type ThermalNode } from '../types';
import {
  createBoundarySet,
  type BoundaryPort,
  type ScenarioBoundaryConditionSet,
} from '../boundary/types';
import { deriveBoundaryPorts } from '../boundary/boundaryPorts';

import { solveScenario } from './solveScenario';
import { downstreamResistance, refineSpreadingWithBiot } from './spreadingBiot';

// --- the geometry every case shares ---------------------------------------

const PLATE_MM2 = 300 * 220;
const SOURCE_MM2 = 30 * 30;
const THICKNESS_MM = 7.3;
const K = 155;
/** Fin area the convection profile is quoted over. */
const FIN_AREA_M2 = 0.5;

function node(
  id: string,
  options: { power?: number; type?: ThermalNode['type']; ambient?: boolean } = {},
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
  };
}

function network(nodes: ThermalNode[], edges: ThermalEdge[]): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    status: 'VALID',
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
    edges: Object.fromEntries(edges.map((entry) => [entry.id, entry])),
    templates: {},
    zones: {},
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

/** Bi → ∞, exactly as Screen 05 would build it. */
const spreadingAtInfiniteBi = discSpreadingResistance({
  source_area_mm2: SOURCE_MM2,
  plate_area_mm2: PLATE_MM2,
  thickness_mm: THICKNESS_MM,
  k_W_mK: K,
  variant: 'max',
})!.R_C_per_W;

function spreadingEdge(overrides: Partial<ThermalEdge> = {}): ThermalEdge {
  return {
    id: 'E_SPREAD',
    from: 'SRC',
    to: 'BASE',
    type: 'spreading',
    method: 'spreading_disc',
    rth: createRth(spreadingAtInfiniteBi, 'Analytical', 'medium'),
    parameters: {
      source_area_mm2: SOURCE_MM2,
      plate_area_mm2: PLATE_MM2,
      thickness_mm: THICKNESS_MM,
      k_W_mK: K,
      psi_variant: 'max',
    },
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
    ...overrides,
  };
}

function plain(id: string, from: string, to: string, R: number | null, method: ThermalEdge['method'] = 'direct_rth'): ThermalEdge {
  return {
    id,
    from,
    to,
    type: method === 'convection_hA' ? 'custom' : 'conduction',
    method,
    rth: createRth(R, 'Analytical', 'high'),
    heat_flow_W: null,
    delta_T_C: null,
    resolution: R == null ? 'unresolved' : 'resolved',
    enabled: true,
  };
}

/** SRC → (spreading) → BASE → (fin) → FIN → (convection) → AMBIENT. */
function baseNetwork(finR: number | null = 0.05): ThermalNetwork {
  return network(
    [
      node('SRC', { power: 45 }),
      node('BASE', { type: 'heat_sink_base' }),
      node('FIN', { type: 'fin_surface' }),
      node('AMB', { ambient: true }),
    ],
    [
      spreadingEdge(),
      plain('E_FIN', 'BASE', 'FIN', finR),
      plain('E_BOUNDARY', 'FIN', 'AMB', null, 'convection_hA'),
    ],
  );
}

function withConvection(
  scenarioId: string,
  h: number,
  port: BoundaryPort,
  ambient_C = 45,
): ScenarioBoundaryConditionSet {
  const set = createBoundarySet({
    projectId: 'TEST',
    networkId: 'Main Thermal Network',
    scenarioId,
    topologyVersion: 1,
    ambient_C,
  });
  set.profiles = [
    {
      id: 'P_CONV',
      name: 'Fin convection',
      type: 'convection_to_ambient',
      representation: 'single_combined_edge',
      parameters: { h_W_m2K: h, area_m2: FIN_AREA_M2 },
      source: 'manual',
      confidence: 'high',
    },
  ];
  set.assignments = [
    {
      id: 'A_CONV',
      boundary_port_id: port.id,
      boundary_edge_id: port.boundary_edge_id,
      profile_ids: ['P_CONV'],
      assignment_mode: 'manual',
      enabled: true,
    },
  ];
  return set;
}

function solveWith(net: ThermalNetwork, h: number, scenarioId = 'SCN_A') {
  const ports = deriveBoundaryPorts(net);
  const finPort = ports.find((port) => port.connected_node_id === 'FIN') as BoundaryPort;
  return solveScenario({
    materials: defaultMaterials(),
    network: net,
    boundarySet: withConvection(scenarioId, h, finPort),
    ports,
    scenarioId,
  });
}

const close = (value: number, expected: number, tolerance = 1e-9) =>
  expect(Math.abs(value - expected)).toBeLessThan(tolerance);

// --- the probe -------------------------------------------------------------

describe('downstreamResistance', () => {
  it('measures the series path from the plate to ambient', () => {
    // BASE → FIN is 0.05, FIN → AMB is 0.25; nothing else reaches a fixed node.
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';

    close(downstreamResistance(net, 'BASE', 'SCN_A')!, 0.3, 1e-9);
  });

  it('ignores the dead-end chain upstream of the plate', () => {
    // A long upstream chain carries no current in the probe, so it must not
    // change the answer at all.
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';
    net.nodes.JUNCTION = node('JUNCTION', { power: 200 });
    net.edges.E_UP = plain('E_UP', 'JUNCTION', 'SRC', 12);

    close(downstreamResistance(net, 'BASE', 'SCN_A')!, 0.3, 1e-9);
  });

  it('halves when a second boundary path is added in parallel', () => {
    const net = baseNetwork(0);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_FIN.rth = createRth(0.5, 'Analytical', 'high');
    net.edges.E_BOUNDARY.rth = createRth(1e-12, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';
    close(downstreamResistance(net, 'BASE', 'SCN_A')!, 0.5, 1e-6);

    net.edges.E_FIN2 = plain('E_FIN2', 'BASE', 'FIN', 0.5);
    close(downstreamResistance(net, 'BASE', 'SCN_A')!, 0.25, 1e-6);
  });

  it('returns null when the plate has no path to a fixed node', () => {
    const net = baseNetwork(0.05);
    // No ambient pin and no boundary resistance: nothing to spread into.
    expect(downstreamResistance(net, 'BASE', 'SCN_A')).toBeNull();
  });

  it('does not pin a node marked fixed_temperature with no value', () => {
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = null;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';
    expect(downstreamResistance(net, 'BASE', 'SCN_A')).toBeNull();
  });
});

// --- the refinement --------------------------------------------------------

describe('refineSpreadingWithBiot', () => {
  it('raises the spreading resistance and records where h came from', () => {
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';

    const [refined] = refineSpreadingWithBiot(net, 'SCN_A');
    expect(refined.edge_id).toBe('E_SPREAD');
    expect(refined.plate_node_id).toBe('BASE');
    close(refined.R_downstream_C_per_W, 0.3, 1e-9);
    // h_eff = 1 / (0.3 × 0.066 m²) = 50.5 W/m²K.
    close(refined.h_eff_W_m2K, 1 / (0.3 * (PLATE_MM2 / 1e6)), 1e-6);

    // Bi → ∞ is the floor of the model, so the refined value can only rise.
    expect(refined.R_before_C_per_W).toBeCloseTo(spreadingAtInfiniteBi, 12);
    expect(refined.R_after_C_per_W).toBeGreaterThan(refined.R_before_C_per_W);
  });

  it('reproduces the series exactly for the Bi it reports', () => {
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';

    const [refined] = refineSpreadingWithBiot(net, 'SCN_A');
    const expected = discSpreadingResistance({
      source_area_mm2: SOURCE_MM2,
      plate_area_mm2: PLATE_MM2,
      thickness_mm: THICKNESS_MM,
      k_W_mK: K,
      bi: refined.bi,
      variant: 'max',
    })!;
    close(refined.R_after_C_per_W, expected.R_C_per_W, 1e-12);
    // Bi = h·b/k with b the PLATE radius, not the thickness.
    close(refined.bi, (refined.h_eff_W_m2K * Math.sqrt(PLATE_MM2 / 1e6 / Math.PI)) / K, 1e-12);
  });

  it('applies as a scenario override and leaves the analytical slot alone', () => {
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';

    const [refined] = refineSpreadingWithBiot(net, 'SCN_A');
    const edge = net.edges.E_SPREAD;
    expect(edge.rth.analytical).toBeCloseTo(spreadingAtInfiniteBi, 12);
    close(edge.scenario_overrides!.SCN_A.R_C_per_W!, refined.R_after_C_per_W, 1e-12);
    expect(edge.parameters!.bi).toBeCloseTo(refined.bi, 12);
  });

  it('refines nothing when the boundary is unresolved', () => {
    const net = baseNetwork(0.05);
    expect(refineSpreadingWithBiot(net, 'SCN_A')).toEqual([]);
    expect(net.edges.E_SPREAD.scenario_overrides).toBeUndefined();
  });

  it('leaves an edge whose value a person pinned by hand', () => {
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';
    net.edges.E_SPREAD.rth = createRth(0.11, 'Manual', 'high');

    expect(refineSpreadingWithBiot(net, 'SCN_A')).toEqual([]);
    expect(net.edges.E_SPREAD.scenario_overrides).toBeUndefined();
  });

  it('probes each plate once however many parts sit on it', () => {
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';
    net.nodes.SRC2 = node('SRC2', { power: 20 });
    net.edges.E_SPREAD2 = spreadingEdge({ id: 'E_SPREAD2', from: 'SRC2' });

    const refined = refineSpreadingWithBiot(net, 'SCN_A');
    expect(refined).toHaveLength(2);
    // Same plate, same downstream path — and h is intensive, so the same h.
    close(refined[0].h_eff_W_m2K, refined[1].h_eff_W_m2K, 1e-12);
  });

  it('builds Bi on the influence-area radius when devices share the plate', () => {
    const net = baseNetwork(0.05);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;
    net.edges.E_BOUNDARY.rth = createRth(0.25, 'Analytical', 'high');
    net.edges.E_BOUNDARY.resolution = 'resolved';
    net.edges.E_SPREAD.parameters = { ...net.edges.E_SPREAD.parameters, devices: 4 };

    const [refined] = refineSpreadingWithBiot(net, 'SCN_A');
    // b comes from A_plate / devices, matching the area the series actually uses.
    close(refined.bi, (refined.h_eff_W_m2K * Math.sqrt(PLATE_MM2 / 4 / 1e6 / Math.PI)) / K, 1e-12);
  });

  it('gives a stronger boundary a larger Bi and a smaller spreading resistance', () => {
    const build = (boundaryR: number) => {
      const net = baseNetwork(0.05);
      net.nodes.AMB.boundary_type = 'fixed_temperature';
      net.nodes.AMB.fixed_temperature_C = 45;
      net.edges.E_BOUNDARY.rth = createRth(boundaryR, 'Analytical', 'high');
      net.edges.E_BOUNDARY.resolution = 'resolved';
      return refineSpreadingWithBiot(net, 'SCN_A')[0];
    };

    const still = build(1.0);
    const windy = build(0.02);
    expect(windy.bi).toBeGreaterThan(still.bi);
    expect(windy.R_after_C_per_W).toBeLessThan(still.R_after_C_per_W);
    // Even the strong boundary stays above the Bi → ∞ floor.
    expect(windy.R_after_C_per_W).toBeGreaterThan(spreadingAtInfiniteBi);
  });
});

// --- through the whole solve ----------------------------------------------

describe('solveScenario with finite-Bi spreading', () => {
  it('reports the refinement on the edge result and in the notes', () => {
    const outcome = solveWith(baseNetwork(0.05), 20);
    expect(outcome.checks.can_solve).toBe(true);

    const result = outcome.solution.edge_results.E_SPREAD;
    expect(result.rth_origin).toBe('spreading_biot');
    expect(result.spreading_biot).toBeDefined();
    close(result.spreading_biot!.R_bi_infinite_C_per_W, spreadingAtInfiniteBi, 1e-12);
    expect(result.active_rth_C_per_W).toBeGreaterThan(spreadingAtInfiniteBi);
    close(result.active_rth_C_per_W, outcome.spreading_refinements[0].R_after_C_per_W, 1e-12);

    expect(outcome.solution.warnings.map((entry) => entry.code)).toContain(
      'spreading_biot_applied',
    );
    // Screen 07 reads `checks` while the run is fresh, so the note has to be
    // there as well or nobody sees it while they are looking at the result.
    expect(outcome.checks.infos.map((entry) => entry.code)).toContain('spreading_biot_applied');
  });

  it('files no note when nothing was refined', () => {
    const net = baseNetwork(0.05);
    net.edges.E_SPREAD.method = 'direct_rth';
    const outcome = solveWith(net, 20);
    expect(outcome.spreading_refinements).toEqual([]);
    expect(outcome.checks.infos.map((entry) => entry.code)).not.toContain(
      'spreading_biot_applied',
    );
  });

  it('runs the source hotter than the Bi → ∞ model would have', () => {
    const net = baseNetwork(0.05);
    const refinedT = solveWith(net, 20).solution.node_temperatures_C.SRC;

    // The same solve with the refinement's own inputs removed: no plate area,
    // so nothing to spread into and nothing to refine.
    const flat = baseNetwork(0.05);
    flat.edges.E_SPREAD.method = 'direct_rth';
    const flatOutcome = solveWith(flat, 20);
    expect(flatOutcome.solution.edge_results.E_SPREAD.rth_origin).toBe('edge');
    expect(refinedT).toBeGreaterThan(flatOutcome.solution.node_temperatures_C.SRC);
  });

  it('never writes the scenario-dependent value back onto the stored graph', () => {
    const net = baseNetwork(0.05);
    solveWith(net, 20);
    expect(net.edges.E_SPREAD.scenario_overrides).toBeUndefined();
    expect(net.edges.E_SPREAD.parameters!.bi).toBeUndefined();
    expect(net.edges.E_SPREAD.rth.analytical).toBeCloseTo(spreadingAtInfiniteBi, 12);
  });

  it('gives two scenarios their own Bi from their own h', () => {
    const net = baseNetwork(0.05);
    const still = solveWith(net, 8, 'SCN_STILL');
    const windy = solveWith(net, 60, 'SCN_WIND');

    expect(windy.spreading_refinements[0].bi).toBeGreaterThan(
      still.spreading_refinements[0].bi,
    );
    expect(windy.spreading_refinements[0].R_after_C_per_W).toBeLessThan(
      still.spreading_refinements[0].R_after_C_per_W,
    );
  });
});
