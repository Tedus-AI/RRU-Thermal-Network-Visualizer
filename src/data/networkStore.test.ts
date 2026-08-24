/**
 * Store-level contracts for Screen 05 — 05 §40, §41, §46, §48.
 *
 * These cover the behaviours that only exist once a mutation goes through the
 * store: manual-edit protection on rebuild, undo/redo, port connection and
 * solver invalidation.
 */

import { defaultMaterials } from '@/domain/materials';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNetworkStore } from './networkStore';
import { useSolverStore } from './solverStore';
import { loadNetwork, saveNetwork } from './persistence';
import { createComponent } from '@/domain/component';
import { sourced } from '@/domain/sourcedValue';
import { buildComponentSubgraph } from '@/thermal/graph/networkBuilder';
import { refreshHskBaseConnectionEdges } from '@/thermal/graph/hskBaseConnection';
import { buildSharedStructure } from '@/thermal/graph/sharedStructure';
import { createRth, setRthFromSource } from '@/thermal/rth';
import type { ThermalEdge } from '@/thermal/types';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

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
  vi.stubGlobal('localStorage', new MemoryStorage());
  useNetworkStore.getState().clear();
  useNetworkStore.getState().loadFor('TEST');
  useSolverStore.getState().reset();
});

describe('component subgraph rebuild (05 §40, AC-05-11)', () => {
  it('preserves manual objects when only the generated ones are replaced', () => {
    const component = pa();
    const first = buildComponentSubgraph(component, {
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(first);
    useNetworkStore
      .getState()
      .upsertEdge(manualEdge('EDGE_MANUAL_1', first.nodes[0].id, first.nodes[1].id));

    const rebuilt = buildComponentSubgraph(component, {
      materials: defaultMaterials(),
      templateId: 'BARE_DIE',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().replaceComponentSubgraph('CMP_PA', rebuilt, 'entire');

    expect(useNetworkStore.getState().network!.edges.EDGE_MANUAL_1).toBeUndefined();
  });
});

describe('port connection (05 §16)', () => {
  it('automatically syncs a visible port edge before validation', () => {
    const structure = buildSharedStructure('SINGLE_MAIN_BASE');
    const subgraph = buildComponentSubgraph(pa(), {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph({
      nodes: structure.nodes,
      edges: structure.edges,
      zones: structure.zones,
    });
    useNetworkStore.getState().addSubgraph(subgraph);
    const portNode = subgraph.nodes.find((node) => node.ports?.length)!;
    const targetId = structure.zones[0].id;

    useNetworkStore
      .getState()
      .upsertEdge(manualEdge('EDGE_PORT_LEGACY_TIM_HSK_BASE', portNode.id, targetId));

    const state = useNetworkStore.getState();
    expect(state.network!.nodes[portNode.id].ports?.[0].connected_to).toBe(targetId);
    expect(
      state.validation!.issues.some(
        (issue) => issue.code === 'UNCONNECTED_PORT' && issue.nodeId === portNode.id,
      ),
    ).toBe(false);
  });

  it('repairs and persists an inconsistent saved network as soon as it loads', () => {
    const structure = buildSharedStructure('SINGLE_MAIN_BASE');
    const subgraph = buildComponentSubgraph(pa(), {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    const stored = structuredClone(useNetworkStore.getState().network!);
    for (const entry of structure.nodes) stored.nodes[entry.id] = entry;
    for (const entry of structure.edges) stored.edges[entry.id] = entry;
    for (const entry of structure.zones) stored.zones[entry.id] = entry;
    for (const entry of subgraph.nodes) stored.nodes[entry.id] = entry;
    for (const entry of subgraph.edges) stored.edges[entry.id] = entry;
    const portNode = subgraph.nodes.find((node) => node.ports?.length)!;
    const targetId = structure.zones[0].id;
    stored.edges.EDGE_PORT_SAVED_TIM_HSK_BASE = manualEdge(
      'EDGE_PORT_SAVED_TIM_HSK_BASE',
      portNode.id,
      targetId,
    );
    saveNetwork('LEGACY', stored);

    useNetworkStore.getState().loadFor('LEGACY');

    expect(useNetworkStore.getState().network!.nodes[portNode.id].ports?.[0].connected_to).toBe(
      targetId,
    );
    expect(loadNetwork('LEGACY')!.nodes[portNode.id].ports?.[0].connected_to).toBe(targetId);
    expect(useNetworkStore.getState().dirty).toBe(false);
  });

  it('wires a port to a shared node and creates an unresolved interface edge', () => {
    const structure = buildSharedStructure('DUAL_HSK_BASE');
    useNetworkStore.getState().addSubgraph({
      nodes: structure.nodes,
      edges: structure.edges,
      zones: structure.zones,
    });
    const subgraph = buildComponentSubgraph(pa(), {
      materials: defaultMaterials(),
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

  it('resolves TIM HEAT_OUT into the shared HSK Base as spreading, not L/(kA)', () => {
    const materials = {
      ...defaultMaterials(),
      coin_L_mm: sourced(20, 'Manual'),
      coin_W_mm: sourced(10, 'Manual'),
      hsk_base_thickness_mm: sourced(5, 'Manual'),
      hsk_base_L_mm: sourced(300, 'Manual'),
      hsk_base_W_mm: sourced(220, 'Manual'),
    };
    const component = pa();
    component.thermal_spec.heat_path.type = 'Coin';
    component.thermal_spec.geometry.package_L_mm = 20;
    component.thermal_spec.geometry.package_W_mm = 10;
    component.thermal_spec.geometry.source_L_mm = 20;
    component.thermal_spec.geometry.source_W_mm = 10;
    component.thermal_spec.tim.tim_id = 'TIM_GREASE';

    const structure = buildSharedStructure('SINGLE_MAIN_BASE');
    const subgraph = buildComponentSubgraph(component, {
      materials,
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph({
      nodes: structure.nodes,
      edges: structure.edges,
      zones: structure.zones,
    });
    useNetworkStore.getState().addSubgraph(subgraph);

    const portNode = subgraph.nodes.find((node) => node.ports?.length)!;
    const hskBaseId = structure.zones[0].id;
    useNetworkStore.getState().connectPort(portNode.id, 'HEAT_OUT', hskBaseId, materials);

    const edge = Object.values(useNetworkStore.getState().network!.edges).find(
      (candidate) => candidate.from === portNode.id && candidate.to === hskBaseId,
    )!;
    expect(edge.type).toBe('spreading');
    expect(edge.method).toBe('spreading_disc');
    // AGGREGATE represents two PA devices, so the effective footprint is 2 x
    // the 20 x 10 mm face; the plate is the whole 300 x 220 mm base.
    expect(edge.parameters).toMatchObject({
      thickness_mm: 5,
      k_W_mK: 96,
      source_area_mm2: 400,
      plate_area_mm2: 66000,
      psi_variant: 'max',
    });
    // Hand-computed from Lee et al.: a = 11.284 mm, b = 144.94 mm, ε = 0.07785,
    // τ = 0.03450, λ = 10.3883, Φ = 0.34370, Ψ_max = 0.15998. The one-dimensional
    // t/(k·A) over the SAME contact patch would be 0.1302 — 56% higher — which is
    // the whole reason this edge stopped being conduction_LkA.
    expect(edge.rth.analytical).toBeCloseTo(0.08335, 5);
    expect(edge.resolution).toBe('resolved');
    expect(edge.resolution_note).toContain('UNDER-estimates');
    expect(edge.metadata?.connection_role).toBe('hsk_base_conduction');

    const improvedMaterials = {
      ...materials,
      hsk_base_k_W_mK: sourced(192, 'Manual'),
    };
    useNetworkStore.getState().mutate((network) => {
      network.edges[edge.id].rth = setRthFromSource(
        network.edges[edge.id].rth,
        'Manual',
        0.08,
        'high',
        { makeActive: true },
      );
    });
    useNetworkStore.getState().mutate((network) => {
      expect(refreshHskBaseConnectionEdges(network, improvedMaterials)).toBe(1);
    });
    const refreshed = useNetworkStore.getState().network!.edges[edge.id];
    expect(refreshed.parameters?.k_W_mK).toBe(192);
    expect(refreshed.rth.analytical).toBeCloseTo(edge.rth.analytical! / 2, 10);
    expect(refreshed.rth.active_source).toBe('Manual');
    expect(refreshed.rth.manual).toBe(0.08);
  });

  it('leaves the HSK Base conduction unresolved when Screen 01 has no thickness', () => {
    const materials = {
      ...defaultMaterials(),
      coin_L_mm: sourced(20, 'Manual'),
      coin_W_mm: sourced(10, 'Manual'),
    };
    const component = pa();
    component.thermal_spec.heat_path.type = 'Coin';
    component.thermal_spec.geometry.package_L_mm = 20;
    component.thermal_spec.geometry.package_W_mm = 10;
    component.thermal_spec.tim.tim_id = 'TIM_GREASE';
    const structure = buildSharedStructure('SINGLE_MAIN_BASE');
    const subgraph = buildComponentSubgraph(component, {
      materials,
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph({
      nodes: structure.nodes,
      edges: structure.edges,
      zones: structure.zones,
    });
    useNetworkStore.getState().addSubgraph(subgraph);
    const portNode = subgraph.nodes.find((node) => node.ports?.length)!;
    useNetworkStore
      .getState()
      .connectPort(portNode.id, 'HEAT_OUT', structure.zones[0].id, materials);

    const edge = Object.values(useNetworkStore.getState().network!.edges).find(
      (candidate) => candidate.metadata?.connection_role === 'hsk_base_conduction',
    )!;
    expect(edge.rth.analytical).toBeNull();
    expect(edge.resolution).toBe('unresolved');
    // Named in words, because the fix is a Screen 01 field and not a parameter key.
    expect(edge.resolution_note).toContain('HSK Base thickness (Screen 01)');
    expect(edge.resolution_note).toContain('HSK Base L × W (Screen 01)');
  });
});

describe('shared structure replacement', () => {
  it('disconnects ports instead of guessing an RF/Digital target when switching to dual HSK', () => {
    const oldStructure = buildSharedStructure('SINGLE_MAIN_BASE');
    const subgraph = buildComponentSubgraph(pa(), {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph({
      nodes: oldStructure.nodes,
      edges: oldStructure.edges,
      zones: oldStructure.zones,
    });
    useNetworkStore.getState().addSubgraph(subgraph);
    const portNode = subgraph.nodes.find((node) => node.ports?.length)!;
    useNetworkStore
      .getState()
      .connectPort(portNode.id, 'HEAT_OUT', oldStructure.zones[0].id);

    const next = buildSharedStructure('DUAL_HSK_BASE');
    useNetworkStore.getState().replaceSharedStructure(next);
    const network = useNetworkStore.getState().network!;
    expect(network.nodes.NODE_HSK_BASE).toBeUndefined();
    expect(network.nodes.NODE_RF_HSK_BASE.name).toBe('RF HSK Base / Fin Root');
    expect(network.nodes.NODE_DIGITAL_HSK_BASE.name).toBe('Digital HSK Base / Fin Root');
    expect(network.nodes[portNode.id].ports?.[0].connected_to).toBeNull();
    expect(
      Object.values(network.edges).some(
        (edge) => edge.from === portNode.id && edge.to.includes('HSK_BASE'),
      ),
    ).toBe(false);
    expect(Object.keys(network.zones).sort()).toEqual([
      'NODE_DIGITAL_HSK_BASE',
      'NODE_RF_HSK_BASE',
    ]);
  });
});

describe('undo / redo (05 §41, AC-05-27)', () => {
  it('restores the graph across add, connect and delete', () => {
    const subgraph = buildComponentSubgraph(pa(), {
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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

  it('restores nested port state as well as the generated connection edge', () => {
    const structure = buildSharedStructure('DUAL_HSK_BASE');
    const subgraph = buildComponentSubgraph(pa(), {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph({
      nodes: structure.nodes,
      edges: structure.edges,
      zones: structure.zones,
    });
    useNetworkStore.getState().addSubgraph(subgraph);
    const portNode = subgraph.nodes.find((entry) => entry.ports?.length)!;
    const zoneId = structure.zones[0].id;

    useNetworkStore.getState().connectPort(portNode.id, 'HEAT_OUT', zoneId);
    useNetworkStore.getState().undo();

    const restored = useNetworkStore.getState().network!;
    expect(restored.nodes[portNode.id].ports?.[0].connected_to).toBeNull();
    expect(
      Object.values(restored.edges).some(
        (candidate) => candidate.from === portNode.id && candidate.to === zoneId,
      ),
    ).toBe(false);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('persistent network review state', () => {
  it('survives a reload with its reasons until explicitly cleared', () => {
    useNetworkStore.getState().setRequiresReview(true, 'component_qty_changed');
    useNetworkStore.getState().loadFor('TEST');
    expect(useNetworkStore.getState().requiresReview).toBe(true);
    expect(useNetworkStore.getState().requiresReviewReasons).toContain('component_qty_changed');

    useNetworkStore.getState().setRequiresReview(false);
    useNetworkStore.getState().loadFor('TEST');
    expect(useNetworkStore.getState().requiresReview).toBe(false);
    expect(useNetworkStore.getState().requiresReviewReasons).toEqual([]);
  });
});

describe('solver invalidation (05 §48, AC-05-48)', () => {
  it('marks the solver stale on any topology change', () => {
    const subgraph = buildComponentSubgraph(pa(), {
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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
      materials: defaultMaterials(),
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
