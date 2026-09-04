/**
 * The order a component's nodes are listed in: the order heat passes through
 * them.
 *
 * They were sorted by node id, which is alphabetical, so a PA read
 *
 *   Case · Copper Coin · Junction · Solder · TIM
 *
 * when the heat actually goes
 *
 *   Junction → Case → Solder → Copper Coin → TIM → the base
 *
 * The junction — the hottest node in the part and the one the whole chain
 * exists to cool — sat third, between two nodes downstream of it. The table and
 * the network diagram disagreed about the same nine components.
 *
 * So the rank is graph distance from the node that carries the dissipation,
 * walked over the component's own edges. Three things it has to respect:
 *
 *   - INSTANCES stay together. A ×4 part is four identical chains, and
 *     interleaving them by distance would give four Junctions, then four
 *     Cases. Instance is the outer key; the path is the inner one.
 *   - A part can have NO source. Shared structure is base → fins → ambient with
 *     nothing dissipating in it, and those fall back to descending temperature,
 *     which along a heat path IS the direction of flow.
 *   - Disabled edges still count. Switching an edge off is a statement about
 *     heat flow, not about whether two nodes are adjacent, and a chain that
 *     re-ordered itself when someone disabled one link would be worse than
 *     alphabetical.
 */

import type { ThermalNetwork, ThermalNode } from '@/thermal/types';

/** The node that carries the component's dissipation, if this is one. */
function isSource(node: ThermalNode): boolean {
  return node.metadata?.component_power_linked === true || node.power_W !== 0;
}

function instanceOf(node: ThermalNode): string {
  const value = node.metadata?.instance;
  return typeof value === 'string' ? value : '';
}

/**
 * Distance in edges from the nearest source, for every node given.
 *
 * Multi-source: a ×4 part has four junctions, and its four chains share no
 * nodes, so one sweep gives each instance its own distances. Unreachable nodes
 * are absent from the map rather than given a large number, so a caller can
 * tell "far away" from "not on the path at all".
 */
export function heatPathDistance(
  network: ThermalNetwork,
  nodeIds: readonly string[],
): Map<string, number> {
  const inScope = new Set(nodeIds);
  const neighbours = new Map<string, string[]>();
  for (const edge of Object.values(network.edges)) {
    if (!inScope.has(edge.from) || !inScope.has(edge.to)) continue;
    (neighbours.get(edge.from) ?? neighbours.set(edge.from, []).get(edge.from)!).push(edge.to);
    (neighbours.get(edge.to) ?? neighbours.set(edge.to, []).get(edge.to)!).push(edge.from);
  }

  const distance = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds) {
    const node = network.nodes[id];
    if (node && isSource(node)) {
      distance.set(id, 0);
      queue.push(id);
    }
  }

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const next = (distance.get(current) ?? 0) + 1;
    for (const neighbour of neighbours.get(current) ?? []) {
      if (distance.has(neighbour)) continue;
      distance.set(neighbour, next);
      queue.push(neighbour);
    }
  }

  return distance;
}

export interface HeatPathSortable {
  node: ThermalNode;
  temperature_C: number | null;
}

/**
 * Comparator for a component's nodes: instance, then along the path.
 *
 * Temperature breaks a tie between two nodes the same distance from the source
 * — a body-sourced filter reaching both its own ambient and the base in one
 * step — and is the whole order for a group that has no source. Descending,
 * because heat runs downhill.
 */
export function compareAlongHeatPath(
  distance: ReadonlyMap<string, number>,
  a: HeatPathSortable,
  b: HeatPathSortable,
): number {
  const instance = instanceOf(a.node).localeCompare(instanceOf(b.node), undefined, {
    numeric: true,
  });
  if (instance !== 0) return instance;

  const da = distance.get(a.node.id);
  const db = distance.get(b.node.id);
  // On the path beats off it, whatever the numbers say.
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  if (da != null && db != null && da !== db) return da - db;

  const ta = a.temperature_C;
  const tb = b.temperature_C;
  if (ta != null && tb != null && ta !== tb) return tb - ta;
  if (ta != null && tb == null) return -1;
  if (ta == null && tb != null) return 1;

  // Stable, and the order the ids were already in before any of this.
  return a.node.id.localeCompare(b.node.id);
}

/**
 * Sorts a group's rows in place along its heat path.
 *
 * Takes a selector rather than requiring the shape: the result tree's rows nest
 * the node one level down, and casting them to look like they do not is exactly
 * how a sort ends up silently comparing `undefined` to `undefined`.
 */
export function sortAlongHeatPath<T>(
  network: ThermalNetwork,
  rows: T[],
  select: (row: T) => HeatPathSortable,
): T[] {
  const distance = heatPathDistance(
    network,
    rows.map((row) => select(row).node.id),
  );
  return rows.sort((a, b) => compareAlongHeatPath(distance, select(a), select(b)));
}
