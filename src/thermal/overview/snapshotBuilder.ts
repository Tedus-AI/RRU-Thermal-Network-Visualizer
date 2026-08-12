/**
 * Report snapshot — 10 §18, §19.
 *
 * `Prepare Report Snapshot` freezes the CURRENT summary so Screen 11 has a
 * stable thing to lay out. 10 §18 is explicit about what it is not: it does not
 * generate a PDF, choose a page layout, or pick an export format. Those belong
 * to Screens 11 and 12.
 *
 * The freeze matters because of §19: any change to the solution, the scenario,
 * the Screen 08 analysis, the Screen 09 dataset or a component limit must make
 * the prior snapshot STALE. Comparing the frozen signature to the live one is
 * how Screen 11 finds out — a snapshot that silently re-read live data would
 * make that question unanswerable.
 */

import {
  OVERVIEW_SCHEMA_VERSION,
  type ResultsOverview,
  type ResultsOverviewSnapshot,
} from './overviewTypes';

export function buildSnapshot(
  overview: ResultsOverview,
  options: { created_by?: string; now?: string; id?: string } = {},
): ResultsOverviewSnapshot {
  const createdAt = options.now ?? new Date().toISOString();

  return {
    schema_version: OVERVIEW_SCHEMA_VERSION,
    id: options.id ?? `SNAP_${overview.scenario_id}_${createdAt}`,
    project_id: overview.project_id,
    scenario_id: overview.scenario_id,
    scenario_name: overview.scenario_name,
    created_at: createdAt,
    created_by: options.created_by ?? 'Thermal Engineer',

    overall_status: overview.overall_status,
    result_mode: overview.result_mode,
    kpis: overview.kpis,
    critical_components: overview.critical_components,
    bottlenecks: overview.bottlenecks,
    bottleneck_availability: overview.bottleneck_availability,
    distribution: overview.distribution,
    solver_quality: overview.solver_quality,
    completeness: overview.completeness,
    action_summary: overview.action_summary,
    readiness: overview.readiness,
    report_readiness: overview.report_readiness,

    source_signature: overview.source_signature,
    produces_document: false,
  };
}

/** 10 §19 — a snapshot is current only while the result it froze is unchanged. */
export function isSnapshotCurrent(
  snapshot: ResultsOverviewSnapshot | null,
  overview: ResultsOverview | null,
): boolean {
  if (!snapshot || !overview) return false;
  if (snapshot.scenario_id !== overview.scenario_id) return false;
  return snapshot.source_signature === overview.source_signature;
}
