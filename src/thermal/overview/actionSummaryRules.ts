/**
 * Engineering Action Summary and Recommended Next Action — 10 §14, §15.
 *
 * Deterministic, rule-based sentences built from values Screens 07/08 already
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

/**
 * The conclusion is about the PARTS, not about the run.
 *
 * It used to end with the solver's energy balance, how many components carry no
 * limit, how many edges use a low-confidence Rth, and whether the model had been
 * calibrated — four sentences that say the same thing on every project and push
 * the one finding that differs off the bottom of the page. Every one of them is
 * still on the screen that owns it: the solver's balance on 07, the coverage
 * counts on 10.
 *
 * What is left is a line per component at or near its limit, worst first, each
 * carrying the numbers that justify it. A stale solve still leads, because a
 * conclusion drawn from superseded temperatures has to say so before it says
 * anything else.
 */
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

  // Already ranked by margin, worst first, so the lines come out in the order
  // an engineer would work them.
  const monitored = input.critical_components.filter((row) => row.margin_C != null);
  const failing = monitored.filter((row) => row.status === 'FAIL');
  const nearLimit = monitored.filter((row) => row.status === 'NEAR LIMIT');

  for (const row of failing) {
    const over = Math.abs(row.margin_C ?? 0);
    add(
      `${row.component_name} is OVER its ${row.limit_type ?? 'thermal'} limit by ${one(over)} °C — ${one(row.temperature_C)} °C against ${one(row.limit_C ?? 0)} °C.`,
      `${row.component_name} 超出 ${row.limit_type ?? 'thermal'} 限制 ${one(over)} °C —— 溫度 ${one(row.temperature_C)} °C，限制 ${one(row.limit_C ?? 0)} °C。`,
    );
  }

  for (const row of nearLimit) {
    add(
      `${row.component_name} is within ${NEAR_LIMIT_MARGIN_C} °C of its ${row.limit_type ?? 'thermal'} limit — ${one(row.temperature_C)} °C against ${one(row.limit_C ?? 0)} °C, ${one(row.margin_C ?? 0)} °C of margin.`,
      `${row.component_name} 距離 ${row.limit_type ?? 'thermal'} 限制不到 ${NEAR_LIMIT_MARGIN_C} °C —— 溫度 ${one(row.temperature_C)} °C，限制 ${one(row.limit_C ?? 0)} °C，餘裕 ${one(row.margin_C ?? 0)} °C。`,
    );
  }

  // A conclusion still has to conclude something when nothing is in trouble.
  // The tightest margin is what makes "everything passes" checkable.
  if (failing.length === 0 && nearLimit.length === 0) {
    const tightest = monitored[0];
    if (tightest) {
      add(
        `Every monitored component is clear of its limit. The tightest is ${tightest.component_name}, with ${one(tightest.margin_C ?? 0)} °C of margin at ${one(tightest.temperature_C)} °C.`,
        `所有受監控元件都在限制之內。餘裕最小的是 ${tightest.component_name}，溫度 ${one(tightest.temperature_C)} °C，餘裕 ${one(tightest.margin_C ?? 0)} °C。`,
      );
    } else {
      add(
        'No monitored component carries a thermal limit, so no pass or fail conclusion can be drawn.',
        '沒有任何受監控元件帶有 thermal limit，因此無法做出通過或不通過的結論。',
      );
    }
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
