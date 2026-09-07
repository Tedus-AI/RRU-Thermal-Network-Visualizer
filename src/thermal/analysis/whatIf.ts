/**
 * The what-if: cut chosen resistances by a chosen amount and re-solve.
 *
 * This is the same physics the ranking used — a full network solve per state,
 * never a local estimate (08 §2, §13) — but driven by the reader rather than by
 * a sweep. Every segment in a component's chain is re-solved together, so the
 * answer includes the redistribution that a shared base or a parallel heat pipe
 * causes when one of them improves.
 *
 * A solve of this network is well under a millisecond, which is what makes a
 * 0.1 % step meaningful: the number moves while the reader is still holding the
 * control, so the question "how much is this segment worth" is answered by
 * dragging rather than by running a batch and reading a table.
 *
 * Nothing here writes to the stored network. The adjustments are a scenario
 * override on a clone, exactly as 08 §22 requires of the ranking.
 */

import { solveNetwork, type EdgeResult } from '../networkSolver';
import { edgeResistance } from '../rth';
import type { SolverSettings, ThermalNetwork } from '../types';
import type { ThermalSolution } from '../solver/solverTypes';

/** One segment of a component's heat path, as offered for adjustment. */
export interface ChainSegment {
  edge_id: string;
  label: string;
  from_name: string;
  to_name: string;
  edge_type: string;
  rth_C_per_W: number;
  heat_flow_W: number;
  /** The drop this segment is responsible for right now, °C. */
  delta_T_C: number;
  /** True when the segment carries more than this component's heat. */
  shared: boolean;
}

export interface Adjustment {
  edge_id: string;
  /** Percent reduction, 0–99. */
  reduction_pct: number;
}

export interface WhatIfOutcome {
  ok: boolean;
  temperatures: Record<string, number>;
  /** Per-edge Q, ΔT and the resistance actually used, so the graph can repaint
   *  in any result mode rather than only in temperature. */
  edges: Record<string, EdgeResult>;
  message?: string;
}

/**
 * The baseline solution with the what-if numbers in it.
 *
 * The graph on this screen is Screen 07's, and Screen 07's canvas paints from a
 * solution. Handing it a solution whose temperatures are current but whose Q
 * and ΔT are the baseline's would make the Heat Flow and ΔT modes quietly
 * wrong, so both are replaced together.
 */
export function solutionWithWhatIf(
  baseline: ThermalSolution,
  outcome: WhatIfOutcome,
): ThermalSolution {
  if (!outcome.ok) return baseline;

  const edge_results = { ...baseline.edge_results };
  for (const [id, result] of Object.entries(outcome.edges)) {
    const previous = edge_results[id];
    if (!previous) continue;
    edge_results[id] = {
      ...previous,
      heat_flow_W: result.heat_flow_W,
      delta_T_C: result.delta_T_C,
      active_rth_C_per_W: result.R_C_per_W,
    };
  }

  return { ...baseline, node_temperatures_C: outcome.temperatures, edge_results };
}

/**
 * The segments on one component's path, largest drop first.
 *
 * Ranked by ΔT rather than by resistance alone: ΔT is R·Q, so in a plain series
 * chain the two orders are identical, and where they differ — a heat pipe in
 * parallel with the metal around it, a shared base carrying nine components —
 * ΔT is the one that says how much temperature is actually available to remove.
 * Both are reported, so the resistance is never hidden behind the ranking.
 */
export function chainSegments(
  network: ThermalNetwork,
  solution: ThermalSolution,
  visibleNodeIds: ReadonlySet<string>,
  ownNodeIds: ReadonlySet<string>,
): ChainSegment[] {
  const segments: ChainSegment[] = [];

  for (const edge of Object.values(network.edges)) {
    if (!edge.enabled) continue;
    if (!visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to)) continue;

    const result = solution.edge_results[edge.id];
    if (!result || !Number.isFinite(result.active_rth_C_per_W)) continue;
    if (!(result.active_rth_C_per_W > 0)) continue;

    const fromName = network.nodes[edge.from]?.name ?? edge.from;
    const toName = network.nodes[edge.to]?.name ?? edge.to;

    segments.push({
      edge_id: edge.id,
      label: `${fromName} → ${toName}`,
      from_name: fromName,
      to_name: toName,
      edge_type: edge.type,
      rth_C_per_W: result.active_rth_C_per_W,
      heat_flow_W: result.heat_flow_W,
      delta_T_C: Math.abs(result.delta_T_C),
      // A segment neither of whose ends belongs to this device carries other
      // components' heat too — improving it helps more than the one part.
      shared: !ownNodeIds.has(edge.from) && !ownNodeIds.has(edge.to),
    });
  }

  segments.sort((a, b) => b.delta_T_C - a.delta_T_C || b.rth_C_per_W - a.rth_C_per_W);
  return segments;
}

/** The network with the adjustments applied, as a scenario override on a clone. */
export function networkWithAdjustments(
  network: ThermalNetwork,
  scenarioId: string,
  adjustments: readonly Adjustment[],
): ThermalNetwork {
  const edges = { ...network.edges };

  for (const adjustment of adjustments) {
    const edge = edges[adjustment.edge_id];
    if (!edge) continue;
    const current = edgeResistance(edge, scenarioId);
    if (current == null || !(current > 0)) continue;

    const factor = 1 - adjustment.reduction_pct / 100;
    const reduced = current * factor;
    if (!(reduced > 0) || !Number.isFinite(reduced)) continue;

    edges[adjustment.edge_id] = {
      ...edge,
      scenario_overrides: {
        ...edge.scenario_overrides,
        [scenarioId]: { ...edge.scenario_overrides?.[scenarioId], R_C_per_W: reduced },
      },
    };
  }

  return { ...network, nodes: { ...network.nodes }, edges };
}

/** Solve the network with the adjustments applied. The stored graph is untouched. */
export function solveWithAdjustments(
  network: ThermalNetwork,
  scenarioId: string,
  settings: SolverSettings,
  adjustments: readonly Adjustment[],
): WhatIfOutcome {
  const active = adjustments.filter((entry) => entry.reduction_pct > 0);
  const result = solveNetwork(networkWithAdjustments(network, scenarioId, active), {
    scenarioId,
    // The clone already carries the scenario's scaled power, exactly as the
    // baseline solve did.
    powerScale: 1,
    settings,
  });

  if (!result.ok) {
    return {
      ok: false,
      temperatures: {},
      edges: {},
      message: result.message ?? 'The what-if solve failed.',
    };
  }
  return { ok: true, temperatures: result.temperatures, edges: result.edges };
}
