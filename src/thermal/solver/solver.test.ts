/**
 * Screen 07 solver tests — the developer test cases in 07 §56 (A–G), plus the
 * pre-solve checks of 07 §4 and the Screen 06 hand-over of 07 §12.
 */

import { describe, expect, it } from 'vitest';

import { createRth } from '../rth';
import { DEFAULT_SOLVER_SETTINGS, type ThermalEdge, type ThermalNetwork, type ThermalNode } from '../types';
import { createBoundarySet, type BoundaryPort, type ScenarioBoundaryConditionSet } from '../boundary/types';
import { deriveBoundaryPorts } from '../boundary/boundaryPorts';

import { buildSolveInput, solveInputSignature } from './buildSolveInput';
import { runPreSolveChecks } from './preSolveChecks';
import { checkScenario, netHeatFlowOf, solveScenario } from './solveScenario';
import type { SourceRevision } from '@/domain/revision';
import { createComponent } from '@/domain/component';
import { sourced } from '@/domain/sourcedValue';

// --- builders --------------------------------------------------------------

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

function edge(
  id: string,
  from: string,
  to: string,
  R: number | null,
  overrides: Partial<ThermalEdge> = {},
): ThermalEdge {
  return {
    id,
    from,
    to,
    type: 'conduction',
    method: 'direct_rth',
    rth: createRth(R, 'Analytical', 'high'),
    heat_flow_W: null,
    delta_T_C: null,
    resolution: R == null ? 'unresolved' : 'resolved',
    enabled: true,
    ...overrides,
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

/** A scenario boundary set that only supplies the ambient temperature. */
function ambientOnly(scenarioId: string, ambient_C: number): ScenarioBoundaryConditionSet {
  return createBoundarySet({
    projectId: 'TEST',
    networkId: 'Main Thermal Network',
    scenarioId,
    topologyVersion: 1,
    ambient_C,
  });
}

function solve(net: ThermalNetwork, ambient_C = 20, scenarioId = 'SCN_A', powerScale?: number) {
  return solveScenario({
    network: net,
    boundarySet: ambientOnly(scenarioId, ambient_C),
    ports: deriveBoundaryPorts(net),
    scenarioId,
    powerScale,
  });
}

const close = (value: number, expected: number, tolerance = 1e-9) =>
  expect(Math.abs(value - expected)).toBeLessThan(tolerance);

describe('Phase 1 solution provenance', () => {
  const source: SourceRevision = {
    project_revision: 'rev:project:1',
    component_revision: 'rev:component:1',
    solver_input_revision: 'rev:solver_input:1',
    limit_revision: 'rev:limit:1',
    network_revision: 'rev:network:1',
    scenario_revision: 'rev:scenario:1',
  };

  it('freezes the authoritative source revisions into the solution', () => {
    const net = network(
      [node('SRC', { power: 10 }), node('AMB', { ambient: true })],
      [edge('E1', 'SRC', 'AMB', 1)],
    );
    const outcome = solveScenario({
      network: net,
      boundarySet: ambientOnly('SCN_A', 20),
      ports: deriveBoundaryPorts(net),
      scenarioId: 'SCN_A',
      sourceRevision: source,
    });

    expect(outcome.input.source_revision).toEqual(source);
    expect(outcome.solution.metadata.source_revision).toEqual(source);
  });

  it('does not include provenance-only Limit revisions in the physics signature', () => {
    const net = network(
      [node('SRC', { power: 10 }), node('AMB', { ambient: true })],
      [edge('E1', 'SRC', 'AMB', 1)],
    );
    const first = solveScenario({
      network: net,
      boundarySet: ambientOnly('SCN_A', 20),
      ports: deriveBoundaryPorts(net),
      scenarioId: 'SCN_A',
      sourceRevision: source,
    });
    const afterLimitEdit = solveScenario({
      network: net,
      boundarySet: ambientOnly('SCN_A', 20),
      ports: deriveBoundaryPorts(net),
      scenarioId: 'SCN_A',
      sourceRevision: {
        ...source,
        component_revision: 'rev:component:2',
        limit_revision: 'rev:limit:2',
      },
    });

    expect(afterLimitEdit.signature).toBe(first.signature);
    expect(afterLimitEdit.solution.metadata.source_revision?.limit_revision).toBe(
      'rev:limit:2',
    );
  });

  it('projects authoritative Component Master power and linked Rth into every solve', () => {
    const component = createComponent({
      id: 'CMP_PA',
      name: 'Final PA',
      category: 'RF',
      qty: 4,
      power_W: 45,
      provenance: {
        source_type: 'Manual',
        source_project_id: null,
        source_project_name: null,
        source_file: null,
        imported_at: '2026-08-13T00:00:00.000Z',
      },
    });
    component.thermal_spec.r_jc_C_per_W = sourced(0.25, 'Datasheet');

    const sourceNode = {
      ...node('SRC', { power: 1 }),
      component_ref: component.id,
      origin: { kind: 'template' as const, component_id: component.id, modified: false },
      metadata: { component_power_linked: true, devices_represented: 4 },
    };
    const linkedEdge = edge('E1', 'SRC', 'AMB', 9, {
      method: 'direct_rth',
      parameters: { R_C_per_W: 9 },
      parameter_links: { R_C_per_W: 'thermal_spec.r_jc_C_per_W' },
      origin: { kind: 'template', component_id: component.id, modified: false },
    });
    const net = network([sourceNode, node('AMB', { ambient: true })], [linkedEdge]);

    const first = solveScenario({
      network: net,
      components: [component],
      boundarySet: ambientOnly('SCN_A', 20),
      ports: deriveBoundaryPorts(net),
      scenarioId: 'SCN_A',
    });
    expect(first.solution.energy_balance.component_W).toBeCloseTo(180, 9);
    expect(first.input.network.edges.E1.rth.analytical).toBeCloseTo(0.25, 9);

    const changed = {
      ...component,
      power_W: sourced(99, 'Manual'),
      thermal_spec: {
        ...component.thermal_spec,
        r_jc_C_per_W: sourced(0.1, 'Datasheet'),
      },
    };
    const second = solveScenario({
      network: net,
      components: [changed],
      boundarySet: ambientOnly('SCN_A', 20),
      ports: deriveBoundaryPorts(net),
      scenarioId: 'SCN_A',
    });
    expect(second.solution.energy_balance.component_W).toBeCloseTo(396, 9);
    expect(second.input.network.edges.E1.rth.analytical).toBeCloseTo(0.1, 9);
    expect(second.signature).not.toBe(first.signature);
    expect(net.nodes.SRC.power_W).toBe(1);
    expect(net.edges.E1.rth.analytical).toBe(9);
  });
});

// --- Test A ----------------------------------------------------------------

describe('Test A — simple series (07 §56 A)', () => {
  const net = network(
    [node('SRC', { power: 10 }), node('MID'), node('AMB', { ambient: true })],
    [edge('E1', 'SRC', 'MID', 1), edge('E2', 'MID', 'AMB', 1)],
  );

  it('solves the middle node at 30 °C and the source at 40 °C', () => {
    const { solution } = solve(net, 20);
    expect(solution.status).toBe('SOLVED');
    close(solution.node_temperatures_C.AMB, 20);
    close(solution.node_temperatures_C.MID, 30);
    close(solution.node_temperatures_C.SRC, 40);
  });

  it('back-calculates 10 W through both edges, forward', () => {
    const { solution } = solve(net, 20);
    close(solution.edge_results.E1.heat_flow_W, 10);
    close(solution.edge_results.E2.heat_flow_W, 10);
    close(solution.edge_results.E1.delta_T_C, 10);
    expect(solution.edge_results.E1.actual_direction).toBe('forward');
    expect(solution.edge_results.E2.actual_direction).toBe('forward');
  });

  it('balances energy exactly', () => {
    const { solution } = solve(net, 20);
    close(solution.energy_balance.generated_W, 10);
    close(solution.energy_balance.rejected_W, 10);
    expect(solution.energy_balance.grade).toBe('green');
    expect(solution.energy_balance.error_pct).toBeLessThan(1e-9);
  });

  it('applies the scenario power scale to component power', () => {
    const { solution } = solve(net, 20, 'SCN_A', 0.5);
    close(solution.energy_balance.generated_W, 5);
    close(solution.node_temperatures_C.SRC, 30);
    expect(solution.metadata.power_scale).toBe(0.5);
  });

  it('does not mutate the stored network', () => {
    const before = JSON.stringify(net);
    solve(net, 20);
    expect(JSON.stringify(net)).toBe(before);
  });
});

// --- Test B ----------------------------------------------------------------

describe('Test B — parallel paths (07 §56 B)', () => {
  const net = network(
    [node('SRC', { power: 10 }), node('AMB', { ambient: true })],
    [edge('EA', 'SRC', 'AMB', 2), edge('EB', 'SRC', 'AMB', 2)],
  );

  it('splits 5 W into each branch', () => {
    const { solution } = solve(net, 20);
    close(solution.edge_results.EA.heat_flow_W, 5);
    close(solution.edge_results.EB.heat_flow_W, 5);
    close(solution.node_temperatures_C.SRC, 30);
  });
});

// --- Test C ----------------------------------------------------------------

describe('Test C — reverse coupling flow (07 §56 C)', () => {
  // B is passive and colder than A, but the coupling edge is drawn B → A.
  const net = network(
    [node('A', { power: 10 }), node('B'), node('AMB', { ambient: true })],
    [
      edge('E_A_AMB', 'A', 'AMB', 1),
      edge('E_B_AMB', 'B', 'AMB', 1),
      edge('E_B_A', 'B', 'A', 1),
    ],
  );

  it('reports a negative Q and a reverse direction without failing', () => {
    const { solution } = solve(net, 20);
    expect(solution.status).not.toBe('FAILED');
    close(solution.node_temperatures_C.A, 20 + 20 / 3, 1e-9);
    close(solution.node_temperatures_C.B, 20 + 10 / 3, 1e-9);
    expect(solution.edge_results.E_B_A.heat_flow_W).toBeLessThan(0);
    expect(solution.edge_results.E_B_A.actual_direction).toBe('reverse');
    expect(solution.edge_results.E_B_A.delta_T_C).toBeLessThan(0);
  });

  it('still closes the energy balance', () => {
    const { solution } = solve(net, 20);
    close(solution.energy_balance.generated_W, 10);
    close(solution.energy_balance.rejected_W, 10, 1e-9);
  });

  it('satisfies ΣQ + P ≈ 0 at every node (07 §32)', () => {
    const { solution } = solve(net, 20);
    close(netHeatFlowOf(solution, 'A'), 10, 1e-9);
    close(netHeatFlowOf(solution, 'B'), 0, 1e-9);
  });
});

// --- Test D ----------------------------------------------------------------

describe('Test D — multiple sources merging (07 §56 D)', () => {
  const net = network(
    [
      node('S1', { power: 10 }),
      node('S2', { power: 20 }),
      node('BASE'),
      node('AMB', { ambient: true }),
    ],
    [
      edge('E1', 'S1', 'BASE', 1),
      edge('E2', 'S2', 'BASE', 1),
      edge('E3', 'BASE', 'AMB', 0.5),
    ],
  );

  it('counts each source power exactly once', () => {
    const { solution } = solve(net, 20);
    close(solution.energy_balance.generated_W, 30);
    close(solution.energy_balance.rejected_W, 30, 1e-9);
    close(solution.energy_balance.residual_W, 0, 1e-9);
    expect(solution.energy_balance.grade).toBe('green');
  });

  it('routes the whole 30 W through the shared base edge', () => {
    const { solution } = solve(net, 20);
    close(solution.edge_results.E3.heat_flow_W, 30, 1e-9);
    close(solution.node_temperatures_C.BASE, 35, 1e-9);
  });
});

// --- Test E ----------------------------------------------------------------

describe('Test E — singular block (07 §56 E)', () => {
  const net = network(
    [
      node('SRC', { power: 10 }),
      node('AMB', { ambient: true }),
      // An island with no route to any boundary.
      node('ISO_A'),
      node('ISO_B'),
    ],
    [edge('E1', 'SRC', 'AMB', 1), edge('E_ISO', 'ISO_A', 'ISO_B', 1)],
  );

  it('fails with a focusable issue instead of solving', () => {
    const { solution, checks } = solve(net, 20);
    expect(checks.can_solve).toBe(false);
    expect(solution.status).toBe('FAILED');
    const island = checks.errors.find((entry) => entry.code === 'floating_island');
    expect(island).toBeDefined();
    expect(island?.node_id).toBeTruthy();
    expect(island?.fix_in).toBe('05');
  });

  it('reports no temperatures at all rather than partial ones', () => {
    const { solution } = solve(net, 20);
    expect(Object.keys(solution.node_temperatures_C)).toHaveLength(0);
    expect(Object.keys(solution.edge_results)).toHaveLength(0);
  });
});

// --- Test F ----------------------------------------------------------------

describe('Test F — dirty inputs make a stored solution stale (07 §56 F, §38)', () => {
  const net = network(
    [node('SRC', { power: 10 }), node('AMB', { ambient: true })],
    [edge('E1', 'SRC', 'AMB', 1)],
  );

  it('changes the input signature when the boundary changes', () => {
    const first = solve(net, 20);
    const second = solve(net, 45);
    expect(first.signature).not.toBe(second.signature);
    expect(first.solution.metadata.input_signature).toBe(first.signature);
    // The old solution no longer describes the current inputs.
    expect(first.solution.metadata.input_signature).not.toBe(second.signature);
  });

  it('changes the signature when the power scale changes', () => {
    expect(solve(net, 20).signature).not.toBe(solve(net, 20, 'SCN_A', 0.8).signature);
  });

  it('keeps the signature stable when nothing that matters changed', () => {
    expect(solve(net, 20).signature).toBe(solve(net, 20).signature);
  });

  it('ignores a cosmetic change such as a node name', () => {
    const renamed = network(
      [
        { ...node('SRC', { power: 10 }), name: 'Final PA' },
        node('AMB', { ambient: true }),
      ],
      [edge('E1', 'SRC', 'AMB', 1)],
    );
    expect(solve(renamed, 20).signature).toBe(solve(net, 20).signature);
  });
});

// --- Test G ----------------------------------------------------------------

describe('Test G — multi-scenario solutions stay separate (07 §56 G, §41)', () => {
  const net = network(
    [node('SRC', { power: 10 }), node('AMB', { ambient: true })],
    [edge('E1', 'SRC', 'AMB', 1)],
  );

  it('produces its own temperatures per scenario', () => {
    const hot = solve(net, 55, 'SCN_55C');
    const cold = solve(net, 25, 'SCN_25C');

    expect(hot.solution.scenario_id).toBe('SCN_55C');
    expect(cold.solution.scenario_id).toBe('SCN_25C');
    close(hot.solution.node_temperatures_C.SRC, 65);
    close(cold.solution.node_temperatures_C.SRC, 35);

    const store: Record<string, typeof hot.solution> = {};
    store[hot.solution.scenario_id] = hot.solution;
    store[cold.solution.scenario_id] = cold.solution;
    expect(Object.keys(store)).toHaveLength(2);
    close(store.SCN_55C.node_temperatures_C.SRC, 65);
    close(store.SCN_25C.node_temperatures_C.SRC, 35);
  });
});

// --- Pre-solve checks (07 §4) ----------------------------------------------

describe('Pre-solve checks (07 §4)', () => {
  const ambient = node('AMB', { ambient: true });

  it('blocks when no heat source is active', () => {
    const net = network([node('A'), ambient], [edge('E1', 'A', 'AMB', 1)]);
    const { checks } = solve(net, 20);
    expect(checks.can_solve).toBe(false);
    expect(checks.errors.map((entry) => entry.code)).toContain('no_heat_source');
  });

  it('blocks when an active edge has no value in its active Rth source', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', null)],
    );
    const { checks } = solve(net, 20);
    expect(checks.errors.map((entry) => entry.code)).toContain('active_rth_unresolved');
    expect(checks.errors.find((e) => e.code === 'active_rth_unresolved')?.edge_id).toBe('E1');
  });

  it('blocks a non-positive resistance', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', 0)],
    );
    const { checks } = solve(net, 20);
    // 0 is a stored value, not a missing one, so it is reported as what it is.
    expect(checks.errors.map((entry) => entry.code)).toContain('active_rth_non_positive');
  });

  it('blocks a self loop', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', 1), edge('E_LOOP', 'SRC', 'SRC', 1)],
    );
    const { checks } = solve(net, 20);
    expect(checks.errors.map((entry) => entry.code)).toContain('self_loop');
  });

  it('blocks a missing node reference', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', 1), edge('E_GHOST', 'SRC', 'NOWHERE', 1)],
    );
    const { checks } = solve(net, 20);
    expect(checks.errors.map((entry) => entry.code)).toContain('missing_node_reference');
  });

  it('blocks a non-finite power', () => {
    const bad = node('SRC', { power: 10 });
    bad.power_W = Number.NaN;
    const net = network([bad, ambient], [edge('E1', 'SRC', 'AMB', 1)]);
    const { checks } = solve(net, 20);
    expect(checks.errors.map((entry) => entry.code)).toContain('non_finite_power');
  });

  it('blocks when the scenario has no ambient temperature', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', 1)],
    );
    const outcome = solveScenario({
      network: net,
      boundarySet: createBoundarySet({
        projectId: 'TEST',
        networkId: 'Main Thermal Network',
        scenarioId: 'SCN_A',
        topologyVersion: 1,
      }),
      ports: deriveBoundaryPorts(net),
      scenarioId: 'SCN_A',
    });
    expect(outcome.checks.errors.map((entry) => entry.code)).toContain('ambient_not_configured');
    expect(outcome.checks.errors.map((entry) => entry.code)).toContain('no_fixed_boundary');
    expect(outcome.solution.status).toBe('FAILED');
  });

  it('blocks a heat source with no path to a boundary', () => {
    const net = network(
      [node('SRC', { power: 10 }), node('ORPHAN', { power: 5 }), ambient],
      [edge('E1', 'SRC', 'AMB', 1)],
    );
    const { checks } = solve(net, 20);
    expect(checks.errors.map((entry) => entry.code)).toContain('no_path_to_sink');
  });

  it('warns, without blocking, about a low-confidence resistance', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', 1, { rth: createRth(1, 'Analytical', 'low') })],
    );
    const { checks, solution } = solve(net, 20);
    expect(checks.can_solve).toBe(true);
    expect(checks.warnings.map((entry) => entry.code)).toContain('low_confidence_rth');
    expect(solution.status).toBe('WARNING');
  });

  it('warns about a manual resistance with no reference', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', 1, { rth: createRth(1, 'Manual', 'high') })],
    );
    const { checks } = solve(net, 20);
    expect(checks.warnings.map((entry) => entry.code)).toContain('manual_rth_without_reference');
    expect(checks.can_solve).toBe(true);
  });

  it('warns about a resistance far outside the usual range', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', 5000)],
    );
    const { checks } = solve(net, 20);
    expect(checks.warnings.map((entry) => entry.code)).toContain('rth_out_of_usual_range');
  });

  it('leaves a disabled edge out of the active network', () => {
    const net = network(
      [node('SRC', { power: 10 }), ambient],
      [edge('E1', 'SRC', 'AMB', 1), edge('E_OFF', 'SRC', 'AMB', null, { enabled: false })],
    );
    const { checks, solution } = solve(net, 20);
    expect(checks.can_solve).toBe(true);
    expect(solution.edge_results.E_OFF).toBeUndefined();
  });

  it('drops a disabled node and its edges (05 §51)', () => {
    const disabled = { ...node('DEAD', { power: 99 }), disabled: true };
    const net = network(
      [node('SRC', { power: 10 }), disabled, ambient],
      [edge('E1', 'SRC', 'AMB', 1), edge('E_DEAD', 'DEAD', 'AMB', null)],
    );
    const { solution } = solve(net, 20);
    expect(solution.status).not.toBe('FAILED');
    close(solution.energy_balance.generated_W, 10);
    expect(solution.node_temperatures_C.DEAD).toBeUndefined();
  });
});

// --- Screen 06 hand-over (07 §12) ------------------------------------------

describe('Scenario boundary conditions feed the solve (07 §12)', () => {
  /** Fin surface → ambient, the shape Screen 05 actually produces. */
  function boundaryNetwork(): ThermalNetwork {
    return network(
      [
        node('SRC', { power: 10 }),
        node('FIN', { type: 'fin_surface' }),
        node('AMB', { ambient: true }),
      ],
      [
        edge('E_SRC_FIN', 'SRC', 'FIN', 1),
        edge('E_BOUNDARY', 'FIN', 'AMB', null, {
          type: 'custom',
          method: 'convection_hA',
          resolution: 'unresolved',
        }),
      ],
    );
  }

  function withConvection(
    scenarioId: string,
    ambient_C: number,
    h: number,
    area: number,
    port: BoundaryPort,
  ): ScenarioBoundaryConditionSet {
    const set = ambientOnly(scenarioId, ambient_C);
    set.profiles = [
      {
        id: 'P_CONV',
        name: 'Fin convection',
        type: 'convection_to_ambient',
        representation: 'single_combined_edge',
        parameters: { h_W_m2K: h, area_m2: area },
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

  it('blocks the solve while the boundary edge has no scenario condition', () => {
    const net = boundaryNetwork();
    const { checks } = solve(net, 20);
    expect(checks.can_solve).toBe(false);
    expect(checks.errors.map((entry) => entry.code)).toContain('boundary_not_configured');
    expect(checks.errors.find((e) => e.code === 'boundary_not_configured')?.fix_in).toBe('06');
  });

  it('uses the current scenario R = 1/(hA) on the boundary edge', () => {
    const net = boundaryNetwork();
    const ports = deriveBoundaryPorts(net);
    const finPort = ports.find((port) => port.connected_node_id === 'FIN') as BoundaryPort;
    // h = 10, A = 0.5 → R = 0.2 °C/W.
    const set = withConvection('SCN_A', 20, 10, 0.5, finPort);

    const outcome = solveScenario({ network: net, boundarySet: set, ports, scenarioId: 'SCN_A' });
    expect(outcome.checks.can_solve).toBe(true);
    close(outcome.solution.edge_results.E_BOUNDARY.active_rth_C_per_W, 0.2, 1e-12);
    expect(outcome.solution.edge_results.E_BOUNDARY.rth_origin).toBe('boundary_scenario');
    // FIN = 20 + 10 × 0.2 = 22, SRC = 22 + 10 × 1 = 32.
    close(outcome.solution.node_temperatures_C.FIN, 22, 1e-9);
    close(outcome.solution.node_temperatures_C.SRC, 32, 1e-9);
  });

  it('never lets one scenario read another scenario boundary Rth', () => {
    const net = boundaryNetwork();
    const ports = deriveBoundaryPorts(net);
    const finPort = ports.find((port) => port.connected_node_id === 'FIN') as BoundaryPort;

    const still = solveScenario({
      network: net,
      boundarySet: withConvection('SCN_STILL', 20, 5, 0.5, finPort),
      ports,
      scenarioId: 'SCN_STILL',
    });
    const windy = solveScenario({
      network: net,
      boundarySet: withConvection('SCN_WIND', 20, 25, 0.5, finPort),
      ports,
      scenarioId: 'SCN_WIND',
    });

    close(still.solution.edge_results.E_BOUNDARY.active_rth_C_per_W, 0.4, 1e-12);
    close(windy.solution.edge_results.E_BOUNDARY.active_rth_C_per_W, 0.08, 1e-12);
    expect(still.solution.node_temperatures_C.FIN).toBeGreaterThan(
      windy.solution.node_temperatures_C.FIN,
    );
    // And the stored topology still carries no scenario resistance at all.
    expect(net.edges.E_BOUNDARY.scenario_overrides).toBeUndefined();
  });

  it('injects solar as an external heat input, not as component power', () => {
    const net = boundaryNetwork();
    const ports = deriveBoundaryPorts(net);
    const finPort = ports.find((port) => port.connected_node_id === 'FIN') as BoundaryPort;
    const set = withConvection('SCN_SUN', 20, 10, 0.5, finPort);

    set.profiles.push({
      id: 'P_SOLAR',
      name: 'Fin solar',
      type: 'solar_load',
      representation: 'external_load_only',
      parameters: {
        irradiance_W_m2: 1000,
        receivingArea_m2: 0.5,
        absorptivity: 0.4,
        projectedAreaFactor: 1,
        shadingFactor: 1,
      },
      source: 'assumed',
      confidence: 'low',
    });
    set.assignments[0].profile_ids = ['P_CONV', 'P_SOLAR'];

    const outcome = solveScenario({
      network: net,
      boundarySet: set,
      ports,
      scenarioId: 'SCN_SUN',
      powerScale: 2,
    });

    // Component 10 W × 2 = 20 W; solar 1000 × 0.5 × 0.4 = 200 W, unscaled.
    close(outcome.solution.energy_balance.component_W, 20, 1e-9);
    close(outcome.solution.energy_balance.solar_W, 200, 1e-9);
    close(outcome.solution.energy_balance.generated_W, 220, 1e-9);
    close(outcome.solution.energy_balance.rejected_W, 220, 1e-9);
    expect(outcome.solution.energy_balance.grade).toBe('green');
  });

  it('honours a fixed-temperature boundary profile', () => {
    const net = boundaryNetwork();
    const ports = deriveBoundaryPorts(net);
    const finPort = ports.find((port) => port.connected_node_id === 'FIN') as BoundaryPort;
    const set = withConvection('SCN_FIX', 20, 10, 0.5, finPort);
    set.profiles.push({
      id: 'P_FIX',
      name: 'Clamped fin',
      type: 'fixed_temperature_boundary',
      representation: 'fixed_temperature_reservoir',
      parameters: { fixedTemperature_C: 60 },
      source: 'manual',
      confidence: 'high',
    });
    set.assignments[0].profile_ids = ['P_CONV', 'P_FIX'];

    const outcome = solveScenario({ network: net, boundarySet: set, ports, scenarioId: 'SCN_FIX' });
    close(outcome.solution.node_temperatures_C.FIN, 60, 1e-9);
    close(outcome.solution.node_temperatures_C.SRC, 70, 1e-9);
  });

  it('treats an adiabatic port as no flow rather than a huge resistance', () => {
    const net = boundaryNetwork();
    const ports = deriveBoundaryPorts(net);
    const finPort = ports.find((port) => port.connected_node_id === 'FIN') as BoundaryPort;
    const set = ambientOnly('SCN_ADIA', 20);
    set.profiles = [
      {
        id: 'P_ADIA',
        name: 'Insulated fin',
        type: 'adiabatic_symmetry',
        representation: 'adiabatic_no_flow',
        parameters: { reason: 'symmetry plane' },
        source: 'manual',
        confidence: 'high',
      },
    ];
    set.assignments = [
      {
        id: 'A_ADIA',
        boundary_port_id: finPort.id,
        profile_ids: ['P_ADIA'],
        assignment_mode: 'manual',
        enabled: true,
      },
    ];

    const input = buildSolveInput({ network: net, boundarySet: set, ports, scenarioId: 'SCN_ADIA' });
    expect(input.adiabatic_edge_ids).toContain('E_BOUNDARY');
    expect(input.network.edges.E_BOUNDARY.enabled).toBe(false);

    // With the only exit closed the source has nowhere to reject heat, and that
    // is reported rather than papered over.
    const checks = runPreSolveChecks(input);
    expect(checks.can_solve).toBe(false);
    expect(checks.errors.map((entry) => entry.code)).toContain('no_path_to_sink');
  });
});

// --- Rule 4 ----------------------------------------------------------------

describe('Rule 4 protection (07 §43)', () => {
  it('computes Q from a known R, and never a segment R from a total power', () => {
    const net = network(
      [
        node('SRC', { power: 30 }),
        node('SPLIT'),
        node('L'),
        node('R'),
        node('AMB', { ambient: true }),
      ],
      [
        edge('E_IN', 'SRC', 'SPLIT', 0.5),
        edge('E_L', 'SPLIT', 'L', 1),
        edge('E_R', 'SPLIT', 'R', 3),
        edge('E_L_AMB', 'L', 'AMB', 1),
        edge('E_R_AMB', 'R', 'AMB', 1),
      ],
    );

    const { solution } = solve(net, 20);
    const left = solution.edge_results.E_L;
    const right = solution.edge_results.E_R;

    // The branch split is SOLVED, not assumed: the two legs carry different Q.
    close(left.heat_flow_W + right.heat_flow_W, 30, 1e-9);
    expect(left.heat_flow_W).toBeGreaterThan(right.heat_flow_W);

    // Every reported Q is consistent with ITS OWN segment resistance.
    for (const result of Object.values(solution.edge_results)) {
      close(result.heat_flow_W, result.delta_T_C / result.active_rth_C_per_W, 1e-9);
    }

    // The naive violation — ΔT over the component's total power — would give a
    // different number for this segment, which is exactly why it is forbidden.
    const naive = left.delta_T_C / 30;
    expect(Math.abs(naive - left.active_rth_C_per_W)).toBeGreaterThan(1e-6);
  });
});

// --- Energy balance grading -------------------------------------------------

describe('Energy balance grading (07 §18)', () => {
  it('grades a clean solve green', () => {
    const net = network(
      [node('SRC', { power: 10 }), node('AMB', { ambient: true })],
      [edge('E1', 'SRC', 'AMB', 1)],
    );
    const { solution } = solve(net, 20);
    expect(solution.energy_balance.grade).toBe('green');
    expect(solution.status).toBe('SOLVED');
  });

  it('uses the network solver settings as the thresholds', () => {
    const net = network(
      [node('SRC', { power: 10 }), node('AMB', { ambient: true })],
      [edge('E1', 'SRC', 'AMB', 1)],
    );
    net.solver_settings = { ...DEFAULT_SOLVER_SETTINGS, energy_warn_pct: 0, energy_error_pct: 0 };
    const { solution } = solve(net, 20);
    // A perfect balance is still 0 %, so a zero threshold must not trip.
    expect(solution.energy_balance.error_pct).toBe(0);
    expect(solution.energy_balance.grade).toBe('green');
  });
});

// --- checkScenario ----------------------------------------------------------

describe('checkScenario (07 §9 Pre-Solve Check)', () => {
  it('reports without producing a solution', () => {
    const net = network(
      [node('SRC', { power: 10 }), node('AMB', { ambient: true })],
      [edge('E1', 'SRC', 'AMB', 1)],
    );
    const { checks, input, signature } = checkScenario({
      network: net,
      boundarySet: ambientOnly('SCN_A', 20),
      ports: deriveBoundaryPorts(net),
      scenarioId: 'SCN_A',
    });
    expect(checks.can_solve).toBe(true);
    expect(checks.stats.heat_sources).toBe(1);
    expect(checks.stats.fixed_nodes).toBe(1);
    expect(checks.stats.active_edges).toBe(1);
    expect(signature).toBe(solveInputSignature(input));
  });
});
