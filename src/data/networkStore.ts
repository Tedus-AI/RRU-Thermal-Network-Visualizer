/**
 * Shared thermal network store — 05 §46, §47, §48.
 *
 * This is the SINGLE source of truth for the graph. Cytoscape is a view and
 * interaction layer only; its internal state never substitutes for this (05 §56).
 *
 * Every mutation that changes topology, resistance, edge enablement or source
 * power representation marks the solver DIRTY (05 §48, 00 Rule 6).
 */

import { create } from 'zustand';
import { useSolverStore } from './solverStore';
import {
  loadNetwork,
  loadNetworkReviewState,
  saveNetwork,
  saveNetworkReviewState,
} from './persistence';
import { DEFAULT_SOLVER_SETTINGS } from '@/thermal/types';
import { createRevision } from '@/domain/revision';
import type {
  BaseZone,
  ComponentTemplateBinding,
  NetworkStatus,
  SolverSettings,
  ThermalEdge,
  ThermalNetwork,
  ThermalNode,
} from '@/thermal/types';
import { validateGraph, type GraphValidationResult } from '@/thermal/graph/graphValidation';
import { hskBaseConnectionPatch } from '@/thermal/graph/hskBaseConnection';
import type { MaterialDefaults } from '@/domain/materials';

export function emptyNetwork(projectId: string): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: projectId,
    revision: createRevision('network'),
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    status: 'EMPTY',
    nodes: {},
    edges: {},
    templates: {},
    zones: {},
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

/** A snapshot for undo/redo — 05 §41. */
type Snapshot = Pick<ThermalNetwork, 'nodes' | 'edges' | 'templates' | 'zones' | 'layout'>;

const HISTORY_LIMIT = 50;

interface NetworkStoreState {
  network: ThermalNetwork | null;
  dirty: boolean;
  requiresReview: boolean;
  requiresReviewReasons: string[];
  validation: GraphValidationResult | null;
  past: Snapshot[];
  future: Snapshot[];

  loadFor: (projectId: string) => void;
  clear: () => void;
  setRequiresReview: (value: boolean, reason?: string) => void;

  /** Applies a mutation, records history and invalidates the solver. */
  mutate: (
    recipe: (network: ThermalNetwork) => void,
    options?: { skipHistory?: boolean; skipInvalidate?: boolean },
  ) => void;

  upsertNode: (node: ThermalNode) => void;
  removeNode: (nodeId: string) => void;
  upsertEdge: (edge: ThermalEdge) => void;
  removeEdge: (edgeId: string) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;

  addSubgraph: (input: {
    nodes: ThermalNode[];
    edges: ThermalEdge[];
    binding?: ComponentTemplateBinding;
    zones?: BaseZone[];
  }) => void;
  /** Replaces generated shared structure without deleting component subgraphs. */
  replaceSharedStructure: (input: {
    nodes: ThermalNode[];
    edges: ThermalEdge[];
    zones: BaseZone[];
  }, materials?: MaterialDefaults) => void;
  /** Replaces a component's generated objects, preserving manual edits (05 §40). */
  replaceComponentSubgraph: (
    componentId: string,
    next: { nodes: ThermalNode[]; edges: ThermalEdge[]; binding: ComponentTemplateBinding },
    mode: 'generated_only' | 'entire',
  ) => { preservedManual: number };

  connectPort: (
    nodeId: string,
    portKind: string,
    targetNodeId: string,
    materials?: MaterialDefaults,
  ) => void;
  disconnectPort: (nodeId: string, portKind: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  revalidate: () => GraphValidationResult | null;
  setStatus: (status: NetworkStatus) => void;
  /** Energy-balance thresholds and numerical limits — 07 §14, 00 Rule 6. */
  updateSolverSettings: (patch: Partial<SolverSettings>) => void;
  save: (projectId: string) => void;

  nodeCount: () => number;
  edgeCount: () => number;
  flothermMappingCount: () => number;
}

function snapshot(network: ThermalNetwork): Snapshot {
  return structuredClone({
    nodes: network.nodes,
    edges: network.edges,
    templates: network.templates,
    zones: network.zones,
    layout: network.layout,
  });
}

/** Creates the stored edge for a component port connection. */
function portConnectionEdge(
  network: ThermalNetwork,
  nodeId: string,
  targetNodeId: string,
  materials?: MaterialDefaults,
): ThermalEdge {
  const edgeKey = `EDGE_PORT_${nodeId.replace(/^NODE_/, '')}_${targetNodeId.replace(/^NODE_/, '')}`;
  const linkedBaseModel = materials
    ? hskBaseConnectionPatch(network, nodeId, targetNodeId, materials)
    : null;
  return {
    id: edgeKey,
    from: nodeId,
    to: targetNodeId,
    type: 'contact',
    method: 'direct_rth',
    rth: {
      analytical: null,
      flotherm: null,
      measurement: null,
      manual: null,
      active_source: 'Analytical',
      provenance: {},
    },
    parameters: {},
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'unresolved',
    resolution_note: 'Interface resistance between the component port and the shared structure.',
    enabled: true,
    origin: { kind: 'manual', component_id: network.nodes[nodeId]?.component_ref },
    ...(linkedBaseModel ?? {}),
  };
}

export const useNetworkStore = create<NetworkStoreState>((set, get) => ({
  network: null,
  dirty: false,
  requiresReview: false,
  requiresReviewReasons: [],
  validation: null,
  past: [],
  future: [],

  loadFor: (projectId) => {
    const stored = loadNetwork(projectId);
    const network = stored ?? emptyNetwork(projectId);
    const review = loadNetworkReviewState(projectId);
    set({
      network,
      dirty: false,
      requiresReview: review.requires_review,
      requiresReviewReasons: review.reasons,
      past: [],
      future: [],
      validation: validateGraph(network),
    });
  },

  clear: () =>
    set({
      network: null,
      dirty: false,
      requiresReview: false,
      requiresReviewReasons: [],
      past: [],
      future: [],
      validation: null,
    }),

  setRequiresReview: (requiresReview, reason) => {
    const network = get().network;
    const reasons = requiresReview
      ? Array.from(new Set([...get().requiresReviewReasons, ...(reason ? [reason] : [])]))
      : [];
    set({ requiresReview, requiresReviewReasons: reasons });
    if (network) {
      saveNetworkReviewState(network.project_id, {
        requires_review: requiresReview,
        reasons,
      });
    }
  },

  mutate: (recipe, options = {}) => {
    const current = get().network;
    if (!current) return;

    const before = snapshot(current);
    // Recipes may edit nested ports/provenance; isolate them from history and subscribers.
    const next: ThermalNetwork = structuredClone(current);
    recipe(next);

    // Layout-only mutations deliberately keep the engineering graph revision.
    // Every mutation that invalidates a solve advances the provenance clock.
    if (!options.skipInvalidate) next.revision = createRevision('network');

    const validation = validateGraph(next);
    next.status = Object.keys(next.nodes).length === 0
      ? 'EMPTY'
      : validation.errors > 0
        ? 'NEEDS_REVIEW'
        : 'DRAFT';

    set({
      network: next,
      dirty: true,
      validation,
      past: options.skipHistory ? get().past : [...get().past, before].slice(-HISTORY_LIMIT),
      future: options.skipHistory ? get().future : [],
    });

    // 05 §48 — any topology or resistance change invalidates a previous solve.
    if (!options.skipInvalidate) {
      useSolverStore.getState().invalidate('topology_changed');
    }
  },

  upsertNode: (node) => get().mutate((network) => void (network.nodes[node.id] = node)),

  removeNode: (nodeId) =>
    get().mutate((network) => {
      delete network.nodes[nodeId];
      for (const [id, edge] of Object.entries(network.edges)) {
        if (edge.from === nodeId || edge.to === nodeId) delete network.edges[id];
      }
      // Any port pointing at the removed node becomes unconnected again.
      for (const node of Object.values(network.nodes)) {
        if (!node.ports?.length) continue;
        node.ports = node.ports.map((port) =>
          port.connected_to === nodeId ? { ...port, connected_to: null } : port,
        );
      }
      delete network.layout.positions[nodeId];
    }),

  upsertEdge: (edge) => get().mutate((network) => void (network.edges[edge.id] = edge)),

  removeEdge: (edgeId) => get().mutate((network) => void delete network.edges[edgeId]),

  // Moving a node is layout, not physics: no solver invalidation.
  setNodePosition: (nodeId, position) =>
    get().mutate(
      (network) => void (network.layout.positions[nodeId] = position),
      { skipInvalidate: true },
    ),

  addSubgraph: ({ nodes, edges, binding, zones }) =>
    get().mutate((network) => {
      for (const node of nodes) network.nodes[node.id] = node;
      for (const edge of edges) network.edges[edge.id] = edge;
      if (binding) network.templates[binding.component_id] = binding;
      for (const zone of zones ?? []) network.zones[zone.id] = zone;
    }),

  replaceSharedStructure: ({ nodes, edges, zones }, materials) =>
    get().mutate((network) => {
      const removedNodeIds = new Set(
        Object.values(network.nodes)
          .filter((node) => node.origin?.kind === 'shared_structure')
          .map((node) => node.id),
      );
      const nextNodeIds = new Set(nodes.map((node) => node.id));
      const replacementHsk = zones.find((zone) => zone.type === 'heat_sink_base')?.id ?? null;
      const retainedConnections: Array<{ nodeId: string; targetNodeId: string }> = [];

      for (const id of removedNodeIds) {
        delete network.nodes[id];
        delete network.layout.positions[id];
      }
      for (const [id, edge] of Object.entries(network.edges)) {
        if (
          edge.origin?.kind === 'shared_structure' ||
          removedNodeIds.has(edge.from) ||
          removedNodeIds.has(edge.to)
        ) {
          delete network.edges[id];
        }
      }
      for (const [id] of Object.entries(network.zones)) {
        if (removedNodeIds.has(id)) delete network.zones[id];
      }
      // Replacing the structure deliberately disconnects component ports. The
      // same physical target is retained when it survives the replacement. A
      // legacy single Main Base maps to the corrected single HSK Base.
      for (const node of Object.values(network.nodes)) {
        if (!node.ports?.length) continue;
        node.ports = node.ports.map((port) => {
          const oldTarget = port.connected_to;
          if (!oldTarget || !removedNodeIds.has(oldTarget)) return port;
          const targetNodeId = nextNodeIds.has(oldTarget)
            ? oldTarget
            : oldTarget === 'NODE_MAIN_BASE'
              ? replacementHsk
              : null;
          if (targetNodeId) retainedConnections.push({ nodeId: node.id, targetNodeId });
          return { ...port, connected_to: targetNodeId };
        });
      }

      for (const node of nodes) network.nodes[node.id] = node;
      for (const edge of edges) network.edges[edge.id] = edge;
      for (const zone of zones) network.zones[zone.id] = zone;
      for (const connection of retainedConnections) {
        const edge = portConnectionEdge(
          network,
          connection.nodeId,
          connection.targetNodeId,
          materials,
        );
        network.edges[edge.id] = edge;
      }
    }),

  replaceComponentSubgraph: (componentId, next, mode) => {
    let preservedManual = 0;

    get().mutate((network) => {
      const belongs = (origin?: { component_id?: string }) => origin?.component_id === componentId;

      for (const [id, node] of Object.entries(network.nodes)) {
        if (!belongs(node.origin)) continue;
        // 05 §40 — a hand-modified object is never silently discarded.
        const isManual = node.origin?.kind === 'manual' || node.origin?.modified;
        if (mode === 'generated_only' && isManual) {
          preservedManual++;
          continue;
        }
        delete network.nodes[id];
      }

      for (const [id, edge] of Object.entries(network.edges)) {
        if (!belongs(edge.origin)) continue;
        const isManual = edge.origin?.kind === 'manual' || edge.origin?.modified;
        if (mode === 'generated_only' && isManual) {
          preservedManual++;
          continue;
        }
        delete network.edges[id];
      }

      for (const node of next.nodes) network.nodes[node.id] = node;
      for (const edge of next.edges) network.edges[edge.id] = edge;
      network.templates[componentId] = next.binding;
    });

    return { preservedManual };
  },

  connectPort: (nodeId, portKind, targetNodeId, materials) =>
    get().mutate((network) => {
      const node = network.nodes[nodeId];
      if (!node?.ports) return;
      node.ports = node.ports.map((port) =>
        port.kind === portKind ? { ...port, connected_to: targetNodeId } : port,
      );

      // The port becomes a real edge. Single-HSK connections are resolved from
      // Screen 01; other structures retain an explicit unresolved interface.
      const edge = portConnectionEdge(network, nodeId, targetNodeId, materials);
      network.edges[edge.id] = edge;
    }),

  disconnectPort: (nodeId, portKind) =>
    get().mutate((network) => {
      const node = network.nodes[nodeId];
      if (!node?.ports) return;
      const port = node.ports.find((candidate) => candidate.kind === portKind);
      if (port?.connected_to) {
        const edgeKey = `EDGE_PORT_${nodeId.replace(/^NODE_/, '')}_${port.connected_to.replace(/^NODE_/, '')}`;
        delete network.edges[edgeKey];
      }
      node.ports = node.ports.map((candidate) =>
        candidate.kind === portKind ? { ...candidate, connected_to: null } : candidate,
      );
    }),

  undo: () => {
    const { past, network } = get();
    if (past.length === 0 || !network) return;
    const previous = past[past.length - 1];
    const restored: ThermalNetwork = {
      ...network,
      ...previous,
      revision: createRevision('network'),
    };
    set({
      network: restored,
      past: past.slice(0, -1),
      future: [snapshot(network), ...get().future].slice(0, HISTORY_LIMIT),
      validation: validateGraph(restored),
      dirty: true,
    });
    useSolverStore.getState().invalidate('topology_changed');
  },

  redo: () => {
    const { future, network } = get();
    if (future.length === 0 || !network) return;
    const nextSnapshot = future[0];
    const restored: ThermalNetwork = {
      ...network,
      ...nextSnapshot,
      revision: createRevision('network'),
    };
    set({
      network: restored,
      future: future.slice(1),
      past: [...get().past, snapshot(network)].slice(-HISTORY_LIMIT),
      validation: validateGraph(restored),
      dirty: true,
    });
    useSolverStore.getState().invalidate('topology_changed');
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  revalidate: () => {
    const network = get().network;
    if (!network) return null;
    const validation = validateGraph(network);
    set({ validation });
    return validation;
  },

  setStatus: (status) =>
    set((state) =>
      state.network ? { network: { ...state.network, status } } : state,
    ),

  updateSolverSettings: (patch) => {
    const network = get().network;
    if (!network) return;
    set({
      network: {
        ...network,
        revision: createRevision('network'),
        solver_settings: { ...network.solver_settings, ...patch },
      },
      dirty: true,
    });
    // The thresholds decide whether a result passes, so a previous solve is
    // no longer authoritative (00 Rule 6).
    useSolverStore.getState().invalidate('solver_settings_changed');
  },

  save: (projectId) => {
    const network = get().network;
    if (!network) return;
    saveNetwork(projectId, network);
    set({ dirty: false });
  },

  nodeCount: () => Object.keys(get().network?.nodes ?? {}).length,
  edgeCount: () => Object.keys(get().network?.edges ?? {}).length,
  flothermMappingCount: () => Object.keys(get().network?.flotherm_mappings ?? {}).length,
}));
