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

  const hskPosition = { x: 600, y: 200 };
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
      String(element.classes).includes('hsk-bus-junction'),
    );
    const trunk = elements.find((element) =>
      String(element.classes).includes('hsk-bus-trunk'),
    );
    const routed = elements.find((element) => element.data.id === 'EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE')!;
    const layoutEdges = elements.filter((element) =>
      String(element.classes).includes('layout-only'),
    );

    expect(bus.selectable).toBe(false);
    expect(bus.position?.x).toBeGreaterThan(100);
    expect(bus.position?.x).toBeLessThan(600);
    expect(junctions).toHaveLength(4);
    expect(trunk?.data.target).toBe('NODE_HSK_BASE');
    expect(String(routed.classes)).toContain('routed-port-edge');
    expect(routed.data.target).not.toBe('NODE_HSK_BASE');
    expect(layoutEdges).toHaveLength(4);

    // Rendering projection must never rewrite authoritative thermal topology.
    expect(network.edges.EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE.to).toBe('NODE_HSK_BASE');
    expect(Object.keys(network.nodes)).toHaveLength(5);
  });

  it('keeps TopBottom mode and small fan-ins on the ordinary edge renderer', () => {
    const topBottom = buildElements(fanInNetwork(4), {
      showPorts: true,
      showLabels: true,
      layoutMode: 'TopBottom',
    });
    const small = buildElements(fanInNetwork(3), {
      showPorts: true,
      showLabels: true,
      layoutMode: 'Auto',
    });

    expect(topBottom.some((element) => String(element.classes).includes('hsk-bus'))).toBe(false);
    expect(small.some((element) => String(element.classes).includes('hsk-bus'))).toBe(false);
    expect(
      topBottom.find((element) => element.data.id === 'EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE')?.data
        .target,
    ).toBe('NODE_HSK_BASE');
  });

  it('preserves a reversed edge and places its label near the terminal', () => {
    const elements = buildElements(fanInNetwork(4, 0), {
      showPorts: true,
      showLabels: true,
      layoutMode: 'LeftRight',
    });
    const reversed = elements.find(
      (element) => element.data.id === 'EDGE_PORT_TIM_1_HEAT_OUT_HSK_BASE',
    )!;

    expect(reversed.data.target).toBe('NODE_TIM_1');
    expect(String(reversed.classes)).toContain('label-at-target');
  });
});
