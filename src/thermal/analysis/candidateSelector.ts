/**
 * Candidate selection — 08 §5, §11.
 *
 * An edge is a candidate when improving it is a question worth asking: it is
 * active, it has a real resistance, and the baseline solve gave it a heat flow.
 * Everything excluded is recorded WITH ITS REASON, so the screen can say why 47
 * edges became 41 candidates instead of quietly shrinking the list.
 *
 * An "ideal link" — a resistance so small it is a modelling shortcut rather than
 * a physical interface — is excluded on purpose: reducing an already negligible
 * resistance by 20 % changes nothing, and it would only add noise to the ranking.
 */

import { edgeResistance } from '../rth';
import type { ThermalEdge, ThermalNetwork } from '../types';
import type { EdgeSolutionResult, ThermalSolution } from '../solver/solverTypes';
import type {
  Candidate,
  CandidateFilters,
  CandidateScope,
  RejectedCandidate,
} from './analysisTypes';

/** Below this an edge is a modelling shortcut, not an interface (08 §5). */
export const IDEAL_LINK_RTH_C_PER_W = 1e-4;
/** Below this the baseline flow is numerical dust, not heat worth optimising. */
export const NEGLIGIBLE_FLOW_W = 1e-6;

/** 08 §5 — edge types eligible for candidacy. */
const ELIGIBLE_TYPES = new Set<ThermalEdge['type']>([
  'package_rjc',
  'tim',
  'solder',
  'conduction',
  'thermal_via',
  'contact',
  'heat_pipe',
  'spreading',
  'convection',
  'radiation',
  'custom',
]);

export function isBoundaryDerived(edge: ThermalEdge): boolean {
  return edge.method === 'convection_hA' || edge.method === 'radiation_hA';
}

/**
 * Shared structure means the heat of more than one component passes through it:
 * a base zone, a heat sink, the boundary. Improving a shared segment helps every
 * component behind it, which is exactly what the sensitivity re-solve measures.
 */
function isShared(network: ThermalNetwork, edge: ThermalEdge): boolean {
  const structural: Array<string | undefined> = [
    'main_base',
    'small_base',
    'base_zone',
    'heat_sink_base',
    'fin_root',
    'fin_surface',
    'housing',
    'heat_pipe_evaporator',
    'heat_pipe_condenser',
    'ambient',
    'external_air',
  ];
  const from = network.nodes[edge.from];
  const to = network.nodes[edge.to];
  return structural.includes(from?.type) && structural.includes(to?.type);
}

/** The Path / Component column: which part of the model this edge belongs to. */
export function pathLabelFor(network: ThermalNetwork, edge: ThermalEdge): string {
  if (isBoundaryDerived(edge)) return 'Boundary';
  if (isShared(network, edge)) return 'Shared Structure';

  const from = network.nodes[edge.from];
  const to = network.nodes[edge.to];
  const componentId = from?.component_ref ?? to?.component_ref;
  if (componentId) {
    const zone = from?.zone ?? to?.zone ?? from?.zone_id ?? to?.zone_id;
    return zone ? `${componentId} · ${zone}` : `${componentId} Local`;
  }
  return from?.zone ?? to?.zone ?? 'Structure';
}

/** Nodes reachable from `startId` over the active edges, `startId` included. */
function reachableFrom(
  network: ThermalNetwork,
  startId: string,
  scenarioId: string,
): Set<string> {
  const neighbours = new Map<string, string[]>();
  for (const edge of Object.values(network.edges)) {
    const R = edgeResistance(edge, scenarioId);
    if (R == null || !(R > 0)) continue;
    if (!neighbours.has(edge.from)) neighbours.set(edge.from, []);
    if (!neighbours.has(edge.to)) neighbours.set(edge.to, []);
    neighbours.get(edge.from)?.push(edge.to);
    neighbours.get(edge.to)?.push(edge.from);
  }

  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of neighbours.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function inScope(
  network: ThermalNetwork,
  edge: ThermalEdge,
  scope: CandidateScope,
  options: { targetNodeId: string | null; customIds: string[]; scenarioId: string },
): boolean {
  switch (scope) {
    case 'all_edges':
      return true;

    case 'shared_structure':
      return isShared(network, edge);

    case 'boundary_path':
      return isBoundaryDerived(edge);

    case 'component_path':
      return Boolean(network.nodes[edge.from]?.component_ref || network.nodes[edge.to]?.component_ref);

    case 'custom_selection':
      return options.customIds.includes(edge.id);

    case 'selected_component': {
      if (!options.targetNodeId) return false;
      const componentId = network.nodes[options.targetNodeId]?.component_ref;
      if (!componentId) return false;
      return (
        network.nodes[edge.from]?.component_ref === componentId ||
        network.nodes[edge.to]?.component_ref === componentId
      );
    }

    case 'selected_node_path': {
      if (!options.targetNodeId) return false;
      // Everything the selected node can reach: its whole path to the boundary.
      const reachable = reachableFrom(network, options.targetNodeId, options.scenarioId);
      return reachable.has(edge.from) && reachable.has(edge.to);
    }

    default:
      return true;
  }
}

function passesFilters(
  network: ThermalNetwork,
  candidate: Candidate,
  filters: CandidateFilters,
): boolean {
  const from = network.nodes[candidate.edge.from];
  const to = network.nodes[candidate.edge.to];

  if (filters.edge_type !== 'All' && candidate.edge.type !== filters.edge_type) return false;

  if (filters.component !== 'All') {
    const components = [from?.component_ref, to?.component_ref].filter(Boolean);
    if (!components.includes(filters.component)) return false;
  }

  if (filters.zone !== 'All') {
    const zones = [from?.zone, to?.zone, from?.zone_id, to?.zone_id].filter(Boolean);
    if (!zones.includes(filters.zone)) return false;
  }

  if (filters.rth_source !== 'All' && candidate.active_source !== filters.rth_source) return false;
  if (filters.confidence !== 'All' && candidate.confidence !== filters.confidence) return false;

  if (filters.sharing === 'shared' && !candidate.shared) return false;
  if (filters.sharing === 'local' && candidate.shared) return false;

  if (filters.boundary === 'boundary' && !candidate.boundary_derived) return false;
  if (filters.boundary === 'internal' && candidate.boundary_derived) return false;

  return true;
}

export interface CandidateSelection {
  candidates: Candidate[];
  rejected: RejectedCandidate[];
}

export function selectCandidates(input: {
  network: ThermalNetwork;
  solution: ThermalSolution;
  scenarioId: string;
  scope: CandidateScope;
  filters: CandidateFilters;
  targetNodeId: string | null;
  customEdgeIds: string[];
}): CandidateSelection {
  const { network, solution, scenarioId, scope, filters } = input;
  const candidates: Candidate[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const edge of Object.values(network.edges)) {
    if (!ELIGIBLE_TYPES.has(edge.type)) {
      rejected.push({ edge_id: edge.id, reason: 'ideal_link' });
      continue;
    }

    const result: EdgeSolutionResult | undefined = solution.edge_results[edge.id];
    const R = result?.active_rth_C_per_W ?? edgeResistance(edge, scenarioId);

    if (!edge.enabled) {
      rejected.push({ edge_id: edge.id, reason: 'disabled' });
      continue;
    }
    if (R == null || !(R > 0) || !Number.isFinite(R)) {
      rejected.push({ edge_id: edge.id, reason: 'no_resistance' });
      continue;
    }
    if (R < IDEAL_LINK_RTH_C_PER_W) {
      rejected.push({ edge_id: edge.id, reason: 'ideal_link' });
      continue;
    }
    if (!result || !Number.isFinite(result.heat_flow_W) || Math.abs(result.heat_flow_W) < NEGLIGIBLE_FLOW_W) {
      // 08 §5 — no valid solved Q means there is nothing to redistribute.
      rejected.push({ edge_id: edge.id, reason: 'no_solved_flow' });
      continue;
    }

    if (
      !inScope(network, edge, scope, {
        targetNodeId: input.targetNodeId,
        customIds: input.customEdgeIds,
        scenarioId,
      })
    ) {
      rejected.push({ edge_id: edge.id, reason: 'out_of_scope' });
      continue;
    }

    const candidate: Candidate = {
      edge,
      R_C_per_W: R,
      heat_flow_W: result.heat_flow_W,
      delta_T_C: result.delta_T_C,
      from_name: network.nodes[edge.from]?.name ?? edge.from,
      to_name: network.nodes[edge.to]?.name ?? edge.to,
      path_label: pathLabelFor(network, edge),
      shared: isShared(network, edge),
      boundary_derived: isBoundaryDerived(edge),
      active_source: result.active_rth_source,
      confidence:
        edge.rth.provenance[edge.rth.active_source]?.confidence ?? edge.confidence ?? 'medium',
    };

    if (!passesFilters(network, candidate, filters)) {
      rejected.push({ edge_id: edge.id, reason: 'filtered_out' });
      continue;
    }

    candidates.push(candidate);
  }

  return { candidates, rejected };
}

/** Distinct filter values present in the current graph, for the filter selects. */
export function filterOptions(network: ThermalNetwork): {
  edgeTypes: string[];
  components: string[];
  zones: string[];
  sources: string[];
} {
  const edgeTypes = new Set<string>();
  const components = new Set<string>();
  const zones = new Set<string>();
  const sources = new Set<string>();

  for (const edge of Object.values(network.edges)) {
    edgeTypes.add(edge.type);
    sources.add(edge.rth.active_source);
  }
  for (const node of Object.values(network.nodes)) {
    if (node.component_ref) components.add(node.component_ref);
    const zone = node.zone ?? node.zone_id;
    if (zone) zones.add(zone);
  }

  const sorted = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b));
  return {
    edgeTypes: sorted(edgeTypes),
    components: sorted(components),
    zones: sorted(zones),
    sources: sorted(sources),
  };
}
