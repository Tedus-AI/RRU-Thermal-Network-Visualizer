/**
 * Overall Readiness checklist and Report Readiness — 10 §16, §17.
 *
 * The checklist answers "is each supporting analysis in a state a report can
 * quote", one line per item. Report Readiness is the roll-up: BLOCKED when the
 * 07 result itself cannot be quoted, WARNING when it can but something behind it
 * is partial, READY when nothing is outstanding (AC-10-21, AC-10-22).
 *
 * Absence is never upgraded into a pass here: a missing input is MISSING, not
 * "READY, nothing found".
 */

import type {
  DataCompletenessSummary,
  ReadinessCheck,
  ReportReadiness,
  SolverQualitySummary,
} from './overviewTypes';

export interface ReadinessInput {
  solution_stale: boolean;
  solver: SolverQualitySummary;
  completeness: DataCompletenessSummary;
  monitored_node_count: number;
}

export function buildReadiness(input: ReadinessInput): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  // 1. Current solver result -------------------------------------------------
  if (input.solution_stale) {
    checks.push({
      item: 'current_solver_result',
      state: 'STALE',
      detail: 'The inputs changed after this solve.',
      detail_zh: '求解後輸入已變更。',
    });
  } else if (input.solver.status === 'FAILED') {
    checks.push({
      item: 'current_solver_result',
      state: 'MISSING',
      detail: 'The last solve failed; there is no usable result.',
      detail_zh: '上次求解失敗，沒有可用結果。',
    });
  } else if (input.solver.status === 'WARNING') {
    checks.push({
      item: 'current_solver_result',
      state: 'WARNING',
      detail: 'Solved with warnings.',
      detail_zh: '求解完成但有警告。',
    });
  } else {
    checks.push({
      item: 'current_solver_result',
      state: 'READY',
      detail: `Solved ${input.solver.solved_nodes} nodes and ${input.solver.solved_edges} edges.`,
      detail_zh: `已求解 ${input.solver.solved_nodes} 個節點與 ${input.solver.solved_edges} 段連線。`,
    });
  }

  // 2. Energy balance --------------------------------------------------------
  const errorText = `${input.solver.energy_error_pct.toFixed(2)}%`;
  checks.push({
    item: 'energy_balance',
    state:
      input.solver.quality === 'green'
        ? 'READY'
        : input.solver.quality === 'warning'
          ? 'WARNING'
          : 'MISSING',
    detail:
      input.solver.quality === 'green'
        ? `Energy error ${errorText} is within the good band.`
        : input.solver.quality === 'warning'
          ? `Energy error ${errorText} is elevated.`
          : `Energy error ${errorText} is outside the acceptable range.`,
    detail_zh:
      input.solver.quality === 'green'
        ? `能量誤差 ${errorText}，屬於良好範圍。`
        : input.solver.quality === 'warning'
          ? `能量誤差 ${errorText} 偏高。`
          : `能量誤差 ${errorText} 超出可接受範圍。`,
  });

  // 3. Thermal limits coverage ----------------------------------------------
  if (input.monitored_node_count === 0) {
    checks.push({
      item: 'thermal_limits_coverage',
      state: 'MISSING',
      detail: 'No component carries a thermal limit.',
      detail_zh: '沒有任何元件帶有 thermal limit。',
    });
  } else if (input.completeness.components_without_limits > 0) {
    checks.push({
      item: 'thermal_limits_coverage',
      state: 'WARNING',
      detail: `${input.completeness.components_without_limits} component(s) are missing a thermal limit.`,
      detail_zh: `有 ${input.completeness.components_without_limits} 個元件缺少 thermal limit。`,
    });
  } else {
    checks.push({
      item: 'thermal_limits_coverage',
      state: 'READY',
      detail: `All ${input.completeness.components_with_limits} component(s) carry a thermal limit.`,
      detail_zh: `全部 ${input.completeness.components_with_limits} 個元件皆已設定 thermal limit。`,
    });
  }

  /*
     Rows 4 and 5 are gone.

     They reported whether a stored bottleneck analysis and a stored temperature
     distribution were current. Nothing produces either any more — Screen 08 was
     rebuilt around margin ranking and saved studies, and the temperature rows
     are derived from the solution — so both rows named a state no action could
     change, and Report Readiness sat at WARNING forever on a design with
     nothing wrong with it. A readiness signal that is always amber tells the
     reader nothing about the one time it matters.
  */

  // 6. Data confidence -------------------------------------------------------
  if (input.completeness.low_confidence_critical_edges > 0) {
    checks.push({
      item: 'data_confidence',
      state: 'WARNING',
      detail: `${input.completeness.low_confidence_critical_edges} critical edge(s) use low-confidence Rth inputs.`,
      detail_zh: `有 ${input.completeness.low_confidence_critical_edges} 段關鍵連線使用低可信度 Rth 輸入。`,
    });
  } else {
    // 10 §20, AC-10-31 — analytical-only is a legitimate, complete V1 state.
    // The absence of FloTHERM is a coverage note, not a defect.
    checks.push({
      item: 'data_confidence',
      state: 'READY',
      detail:
        input.completeness.data_confidence === 'Analytical-only'
          ? 'Analytical-only: no low-confidence critical inputs, and no external calibration exists yet.'
          : 'Inputs are calibrated against external data.',
      detail_zh:
        input.completeness.data_confidence === 'Analytical-only'
          ? '僅 analytical：關鍵輸入沒有低可信度項目，且尚未有外部校正資料。'
          : '輸入已由外部資料校正。',
    });
  }

  return checks;
}

export interface ReportReadinessOutcome {
  readiness: ReportReadiness;
  reasons: string[];
  reasons_zh: string[];
}

/**
 * 10 §17.
 *
 * BLOCKED is driven only by the 07 result: stale, failed, or absent. Everything
 * else — partial 08/09, missing limits, confidence issues — degrades to WARNING,
 * because a report CAN quote those results as long as it states their limits.
 */
export function evaluateReportReadiness(checks: ReadinessCheck[]): ReportReadinessOutcome {
  const solver = checks.find((check) => check.item === 'current_solver_result');
  const reasons: string[] = [];
  const reasons_zh: string[] = [];

  if (solver && (solver.state === 'STALE' || solver.state === 'MISSING')) {
    return {
      readiness: 'BLOCKED',
      reasons: [solver.detail],
      reasons_zh: [solver.detail_zh],
    };
  }

  for (const check of checks) {
    if (check.state === 'READY') continue;
    reasons.push(check.detail);
    reasons_zh.push(check.detail_zh);
  }

  return {
    readiness: reasons.length > 0 ? 'WARNING' : 'READY',
    reasons,
    reasons_zh,
  };
}
