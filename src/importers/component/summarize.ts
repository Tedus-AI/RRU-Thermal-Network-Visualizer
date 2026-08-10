/**
 * Import Summary and Project Impact — 02 §19, §20, §22.
 *
 * Every number here is a component dissipation summary. 02 §34 / §19: none of it
 * is thermal edge heat flow Q.
 */

import {
  COMPONENT_CATEGORIES,
  componentTotalPowerW,
  totalPowerW,
  type Component,
} from '@/domain/component';
import { duplicateKey, effectiveDuplicateAction } from './buildStagingRows';
import type {
  CategorySummary,
  DuplicatePolicy,
  ImportSummary,
  ProjectImpact,
  StagingRow,
} from './types';

/** Qty × Power for one staging row, or null when either value is unusable. */
export function rowTotalPowerW(row: StagingRow): number | null {
  if (row.qty == null || row.power_W == null) return null;
  return row.qty * row.power_W;
}

function importableRows(rows: StagingRow[]): StagingRow[] {
  return rows.filter((row) => row.include && row.status !== 'ERROR');
}

export function summarizeImport(rows: StagingRow[]): ImportSummary {
  const included = rows.filter((row) => row.include);
  const importable = importableRows(rows);

  const breakdown = new Map<string, CategorySummary>();
  for (const category of COMPONENT_CATEGORIES) {
    breakdown.set(category, { category, types: 0, power_W: 0 });
  }

  let total = 0;
  for (const row of importable) {
    const category = row.category ?? 'Other';
    const entry = breakdown.get(category)!;
    entry.types += 1;
    const power = rowTotalPowerW(row) ?? 0;
    entry.power_W += power;
    total += power;
  }

  return {
    detected_rows: rows.length,
    included_rows: included.length,
    valid_rows: rows.filter((row) => row.status === 'VALID').length,
    warning_rows: rows.filter((row) => row.status === 'WARNING').length,
    error_rows: rows.filter((row) => row.status === 'ERROR').length,
    duplicate_rows: rows.filter((row) => row.duplicate_of != null).length,
    total_power_W: total,
    category_breakdown: [...breakdown.values()].filter((entry) => entry.types > 0),
  };
}

export function projectImpact(
  rows: StagingRow[],
  existing: Component[],
  sessionPolicy: DuplicatePolicy,
): ProjectImpact {
  const existingKeys = new Set(existing.map((c) => duplicateKey(c.name, c.category)));

  let newComponents = 0;
  let replaced = 0;
  let skipped = rows.filter((row) => !row.include || row.status === 'ERROR').length;
  let addedPower = 0;
  let removedPower = 0;

  const existingByKey = new Map(existing.map((c) => [duplicateKey(c.name, c.category), c]));

  for (const row of importableRows(rows)) {
    const key = duplicateKey(row.name, row.category ?? 'Other');
    const target = existingByKey.get(key);
    const power = rowTotalPowerW(row) ?? 0;

    if (!target || !existingKeys.has(key)) {
      newComponents++;
      addedPower += power;
      continue;
    }

    const action = effectiveDuplicateAction(row, sessionPolicy);
    if (action === 'SKIP') {
      skipped++;
    } else if (action === 'NEW_VARIANT') {
      newComponents++;
      addedPower += power;
    } else {
      replaced++;
      addedPower += power;
      removedPower += componentTotalPowerW(target);
    }
  }

  return {
    current_components: existing.length,
    new_components: newComponents,
    replaced,
    skipped,
    projected_total: existing.length + newComponents,
    projected_power_W: totalPowerW(existing) + addedPower - removedPower,
  };
}
