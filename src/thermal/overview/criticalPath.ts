/**
 * Critical path tracing — 10 §12, §13.
 *
 * The Network Snapshot highlights one path: the top bottleneck's path when
 * Screen 08 has current results, and otherwise the hottest component's path to
 * a boundary (10 §13). The same path defines which edges count as "critical"
 * for the low-confidence tally in Data Completeness (10 §12) — otherwise
 * "critical edge" would be a word with no definition behind it.
 *
 * The trace follows HEAT, not topology order: from a starting node it repeatedly
 * takes the edge carrying the largest heat flow away from that node, until it
 * reaches a boundary. That is the path the energy actually takes, which is the
 * only thing that makes an intermediate resistance matter.
 */

import type { ThermalNetwork } from '../types';
import type { ThermalSolution } from '../solver/solverTypes';
import { isBoundaryNode } from '../analysis/temperatureDataset';

export interface CriticalPath {
  node_ids: string[];
  edge_ids: string[];
  /** Where the trace started, and why. */
  origin: 'top_bottleneck' | 'hottest_component' | 'none';
  label: string;
}

const EMPTY: CriticalPath = { node_ids: [], edge_ids: [], origin: 'none', label: '' };

interface Adjacency {
  /** Edges touching a node, with the flow SIGNED as leaving that node. */
  [nodeId: string]: Array<{ edge_id: string; other: string; leaving_W: number }>;
}

function adjacencyOf(network: ThermalNetwork, solution: ThermalSolution): Adjacency {
  const adjacency: Adjacency = {};

  for (const edge of Object.values(network.edges)) {
    if (!edge.enabled) continue;
    const result = solution.edge_results[edge.id];
    if (!result) continue;

    // `heat_flow_W` is signed along from → to; a negative value is a legal
    // reverse flow (07 §15), so leaving-ness is a sign flip, not an error.
    const flow = Number.isFinite(result.heat_flow_W) ? result.heat_flow_W : 0;

    (adjacency[edge.from] ??= []).push({ edge_id: edge.id, other: edge.to, leaving_W: flow });
    (adjacency[edge.to] ??= []).push({ edge_id: edge.id, other: edge.from, leaving_W: -flow });
  }

  return adjacency;
}

/** Follow the largest outgoing heat flow until a boundary node or a dead end. */
function walk(
  start: string,
  adjacency: Adjacency,
  network: ThermalNetwork,
  direction: 'downstream' | 'upstream',
): { node_ids: string[]; edge_ids: string[] } {
  const node_ids = [start];
  const edge_ids: string[] = [];
  const seen = new Set([start]);

  let current = start;
  // The graph is small, but a cycle with balanced flows could still spin; the
  // visited set plus a hard cap keeps the trace finite either way.
  for (let step = 0; step < 64; step += 1) {
    const node = network.nodes[current];
    if (node && isBoundaryNode(node) && direction === 'downstream' && step > 0) break;

    const options = (adjacency[current] ?? []).filter((entry) => !seen.has(entry.other));
    if (options.length === 0) break;

    const best = options.reduce((chosen, entry) => {
      const value = direction === 'downstream' ? entry.leaving_W : -entry.leaving_W;
      const chosenValue = direction === 'downstream' ? chosen.leaving_W : -chosen.leaving_W;
      return value > chosenValue ? entry : chosen;
    });

    const bestValue = direction === 'downstream' ? best.leaving_W : -best.leaving_W;
    // No heat moving that way means there is no path worth calling critical.
    if (!(bestValue > 0)) break;

    edge_ids.push(best.edge_id);
    node_ids.push(best.other);
    seen.add(best.other);
    current = best.other;
  }

  return { node_ids, edge_ids };
}

/** The path through a specific edge: upstream to a source, downstream to a boundary. */
export function tracePathThroughEdge(
  network: ThermalNetwork,
  solution: ThermalSolution,
  edgeId: string,
  label: string,
): CriticalPath {
  const edge = network.edges[edgeId];
  if (!edge) return EMPTY;

  const adjacency = adjacencyOf(network, solution);
  const result = solution.edge_results[edgeId];
  const flow = result?.heat_flow_W ?? 0;

  // Order the ends by the direction heat actually travels through this edge.
  const upstreamEnd = flow >= 0 ? edge.from : edge.to;
  const downstreamEnd = flow >= 0 ? edge.to : edge.from;

  const back = walk(upstreamEnd, adjacency, network, 'upstream');
  const forward = walk(downstreamEnd, adjacency, network, 'downstream');

  return {
    node_ids: [...back.node_ids.slice().reverse(), ...forward.node_ids],
    edge_ids: [...back.edge_ids.slice().reverse(), edgeId, ...forward.edge_ids],
    origin: 'top_bottleneck',
    label,
  };
}

/** 10 §13 fallback — the hottest node's path out to a boundary. */
export function traceHottestPath(
  network: ThermalNetwork,
  solution: ThermalSolution,
): CriticalPath {
  let hottest: { id: string; temperature_C: number } | null = null;

  for (const [nodeId, temperature] of Object.entries(solution.node_temperatures_C)) {
    const node = network.nodes[nodeId];
    if (!node || node.disabled) continue;
    // Boundaries are where heat leaves, not where a problem starts.
    if (isBoundaryNode(node)) continue;
    if (!Number.isFinite(temperature)) continue;
    if (hottest == null || temperature > hottest.temperature_C) {
      hottest = { id: nodeId, temperature_C: temperature };
    }
  }

  if (!hottest) return EMPTY;

  const adjacency = adjacencyOf(network, solution);
  const forward = walk(hottest.id, adjacency, network, 'downstream');

  return {
    node_ids: forward.node_ids,
    edge_ids: forward.edge_ids,
    origin: 'hottest_component',
    label: network.nodes[hottest.id]?.name ?? hottest.id,
  };
}

/**
 * 10 §12 — critical edges resting on low-confidence inputs.
 *
 * "Critical" means on the highlighted path; "low confidence" means the edge is
 * explicitly marked low, or its resistance is an assumption with nothing behind
 * it. An `Assumed` Rth on the main heat path is exactly the kind of number that
 * should stop a reader from over-trusting the result.
 */
export function countLowConfidenceCriticalEdges(
  network: ThermalNetwork,
  solution: ThermalSolution,
  path: CriticalPath,
): number {
  let count = 0;
  for (const edgeId of path.edge_ids) {
    const edge = network.edges[edgeId];
    const result = solution.edge_results[edgeId];
    if (!edge) continue;
    const source = result?.active_rth_source ?? edge.rth.active_source;
    if (edge.confidence === 'low' || source === 'Assumed') count += 1;
  }
  return count;
}
