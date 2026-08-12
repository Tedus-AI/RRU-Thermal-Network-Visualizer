/**
 * Overall Thermal Status — 10 §4.
 *
 * Five states with a strict priority: STALE > FAIL > INCOMPLETE > WARNING > PASS
 * (AC-10-02, AC-10-03). Each candidate state is raised with a reason, and the
 * highest-priority one wins — so the badge can always say WHY, and a PASS is
 * only ever a PASS because nothing else fired.
 */

import type {
  ComponentThermalStatus,
  OverallThermalStatus,
  StatusReason,
} from './overviewTypes';
import { OVERALL_STATUS_PRIORITY } from './overviewTypes';
import { NEAR_LIMIT_MARGIN_C } from '../analysis/temperatureDataset';
import type { EnergyGrade } from '../solver/solverTypes';

export interface StatusInput {
  /** 10 §4 — 07's solution is DIRTY: nothing below it can be trusted as current. */
  solution_stale: boolean;
  solver_status: 'SOLVED' | 'WARNING' | 'FAILED';
  energy_grade: EnergyGrade;
  /** Component statuses from 10 §8. */
  component_statuses: ComponentThermalStatus[];
  /** Solver warnings carried with the 07 result. */
  solver_warning_count: number;
  /** 10 §12 — components whose thermal limit is missing. */
  components_without_limits: number;
  /** Monitored nodes; zero means there is nothing to judge against. */
  monitored_node_count: number;
  /** 10 §3 — 08 and 09 may be partial; that is a WARNING, never a fabrication. */
  bottleneck_available: boolean;
  distribution_available: boolean;
  /** 10 §12 — critical edges resting on low-confidence inputs. */
  low_confidence_critical_edges: number;
}

interface Candidate {
  status: OverallThermalStatus;
  reason: StatusReason;
}

export interface StatusOutcome {
  status: OverallThermalStatus;
  /** Every reason that fired, highest priority first — not only the winner's. */
  reasons: StatusReason[];
}

export function evaluateOverallStatus(input: StatusInput): StatusOutcome {
  const candidates: Candidate[] = [];

  const raise = (
    status: OverallThermalStatus,
    code: string,
    text: string,
    zh: string,
  ) => candidates.push({ status, reason: { code, text, zh } });

  // --- STALE (10 §4, §21) ---------------------------------------------------
  if (input.solution_stale) {
    raise(
      'STALE',
      'solution_stale',
      'The thermal inputs changed after the last solve, so these results describe a design that no longer exists.',
      '熱網路輸入在上次求解後已變更，畫面上的結果不再對應目前設計。',
    );
  }

  // --- FAIL (10 §4) ---------------------------------------------------------
  const failed = input.component_statuses.filter((status) => status === 'FAIL').length;
  if (failed > 0) {
    raise(
      'FAIL',
      'component_over_limit',
      `${failed} monitored component(s) are over their thermal limit.`,
      `有 ${failed} 個受監控元件已超出 thermal limit。`,
    );
  }
  if (input.solver_status === 'FAILED') {
    raise(
      'FAIL',
      'solver_failed',
      'The solver did not produce a usable result.',
      'Solver 沒有產生可用的結果。',
    );
  }
  if (input.energy_grade === 'error') {
    raise(
      'FAIL',
      'energy_error',
      'Energy balance error is outside the acceptable range, so the result quality is not usable.',
      '能量守恆誤差超出可接受範圍，結果品質不可用。',
    );
  }

  // --- INCOMPLETE (10 §4) ---------------------------------------------------
  if (input.monitored_node_count === 0) {
    raise(
      'INCOMPLETE',
      'no_monitored_nodes',
      'No node carries a thermal limit, so pass/fail cannot be judged at all.',
      '沒有任何節點帶有 thermal limit，無法判定通過與否。',
    );
  } else if (input.components_without_limits > 0) {
    raise(
      'INCOMPLETE',
      'missing_limits',
      `${input.components_without_limits} component(s) have no thermal limit, so the judgement does not cover them.`,
      `有 ${input.components_without_limits} 個元件沒有 thermal limit，判定並未涵蓋這些元件。`,
    );
  }

  // --- WARNING (10 §4) ------------------------------------------------------
  const nearLimit = input.component_statuses.filter((status) => status === 'NEAR LIMIT').length;
  if (nearLimit > 0) {
    raise(
      'WARNING',
      'near_limit',
      `${nearLimit} monitored component(s) are within ${NEAR_LIMIT_MARGIN_C} °C of their limit.`,
      `有 ${nearLimit} 個受監控元件的餘裕在 ${NEAR_LIMIT_MARGIN_C} °C 以內。`,
    );
  }
  if (input.solver_status === 'WARNING' || input.solver_warning_count > 0) {
    raise(
      'WARNING',
      'solver_warning',
      'The solver returned warnings with this result.',
      'Solver 在這次求解中回報了警告。',
    );
  }
  if (input.energy_grade === 'warning') {
    raise(
      'WARNING',
      'energy_warning',
      'Energy balance error is elevated; the result is usable but wants review.',
      '能量守恆誤差偏高，結果可用但建議覆核。',
    );
  }
  if (!input.bottleneck_available) {
    raise(
      'WARNING',
      'bottleneck_missing',
      'Bottleneck analysis is not current, so improvement priorities are unknown.',
      'Bottleneck 分析不是最新的，因此無法得知改善優先順序。',
    );
  }
  if (!input.distribution_available) {
    raise(
      'WARNING',
      'distribution_missing',
      'Temperature distribution is not available for this scenario.',
      '此情境沒有可用的溫度分佈資料。',
    );
  }
  if (input.low_confidence_critical_edges > 0) {
    raise(
      'WARNING',
      'low_confidence',
      `${input.low_confidence_critical_edges} critical edge(s) rest on low-confidence Rth inputs.`,
      `有 ${input.low_confidence_critical_edges} 段關鍵路徑使用低可信度的 Rth 輸入。`,
    );
  }

  if (candidates.length === 0) {
    return {
      status: 'PASS',
      reasons: [
        {
          code: 'all_clear',
          text: 'All monitored margins are clear of the near-limit threshold, the solver result is current, and energy balance is acceptable.',
          zh: '所有受監控餘裕都高於接近限制門檻，求解結果為最新，且能量守恆在可接受範圍內。',
        },
      ],
    };
  }

  const ordered = [...candidates].sort(
    (a, b) => OVERALL_STATUS_PRIORITY[b.status] - OVERALL_STATUS_PRIORITY[a.status],
  );

  return { status: ordered[0].status, reasons: ordered.map((entry) => entry.reason) };
}
