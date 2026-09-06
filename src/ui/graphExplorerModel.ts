import type { ThermalNetwork, ThermalNode } from '@/thermal/types';

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

/** Traverse shared structure, but never leak through a common sink into another device. */
export function focusHiddenNodes(network: ThermalNetwork, path: GraphPath): ReadonlySet<string> {
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
  return new Set(
    Object.values(network.nodes)
      .filter((node) => !visible.has(node.id))
      .map((node) => node.id),
  );
}
