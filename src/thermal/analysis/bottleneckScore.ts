/**
 * The analysis run — 08 §2, §4, §13, §21, §27.
 *
 * Selects candidates, re-solves the whole graph once per candidate, normalises
 * the three ranking inputs and produces the composite score:
 *
 *   Score = 100 × (0.35 · ΔT + 0.45 · Sensitivity + 0.20 · MarginImpact)
 *
 * Rth is deliberately absent from that formula. It is reported for engineering
 * context in every row, and 08 §1/§33 are explicit that the largest resistance
 * is not the bottleneck.
 *
 * On 08 §27's Web Worker suggestion: a candidate solve is a dense factorisation
 * of a matrix with as many rows as the network has solvable nodes — under a
 * millisecond at this size — so the run is driven as an async loop that yields
 * to the event loop between candidates. That is what makes "Analyzing 18 / 47"
 * and Cancel real, which is what the section is asking for; a worker would add
 * a serialisation boundary without changing the numbers.
 */

import type { SolverSettings, ThermalNetwork } from '../types';
import type { SolveInput } from '../solver/buildSolveInput';
import type { ThermalSolution } from '../solver/solverTypes';

import { selectCandidates } from './candidateSelector';
import { normalizeAgainstMax, normalizeMagnitude } from './normalization';
import { recommendFor } from './recommendationRules';
import {
  baselineMetricsOf,
  runCandidate,
  type SensitivityContext,
} from './sensitivityRunner';
import {
  ANALYSIS_SCHEMA_VERSION,
  SCORE_WEIGHTS,
  classify,
  type AnalysisIssue,
  type AnalysisSettings,
  type BottleneckAnalysis,
  type BottleneckResult,
} from './analysisTypes';

export interface AnalysisInput {
  project_id: string;
  network_id: string;
  scenario_id: string;
  /** The stored topology — read-only. */
  network: ThermalNetwork;
  /** Screen 07's solve-ready clone, with boundary Rth and scaled power applied. */
  baselineInput: SolveInput;
  baselineSolution: ThermalSolution;
  settings: AnalysisSettings;
  solverSettings: SolverSettings;
}

export interface RunOptions {
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
  /** Yield to the event loop every N candidates so the UI can paint. */
  yieldEvery?: number;
}

function issue(
  severity: AnalysisIssue['severity'],
  code: string,
  message: string,
  messageZh: string,
  edgeId?: string,
): AnalysisIssue {
  return { id: `${code}:${edgeId ?? 'global'}`, severity, code, message, message_zh: messageZh, edge_id: edgeId };
}

/** Thrown when the caller cancels mid-run. The baseline is untouched (08 §27). */
export class AnalysisCancelled extends Error {
  constructor() {
    super('Analysis cancelled');
    this.name = 'AnalysisCancelled';
  }
}

export async function runAnalysis(
  input: AnalysisInput,
  options: RunOptions = {},
): Promise<BottleneckAnalysis> {
  const started = performance.now();
  const yieldEvery = options.yieldEvery ?? 4;
  const issues: AnalysisIssue[] = [];

  const { candidates, rejected } = selectCandidates({
    network: input.network,
    solution: input.baselineSolution,
    scenarioId: input.scenario_id,
    scope: input.settings.scope,
    filters: input.settings.filters,
    targetNodeId: input.settings.target_node_id,
    customEdgeIds: input.settings.custom_edge_ids,
  });

  const baseline = baselineMetricsOf(
    input.network,
    input.baselineSolution.node_temperatures_C,
    input.baselineSolution.energy_balance.error_pct,
  );

  const context: SensitivityContext = {
    baselineInput: input.baselineInput,
    baseline,
    network: input.network,
    scenarioId: input.scenario_id,
    settings: input.solverSettings,
    target_metric: input.settings.target_metric,
    target_node_id: input.settings.target_node_id,
    reduction_pct: input.settings.reduction_pct,
  };

  if (candidates.length === 0) {
    issues.push(
      issue(
        'error',
        'no_candidates',
        'No eligible candidate edges under the current scope and filters.',
        '目前的範圍與篩選條件下沒有可分析的連線。',
      ),
    );
  }

  if (
    (input.settings.target_metric === 'selected_component_temperature' ||
      input.settings.target_metric === 'selected_node_temperature') &&
    !input.settings.target_node_id
  ) {
    issues.push(
      issue(
        'error',
        'no_target',
        'The selected target metric needs a node. Pick one on the graph or in the ranking table.',
        '此目標指標需要指定節點，請於圖面或排名表中選取。',
      ),
    );
  }

  // --- one full re-solve per candidate ------------------------------------
  const outcomes: Array<{ candidate: (typeof candidates)[number]; outcome: ReturnType<typeof runCandidate> }> = [];

  for (let index = 0; index < candidates.length; index++) {
    if (options.shouldCancel?.()) throw new AnalysisCancelled();

    const candidate = candidates[index];
    const outcome = runCandidate(candidate, context);
    outcomes.push({ candidate, outcome });

    if (outcome.solve_status === 'FAILED') {
      // 08 §21 — an individual failure is isolated; the batch continues.
      issues.push(
        issue(
          'warning',
          'candidate_solve_failed',
          `Sensitivity solve failed for ${candidate.from_name} → ${candidate.to_name}: ${outcome.message ?? 'unknown reason'}`,
          `${candidate.from_name} → ${candidate.to_name} 的敏感度求解失敗。`,
          candidate.edge.id,
        ),
      );
    }

    if (candidate.confidence === 'low') {
      issues.push(
        issue(
          'warning',
          'low_confidence_candidate',
          `${candidate.from_name} → ${candidate.to_name} uses a low-confidence resistance; it can still be ranked, but confirm the value.`,
          `${candidate.from_name} → ${candidate.to_name} 使用低信心度熱阻，仍可排名但請確認數值。`,
          candidate.edge.id,
        ),
      );
    }

    if (candidate.active_source === 'Manual' && !candidate.edge.rth.provenance.Manual?.reference) {
      issues.push(
        issue(
          'warning',
          'manual_without_reference',
          `${candidate.from_name} → ${candidate.to_name} uses a manual resistance with no stated reference.`,
          `${candidate.from_name} → ${candidate.to_name} 使用手動熱阻但沒有註明依據。`,
          candidate.edge.id,
        ),
      );
    }

    if (Math.abs(outcome.target_improvement_C) < 1e-3 && outcome.solve_status !== 'FAILED') {
      issues.push(
        issue(
          'info',
          'near_zero_sensitivity',
          `Reducing ${candidate.from_name} → ${candidate.to_name} by ${input.settings.reduction_pct} % changes the target by less than 0.001 °C.`,
          `降低 ${candidate.from_name} → ${candidate.to_name} 對目標的影響小於 0.001 °C。`,
          candidate.edge.id,
        ),
      );
    }

    options.onProgress?.(index + 1, candidates.length);
    if ((index + 1) % yieldEvery === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // --- normalise and score --------------------------------------------------
  const deltaNorm = normalizeMagnitude(outcomes.map((entry) => entry.candidate.delta_T_C));
  const sensitivityNorm = normalizeAgainstMax(
    outcomes.map((entry) => entry.outcome.target_improvement_C),
  );
  const marginNorm = normalizeAgainstMax(
    outcomes.map((entry) => entry.outcome.margin_improvement_C),
  );

  const results: BottleneckResult[] = outcomes.map((entry, index) => {
    const normalized = {
      delta_t: deltaNorm[index],
      sensitivity: sensitivityNorm[index],
      margin_impact: marginNorm[index],
    };

    // A failed candidate scores 0 rather than an invented number (08 §21).
    const score =
      entry.outcome.solve_status === 'FAILED'
        ? 0
        : Math.round(
            100 *
              (SCORE_WEIGHTS.delta_t * normalized.delta_t +
                SCORE_WEIGHTS.sensitivity * normalized.sensitivity +
                SCORE_WEIGHTS.margin_impact * normalized.margin_impact),
          );

    const solutionEdge = input.baselineSolution.edge_results[entry.candidate.edge.id];

    return {
      edge_id: entry.candidate.edge.id,
      rank: 0,
      edge_label: `${entry.candidate.from_name} → ${entry.candidate.to_name}`,
      path_label: entry.candidate.path_label,
      edge_type: entry.candidate.edge.type,
      baseline: {
        rth_C_per_W: entry.candidate.R_C_per_W,
        heat_flow_W: entry.candidate.heat_flow_W,
        delta_T_C: entry.candidate.delta_T_C,
        T_from_C: input.baselineSolution.node_temperatures_C[entry.candidate.edge.from] ?? null,
        T_to_C: input.baselineSolution.node_temperatures_C[entry.candidate.edge.to] ?? null,
        rth_source: solutionEdge?.active_rth_source ?? entry.candidate.active_source,
        confidence: entry.candidate.confidence,
      },
      sensitivity: entry.outcome,
      normalized,
      score,
      classification: classify(score),
      confidence: combineConfidence(entry.candidate.confidence, entry.outcome, baseline.energy_error_pct),
      recommendation: recommendFor(entry.candidate, entry.outcome),
    };
  });

  results.sort((a, b) => b.score - a.score || b.baseline.delta_T_C - a.baseline.delta_T_C);
  results.forEach((result, index) => {
    result.rank = index + 1;
  });

  const failedCount = results.filter((result) => result.sensitivity.solve_status === 'FAILED').length;
  const best = results.reduce(
    (value, result) => Math.max(value, result.sensitivity.target_improvement_C),
    Number.NEGATIVE_INFINITY,
  );

  const state: BottleneckAnalysis['state'] =
    issues.some((entry) => entry.severity === 'error')
      ? 'FAILED'
      : issues.some((entry) => entry.severity === 'warning')
        ? 'WARNING'
        : 'COMPLETE';

  return {
    schema_version: ANALYSIS_SCHEMA_VERSION,
    project_id: input.project_id,
    network_id: input.network_id,
    scenario_id: input.scenario_id,
    state,
    settings: input.settings,
    baseline_signature: input.baselineSolution.metadata.input_signature,
    analyzed_at: new Date().toISOString(),
    elapsed_ms: performance.now() - started,
    results,
    rejected,
    issues,
    summary: {
      top_bottleneck: results[0]?.edge_label ?? null,
      top_score: results[0]?.score ?? null,
      worst_margin_C: baseline.worst_margin_C,
      best_improvement_C: Number.isFinite(best) ? best : null,
      analyzed_edges: results.length,
      failed_candidates: failedCount,
    },
  };
}

/**
 * 08 §19 — one confidence from the Rth source, the sensitivity solve quality and
 * the baseline's energy balance. The worst input wins; a good solve cannot
 * upgrade a guessed resistance.
 */
function combineConfidence(
  sourceConfidence: BottleneckResult['confidence'],
  outcome: { solve_status: string; energy_error_pct: number | null },
  baselineEnergyErrorPct: number,
): BottleneckResult['confidence'] {
  if (outcome.solve_status === 'FAILED') return 'low';
  if (sourceConfidence === 'low') return 'low';
  if (outcome.solve_status === 'WARNING' || baselineEnergyErrorPct > 0.5) return 'low';
  return sourceConfidence;
}
