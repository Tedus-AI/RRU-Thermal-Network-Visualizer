/**
 * A component deleted in Screen 04 leaves Screens 05 and 06 with it.
 *
 * Before, its subgraph stayed in the graph for good — "Generate from
 * Preferences" only rebuilds the parts that are there — and the solve
 * projection skipped a node whose component it could not find, so the deleted
 * part's stored power was still counted and its surfaces still listed in 06.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent, type Component } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';
import { createBoundarySet } from '@/thermal/boundary/types';
import { boundaryPortIdOf, orphanedComponentIds, pruneComponentObjects } from '@/thermal/graph/componentPruning';
import { buildComponentSubgraph } from '@/thermal/graph/networkBuilder';
import { buildSharedStructure } from '@/thermal/graph/sharedStructure';
import type { ThermalNetwork, ThermalNode } from '@/thermal/types';

import { useComponentStore } from './componentStore';
import { deletedComponentsInGraph, startComponentDeletionSync } from './componentDeletion';
import { emptyNetwork, useNetworkStore } from './networkStore';
import { loadBoundarySets, saveBoundarySet } from './persistence';
import { useSolverStore } from './solverStore';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

const PROJECT = 'PRJ_DEL';

function part(id: string, name: string, power: number): Component {
  const component = createComponent({
    id,
    name,
    category: 'RF',
    qty: 1,
    power_W: power,
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

const pa = () => part('CMP_PA', 'Final PA', 52);
const driver = () => part('CMP_DRV', 'Driver', 9);

/** Shared structure plus both parts, each wired to the base. */
function buildGraph() {
  const net = useNetworkStore.getState();
  const structure = buildSharedStructure('SINGLE_MAIN_BASE');
  net.addSubgraph({ nodes: structure.nodes, edges: structure.edges, zones: structure.zones });
  for (const component of [pa(), driver()]) {
    const subgraph = buildComponentSubgraph(component, {
      materials: defaultMaterials(),
      templateId: 'BOTTOM_COOL_COIN',
      qtyModel: 'AGGREGATE',
    })!;
    useNetworkStore.getState().addSubgraph(subgraph);
    const port = subgraph.nodes.find((node) => node.ports?.length)!;
    useNetworkStore.getState().connectPort(port.id, 'HEAT_OUT', structure.zones[0].id, defaultMaterials());
  }
  return structure;
}

const owned = (network: ThermalNetwork, id: string) =>
  Object.values(network.nodes).filter((node) => (node.origin?.component_id ?? node.component_ref) === id);

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  useNetworkStore.getState().clear();
  useNetworkStore.getState().loadFor(PROJECT);
  useSolverStore.getState().reset();
  useComponentStore.setState({ components: [pa(), driver()], loaded_project_id: PROJECT });
});

afterEach(() => {
  useComponentStore.setState({ components: [], loaded_project_id: null });
});

describe('deleting a component in 04', () => {
  it('removes its subgraph and wiring from 05, and nothing else', () => {
    const structure = buildGraph();
    const before = useNetworkStore.getState().network!;
    expect(owned(before, 'CMP_PA').length).toBeGreaterThan(0);
    const sharedIds = structure.nodes.map((node) => node.id);

    useComponentStore.getState().deleteComponent('CMP_PA');

    const after = useNetworkStore.getState().network!;
    expect(owned(after, 'CMP_PA')).toEqual([]);
    expect(Object.values(after.edges).some((edge) => edge.origin?.component_id === 'CMP_PA')).toBe(false);
    expect(after.templates.CMP_PA).toBeUndefined();
    // Every remaining edge still resolves.
    for (const edge of Object.values(after.edges)) {
      expect(after.nodes[edge.from] && after.nodes[edge.to]).toBeTruthy();
    }
    // The other part and the shared structure are untouched.
    expect(owned(after, 'CMP_DRV').length).toBe(owned(before, 'CMP_DRV').length);
    for (const id of sharedIds) expect(after.nodes[id]).toBeDefined();
    expect(after.templates.CMP_DRV).toBeDefined();
    // Nothing is left for 05 to review: the part is gone, not orphaned.
    expect(useNetworkStore.getState().requiresReview).toBe(false);
    expect(useNetworkStore.getState().dirty).toBe(true);
  });

  it('drops its boundary assignments in every scenario of 06, keeping the rest', () => {
    buildGraph();
    const network = useNetworkStore.getState().network!;
    const paPort = boundaryPortIdOf(owned(network, 'CMP_PA')[0].id);
    const drvPort = boundaryPortIdOf(owned(network, 'CMP_DRV')[0].id);
    for (const scenarioId of ['BASE', 'HOT']) {
      const set = createBoundarySet({
        projectId: PROJECT,
        networkId: network.network_name,
        scenarioId,
        topologyVersion: 0,
        ambient_C: 55,
        wind_m_s: 0,
        solar_W_m2: 0,
      });
      set.profiles = [
        { id: `P_PA_${scenarioId}`, type: 'convection_to_ambient', parameters: {} } as never,
        { id: `P_DRV_${scenarioId}`, type: 'convection_to_ambient', parameters: {} } as never,
      ];
      set.assignments = [
        { id: 'A1', boundary_port_id: paPort, profile_ids: [`P_PA_${scenarioId}`], assignment_mode: 'manual', enabled: true },
        { id: 'A2', boundary_port_id: drvPort, profile_ids: [`P_DRV_${scenarioId}`], assignment_mode: 'manual', enabled: true },
      ];
      saveBoundarySet(PROJECT, set);
    }

    useComponentStore.getState().deleteComponent('CMP_PA');

    const sets = loadBoundarySets(PROJECT);
    expect(sets).toHaveLength(2);
    for (const set of sets) {
      expect(set.assignments.map((a) => a.boundary_port_id)).toEqual([drvPort]);
      expect(set.profiles.map((p) => p.id)).toEqual([`P_DRV_${set.scenario_id}`]);
    }
  });
});

describe('a project saved before deletions did this', () => {
  it('is cleaned when the list and the graph of the same project disagree', async () => {
    buildGraph();
    // The driver was deleted by an earlier version: still in the graph, not in the list.
    useComponentStore.setState({ components: [pa()], loaded_project_id: PROJECT });
    expect(deletedComponentsInGraph(PROJECT, ['CMP_PA'])).toEqual(['CMP_DRV']);

    const onPruned = vi.fn();
    const stop = startComponentDeletionSync(
      () => ({
        projectId: useComponentStore.getState().loaded_project_id,
        ids: useComponentStore.getState().components.map((c) => c.id),
      }),
      useComponentStore.subscribe,
      onPruned,
    );
    await Promise.resolve();
    stop();

    expect(owned(useNetworkStore.getState().network!, 'CMP_DRV')).toEqual([]);
    expect(owned(useNetworkStore.getState().network!, 'CMP_PA').length).toBeGreaterThan(0);
    expect(onPruned).toHaveBeenCalledWith(expect.objectContaining({ components: 1 }));
  });

  it("never prunes on an empty list or another project's list", () => {
    buildGraph();
    expect(deletedComponentsInGraph(PROJECT, [])).toBeNull();
    expect(deletedComponentsInGraph('OTHER', ['CMP_PA'])).toBeNull();
    expect(deletedComponentsInGraph(null, ['CMP_PA'])).toBeNull();
  });
});

describe('the graph function', () => {
  it('takes out hand-made objects of the part too, and unhooks anything pointing at it', () => {
    const network = emptyNetwork(PROJECT);
    const node = (id: string, owner: string | null, extra: Partial<ThermalNode> = {}) =>
      ({ id, name: id, type: 'junction', ...(owner ? { component_ref: owner } : {}), ...extra }) as ThermalNode;
    network.nodes.NODE_A = node('NODE_A', 'A');
    network.nodes.NODE_A_MANUAL = node('NODE_A_MANUAL', 'A', { origin: { kind: 'manual', component_id: 'A' } });
    network.nodes.NODE_B = node('NODE_B', 'B', {
      ports: [{ kind: 'HEAT_OUT', required: true, connected_to: 'NODE_A' }],
    });
    network.nodes.NODE_BASE = node('NODE_BASE', null);
    network.edges.E1 = { id: 'E1', from: 'NODE_B', to: 'NODE_A' } as never;
    network.edges.E2 = { id: 'E2', from: 'NODE_B', to: 'NODE_BASE' } as never;
    network.templates.A = { component_id: 'A' } as never;
    network.layout.positions.NODE_A = { x: 1, y: 2 };
    network.flotherm_mappings.M1 = { thermal_node_id: 'NODE_A' } as never;

    expect(orphanedComponentIds(network, new Set(['B']))).toEqual(['A']);
    const result = pruneComponentObjects(network, new Set(['A']));

    expect(result).toEqual({ nodes: ['NODE_A', 'NODE_A_MANUAL'], edges: 1 });
    expect(Object.keys(network.nodes).sort()).toEqual(['NODE_B', 'NODE_BASE']);
    expect(Object.keys(network.edges)).toEqual(['E2']);
    expect(network.nodes.NODE_B.ports?.[0].connected_to).toBeNull();
    expect(network.templates.A).toBeUndefined();
    expect(network.layout.positions.NODE_A).toBeUndefined();
    expect(network.flotherm_mappings.M1).toBeUndefined();
  });
});
