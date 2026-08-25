import { describe, expect, it } from 'vitest';

import { createRevision } from '@/domain/revision';
import { createRth } from '@/thermal/rth';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '@/thermal/types';
import { buildElements } from './thermalGraphElements';

function thermalNode(
  id: string,
  type: ThermalNode['type'],
  position: { x: number; y: number },
  withPort = false,
): ThermalNode {
  return {
    id,
    name: id,
    type,
    power_W: 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    ports: withPort
      ? [{ kind: 'HEAT_OUT', required: true, connected_to: 'NODE_HSK_BASE' }]
      : [],
    position,
  };
}

function portEdge(id: string, terminalId: string, reversed = false): ThermalEdge {
  return {
    id,
    from: reversed ? 'NODE_HSK_BASE' : terminalId,
    to: reversed ? terminalId : 'NODE_HSK_BASE',
    type: 'conduction',
    method: 'conduction_LkA',
    rth: createRth(0.05, 'Analytical', 'medium'),
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
  };
}

function fanInNetwork(count: number, reversedIndex = -1): ThermalNetwork {
  const network: ThermalNetwork = {
    schema_version: '1.0',
    project_id: 'TEST',
    revision: createRevision('network'),
    network_name: 'Fan-in',
    mode: 'analytical',
    status: 'DRAFT',
    nodes: {},
    edges: {},
    templates: {},
    zones: {},
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: {
      energy_warn_pct: 0.5,
      energy_error_pct: 2,
      max_iterations: 200,
      tolerance: 1e-9,
    },
  };

  const hskPosition = { x: 600, y: 120 };
  network.nodes.NODE_HSK_BASE = thermalNode(
    'NODE_HSK_BASE',
    'heat_sink_base',
    hskPosition,
  );
  network.layout.positions.NODE_HSK_BASE = hskPosition;

  for (let index = 0; index < count; index++) {
    const nodeId = `NODE_TIM_${index + 1}`;
    const position = { x: 100, y: 50 + index * 100 };
    network.nodes[nodeId] = thermalNode(nodeId, 'tim_interface', position, true);
    network.layout.positions[nodeId] = position;
    const edgeId = `EDGE_PORT_TIM_${index + 1}_HEAT_OUT_HSK_BASE`;
    network.edges[edgeId] = portEdge(edgeId, nodeId, index === reversedIndex);
  }

  return network;
}

describe('Screen 05 HSK Base bus projection', () => {
  it('routes four or more HSK branches through view-only bus elements', () => {
    const network = fanInNetwork(4);
    const elements = buildElements(network, {
      showPorts: true,
      showLabels: true,
      layoutMode: 'Auto',
    });

    const bus = elements.find((element) => String(element.classes).includes('hsk-bus'))!;
    const junctions = elements.filter((element) =>
      String(element.classes).includes('hsk-bus-branch-junction'),
    );
    const outlet = elements.find((element) =>
      String(element.classes).includes('hsk-bus-outlet'),
    );
    const trunk = elements.find((element) =>
      String(element.classes).includes('hsk-bus-trunk'),
    );
    const routed = elements.find((element) => element.data.id === 'EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE')!;
    const layoutEdges = elements.filter((element) =>
      String(element.classes).includes('layout-only'),
    );

    expect(bus.selectable).toBe(false);
    expect(bus.data.w).toBe(2);
    expect(bus.position?.y).toBe(200);
    expect(bus.data.h).toBe(300);
    expect(bus.position?.x).toBeGreaterThan(100);
    expect(bus.position?.x).toBeLessThan(600);
    expect(junctions).toHaveLength(4);
    expect(outlet?.position?.y).toBe(120);
    expect(trunk?.data.source).toBe(outlet?.data.id);
    expect(trunk?.data.target).toBe('NODE_HSK_BASE');
    expect(String(routed.classes)).toContain('routed-port-edge');
    expect(routed.data.target).not.toBe('NODE_HSK_BASE');
    expect(layoutEdges).toHaveLength(4);

    // Rendering projection must never rewrite authoritative thermal topology.
    expect(network.edges.EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE.to).toBe('NODE_HSK_BASE');
    expect(Object.keys(network.nodes)).toHaveLength(5);
  });

  it('keeps small fan-ins and force layouts on the ordinary edge renderer', () => {
    const small = buildElements(fanInNetwork(3), {
      showPorts: true,
      showLabels: true,
      layoutMode: 'Auto',
    });
    const free = buildElements(fanInNetwork(4), {
      showPorts: true,
      showLabels: true,
      layoutMode: 'Free',
    });

    expect(small.some((element) => String(element.classes).includes('hsk-bus'))).toBe(false);
    // A force layout has no rank direction for the bar to run across.
    expect(free.some((element) => String(element.classes).includes('hsk-bus'))).toBe(false);
    expect(
      free.find((element) => element.data.id === 'EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE')?.data.target,
    ).toBe('NODE_HSK_BASE');
  });

  /**
   * Top → Bottom used to be excluded from the bus outright, so a fan-in of a
   * dozen components drew as a dozen long diagonals converging on one node —
   * with the Rth labels rotated along them and landing on top of the boxes.
   *
   * The bar runs ACROSS the flow, so a top-to-bottom graph collects on a
   * HORIZONTAL bar, the mirror of the left-to-right case.
   */
  describe('Top → Bottom', () => {
    const elements = () =>
      buildElements(fanInNetwork(4), {
        showPorts: true,
        showLabels: true,
        layoutMode: 'TopBottom',
      });

    it('routes the branches through a bus, same as Left → Right', () => {
      const bus = elements().find((element) => String(element.classes).includes('hsk-bus'));
      expect(bus).toBeDefined();
      expect(
        elements().filter((element) =>
          String(element.classes).includes('hsk-bus-branch-junction'),
        ),
      ).toHaveLength(4);
    });

    it('lays the bar out horizontally, not vertically', () => {
      const bus = elements().find((element) => String(element.classes).includes('hsk-bus'))!;
      expect(bus.data.axis).toBe('horizontal');
      // Thin on the flow axis, long across it — the opposite way round to LR.
      expect(bus.data.h).toBe(2);
      expect(bus.data.w).toBeGreaterThan(2);
    });

    it('puts each junction level with its own terminal across the bar', () => {
      const junctions = elements().filter((element) =>
        String(element.classes).includes('hsk-bus-branch-junction'),
      );
      // Sources sit at x = 100 for every branch in this fixture and differ in
      // y, so on a horizontal bar the junctions share a y and differ in x.
      const ys = new Set(junctions.map((junction) => junction.position?.y));
      expect(ys.size).toBe(1);
      expect(new Set(junctions.map((junction) => junction.position?.x)).size).toBe(1);
    });

    it('still leaves the authoritative topology alone', () => {
      const network = fanInNetwork(4);
      buildElements(network, { showPorts: true, showLabels: true, layoutMode: 'TopBottom' });
      expect(network.edges.EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE.to).toBe('NODE_HSK_BASE');
      expect(Object.keys(network.nodes)).toHaveLength(5);
    });
  });

  it('preserves a reversed edge while using the shared straight-edge label style', () => {
    const elements = buildElements(fanInNetwork(4, 0), {
      showPorts: true,
      showLabels: true,
      layoutMode: 'LeftRight',
    });
    const reversed = elements.find(
      (element) => element.data.id === 'EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE',
    )!;

    expect(reversed.data.target).toBe('NODE_TIM_1');
    expect(reversed.data.label).toBe('0.050 °C/W');
    expect(String(reversed.classes)).toBe('routed-port-edge');
  });
});

/**
 * The bus used to require the non-base end to have PORTS, which meant a
 * component's HEAT_OUT and nothing else. Once a mount could stand between the
 * two, the node delivering to the base became a boss root or a heat-pipe
 * condenser — neither of which has ports — so those branches fell out of the
 * bus and drew as long diagonals across the whole graph, which is exactly the
 * crossing mess the bus exists to remove.
 */
describe('bus branches that arrive from a mount', () => {
  const withMounts = () => {
    const network = fanInNetwork(4);
    for (const index of [1, 2]) {
      const bossId = `NODE_MOUNT_TIM_${index}_PEDESTAL`;
      const position = { x: 300, y: 50 + (index - 1) * 100 };
      // A mount node has no ports; its owner's HEAT_OUT does.
      network.nodes[bossId] = thermalNode(bossId, 'pedestal', position);
      network.layout.positions[bossId] = position;
      const edgeId = `EDGE_PORT_TIM_${index}_HEAT_OUT_HSK_BASE`;
      network.edges[edgeId] = { ...network.edges[edgeId], from: bossId };
    }
    return network;
  };

  it('routes a boss root onto the bus like any other terminal', () => {
    const elements = buildElements(withMounts(), {
      showPorts: true,
      showLabels: true,
      layoutMode: 'LeftRight',
    });
    expect(
      elements.filter((element) => String(element.classes).includes('hsk-bus-branch-junction')),
    ).toHaveLength(4);

    const fromBoss = elements.find(
      (element) => element.data.id === 'EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE',
    )!;
    expect(String(fromBoss.classes)).toBe('routed-port-edge');
    expect(fromBoss.data.source).toBe('NODE_MOUNT_TIM_1_PEDESTAL');
    expect(fromBoss.data.target).not.toBe('NODE_HSK_BASE');
  });
});

/**
 * Hiding a component is a way of reading a crowded graph, not a change to it.
 * The network object must come back untouched, and the shared structure must
 * never disappear with a component.
 */
describe('per-component visibility filter', () => {
  const owned = () => {
    const network = fanInNetwork(4);
    network.nodes.NODE_TIM_1.component_ref = 'CMP_A';
    network.nodes.NODE_TIM_2.component_ref = 'CMP_B';
    // Generated on a component's behalf but without a component_ref of its own.
    network.nodes.NODE_TIM_3.origin = { kind: 'template', component_id: 'CMP_A' };
    return network;
  };

  it('drops the nodes of a hidden component and every edge touching them', () => {
    const network = owned();
    const elements = buildElements(network, {
      showPorts: true,
      showLabels: true,
      layoutMode: 'LeftRight',
      hiddenComponentIds: new Set(['CMP_A']),
    });
    const ids = elements.map((element) => element.data.id);

    expect(ids).not.toContain('NODE_TIM_1');
    expect(ids).not.toContain('NODE_TIM_3');
    expect(ids).not.toContain('EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE');
    expect(ids).toContain('NODE_TIM_2');
    // The base is nobody's component and always stays.
    expect(ids).toContain('NODE_HSK_BASE');
    // And the store is untouched.
    expect(Object.keys(network.nodes)).toHaveLength(5);
  });

  it('changes nothing when the hidden set is empty', () => {
    const options = { showPorts: true, showLabels: true, layoutMode: 'LeftRight' } as const;
    const plain = buildElements(owned(), options).map((element) => element.data.id);
    const empty = buildElements(owned(), {
      ...options,
      hiddenComponentIds: new Set<string>(),
    }).map((element) => element.data.id);
    expect(empty).toEqual(plain);
  });

  it('drops the bus once too few branches are left to need one', () => {
    const elements = buildElements(owned(), {
      showPorts: true,
      showLabels: true,
      layoutMode: 'LeftRight',
      hiddenComponentIds: new Set(['CMP_A', 'CMP_B']),
    });
    expect(elements.some((element) => String(element.classes).includes('hsk-bus'))).toBe(false);
  });
});
