import type { ThermalNetwork, ThermalNode } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { heatPathReach } from '@/thermal/analysis/heatPathReach';

export const graphOwner = (node: ThermalNode) => node.origin?.component_id ?? node.component_ref;
export const graphInstance = (node: ThermalNode) =>
  typeof node.metadata?.instance === 'string' ? node.metadata.instance : '';
export interface GraphPath {
  key: string;
  componentId: string;
  instance: string;
  power: number;
  nodeIds: string[];
}

/** In focus the header already identifies the device; trim only its exact generated prefix. */
export function focusLabels(
  network: ThermalNetwork,
  path: GraphPath,
  componentName: string,
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const prefix = `${componentName}${path.instance ? ` ${path.instance}` : ''} `;
  for (const id of path.nodeIds) {
    const node = network.nodes[id];
    if (node?.origin?.kind !== 'template' || node.power_W !== 0 || !node.name.startsWith(prefix))
      continue;
    const short = node.name.slice(prefix.length).trim();
    if (short) labels.set(id, short);
  }
  return labels;
}

/** Presentation descriptors only. Never changes the network or solver input. */
export function graphPaths(network: ThermalNetwork | null | undefined): GraphPath[] {
  const paths = new Map<string, GraphPath>();
  for (const node of Object.values(network?.nodes ?? {})) {
    const componentId = graphOwner(node);
    if (!componentId) continue;
    const instance = graphInstance(node);
    const key = JSON.stringify([componentId, instance]);
    const path = paths.get(key) ?? { key, componentId, instance, power: 0, nodeIds: [] };
    path.nodeIds.push(node.id);
    path.power += node.power_W;
    paths.set(key, path);
  }
  return [...paths.values()].sort((a, b) => {
    if (a.componentId !== b.componentId)
      return a.componentId.localeCompare(b.componentId, undefined, { numeric: true });
    const order = network?.templates[a.componentId]?.instances ?? [];
    const ai = order.indexOf(a.instance);
    const bi = order.indexOf(b.instance);
    return ai >= 0 && bi >= 0
      ? ai - bi
      : a.instance.localeCompare(b.instance, undefined, { numeric: true });
  });
}

/**
 * Traverse shared structure, but never leak through a common sink into another
 * device -- and, given a solve, never past a node that is FEEDING this one.
 *
 * The topological walk below is what keeps one device's focus from wandering
 * into the next one's chain. It is not enough on its own: the cavity filter's
 * contact is fed BY the heatsink base, so the base, the fin surface and ambient
 * are all shared structure reachable from it, and the focus drew a tail that
 * says the filter is cooled by the fins while every arrow on it points the
 * other way. `heatPathReach` follows the solved directions instead and stops
 * one hop past anything flowing inward, which is the same rule the report's
 * group figures use. Without a solution nothing is trimmed.
 */
export function focusHiddenNodes(
  network: ThermalNetwork,
  path: GraphPath,
  solution?: ThermalSolution | null,
): ReadonlySet<string> {
  const nodes = new Map(Object.values(network.nodes).map((node) => [node.id, node]));
  const adjacent = new Map<string, string[]>();
  for (const edge of Object.values(network.edges)) {
    for (const [a, b] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      adjacent.set(a, [...(adjacent.get(a) ?? []), b]);
    }
  }
  const visible = new Set(path.nodeIds);
  const queue = [...visible];
  for (let i = 0; i < queue.length; i++) {
    const node = nodes.get(queue[i]);
    if (!node || node.type === 'ambient' || node.boundary_type === 'fixed_temperature') continue;
    for (const id of adjacent.get(node.id) ?? []) {
      const next = nodes.get(id);
      if (!next || visible.has(id)) continue;
      const owner = graphOwner(next);
      if (owner && (owner !== path.componentId || graphInstance(next) !== path.instance)) continue;
      visible.add(id);
      queue.push(id);
    }
  }
  const hidden = new Set(
    Object.values(network.nodes)
      .filter((node) => !visible.has(node.id))
      .map((node) => node.id),
  );

  // The heat walk runs on the subgraph the focus is already showing, so it
  // cannot route out through a device this view has put away and back in.
  if (!solution) return hidden;
  const onPath = heatPathReach({
    network,
    solution,
    own: new Set(path.nodeIds),
    excluded: hidden,
  });
  for (const id of visible) {
    if (!onPath.has(id)) hidden.add(id);
  }
  return hidden;
}
