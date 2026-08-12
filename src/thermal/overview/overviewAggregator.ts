/**
 * Results Overview aggregator — 10 §5, §6, §9, §10, §11, §12, §20.
 *
 * The one place Screens 07, 08 and 09 meet for the summary. It READS all three
 * and computes nothing they own: no solve, no sensitivity, no binning
 * (10 §0, §36). Where a source is missing or not current, the corresponding
 * block comes back absent — never zero-filled, never estimated (10 §21,
 * AC-10-30).
 */

import type { Component } from '@/domain/component';
import type { Scenario } from '@/domain/project';

import type { ThermalNetwork } from '../types';
import type { ThermalSolution } from '../solver/solverTypes';
import { energyGrade } from '../solver/solverTypes';
import { DEFAULT_SOLVER_SETTINGS, type SolverSettings } from '../types';
import type { BottleneckAnalysis } from '../analysis/analysisTypes';
import {
  WARNING_TEMPERATURE_C,
  buildTemperatureDataset,
  type TemperatureRow,
} from '../analysis/temperatureDataset';
import { computeStatistics } from '../analysis/temperatureStatistics';

import {
  CURRENT_RESULT_MODE,
  RTH_SOURCE_BUCKETS,
  rthBucketOf,
  type BottleneckAvailability,
  type BottleneckSummary,
  type DataCompletenessSummary,
  type ResultsOverview,
  type ResultsOverviewKpis,
  type RthSourceBucket,
  type SolverQualitySummary,
  type TemperatureSummary,
} from './overviewTypes';
import { CRITICAL_COMPONENT_TOP_N, buildCriticalComponents, worstMargin } from './criticalComponents';
import { evaluateOverallStatus } from './overallStatus';
import { buildReadiness, evaluateReportReadiness } from './reportReadiness';
import { buildActionSummary, recommendNextAction } from './actionSummaryRules';
import {
  countLowConfidenceCriticalEdges,
  traceHottestPath,
  tracePathThroughEdge,
  type CriticalPath,
} from './criticalPath';

/** 10 §9 — the specification's row count for the bottleneck block. */
export const TOP_BOTTLENECK_COUNT = 3;

export interface OverviewInput {
  project_id: string;
  scenario: Scenario;
  network: ThermalNetwork;
  solution: ThermalSolution;
  components: Component[];
  /** Screen 08's stored analysis for this scenario, if any. */
  analysis: BottleneckAnalysis | null;
  /** 07 §38 — the stored solution predates a change to the inputs. */
  solution_stale: boolean;
  solver_settings?: SolverSettings;
  now?: string;
}

export interface OverviewResult {
  overview: ResultsOverview;
  /** Kept beside the overview so the snapshot and the UI share one dataset. */
  rows: TemperatureRow[];
  critical_path: CriticalPath;
}

/**
 * 10 §9, AC-10-08, AC-10-09 — Screen 08's results are used ONLY when they match
 * the current solve. A ranking computed against a different baseline is not a
 * stale opinion about this design; it is an opinion about a different one.
 */
export function bottleneckAvailabilityOf(
  analysis: BottleneckAnalysis | null,
  solution: ThermalSolution,
): BottleneckAvailability {
  if (!analysis) return 'not_run';
  if (analysis.state === 'FAILED') return 'failed';
  if (analysis.scenario_id !== solution.scenario_id) return 'stale';
  if (analysis.baseline_signature !== solution.metadata.input_signature) return 'stale';
  if (analysis.results.length === 0) return 'not_run';
  return 'current';
}

function summariseBottlenecks(analysis: BottleneckAnalysis): BottleneckSummary[] {
  return analysis.results.slice(0, TOP_BOTTLENECK_COUNT).map((result) => ({
    rank: result.rank,
    edge_id: result.edge_id,
    edge_label: result.edge_label,
    score: result.score,
    classification: result.classification,
    // 08 records the improvement it measured; a failed sensitivity run leaves
    // it unmeasured, and that stays null rather than becoming 0 °C of benefit.
    sensitivity_improvement_C:
      result.sensitivity.solve_status === 'FAILED' ||
      !Number.isFinite(result.sensitivity.target_improvement_C)
        ? null
        : result.sensitivity.target_improvement_C,
    affected_components: result.sensitivity.affected_component_count,
    confidence: result.confidence,
    reduction_pct: result.sensitivity.reduction_pct,
  }));
}

function summariseDistribution(rows: TemperatureRow[]): TemperatureSummary {
  const statistics = computeStatistics(rows.map((row) => row.temperature_C));
  return {
    average_C: statistics.mean_C,
    p95_C: statistics.p95_C,
    min_C: statistics.min_C,
    max_C: statistics.max_C,
    nodes_above_warning: rows.filter((row) => row.temperature_C > WARNING_TEMPERATURE_C).length,
    warning_threshold_C: WARNING_TEMPERATURE_C,
    row_count: rows.length,
    // 10 §10 reads Screen 09's dataset. Screen 09's DEFAULT VIEW is narrower
    // (components with limits); the overview is a whole-system statement, so it
    // uses every solved node and says so rather than letting the row count be
    // read against the wrong basis.
    scope_label: 'All Solved Nodes / 所有已求解節點',
  };
}

function summariseCompleteness(
  network: ThermalNetwork,
  solution: ThermalSolution,
  components: Component[],
  rows: TemperatureRow[],
  path: CriticalPath,
): DataCompletenessSummary {
  const enabled = components.filter((component) => component.enabled);

  // A component counts as having a limit when its RECORD carries one (Screen 04)
  // or when one of its solved nodes does (Screen 05). Both are real limits and
  // both are what the pass/fail judgement is actually made against — counting
  // only the record would report a component as uncovered while its margin is
  // sitting in the Critical Components table two panels away.
  const limitedByNode = new Set(
    rows
      .filter((row) => row.limit_C != null && row.component_id)
      .map((row) => row.component_id as string),
  );

  const withLimits = enabled.filter(
    (component) =>
      component.thermal_spec?.limit_C?.value != null || limitedByNode.has(component.id),
  ).length;

  const counts = Object.fromEntries(
    RTH_SOURCE_BUCKETS.map((bucket) => [bucket, 0]),
  ) as Record<RthSourceBucket, number>;

  for (const edge of Object.values(network.edges)) {
    if (!edge.enabled) continue;
    const result = solution.edge_results[edge.id];
    counts[rthBucketOf(result?.active_rth_source ?? edge.rth.active_source)] += 1;
  }

  return {
    components_with_limits: withLimits,
    components_without_limits: enabled.length - withLimits,
    rth_source_counts: counts,
    low_confidence_critical_edges: countLowConfidenceCriticalEdges(network, solution, path),
    // 10 §12, AC-10-16 — Screen 03 has no parser, so there is nothing validated
    // and nothing to claim. `Deferred` is the honest word; `0 validated` would
    // imply a check that was run and came back empty.
    external_cfd_validation: 'Deferred',
    data_confidence: counts.FloTHERM > 0 || counts.Measurement > 0 ? 'Calibrated' : 'Analytical-only',
  };
}

/** FNV-1a over the values a snapshot froze — 10 §19. */
function signatureOf(parts: unknown[]): string {
  const text = JSON.stringify(parts);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildResultsOverview(input: OverviewInput): OverviewResult {
  const settings = input.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const generatedAt = input.now ?? new Date().toISOString();

  // --- the Screen 09 dataset, read not recomputed (10 §10) ------------------
  const rows = buildTemperatureDataset({
    network: input.network,
    solution: input.solution,
    components: input.components,
  });

  // --- Screen 08 (10 §9) ----------------------------------------------------
  const availability = bottleneckAvailabilityOf(input.analysis, input.solution);
  const bottlenecks =
    availability === 'current' && input.analysis ? summariseBottlenecks(input.analysis) : [];

  // --- the highlighted path (10 §13) ---------------------------------------
  const top = bottlenecks[0];
  const criticalPath = top
    ? tracePathThroughEdge(input.network, input.solution, top.edge_id, top.edge_label)
    : traceHottestPath(input.network, input.solution);

  // --- blocks ---------------------------------------------------------------
  const criticalComponents = buildCriticalComponents(rows);
  const distribution = rows.length > 0 ? summariseDistribution(rows) : null;
  const completeness = summariseCompleteness(
    input.network,
    input.solution,
    input.components,
    rows,
    criticalPath,
  );

  const energy = input.solution.energy_balance;
  const solverQuality: SolverQualitySummary = {
    status: input.solution.status,
    solved_nodes: input.solution.metadata.solved_nodes,
    solved_edges: input.solution.metadata.solved_edges,
    generated_W: energy.generated_W,
    rejected_W: energy.rejected_W,
    residual_W: energy.residual_W,
    energy_error_pct: energy.error_pct,
    // AC-10-13 — Screen 07's own grading function, not a second set of numbers
    // that could drift away from it.
    quality: energyGrade(energy.error_pct, settings),
    solved_at: input.solution.solved_at,
  };

  // --- KPIs (10 §6) ---------------------------------------------------------
  const hottest = rows.reduce<TemperatureRow | null>(
    (best, row) => (best == null || row.temperature_C > best.temperature_C ? row : best),
    null,
  );
  const worst = worstMargin(criticalComponents);

  const kpis: ResultsOverviewKpis = {
    max_temperature_C: hottest?.temperature_C ?? null,
    max_temperature_node: hottest ? (hottest.component_name ?? hottest.node_name) : null,
    worst_margin_C: worst?.margin_C ?? null,
    worst_margin_node: worst ? worst.component_name : null,
    // 10 §6 — from Screen 08 or `Not Available`. Never the largest Rth as a
    // stand-in: that is precisely the mistake Screen 08 exists to prevent.
    top_bottleneck: top?.edge_label ?? null,
    energy_error_pct: energy.error_pct,
    total_power_W: energy.generated_W,
  };

  // --- status, readiness and words (10 §4, §14, §15, §16, §17) -------------
  const monitored = rows.filter((row) => row.margin_C != null).length;

  const status = evaluateOverallStatus({
    solution_stale: input.solution_stale,
    solver_status: input.solution.status,
    energy_grade: solverQuality.quality,
    component_statuses: criticalComponents.map((row) => row.status),
    solver_warning_count: input.solution.warnings.filter((issue) => issue.severity === 'warning')
      .length,
    components_without_limits: completeness.components_without_limits,
    monitored_node_count: monitored,
    bottleneck_available: availability === 'current',
    distribution_available: distribution != null,
    low_confidence_critical_edges: completeness.low_confidence_critical_edges,
  });

  const readiness = buildReadiness({
    solution_stale: input.solution_stale,
    solver: solverQuality,
    bottleneck_availability: availability,
    distribution_available: distribution != null,
    completeness,
    monitored_node_count: monitored,
  });
  const report = evaluateReportReadiness(readiness);

  const actionInput = {
    overall_status: status.status,
    solution_stale: input.solution_stale,
    critical_components: criticalComponents,
    bottlenecks,
    bottleneck_availability: availability,
    solver: solverQuality,
    completeness,
    distribution_available: distribution != null,
  };
  const actions = buildActionSummary(actionInput);
  const recommended = recommendNextAction(actionInput);

  const overview: ResultsOverview = {
    project_id: input.project_id,
    scenario_id: input.scenario.id,
    scenario_name: input.scenario.name,
    generated_at: generatedAt,

    overall_status: status.status,
    status_reasons: status.reasons,
    // 10 §20, AC-10-31 — V1 is analytical. Hybrid and FloTHERM-Calibrated are
    // not offered as current while no such dataset exists.
    result_mode: CURRENT_RESULT_MODE,

    kpis,
    critical_components: criticalComponents,
    bottlenecks,
    bottleneck_availability: availability,
    distribution,
    solver_quality: solverQuality,
    completeness,

    action_summary: actions.lines,
    action_summary_zh: actions.lines_zh,
    recommended,
    readiness,
    report_readiness: report.readiness,
    report_readiness_reasons: report.reasons,
    report_readiness_reasons_zh: report.reasons_zh,

    // 10 §19 — the identity of the RESULT, so a snapshot can tell whether the
    // world moved underneath it. The generation timestamp is excluded on
    // purpose: re-opening the screen must not invalidate a good snapshot.
    source_signature: signatureOf([
      input.solution.metadata.input_signature,
      input.solution.solved_at,
      input.scenario.id,
      availability,
      input.analysis?.analyzed_at ?? null,
      rows.map((row) => [row.node_id, row.temperature_C, row.limit_C ?? null]),
      // Staleness belongs in the signature. A boundary or power change leaves
      // the STORED solution byte-identical — its own input signature is a
      // fingerprint of the inputs as they were at solve time — so without this
      // a snapshot of a now-superseded result would still read as current,
      // which is exactly what 10 §19 forbids.
      input.solution_stale,
    ]),
  };

  return { overview, rows, critical_path: criticalPath };
}

export { CRITICAL_COMPONENT_TOP_N };
