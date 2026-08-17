/**
 * Solver result contracts — 07 §52.
 *
 * Naming note (same decision as Screen 06): 07 §52 sketches the schema in
 * camelCase; the codebase settled on snake_case in Screen 02 and kept it
 * through 04, 05 and 06. The field semantics are followed exactly and the
 * casing stays consistent with everything else that is persisted.
 *
 * A solution is SCENARIO-SPECIFIC (07 §41) and belongs to the analytical slot
 * only. FloTHERM and measurement results keep their own slots and are never
 * written here (07 §29, §42).
 */

import type { DataSource, SolverSettings } from '../types';
import type { SourceRevision } from '@/domain/revision';

/** Bumped when the stored solution shape changes. */
export const SOLUTION_SCHEMA_VERSION = '1.0';

export const SOLVER_VERSION = 'v1.0';

/**
 * The engine is a DIRECT solve, not an iterative one: the conductance matrix is
 * assembled once and factored by Gaussian elimination with partial pivoting.
 * There is therefore no iteration count and no convergence history to report,
 * and none is invented for the UI.
 */
export const SOLVER_ENGINE = 'Direct nodal [G][T] = [P] · dense Gaussian elimination';

export type SolverIssueSeverity = 'error' | 'warning' | 'info';

/** Where the engineer has to go to fix an issue — 07 §37. */
export type SolverIssueFix = '04' | '05' | '06' | '07' | null;

export interface SolverIssue {
  id: string;
  severity: SolverIssueSeverity;
  /** Stable machine code, e.g. `no_heat_source`. */
  code: string;
  message: string;
  message_zh: string;
  /** 07 §36 grouping. */
  group: 'pre_solve' | 'matrix' | 'boundary' | 'energy_balance' | 'result_integrity';
  node_id?: string;
  edge_id?: string;
  boundary_port_id?: string;
  fix_in?: SolverIssueFix;
}

/** 07 §15 — a negative Q is a legal reverse direction, never an error. */
export type HeatFlowDirection = 'forward' | 'reverse' | 'zero';

export interface EdgeSolutionResult {
  edge_id: string;
  from: string;
  to: string;
  heat_flow_W: number;
  delta_T_C: number;
  actual_direction: HeatFlowDirection;
  active_rth_C_per_W: number;
  /** The slot the solver actually read — 07 §11, §24. */
  active_rth_source: DataSource;
  /**
   * `boundary_scenario` marks a resistance supplied by the current scenario's
   * Screen 06 boundary set rather than by the edge itself (07 §12), so the UI
   * can say where the number came from instead of mislabelling it.
   */
  rth_origin: 'edge' | 'boundary_scenario';
}

export type EnergyGrade = 'green' | 'warning' | 'error';

export interface SolutionEnergyBalance {
  generated_W: number;
  rejected_W: number;
  residual_W: number;
  error_pct: number;
  grade: EnergyGrade;
  /**
   * Generated heat split. Component dissipation is scaled by the scenario power
   * scale; solar is an external input and is NOT scaled with component power
   * (06 §9.5). Both are injected, so both belong in the balance.
   */
  component_W: number;
  solar_W: number;
}

export interface SolutionMetadata {
  /** Fingerprint of the solve inputs; a mismatch means the result is stale. */
  input_signature: string;
  /**
   * Authoritative source provenance. Optional only so pre-Phase-1 fixtures and
   * persisted solutions can hydrate safely; every newly solved result sets it.
   */
  source_revision?: SourceRevision;
  solved_nodes: number;
  solved_edges: number;
  fixed_nodes: number;
  max_node_residual_W: number;
  solve_time_ms: number;
  power_scale: number;
  ambient_C: number | null;
  matrix_size: number;
}

export interface ThermalSolution {
  schema_version: string;
  project_id: string;
  network_id: string;
  scenario_id: string;
  status: 'SOLVED' | 'WARNING' | 'FAILED';
  solver_version: string;
  solver_engine: string;
  solved_at: string;

  node_temperatures_C: Record<string, number>;
  edge_results: Record<string, EdgeSolutionResult>;
  energy_balance: SolutionEnergyBalance;

  /** Warnings AND errors carried with the result, so a FAILED solve explains itself. */
  warnings: SolverIssue[];
  metadata: SolutionMetadata;
}

/** 07 §18 — <0.5% green, 0.5–2% warning, >2% error. Thresholds are settings. */
export function energyGrade(errorPct: number, settings: SolverSettings): EnergyGrade {
  if (!Number.isFinite(errorPct)) return 'error';
  if (errorPct > settings.energy_error_pct) return 'error';
  if (errorPct > settings.energy_warn_pct) return 'warning';
  return 'green';
}

/** Heat flow smaller than this is reported as `zero` rather than a direction. */
export const ZERO_FLOW_W = 1e-9;

export function directionOf(heatFlowW: number): HeatFlowDirection {
  if (!Number.isFinite(heatFlowW) || Math.abs(heatFlowW) < ZERO_FLOW_W) return 'zero';
  return heatFlowW > 0 ? 'forward' : 'reverse';
}

export function issue(
  severity: SolverIssueSeverity,
  code: string,
  group: SolverIssue['group'],
  message: string,
  messageZh: string,
  extra: Partial<SolverIssue> = {},
): SolverIssue {
  return {
    id: `${code}:${extra.node_id ?? extra.edge_id ?? extra.boundary_port_id ?? 'global'}`,
    severity,
    code,
    group,
    message,
    message_zh: messageZh,
    ...extra,
  };
}
