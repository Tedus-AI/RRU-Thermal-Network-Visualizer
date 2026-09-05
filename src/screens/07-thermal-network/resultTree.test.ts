/**
 * The result tree replaces two flat tables, so the rules that decide WHERE a
 * row lands are the whole of its correctness. Two in particular:
 *
 *   • every edge appears exactly once — a duplicated drop would be read as two
 *     resistances in series that are really one;
 *   • an edge that leaves its component stays in that component's subtree,
 *     rather than surfacing under the shared structure alongside every other
 *     component's outflow.
 */

import { describe, expect, it } from 'vitest';

import { createRth } from '@/thermal/rth';
import { DEFAULT_SOLVER_SETTINGS, type ThermalEdge, type ThermalNetwork, type ThermalNode } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { nodeRows, resultTree, SHARED_STRUCTURE_GROUP_ID } from './resultViewModel';

function node(id: string, overrides: Partial<ThermalNode> = {}): ThermalNode {
  return {
    id,
    name: id,
    type: 'custom',
    power_W: 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    zone_id: null,
    ports: [],
    ...overrides,
  };
}

function edge(id: string, from: string, to: string, rth: number): ThermalEdge {
  return {
    id,
    from,
    to,
    type: 'conduction',
    method: 'direct_rth',
    rth: createRth(rth, 'Analytical', 'high'),
    parameters: {},
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
  };
}

/** One component with two nodes, feeding a shared base that reaches ambient. */
function network(): ThermalNetwork {
  const nodes = [
    node('NODE_J', {
      name: 'FPGA Junction',
      power_W: 35,
      limit_C: 100,
      origin: { kind: 'template', component_id: 'CMP_FPGA' },
    }),
    node('NODE_C', {
      name: 'FPGA Case',
      origin: { kind: 'template', component_id: 'CMP_FPGA' },
    }),
    node('NODE_BASE', { name: 'HSK Base', origin: { kind: 'shared_structure' } }),
    node('NODE_AMB', {
      name: 'Ambient',
      type: 'ambient',
      boundary_role: 'placeholder',
      origin: { kind: 'shared_structure' },
    }),
  ];
  const edges = [
    edge('E_RJC', 'NODE_J', 'NODE_C', 0.3),
    edge('E_OUT', 'NODE_C', 'NODE_BASE', 0.12),
    edge('E_BND', 'NODE_BASE', 'NODE_AMB', 0.14),
  ];
  return {
    schema_version: '1.0',
    project_id: 'P',
    network_name: 'MAIN',
    mode: 'analytical',
    status: 'DRAFT',
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
    edges: Object.fromEntries(edges.map((entry) => [entry.id, entry])),
    templates: {},
    zones: {},
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

const COMPONENTS = [{ id: 'CMP_FPGA', name: 'XCZU67DR', category: 'Digital', qty: 1 }];

function build(solution: ThermalSolution | null = null) {
  const graph = network();
  const rows = nodeRows(graph, solution, { ambient_C: 45, powerScale: 1 });
  return resultTree(graph, solution, rows, COMPONENTS);
}

describe('result tree', () => {
  it('groups nodes under their component, and the structure under its own group', () => {
    const tree = build();
    expect(tree.map((group) => group.id)).toEqual(['CMP_FPGA', SHARED_STRUCTURE_GROUP_ID]);
    expect(tree[0].name).toBe('XCZU67DR');
    // Along the heat path: the junction dissipates, the case is downstream of
    // it. Alphabetically it would be the other way round, which is how the PA
    // came to list its junction third.
    expect(tree[0].nodes.map((entry) => entry.id)).toEqual(['NODE_J', 'NODE_C']);
    // Shared structure has nothing dissipating in it and this fixture is
    // unsolved, so it falls all the way back to the id.
    expect(tree[1].nodes.map((entry) => entry.id)).toEqual(['NODE_AMB', 'NODE_BASE']);
  });

  it('lists every edge exactly once', () => {
    const listed = build()
      .flatMap((group) => group.nodes)
      .flatMap((entry) => entry.edges)
      .map((entry) => entry.id);
    expect([...listed].sort()).toEqual(['E_BND', 'E_OUT', 'E_RJC']);
  });

  it('hangs an in-component drop under the node it explains', () => {
    const fpga = build()[0];
    const caseNode = fpga.nodes.find((entry) => entry.id === 'NODE_C')!;
    // Rjc runs J -> C, so it belongs under C: it is why C is cooler than J.
    expect(caseNode.edges.map((entry) => entry.id)).toContain('E_RJC');
    expect(caseNode.edges.find((entry) => entry.id === 'E_RJC')?.outgoing).toBe(false);
  });

  it('keeps a component’s outflow inside that component, marked as leaving', () => {
    const tree = build();
    const caseNode = tree[0].nodes.find((entry) => entry.id === 'NODE_C')!;
    const outflow = caseNode.edges.find((entry) => entry.id === 'E_OUT');

    expect(outflow?.outgoing).toBe(true);
    expect(outflow?.counterpart_name).toBe('HSK Base');
    // Not under the shared base, where it would sit among every other
    // component's outflow and stop telling you whose heat it is.
    const base = tree[1].nodes.find((entry) => entry.id === 'NODE_BASE')!;
    expect(base.edges.map((entry) => entry.id)).toEqual(['E_BND']);
  });

  it('carries the group’s hottest node and its TIGHTEST margin', () => {
    const solution = {
      node_temperatures_C: { NODE_J: 101, NODE_C: 93.5, NODE_BASE: 80, NODE_AMB: 45 },
      edge_results: {},
      energy_balance: { generated_W: 35 },
    } as unknown as ThermalSolution;

    const fpga = build(solution)[0];
    expect(fpga.peak_C).toBe(101);
    expect(fpga.power_W).toBe(35);
    // Only the junction carries a limit, and 100 - 101 is negative: a group is
    // over limit when ANY node under it is, which averaging would have hidden.
    expect(fpga.margin_C).toBeCloseTo(-1, 10);
    expect(fpga.status).toBe('over');
  });

  it('reads Rth from the topology before a solve, so the tree is not empty', () => {
    const fpga = build()[0];
    const rjc = fpga.nodes
      .flatMap((entry) => entry.edges)
      .find((entry) => entry.id === 'E_RJC')!;

    expect(rjc.rth_C_per_W).toBe(0.3);
    expect(rjc.heat_flow_W).toBeNull();
    expect(rjc.delta_T_C).toBeNull();
  });

  it('names every edge type rather than printing its raw id', () => {
    const rjc = build()[0]
      .nodes.flatMap((entry) => entry.edges)
      .find((entry) => entry.id === 'E_RJC')!;
    expect(rjc.name).toBe('Conduction / 熱傳導');
  });
});
