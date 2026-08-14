/**
 * Export session — 12 §47, §48, AC-12-36.
 *
 * §47 asks for one thing: every artifact in a single export must come from the
 * same project revision, the same solve, the same analysis and the same report
 * snapshot. The way to guarantee that is not to promise carefulness — it is to
 * capture the source ids ONCE at the start and to pass that frozen record to
 * every generator. If the engineer switches scenario halfway through a long ZIP
 * build, the running export keeps writing the sources it started with, and the
 * manifest names them.
 */

import type { BottleneckAnalysis } from '@/thermal/analysis/analysisTypes';
import type { ReportExportPayload } from '@/report/reportTypes';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { TemperatureDistributionResult } from '@/thermal/analysis/distributionResult';

import type { ArtifactType, ExportArtifactRequest, ExportSession } from './exportTypes';

export interface SessionInput {
  project_id: string;
  project_revision?: string;
  /** @deprecated compatibility for pre-Phase-1 callers and stored tests. */
  project_updated_at?: string;
  scenario_id: string;
  solution: ThermalSolution | null;
  analysis: BottleneckAnalysis | null;
  distribution?: TemperatureDistributionResult | null;
  snapshot: ResultsOverviewSnapshot | null;
  payload: ReportExportPayload | null;
  requests: ExportArtifactRequest[];
  now: string;
}

export function createExportSession(input: SessionInput): ExportSession {
  return {
    id: `EXP_${input.scenario_id}_${input.now}`,
    started_at: input.now,

    project_id: input.project_id,
    scenario_id: input.scenario_id,

    project_revision: input.project_revision ?? input.project_updated_at,
    // The solve has no id of its own; its input signature IS its identity, and
    // it is what Screens 08 and 10 already compare against to detect staleness.
    solver_solution_id: input.solution?.metadata.input_signature,
    analysis_id: input.analysis?.id ??
      (input.analysis ? `${input.analysis.network_id}::${input.analysis.analyzed_at}` : undefined),
    distribution_id:
      'distribution' in input
        ? input.distribution?.id
        : input.solution?.metadata.input_signature,
    report_snapshot_id: input.snapshot?.id ?? input.payload?.snapshot_id,
    report_config_id: input.payload?.report_config_id,

    selected_artifacts: input.requests,
    status: 'READY',
  };
}

/** The artifact list of a session, in the catalog's order. */
export function sessionArtifactTypes(session: ExportSession): ArtifactType[] {
  return session.selected_artifacts.map((request) => request.type);
}
