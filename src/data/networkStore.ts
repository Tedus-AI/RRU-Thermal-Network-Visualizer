/**
 * Shared thermal network store — 00 §35, §53 forbidden item 2.
 *
 * Screen 01 only READS this store (for the Project Overview KPIs). Nodes and
 * edges are authored in Screen 05; nothing here may be created from Screen 01
 * (01 §45).
 *
 * Every mutator invalidates the solver result, because changing topology, Rth,
 * node power or edge enablement invalidates a previous solve (Rule 6).
 */

import { create } from 'zustand';
import { useSolverStore } from './solverStore';
import { DEFAULT_SOLVER_SETTINGS } from '@/thermal/types';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '@/thermal/types';

function emptyNetwork(projectId: string): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: projectId,
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    nodes: {},
    edges: {},
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

interface NetworkStoreState {
  network: ThermalNetwork | null;
  /**
   * Set when components changed under an existing graph — 02 §24. The topology
   * must be reviewed before the next solve is trusted.
   */
  requiresReview: boolean;

  loadFor: (projectId: string) => void;
  clear: () => void;
  setRequiresReview: (value: boolean) => void;

  upsertNode: (node: ThermalNode) => void;
  removeNode: (nodeId: string) => void;
  upsertEdge: (edge: ThermalEdge) => void;
  removeEdge: (edgeId: string) => void;

  // Derived selectors used by Project Overview / Project Health.
  nodeCount: () => number;
  edgeCount: () => number;
  flothermMappingCount: () => number;
}

export const useNetworkStore = create<NetworkStoreState>((set, get) => ({
  network: null,
  requiresReview: false,

  loadFor: (projectId) => set({ network: emptyNetwork(projectId), requiresReview: false }),
  clear: () => set({ network: null, requiresReview: false }),
  setRequiresReview: (requiresReview) => set({ requiresReview }),

  upsertNode: (node) => {
    const network = get().network;
    if (!network) return;
    set({ network: { ...network, nodes: { ...network.nodes, [node.id]: node } } });
    useSolverStore.getState().invalidate('topology_changed');
  },

  removeNode: (nodeId) => {
    const network = get().network;
    if (!network) return;
    const nodes = { ...network.nodes };
    delete nodes[nodeId];
    const edges = Object.fromEntries(
      Object.entries(network.edges).filter(([, e]) => e.from !== nodeId && e.to !== nodeId),
    );
    set({ network: { ...network, nodes, edges } });
    useSolverStore.getState().invalidate('topology_changed');
  },

  upsertEdge: (edge) => {
    const network = get().network;
    if (!network) return;
    set({ network: { ...network, edges: { ...network.edges, [edge.id]: edge } } });
    useSolverStore.getState().invalidate('topology_changed');
  },

  removeEdge: (edgeId) => {
    const network = get().network;
    if (!network) return;
    const edges = { ...network.edges };
    delete edges[edgeId];
    set({ network: { ...network, edges } });
    useSolverStore.getState().invalidate('topology_changed');
  },

  nodeCount: () => Object.keys(get().network?.nodes ?? {}).length,
  edgeCount: () => Object.keys(get().network?.edges ?? {}).length,
  flothermMappingCount: () => Object.keys(get().network?.flotherm_mappings ?? {}).length,
}));
