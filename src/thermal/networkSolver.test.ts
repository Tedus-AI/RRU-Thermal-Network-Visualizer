import { describe, expect, it } from 'vitest';
import { solveNetwork } from './networkSolver';
import { validateNetwork } from './networkValidation';
import { createRth, deriveRthFromDeltaT, effectivePathRja, setRthFromSource } from './rth';
import { DEFAULT_SOLVER_SETTINGS } from './types';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from './types';

function node(id: string, power: number, fixedT?: number): ThermalNode {
  return {
    id,
    name: id,
    type: fixedT != null ? 'ambient' : power > 0 ? 'heat_source' : 'custom',
    power_W: power,
    temperature_C: null,
    temperature_source: null,
    boundary_type: fixedT != null ? 'fixed_temperature' : null,
    fixed_temperature_C: fixedT ?? null,
  };
}

function edge(id: string, from: string, to: string, R: number): ThermalEdge {
  return {
    id,
    from,
    to,
    type: 'conduction',
    method: 'direct_rth',
    rth: createRth(R, 'Analytical', 'medium'),
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
  };
}

function network(nodes: ThermalNode[], edges: ThermalEdge[]): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_name: 'test',
    mode: 'analytical',
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(edges.map((e) => [e.id, e])),
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

describe('solveNetwork', () => {
  it('solves a simple series chain', () => {
    // 10 W through 0.5 + 1.5 °C/W into 25 °C ambient -> junction at 45 °C.
    const net = network(
      [node('J', 10), node('C', 0), node('AMB', 0, 25)],
      [edge('E1', 'J', 'C', 0.5), edge('E2', 'C', 'AMB', 1.5)],
    );
    const result = solveNetwork(net);

    expect(result.ok).toBe(true);
    expect(result.temperatures.J).toBeCloseTo(45, 6);
    expect(result.temperatures.C).toBeCloseTo(40, 6);
    expect(result.edges.E1.heat_flow_W).toBeCloseTo(10, 6);
    expect(result.edges.E1.delta_T_C).toBeCloseTo(5, 6);
    expect(result.energy.error_pct).toBeLessThan(1e-9);
  });

  it('splits heat across a parallel path (00 §6.4)', () => {
    // Two parallel resistors 2 and 3 °C/W -> 1.2 °C/W equivalent, 10 W -> 12 °C rise.
    const net = network(
      [node('SRC', 10), node('AMB', 0, 0)],
      [edge('A', 'SRC', 'AMB', 2), edge('B', 'SRC', 'AMB', 3)],
    );
    const result = solveNetwork(net);

    expect(result.temperatures.SRC).toBeCloseTo(12, 6);
    expect(result.edges.A.heat_flow_W).toBeCloseTo(6, 6);
    expect(result.edges.B.heat_flow_W).toBeCloseTo(4, 6);
    expect(result.edges.A.heat_flow_W + result.edges.B.heat_flow_W).toBeCloseTo(10, 6);
  });

  it('couples components that merge onto a shared base (00 §6.5, §6.6)', () => {
    // Two sources merge on one base; the base sees the sum of both.
    const net = network(
      [node('P1', 30), node('P2', 10), node('BASE', 0), node('AMB', 0, 55)],
      [
        edge('E1', 'P1', 'BASE', 0.2),
        edge('E2', 'P2', 'BASE', 0.2),
        edge('E3', 'BASE', 'AMB', 0.1),
      ],
    );
    const result = solveNetwork(net);

    expect(result.edges.E3.heat_flow_W).toBeCloseTo(40, 6);
    expect(result.temperatures.BASE).toBeCloseTo(55 + 40 * 0.1, 6);
    expect(result.temperatures.P1).toBeCloseTo(59 + 30 * 0.2, 6);
    // P2 is hotter than it would be alone: that is the thermal coupling.
    expect(result.temperatures.P2).toBeCloseTo(59 + 10 * 0.2, 6);
    expect(result.energy.total_rejected_W).toBeCloseTo(40, 6);
  });

  it('applies the scenario power scale', () => {
    const net = network([node('J', 10), node('AMB', 0, 20)], [edge('E', 'J', 'AMB', 1)]);
    expect(solveNetwork(net, { powerScale: 0.5 }).temperatures.J).toBeCloseTo(25, 6);
  });

  it('ignores disabled edges and honours scenario overrides', () => {
    const net = network(
      [node('J', 10), node('AMB', 0, 0)],
      [edge('A', 'J', 'AMB', 1), edge('B', 'J', 'AMB', 1)],
    );
    net.edges.B.enabled = false;
    expect(solveNetwork(net).temperatures.J).toBeCloseTo(10, 6);

    net.edges.A.scenario_overrides = { SCN_X: { R_C_per_W: 2 } };
    expect(solveNetwork(net, { scenarioId: 'SCN_X' }).temperatures.J).toBeCloseTo(20, 6);
  });

  it('fails instead of guessing when a source has no path to a boundary', () => {
    const net = network([node('J', 10), node('AMB', 0, 25)], []);
    const result = solveNetwork(net);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('singular');
  });

  it('reports energy balance status against the configured thresholds', () => {
    const net = network([node('J', 10), node('AMB', 0, 25)], [edge('E', 'J', 'AMB', 1)]);
    const result = solveNetwork(net);
    expect(result.energy.status).toBe('ok');
    expect(result.energy.total_generated_W).toBeCloseTo(10, 6);
    expect(result.max_node_residual_W).toBeLessThan(1e-9);
  });
});

describe('validateNetwork', () => {
  it('blocks a solve with no boundary and flags disconnected sources', () => {
    const net = network([node('J', 10)], []);
    const { issues, canSolve } = validateNetwork(net);
    expect(canSolve).toBe(false);
    expect(issues.map((i) => i.code)).toContain('MISSING_BOUNDARY');
    expect(issues.map((i) => i.code)).toContain('DISCONNECTED_HEAT_SOURCE');
  });

  it('rejects zero and negative resistances', () => {
    const net = network(
      [node('J', 10), node('AMB', 0, 25)],
      [edge('E0', 'J', 'AMB', 0), edge('EN', 'J', 'AMB', -1)],
    );
    const codes = validateNetwork(net).issues.map((i) => i.code);
    expect(codes).toContain('ZERO_RTH');
    expect(codes).toContain('NEGATIVE_RTH');
  });

  it('treats a duplicate node pair as an informational parallel path, not an error', () => {
    const net = network(
      [node('J', 10), node('AMB', 0, 25)],
      [edge('A', 'J', 'AMB', 1), edge('B', 'J', 'AMB', 2)],
    );
    const result = validateNetwork(net);
    expect(result.canSolve).toBe(true);
    expect(result.issues.find((i) => i.code === 'DUPLICATE_EDGE')?.severity).toBe('info');
  });
});

describe('Rule 4 — never derive Rth from ΔT without segment heat flow', () => {
  it('refuses to produce a number when segment Q is unknown', () => {
    const result = deriveRthFromDeltaT({ delta_T_C: 20, segment_Q_W: null });
    expect(result.value).toBeNull();
    expect(result.resolution).toBe('unresolved');
  });

  it('computes the resistance when the segment heat flow is resolved', () => {
    const result = deriveRthFromDeltaT({ delta_T_C: 20, segment_Q_W: 40 });
    expect(result.value).toBeCloseTo(0.5, 9);
    expect(result.resolution).toBe('resolved');
  });

  it('labels temperature-only data as an effective path, not a segment Rth', () => {
    const result = effectivePathRja({
      T_junction_C: 100,
      T_ambient_C: 55,
      component_power_W: 50,
    });
    expect(result.value).toBeCloseTo(0.9, 9);
    expect(result.resolution).toBe('effective_path_only');
  });
});

describe('Rule 9 — analytical, CFD and measured values coexist', () => {
  it('keeps the analytical value when a FloTHERM result is imported', () => {
    const analytical = createRth(0.12, 'Analytical', 'medium', 'hand calc rev A');
    const withCfd = setRthFromSource(analytical, 'FloTHERM', 0.15, 'high', {
      reference: 'EVT2_55C run 3',
      makeActive: true,
    });

    expect(withCfd.analytical).toBe(0.12);
    expect(withCfd.flotherm).toBe(0.15);
    expect(withCfd.active_source).toBe('FloTHERM');
    expect(withCfd.provenance.Analytical?.reference).toBe('hand calc rev A');
    expect(withCfd.provenance.FloTHERM?.confidence).toBe('high');
  });

  it('does not take over the active source unless asked', () => {
    const analytical = createRth(0.12, 'Analytical', 'medium');
    const withCfd = setRthFromSource(analytical, 'FloTHERM', 0.15, 'high');
    expect(withCfd.active_source).toBe('Analytical');
  });
});
