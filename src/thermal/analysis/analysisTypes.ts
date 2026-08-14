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

export const CANDIDATE_SCOPES = [
  'all_edges',
  'component_path',
  'shared_structure',
  'boundary_path',
  'selected_component',
  'selected_node_path',
  'custom_selection',
] as const;
export type CandidateScope = (typeof CANDIDATE_SCOPES)[number];

export const CANDIDATE_SCOPE_LABELS: Record<CandidateScope, { label: string; zh: string }> = {
  all_edges: { label: 'All Edges', zh: '全部連線' },
  component_path: { label: 'Component Path', zh: '元件路徑' },
  shared_structure: { label: 'Shared Structure', zh: '共用結構' },
  boundary_path: { label: 'Boundary Path', zh: '邊界路徑' },
  selected_component: { label: 'Selected Component', zh: '所選元件' },
  selected_node_path: { label: 'Selected Node Path', zh: '所選節點路徑' },
  custom_selection: { label: 'Custom Selection', zh: '自訂選取' },
};

export const TARGET_METRICS = [
  'worst_component_temperature',
  'worst_thermal_margin',
  'selected_component_temperature',
  'selected_node_temperature',
] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const TARGET_METRIC_LABELS: Record<TargetMetric, { label: string; zh: string }> = {
  worst_component_temperature: { label: 'Worst Component Temperature', zh: '最高元件溫度' },
  worst_thermal_margin: { label: 'Worst Thermal Margin', zh: '最小熱餘裕' },
  selected_component_temperature: { label: 'Selected Component Temperature', zh: '所選元件溫度' },
  selected_node_temperature: { label: 'Selected Node Temperature', zh: '所選節點溫度' },
};

/** 08 §11 — every filter is "All" until the engineer narrows it. */
export interface CandidateFilters {
  edge_type: string;
  component: string;
  zone: string;
  rth_source: string;
  confidence: string;
  /** Shared structure vs a single component's local path. */
  sharing: 'all' | 'shared' | 'local';
  /** Boundary-derived vs internal conduction. */
  boundary: 'all' | 'boundary' | 'internal';
}

export function emptyFilters(): CandidateFilters {
  return {
    edge_type: 'All',
    component: 'All',
    zone: 'All',
    rth_source: 'All',
    confidence: 'All',
    sharing: 'all',
    boundary: 'all',
  };
}

export interface AnalysisSettings {
  scope: CandidateScope;
  /** Percent, 5–50. */
  reduction_pct: number;
  target_metric: TargetMetric;
  /** Node the "Selected …" scopes and metrics refer to. */
  target_node_id: string | null;
  custom_edge_ids: string[];
  filters: CandidateFilters;
}

export function defaultSettings(): AnalysisSettings {
  return {
    scope: 'all_edges',
    reduction_pct: REDUCTION_LIMITS.default,
    target_metric: 'worst_component_temperature',
    target_node_id: null,
    custom_edge_ids: [],
    filters: emptyFilters(),
  };
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

export interface BottleneckProposal {
  id: string;
  schema_version: string;
  project_id: string;
  scenario_id: string;
  edge_id: string;
  edge_label: string;
  reduction_pct: number;
  baseline: { rth_C_per_W: number; target_temperature_C: number | null; worst_margin_C: number | null };
  projected: { rth_C_per_W: number; target_temperature_C: number | null; worst_margin_C: number | null };
  score: number;
  classification: Classification;
  target_metric: TargetMetric;
  recommendation: string[];
  note?: string;
  created_at: string;
  /**
   * A proposal is a RECORD OF AN ASSUMPTION. It never writes an Rth back into
   * the network — the real engineering change goes through 04 / 05 / 06
   * (08 §23). Kept explicit so no later screen mistakes it for an applied edit.
   */
  applied: false;
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
