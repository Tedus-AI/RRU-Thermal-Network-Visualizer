/**
 * Sensitivity — 08 §2, §13, §22.
 *
 * For each candidate: clone the baseline solve input, reduce ONLY that edge's
 * resistance, and solve the COMPLETE graph again. The heat flow is re-derived
 * from the new temperatures every time.
 *
 * The rule this file exists to keep (08 §2, §13): baseline Q is never reused.
 * Estimating `ΔT_new = Q_baseline × R_new` would silently assume the heat flow
 * does not move — which is exactly what it does do in a shared base or a
 * parallel branch, and exactly the effect the analysis is supposed to measure.
 *
 * And 08 §22: nothing here writes to the stored network, to the official edge
 * resistances, or to the Screen 07 solution. Every solve is ephemeral.
 */

import { solveNetwork } from '../networkSolver';
import { edgeResistance } from '../rth';
import type { SolverSettings, ThermalEdge, ThermalNetwork } from '../types';
import type { SolveInput } from '../solver/buildSolveInput';

import { affectedComponents, worstComponentTemperature, worstThermalMargin } from './affectedComponents';
import type { Candidate, SensitivityOutcome, TargetMetric } from './analysisTypes';

export interface BaselineMetrics {
  temperatures: Record<string, number>;
  worst_component_C: number | null;
  worst_component_node: string | null;
  worst_margin_C: number | null;
  worst_margin_node: string | null;
  energy_error_pct: number;
}

export interface SensitivityContext {
  /** Solve-ready clone from Screen 07. Treated as read-only. */
  baselineInput: SolveInput;
  baseline: BaselineMetrics;
  network: ThermalNetwork;
  scenarioId: string;
  settings: SolverSettings;
  target_metric: TargetMetric;
  target_node_id: string | null;
  reduction_pct: number;
}

/** The value of the target metric for one set of solved temperatures. */
export function targetValue(
  context: Pick<SensitivityContext, 'network' | 'target_metric' | 'target_node_id'>,
  temperatures: Record<string, number>,
): number | null {
  switch (context.target_metric) {
    case 'worst_component_temperature':
      return worstComponentTemperature(context.network, temperatures).value;

    case 'worst_thermal_margin':
      return worstThermalMargin(context.network, temperatures).value;

    case 'selected_component_temperature':
    case 'selected_node_temperature': {
      if (!context.target_node_id) return null;
      const value = temperatures[context.target_node_id];
      return Number.isFinite(value) ? value : null;
    }

    default:
      return null;
  }
}

/**
 * Improvement is always "more is better", whichever metric is selected: a
 * temperature target improves when it falls, a margin target when it rises.
 */
export function improvementOf(
  metric: TargetMetric,
  before: number | null,
  after: number | null,
): number {
  if (before == null || after == null) return 0;
  return metric === 'worst_thermal_margin' ? after - before : before - after;
}

/** A deep-enough clone that a modified solve cannot touch the baseline input. */
function cloneNetworkFor(network: ThermalNetwork, edgeId: string): ThermalNetwork {
  const edge = network.edges[edgeId];
  return {
    ...network,
    nodes: { ...network.nodes },
    edges: {
      ...network.edges,
      [edgeId]: {
        ...edge,
        rth: { ...edge.rth, provenance: { ...edge.rth.provenance } },
        scenario_overrides: edge.scenario_overrides
          ? Object.fromEntries(
              Object.entries(edge.scenario_overrides).map(([key, value]) => [key, { ...value }]),
            )
          : undefined,
      } as ThermalEdge,
    },
  };
}

export function baselineMetricsOf(
  network: ThermalNetwork,
  temperatures: Record<string, number>,
  energyErrorPct: number,
): BaselineMetrics {
  const worstComponent = worstComponentTemperature(network, temperatures);
  const worstMargin = worstThermalMargin(network, temperatures);
  return {
    temperatures,
    worst_component_C: worstComponent.value,
    worst_component_node: worstComponent.node_id,
    worst_margin_C: worstMargin.value,
    worst_margin_node: worstMargin.node_id,
    energy_error_pct: energyErrorPct,
  };
}

/**
 * One candidate: reduce its Rth, re-solve everything, and report what changed.
 * A failure here is isolated (08 §21) — the batch keeps going and this row is
 * marked FAILED rather than dropped or given a made-up score.
 */
export function runCandidate(candidate: Candidate, context: SensitivityContext): SensitivityOutcome {
  const reduction = context.reduction_pct / 100;
  const originalR = candidate.R_C_per_W;
  const modifiedR = originalR * (1 - reduction);

  const baselineTarget = targetValue(context, context.baseline.temperatures);

  const failed = (message: string): SensitivityOutcome => ({
    reduction_pct: context.reduction_pct,
    original_rth_C_per_W: originalR,
    modified_rth_C_per_W: modifiedR,
    baseline_target_C: baselineTarget,
    modified_target_C: null,
    target_improvement_C: 0,
    baseline_worst_margin_C: context.baseline.worst_margin_C,
    modified_worst_margin_C: null,
    margin_improvement_C: 0,
    affected_component_count: 0,
    affected_components: [],
    solve_status: 'FAILED',
    energy_error_pct: null,
    message,
  });

  if (!(modifiedR > 0) || !Number.isFinite(modifiedR)) {
    return failed('The reduced resistance is not a usable positive value.');
  }

  const modifiedNetwork = cloneNetworkFor(context.baselineInput.network, candidate.edge.id);
  const edge = modifiedNetwork.edges[candidate.edge.id];

  // The override is applied to the CLONE only. The official Rth slots — and the
  // stored graph — are untouched (08 §22).
  edge.scenario_overrides = {
    ...edge.scenario_overrides,
    [context.scenarioId]: {
      ...edge.scenario_overrides?.[context.scenarioId],
      R_C_per_W: modifiedR,
    },
  };

  const applied = edgeResistance(edge, context.scenarioId);
  if (applied == null || Math.abs(applied - modifiedR) > 1e-12) {
    return failed('The reduced resistance could not be applied to the candidate edge.');
  }

  // Full-network re-solve. Power is already baked into the clone, so the scale
  // is 1 here exactly as in the baseline solve.
  const result = solveNetwork(modifiedNetwork, {
    scenarioId: context.scenarioId,
    powerScale: 1,
    settings: context.settings,
  });

  if (!result.ok) {
    return failed(result.message ?? 'The modified network could not be solved.');
  }

  const nonFinite = Object.values(result.temperatures).some((value) => !Number.isFinite(value));
  if (nonFinite) return failed('The modified solve produced a non-finite temperature.');

  const modifiedTarget = targetValue(context, result.temperatures);
  const modifiedMargin = worstThermalMargin(context.network, result.temperatures).value;
  const { affected, improved_count } = affectedComponents(
    context.network,
    context.baseline.temperatures,
    result.temperatures,
  );

  const energyErrorPct = result.energy.error_pct;
  const solveStatus: SensitivityOutcome['solve_status'] =
    energyErrorPct > context.settings.energy_error_pct
      ? 'FAILED'
      : energyErrorPct > context.settings.energy_warn_pct
        ? 'WARNING'
        : 'SOLVED';

  return {
    reduction_pct: context.reduction_pct,
    original_rth_C_per_W: originalR,
    modified_rth_C_per_W: modifiedR,
    baseline_target_C: baselineTarget,
    modified_target_C: modifiedTarget,
    target_improvement_C: improvementOf(context.target_metric, baselineTarget, modifiedTarget),
    baseline_worst_margin_C: context.baseline.worst_margin_C,
    modified_worst_margin_C: modifiedMargin,
    margin_improvement_C:
      context.baseline.worst_margin_C == null || modifiedMargin == null
        ? 0
        : modifiedMargin - context.baseline.worst_margin_C,
    // "Affected" counts components that genuinely got cooler (08 §12). Rows for
    // components that got warmer are still listed, so the redistribution stays
    // visible rather than being hidden by the count.
    affected_component_count: improved_count,
    affected_components: affected,
    solve_status: solveStatus,
    energy_error_pct: energyErrorPct,
    message:
      solveStatus === 'SOLVED'
        ? undefined
        : `Modified solve energy balance is ${energyErrorPct.toFixed(2)} %.`,
  };
}
