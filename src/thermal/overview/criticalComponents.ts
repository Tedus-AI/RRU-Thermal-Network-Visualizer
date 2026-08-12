/**
 * Critical Components — 10 §8.
 *
 * One row per COMPONENT, showing its worst monitored node. 10 §8: "if multiple
 * monitored nodes exist in one component, show minimum-margin node by default".
 * The rows are sorted by margin, low to high, so the row at the top is the one
 * closest to its limit — which is a different question from "which is hottest"
 * (a 96 °C part with a 110 °C limit is in more trouble than a 103 °C part with
 * a 180 °C limit, and the sort has to say so).
 */

import { NEAR_LIMIT_MARGIN_C, type TemperatureRow } from '../analysis/temperatureDataset';
import type { ComponentThermalStatus, CriticalComponentSummary } from './overviewTypes';

/** 10 §8 — the default row count. */
export const CRITICAL_COMPONENT_TOP_N = 5;

/**
 * 10 §8 classification. 10 §4 / AC-10-04 require the near-limit threshold to be
 * the SAME rule Screen 09 uses, so the constant is imported rather than restated
 * — one screen quietly disagreeing with another about what "near limit" means is
 * exactly the failure this rule exists to prevent.
 */
export function classifyComponent(margin_C: number | undefined): ComponentThermalStatus {
  if (margin_C == null || !Number.isFinite(margin_C)) return 'NO LIMIT';
  if (margin_C < 0) return 'FAIL';
  if (margin_C <= NEAR_LIMIT_MARGIN_C) return 'NEAR LIMIT';
  return 'PASS';
}

/**
 * Group solved nodes by component and keep the worst one.
 *
 * Nodes with no component reference are still monitored parts of the system, so
 * they are kept as their own single-node entries rather than dropped; the node
 * name stands in for the component name.
 */
export function buildCriticalComponents(rows: TemperatureRow[]): CriticalComponentSummary[] {
  const byComponent = new Map<string, TemperatureRow[]>();

  for (const row of rows) {
    const key = row.component_id ?? `node:${row.node_id}`;
    const bucket = byComponent.get(key);
    if (bucket) bucket.push(row);
    else byComponent.set(key, [row]);
  }

  const summaries: CriticalComponentSummary[] = [];

  for (const bucket of byComponent.values()) {
    const monitored = bucket.filter((row) => row.margin_C != null);
    // A component with no limit anywhere still appears, as NO LIMIT on its
    // hottest node. Leaving it out would read as "nothing to see here".
    const pool = monitored.length > 0 ? monitored : bucket;
    const worst = pool.reduce((best, row) => {
      if (best.margin_C == null && row.margin_C == null) {
        return row.temperature_C > best.temperature_C ? row : best;
      }
      if (best.margin_C == null) return row;
      if (row.margin_C == null) return best;
      return row.margin_C < best.margin_C ? row : best;
    });

    summaries.push({
      component_id: worst.component_id,
      component_name: worst.component_name ?? worst.node_name,
      node_id: worst.node_id,
      node_name: worst.node_name,
      temperature_C: worst.temperature_C,
      limit_type: worst.limit_type,
      limit_C: worst.limit_C,
      margin_C: worst.margin_C,
      status: classifyComponent(worst.margin_C),
      monitored_node_count: monitored.length,
    });
  }

  return sortByMargin(summaries);
}

/**
 * 10 §8, AC-10-06 — margin low to high.
 *
 * Components with no limit have no margin to rank on; they sort last, hottest
 * first, rather than being treated as infinitely safe (margin = +inf) or
 * infinitely at risk (margin = 0). Both of those would be claims the data does
 * not support.
 */
export function sortByMargin(rows: CriticalComponentSummary[]): CriticalComponentSummary[] {
  return [...rows].sort((a, b) => {
    if (a.margin_C == null && b.margin_C == null) return b.temperature_C - a.temperature_C;
    if (a.margin_C == null) return 1;
    if (b.margin_C == null) return -1;
    if (a.margin_C !== b.margin_C) return a.margin_C - b.margin_C;
    return b.temperature_C - a.temperature_C;
  });
}

/** The worst monitored margin across the whole set, or null when nothing is monitored. */
export function worstMargin(
  rows: CriticalComponentSummary[],
): { margin_C: number; node_name: string; component_name: string } | null {
  let best: { margin_C: number; node_name: string; component_name: string } | null = null;
  for (const row of rows) {
    if (row.margin_C == null || !Number.isFinite(row.margin_C)) continue;
    if (best == null || row.margin_C < best.margin_C) {
      best = {
        margin_C: row.margin_C,
        node_name: row.node_name,
        component_name: row.component_name,
      };
    }
  }
  return best;
}

export function countByStatus(
  rows: CriticalComponentSummary[],
): Record<ComponentThermalStatus, number> {
  const counts: Record<ComponentThermalStatus, number> = {
    PASS: 0,
    'NEAR LIMIT': 0,
    FAIL: 0,
    'NO LIMIT': 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}
