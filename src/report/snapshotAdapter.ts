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

  // Nothing can be missing any more. Every remaining section draws from the
  // snapshot's own status, KPIs and critical components, or from the live
  // network; the two sections that could be empty — Bottleneck Analysis and
  // Temperature Distribution — are gone with the screens behind them.
  const unavailable: SectionId[] = [];

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

/**
 * Put the Chinese action lines back on a snapshot frozen before it carried any.
 *
 * The report reads the frozen snapshot and nothing else (§12, §37), and that
 * rule is kept here: the SENTENCES still come from the snapshot. Only their
 * translation is taken from the live overview, and only when the two English
 * arrays are character-for-character identical — which is proof that the live
 * Chinese lines are the translations of exactly these sentences and not of some
 * later result. Anything else is left alone and the report prints English.
 *
 * Without this, a snapshot frozen before the field existed shows an English-only
 * Engineering Actions for ever, and the only way to get the Chinese is to know
 * that Prepare Report Snapshot has to be pressed again — which nothing says.
 */
export function withTranslatedActions(
  snapshot: ResultsOverviewSnapshot,
  live: ResultsOverview | null,
): ResultsOverviewSnapshot {
  if (snapshot.action_summary_zh && snapshot.action_summary_zh.length > 0) return snapshot;
  if (!live) return snapshot;

  const frozen = snapshot.action_summary;
  const current = live.action_summary;
  if (current.length !== frozen.length) return snapshot;
  if (!frozen.every((line, index) => line === current[index])) return snapshot;

  return { ...snapshot, action_summary_zh: live.action_summary_zh };
}

/** 11 §3 — a stale or missing snapshot may still preview, but never export. */
export function blocksExport(state: SnapshotState): boolean {
  return state === 'STALE' || state === 'MISSING';
}

/** 11 §3, §45 — a missing snapshot has nothing to preview at all. */
export function blocksPreview(state: SnapshotState): boolean {
  return state === 'MISSING';
}
