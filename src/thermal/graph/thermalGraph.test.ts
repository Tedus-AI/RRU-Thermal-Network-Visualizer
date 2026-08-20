import { describe, expect, it } from 'vitest';

import { buildComponentSubgraph, missingRequirements, previewGeneration } from './networkBuilder';
import { buildSharedStructure, createSpreadingEdge } from './sharedStructure';
import { validateGraph, networkKpis } from './graphValidation';
import { edgeId, instanceKeys, instanceMultiplier, nodeId } from './idFactory';
import { getTemplate, TEMPLATE_LIST } from '../templates/templateRegistry';
import { computeRth, conductionRth, spreadingRth, timRth } from '../resistance/calculators';
import { emptyNetwork } from '@/data/networkStore';
import { activeRth } from '../rth';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '../types';
import {
  emptyArchitecturePrep,
  emptyExternalMappings,
  emptyThermalSpec,
  type Component,
} from '@/domain/component';
import { sourced } from '@/domain/sourcedValue';

function component(overrides: Partial<Component> = {}): Component {
  return {
    id: 'CMP_FINAL_PA',
    name: 'Final PA',
    category: 'RF',
    enabled: true,
    qty: 4,
    power_W: sourced(52.13, 'Datasheet'),
    thermal_spec: {
      ...emptyThermalSpec(),
      limit_type: 'Tj',
      limit_C: sourced(180, 'Datasheet'),
      r_jc_C_per_W: sourced(0.35, 'Datasheet'),
      package_type: 'QFN',
      geometry: { ...emptyThermalSpec().geometry, contact_L_mm: 20, contact_W_mm: 10 },
      tim: {
        ...emptyThermalSpec().tim,
        type: 'Grease',
        k_W_mK: sourced(3, 'Vendor'),
        thickness_mm: sourced(0.1, 'Vendor'),
      },
    },
    architecture_prep: {
      ...emptyArchitecturePrep(),
      template_preference: 'BOTTOM_COOL_COIN',
      qty_model_preference: 'INDIVIDUAL',
      preferred_base_zone: 'RF Left',
    },
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-01-01T00:00:00Z',
    },
    external_mappings: emptyExternalMappings(),
    ...overrides,
  };
}

function toNetwork(nodes: ThermalNode[], edges: ThermalEdge[]): ThermalNetwork {
  const network = emptyNetwork('TEST');
  for (const node of nodes) network.nodes[node.id] = node;
  for (const edge of edges) network.edges[edge.id] = edge;
  return network;
}

// --- Templates -------------------------------------------------------------

describe('architecture templates', () => {
  it('provides the six built-in templates plus Custom (05 §8)', () => {
    const ids = TEMPLATE_LIST.map((template) => template.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'BOTTOM_COOL_COIN',
        'BOTTOM_COOL_VIA',
        'TOP_COOL_LID',
        'BARE_DIE',
        'SMALL_BASE_HEAT_PIPE',
        'DIRECT_METAL',
      ]),
    );
  });

  it('never hard-codes a Main Base or any shared node (05 §10, §61)', () => {
    for (const template of TEMPLATE_LIST) {
      const roles = new Set(template.nodes.map((node) => node.role));
      const portKinds = new Set(template.ports.map((port) => port.kind));

      for (const edge of template.edges) {
        // Every edge target is either a node in the template or one of its ports.
        expect(roles.has(edge.toRole) || portKinds.has(edge.toRole as never)).toBe(true);
      }
      // No template may name a shared-structure node.
      const serialized = JSON.stringify(template);
      expect(serialized).not.toContain('MAIN_BASE');
      expect(serialized).not.toContain('NODE_ZONE');
      expect(serialized).not.toContain('HSK_BASE');
    }
  });

  it('exposes at least one required port per template (05 §32)', () => {
    for (const template of TEMPLATE_LIST) {
      expect(template.ports.some((port) => port.required)).toBe(true);
    }
  });

  it('reports missing component requirements before applying (05 §12, AC-05-10)', () => {
    const bare = component({ thermal_spec: emptyThermalSpec() });
    const missing = missingRequirements(bare, getTemplate('BOTTOM_COOL_COIN')!);
    expect(missing.map((field) => field.label)).toEqual(
      expect.arrayContaining(['Rjc', 'Contact area', 'TIM k']),
    );
  });
});

// --- Qty representation ----------------------------------------------------

describe('quantity representation (05 §7)', () => {
  it('AGGREGATE makes one source carrying the whole component power', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const sources = graph.nodes.filter((node) => node.power_W > 0);
    expect(sources).toHaveLength(1);
    expect(sources[0].power_W).toBeCloseTo(4 * 52.13, 4);
  });

  it('INDIVIDUAL makes one subgraph per device, each at the per-device power', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'INDIVIDUAL',
    })!;
    const sources = graph.nodes.filter((node) => node.power_W > 0);
    expect(sources).toHaveLength(4);
    for (const source of sources) expect(source.power_W).toBeCloseTo(52.13, 4);
    expect(graph.binding.instances).toEqual(['1', '2', '3', '4']);
  });

  it('GROUPED splits the devices across groups without losing any power', () => {
    const graph = buildComponentSubgraph(component({ qty: 5 }), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'GROUPED',
      groupCount: 2,
    })!;
    const sources = graph.nodes.filter((node) => node.power_W > 0);
    expect(sources).toHaveLength(2);
    const total = sources.reduce((sum, node) => sum + node.power_W, 0);
    expect(total).toBeCloseTo(5 * 52.13, 4);
  });

  it('accounts for every device in each representation', () => {
    for (const model of ['AGGREGATE', 'INDIVIDUAL', 'GROUPED'] as const) {
      const graph = buildComponentSubgraph(component(), {
        templateId: 'BOTTOM_COOL_COIN',
        qtyModel: model,
      })!;
      const total = graph.nodes.reduce((sum, node) => sum + node.power_W, 0);
      expect(total).toBeCloseTo(4 * 52.13, 4);
    }
  });

  it('produces stable ids that survive a rebuild (05 §38, AC-05-23)', () => {
    const first = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'INDIVIDUAL',
    })!;
    const second = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'INDIVIDUAL',
    })!;
    expect(first.nodes.map((n) => n.id)).toEqual(second.nodes.map((n) => n.id));
    expect(nodeId('CMP_FINAL_PA', 'JUNCTION', '1')).toBe('NODE_CMP_FINAL_PA_1_JUNCTION');
    expect(edgeId('CMP_FINAL_PA', 'JUNCTION', 'CASE', '1')).toBe(
      'EDGE_CMP_FINAL_PA_1_JUNCTION_CASE',
    );
  });

  it('splits grouped multipliers to cover the full quantity', () => {
    expect(instanceKeys(4, 'INDIVIDUAL')).toHaveLength(4);
    expect(instanceKeys(4, 'AGGREGATE')).toEqual(['']);
    expect(instanceMultiplier(5, 'GROUPED', 0, 2) + instanceMultiplier(5, 'GROUPED', 1, 2)).toBe(5);
  });
});

// --- Ports and generation --------------------------------------------------

describe('template ports (05 §10, §16)', () => {
  it('ends the subgraph at a port, unconnected until Step 4', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const ports = graph.nodes.flatMap((node) => node.ports ?? []);
    expect(ports).toHaveLength(1);
    expect(ports[0].kind).toBe('HEAT_OUT');
    // Never silently connected, even though 04 suggested a zone.
    expect(ports[0].connected_to).toBeNull();
  });

  it('Small Base + Heat Pipe exposes two parallel outputs (05 §11, AC-05-18)', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'SMALL_BASE_HEAT_PIPE',
      qtyModel: 'AGGREGATE',
    })!;
    const kinds = graph.nodes.flatMap((node) => (node.ports ?? []).map((port) => port.kind));
    expect(kinds).toEqual(expect.arrayContaining(['DIRECT_BASE_OUT', 'HEAT_PIPE_OUT']));
  });

  it('previews generation before anything is committed (05 §49, AC-05-02)', () => {
    const preview = previewGeneration([component(), component({ id: 'CMP_X', name: 'X', qty: 1 })]);
    expect(preview.components_modeled).toBe(2);
    expect(preview.nodes).toBeGreaterThan(0);
    expect(preview.edges).toBeGreaterThan(0);
  });
});

// --- Analytical resistance -------------------------------------------------

describe('analytical edge resistance (05 §21)', () => {
  it('computes L/kA in consistent units', () => {
    // 10 mm through 200 W/mK over 100 mm²: 0.01 / (200 × 1e-4) = 0.5 °C/W.
    const result = conductionRth({ length_mm: 10, k_W_mK: 200, area_mm2: 100 });
    expect(result.value).toBeCloseTo(0.5, 6);
    expect(result.resolution).toBe('resolved');
  });

  it('computes TIM t/kA in consistent units', () => {
    // 0.1 mm through 3 W/mK over 200 mm²: 1e-4 / (3 × 2e-4) ≈ 0.1667 °C/W.
    const result = timRth({ thickness_mm: 0.1, k_W_mK: 3, area_mm2: 200 });
    expect(result.value).toBeCloseTo(0.16667, 4);
  });

  it('leaves an edge unresolved when an input is missing — never zero (AC-05-35)', () => {
    const result = conductionRth({ length_mm: 10, area_mm2: 100 });
    expect(result.value).toBeNull();
    expect(result.value).not.toBe(0);
    expect(result.resolution).toBe('unresolved');
    expect(result.missing).toContain('k_W_mK');
  });

  it('refuses to substitute L/kA for spreading resistance (05 §21, AC-05-33)', () => {
    const result = spreadingRth({ length_mm: 10, k_W_mK: 200, area_mm2: 100 });
    expect(result.value).toBeNull();
    expect(result.note).toContain('L/kA is not a substitute');
  });

  it('keeps boundary-derived edges unresolved until Screen 06 (AC-05-34)', () => {
    const result = computeRth('convection_hA', { h_W_m2K: 10, area_mm2: 5000 });
    expect(result.value).toBeNull();
    expect(result.note).toContain('Screen 06');
  });

  it('seeds package Rjc straight from the component (AC-05-28)', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const rjcEdge = graph.edges.find((edge) => edge.type === 'package_rjc')!;
    expect(activeRth(rjcEdge.rth)).toBeCloseTo(0.35, 6);
    expect(rjcEdge.resolution).toBe('resolved');
  });

  it('leaves the TIM edge resolved when the component supplies k, t and area', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const tim = graph.edges.find((edge) => edge.type === 'tim')!;
    // 0.1 mm / (3 W/mK × 200 mm²) ≈ 0.1667 °C/W.
    expect(activeRth(tim.rth)).toBeCloseTo(0.16667, 4);
  });

  it('leaves a component without Rjc unresolved rather than zero (05 §59 case F)', () => {
    const noRjc = component({
      thermal_spec: { ...component().thermal_spec, r_jc_C_per_W: null },
    });
    const graph = buildComponentSubgraph(noRjc, {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const rjcEdge = graph.edges.find((edge) => edge.type === 'package_rjc')!;
    expect(activeRth(rjcEdge.rth)).toBeNull();
    expect(rjcEdge.resolution).toBe('unresolved');
  });
});

// --- Shared structure ------------------------------------------------------

describe('shared structure (05 §13, §14, §15)', () => {
  it('builds every preset with a boundary placeholder tail', () => {
    for (const preset of [
      'SINGLE_MAIN_BASE',
      'THREE_ZONE',
      'FUNCTIONAL_ZONES',
      'SMALL_BASE_MAIN_BASE',
      'HEAT_PIPE_MAIN_BASE',
    ] as const) {
      const structure = buildSharedStructure(preset);
      expect(structure.nodes.some((node) => node.boundary_role === 'placeholder')).toBe(true);
      expect(structure.nodes.some((node) => node.type === 'fin_surface')).toBe(true);
    }
  });

  it('never assumes an ambient temperature or a convection coefficient (05 §15)', () => {
    const structure = buildSharedStructure('SINGLE_MAIN_BASE');
    const ambient = structure.nodes.find((node) => node.boundary_role === 'placeholder')!;
    expect(ambient.fixed_temperature_C ?? null).toBeNull();
    expect(ambient.boundary_type).toBeNull();

    const boundaryEdge = structure.edges.find((edge) => edge.to === ambient.id)!;
    expect(activeRth(boundaryEdge.rth)).toBeNull();
    expect(boundaryEdge.resolution).toBe('unresolved');
    expect(boundaryEdge.resolution_note).toContain('Screen 06');

    // No h, no wind, no solar anywhere in the generated structure. Provenance
    // timestamps are dropped first: an ISO time can contain "55" as a minute or
    // a second, which has nothing to do with a 55 °C ambient.
    const serialized = JSON.stringify(structure, (key, value) =>
      key === 'timestamp' ? undefined : value,
    );
    expect(serialized).not.toMatch(/h_conv|wind|solar/i);
    expect(serialized).not.toContain('55');
  });

  it('gives the heat pipe preset two parallel routes to the main base (05 §59 case C)', () => {
    const structure = buildSharedStructure('HEAT_PIPE_MAIN_BASE');
    const small = structure.nodes.find((node) => node.type === 'small_base')!;
    const main = structure.nodes.find((node) => node.type === 'main_base')!;

    const direct = structure.edges.find((edge) => edge.from === small.id && edge.to === main.id);
    const viaHeatPipe = structure.edges.some((edge) => edge.type === 'heat_pipe');
    expect(direct).toBeDefined();
    expect(viaHeatPipe).toBe(true);
  });

  it('creates functional zones without wiring components to them', () => {
    const structure = buildSharedStructure('FUNCTIONAL_ZONES');
    expect(structure.zones.map((zone) => zone.name)).toEqual(
      expect.arrayContaining(['RF Left', 'RF Right', 'Digital', 'Power', 'Filter']),
    );
  });
});

// --- Graph validation ------------------------------------------------------

describe('graph validation (05 §33, §34, §35)', () => {
  const source = (id: string, power: number): ThermalNode => ({
    id,
    name: id,
    type: 'junction',
    power_W: power,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
  });

  const passive = (id: string, type: ThermalNode['type'] = 'custom'): ThermalNode => ({
    ...source(id, 0),
    type,
  });

  const link = (id: string, from: string, to: string, R: number | null = 1): ThermalEdge => ({
    id,
    from,
    to,
    type: 'conduction',
    method: 'direct_rth',
    rth: {
      analytical: R,
      flotherm: null,
      measurement: null,
      manual: null,
      active_source: 'Analytical',
      provenance: {},
    },
    parameters: {},
    heat_flow_W: null,
    delta_T_C: null,
    resolution: R == null ? 'unresolved' : 'resolved',
    enabled: true,
  });

  it('flags a heat source with no path at all (AC-05-36)', () => {
    const result = validateGraph(toNetwork([source('J', 10)], []));
    expect(result.issues.some((issue) => issue.code === 'ORPHAN_HEAT_SOURCE')).toBe(true);
    expect(result.canContinue).toBe(false);
  });

  it('flags a heat source that never reaches the boundary side', () => {
    const network = toNetwork([source('J', 10), passive('X')], [link('E', 'J', 'X')]);
    const result = validateGraph(network);
    expect(result.issues.some((issue) => issue.code === 'NO_PATH_TO_BOUNDARY')).toBe(true);
  });

  it('accepts a source that reaches a boundary placeholder', () => {
    const ambient = { ...passive('AMB', 'ambient'), boundary_role: 'placeholder' as const };
    const network = toNetwork([source('J', 10), ambient], [link('E', 'J', 'AMB')]);
    const result = validateGraph(network);
    expect(result.issues.some((issue) => issue.code === 'NO_PATH_TO_BOUNDARY')).toBe(false);
    expect(result.errors).toBe(0);
  });

  it('treats a self-loop as an error and a coupling cycle as legal (AC-05-40, AC-05-41)', () => {
    const selfLoop = validateGraph(toNetwork([passive('A')], [link('E', 'A', 'A')]));
    expect(selfLoop.issues.some((issue) => issue.code === 'SELF_LOOP')).toBe(true);

    // 05 §59 case D — RF_LEFT ↔ DIGITAL ↔ POWER ↔ RF_LEFT is real physics.
    const ambient = { ...passive('AMB', 'ambient'), boundary_role: 'placeholder' as const };
    const cycle = validateGraph(
      toNetwork(
        [passive('RF'), passive('DIG'), passive('PWR'), ambient],
        [
          link('E1', 'RF', 'DIG'),
          link('E2', 'DIG', 'PWR'),
          link('E3', 'PWR', 'RF'),
          link('E4', 'RF', 'AMB'),
        ],
      ),
    );
    expect(cycle.errors).toBe(0);
    expect(cycle.canContinue).toBe(true);
  });

  it('errors on a broken reference and a negative resistance (AC-05-38, AC-05-39)', () => {
    const broken = validateGraph(toNetwork([passive('A')], [link('E', 'A', 'GHOST')]));
    expect(broken.issues.some((issue) => issue.code === 'MISSING_NODE_REFERENCE')).toBe(true);

    const negative = validateGraph(
      toNetwork([passive('A'), passive('B')], [link('E', 'A', 'B', -1)]),
    );
    expect(negative.issues.some((issue) => issue.code === 'NEGATIVE_RTH')).toBe(true);
  });

  it('warns rather than errors on a possible duplicate edge (AC-05-42)', () => {
    const network = toNetwork(
      [passive('A'), passive('B')],
      [link('E1', 'A', 'B'), link('E2', 'A', 'B')],
    );
    const result = validateGraph(network);
    const duplicate = result.issues.find((issue) => issue.code === 'POSSIBLE_DUPLICATE_EDGE');
    expect(duplicate?.severity).toBe('warning');
  });

  it('allows convection and radiation between the same pair (05 §35)', () => {
    const convection = {
      ...link('E1', 'A', 'B'),
      type: 'convection' as const,
      method: 'convection_hA' as const,
    };
    const radiation = {
      ...link('E2', 'A', 'B'),
      type: 'radiation' as const,
      method: 'radiation_hA' as const,
    };
    const result = validateGraph(toNetwork([passive('A'), passive('B')], [convection, radiation]));
    expect(result.issues.some((issue) => issue.code === 'POSSIBLE_DUPLICATE_EDGE')).toBe(false);
  });

  it('blocks Continue on a required unconnected port (AC-05-37, AC-05-44)', () => {
    const node: ThermalNode = {
      ...passive('N'),
      ports: [{ kind: 'HEAT_OUT', required: true, connected_to: null }],
    };
    const result = validateGraph(toNetwork([node], []));
    expect(result.issues.some((issue) => issue.code === 'UNCONNECTED_PORT')).toBe(true);
    expect(result.canContinue).toBe(false);
  });

  it('warns about an unconfigured boundary placeholder (AC-05-43)', () => {
    const ambient = { ...passive('AMB', 'ambient'), boundary_role: 'placeholder' as const };
    const result = validateGraph(toNetwork([ambient], []));
    const issue = result.issues.find((entry) => entry.code === 'BOUNDARY_PLACEHOLDER');
    expect(issue?.severity).toBe('warning');
  });

  it('counts the readiness KPIs (05 §36)', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'INDIVIDUAL',
    })!;
    const network = toNetwork(graph.nodes, graph.edges);
    const kpis = networkKpis(network, 18);
    expect(kpis.componentsModeled).toBe(1);
    expect(kpis.componentsTotal).toBe(18);
    expect(kpis.unconnectedPorts).toBe(4);
    expect(kpis.nodes).toBe(graph.nodes.length);
  });
});

// --- Screen 03 deferred contract -------------------------------------------

describe('03 FloTHERM deferred contract (05 §1)', () => {
  it('keeps multi-source Rth slots on every generated edge (AC-05-51)', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    for (const edge of graph.edges) {
      expect(edge.rth).toHaveProperty('analytical');
      expect(edge.rth).toHaveProperty('flotherm');
      expect(edge.rth).toHaveProperty('measurement');
      expect(edge.rth).toHaveProperty('manual');
    }
  });

  it('never invents an edge heat flow (AC-05-46, AC-05-47)', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    for (const edge of graph.edges) {
      expect(edge.heat_flow_W).toBeNull();
      expect(edge.delta_T_C).toBeNull();
    }
    // Qty × Power appears only on the source node, never on an edge.
    const totalPower = 4 * 52.13;
    expect(graph.edges.some((edge) => edge.heat_flow_W === totalPower)).toBe(false);
  });

  it('does not solve node temperatures (AC-05-45)', () => {
    const graph = buildComponentSubgraph(component(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    for (const node of graph.nodes) expect(node.temperature_C).toBeNull();
  });
});

// --- Spreading edges -------------------------------------------------------

describe('spreading edges (05 §43)', () => {
  it('stays unresolved without a quoted value', () => {
    const edge = createSpreadingEdge('NODE_A', 'NODE_B');
    expect(activeRth(edge.rth)).toBeNull();
    expect(edge.resolution).toBe('unresolved');
    expect(edge.resolution_note).toContain('L/kA');
  });

  it('resolves when a value is supplied by hand', () => {
    const edge = createSpreadingEdge('NODE_A', 'NODE_B', { R_C_per_W: 0.4 });
    expect(activeRth(edge.rth)).toBe(0.4);
    expect(edge.resolution).toBe('resolved');
  });
});
