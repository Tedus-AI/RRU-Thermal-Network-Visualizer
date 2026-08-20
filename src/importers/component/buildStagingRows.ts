/**
 * Mapping + normalization + validation, producing reviewable staging rows.
 * 02 §8, §13, §14, §17.
 */

import type { Component } from '@/domain/component';
import {
  normalizeCategory,
  normalizeHeatPath,
  normalizeTimName,
  parseNumericCell,
  unrecognisedHeatPath,
} from './normalizeComponent';
import {
  IGNORE_COLUMN,
  REQUIRED_FIELDS,
  type CanonicalField,
  type DuplicatePolicy,
  type MappingTarget,
  type ParsedTable,
  type RowIssue,
  type StagingRow,
} from './types';

/** Duplicate identity for V1 — 02 §17: Component Name + Category. */
export function duplicateKey(name: string, category: string | null): string {
  return `${name.trim().toLowerCase()}::${(category ?? '').toLowerCase()}`;
}

function cellFor(
  row: string[],
  mapping: MappingTarget[],
  field: CanonicalField,
): string | undefined {
  const index = mapping.indexOf(field);
  return index === -1 ? undefined : row[index];
}

export interface BuildOptions {
  table: ParsedTable;
  mapping: MappingTarget[];
  existingComponents: Component[];
}

export function buildStagingRows({
  table,
  mapping,
  existingComponents,
}: BuildOptions): StagingRow[] {
  const existingByKey = new Map<string, Component>();
  for (const component of existingComponents) {
    existingByKey.set(duplicateKey(component.name, component.category), component);
  }

  return table.rows.map((cells, index) => {
    const raw: Partial<Record<CanonicalField, string>> = {};
    const extra: Record<string, string> = {};

    mapping.forEach((target, column) => {
      const value = cells[column] ?? '';
      if (target === IGNORE_COLUMN) {
        // Unmapped columns survive into component metadata (AC-02-14).
        const header = table.headers[column]?.trim();
        if (header && value !== '') extra[header] = value;
      } else {
        raw[target] = value;
      }
    });

    const name = (cellFor(cells, mapping, 'Component') ?? '').trim();
    const category = normalizeCategory(cellFor(cells, mapping, 'Category'));

    const qty = parseNumericCell(cellFor(cells, mapping, 'Qty'));
    const power = parseNumericCell(cellFor(cells, mapping, 'Power(W)'));
    const rjc = parseNumericCell(cellFor(cells, mapping, 'R_jc'));
    const limit = parseNumericCell(cellFor(cells, mapping, 'Limit(C)'));
    const sourceL = parseNumericCell(cellFor(cells, mapping, 'Source_L'));
    const sourceW = parseNumericCell(cellFor(cells, mapping, 'Source_W'));
    const spreadL = parseNumericCell(cellFor(cells, mapping, 'Spread_L'));
    const spreadW = parseNumericCell(cellFor(cells, mapping, 'Spread_W'));
    const thickness = parseNumericCell(cellFor(cells, mapping, 'Thick(mm)'));
    const timBlt = parseNumericCell(cellFor(cells, mapping, 'TIM_BLT'));

    const rawHeatPath = cellFor(cells, mapping, 'Heat_Path');
    const rawTim = cellFor(cells, mapping, 'TIM_Type');
    const heatPath = normalizeHeatPath(rawHeatPath);
    const tim = normalizeTimName(rawTim);

    const duplicate = existingByKey.get(duplicateKey(name, category));

    const row: StagingRow = {
      row_id: `IMP_${String(index + 1).padStart(3, '0')}`,
      include: true,
      name,
      category,
      qty: qty.value,
      power_W: power.value,
      r_jc_C_per_W: rjc.value,
      limit_C: limit.value,
      heat_path: heatPath,
      tim_name: tim,
      tim_blt_mm: timBlt.value,
      source_L_mm: sourceL.value,
      source_W_mm: sourceW.value,
      spread_L_mm: spreadL.value,
      spread_W_mm: spreadW.value,
      thickness_mm: thickness.value,
      raw,
      extra,
      status: 'VALID',
      issues: [],
      duplicate_of: duplicate?.id ?? null,
      duplicate_action: null,
    };

    return validateStagingRow(row, {
      invalidNumerics: {
        Qty: qty.invalid,
        'Power(W)': power.invalid,
        R_jc: rjc.invalid,
        'Limit(C)': limit.invalid,
        Source_L: sourceL.invalid,
        Source_W: sourceW.invalid,
        Spread_L: spreadL.invalid,
        Spread_W: spreadW.invalid,
        TIM_BLT: timBlt.invalid,
        'Thick(mm)': thickness.invalid,
      },
      heatPathUnrecognised: unrecognisedHeatPath(rawHeatPath, heatPath),
      unmappedRequired: REQUIRED_FIELDS.filter((field) => !mapping.includes(field)),
    });
  });
}

export interface ValidateContext {
  invalidNumerics?: Partial<Record<CanonicalField, boolean>>;
  heatPathUnrecognised?: boolean;
  unmappedRequired?: CanonicalField[];
}

/**
 * 02 §14. Errors block the row from importing; warnings never do — a component
 * missing Rjc or a thermal limit is still worth importing, Screen 04 completes it
 * (02 §13, §34).
 */
export function validateStagingRow(row: StagingRow, context: ValidateContext = {}): StagingRow {
  const issues: RowIssue[] = [];
  const invalid = context.invalidNumerics ?? {};

  for (const field of context.unmappedRequired ?? []) {
    issues.push({
      severity: 'error',
      field,
      message: `Required column "${field}" is not mapped.`,
      message_zh: `必要欄位「${field}」尚未對應。`,
    });
  }

  // A number that failed to parse must be reported, never silently zeroed.
  for (const [field, isInvalid] of Object.entries(invalid)) {
    if (!isInvalid) continue;
    const original = row.raw[field as CanonicalField] ?? '';
    issues.push({
      severity: 'error',
      field: field as CanonicalField,
      message: `"${original}" is not a valid number for ${field}.`,
      message_zh: `${field} 的值「${original}」不是有效數字。`,
    });
  }

  if (!row.name) {
    issues.push({
      severity: 'error',
      field: 'Component',
      message: 'Component name is empty.',
      message_zh: '元件名稱為空。',
    });
  }

  if (!invalid.Qty) {
    if (row.qty == null) {
      issues.push({
        severity: 'error',
        field: 'Qty',
        message: 'Qty is required.',
        message_zh: '數量為必填。',
      });
    } else if (!Number.isInteger(row.qty)) {
      issues.push({
        severity: 'error',
        field: 'Qty',
        message: 'Qty must be a whole number.',
        message_zh: '數量必須為整數。',
      });
    } else if (row.qty <= 0) {
      issues.push({
        severity: 'error',
        field: 'Qty',
        message: 'Qty must be greater than 0.',
        message_zh: '數量必須大於 0。',
      });
    }
  }

  if (!invalid['Power(W)']) {
    if (row.power_W == null) {
      issues.push({
        severity: 'error',
        field: 'Power(W)',
        message: 'Power is required.',
        message_zh: '功耗為必填。',
      });
    } else if (row.power_W < 0) {
      issues.push({
        severity: 'error',
        field: 'Power(W)',
        message: 'Power cannot be negative.',
        message_zh: '功耗不可為負值。',
      });
    } else if (row.power_W === 0) {
      // Legal: connectors, shielding, passive parts.
      issues.push({
        severity: 'warning',
        field: 'Power(W)',
        message: 'Power is 0 W — this component will not be a heat source.',
        message_zh: '功耗為 0 W，此元件不會是熱源。',
      });
    }
  }

  if (!invalid.R_jc && row.r_jc_C_per_W != null && row.r_jc_C_per_W < 0) {
    issues.push({
      severity: 'error',
      field: 'R_jc',
      message: 'Rjc cannot be negative.',
      message_zh: 'Rjc 不可為負值。',
    });
  }

  if (!row.category) {
    issues.push({
      severity: 'warning',
      field: 'Category',
      message: 'Category is missing — defaults to Other.',
      message_zh: '未指定類別，將預設為 Other。',
    });
  }

  if (row.r_jc_C_per_W == null && !invalid.R_jc) {
    issues.push({
      severity: 'warning',
      field: 'R_jc',
      message: 'Rjc is missing. Complete it in Component Manager before solving.',
      message_zh: '缺少 Rjc，請於元件管理補齊後再進行計算。',
    });
  }

  if (row.limit_C == null && !invalid['Limit(C)']) {
    issues.push({
      severity: 'warning',
      field: 'Limit(C)',
      message: 'Thermal limit is missing — margin cannot be evaluated.',
      message_zh: '缺少溫度上限，將無法評估溫度餘裕。',
    });
  }

  if (!row.tim_name) {
    issues.push({
      severity: 'warning',
      field: 'TIM_Type',
      message: 'No TIM named — the component will import with none assigned.',
      message_zh: '未指定熱介面材料，將以「無」匯入。',
    });
  }

  // The heat path selects the whole resistance chain, so a missing or
  // unreadable one is worth saying out loud even though it never blocks.
  if (context.heatPathUnrecognised) {
    issues.push({
      severity: 'warning',
      field: 'Heat_Path',
      message: `Unrecognised heat path "${row.raw.Heat_Path ?? ''}" — it will be inferred from the category.`,
      message_zh: `無法辨識的散熱路徑「${row.raw.Heat_Path ?? ''}」，將依類別推定。`,
    });
  } else if (row.heat_path == null) {
    issues.push({
      severity: 'warning',
      field: 'Heat_Path',
      message: 'Heat path is missing — it will be inferred from the category.',
      message_zh: '缺少散熱路徑，將依類別推定。',
    });
  }

  if (row.source_L_mm == null || row.source_W_mm == null) {
    issues.push({
      severity: 'warning',
      field: 'Source_L',
      message: 'Source face size is missing — spreading and TIM resistance cannot be computed.',
      message_zh: '缺少熱源面尺寸，將無法計算擴散與 TIM 熱阻。',
    });
  }

  const hasError = issues.some((issue) => issue.severity === 'error');
  const hasWarning = issues.some((issue) => issue.severity === 'warning');

  let status: StagingRow['status'];
  if (!row.include) status = 'EXCLUDED';
  else if (hasError) status = 'ERROR';
  else if (row.duplicate_of) status = 'DUPLICATE';
  else if (hasWarning) status = 'WARNING';
  else status = 'VALID';

  return { ...row, issues, status };
}

/** Re-runs validation after an inline edit, refreshing duplicate detection too. */
export function revalidateRow(
  row: StagingRow,
  existingComponents: Component[],
  mapping: MappingTarget[],
): StagingRow {
  const existingByKey = new Map<string, Component>();
  for (const component of existingComponents) {
    existingByKey.set(duplicateKey(component.name, component.category), component);
  }
  const duplicate = existingByKey.get(duplicateKey(row.name, row.category));

  return validateStagingRow(
    { ...row, duplicate_of: duplicate?.id ?? null },
    { unmappedRequired: REQUIRED_FIELDS.filter((field) => !mapping.includes(field)) },
  );
}

/** Effective duplicate action for a row, honouring the per-row override. */
export function effectiveDuplicateAction(
  row: StagingRow,
  sessionPolicy: DuplicatePolicy,
): DuplicatePolicy {
  return row.duplicate_action ?? sessionPolicy;
}
