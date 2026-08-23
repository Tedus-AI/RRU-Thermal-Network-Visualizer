import {
  BUILTIN_TIM_IDS,
  DIRECT_CONTACT_TIM_ID,
  MEASURED_INTERFACE_TIM_ID,
} from '@/domain/materials';
import { defaultMaterials } from '@/domain/materials';
import { describe, expect, it } from 'vitest';

import {
  buildComponentSubgraph,
  missingRequirements,
  previewGeneration,
  suggestedZoneFor,
} from './networkBuilder';
import { STRUCTURE_PRESETS, buildSharedStructure, createSpreadingEdge } from './sharedStructure';
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
import { emptyTim } from '@/domain/component';
import { deriveBoundaryPorts } from '../boundary/boundaryPorts';

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
      geometry: {
        ...emptyThermalSpec().geometry,
        // A coin path reads its joint face from the package, so both pairs are
        // stated here and every heat path in this file has what it needs.
        package_L_mm: 20,
        package_W_mm: 10,
        source_L_mm: 20,
        source_W_mm: 10,
        board_thickness_mm: 1.6,
      },
      tim: {
        ...emptyThermalSpec().tim,
        tim_id: BUILTIN_TIM_IDS.grease,
        blt_mm: sourced(0.1, 'Vendor'),
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
        'MODULE_SURFACE_TIM',
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
    const missing = missingRequirements(bare, getTemplate('BOTTOM_COOL_COIN')!, defaultMaterials());
    expect(missing.map((field) => field.label)).toEqual(
      expect.arrayContaining(['Rjc', 'Source area', 'Coin area', 'Coin thickness']),
    );
  });

  it('does not require Rjc for the manufacturer-surface template', () => {
    const module = component({
      qty: 1,
      thermal_spec: {
        ...component().thermal_spec,
        limit_type: 'Ts',
        limit_reference_note: 'Center',
        r_jc_C_per_W: null,
        geometry: {
          ...component().thermal_spec.geometry,
          package_L_mm: 58,
          package_W_mm: 26,
          source_L_mm: null,
          source_W_mm: null,
        },
        heat_path: { type: 'ModuleSurface', parameters: {} },
        tim: { ...emptyTim(BUILTIN_TIM_IDS.grease), blt_mm: sourced(1, 'Datasheet') },
      },
    });
    const template = getTemplate('MODULE_SURFACE_TIM')!;
    expect(missingRequirements(module, template, defaultMaterials())).toEqual([]);
    expect(template.requiredComponentFields.some((field) => field.label === 'Rjc')).toBe(false);
  });
});

describe('Metal Base + Interface template', () => {
  function metalBaseComponent(
    parameters: Record<string, number | string | boolean | null>,
    tim = emptyTim(BUILTIN_TIM_IDS.grease),
  ): Component {
    const base = component();
    return component({
      id: 'CMP_CAVITY_FILTER',
      name: 'Cavity Filter',
      category: 'Filter',
      qty: 1,
      power_W: sourced(13.35, 'Analytical'),
      thermal_spec: {
        ...base.thermal_spec,
        limit_type: 'Tc',
        limit_reference_note: 'Center',
        geometry: {
          ...base.thermal_spec.geometry,
          package_L_mm: 100,
          package_W_mm: 80,
          package_H_mm: 20,
        },
        heat_path: { type: 'DirectMetal', parameters },
        tim: { ...tim, blt_mm: tim.tim_id === BUILTIN_TIM_IDS.grease ? sourced(0.05, 'Vendor') : null },
      },
      architecture_prep: {
        ...base.architecture_prep,
        template_preference: 'DIRECT_METAL',
        qty_model_preference: 'AGGREGATE',
      },
    });
  }

  it('generates the passive body path, TIM HEAT_OUT and an optional exposed-surface boundary', () => {
    const subject = metalBaseComponent({
      source_model: 'SurfaceBodyBased',
      contact_geometry: 'PerimeterFrame',
      perimeter_land_width_mm: 2,
      exposed_surface_enabled: true,
      exposed_area_mode: 'DerivedPackage',
    });
    const graph = buildComponentSubgraph(subject, {
      materials: defaultMaterials(),
      templateId: 'DIRECT_METAL',
      qtyModel: 'AGGREGATE',
    })!;

    expect(graph.nodes.some((node) => node.name.includes('Junction'))).toBe(false);
    expect(graph.nodes.filter((node) => node.power_W > 0)).toHaveLength(1);
    expect(graph.edges.some((edge) => edge.type === 'package_rjc')).toBe(false);

    const terminal = graph.nodes.find((node) => node.type === 'tim_interface')!;
    expect(terminal.name).toContain('TIM');
    expect(terminal.ports).toEqual([
      expect.objectContaining({ kind: 'HEAT_OUT', required: true, connected_to: null }),
    ]);

    const interfaceEdge = graph.edges.find((edge) => edge.type === 'tim')!;
    expect(interfaceEdge.method).toBe('tim_thickness_k');
    // Perimeter frame: 100×80 − 96×76 = 704 mm².
    expect(interfaceEdge.parameters?.area_mm2).toBe(704);
    expect(activeRth(interfaceEdge.rth)).toBeCloseTo(0.023674, 6);

    const boundaryEdge = graph.edges.find((edge) => edge.method === 'convection_hA')!;
    expect(boundaryEdge.resolution).toBe('unresolved');
    const ports = deriveBoundaryPorts(toNetwork(graph.nodes, graph.edges));
    const exposed = ports.find((port) => port.name.includes('Exposed Surface'))!;
    // Top + four sides = 8000 + 2×20×(100+80) = 15,200 mm².
    expect(exposed.area_m2).toBeCloseTo(0.0152, 8);
    expect(exposed.orientation).toBe('mixed');
  });

  it('keeps Junction and Rjc for a junction-based metal-base source', () => {
    const subject = metalBaseComponent(
      {
        source_model: 'JunctionBased',
        contact_geometry: 'FullBase',
        exposed_surface_enabled: false,
      },
      emptyTim(DIRECT_CONTACT_TIM_ID),
    );
    const graph = buildComponentSubgraph(subject, {
      materials: defaultMaterials(),
      templateId: 'DIRECT_METAL',
      qtyModel: 'AGGREGATE',
    })!;

    expect(graph.nodes.some((node) => node.name.includes('Junction'))).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'package_rjc')).toBe(true);
    const contact = graph.edges.find((edge) => edge.type === 'tim')!;
    expect(contact.method).toBe('contact_hc');
    expect(contact.parameters).toMatchObject({ h_c_W_m2K: 3000, area_mm2: 8000 });
    expect(activeRth(contact.rth)).toBeCloseTo(1 / (3000 * 0.008), 8);
  });

  it('uses a characterized whole-interface Rth without inventing k or BLT', () => {
    const measured = emptyTim(MEASURED_INTERFACE_TIM_ID);
    measured.measured_rth_C_per_W = sourced(0.12, 'Measurement');
    const subject = metalBaseComponent(
      {
        source_model: 'SurfaceBodyBased',
        contact_geometry: 'CustomArea',
        custom_contact_area_mm2: 1200,
        exposed_surface_enabled: false,
      },
      measured,
    );
    const graph = buildComponentSubgraph(subject, {
      materials: defaultMaterials(),
      templateId: 'DIRECT_METAL',
      qtyModel: 'AGGREGATE',
    })!;
    const edge = graph.edges.find((candidate) => candidate.type === 'tim')!;
    expect(edge.method).toBe('direct_rth');
    // The measured interface owns Rth directly, but its contact area must stay
    // available to the following HSK-base conduction model.
    expect(edge.parameters).toEqual({ R_C_per_W: 0.12, area_mm2: 1200 });
    expect(activeRth(edge.rth)).toBe(0.12);
  });
});

// --- Qty representation ----------------------------------------------------

describe('quantity representation (05 §7)', () => {
  it('AGGREGATE makes one source carrying the whole component power', () => {
    const graph = buildComponentSubgraph(component(), {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const sources = graph.nodes.filter((node) => node.power_W > 0);
    expect(sources).toHaveLength(1);
    expect(sources[0].power_W).toBeCloseTo(4 * 52.13, 4);
  });

  it('INDIVIDUAL makes one subgraph per device, each at the per-device power', () => {
    const graph = buildComponentSubgraph(component(), {
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
        templateId: 'BOTTOM_COOL_COIN',
        qtyModel: model,
      })!;
      const total = graph.nodes.reduce((sum, node) => sum + node.power_W, 0);
      expect(total).toBeCloseTo(4 * 52.13, 4);
    }
  });

  it('produces stable ids that survive a rebuild (05 §38, AC-05-23)', () => {
    const first = buildComponentSubgraph(component(), {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'INDIVIDUAL',
    })!;
    const second = buildComponentSubgraph(component(), {
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
      templateId: 'SMALL_BASE_HEAT_PIPE',
      qtyModel: 'AGGREGATE',
    })!;
    const kinds = graph.nodes.flatMap((node) => (node.ports ?? []).map((port) => port.kind));
    expect(kinds).toEqual(expect.arrayContaining(['DIRECT_BASE_OUT', 'HEAT_PIPE_OUT']));
  });

  it('previews generation before anything is committed (05 §49, AC-05-02)', () => {
    const preview = previewGeneration(
      [component(), component({ id: 'CMP_X', name: 'X', qty: 1 })],
      defaultMaterials(),
    );
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
    // qty 1, so this measures one device's resistance rather than the four-wide
    // aggregate — the device count has its own tests below.
    const graph = buildComponentSubgraph(component({ qty: 1 }), {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const rjcEdge = graph.edges.find((edge) => edge.type === 'package_rjc')!;
    expect(activeRth(rjcEdge.rth)).toBeCloseTo(0.35, 6);
    expect(rjcEdge.resolution).toBe('resolved');
  });

  it('leaves the TIM edge resolved when the component supplies k, t and area', () => {
    const graph = buildComponentSubgraph(component({ qty: 1 }), {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const tim = graph.edges.find((edge) => edge.type === 'tim')!;
    // The TIM sits on the SPREAD face, not the E-PAD: a 20 x 10 pad on a 1.6 mm
    // board spreads to 21.6 x 11.6 = 250.56 mm². Using the 200 mm² source face
    // here — as this did before the two faces were separated — overstated the
    // resistance by 25%.
    expect(tim.parameters?.area_mm2).toBeCloseTo(250.56, 6);
    expect(activeRth(tim.rth)).toBeCloseTo(0.1 / 1000 / (3 * (250.56 / 1e6)), 6);
  });

  /**
   * The reason the project material table exists. Before it, a component that
   * simply said "Grease" produced an unresolved TIM edge every time, because
   * nothing supplied k or BLT — the Project Default switch in Screen 04 was
   * wired to a table that did not exist.
   */
  it('resolves an inherited TIM from the project materials', () => {
    const inherited = component({
      qty: 1,
      thermal_spec: {
        ...component().thermal_spec,
        tim: { ...emptyTim(BUILTIN_TIM_IDS.grease) },
      },
    });
    const graph = buildComponentSubgraph(inherited, {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const tim = graph.edges.find((edge) => edge.type === 'tim')!;
    // Grease ships k = 3.0 and BLT = 0.05 mm over the 250.56 mm² spread face.
    expect(tim.resolution).toBe('resolved');
    expect(activeRth(tim.rth)).toBeCloseTo(0.05 / 1000 / (3 * (250.56 / 1e6)), 6);
  });

  it('follows a project material change into the edge', () => {
    const inherited = component({
      qty: 1,
      thermal_spec: {
        ...component().thermal_spec,
        tim: { ...emptyTim(BUILTIN_TIM_IDS.grease) },
      },
    });
    const stiffer = defaultMaterials();
    stiffer.tim = stiffer.tim.map((material) =>
      material.id === BUILTIN_TIM_IDS.grease
        ? { ...material, k_W_mK: sourced(6, 'Vendor') }
        : material,
    );
    const graph = buildComponentSubgraph(inherited, {
      materials: stiffer,
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const tim = graph.edges.find((edge) => edge.type === 'tim')!;
    expect(activeRth(tim.rth)).toBeCloseTo(0.05 / 1000 / (6 * (250.56 / 1e6)), 6);
  });

  // A component pointing at a deleted material is NOT the same as one with no
  // TIM, and neither may borrow another material's numbers.
  it('leaves a TIM the project cannot describe unresolved rather than guessing', () => {
    const custom = component({
      thermal_spec: {
        ...component().thermal_spec,
        tim: emptyTim('TIM_DELETED'),
      },
    });
    const graph = buildComponentSubgraph(custom, {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const tim = graph.edges.find((edge) => edge.type === 'tim')!;
    expect(activeRth(tim.rth)).toBeNull();
    expect(tim.resolution).toBe('unresolved');
  });

  it('resolves a coin spread face from the project coin size', () => {
    const materials = defaultMaterials();
    materials.coin_L_mm = sourced(55, 'Manual');
    materials.coin_W_mm = sourced(35, 'Manual');
    materials.coin_thickness_mm = sourced(2.0, 'Manual');
    const coin = component({
      qty: 1,
      thermal_spec: {
        ...component().thermal_spec,
        heat_path: { type: 'Coin', parameters: {} },
      },
    });
    const graph = buildComponentSubgraph(coin, {
      materials,
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    // The TIM lies under the coin's heatsink face (55 x 35), not under the
    // 20 x 10 face the package is soldered to.
    const tim = graph.edges.find((edge) => edge.type === 'tim')!;
    expect(tim.parameters?.area_mm2).toBe(1925);
    // The solder joint is the other way round: it IS the joint face, derated.
    const solder = graph.edges.find((edge) => edge.type === 'solder')!;
    expect(solder.parameters?.area_mm2).toBe(200);
    expect(solder.parameters?.voiding).toBe(0.75);
    expect(activeRth(solder.rth)).toBeCloseTo(0.3 / 1000 / (58 * (200 / 1e6) * 0.75), 8);
    // And the coin itself sees the mean of the two faces.
    const coinEdge = graph.edges.find((edge) => edge.type === 'conduction')!;
    expect(coinEdge.parameters?.area_mm2).toBeCloseTo(Math.sqrt(200 * 1925), 6);
    expect(coinEdge.parameters?.k_W_mK).toBe(380);
    expect(activeRth(coinEdge.rth)).toBeCloseTo(
      2.0 / 1000 / (380 * (Math.sqrt(200 * 1925) / 1e6)),
      8,
    );
  });

  it('leaves a component without Rjc unresolved rather than zero (05 §59 case F)', () => {
    const noRjc = component({
      thermal_spec: { ...component().thermal_spec, r_jc_C_per_W: null },
    });
    const graph = buildComponentSubgraph(noRjc, {
      materials: defaultMaterials(),
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
  it('builds every supported preset with a boundary placeholder tail', () => {
    for (const preset of STRUCTURE_PRESETS) {
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

  it('maps the exact HSK_BASE preference onto the shared HSK node', () => {
    const subject = component();
    subject.architecture_prep.preferred_base_zone = 'HSK_BASE';
    const structure = buildSharedStructure('SINGLE_MAIN_BASE');
    expect(suggestedZoneFor(subject, structure.zones.map((zone) => zone.id))).toBe(
      'NODE_HSK_BASE',
    );
  });

  it('maps RF and Digital components to different HSK targets in dual mode', () => {
    const structure = buildSharedStructure('DUAL_HSK_BASE');
    const zoneIds = structure.zones.map((zone) => zone.id);
    const rf = component();
    const digital = component();
    rf.architecture_prep.preferred_base_zone = 'RF_HSK_BASE';
    digital.architecture_prep.preferred_base_zone = 'DIGITAL_HSK_BASE';

    expect(suggestedZoneFor(rf, zoneIds)).toBe('NODE_RF_HSK_BASE');
    expect(suggestedZoneFor(digital, zoneIds)).toBe('NODE_DIGITAL_HSK_BASE');
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
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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


/**
 * The point of linking the templates: a component carrying its own measurements,
 * in a project carrying its own constants, produces a chain the solver can use
 * without anybody opening Screen 05 to hand-enter a resistance.
 *
 * What stays unresolved is deliberate. The trailing edges are MECHANICAL — a
 * pedestal, a base contact, the bolt-down to metal — and belong to the structure
 * the engineer builds in Screen 05, not to the component. 05 §61: an unknown
 * stays unknown rather than being filled with a plausible number.
 */
describe('end-to-end resolution per heat path', () => {
  const materials = () => {
    const m = defaultMaterials();
    m.coin_L_mm = sourced(55, 'Manual');
    m.coin_W_mm = sourced(35, 'Manual');
    m.coin_thickness_mm = sourced(2.0, 'Manual');
    return m;
  };

  const withPath = (path: 'Coin' | 'Board' | 'TopSurface', templateId: string) =>
    buildComponentSubgraph(
      component({
        qty: 1,
        thermal_spec: {
          ...component().thermal_spec,
          heat_path: { type: path, parameters: {} },
          tim: { ...emptyTim(BUILTIN_TIM_IDS.grease) },
        },
      }),
      { materials: materials(), templateId, qtyModel: 'AGGREGATE' },
    )!;

  it('resolves every component-owned edge of a copper coin chain', () => {
    const graph = withPath('Coin', 'BOTTOM_COOL_COIN');
    const byType = Object.fromEntries(graph.edges.map((edge) => [edge.type, edge]));

    expect(byType.package_rjc.resolution).toBe('resolved');
    expect(byType.solder.resolution).toBe('resolved');
    expect(byType.conduction.resolution).toBe('resolved');
    expect(byType.tim.resolution).toBe('resolved');

    // Nothing trails off unresolved: the chain ends at a PORT, which Screen 05
    // wires to whichever base zone the engineer chooses (05 §10).
    expect(graph.edges.every((edge) => edge.resolution === 'resolved')).toBe(true);
    expect(graph.nodes.flatMap((node) => node.ports ?? []).map((port) => port.kind)).toContain(
      'HEAT_OUT',
    );
  });

  it('resolves every component-owned edge of a board via chain', () => {
    const graph = withPath('Board', 'BOTTOM_COOL_VIA');
    const byType = Object.fromEntries(graph.edges.map((edge) => [edge.type, edge]));

    expect(byType.package_rjc.resolution).toBe('resolved');
    expect(byType.thermal_via.resolution).toBe('resolved');
    expect(byType.tim.resolution).toBe('resolved');
    expect(graph.edges.every((edge) => edge.resolution === 'resolved')).toBe(true);
  });

  it('ends a top-cooled chain at the TIM heat-out port without an invented pedestal', () => {
    const graph = withPath('TopSurface', 'TOP_COOL_LID');
    const byType = Object.fromEntries(graph.edges.map((edge) => [edge.type, edge]));

    expect(byType.package_rjc.resolution).toBe('resolved');
    expect(byType.tim.resolution).toBe('resolved');
    // Nothing spreads on this path, so the TIM crosses the case face itself.
    expect(byType.tim.parameters?.area_mm2).toBe(200);
    expect(graph.edges.every((edge) => edge.resolution === 'resolved')).toBe(true);
    expect(graph.nodes.some((node) => node.type === 'pedestal')).toBe(false);

    const tim = graph.nodes.find((node) => node.type === 'tim_interface');
    expect(tim?.ports).toEqual([
      expect.objectContaining({ kind: 'HEAT_OUT', required: true, connected_to: null }),
    ]);
    expect(graph.binding.template_version).toBe('1.1');
  });

  it('builds a surface-rated module as Module Surface to TIM with no junction or Rjc', () => {
    const subject = component({
      id: 'CMP_POWER_MODULE',
      name: 'Power Module',
      qty: 1,
      power_W: sourced(20, 'Datasheet'),
      thermal_spec: {
        ...component().thermal_spec,
        limit_type: 'Ts',
        limit_type_confirmed: true,
        limit_C: sourced(115, 'Datasheet'),
        limit_reference_note: 'Center',
        r_jc_C_per_W: null,
        geometry: {
          ...component().thermal_spec.geometry,
          package_L_mm: 58,
          package_W_mm: 26,
          source_L_mm: null,
          source_W_mm: null,
        },
        heat_path: { type: 'ModuleSurface', parameters: {} },
        heat_path_confirmed: true,
        tim: { ...emptyTim(BUILTIN_TIM_IDS.grease), blt_mm: sourced(1, 'Datasheet') },
      },
    });
    const graph = buildComponentSubgraph(subject, {
      materials: materials(),
      templateId: 'MODULE_SURFACE_TIM',
      qtyModel: 'AGGREGATE',
    })!;

    expect(graph.nodes.map((node) => node.type)).toEqual(['case', 'tim_interface']);
    expect(graph.nodes.some((node) => node.type === 'junction')).toBe(false);
    expect(graph.edges.map((edge) => edge.type)).toEqual(['tim']);
    expect(graph.edges.some((edge) => edge.type === 'package_rjc')).toBe(false);
    expect(graph.edges[0].parameters).toMatchObject({ thickness_mm: 1, area_mm2: 1508 });
    expect(graph.edges[0].resolution).toBe('resolved');

    const surface = graph.nodes[0];
    expect(surface).toMatchObject({ power_W: 20, limit_C: 115, limit_type: 'Ts' });
    expect(surface.metadata?.limit_reference_note).toBe('Center');
    expect(graph.nodes[1].ports).toEqual([
      expect.objectContaining({ kind: 'HEAT_OUT', required: true, connected_to: null }),
    ]);
  });

  it('reads the via array constants from the project, not from the component', () => {
    const graph = withPath('Board', 'BOTTOM_COOL_VIA');
    const via = graph.edges.find((edge) => edge.type === 'thermal_via')!;
    expect(via.parameters?.effective_k_W_mK).toBe(30);
    expect(via.parameters?.via_efficiency).toBe(0.9);
    // Before this, both were editable in Screen 04 but never reached the graph,
    // so the array could not resolve however carefully they were filled in.
    expect(via.resolution).toBe('resolved');
  });

  it('stops at the coin when the project has no coin size, rather than guessing', () => {
    const graph = buildComponentSubgraph(
      component({
        qty: 1,
        thermal_spec: {
          ...component().thermal_spec,
          heat_path: { type: 'Coin', parameters: {} },
        },
      }),
      { materials: defaultMaterials(), templateId: 'BOTTOM_COOL_COIN', qtyModel: 'AGGREGATE' },
    )!;
    const byType = Object.fromEntries(graph.edges.map((edge) => [edge.type, edge]));

    // The joint face is known, so the solder still resolves ...
    expect(byType.solder.resolution).toBe('resolved');
    // ... but nothing downstream of the missing coin face can.
    expect(byType.conduction.resolution).toBe('unresolved');
    expect(byType.tim.resolution).toBe('unresolved');
    expect(activeRth(byType.tim.rth)).toBeNull();
  });
});

/**
 * The qty model decides how many chains get DRAWN. It must not decide what
 * temperature comes out.
 *
 * Before `scaleParametersForDevices`, the source node carried N devices' power
 * while the resistances beside it were still one device's, so four 45 W PAs
 * were solved as 180 W forced through a single PA's coin — a junction rise four
 * times too high. Conservative is no defence: a wrong resistance reorders the
 * bottleneck ranking whichever way it errs.
 */
describe('a qty model changes the drawing, not the answer', () => {
  const materials = () => {
    const m = defaultMaterials();
    m.coin_L_mm = sourced(55, 'Manual');
    m.coin_W_mm = sourced(35, 'Manual');
    m.coin_thickness_mm = sourced(2.0, 'Manual');
    return m;
  };

  const build = (qtyModel: 'AGGREGATE' | 'INDIVIDUAL' | 'GROUPED', qty = 4) =>
    buildComponentSubgraph(
      component({
        qty,
        thermal_spec: {
          ...component().thermal_spec,
          heat_path: { type: 'Coin', parameters: {} },
          tim: { ...emptyTim(BUILTIN_TIM_IDS.grease) },
        },
      }),
      { materials: materials(), templateId: 'BOTTOM_COOL_COIN', qtyModel },
    )!;

  /**
   * Junction rise above the port, for one chain.
   *
   * Every chain a model builds is identical, so the total resistance divided by
   * the number of chains is one chain's — no instance-suffix parsing needed.
   */
  const junctionRise = (graph: ReturnType<typeof build>) => {
    const sources = graph.nodes.filter((node) => node.power_W > 0);
    const totalRth = graph.edges.reduce((sum, edge) => sum + (activeRth(edge.rth) ?? 0), 0);
    return sources[0].power_W * (totalRth / sources.length);
  };

  it('gives the same junction rise whichever model is chosen', () => {
    const individual = junctionRise(build('INDIVIDUAL'));
    expect(junctionRise(build('AGGREGATE'))).toBeCloseTo(individual, 9);
    expect(junctionRise(build('GROUPED'))).toBeCloseTo(individual, 9);
  });

  it('widens an aggregated edge to N joints rather than leaving it one', () => {
    const one = build('INDIVIDUAL').edges.find((edge) => edge.type === 'solder')!;
    const four = build('AGGREGATE').edges.find((edge) => edge.type === 'solder')!;
    expect(four.parameters?.area_mm2).toBeCloseTo(
      (one.parameters?.area_mm2 as number) * 4,
      6,
    );
    expect(activeRth(four.rth)).toBeCloseTo((activeRth(one.rth) as number) / 4, 9);
  });

  it('divides a directly quoted Rjc rather than scaling an area it has none of', () => {
    const four = build('AGGREGATE').edges.find((edge) => edge.type === 'package_rjc')!;
    expect(four.parameters?.R_C_per_W).toBeCloseTo(0.35 / 4, 9);
  });

  // Two groups of two, so each chain stands for two devices — not for four.
  it('scales a group by what that group represents', () => {
    const grouped = build('GROUPED').edges.find((edge) => edge.type === 'package_rjc')!;
    expect(grouped.parameters?.R_C_per_W).toBeCloseTo(0.35 / 2, 9);
  });

  /** qty 5 in two groups is 3 and 2, so the two chains scale differently. */
  it('handles a group split that does not divide evenly', () => {
    const graph = build('GROUPED', 5);
    const rjc = graph.edges
      .filter((edge) => edge.type === 'package_rjc')
      .map((edge) => edge.parameters?.R_C_per_W as number)
      .sort((a, b) => a - b);
    expect(rjc).toHaveLength(2);
    expect(rjc[0]).toBeCloseTo(0.35 / 3, 9);
    expect(rjc[1]).toBeCloseTo(0.35 / 2, 9);
  });

  it('records the device count so re-projection can reapply it', () => {
    for (const edge of build('AGGREGATE').edges) {
      expect(edge.metadata?.devices_represented).toBe(4);
    }
    for (const edge of build('INDIVIDUAL').edges) {
      expect(edge.metadata?.devices_represented).toBe(1);
    }
  });

  it('leaves a single device untouched', () => {
    const one = build('AGGREGATE', 1).edges.find((edge) => edge.type === 'package_rjc')!;
    expect(one.parameters?.R_C_per_W).toBeCloseTo(0.35, 9);
  });
});

/**
 * A bolted metal-to-metal joint is not a very thin TIM.
 *
 * Common on RRU designs where the heat-sink base is machined flat in one pass
 * and the board carries a flatness spec, so the two are simply screwed
 * together. It still has a resistance — two solids touch only across their
 * asperities — but there is no material and no thickness to quote, so the edge
 * changes METHOD rather than borrowing a k and a bond line it does not have.
 */
describe('direct metal contact', () => {
  const bolted = (qty = 1) =>
    buildComponentSubgraph(
      component({
        qty,
        thermal_spec: {
          ...component().thermal_spec,
          heat_path: { type: 'Board', parameters: {} },
          tim: { ...emptyTim(DIRECT_CONTACT_TIM_ID) },
        },
      }),
      { materials: defaultMaterials(), templateId: 'BOTTOM_COOL_VIA', qtyModel: 'AGGREGATE' },
    )!;

  it('switches the interface edge from t/kA to 1/h·A', () => {
    const edge = bolted().edges.find((entry) => entry.type === 'tim')!;
    expect(edge.method).toBe('contact_hc');
    expect(edge.parameters?.h_c_W_m2K).toBe(3000);
    // No invented thickness, no invented conductivity.
    expect(edge.parameters?.thickness_mm).toBeUndefined();
    expect(edge.parameters?.k_W_mK).toBeUndefined();
  });

  it('resolves, rather than sitting unresolved as "no TIM" did', () => {
    const edge = bolted().edges.find((entry) => entry.type === 'tim')!;
    expect(edge.resolution).toBe('resolved');
    const area = edge.parameters?.area_mm2 as number;
    expect(activeRth(edge.rth)).toBeCloseTo(1 / (3000 * (area / 1e6)), 9);
  });

  it('follows the project constant rather than a per-component value', () => {
    const materials = defaultMaterials();
    materials.contact_conductance_W_m2K = sourced(8000, 'Measurement');
    const graph = buildComponentSubgraph(
      component({
        qty: 1,
        thermal_spec: {
          ...component().thermal_spec,
          heat_path: { type: 'Board', parameters: {} },
          tim: { ...emptyTim(DIRECT_CONTACT_TIM_ID) },
        },
      }),
      { materials, templateId: 'BOTTOM_COOL_VIA', qtyModel: 'AGGREGATE' },
    )!;
    expect(graph.edges.find((entry) => entry.type === 'tim')!.parameters?.h_c_W_m2K).toBe(8000);
  });

  // A bolted joint is N joints in parallel, exactly like a solder joint.
  it('widens with the devices the chain stands for', () => {
    const one = bolted(1).edges.find((entry) => entry.type === 'tim')!;
    const four = bolted(4).edges.find((entry) => entry.type === 'tim')!;
    expect(four.parameters?.area_mm2).toBeCloseTo((one.parameters?.area_mm2 as number) * 4, 6);
    expect(activeRth(four.rth)).toBeCloseTo((activeRth(one.rth) as number) / 4, 9);
  });

  it('leaves a real TIM alone', () => {
    const graph = buildComponentSubgraph(
      component({
        qty: 1,
        thermal_spec: {
          ...component().thermal_spec,
          heat_path: { type: 'Board', parameters: {} },
          tim: { ...emptyTim(BUILTIN_TIM_IDS.grease) },
        },
      }),
      { materials: defaultMaterials(), templateId: 'BOTTOM_COOL_VIA', qtyModel: 'AGGREGATE' },
    )!;
    const edge = graph.edges.find((entry) => entry.type === 'tim')!;
    expect(edge.method).toBe('tim_thickness_k');
    expect(edge.parameters?.h_c_W_m2K).toBeUndefined();
  });
});
