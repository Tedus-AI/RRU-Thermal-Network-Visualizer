/**
 * Heat-share spreading domains — the solve half of `graph/spreadingDomain.ts`.
 *
 * A part on `HeatShare` spreads into the share of the HSK base that matches its
 * share of the heat ENTERING the base: a uniformly loaded unit cell, so the
 * series no longer charges the part for carrying its heat to base corners the
 * base node's average already accounts for.
 *
 * The share is a heat flow, and a heat flow is only known once the network has
 * been solved — the part's nameplate power is not it (00 Rule 4): an FPGA on a
 * heat pipe hands most of its 35 W to the base through the pipe, not through its
 * own spreading edge, and a filter can take heat OUT of the base. So the domain
 * is found by fixed point: solve with the whole base, read each edge's solved
 * flow and the base's solved inflow, resize, re-solve its Bi, solve again. The
 * flows barely depend on the domains — every source but a parallel path has one
 * way into the base — so it settles in two or three passes.
 *
 * An edge whose heat flows OUT of the base has no cell to own; it keeps the
 * whole base and says so.
 */

import { computeRth } from '../resistance/calculators';
import { solveNetwork } from '../networkSolver';
import type { SolverSettings, ThermalEdge, ThermalNetwork } from '../types';
import { clampDomainArea } from '../graph/spreadingDomain';
import {
  downstreamResistance,
  refineEdge,
  type SpreadingBiotRefinement,
} from './spreadingBiot';

/** Largest relative move in any domain that still counts as settled. */
const CONVERGED = 0.005;
/**
 * A part with a parallel path (an FPGA on a heat pipe) moves heat between its
 * two routes as its domain shrinks, so it settles linearly rather than at
 * once: seven passes on the STARKCORE XCZU67DR. Each pass is one small solve.
 */
const MAX_PASSES = 25;

export interface SpreadingDomainResult {
  edge_id: string;
  mode: 'HeatShare' | 'Manual';
  plate_node_id: string;
  /** The domain the edge spreads into, mm² (for every device it stands for). */
  plate_area_mm2: number;
  base_area_mm2: number;
  /** HeatShare only: solved flow through the edge over solved inflow to the base. */
  heat_share: number | null;
  /** HeatShare only: the edge's solved heat flow, W. */
  heat_flow_W: number | null;
  /** HeatShare only: true when heat leaves the base through this edge. */
  reverse: boolean;
  passes: number;
  converged: boolean;
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function eligible(edge: ThermalEdge, mode: 'HeatShare' | 'Manual'): boolean {
  const params = edge.parameters ?? {};
  return (
    edge.enabled &&
    edge.method === 'spreading_disc' &&
    params.spreading_domain === mode &&
    positive(params.plate_area_mm2) &&
    positive(params.base_area_mm2) &&
    positive(params.source_area_mm2) &&
    edge.rth.active_source === 'Analytical'
  );
}

/** Heat arriving at `nodeId` through every edge that carries it in, W. */
function inflow(
  network: ThermalNetwork,
  nodeId: string,
  flows: Record<string, { heat_flow_W: number }>,
): number {
  let total = 0;
  for (const edge of Object.values(network.edges)) {
    const q = flows[edge.id]?.heat_flow_W;
    if (typeof q !== 'number' || !Number.isFinite(q)) continue;
    if (edge.to === nodeId && q > 0) total += q;
    else if (edge.from === nodeId && q < 0) total -= q;
  }
  return total;
}

/** Re-resolves one edge for its current domain, at the plate's finite Bi when known. */
function resolveDomainEdge(
  edge: ThermalEdge,
  R_down: number | null,
  scenarioId: string,
): SpreadingBiotRefinement | null {
  const params = edge.parameters ?? {};
  // The Bi → ∞ value of THIS domain, which is what "before" means for it.
  const floor = computeRth('spreading_disc', { ...params, bi: null }).value;
  if (floor == null || !positive(floor)) return null;
  edge.scenario_overrides = {
    ...edge.scenario_overrides,
    [scenarioId]: { ...edge.scenario_overrides?.[scenarioId], R_C_per_W: floor },
  };
  if (R_down == null) return null;
  const refined = refineEdge(edge, R_down, scenarioId);
  return refined ? { ...refined, R_before_C_per_W: floor } : null;
}

/**
 * Sizes every `HeatShare` edge's domain from the solved flows, in place on the
 * solve-ready clone, and reports every edge spreading into less than the whole
 * base — `Manual` ones included, so the solve can list both.
 */
export function refineSpreadingDomains(
  network: ThermalNetwork,
  scenarioId: string,
  settings?: SolverSettings,
): { domains: SpreadingDomainResult[]; biot: SpreadingBiotRefinement[] } {
  const manual = Object.values(network.edges).filter((edge) => eligible(edge, 'Manual'));
  const shared = Object.values(network.edges).filter((edge) => eligible(edge, 'HeatShare'));

  const domains: SpreadingDomainResult[] = manual.map((edge) => ({
    edge_id: edge.id,
    mode: 'Manual',
    plate_node_id: edge.to,
    plate_area_mm2: edge.parameters!.plate_area_mm2 as number,
    base_area_mm2: edge.parameters!.base_area_mm2 as number,
    heat_share: null,
    heat_flow_W: null,
    reverse: false,
    passes: 0,
    converged: true,
  }));
  if (shared.length === 0) return { domains, biot: [] };

  // The downstream path does not change with the domains — the probe drops the
  // spreading edges into the plate — so one probe per plate serves every pass.
  const downstream = new Map<string, number | null>();
  for (const edge of shared) {
    if (!downstream.has(edge.to)) {
      const R = downstreamResistance(network, edge.to, scenarioId, settings);
      downstream.set(edge.to, positive(R) ? R : null);
    }
  }

  const state = new Map(
    shared.map((edge) => [
      edge.id,
      { share: null as number | null, flow: null as number | null, reverse: false },
    ]),
  );
  const biot = new Map<string, SpreadingBiotRefinement>();
  let passes = 0;
  let converged = false;

  while (passes < MAX_PASSES) {
    const result = solveNetwork(network, { scenarioId, powerScale: 1, settings });
    if (!result.ok) break;
    passes += 1;

    const inflows = new Map<string, number>();
    let largestMove = 0;
    for (const edge of shared) {
      const params = edge.parameters!;
      const base = params.base_area_mm2 as number;
      if (!inflows.has(edge.to)) inflows.set(edge.to, inflow(network, edge.to, result.edges));
      const total = inflows.get(edge.to)!;
      const q = result.edges[edge.id]?.heat_flow_W ?? null;
      const reverse = !(typeof q === 'number' && q > 0) || !(total > 0);
      const share = reverse ? null : (q as number) / total;
      const target = reverse ? base : clampDomainArea(base * share!, params);

      const current = params.plate_area_mm2 as number;
      largestMove = Math.max(largestMove, Math.abs(target - current) / current);
      edge.parameters = { ...params, plate_area_mm2: target };
      if (share != null) edge.parameters.heat_share = share;
      else delete edge.parameters.heat_share;
      state.set(edge.id, { share, flow: q, reverse });

      const refined = resolveDomainEdge(edge, downstream.get(edge.to) ?? null, scenarioId);
      if (refined) biot.set(edge.id, refined);
      else biot.delete(edge.id);
    }
    if (largestMove < CONVERGED) {
      converged = true;
      break;
    }
  }

  for (const edge of shared) {
    const entry = state.get(edge.id)!;
    domains.push({
      edge_id: edge.id,
      mode: 'HeatShare',
      plate_node_id: edge.to,
      plate_area_mm2: edge.parameters!.plate_area_mm2 as number,
      base_area_mm2: edge.parameters!.base_area_mm2 as number,
      heat_share: entry.share,
      heat_flow_W: entry.flow,
      reverse: entry.reverse,
      passes,
      converged,
    });
  }
  return { domains, biot: [...biot.values()] };
}
