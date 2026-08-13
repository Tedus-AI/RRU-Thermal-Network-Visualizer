/**
 * Thermal Network JSON — 12 §11, §45, AC-12-13.
 *
 * Two promises this module keeps:
 *
 *  1. §11 "Preserve unknown metadata fields." The graph is copied whole rather
 *     than rebuilt field by field, so a `metadata` key this build has never
 *     heard of survives a round trip through an export. Re-listing the fields we
 *     know about would silently drop everything else.
 *
 *  2. §45 A configuration may be exported while its solved result is stale — but
 *     it must SAY so. `solution_status` carries `SOLVED` / `STALE` / `NONE`, and
 *     stale temperatures are not shipped as if they were current.
 */

import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { SourceRevision } from '@/domain/revision';

import { EXPORT_SCHEMA_VERSION } from './exportTypes';

export type SolutionStatus = 'SOLVED' | 'STALE' | 'NONE';

export interface NetworkJsonInput {
  project_id: string;
  project_name: string;
  scenario_id: string;
  scenario_name: string;
  network: ThermalNetwork;
  solution: ThermalSolution | null;
  solution_status: SolutionStatus;
  exported_at: string;
  export_session_id: string;
}

export interface NetworkJsonDocument {
  export_schema_version: string;
  exported_at: string;
  export_session_id: string;
  project: { id: string; name: string };
  scenario: { id: string; name: string };
  /**
   * 12 §45 — a reader must be able to tell a configuration from a result. When
   * this is `STALE` or `NONE` the graph is a configuration only.
   */
  solution_status: SolutionStatus;
  solution?: {
    solved_at: string;
    solver_version: string;
    solver_engine: string;
    status: ThermalSolution['status'];
    input_signature: string;
    source_revision?: SourceRevision;
    energy_balance: ThermalSolution['energy_balance'];
    node_temperatures_C: Record<string, number>;
  };
  /** The canonical graph, copied verbatim (12 §11). */
  network: ThermalNetwork;
  /** 12 §37 — stated, never fabricated. */
  external_cfd_validation: 'Deferred';
}

export function exportNetworkJson(input: NetworkJsonInput): NetworkJsonDocument {
  // structuredClone keeps every field, including ones this build does not model.
  const network =
    typeof structuredClone === 'function'
      ? structuredClone(input.network)
      : (JSON.parse(JSON.stringify(input.network)) as ThermalNetwork);

  const document: NetworkJsonDocument = {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: input.exported_at,
    export_session_id: input.export_session_id,
    project: { id: input.project_id, name: input.project_name },
    scenario: { id: input.scenario_id, name: input.scenario_name },
    solution_status: input.solution_status,
    network,
    external_cfd_validation: 'Deferred',
  };

  // Solved results ride along only while they are current. A stale solve is
  // announced through `solution_status` instead of being exported as numbers a
  // reader would take for the present state.
  if (input.solution && input.solution_status === 'SOLVED') {
    document.solution = {
      solved_at: input.solution.solved_at,
      solver_version: input.solution.solver_version,
      solver_engine: input.solution.solver_engine,
      status: input.solution.status,
      input_signature: input.solution.metadata.input_signature,
      ...(input.solution.metadata.source_revision
        ? { source_revision: input.solution.metadata.source_revision }
        : {}),
      energy_balance: input.solution.energy_balance,
      node_temperatures_C: { ...input.solution.node_temperatures_C },
    };
  }

  return document;
}
