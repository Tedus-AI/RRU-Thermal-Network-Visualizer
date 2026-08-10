/**
 * Store-level contracts for Screen 05 — 05 §40, §41, §46, §48.
 *
 * These cover the behaviours that only exist once a mutation goes through the
 * store: manual-edit protection on rebuild, undo/redo, port connection and
 * solver invalidation.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { useNetworkStore } from './networkStore';
import { useSolverStore } from './solverStore';
import { createComponent } from '@/domain/component';
import { sourced } from '@/domain/sourcedValue';
import { buildComponentSubgraph } from '@/thermal/graph/networkBuilder';
import { buildSharedStructure } from '@/thermal/graph/sharedStructure';
import { createRth } from '@/thermal/rth';
import type { ThermalEdge } from '@/thermal/types';

function pa() {
  const component = createComponent({
    id: 'CMP_PA',
    name: 'Final PA',
    category: 'RF',
    qty: 2,
    power_W: 52.13,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: new Date().toISOString(),
    },
  });
  component.thermal_spec.r_jc_C_per_W = sourced(0.35, 'Datasheet', { confidence: 'high' });
  return component;
}

function manualEdge(id: string, from: string, to: string): ThermalEdge {
  return {
    id,
    from,
    to,
    type: 'custom',
    method: 'direct_rth',
    rth: createRth(0.5, 'Manual', 'medium'),
    parameters: { R_C_per_W: 0.5 },
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
    origin: { kind: 'manual', component_id: 'CMP_PA' },
  };
}

beforeEach(() => {
  useNetworkStore.getState().clear();
  useNetworkStore.getState().loadFor('TEST');
  useSolverStore.getState().reset();
});

describe('component subgraph rebuild (05 §40, AC-05-11)', () => {
  it('preserves manual objects when only the generated ones are replaced', () => {
    const component = pa();
    const first = buildComponentSubgraph(component, {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(first);

    // The engineer adds a hand-made edge and edits a generated one.
    const hand = manualEdge('EDGE_MANUAL_1', first.nodes[0].id, first.nodes[1].id);
    useNetworkStore.getState().upsertEdge(hand);
    const generated = first.edges[1];
    useNetworkStore.getState().upsertEdge({
      ...generated,
      origin: { ...generated.origin!, modified: true },
    });

    const rebuilt = buildComponentSubgraph(component, {
      templateId: 'BOTTOM_COOL_VIA',
      qtyModel: 'AGGREGATE',
    })!;
    const { preservedManual } = useNetworkStore
      .getState()
      .replaceComponentSubgraph('CMP_PA', rebuilt, 'generated_only');

    expect(preservedManual).toBeGreaterThanOrEqual(2);
    const network = useNetworkStore.getState().network!;
    expect(network.edges.EDGE_MANUAL_1).toBeDefined();
    expect(network.edges[generated.id]).toBeDefined();
    expect(network.templates.CMP_PA.template_id).toBe('BOTTOM_COOL_VIA');
  });

  it('replaces everything when the engineer explicitly asks for it', () => {
    const component = pa();
    const first = buildComponentSubgraph(component, {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(first);
    useNetworkStore
      .getState()
      .upsertEdge(manualEdge('EDGE_MANUAL_1', first.nodes[0].id, first.nodes[1].id));

    const rebuilt = buildComponentSubgraph(component, {
      templateId: 'BARE_DIE',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().replaceComponentSubgraph('CMP_PA', rebuilt, 'entire');

    expect(useNetworkStore.getState().network!.edges.EDGE_MANUAL_1).toBeUndefined();
  });
});

describe('port connection (05 §16)', () => {
  it('wires a port to a shared node and creates an unresolved interface edge', () => {
    const structure = buildSharedStructure('FUNCTIONAL_ZONES');
    useNetworkStore.getState().addSubgraph({
      nodes: structure.nodes,
      edges: structure.edges,
      zones: structure.zones,
    });
    const subgraph = buildComponentSubgraph(pa(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(subgraph);

    const portNode = subgraph.nodes.find((node) => (node.ports ?? []).length > 0)!;
    const zoneId = structure.zones[0].id;
    useNetworkStore.getState().connectPort(portNode.id, 'HEAT_OUT', zoneId);

    const network = useNetworkStore.getState().network!;
    expect(network.nodes[portNode.id].ports![0].connected_to).toBe(zoneId);

    const edge = Object.values(network.edges).find(
      (candidate) => candidate.from === portNode.id && candidate.to === zoneId,
    )!;
    // The interface exists, but its resistance is not known yet (AC-05-35).
    expect(edge.resolution).toBe('unresolved');
    expect(edge.rth.analytical).toBeNull();

    useNetworkStore.getState().disconnectPort(portNode.id, 'HEAT_OUT');
    const after = useNetworkStore.getState().network!;
    expect(after.nodes[portNode.id].ports![0].connected_to).toBeNull();
    expect(after.edges[edge.id]).toBeUndefined();
  });
});

describe('undo / redo (05 §41, AC-05-27)', () => {
  it('restores the graph across add, connect and delete', () => {
    const subgraph = buildComponentSubgraph(pa(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(subgraph);
    const afterAdd = Object.keys(useNetworkStore.getState().network!.nodes).length;

    useNetworkStore.getState().removeNode(subgraph.nodes[0].id);
    expect(Object.keys(useNetworkStore.getState().network!.nodes).length).toBe(afterAdd - 1);

    useNetworkStore.getState().undo();
    expect(Object.keys(useNetworkStore.getState().network!.nodes).length).toBe(afterAdd);

    useNetworkStore.getState().redo();
    expect(Object.keys(useNetworkStore.getState().network!.nodes).length).toBe(afterAdd - 1);
  });

  it('does not record a node move as a solver-invalidating change (05 §48)', () => {
    const subgraph = buildComponentSubgraph(pa(), {
      templateId: 'BARE_DIE',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(subgraph);
    useSolverStore.getState().reset();

    useNetworkStore.getState().setNodePosition(subgraph.nodes[0].id, { x: 10, y: 20 });
    expect(useSolverStore.getState().dirtyReasons).toEqual([]);
    expect(useNetworkStore.getState().network!.layout.positions[subgraph.nodes[0].id]).toEqual({
      x: 10,
      y: 20,
    });
  });
});

describe('solver invalidation (05 §48, AC-05-48)', () => {
  it('marks the solver stale on any topology change', () => {
    const subgraph = buildComponentSubgraph(pa(), {
      templateId: 'TOP_COOL_LID',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(subgraph);
    expect(useSolverStore.getState().dirtyReasons).toContain('topology_changed');
  });
});

describe('network status (05 §37)', () => {
  it('moves from EMPTY to NEEDS_REVIEW while blocking errors exist', () => {
    expect(useNetworkStore.getState().network!.status).toBe('EMPTY');

    const subgraph = buildComponentSubgraph(pa(), {
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(subgraph);

    // The port is still unconnected and the source has no route out.
    expect(useNetworkStore.getState().network!.status).toBe('NEEDS_REVIEW');
    expect(useNetworkStore.getState().validation!.canContinue).toBe(false);
  });

  it('ignores a disabled node when looking for orphan heat sources (05 §51)', () => {
    const subgraph = buildComponentSubgraph(pa(), {
      templateId: 'BARE_DIE',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(subgraph);
    const source = subgraph.nodes.find((node) => node.power_W > 0)!;

    useNetworkStore.getState().mutate((network) => {
      for (const node of Object.values(network.nodes)) {
        network.nodes[node.id] = { ...node, disabled: true };
      }
      for (const edge of Object.values(network.edges)) {
        network.edges[edge.id] = { ...edge, enabled: false };
      }
    });

    const codes = useNetworkStore
      .getState()
      .validation!.issues.filter((issue) => issue.nodeId === source.id)
      .map((issue) => issue.code);
    expect(codes).not.toContain('ORPHAN_HEAT_SOURCE');
    expect(codes).not.toContain('UNCONNECTED_PORT');
  });
});
