import { describe, expect, it } from 'vitest';

import { createRevision } from '@/domain/revision';
import { createRth } from '@/thermal/rth';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '@/thermal/types';
import { buildElements, parallelRth } from './thermalGraphElements';

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

/**
 * A parallel mount puts TWO edges between one node pair. An embedded heat pipe
 * is exactly that: the pipe, and the aluminium around it. Both were routed to a
 * junction placed level with their shared terminal, which meant the same point
 * — so the two lines were drawn on top of each other and the second route was
 * invisible. It read as the tool having failed to build the pipe at all.
 */
describe('parallel branches from one terminal', () => {
  function withParallelBranch(): ThermalNetwork {
    const network = fanInNetwork(4);
    const id = 'EDGE_PORT_MOUNT_TIM_1_HEAT_PIPE';
    network.edges[id] = portEdge(id, 'NODE_TIM_1');
    return network;
  }

  const junctions = (network: ThermalNetwork) =>
    buildElements(network, {
      showPorts: true,
      showLabels: true,
      layoutMode: 'Auto',
    }).filter((element) => String(element.classes).includes('hsk-bus-branch-junction'));

  it('gives both branches of one terminal their own junction position', () => {
    const found = junctions(withParallelBranch()).filter(
      (element) => element.data.sourceId === 'NODE_TIM_1',
    );
    expect(found).toHaveLength(2);
    expect(found[0].position?.y).not.toBe(found[1].position?.y);
    // Both still sit on the bar, so only the cross axis moves.
    expect(found[0].position?.x).toBe(found[1].position?.x);
  });

  it('fans them symmetrically about the terminal, so the pair stays centred', () => {
    const found = junctions(withParallelBranch()).filter(
      (element) => element.data.sourceId === 'NODE_TIM_1',
    );
    const terminalY = 50;
    const offsets = found.map((element) => (element.position?.y ?? 0) - terminalY);
    expect(offsets.reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(offsets.every((offset) => offset !== 0)).toBe(true);
  });

  it('leaves a terminal with a single branch exactly where it was', () => {
    const plain = junctions(fanInNetwork(4));
    for (const element of plain) {
      expect(element.data.crossOffset).toBe(0);
    }
    const first = plain.find((element) => element.data.sourceId === 'NODE_TIM_1');
    expect(first?.position?.y).toBe(50);
  });

  it('orders the fan by edge id, so it does not shuffle between renders', () => {
    const network = withParallelBranch();
    const first = junctions(network).map((element) => element.data.id);
    // Adding an unrelated branch must not re-order the pair.
    const later = 'EDGE_PORT_TIM_9_HEAT_OUT_HSK_BASE';
    network.nodes.NODE_TIM_9 = thermalNode('NODE_TIM_9', 'tim_interface', { x: 100, y: 900 }, true);
    network.layout.positions.NODE_TIM_9 = { x: 100, y: 900 };
    network.edges[later] = portEdge(later, 'NODE_TIM_9');
    const second = junctions(network).map((element) => element.data.id);
    expect(second.filter((id) => first.includes(id))).toEqual(first);
  });
});

/**
 * Two numbers side by side do not tell a reader what the pair is worth, and the
 * arithmetic is the one people get wrong: 0.130 beside 0.050 is 0.036 — smaller
 * than either — not 0.180 and not 0.090. So the combination is written on the
 * bar where the branches rejoin, and each branch says which route it is.
 */
describe('the parallel pair, annotated', () => {
  function withPipeAndSpreading(pipeR: number | null = 0.13, spreadR: number | null = 0.05) {
    const network = fanInNetwork(4);
    const spread = 'EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE';
    network.edges[spread] = {
      ...portEdge(spread, 'NODE_TIM_1'),
      type: 'spreading',
      rth: createRth(spreadR, 'Analytical', 'medium'),
      resolution: spreadR == null ? 'unresolved' : 'resolved',
    };
    const pipe = 'EDGE_PORT_MOUNT_TIM_1_HEAT_PIPE';
    network.edges[pipe] = {
      ...portEdge(pipe, 'NODE_TIM_1'),
      type: 'heat_pipe',
      rth: createRth(pipeR, 'Analytical', 'medium'),
      resolution: pipeR == null ? 'unresolved' : 'resolved',
    };
    return network;
  }

  const build = (network: ThermalNetwork, showLabels = true) =>
    buildElements(network, { showPorts: true, showLabels, layoutMode: 'Auto' });

  const note = (network: ThermalNetwork, showLabels = true) =>
    build(network, showLabels).find((element) =>
      String(element.classes).includes('hsk-bus-parallel-note'),
    );

  it('writes the parallel combination, not the sum', () => {
    // 1 / (1/0.130 + 1/0.050) = 0.0361
    expect(note(withPipeAndSpreading())?.data.label).toBe('∥ 0.036 °C/W');
  });

  it('places the note on the bar at the terminal own level, between the branches', () => {
    const elements = build(withPipeAndSpreading());
    const found = elements.find((e) => String(e.classes).includes('hsk-bus-parallel-note'))!;
    const branches = elements.filter(
      (e) =>
        String(e.classes).includes('hsk-bus-branch-junction') &&
        e.data.sourceId === 'NODE_TIM_1',
    );
    expect(branches).toHaveLength(2);
    expect(found.position?.y).toBe(50);
    expect(found.position?.x).toBe(branches[0].position?.x);
    const ys = branches.map((b) => b.position?.y ?? 0).sort((a, b) => a - b);
    expect(ys[0]).toBeLessThan(found.position!.y);
    expect(ys[1]).toBeGreaterThan(found.position!.y);
  });

  it('marks both branches so the stylesheet can wrap and stack their labels', () => {
    const classes = build(withPipeAndSpreading())
      .filter((e) => String(e.classes).includes('routed-port-edge'))
      .filter((e) => /TIM_1/.test(String(e.data.id)))
      .map((e) => String(e.classes));
    expect(classes.every((c) => c.includes('parallel-branch'))).toBe(true);
    // A lone branch is not marked — it has a one-line label that fits.
    expect(
      build(fanInNetwork(4))
        .filter((e) => String(e.classes).includes('routed-port-edge'))
        .every((e) => !String(e.classes).includes('parallel-branch')),
    ).toBe(true);
  });

  it('names each branch, so the pipe is tellable from the metal', () => {
    const labels = build(withPipeAndSpreading())
      .filter((e) => String(e.classes).includes('routed-port-edge'))
      .filter((e) => /TIM_1/.test(String(e.data.id)))
      .map((e) => e.data.label);
    // The name goes ABOVE the number: on one line it is wider than the branch.
    expect(labels).toContain('Heat Pipe\n0.130 °C/W');
    expect(labels).toContain('Spreading\n0.050 °C/W');
  });

  it('says how many pipes the branch stands for, so the division is checkable', () => {
    const network = withPipeAndSpreading();
    network.edges.EDGE_PORT_MOUNT_TIM_1_HEAT_PIPE.parameters = { R_C_per_W: 0.065, pipes: 2 };
    const labels = build(network)
      .filter((e) => String(e.classes).includes('routed-port-edge'))
      .filter((e) => /TIM_1/.test(String(e.data.id)))
      .map((e) => e.data.label);
    expect(labels).toContain('Heat Pipe ×2\n0.130 °C/W');
  });

  it('says nothing about a count of one', () => {
    const network = withPipeAndSpreading();
    network.edges.EDGE_PORT_MOUNT_TIM_1_HEAT_PIPE.parameters = { R_C_per_W: 0.13, pipes: 1 };
    const labels = build(network)
      .filter((e) => String(e.classes).includes('routed-port-edge'))
      .map((e) => String(e.data.label));
    expect(labels.some((l) => l.startsWith('Heat Pipe\n'))).toBe(true);
    expect(labels.every((l) => !/×/.test(l))).toBe(true);
  });

  it('leaves a lone branch unnamed — there is nothing to tell it apart from', () => {
    const labels = build(fanInNetwork(4))
      .filter((e) => String(e.classes).includes('routed-port-edge'))
      .map((e) => e.data.label);
    expect(labels).toContain('0.050 °C/W');
    expect(labels.every((label) => !/Cond/.test(String(label)))).toBe(true);
  });

  it('refuses a total when one branch is unresolved', () => {
    // A total from the branches that happen to have numbers would be LOWER than
    // the truth, and would read as if the missing branch carried nothing.
    expect(note(withPipeAndSpreading(null, 0.05))?.data.label).toBe('∥ —');
  });

  it('adds no note where there is no parallel pair', () => {
    expect(note(fanInNetwork(4))).toBeUndefined();
  });

  it('says nothing at all when labels are switched off', () => {
    expect(note(withPipeAndSpreading(), false)?.data.label).toBe('');
  });

  it('is view-only: not selectable, not grabbable', () => {
    const found = note(withPipeAndSpreading())!;
    expect(found.selectable).toBe(false);
    expect(found.grabbable).toBe(false);
    expect(String(found.classes)).toContain('view-only');
  });
});

describe('parallelRth', () => {
  const twoEdges = (a: number | null, b: number | null, enabled = true): ThermalNetwork => {
    const network = fanInNetwork(1);
    network.edges.A = { ...portEdge('A', 'NODE_TIM_1'), rth: createRth(a, 'Analytical', 'high') };
    network.edges.B = {
      ...portEdge('B', 'NODE_TIM_1'),
      rth: createRth(b, 'Analytical', 'high'),
      enabled,
    };
    return network;
  };

  it('adds conductances, which is why a pipe helps at all', () => {
    expect(parallelRth(twoEdges(0.13, 0.05), ['A', 'B'])!).toBeCloseTo(0.036111, 6);
  });

  it('is smaller than either branch', () => {
    const combined = parallelRth(twoEdges(0.13, 0.05), ['A', 'B'])!;
    expect(combined).toBeLessThan(0.05);
  });

  it('is null when a branch has no number', () => {
    expect(parallelRth(twoEdges(0.13, null), ['A', 'B'])).toBeNull();
  });

  it('is null when a branch is switched off — it is not carrying heat', () => {
    expect(parallelRth(twoEdges(0.13, 0.05, false), ['A', 'B'])).toBeNull();
  });

  it('is null for an edge that is not there', () => {
    expect(parallelRth(twoEdges(0.13, 0.05), ['A', 'MISSING'])).toBeNull();
  });
});
