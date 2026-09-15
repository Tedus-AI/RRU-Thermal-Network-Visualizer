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

import { buildActionSummary } from '@/thermal/overview/actionSummaryRules';

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
 * Give a snapshot frozen before the Chinese field existed both halves of its
 * Engineering Actions, rebuilt from its own frozen numbers.
 *
 * The report reads the frozen snapshot and nothing else (§12, §37), and that
 * rule is what makes this safe: `buildActionSummary` is a pure function of the
 * structured summaries the snapshot already carries — the critical components,
 * the bottleneck availability, the solver quality, the completeness counts —
 * so running it here reads no live result. It produces both languages from one
 * pass, which is the only way the two halves are guaranteed to be the same
 * sentence.
 *
 * This replaces borrowing the translation from the live overview. That only
 * worked while the two English arrays matched character for character, and the
 * rules have since changed: the energy-balance, limit-coverage,
 * low-confidence-edge and analytical-only sentences were cut so the one finding
 * that differs between projects is not pushed off the page. An old snapshot
 * still quotes all four, no live line matches them, and the section stayed
 * English for ever — printing, in the one language the reader did not ask for,
 * conclusions this tool no longer draws.
 *
 * A snapshot that already carries Chinese is returned untouched, so this only
 * ever reaches the snapshots that are broken.
 *
 * `solution_stale` is false by construction: Prepare Report Snapshot refuses a
 * stale solve, so a snapshot that exists was frozen from a current one.
 */
export function withTranslatedActions(snapshot: ResultsOverviewSnapshot): ResultsOverviewSnapshot {
  if (snapshot.action_summary_zh && snapshot.action_summary_zh.length > 0) return snapshot;

  const rebuilt = buildActionSummary({
    overall_status: snapshot.overall_status,
    solution_stale: false,
    critical_components: snapshot.critical_components,
    bottlenecks: snapshot.bottlenecks,
    bottleneck_availability: snapshot.bottleneck_availability,
    solver: snapshot.solver_quality,
    completeness: snapshot.completeness,
    distribution_available: snapshot.distribution != null,
  });

  if (rebuilt.lines.length === 0) return snapshot;
  return { ...snapshot, action_summary: rebuilt.lines, action_summary_zh: rebuilt.lines_zh };
}

/** 11 §3 — a stale or missing snapshot may still preview, but never export. */
export function blocksExport(state: SnapshotState): boolean {
  return state === 'STALE' || state === 'MISSING';
}

/** 11 §3, §45 — a missing snapshot has nothing to preview at all. */
export function blocksPreview(state: SnapshotState): boolean {
  return state === 'MISSING';
}
