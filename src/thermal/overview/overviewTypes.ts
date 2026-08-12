/**
 * Results Overview contracts — 10 §4, §11, §12, §15, §16, §17, §18, §20.
 *
 * Screen 10 is a SUMMARY, not an engine (10 §36). Nothing here solves, scores a
 * bottleneck, or bins a temperature: every value is read from what Screens 07,
 * 08 and 09 already computed, and anything those screens did not compute stays
 * explicitly absent rather than being invented (10 §3, §21, AC-10-19, AC-10-30).
 *
 * Naming note, as in 06–09: the specification sketches the snapshot in camelCase
 * and the codebase settled on snake_case in Screen 02. The field semantics are
 * followed exactly and the casing stays consistent with everything persisted.
 */

import type { Confidence, DataSource } from '../types';
import type { Classification } from '../analysis/analysisTypes';
import type { EnergyGrade } from '../solver/solverTypes';
import type { LimitType } from '../analysis/temperatureDataset';

export const OVERVIEW_SCHEMA_VERSION = '1.0';

// --- overall thermal status (10 §4) -----------------------------------------

export const OVERALL_STATUSES = ['PASS', 'WARNING', 'FAIL', 'STALE', 'INCOMPLETE'] as const;
export type OverallThermalStatus = (typeof OVERALL_STATUSES)[number];

/**
 * 10 §4 — STALE > FAIL > INCOMPLETE > WARNING > PASS.
 *
 * The order matters more than it looks: a stale result outranks a failure
 * because a failure computed from inputs that have since changed is not a
 * finding, it is an artefact. Saying FAIL there would be a claim about the
 * current design that nothing has actually evaluated.
 */
export const OVERALL_STATUS_PRIORITY: Record<OverallThermalStatus, number> = {
  STALE: 5,
  FAIL: 4,
  INCOMPLETE: 3,
  WARNING: 2,
  PASS: 1,
};

export const OVERALL_STATUS_LABELS: Record<OverallThermalStatus, { zh: string; note: string }> = {
  PASS: { zh: '通過', note: 'All monitored margins are clear of the near-limit threshold.' },
  WARNING: { zh: '警告', note: 'At least one result needs engineering review.' },
  FAIL: { zh: '不通過', note: 'At least one monitored node is over its thermal limit.' },
  STALE: { zh: '已失效', note: 'The inputs changed after the last solve.' },
  INCOMPLETE: { zh: '資料不足', note: 'Missing limits or results prevent a full judgement.' },
};

export const OVERALL_STATUS_TONE: Record<
  OverallThermalStatus,
  'ok' | 'warn' | 'danger' | 'neutral'
> = {
  PASS: 'ok',
  WARNING: 'warn',
  FAIL: 'danger',
  STALE: 'neutral',
  INCOMPLETE: 'warn',
};

/** Why the status came out the way it did — shown, never guessed at by the reader. */
export interface StatusReason {
  code: string;
  text: string;
  zh: string;
}

// --- result mode (10 §20) ---------------------------------------------------

export const RESULT_MODES = [
  'Analytical',
  'Hybrid',
  'FloTHERM-Calibrated',
  'Measurement-Validated',
] as const;
export type ResultMode = (typeof RESULT_MODES)[number];

/**
 * 10 §20 — V1 solves analytically and says so. Hybrid and FloTHERM-Calibrated
 * are never shown as current while Screen 03 is deferred, and the ABSENCE of
 * FloTHERM data is not a failure (AC-10-31): it is a statement about coverage.
 */
export const CURRENT_RESULT_MODE: ResultMode = 'Analytical';

// --- critical components (10 §8) --------------------------------------------

export type ComponentThermalStatus = 'PASS' | 'NEAR LIMIT' | 'FAIL' | 'NO LIMIT';

export const COMPONENT_STATUS_TONE: Record<
  ComponentThermalStatus,
  'ok' | 'warn' | 'danger' | 'neutral'
> = {
  PASS: 'ok',
  'NEAR LIMIT': 'warn',
  FAIL: 'danger',
  'NO LIMIT': 'neutral',
};

export interface CriticalComponentSummary {
  component_id?: string;
  component_name: string;
  node_id: string;
  node_name: string;
  temperature_C: number;
  limit_type?: LimitType;
  limit_C?: number;
  /** Limit − Temperature. Undefined when there is no limit — never 0. */
  margin_C?: number;
  status: ComponentThermalStatus;
  /** How many monitored nodes this component has, so "worst node" is not silent. */
  monitored_node_count: number;
}

// --- bottlenecks (10 §9) ----------------------------------------------------

export interface BottleneckSummary {
  rank: number;
  edge_id: string;
  edge_label: string;
  score: number;
  classification: Classification;
  /** Target improvement Screen 08 measured. Null when it could not measure one. */
  sensitivity_improvement_C: number | null;
  affected_components: number;
  confidence: Confidence;
  /** The Rth reduction Screen 08 actually applied, so the number has a unit of meaning. */
  reduction_pct: number;
}

/** 10 §9, §21 — why the bottleneck block has nothing to show. */
export type BottleneckAvailability = 'current' | 'not_run' | 'stale' | 'failed';

// --- distribution (10 §10) --------------------------------------------------

export interface TemperatureSummary {
  average_C: number | null;
  p95_C: number | null;
  min_C: number | null;
  max_C: number | null;
  nodes_above_warning: number;
  warning_threshold_C: number;
  row_count: number;
  /** Which scope the rows came from, so the count is never ambiguous. */
  scope_label: string;
}

// --- solver / energy quality (10 §11) ---------------------------------------

export interface SolverQualitySummary {
  status: 'SOLVED' | 'WARNING' | 'FAILED';
  solved_nodes: number;
  solved_edges: number;
  generated_W: number;
  rejected_W: number;
  residual_W: number;
  energy_error_pct: number;
  /** 10 §11, AC-10-13 — the same thresholds Screen 07 uses, not a second set. */
  quality: EnergyGrade;
  solved_at: string;
}

// --- data completeness (10 §12) ---------------------------------------------

/**
 * 10 §12 names four Rth buckets. The codebase's `DataSource` enum is wider, so
 * everything outside the four is counted under `Other` rather than dropped —
 * an edge that vanishes from a completeness report is a fabrication by omission.
 */
export const RTH_SOURCE_BUCKETS = [
  'Analytical',
  'Manual',
  'Measurement',
  'FloTHERM',
  'Other',
] as const;
export type RthSourceBucket = (typeof RTH_SOURCE_BUCKETS)[number];

export function rthBucketOf(source: DataSource): RthSourceBucket {
  switch (source) {
    case 'Analytical':
      return 'Analytical';
    case 'Manual':
      return 'Manual';
    case 'Measurement':
      return 'Measurement';
    case 'FloTHERM':
      return 'FloTHERM';
    default:
      return 'Other';
  }
}

export interface DataCompletenessSummary {
  components_with_limits: number;
  components_without_limits: number;
  rth_source_counts: Record<RthSourceBucket, number>;
  low_confidence_critical_edges: number;
  /**
   * 10 §12, §20, AC-10-16 — `Deferred` while Screen 03 has no parser. It is not
   * `0 validated` dressed up as a result, and it is not a failure either.
   */
  external_cfd_validation: 'Deferred' | 'None' | 'Validated';
  /** 10 §20 — `Analytical-only` when no external dataset has calibrated the model. */
  data_confidence: 'Analytical-only' | 'Calibrated';
}

// --- readiness (10 §16, §17) ------------------------------------------------

export const READINESS_STATES = ['READY', 'WARNING', 'MISSING', 'STALE'] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

export const READINESS_ITEMS = [
  'current_solver_result',
  'energy_balance',
  'thermal_limits_coverage',
  'bottleneck_analysis',
  'temperature_distribution',
  'data_confidence',
] as const;
export type ReadinessItem = (typeof READINESS_ITEMS)[number];

export const READINESS_ITEM_LABELS: Record<ReadinessItem, { label: string; zh: string }> = {
  current_solver_result: { label: 'Current Solver Result', zh: '目前求解結果' },
  energy_balance: { label: 'Energy Balance', zh: '能量守恆' },
  thermal_limits_coverage: { label: 'Thermal Limits Coverage', zh: '熱限制涵蓋率' },
  bottleneck_analysis: { label: 'Bottleneck Analysis', zh: '瓶頸分析' },
  temperature_distribution: { label: 'Temperature Distribution', zh: '溫度分佈' },
  data_confidence: { label: 'Data Confidence', zh: '資料可信度' },
};

export interface ReadinessCheck {
  item: ReadinessItem;
  state: ReadinessState;
  detail: string;
  detail_zh: string;
}

export const REPORT_READINESS_STATES = ['READY', 'WARNING', 'BLOCKED'] as const;
export type ReportReadiness = (typeof REPORT_READINESS_STATES)[number];

export const REPORT_READINESS_TONE: Record<ReportReadiness, 'ok' | 'warn' | 'danger'> = {
  READY: 'ok',
  WARNING: 'warn',
  BLOCKED: 'danger',
};

// --- recommended next action (10 §15) ---------------------------------------

export const RECOMMENDED_ACTIONS = [
  'No Immediate Action',
  'Review Near-Limit Component',
  'Review Failed Component',
  'Review Bottleneck',
  'Re-Solve Network',
  'Complete Missing Limits',
  'Run Bottleneck Analysis',
  'Review Data Confidence',
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export interface RecommendedNextAction {
  action: RecommendedAction;
  zh: string;
  reason: string;
  reason_zh: string;
  /** Screen code the engineer should open, e.g. `07`. Null when nothing to open. */
  goto: string | null;
}

// --- the aggregate (10 §5) --------------------------------------------------

export interface ResultsOverviewKpis {
  max_temperature_C: number | null;
  max_temperature_node: string | null;
  worst_margin_C: number | null;
  worst_margin_node: string | null;
  top_bottleneck: string | null;
  energy_error_pct: number | null;
  total_power_W: number | null;
}

export interface ResultsOverview {
  project_id: string;
  scenario_id: string;
  scenario_name: string;
  generated_at: string;

  overall_status: OverallThermalStatus;
  status_reasons: StatusReason[];
  result_mode: ResultMode;

  kpis: ResultsOverviewKpis;
  critical_components: CriticalComponentSummary[];
  bottlenecks: BottleneckSummary[];
  bottleneck_availability: BottleneckAvailability;
  distribution: TemperatureSummary | null;
  solver_quality: SolverQualitySummary;
  completeness: DataCompletenessSummary;

  action_summary: string[];
  action_summary_zh: string[];
  recommended: RecommendedNextAction;
  readiness: ReadinessCheck[];
  report_readiness: ReportReadiness;
  report_readiness_reasons: string[];
  report_readiness_reasons_zh: string[];

  /** Fingerprint of everything above; a mismatch marks a snapshot stale (10 §19). */
  source_signature: string;
}

// --- report snapshot (10 §18, §19) ------------------------------------------

export interface ResultsOverviewSnapshot {
  schema_version: string;
  id: string;
  project_id: string;
  scenario_id: string;
  scenario_name: string;
  created_at: string;
  created_by: string;

  overall_status: OverallThermalStatus;
  result_mode: ResultMode;
  kpis: ResultsOverviewKpis;
  critical_components: CriticalComponentSummary[];
  bottlenecks: BottleneckSummary[];
  bottleneck_availability: BottleneckAvailability;
  distribution: TemperatureSummary | null;
  solver_quality: SolverQualitySummary;
  completeness: DataCompletenessSummary;
  action_summary: string[];
  readiness: ReadinessCheck[];
  report_readiness: ReportReadiness;

  /**
   * The signature of the overview this snapshot froze. Screen 11 compares it to
   * the live overview: equal means current, different means STALE (10 §19).
   * A snapshot never silently re-reads the live data — that is the whole point
   * of freezing one.
   */
  source_signature: string;
  /** 10 §18 — a snapshot is metadata for Screen 11. It is not a document. */
  produces_document: false;
}
