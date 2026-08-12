/**
 * Snapshot adapter — 11 §3, §12, §28, §37.
 *
 * The one place Screen 11 touches Screen 10's snapshot. It answers two
 * questions and nothing else:
 *
 *   1. is the snapshot CURRENT / WARNING / STALE / MISSING (§3);
 *   2. which report sections have data behind them, and which do not (§17, §18).
 *
 * It never recalculates anything (§37). Where the snapshot has no bottleneck
 * ranking or no distribution summary, the section is reported as unavailable so
 * the renderer can say `Not Available` rather than invent rows (§17, AC-11-20).
 */

import type {
  ResultsOverview,
  ResultsOverviewSnapshot,
} from '@/thermal/overview/overviewTypes';

import type { SectionId, SnapshotState, SnapshotSummary } from './reportTypes';

export interface SnapshotEvaluation extends SnapshotSummary {
  snapshot: ResultsOverviewSnapshot | null;
  /** Sections whose backing data is absent from the snapshot. */
  unavailable_sections: SectionId[];
}

/**
 * 11 §3 — STALE is decided by the same signature Screen 10 freezes, so the two
 * screens cannot disagree about whether the world moved. A snapshot that is
 * current but whose source Report Readiness was WARNING reports WARNING, which
 * is a statement about the analyses behind it, not about the freeze.
 */
export function evaluateSnapshot(
  snapshot: ResultsOverviewSnapshot | null,
  live: ResultsOverview | null,
  scenarioName: string,
): SnapshotEvaluation {
  if (!snapshot) {
    return {
      state: 'MISSING',
      snapshot: null,
      snapshot_id: null,
      created_at: null,
      scenario_name: scenarioName,
      result_mode: null,
      overall_status: null,
      source_readiness: null,
      unavailable_sections: [],
    };
  }

  const unavailable: SectionId[] = [];
  if (snapshot.bottleneck_availability !== 'current' || snapshot.bottlenecks.length === 0) {
    unavailable.push('bottleneck');
  }
  if (!snapshot.distribution) unavailable.push('distribution');

  let state: SnapshotState;
  if (!live) {
    // Nothing to compare against — the live overview cannot be built, which
    // means the result it froze is no longer reproducible.
    state = 'STALE';
  } else if (
    snapshot.scenario_id !== live.scenario_id ||
    snapshot.source_signature !== live.source_signature
  ) {
    state = 'STALE';
  } else if (snapshot.report_readiness === 'WARNING' || snapshot.report_readiness === 'BLOCKED') {
    state = 'WARNING';
  } else {
    state = 'CURRENT';
  }

  return {
    state,
    snapshot,
    snapshot_id: snapshot.id,
    created_at: snapshot.created_at,
    scenario_name: snapshot.scenario_name || scenarioName,
    result_mode: snapshot.result_mode,
    overall_status: snapshot.overall_status,
    source_readiness: snapshot.report_readiness,
    unavailable_sections: unavailable,
  };
}

/** 11 §3 — a stale or missing snapshot may still preview, but never export. */
export function blocksExport(state: SnapshotState): boolean {
  return state === 'STALE' || state === 'MISSING';
}

/** 11 §3, §45 — a missing snapshot has nothing to preview at all. */
export function blocksPreview(state: SnapshotState): boolean {
  return state === 'MISSING';
}
