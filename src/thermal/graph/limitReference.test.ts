/**
 * A limit is judged where its TYPE says it is measured.
 *
 * The case that reported this: 2GB_DDR on the real STARKCORE project, limit
 * type Tc, limit 95 °C, heat path Top Surface with an Rjc of 14 °C/W. Screen 07
 * compared the 95 against the JUNCTION and returned −1.9 K over limit. The lid
 * — the case the datasheet is actually talking about — was 89, so the part had
 * margin, and the report said it did not.
 *
 * Both halves are tested here: the build, and the projection that has to MOVE
 * an existing graph's limit when the engineer changes the type afterwards.
 */

import { describe, expect, it } from 'vitest';

import { createComponent, type Component, type LimitType } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { withValue } from '@/domain/sourcedValue';
import { getTemplate } from '@/thermal/templates/templateRegistry';

import { nodeRows, resultTree } from '@/screens/07-thermal-network/resultViewModel';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { projectComponentLimits, projectComponentMaster } from './componentProjection';
import { limitReferenceNodeId, limitReferenceRole } from './limitReference';
import { buildComponentSubgraph, templateForComponent } from './networkBuilder';
import type { ThermalNetwork } from '../types';

function ddr(limitType: LimitType = 'Tc', limit = 95): Component {
  const base = createComponent({
    id: 'CMP_2GB_DDR',
    name: '2GB_DDR',
    category: 'Digital',
    qty: 2,
    power_W: 0.545,
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
      limit_type: limitType,
      limit_type_confirmed: true,
      limit_C: withValue(base.thermal_spec.limit_C, limit),
      r_jc_C_per_W: withValue(base.thermal_spec.r_jc_C_per_W, 14),
      heat_path: { type: 'TopSurface', parameters: {} },
    },
  } as Component;
}

function networkFor(component: Component): ThermalNetwork {
  const subgraph = buildComponentSubgraph(component, {
    templateId: 'TOP_COOL_LID',
    qtyModel: 'INDIVIDUAL',
    materials: defaultMaterials(),
  })!;
  return {
    id: 'NET',
    name: 'Test',
    nodes: Object.fromEntries(subgraph.nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(subgraph.edges.map((edge) => [edge.id, edge])),
    templates: { [component.id]: { template_id: 'TOP_COOL_LID', qty_model: 'INDIVIDUAL' } },
    layout: { positions: {} },
  } as unknown as ThermalNetwork;
}

const JUNCTION = 'NODE_CMP_2GB_DDR_1_JUNCTION';
const LID = 'NODE_CMP_2GB_DDR_1_LID';

describe('which role carries the limit', () => {
  const lidded = getTemplate('TOP_COOL_LID')!;

  it('leaves a junction limit on the junction', () => {
    expect(limitReferenceRole(lidded, 'Tj')).toBe('JUNCTION');
  });

  /** Tc, Tb and Ts all name a surface, and all sit one Rjc below the die. */
  it('moves every surface limit across the Rjc', () => {
    for (const type of ['Tc', 'Tb', 'Ts'] as const) {
      expect(limitReferenceRole(lidded, type), type).toBe('LID');
    }
  });

  it('names the right node in each template, not just this one', () => {
    expect(limitReferenceRole(getTemplate('BOTTOM_COOL_COIN')!, 'Tc')).toBe('CASE');
    expect(limitReferenceRole(getTemplate('BOTTOM_COOL_VIA')!, 'Tc')).toBe('EPAD');
    expect(limitReferenceRole(getTemplate('DIRECT_METAL')!, 'Tc')).toBe('METAL_BASE');
  });

  /**
   * CUSTOM's junction goes straight to the port, so there is no Rjc to cross
   * and no second node to cross to. The limit stays where the heat is.
   */
  it('stays put when the template has no Rjc edge', () => {
    expect(limitReferenceRole(getTemplate('CUSTOM')!, 'Tc')).toBe('JUNCTION');
  });

  /**
   * A body-sourced part has had its junction stripped, so its exit face IS the
   * source. Tc already lands there and must not be moved a second time.
   */
  it('stays on the exit face of a body-sourced part', () => {
    const body = ddr('Ts');
    body.thermal_spec.heat_path = {
      type: 'MetalBase',
      parameters: { source_model: 'SurfaceBodyBased' },
    } as never;

    const template = templateForComponent(body, 'DIRECT_METAL')!;

    expect(template.nodes.some((node) => node.role === 'JUNCTION')).toBe(false);
    expect(limitReferenceRole(template, 'Ts')).toBe('METAL_BASE');
  });
});

describe('building the graph', () => {
  it('puts a Tc limit on the lid and leaves the junction bare', () => {
    const network = networkFor(ddr('Tc'));

    expect(network.nodes[LID].limit_C).toBe(95);
    expect(network.nodes[LID].limit_type).toBe('Tc');
    expect(network.nodes[JUNCTION].limit_C).toBeNull();
  });

  it('still puts a Tj limit on the junction', () => {
    const network = networkFor(ddr('Tj', 100));

    expect(network.nodes[JUNCTION].limit_C).toBe(100);
    expect(network.nodes[LID].limit_C).toBeNull();
  });

  /** Power never moves — only the limit does. */
  it('leaves the dissipation on the junction either way', () => {
    for (const type of ['Tj', 'Tc'] as const) {
      expect(networkFor(ddr(type)).nodes[JUNCTION].power_W, type).toBe(0.545);
      expect(networkFor(ddr(type)).nodes[LID].power_W, type).toBe(0);
    }
  });

  /** Each device in a ×2 part lands on its own lid, not on the first one. */
  it('follows every instance separately', () => {
    const network = networkFor(ddr('Tc'));

    expect(network.nodes['NODE_CMP_2GB_DDR_2_LID'].limit_C).toBe(95);
    expect(network.nodes['NODE_CMP_2GB_DDR_2_JUNCTION'].limit_C).toBeNull();
  });
});

describe('a graph that already exists', () => {
  /**
   * The reported case exactly: a graph built while the part was Tj-limited,
   * then re-typed to Tc in Screen 04. The solve path re-projects on every run,
   * so this must move without a rebuild.
   */
  it('moves the limit down when the type changes to Tc', () => {
    const stale = networkFor(ddr('Tj', 95));
    expect(stale.nodes[JUNCTION].limit_C).toBe(95);

    const projected = projectComponentMaster(stale, [ddr('Tc', 95)], defaultMaterials(), {
      physics: false,
      limits: true,
    });

    expect(projected.nodes[LID].limit_C).toBe(95);
    expect(projected.nodes[LID].limit_type).toBe('Tc');
    expect(projected.nodes[JUNCTION].limit_C).toBeNull();
    expect(projected.nodes[JUNCTION].limit_type).toBeNull();
  });

  it('moves it back up when the type returns to Tj', () => {
    const network = networkFor(ddr('Tc'));

    const projected = projectComponentMaster(network, [ddr('Tj', 95)], defaultMaterials(), {
      physics: false,
      limits: true,
    });

    expect(projected.nodes[JUNCTION].limit_C).toBe(95);
    expect(projected.nodes[LID].limit_C).toBeNull();
  });

  /** Exactly one node holds it, or the group row takes the tighter of two. */
  it('never leaves the limit on two nodes at once', () => {
    const network = networkFor(ddr('Tj', 95));
    const projected = projectComponentMaster(network, [ddr('Tc', 95)], defaultMaterials(), {
      physics: false,
      limits: true,
    });

    const held = Object.values(projected.nodes).filter(
      (node) => node.component_ref === 'CMP_2GB_DDR' && node.limit_C != null,
    );

    expect(held).toHaveLength(2); // one per device, never two per device
    expect(held.map((node) => node.id).sort()).toEqual([
      'NODE_CMP_2GB_DDR_1_LID',
      'NODE_CMP_2GB_DDR_2_LID',
    ]);
  });

  it('tracks a change to the limit VALUE, as it always did', () => {
    const network = networkFor(ddr('Tc', 95));
    const projected = projectComponentMaster(network, [ddr('Tc', 85)], defaultMaterials(), {
      physics: false,
      limits: true,
    });

    expect(projected.nodes[LID].limit_C).toBe(85);
  });

  /**
   * Screen 04 owns a TEMPLATE node's limit, and always has: an explicit
   * `component_limit_linked` outranks `modified`, so a limit typed into the
   * junction never survived a solve even before the move existed. Dragging or
   * renaming a node also stamps `modified`, so honouring it here would quietly
   * stop those parts tracking Screen 04 at all.
   */
  it('still tracks Screen 04 on a node an engineer has moved or renamed', () => {
    const network = networkFor(ddr('Tj', 95));
    for (const id of [JUNCTION, LID]) {
      network.nodes[id] = {
        ...network.nodes[id],
        origin: { ...network.nodes[id].origin!, modified: true } as never,
      };
    }

    const projected = projectComponentMaster(network, [ddr('Tc', 95)], defaultMaterials(), {
      physics: false,
      limits: true,
    });

    expect(projected.nodes[LID].limit_C).toBe(95);
    expect(projected.nodes[JUNCTION].limit_C).toBeNull();
  });

  /** A hand-drawn node is nobody's template slot, so it is left alone. */
  it('does not hand a limit to a manual node', () => {
    const network = networkFor(ddr('Tc'));
    network.nodes[LID] = {
      ...network.nodes[LID],
      limit_C: null,
      origin: { kind: 'manual' } as never,
    };

    const projected = projectComponentMaster(network, [ddr('Tc')], defaultMaterials(), {
      physics: false,
      limits: true,
    });

    expect(projected.nodes[LID].limit_C).toBeNull();
  });

  it('is idempotent — projecting twice changes nothing', () => {
    const once = projectComponentMaster(networkFor(ddr('Tc')), [ddr('Tc')], defaultMaterials(), {
      physics: false,
      limits: true,
    });
    const twice = projectComponentMaster(once, [ddr('Tc')], defaultMaterials(), {
      physics: false,
      limits: true,
    });

    expect(twice.nodes).toEqual(once.nodes);
  });
});

/**
 * Screen 07 renders the STORED graph, not the clone the solver builds.
 *
 * This is the half the first round of these tests missed. `buildSolveInput`
 * projects the component master before solving, so the move was correct in the
 * solve input — which nothing displays. The table, the graph badges and the
 * node inspector all read `useNetworkStore`, where the limit still sat on the
 * junction, so the reported margin did not change at all. Screen 07 now reads
 * limits through `projectComponentLimits`, the same call Screens 08+ make.
 */
describe('what the result table is handed', () => {
  it('judges a Tc part at its case, not at the junction it renders on top', () => {
    const stored = networkFor(ddr('Tj', 95));
    const shown = projectComponentLimits(stored, [ddr('Tc', 95)]);

    const solution = {
      node_temperatures_C: { [JUNCTION]: 93.8, [LID]: 86.1 },
      edge_results: {},
      energy_balance: { generated_W: 1.09, rejected_W: 1.09, residual_W: 0, error_pct: 0 },
      warnings: [],
    } as unknown as ThermalSolution;

    const rows = nodeRows(shown, solution, { ambient_C: 45, powerScale: 1 });
    const junction = rows.find((row) => row.node.id === JUNCTION)!;
    const lid = rows.find((row) => row.node.id === LID)!;

    expect(junction.margin_C).toBeNull();
    expect(lid.margin_C).toBeCloseTo(8.9, 6);
    expect(lid.status).toBe('pass');

    // The group still REPORTS the junction as the part's peak — 93.8 against a
    // 95 limit is exactly the pairing that has to stay readable — while the
    // margin comes from the case.
    const [group] = resultTree(shown, solution, rows, [ddr('Tc', 95)]);
    expect(group.peak_C).toBe(93.8);
    expect(group.margin_C).toBeCloseTo(8.9, 6);
    expect(group.limit_type).toBe('Tc');
  });

  /** Off the stored graph it read −1.2 K, the shape of the reported bug. */
  it('reads over limit off the unprojected graph, which is the bug', () => {
    const stored = networkFor(ddr('Tj', 95));
    const solution = {
      node_temperatures_C: { [JUNCTION]: 96.9, [LID]: 89.0 },
      edge_results: {},
      energy_balance: { generated_W: 1.09, rejected_W: 1.09, residual_W: 0, error_pct: 0 },
      warnings: [],
    } as unknown as ThermalSolution;

    const raw = nodeRows(stored, solution, { ambient_C: 45, powerScale: 1 });
    expect(raw.find((row) => row.node.id === JUNCTION)!.status).toBe('over');

    const shown = nodeRows(projectComponentLimits(stored, [ddr('Tc', 95)]), solution, {
      ambient_C: 45,
      powerScale: 1,
    });
    expect(shown.find((row) => row.node.id === LID)!.status).toBe('pass');
  });
});

describe('finding the node in a built graph', () => {
  it('crosses the Rjc edge belonging to that instance', () => {
    const network = networkFor(ddr('Tc'));

    expect(limitReferenceNodeId(network, JUNCTION, 'Tc')).toBe(LID);
    expect(limitReferenceNodeId(network, 'NODE_CMP_2GB_DDR_2_JUNCTION', 'Tc')).toBe(
      'NODE_CMP_2GB_DDR_2_LID',
    );
  });

  it('returns the source itself for Tj, and for an unstated type', () => {
    const network = networkFor(ddr('Tc'));

    expect(limitReferenceNodeId(network, JUNCTION, 'Tj')).toBe(JUNCTION);
    expect(limitReferenceNodeId(network, JUNCTION, null)).toBe(JUNCTION);
  });

  /**
   * Switching the Rjc off is a statement about heat flow, not about whether the
   * package has a case. The limit still belongs to the case.
   */
  it('crosses a disabled Rjc edge too', () => {
    const network = networkFor(ddr('Tc'));
    const rjc = Object.values(network.edges).find(
      (edge) => edge.type === 'package_rjc' && edge.from === JUNCTION,
    )!;
    network.edges[rjc.id] = { ...rjc, enabled: false };

    expect(limitReferenceNodeId(network, JUNCTION, 'Tc')).toBe(LID);
  });
});
