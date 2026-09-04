/**
 * The graph can draw a resistance the solver would not use.
 *
 * Screen 07 re-reads every `parameter_link` on each run, so the ANSWER always
 * reflects the current Screen 01 and Screen 04 values. Screen 05 draws the
 * stored `rth.analytical`, written once when the subgraph was built. Change a
 * linked input and the two disagree, with nothing on screen to say which one
 * is current.
 *
 * Measured on the STARKCORE project: giving Si5518 its own via k of 60 moved
 * Screen 07's via edge from 0.871 to 0.406 °C/W while Screen 05 went on drawing
 * 0.871. "Generate from Preferences" already brings them back into line; the
 * detector's job is to say when it needs pressing.
 *
 * The bar for a warning that appears beside every other control is that it is
 * never wrong, so most of what follows is about what must NOT be reported.
 */

import { describe, expect, it } from 'vitest';

import { createComponent, type Component } from '@/domain/component';
import { defaultMaterials, type MaterialDefaults } from '@/domain/materials';

import { setRthFromSource } from '../rth';
import type { ThermalNetwork } from '../types';
import { buildComponentSubgraph } from './networkBuilder';
import { staleComponentNames, staleLinkedEdges } from './staleLinkedEdges';

const VIA_EDGE = 'EDGE_CMP_SI5518_EPAD_VIA';

function si5518(): Component {
  const base = createComponent({
    id: 'CMP_SI5518',
    name: 'Si5518',
    category: 'Digital',
    qty: 1,
    power_W: 2,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-09-04T00:00:00.000Z',
    },
  });
  return {
    ...base,
    thermal_spec: {
      ...base.thermal_spec,
      r_jc_C_per_W: { ...base.thermal_spec.r_jc_C_per_W, value: 3 },
      geometry: {
        ...base.thermal_spec.geometry,
        package_L_mm: 12,
        package_W_mm: 12,
        package_H_mm: 1.2,
        source_L_mm: 6,
        source_W_mm: 6,
        board_thickness_mm: 1.6,
      },
      heat_path: { type: 'Board', parameters: {} },
    },
  } as Component;
}

function networkFor(component: Component, materials: MaterialDefaults): ThermalNetwork {
  const subgraph = buildComponentSubgraph(component, {
    templateId: 'BOTTOM_COOL_VIA',
    qtyModel: 'AGGREGATE',
    materials,
  })!;
  return {
    id: 'NET',
    name: 'Test',
    nodes: Object.fromEntries(subgraph.nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(subgraph.edges.map((edge) => [edge.id, edge])),
    templates: { [component.id]: { template_id: 'BOTTOM_COOL_VIA', qty_model: 'AGGREGATE' } },
    layout: { positions: {} },
  } as unknown as ThermalNetwork;
}

/** The component states its own via conductivity, as Screen 04 lets it. */
function withViaK(component: Component, k: number): Component {
  return {
    ...component,
    thermal_spec: {
      ...component.thermal_spec,
      heat_path: { type: 'Board', parameters: { via_effective_k_W_mK: k } },
    },
  } as Component;
}

describe('a graph that matches its inputs', () => {
  it('reports nothing when nothing has changed', () => {
    const materials = defaultMaterials();
    const component = si5518();

    expect(staleLinkedEdges(networkFor(component, materials), [component], materials)).toEqual([]);
  });

  /**
   * The false-positive case that matters most: projecting and comparing must be
   * numerically identical, not merely close. Anything else lights the warning
   * on every project that was never touched.
   */
  it('is stable across repeated projections of the same inputs', () => {
    const materials = defaultMaterials();
    const component = si5518();
    const network = networkFor(component, materials);

    for (let round = 0; round < 3; round += 1) {
      expect(staleLinkedEdges(network, [component], materials), `round ${round}`).toEqual([]);
    }
  });
});

describe('a linked input that has moved', () => {
  it('names the edge, and both numbers', () => {
    const materials = defaultMaterials();
    const network = networkFor(si5518(), materials);

    const stale = staleLinkedEdges(network, [withViaK(si5518(), 60)], materials);

    expect(stale).toHaveLength(1);
    expect(stale[0].edge_id).toBe(VIA_EDGE);
    expect(stale[0].component_name).toBe('Si5518');
    expect(stale[0].stored_C_per_W).toBeGreaterThan(0);
    expect(stale[0].resolved_C_per_W).toBeGreaterThan(0);
    expect(stale[0].resolved_C_per_W).not.toBe(stale[0].stored_C_per_W);
  });

  /** Conductivity up, resistance down, in proportion — the physics is checked. */
  it('resolves to the value the solver would use', () => {
    const materials = defaultMaterials();
    const k = materials.via_effective_k_W_mK.value!;
    const network = networkFor(si5518(), materials);

    const [stale] = staleLinkedEdges(network, [withViaK(si5518(), k * 2)], materials);

    expect(stale.resolved_C_per_W!).toBeCloseTo(stale.stored_C_per_W! / 2, 9);
  });

  it('follows a project-wide material change too, not just a per-part one', () => {
    const materials = defaultMaterials();
    const component = si5518();
    const network = networkFor(component, materials);

    const changed: MaterialDefaults = {
      ...materials,
      via_effective_k_W_mK: {
        ...materials.via_effective_k_W_mK,
        value: materials.via_effective_k_W_mK.value! * 2,
      },
    };

    expect(staleLinkedEdges(network, [component], changed)).toHaveLength(1);
  });
});

describe('what must never be reported', () => {
  /**
   * A pinned Manual resistance is what the solver reads, so its analytical slot
   * drifting changes no result. Warning about it would send someone to press
   * Generate over a number that is already correct — and Generate would then
   * overwrite the very value they pinned.
   */
  it('leaves a hand-pinned resistance alone', () => {
    const materials = defaultMaterials();
    const network = networkFor(si5518(), materials);
    const edge = network.edges[VIA_EDGE];
    network.edges[VIA_EDGE] = {
      ...edge,
      rth: setRthFromSource(edge.rth, 'Manual', 1.5, 'high', { makeActive: true }),
    };

    expect(staleLinkedEdges(network, [withViaK(si5518(), 60)], materials)).toEqual([]);
  });

  /** An unlinked edge has nothing upstream that could have moved. */
  it('ignores an edge whose links were removed', () => {
    const materials = defaultMaterials();
    const network = networkFor(si5518(), materials);
    network.edges[VIA_EDGE] = { ...network.edges[VIA_EDGE], parameter_links: {} };

    expect(staleLinkedEdges(network, [withViaK(si5518(), 60)], materials)).toEqual([]);
  });

  /**
   * A disabled component's edges are switched off by the same projection. They
   * are not out of date, they are out of the network.
   */
  it('ignores a component that has been switched off', () => {
    const materials = defaultMaterials();
    const network = networkFor(si5518(), materials);
    const off = { ...withViaK(si5518(), 60), enabled: false };

    expect(staleLinkedEdges(network, [off], materials)).toEqual([]);
  });

  /** A hand-drawn edge belongs to nobody and is nobody's to refresh. */
  it('ignores an edge with no component behind it', () => {
    const materials = defaultMaterials();
    const network = networkFor(si5518(), materials);
    network.edges[VIA_EDGE] = { ...network.edges[VIA_EDGE], origin: { kind: 'manual' } as never };

    expect(staleLinkedEdges(network, [withViaK(si5518(), 60)], materials)).toEqual([]);
  });

  it('ignores a component the graph does not model', () => {
    const materials = defaultMaterials();
    const network = networkFor(si5518(), materials);

    expect(staleLinkedEdges(network, [], materials)).toEqual([]);
  });
});

describe('what the message counts', () => {
  it('counts each component once, however many of its edges moved', () => {
    expect(
      staleComponentNames([
        { component_name: 'Si5518' },
        { component_name: 'Si5518' },
        { component_name: 'XCZU67DR' },
      ] as never),
    ).toEqual(['Si5518', 'XCZU67DR']);
  });
});
