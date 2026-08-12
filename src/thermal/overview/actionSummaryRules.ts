/**
 * Engineering Action Summary and Recommended Next Action — 10 §14, §15.
 *
 * Deterministic, rule-based sentences built from values Screens 07/08/09 already
 * produced. 10 §14 and AC-10-18 are explicit that no language model is involved
 * in V1, and AC-10-19 is explicit that an improvement Screen 08 did not
 * calculate is never asserted here: if 08 has not run, the summary says so
 * instead of estimating one.
 *
 * Every sentence below can be traced to a number on this screen. That is the
 * point — an engineer has to be able to check the claim, not take it on faith.
 */

import type {
  BottleneckAvailability,
  BottleneckSummary,
  CriticalComponentSummary,
  DataCompletenessSummary,
  OverallThermalStatus,
  RecommendedNextAction,
  SolverQualitySummary,
} from './overviewTypes';
import { NEAR_LIMIT_MARGIN_C } from '../analysis/temperatureDataset';

export interface ActionSummaryInput {
  overall_status: OverallThermalStatus;
  solution_stale: boolean;
  critical_components: CriticalComponentSummary[];
  bottlenecks: BottleneckSummary[];
  bottleneck_availability: BottleneckAvailability;
  solver: SolverQualitySummary;
  completeness: DataCompletenessSummary;
  distribution_available: boolean;
}

export interface ActionSummary {
  lines: string[];
  lines_zh: string[];
}

const one = (value: number) => value.toFixed(1);

export function buildActionSummary(input: ActionSummaryInput): ActionSummary {
  const lines: string[] = [];
  const zh: string[] = [];

  const add = (text: string, text_zh: string) => {
    lines.push(text);
    zh.push(text_zh);
  };

  // 1 — the state of the result itself, before anything is concluded from it.
  if (input.solution_stale) {
    add(
      'The thermal inputs changed after this solve, so every value below describes a superseded design. Re-solve in Screen 07 before acting on any of it.',
      '熱網路輸入在此次求解之後已變更，以下數值對應的是舊設計。請先回到 07 重新求解，再依據結果行動。',
    );
  }

  // 2 — the lowest-margin monitored component (10 §14 example line 1).
  const monitored = input.critical_components.filter((row) => row.margin_C != null);
  const worst = monitored[0];
  if (worst && worst.margin_C != null) {
    if (worst.margin_C < 0) {
      add(
        `${worst.component_name} is over its ${worst.limit_type ?? 'thermal'} limit at ${one(worst.temperature_C)} °C against ${one(worst.limit_C ?? 0)} °C (margin ${one(worst.margin_C)} °C).`,
        `${worst.component_name} 已超出 ${worst.limit_type ?? 'thermal'} limit：溫度 ${one(worst.temperature_C)} °C，限制 ${one(worst.limit_C ?? 0)} °C（餘裕 ${one(worst.margin_C)} °C）。`,
      );
    } else {
      add(
        `${worst.component_name} is the lowest-margin monitored component (+${one(worst.margin_C)} °C at ${one(worst.temperature_C)} °C).`,
        `${worst.component_name} 是餘裕最小的受監控元件（+${one(worst.margin_C)} °C，溫度 ${one(worst.temperature_C)} °C）。`,
      );
    }
  } else {
    add(
      'No monitored component carries a thermal limit, so no margin conclusion can be drawn.',
      '沒有任何受監控元件帶有 thermal limit，因此無法得出餘裕結論。',
    );
  }

  // 3 — the near-limit population, if any.
  const nearLimit = input.critical_components.filter((row) => row.status === 'NEAR LIMIT');
  if (nearLimit.length > 0) {
    add(
      `${nearLimit.length} component(s) sit within ${NEAR_LIMIT_MARGIN_C} °C of their limit: ${nearLimit.map((row) => row.component_name).join(', ')}.`,
      `有 ${nearLimit.length} 個元件的餘裕在 ${NEAR_LIMIT_MARGIN_C} °C 以內：${nearLimit.map((row) => row.component_name).join('、')}。`,
    );
  }

  // 4 — the bottleneck, strictly as Screen 08 measured it (10 §14, AC-10-19).
  const top = input.bottlenecks[0];
  if (input.bottleneck_availability === 'current' && top) {
    add(
      `${top.edge_label} is the highest-value improvement candidate (score ${top.score.toFixed(0)}, ${top.classification}).`,
      `${top.edge_label} 是價值最高的改善候選（score ${top.score.toFixed(0)}，${top.classification}）。`,
    );
    if (top.sensitivity_improvement_C != null) {
      add(
        `A ${top.reduction_pct}% reduction of that segment's Rth is projected by Screen 08 to improve the target temperature by ${one(top.sensitivity_improvement_C)} °C and to affect ${top.affected_components} component(s).`,
        `Screen 08 推估將該段 Rth 降低 ${top.reduction_pct}% 可讓目標溫度改善 ${one(top.sensitivity_improvement_C)} °C，並影響 ${top.affected_components} 個元件。`,
      );
    }
    if (top.confidence === 'low') {
      add(
        `That candidate rests on a low-confidence Rth input, so verify the segment's resistance before committing to a design change.`,
        '該候選依賴低可信度的 Rth 輸入，在投入設計變更前請先確認該段熱阻。',
      );
    }
  } else {
    // AC-10-19 — no ranking, no projected improvement, no invented candidate.
    add(
      input.bottleneck_availability === 'not_run'
        ? 'Bottleneck analysis has not been run for this scenario, so no improvement candidate is ranked here.'
        : 'Bottleneck analysis is not current, so no improvement candidate is ranked here.',
      input.bottleneck_availability === 'not_run'
        ? '此情境尚未執行 bottleneck 分析，因此本頁不列出改善候選。'
        : 'Bottleneck 分析不是最新的，因此本頁不列出改善候選。',
    );
  }

  // 5 — solver quality, in the same words Screen 07 uses.
  const gradeWord =
    input.solver.quality === 'green' ? 'good' : input.solver.quality === 'warning' ? 'elevated' : 'unacceptable';
  const gradeZh =
    input.solver.quality === 'green' ? '良好' : input.solver.quality === 'warning' ? '偏高' : '不可接受';
  add(
    `Solver energy balance is ${gradeWord} at ${input.solver.energy_error_pct.toFixed(2)}% (${one(input.solver.generated_W)} W generated, ${one(input.solver.rejected_W)} W rejected).`,
    `Solver 能量守恆${gradeZh}，誤差 ${input.solver.energy_error_pct.toFixed(2)}%（產生 ${one(input.solver.generated_W)} W，排出 ${one(input.solver.rejected_W)} W）。`,
  );

  // 6 — data coverage, stated as coverage rather than as a verdict.
  if (input.completeness.components_without_limits > 0) {
    add(
      `${input.completeness.components_without_limits} component(s) have no thermal limit, so the pass/fail judgement does not cover them.`,
      `有 ${input.completeness.components_without_limits} 個元件沒有 thermal limit，通過與否的判定並未涵蓋這些元件。`,
    );
  }
  if (input.completeness.low_confidence_critical_edges > 0) {
    add(
      `${input.completeness.low_confidence_critical_edges} critical edge(s) use low-confidence Rth inputs; results are usable but want engineering review.`,
      `有 ${input.completeness.low_confidence_critical_edges} 段關鍵連線使用低可信度 Rth 輸入，結果可用但建議工程覆核。`,
    );
  }
  if (input.completeness.data_confidence === 'Analytical-only') {
    add(
      'Results are analytical-only: no FloTHERM or measurement dataset has calibrated this model yet.',
      '目前結果僅來自 analytical model，尚未有 FloTHERM 或量測資料進行校正。',
    );
  }

  return { lines, lines_zh: zh };
}

/**
 * 10 §15 — exactly one primary recommendation, chosen in severity order.
 *
 * The order is deliberate: fix what makes the numbers meaningless (a stale or
 * failed solve) before acting on what the numbers say.
 */
export function recommendNextAction(input: ActionSummaryInput): RecommendedNextAction {
  if (input.solution_stale || input.solver.status === 'FAILED') {
    return {
      action: 'Re-Solve Network',
      zh: '重新求解熱網路',
      reason: input.solution_stale
        ? 'The current results predate a change to the thermal inputs.'
        : 'The last solve failed, so there is no usable result to summarise.',
      reason_zh: input.solution_stale
        ? '目前結果早於熱網路輸入的變更。'
        : '上次求解失敗，沒有可供總覽的結果。',
      goto: '07',
    };
  }

  const failing = input.critical_components.find((row) => row.status === 'FAIL');
  if (failing) {
    return {
      action: 'Review Failed Component',
      zh: '檢視超限元件',
      reason: `${failing.component_name} is over its limit at ${one(failing.temperature_C)} °C.`,
      reason_zh: `${failing.component_name} 溫度 ${one(failing.temperature_C)} °C，已超出限制。`,
      goto: '09',
    };
  }

  if (input.bottleneck_availability !== 'current') {
    return {
      action: 'Run Bottleneck Analysis',
      zh: '執行瓶頸分析',
      reason:
        input.bottleneck_availability === 'not_run'
          ? 'No bottleneck analysis exists for this scenario, so improvement priorities are unknown.'
          : 'The stored bottleneck analysis no longer matches the current solve.',
      reason_zh:
        input.bottleneck_availability === 'not_run'
          ? '此情境沒有 bottleneck 分析，無法得知改善優先順序。'
          : '已儲存的 bottleneck 分析與目前求解不一致。',
      goto: '08',
    };
  }

  const nearLimit = input.critical_components.find((row) => row.status === 'NEAR LIMIT');
  if (nearLimit) {
    return {
      action: 'Review Near-Limit Component',
      zh: '檢視接近限制的元件',
      reason: `${nearLimit.component_name} has only ${one(nearLimit.margin_C ?? 0)} °C of margin.`,
      reason_zh: `${nearLimit.component_name} 只剩 ${one(nearLimit.margin_C ?? 0)} °C 餘裕。`,
      goto: '09',
    };
  }

  if (input.completeness.components_without_limits > 0) {
    return {
      action: 'Complete Missing Limits',
      zh: '補齊缺少的熱限制',
      reason: `${input.completeness.components_without_limits} component(s) cannot be judged without a thermal limit.`,
      reason_zh: `有 ${input.completeness.components_without_limits} 個元件缺少 thermal limit，無法判定。`,
      goto: '04',
    };
  }

  if (input.completeness.low_confidence_critical_edges > 0) {
    return {
      action: 'Review Data Confidence',
      zh: '檢視資料可信度',
      reason: `${input.completeness.low_confidence_critical_edges} critical edge(s) rest on low-confidence Rth inputs.`,
      reason_zh: `有 ${input.completeness.low_confidence_critical_edges} 段關鍵連線使用低可信度 Rth 輸入。`,
      goto: '05',
    };
  }

  const top = input.bottlenecks[0];
  if (top && top.classification !== 'Low') {
    return {
      action: 'Review Bottleneck',
      zh: '檢視瓶頸',
      reason: `${top.edge_label} is the highest-value improvement candidate (score ${top.score.toFixed(0)}).`,
      reason_zh: `${top.edge_label} 是價值最高的改善候選（score ${top.score.toFixed(0)}）。`,
      goto: '08',
    };
  }

  return {
    action: 'No Immediate Action',
    zh: '暫無需要處理的項目',
    reason: 'All monitored margins are clear and the supporting analyses are current.',
    reason_zh: '所有受監控餘裕皆充足，且支援分析皆為最新。',
    goto: null,
  };
}
