import { describe, expect, it } from 'vitest';

import { createRevision } from '@/domain/revision';
import { createRth } from '@/thermal/rth';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '@/thermal/types';
import { validateGraph } from './graphValidation';
import { reconcilePortConnections } from './portConnectionReconciliation';

function node(id: string, ports: ThermalNode['ports'] = []): ThermalNode {
  return {
    id,
    name: id,
    type: ports?.length ? 'tim_interface' : 'heat_sink_base',
    power_W: 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    ports,
  };
}

function portEdge(
  id: string,
  from: string,
  to: string,
  portKind?: string,
): ThermalEdge {
  return {
    id,
    from,
    to,
    type: 'conduction',
    method: 'direct_rth',
    rth: createRth(0.1, 'Analytical', 'medium'),
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
    metadata: portKind ? { port_kind: portKind } : undefined,
  };
}

function network(): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    revision: createRevision('network'),
    network_name: 'Test',
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
}

describe('port connection reconciliation', () => {
  it('repairs a visible legacy port edge whose port metadata is missing', () => {
    const value = network();
    value.nodes.NODE_TIM = node('NODE_TIM', [
      { kind: 'HEAT_OUT', required: true, connected_to: null },
    ]);
    value.nodes.NODE_HSK_BASE = node('NODE_HSK_BASE');
    value.edges.EDGE_PORT_TIM_HSK_BASE = portEdge(
      'EDGE_PORT_TIM_HSK_BASE',
      'NODE_TIM',
      'NODE_HSK_BASE',
    );

    expect(validateGraph(value).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNCONNECTED_PORT', nodeId: 'NODE_TIM' }),
      ]),
    );

    expect(reconcilePortConnections(value)).toEqual([
      expect.objectContaining({
        nodeId: 'NODE_TIM',
        portKind: 'HEAT_OUT',
        previousTarget: null,
        nextTarget: 'NODE_HSK_BASE',
        reason: 'edge_present',
      }),
    ]);
    expect(value.nodes.NODE_TIM.ports?.[0].connected_to).toBe('NODE_HSK_BASE');
    expect(
      validateGraph(value).issues.some(
        (issue) => issue.code === 'UNCONNECTED_PORT' && issue.nodeId === 'NODE_TIM',
      ),
    ).toBe(false);
  });

  it('treats a reversed port edge as the same physical connection', () => {
    const value = network();
    value.nodes.NODE_TIM = node('NODE_TIM', [
      { kind: 'HEAT_OUT', required: true, connected_to: null },
    ]);
    value.nodes.NODE_BASE = node('NODE_BASE');
    value.edges.EDGE_PORT_TIM_BASE = portEdge(
      'EDGE_PORT_TIM_BASE',
      'NODE_BASE',
      'NODE_TIM',
      'HEAT_OUT',
    );

    reconcilePortConnections(value);
    expect(value.nodes.NODE_TIM.ports?.[0].connected_to).toBe('NODE_BASE');
  });

  it('clears a stale port reference when its visible edge was deleted', () => {
    const value = network();
    value.nodes.NODE_TIM = node('NODE_TIM', [
      { kind: 'HEAT_OUT', required: true, connected_to: 'NODE_BASE' },
    ]);
    value.nodes.NODE_BASE = node('NODE_BASE');

    expect(reconcilePortConnections(value)).toEqual([
      expect.objectContaining({
        previousTarget: 'NODE_BASE',
        nextTarget: null,
        reason: 'edge_missing',
      }),
    ]);
    expect(value.nodes.NODE_TIM.ports?.[0].connected_to).toBeNull();
  });

  it('does not guess between multiple legacy edges on a multi-port node', () => {
    const value = network();
    value.nodes.NODE_SPLIT = node('NODE_SPLIT', [
      { kind: 'DIRECT_BASE_OUT', required: true, connected_to: null },
      { kind: 'HEAT_PIPE_OUT', required: true, connected_to: null },
    ]);
    value.nodes.NODE_BASE_A = node('NODE_BASE_A');
    value.nodes.NODE_BASE_B = node('NODE_BASE_B');
    value.edges.EDGE_PORT_SPLIT_A = portEdge(
      'EDGE_PORT_SPLIT_A',
      'NODE_SPLIT',
      'NODE_BASE_A',
    );
    value.edges.EDGE_PORT_SPLIT_B = portEdge(
      'EDGE_PORT_SPLIT_B',
      'NODE_SPLIT',
      'NODE_BASE_B',
    );

    expect(reconcilePortConnections(value)).toEqual([]);
    expect(value.nodes.NODE_SPLIT.ports?.map((port) => port.connected_to)).toEqual([null, null]);
  });

  it('uses explicit port_kind metadata to repair a multi-port node safely', () => {
    const value = network();
    value.nodes.NODE_SPLIT = node('NODE_SPLIT', [
      { kind: 'DIRECT_BASE_OUT', required: true, connected_to: null },
      { kind: 'HEAT_PIPE_OUT', required: true, connected_to: null },
    ]);
    value.nodes.NODE_BASE_A = node('NODE_BASE_A');
    value.nodes.NODE_BASE_B = node('NODE_BASE_B');
    value.edges.EDGE_PORT_SPLIT_A = portEdge(
      'EDGE_PORT_SPLIT_A',
      'NODE_SPLIT',
      'NODE_BASE_A',
      'DIRECT_BASE_OUT',
    );
    value.edges.EDGE_PORT_SPLIT_B = portEdge(
      'EDGE_PORT_SPLIT_B',
      'NODE_SPLIT',
      'NODE_BASE_B',
      'HEAT_PIPE_OUT',
    );

    expect(reconcilePortConnections(value)).toHaveLength(2);
    expect(value.nodes.NODE_SPLIT.ports?.map((port) => port.connected_to)).toEqual([
      'NODE_BASE_A',
      'NODE_BASE_B',
    ]);
  });

  it('reads the port kind encoded by legacy Golden Demo edge ids', () => {
    const value = network();
    value.nodes.NODE_SPLIT = node('NODE_SPLIT', [
      { kind: 'DIRECT_BASE_OUT', required: true, connected_to: null },
      { kind: 'HEAT_PIPE_OUT', required: true, connected_to: null },
    ]);
    value.nodes.NODE_BASE_A = node('NODE_BASE_A');
    value.nodes.NODE_BASE_B = node('NODE_BASE_B');
    value.edges.EDGE_PORT_SPLIT_DIRECT_BASE_OUT = portEdge(
      'EDGE_PORT_SPLIT_DIRECT_BASE_OUT',
      'NODE_SPLIT',
      'NODE_BASE_A',
    );
    value.edges.EDGE_PORT_SPLIT_HEAT_PIPE_OUT = portEdge(
      'EDGE_PORT_SPLIT_HEAT_PIPE_OUT',
      'NODE_SPLIT',
      'NODE_BASE_B',
    );

    expect(reconcilePortConnections(value)).toHaveLength(2);
    expect(value.nodes.NODE_SPLIT.ports?.map((port) => port.connected_to)).toEqual([
      'NODE_BASE_A',
      'NODE_BASE_B',
    ]);
  });
});
