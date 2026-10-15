/**
 * Heat-share spreading domains — see `spreadingDomain.ts`.
 *
 * The network is the one `spreadingBiot.test.ts` uses, with more than one part
 * on the plate, because a share only means something when the base is shared:
 * a 100 W part and a 10 W part spreading into one base, a fin path and a
 * convection boundary from the scenario.
 */

import { describe, expect, it } from 'vitest';

import { defaultMaterials } from '@/domain/materials';

import { createRth } from '../rth';
import { discSpreadingResistance } from '../resistance/spreading';
import {
  DEFAULT_SOLVER_SETTINGS,
  type ThermalEdge,
  type ThermalNetwork,
  type ThermalNode,
} from '../types';
import {
  createBoundarySet,
  type BoundaryPort,
  type ScenarioBoundaryConditionSet,
} from '../boundary/types';
import { deriveBoundaryPorts } from '../boundary/boundaryPorts';

import { solveScenario } from './solveScenario';

const PLATE_MM2 = 300 * 220;
const SOURCE_MM2 = 30 * 30;
const THICKNESS_MM = 7;
const K = 150;
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

function spreading(
  id: string,
  from: string,
  domain?: 'HeatShare' | 'Manual',
  plate = PLATE_MM2,
): ThermalEdge {
  const params: NonNullable<ThermalEdge['parameters']> = {
    source_area_mm2: SOURCE_MM2,
    plate_area_mm2: plate,
    thickness_mm: THICKNESS_MM,
    k_W_mK: K,
    psi_variant: 'max',
  };
  if (domain) {
    params.spreading_domain = domain;
    params.base_area_mm2 = PLATE_MM2;
  }
  return {
    id,
    from,
    to: 'BASE',
    type: 'spreading',
    method: 'spreading_disc',
    rth: createRth(
      discSpreadingResistance({
        source_area_mm2: SOURCE_MM2,
        plate_area_mm2: plate,
        thickness_mm: THICKNESS_MM,
        k_W_mK: K,
        variant: 'max',
      })!.R_C_per_W,
      'Analytical',
      'medium',
    ),
    parameters: params,
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
  };
}

function plain(
  id: string,
  from: string,
  to: string,
  R: number | null,
  method: ThermalEdge['method'] = 'direct_rth',
): ThermalEdge {
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

/** A 100 W and a 10 W part on one base; `smallDomain` is the 10 W part's choice. */
function sharedBase(smallDomain?: 'HeatShare' | 'Manual', manualPlate?: number): ThermalNetwork {
  return network(
    [
      node('BIG', { power: 100 }),
      node('SMALL', { power: 10 }),
      node('BASE', { type: 'heat_sink_base' }),
      node('FIN', { type: 'fin_surface' }),
      node('AMB', { ambient: true }),
    ],
    [
      spreading('E_BIG', 'BIG'),
      spreading('E_SMALL', 'SMALL', smallDomain, manualPlate),
      plain('E_FIN', 'BASE', 'FIN', 0.03),
      plain('E_BOUNDARY', 'FIN', 'AMB', null, 'convection_hA'),
    ],
  );
}

function boundary(scenarioId: string, port: BoundaryPort): ScenarioBoundaryConditionSet {
  const set = createBoundarySet({
    projectId: 'TEST',
    networkId: 'Main Thermal Network',
    scenarioId,
    topologyVersion: 1,
    ambient_C: 45,
  });
  set.profiles = [
    {
      id: 'P_CONV',
      name: 'Fin convection',
      type: 'convection_to_ambient',
      representation: 'single_combined_edge',
      parameters: { h_W_m2K: 8, area_m2: FIN_AREA_M2 },
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

function solve(net: ThermalNetwork, scenarioId = 'SCN_A') {
  const ports = deriveBoundaryPorts(net);
  const finPort = ports.find((port) => port.connected_node_id === 'FIN') as BoundaryPort;
  return solveScenario({
    materials: defaultMaterials(),
    network: net,
    boundarySet: boundary(scenarioId, finPort),
    ports,
    scenarioId,
  });
}

/** Heat arriving at BASE in a solution, W. */
function inflowToBase(net: ThermalNetwork, edgeResults: Record<string, { heat_flow_W: number }>) {
  let total = 0;
  for (const edge of Object.values(net.edges)) {
    const q = edgeResults[edge.id]?.heat_flow_W ?? 0;
    if (edge.to === 'BASE' && q > 0) total += q;
    if (edge.from === 'BASE' && q < 0) total -= q;
  }
  return total;
}

describe('heat-share spreading domains', () => {
  it('sizes the domain from the solved share of the heat entering the base', () => {
    const outcome = solve(sharedBase('HeatShare'));
    const domain = outcome.spreading_domains.find((entry) => entry.edge_id === 'E_SMALL')!;

    // Both parts have one way into the base, so the solved share is 10 / 110.
    expect(domain.heat_share).toBeCloseTo(10 / 110, 9);
    expect(domain.plate_area_mm2).toBeCloseTo((PLATE_MM2 * 10) / 110, 6);
    expect(domain.base_area_mm2).toBe(PLATE_MM2);
    expect(domain.converged).toBe(true);
    expect(outcome.input.network.edges.E_SMALL.parameters?.plate_area_mm2).toBeCloseTo(
      (PLATE_MM2 * 10) / 110,
      6,
    );
  });

  it('cools the part it applies to and leaves the base and its neighbour alone', () => {
    const whole = solve(sharedBase());
    const shared = solve(sharedBase('HeatShare'));
    const T = (outcome: ReturnType<typeof solve>, id: string) =>
      outcome.solution.node_temperatures_C[id];

    expect(T(shared, 'SMALL')).toBeLessThan(T(whole, 'SMALL') - 0.1);
    expect(T(shared, 'BASE')).toBeCloseTo(T(whole, 'BASE'), 9);
    expect(T(shared, 'BIG')).toBeCloseTo(T(whole, 'BIG'), 9);
  });

  // h is the base's, not the domain's: the fins cool the whole base whichever
  // part the heat came from. Only b — the radius the series spreads over — is
  // the domain's, and so Bi drops with it.
  it('takes the far-face h off the whole base and Bi off the domain radius', () => {
    const outcome = solve(sharedBase('HeatShare'));
    const big = outcome.solution.edge_results.E_BIG.spreading_biot!;
    const small = outcome.solution.edge_results.E_SMALL.spreading_biot!;
    const plate = outcome.input.network.edges.E_SMALL.parameters!.plate_area_mm2 as number;

    expect(small.h_eff_W_m2K).toBeCloseTo(big.h_eff_W_m2K, 9);
    expect(small.bi).toBeCloseTo((small.h_eff_W_m2K * Math.sqrt(plate / 1e6 / Math.PI)) / K, 9);
    // "Before" is the Bi → ∞ value of the DOMAIN, not of the whole base.
    expect(small.R_bi_infinite_C_per_W).toBeCloseTo(
      discSpreadingResistance({
        source_area_mm2: SOURCE_MM2,
        plate_area_mm2: plate,
        thickness_mm: THICKNESS_MM,
        k_W_mK: K,
        variant: 'max',
      })!.R_C_per_W,
      9,
    );
  });

  /**
   * 00 Rule 4. A part with a parallel route into the base — an FPGA on a heat
   * pipe — hands the base most of its power through the pipe, so its spreading
   * edge's share is not its power's share. And shrinking the domain lowers that
   * edge's resistance, which moves heat off the pipe and onto it: the share has
   * to be found as a fixed point.
   */
  it('uses the edge’s solved flow, not the part’s power, and settles on a fixed point', () => {
    const net = sharedBase();
    net.nodes.FPGA = node('FPGA', { power: 30 });
    net.edges.E_FPGA = spreading('E_FPGA', 'FPGA', 'HeatShare');
    net.edges.E_PIPE = plain('E_PIPE', 'FPGA', 'BASE', 0.06);

    const outcome = solve(net);
    const domain = outcome.spreading_domains.find((entry) => entry.edge_id === 'E_FPGA')!;
    const results = outcome.solution.edge_results;
    const q = results.E_FPGA.heat_flow_W;

    expect(q).toBeGreaterThan(0);
    expect(q).toBeLessThan(30 - 1);
    expect(domain.converged).toBe(true);
    // At the fixed point the domain IS the edge's share of the final solve.
    const share = q / inflowToBase(outcome.input.network, results);
    expect(Math.abs(domain.plate_area_mm2 / (PLATE_MM2 * share) - 1)).toBeLessThan(0.01);
    // And that share is not the part's share of the power.
    expect(Math.abs(share - 30 / 140)).toBeGreaterThan(0.01);
  });

  it('keeps the whole base for an edge that carries heat out of it', () => {
    const net = sharedBase();
    // A passive part with its own way to ambient, like a filter's outer skin:
    // the base pushes heat into it.
    net.nodes.SINK = node('SINK');
    net.edges.E_SINK = spreading('E_SINK', 'SINK', 'HeatShare');
    net.edges.E_SINK_OUT = plain('E_SINK_OUT', 'SINK', 'AMB', 1.0);
    net.nodes.AMB.boundary_type = 'fixed_temperature';
    net.nodes.AMB.fixed_temperature_C = 45;

    const outcome = solve(net);
    const domain = outcome.spreading_domains.find((entry) => entry.edge_id === 'E_SINK')!;
    expect(outcome.solution.edge_results.E_SINK.heat_flow_W).toBeLessThan(0);
    expect(domain.reverse).toBe(true);
    expect(domain.plate_area_mm2).toBe(PLATE_MM2);
    expect(outcome.solution.warnings.some((w) => w.code === 'spreading_domain_reverse')).toBe(true);
  });

  it('never shrinks a domain below the contact patch', () => {
    const net = sharedBase('HeatShare');
    net.nodes.SMALL.power_W = 0.01;
    const domain = solve(net).spreading_domains.find((entry) => entry.edge_id === 'E_SMALL')!;
    expect(domain.plate_area_mm2).toBe(SOURCE_MM2);
  });
});

describe('what the solve says about reduced domains', () => {
  it('names every part spreading into less than the whole base', () => {
    const outcome = solve(sharedBase('HeatShare'));
    const note = outcome.solution.warnings.find((w) => w.code === 'spreading_domain_reduced')!;
    expect(note.severity).toBe('info');
    expect(note.message).toContain('SMALL — own share of the heat');
    expect(note.message).toContain('(9.1 %)');
    expect(note.message_zh).toContain('依熱量分配');
    // The same note reaches the fresh-run panel through the checks.
    expect(outcome.checks.infos.some((w) => w.code === 'spreading_domain_reduced')).toBe(true);
    expect(outcome.solution.edge_results.E_SMALL.spreading_domain).toMatchObject({
      mode: 'HeatShare',
      base_area_mm2: PLATE_MM2,
      reverse: false,
    });
    expect(outcome.solution.edge_results.E_BIG.spreading_domain).toBeUndefined();
  });

  it('lists a stated area without resizing it', () => {
    const outcome = solve(sharedBase('Manual', 9000));
    const domain = outcome.spreading_domains.find((entry) => entry.edge_id === 'E_SMALL')!;
    expect(domain).toMatchObject({ mode: 'Manual', plate_area_mm2: 9000, heat_share: null });
    expect(
      outcome.solution.warnings.find((w) => w.code === 'spreading_domain_reduced')!.message,
    ).toContain('SMALL — stated area, 9,000 mm²');
  });

  it('says nothing when every part spreads into the whole base', () => {
    const outcome = solve(sharedBase());
    expect(outcome.spreading_domains).toEqual([]);
    expect(outcome.solution.warnings.some((w) => w.code.startsWith('spreading_domain'))).toBe(
      false,
    );
  });

  // Switching a part onto a heat share moves no resistance before the solve,
  // so the signature has to see the mode itself or the old result reads current.
  it('changes the input signature when a part moves onto a heat share', () => {
    expect(solve(sharedBase('HeatShare')).signature).not.toBe(solve(sharedBase()).signature);
  });
});
