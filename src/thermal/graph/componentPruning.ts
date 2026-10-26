/**
 * The graph objects of components that no longer exist in Screen 04.
 *
 * Deleting a component used to leave its subgraph in Screen 05 for good:
 * "Generate from Preferences" only rebuilds the components that are THERE, and
 * the solve projection skips a node whose component it cannot find — so the
 * deleted part's junction kept its stored power and was still counted in 07,
 * and its surfaces still showed in 06. These functions take such a part out of
 * the graph completely; `src/data/componentDeletion.ts` runs them whenever the
 * component list and the graph disagree.
 */

import type { ThermalEdge, ThermalNetwork, ThermalNode } from '@/thermal/types';

/** Whose node this is. `component_ref` covers nodes written before `origin` existed. */
export function nodeOwner(node: ThermalNode): string | null {
  return node.origin?.component_id ?? node.component_ref ?? null;
}

function edgeOwner(edge: ThermalEdge): string | null {
  return edge.origin?.component_id ?? null;
}

/** Component ids the graph still has objects for but the component list does not. */
export function orphanedComponentIds(network: ThermalNetwork, liveIds: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const node of Object.values(network.nodes)) {
    const owner = nodeOwner(node);
    if (owner && !liveIds.has(owner)) out.add(owner);
  }
  for (const edge of Object.values(network.edges)) {
    const owner = edgeOwner(edge);
    if (owner && !liveIds.has(owner)) out.add(owner);
  }
  for (const id of Object.keys(network.templates)) if (!liveIds.has(id)) out.add(id);
  return [...out].sort();
}

/**
 * Removes every object the given components own — template-built and hand-made
 * alike, since there is no part left for either to describe — and anything
 * left pointing at a removed node. Mutates `network` (call it inside a store
 * `mutate`). Returns the removed node ids, for the boundary ports built on them.
 */
export function pruneComponentObjects(
  network: ThermalNetwork,
  componentIds: ReadonlySet<string>,
): { nodes: string[]; edges: number } {
  const removed = new Set<string>();
  for (const [id, node] of Object.entries(network.nodes)) {
    const owner = nodeOwner(node);
    if (owner && componentIds.has(owner)) {
      removed.add(id);
      delete network.nodes[id];
    }
  }

  let edges = 0;
  for (const [id, edge] of Object.entries(network.edges)) {
    const owner = edgeOwner(edge);
    if ((owner && componentIds.has(owner)) || removed.has(edge.from) || removed.has(edge.to)) {
      delete network.edges[id];
      edges++;
    }
  }

  for (const node of Object.values(network.nodes)) {
    for (const port of node.ports ?? []) {
      if (port.connected_to && removed.has(port.connected_to)) port.connected_to = null;
    }
  }
  for (const id of componentIds) delete network.templates[id];
  for (const id of removed) delete network.layout.positions[id];
  for (const [key, mapping] of Object.entries(network.flotherm_mappings)) {
    if (removed.has(mapping.thermal_node_id)) delete network.flotherm_mappings[key];
  }
  return { nodes: [...removed], edges };
}

/** Screen 06's port id for a node (`deriveBoundaryPorts`). */
export function boundaryPortIdOf(nodeId: string): string {
  return `BP_${nodeId.replace(/^NODE_/, '')}`;
}
