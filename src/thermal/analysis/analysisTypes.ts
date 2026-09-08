/**
 * Bottleneck analysis contracts — 08 §14, §23, §24.
 *
 * The rule the whole screen exists to enforce (08 §1, §33): a bottleneck is NOT
 * the largest Rth. A high resistance carrying almost no heat matters less than a
 * small one carrying the shared load, and changing any resistance redistributes
 * the heat flow through the rest of the graph. Ranking therefore comes from a
 * full-network re-solve, never from a local estimate.
 *
 * Naming note, as in 06 and 07: the specification sketches these in camelCase;
 * the codebase settled on snake_case in Screen 02. Field semantics are followed
 * exactly and the casing stays consistent with everything else persisted.
 */

import type { Confidence, DataSource, ThermalEdge } from '../types';
import type { SourceRevision } from '@/domain/revision';

export const ANALYSIS_SCHEMA_VERSION = '1.0';

/** 08 §4 — fixed V1 weights. Rth is context only, never a ranking weight. */
export const SCORE_WEIGHTS = { delta_t: 0.35, sensitivity: 0.45, margin_impact: 0.2 } as const;

/** 08 §12 — a component counts as affected at this much improvement. */
export const AFFECTED_THRESHOLD_C = 0.5;

/** 08 §10 — Rth reduction control. */
export const REDUCTION_LIMITS = { min: 5, max: 50, step: 5, default: 20 } as const;

// --- analysis state (08 §14) ------------------------------------------------

export const ANALYSIS_STATES = [
  'NOT_READY',
  'READY',
  'RUNNING',
  'COMPLETE',
  'WARNING',
  'FAILED',
  'DIRTY',
] as const;
export type AnalysisState = (typeof ANALYSIS_STATES)[number];

export const ANALYSIS_STATE_ZH: Record<AnalysisState, string> = {
  NOT_READY: '尚未就緒',
  READY: '就緒',
  RUNNING: '分析中',
  COMPLETE: '已完成',
  WARNING: '完成但有警告',
  FAILED: '分析失敗',
  DIRTY: '已失效',
};

// --- settings (08 §10, §11) -------------------------------------------------

/**
 * 08 §10 — the scopes an analysis can actually run.
 *
 * The specification also listed Selected Component, Selected Node Path and
 * Custom Selection. All three narrowed on a target the UI has no way to set:
 * `target_node_id` and `custom_edge_ids` were never written by any screen, so
 * on the real STARKCORE project each of them selected 0 candidates and put the
 * run straight into FAILED. A control whose every use is a failure is not a
 * control, so they are gone rather than left to be discovered.
 */
export const CANDIDATE_SCOPES = [
  'all_edges',
  'component_path',
  'shared_structure',
  'boundary_path',
] as const;
export type CandidateScope = (typeof CANDIDATE_SCOPES)[number];

export const CANDIDATE_SCOPE_LABELS: Record<CandidateScope, { label: string; zh: string }> = {
  all_edges: { label: 'All Edges', zh: '全部連線' },
  component_path: { label: 'Component Path', zh: '元件路徑' },
  shared_structure: { label: 'Shared Structure', zh: '共用結構' },
  boundary_path: { label: 'Boundary Path', zh: '邊界路徑' },
};

/**
 * 08 §10 — the metrics an improvement can be measured against.
 *
 * Margin first: this screen exists to find what is closest to its limit, and
 * the ranking a margin target produces is the one the reader came for.
 *
 * The specification also listed Selected Component Temperature and Selected
 * Node Temperature. Both read `target_node_id`, which nothing sets, so every
 * candidate's improvement came back 0.000 °C — and because sensitivity carries
 * 0.45 of the composite score, the screen then rendered a full, confident,
 * meaningless ranking. Silently wrong is worse than absent.
 */
export const TARGET_METRICS = ['worst_thermal_margin', 'worst_component_temperature'] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const TARGET_METRIC_LABELS: Record<TargetMetric, { label: string; zh: string }> = {
  worst_thermal_margin: { label: 'Worst Thermal Margin', zh: '最小熱餘裕' },
  worst_component_temperature: { label: 'Worst Component Temperature', zh: '最高元件溫度' },
};

/**
 * 08 §11 — every filter is "All" until the engineer narrows it.
 *
 * Shared-vs-Local and Boundary-vs-Internal used to live here too. Measured on
 * STARKCORE they were the Candidate Scope again, to the candidate: `shared`
 * selected the same 3 edges as the Shared Structure scope, `boundary` the same
 * 2 as Boundary Path, `internal` the same 83 as Component Path. Two controls
 * for one axis is how a panel gets to seven dropdowns.
 */
export interface CandidateFilters {
  edge_type: string;
  component: string;
  zone: string;
  rth_source: string;
  confidence: string;
}

export function emptyFilters(): CandidateFilters {
  return {
    edge_type: 'All',
    component: 'All',
    zone: 'All',
    rth_source: 'All',
    confidence: 'All',
  };
}

export interface AnalysisSettings {
  scope: CandidateScope;
  /** Percent, 5–50. */
  reduction_pct: number;
  target_metric: TargetMetric;
  filters: CandidateFilters;
}

export function defaultSettings(): AnalysisSettings {
  return {
    scope: 'all_edges',
    // 08 §1 — the screen ranks what is closest to its limit, so the metric it
    // opens on is the margin, not the temperature.
    target_metric: 'worst_thermal_margin',
    reduction_pct: REDUCTION_LIMITS.default,
    filters: emptyFilters(),
  };
}

/**
 * Settings read back from storage, coerced onto what this build supports.
 *
 * Analyses saved before the dead scopes and metrics were removed carry values
 * that are no longer offered — a project saved with Selected Node Temperature
 * is not hypothetical, it is the one on disk. Left alone, those values reach a
 * `<select>` that has no such option and the control renders blank while the
 * store still holds the old value. Anything unrecognised falls back to the
 * default, which is the setting the screen would have run anyway.
 */
export function supportedSettings(raw: Partial<AnalysisSettings> | null | undefined): AnalysisSettings {
  const base = defaultSettings();
  if (!raw) return base;

  const scope = CANDIDATE_SCOPES.includes(raw.scope as CandidateScope)
    ? (raw.scope as CandidateScope)
    : base.scope;
  const metric = TARGET_METRICS.includes(raw.target_metric as TargetMetric)
    ? (raw.target_metric as TargetMetric)
    : base.target_metric;
  const reduction =
    typeof raw.reduction_pct === 'number' && Number.isFinite(raw.reduction_pct)
      ? Math.min(REDUCTION_LIMITS.max, Math.max(REDUCTION_LIMITS.min, raw.reduction_pct))
      : base.reduction_pct;

  // Key by key, not a spread: a spread would carry `sharing` and `boundary`
  // forward out of every project saved before those filters were removed, and
  // write them back on the next save.
  const stored = (raw.filters ?? {}) as Partial<CandidateFilters>;
  const filters: CandidateFilters = {
    edge_type: stored.edge_type ?? base.filters.edge_type,
    component: stored.component ?? base.filters.component,
    zone: stored.zone ?? base.filters.zone,
    rth_source: stored.rth_source ?? base.filters.rth_source,
    confidence: stored.confidence ?? base.filters.confidence,
  };

  return { scope, target_metric: metric, reduction_pct: reduction, filters };
}

// --- candidates (08 §5) -----------------------------------------------------

export interface Candidate {
  edge: ThermalEdge;
  /** Active resistance under the scenario, °C/W. Always > 0 for a candidate. */
  R_C_per_W: number;
  heat_flow_W: number;
  delta_T_C: number;
  from_name: string;
  to_name: string;
  /** "PA1 Local", "Shared Structure", "Boundary" — the Path / Component column. */
  path_label: string;
  shared: boolean;
  boundary_derived: boolean;
  active_source: DataSource;
  confidence: Confidence;
}

/** Why an edge was left out, so the screen can say so rather than stay silent. */
export interface RejectedCandidate {
  edge_id: string;
  reason:
    | 'disabled'
    | 'ideal_link'
    | 'no_solved_flow'
    | 'no_resistance'
    | 'filtered_out'
    | 'out_of_scope';
}

// --- results (08 §24) -------------------------------------------------------

export type Classification = 'Critical' | 'High' | 'Medium' | 'Low';

export interface AffectedComponent {
  node_id: string;
  name: string;
  baseline_C: number;
  modified_C: number;
  improvement_C: number;
  limit_C: number | null;
  baseline_margin_C: number | null;
  modified_margin_C: number | null;
}

export interface SensitivityOutcome {
  reduction_pct: number;
  original_rth_C_per_W: number;
  modified_rth_C_per_W: number;
  baseline_target_C: number | null;
  modified_target_C: number | null;
  /** Improvement in the TARGET metric. Positive is better, whatever the metric. */
  target_improvement_C: number;
  baseline_worst_margin_C: number | null;
  modified_worst_margin_C: number | null;
  margin_improvement_C: number;
  affected_component_count: number;
  affected_components: AffectedComponent[];
  solve_status: 'SOLVED' | 'WARNING' | 'FAILED';
  energy_error_pct: number | null;
  message?: string;
}

export interface BottleneckResult {
  edge_id: string;
  rank: number;
  edge_label: string;
  path_label: string;
  edge_type: string;
  baseline: {
    rth_C_per_W: number;
    heat_flow_W: number;
    delta_T_C: number;
    T_from_C: number | null;
    T_to_C: number | null;
    rth_source: DataSource;
    confidence: Confidence;
  };
  sensitivity: SensitivityOutcome;
  normalized: { delta_t: number; sensitivity: number; margin_impact: number };
  /** 0–100. */
  score: number;
  classification: Classification;
  confidence: Confidence;
  /** 08 §18 — deterministic, rule-based. No language model involved. */
  recommendation: { title: string; zh: string; points: string[] };
}

export interface AnalysisIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  message_zh: string;
  edge_id?: string;
}

export interface BottleneckAnalysis {
  schema_version: string;
  id?: string;
  project_id: string;
  network_id: string;
  scenario_id: string;
  state: Extract<AnalysisState, 'COMPLETE' | 'WARNING' | 'FAILED'>;
  settings: AnalysisSettings;
  /** Fingerprint of the 07 solve this analysis was built on (08 §14, §21). */
  baseline_signature: string;
  source_revision?: SourceRevision;
  analyzed_at: string;
  elapsed_ms: number;

  results: BottleneckResult[];
  rejected: RejectedCandidate[];
  issues: AnalysisIssue[];

  summary: {
    top_bottleneck: string | null;
    top_score: number | null;
    /** Worst thermal margin of the BASELINE solve. */
    worst_margin_C: number | null;
    /** Best target improvement any single candidate achieved. */
    best_improvement_C: number | null;
    analyzed_edges: number;
    failed_candidates: number;
  };
}

// --- improvement proposal (08 §23) ------------------------------------------

/** One segment the reader chose to improve, and by how much. */
export interface StudySegment {
  edge_id: string;
  label: string;
  edge_type: string;
  /** Percent, 0.1 % resolution — the step the control offers. */
  reduction_pct: number;
  rth_before_C_per_W: number;
  rth_after_C_per_W: number;
  /** What this segment ALONE buys the target part, °C. */
  solo_gain_C: number;
}

/**
 * A saved what-if: one part, the segments the reader cut, and what it bought.
 *
 * This replaces the single-edge proposal the ranking screen saved. The unit a
 * thermal engineer actually works in is not "edge E_42 at 20 %" — it is "to get
 * the Power Module off its 3 °C margin I need this much out of these segments",
 * which is one record with several segments in it.
 *
 * A study is a RECORD OF AN ASSUMPTION. It never writes an Rth back into the
 * network — the real change goes through 04 / 05 / 06 (08 §23). Kept explicit
 * so no later screen mistakes it for an applied edit.
 */
export interface ImprovementStudy {
  id: string;
  schema_version: string;
  project_id: string;
  scenario_id: string;
  /** The limited node the study was aimed at. */
  target_node_id: string;
  target_node_name: string;
  limit_C: number;
  limit_type: string | null;
  baseline: { temperature_C: number; margin_C: number };
  projected: { temperature_C: number; margin_C: number };
  segments: StudySegment[];
  note?: string;
  created_at: string;
  /**
   * When it was last written over, if it has been.
   *
   * A record is now editable: opening a row on Screen 08 puts its cuts back on
   * the sliders, and Save writes over that same id. `created_at` therefore stays
   * the time the study was first made, and this is the time it last changed —
   * a table that ordered by `created_at` would otherwise stop reflecting work.
   */
  updated_at?: string;
  applied: false;
}

/** True for a record this build can render — an older single-edge proposal is not. */
export function isImprovementStudy(value: unknown): value is ImprovementStudy {
  const entry = value as Partial<ImprovementStudy> | null;
  return Boolean(
    entry &&
      typeof entry.id === 'string' &&
      typeof entry.target_node_id === 'string' &&
      Array.isArray(entry.segments),
  );
}

export function classify(score: number): Classification {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

export const CLASSIFICATION_TONE: Record<Classification, 'danger' | 'warn' | 'accent' | 'neutral'> = {
  Critical: 'danger',
  High: 'warn',
  Medium: 'accent',
  Low: 'neutral',
};

/** 08 §15 — overlay colours, matching the PNG's legend bands. */
export const CLASSIFICATION_COLOR: Record<Classification, string> = {
  Critical: '#dc2626',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#94a3b8',
};
