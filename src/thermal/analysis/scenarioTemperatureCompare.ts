/**
 * Scenario-to-scenario temperature comparison — 09 §17, §18, §38.
 *
 * The comparison is by STABLE NODE ID (09 §18). Two scenarios of the same
 * project share one topology, so the ids line up; when they do not — a solution
 * saved before a node was added or removed — the result is a PARTIAL MATCH:
 * the nodes that do line up are compared, the rest are reported as missing, and
 * nothing is invented to fill the gap (09 §17 "if the node does not exist: N/A").
 */

import type { ThermalSolution } from '../solver/solverTypes';
import type { TemperatureRow } from './temperatureDataset';

export type MatchStatus = 'matched' | 'missing_baseline' | 'missing_comparison';

/** 09 §38. */
export interface ScenarioTemperatureComparison {
  node_id: string;
  node_name: string;
  component_name?: string;
  baseline_scenario_id: string;
  comparison_scenario_id: string;
  baseline_temperature_C?: number;
  comparison_temperature_C?: number;
  /** Comparison − baseline. Negative means the comparison scenario is cooler. */
  delta_temperature_C?: number;
  baseline_margin_C?: number;
  comparison_margin_C?: number;
  limit_C?: number;
  match_status: MatchStatus;
}

export interface ComparisonResult {
  rows: ScenarioTemperatureComparison[];
  matched: number;
  missing_baseline: number;
  missing_comparison: number;
  /** 09 §18 — true when the two solutions do not cover the same node set. */
  partial_match: boolean;
  /** 09 §48 — blocking when zero nodes line up. */
  compatible: boolean;
}

export function compareScenarios(input: {
  /** Rows already narrowed by the active scope and filters. */
  baselineRows: TemperatureRow[];
  baselineScenarioId: string;
  comparisonSolution: ThermalSolution;
  comparisonScenarioId: string;
  /** Limits come from the topology, which both scenarios share. */
  limitOf: (nodeId: string) => number | undefined;
}): ComparisonResult {
  const comparisonTemps = input.comparisonSolution.node_temperatures_C;
  const rows: ScenarioTemperatureComparison[] = [];

  let matched = 0;
  let missingComparison = 0;

  for (const row of input.baselineRows) {
    const comparison = comparisonTemps[row.node_id];
    const hasComparison = comparison != null && Number.isFinite(comparison);
    const limit = input.limitOf(row.node_id);

    if (hasComparison) matched++;
    else missingComparison++;

    rows.push({
      node_id: row.node_id,
      node_name: row.node_name,
      component_name: row.component_name,
      baseline_scenario_id: input.baselineScenarioId,
      comparison_scenario_id: input.comparisonScenarioId,
      baseline_temperature_C: row.temperature_C,
      comparison_temperature_C: hasComparison ? comparison : undefined,
      delta_temperature_C: hasComparison ? comparison - row.temperature_C : undefined,
      baseline_margin_C: row.margin_C,
      comparison_margin_C: hasComparison && limit != null ? limit - comparison : undefined,
      limit_C: limit,
      match_status: hasComparison ? 'matched' : 'missing_comparison',
    });
  }

  // Nodes the comparison solved that the baseline selection does not contain.
  // They are reported so a topology difference is visible rather than silent,
  // but they carry no delta: there is nothing to subtract from.
  const baselineIds = new Set(input.baselineRows.map((row) => row.node_id));
  let missingBaseline = 0;
  for (const [nodeId, temperature] of Object.entries(comparisonTemps)) {
    if (baselineIds.has(nodeId) || !Number.isFinite(temperature)) continue;
    missingBaseline++;
    rows.push({
      node_id: nodeId,
      node_name: nodeId,
      baseline_scenario_id: input.baselineScenarioId,
      comparison_scenario_id: input.comparisonScenarioId,
      comparison_temperature_C: temperature,
      limit_C: input.limitOf(nodeId),
      match_status: 'missing_baseline',
    });
  }

  // Largest warming first, so a scenario that hurts is at the top where it can
  // be seen. Unmatched rows sort last.
  rows.sort((a, b) => {
    if (a.delta_temperature_C == null && b.delta_temperature_C == null) return 0;
    if (a.delta_temperature_C == null) return 1;
    if (b.delta_temperature_C == null) return -1;
    return b.delta_temperature_C - a.delta_temperature_C;
  });

  return {
    rows,
    matched,
    missing_baseline: missingBaseline,
    missing_comparison: missingComparison,
    partial_match: missingBaseline > 0 || missingComparison > 0,
    compatible: matched > 0,
  };
}
