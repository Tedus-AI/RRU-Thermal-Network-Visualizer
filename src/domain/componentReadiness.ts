/**
 * Component readiness, thermal completeness and validation — 04 §7, §22, §23.
 *
 * The completeness view is a CHECKLIST, never a black-box score (04 §23): an
 * engineer must be able to see exactly which of the nine facts is missing.
 */

import {
  contactAreaMm2,
  isHeatSource,
  powerWOf,
  type Component,
} from './component';
import { valueOf } from './sourcedValue';

export type ComponentStatus = 'READY' | 'WARNING' | 'ERROR' | 'DISABLED';

export interface ComponentIssue {
  severity: 'error' | 'warning';
  field: string;
  message: string;
  message_zh: string;
}

/** The nine facts of 04 §23, in the order the checklist displays them. */
export const COMPLETENESS_ITEMS = [
  'Identity',
  'Power',
  'Limit',
  'Package',
  'Rjc',
  'Contact Geometry',
  'Board Path',
  'TIM',
  'Architecture Prep',
] as const;
export type CompletenessItem = (typeof COMPLETENESS_ITEMS)[number];

export const COMPLETENESS_ITEMS_ZH: Record<CompletenessItem, string> = {
  Identity: '識別資料',
  Power: '功耗',
  Limit: '溫度上限',
  Package: '封裝',
  Rjc: '接面熱阻',
  'Contact Geometry': '接觸幾何',
  'Board Path': '板級路徑',
  TIM: '熱介面材料',
  'Architecture Prep': '架構準備',
};

export type CompletenessMap = Record<CompletenessItem, boolean>;

export function completenessOf(component: Component): CompletenessMap {
  const spec = component.thermal_spec;
  return {
    Identity: Boolean(component.name.trim()) && component.qty > 0,
    Power: component.power_W.value != null,
    Limit: spec.limit_type !== 'Unknown' && valueOf(spec.limit_C) != null,
    Package: spec.package_type != null && spec.package_type !== 'Unknown',
    Rjc: valueOf(spec.r_jc_C_per_W) != null,
    'Contact Geometry': contactAreaMm2(spec.geometry) != null,
    'Board Path': spec.board_path.type !== 'Custom' && spec.board_path.type != null,
    TIM: spec.tim.type != null && spec.tim.type !== 'Custom',
    'Architecture Prep': component.architecture_prep.template_preference !== 'UNASSIGNED',
  };
}

export function completenessScore(map: CompletenessMap): { done: number; total: number } {
  const values = Object.values(map);
  return { done: values.filter(Boolean).length, total: values.length };
}

/**
 * 04 §22. Errors block Save & Continue; warnings never do — a component missing
 * Rjc is still worth carrying into Screen 05 (04 §7).
 */
export function validateComponent(component: Component): ComponentIssue[] {
  const issues: ComponentIssue[] = [];
  const spec = component.thermal_spec;

  if (!component.name.trim()) {
    issues.push({
      severity: 'error',
      field: 'name',
      message: 'Component name is empty.',
      message_zh: '元件名稱為空。',
    });
  }

  if (!Number.isFinite(component.qty) || component.qty <= 0) {
    issues.push({
      severity: 'error',
      field: 'qty',
      message: 'Qty must be greater than 0.',
      message_zh: '數量必須大於 0。',
    });
  } else if (!Number.isInteger(component.qty)) {
    issues.push({
      severity: 'error',
      field: 'qty',
      message: 'Qty must be a whole number.',
      message_zh: '數量必須為整數。',
    });
  }

  const power = component.power_W.value;
  if (power != null && (!Number.isFinite(power) || power < 0)) {
    issues.push({
      severity: 'error',
      field: 'power_W',
      message: 'Power cannot be negative.',
      message_zh: '功耗不可為負值。',
    });
  }

  const rjc = valueOf(spec.r_jc_C_per_W);
  if (rjc != null && rjc < 0) {
    issues.push({
      severity: 'error',
      field: 'r_jc_C_per_W',
      message: 'Rjc cannot be negative.',
      message_zh: 'Rjc 不可為負值。',
    });
  }

  const limit = valueOf(spec.limit_C);
  if (limit != null && (!Number.isFinite(limit) || limit <= -273.15)) {
    issues.push({
      severity: 'error',
      field: 'limit_C',
      message: 'Thermal limit is not a valid temperature.',
      message_zh: '溫度上限不是有效溫度。',
    });
  }

  // Geometry must be positive when present — a 0 mm pad is not a measurement.
  const geometryFields: Array<[keyof typeof spec.geometry, string, string]> = [
    ['package_L_mm', 'Package L', '封裝長'],
    ['package_W_mm', 'Package W', '封裝寬'],
    ['package_H_mm', 'Package H', '封裝高'],
    ['contact_L_mm', 'Contact L', '接觸面長'],
    ['contact_W_mm', 'Contact W', '接觸面寬'],
    ['pad_L_mm', 'Pad L', 'Pad 長'],
    ['pad_W_mm', 'Pad W', 'Pad 寬'],
    ['board_thickness_mm', 'Board thickness', '板厚'],
    ['coin_thickness_mm', 'Coin thickness', 'Coin 厚度'],
    ['custom_contact_area_mm2', 'Contact area', '接觸面積'],
  ];
  for (const [key, label, labelZh] of geometryFields) {
    const value = spec.geometry[key];
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      issues.push({
        severity: 'error',
        field: `geometry.${String(key)}`,
        message: `${label} must be a positive number.`,
        message_zh: `${labelZh}必須為正數。`,
      });
    }
  }

  // --- Warnings -----------------------------------------------------------

  if (component.power_W.value == null) {
    issues.push({
      severity: 'warning',
      field: 'power_W',
      message: 'Power is unknown.',
      message_zh: '未填寫功耗。',
    });
  }

  if (spec.limit_type === 'Unknown') {
    issues.push({
      severity: 'warning',
      field: 'limit_type',
      message: 'Limit type is unknown — set Tj, Tc or Ts.',
      message_zh: '未指定溫度上限類型（Tj / Tc / Ts）。',
    });
  }

  if (limit == null) {
    issues.push({
      severity: 'warning',
      field: 'limit_C',
      message: 'Thermal limit is missing — temperature margin cannot be evaluated.',
      message_zh: '缺少溫度上限，將無法評估溫度餘裕。',
    });
  }

  if (isHeatSource(component) && rjc == null) {
    issues.push({
      severity: 'warning',
      field: 'r_jc_C_per_W',
      message: 'Rjc is missing for a heat source.',
      message_zh: '此為熱源但缺少 Rjc。',
    });
  }

  if (spec.package_type == null || spec.package_type === 'Unknown') {
    issues.push({
      severity: 'warning',
      field: 'package_type',
      message: 'Package type is unresolved.',
      message_zh: '未指定封裝型式。',
    });
  }

  if (spec.tim.type === 'Custom') {
    issues.push({
      severity: 'warning',
      field: 'tim.type',
      message: 'TIM is unresolved (Custom).',
      message_zh: '熱介面材料尚未確認（Custom）。',
    });
  }

  if (spec.board_path.type === 'Custom') {
    issues.push({
      severity: 'warning',
      field: 'board_path.type',
      message: 'Board path is unresolved (Custom).',
      message_zh: '板級導熱路徑尚未確認（Custom）。',
    });
  }

  if (isHeatSource(component) && contactAreaMm2(spec.geometry) == null) {
    issues.push({
      severity: 'warning',
      field: 'geometry',
      message: 'Contact area is missing.',
      message_zh: '缺少熱接觸面積。',
    });
  }

  if (component.architecture_prep.template_preference === 'UNASSIGNED') {
    issues.push({
      severity: 'warning',
      field: 'architecture_prep',
      message: 'Architecture template preference is unassigned.',
      message_zh: '尚未指定架構模板偏好。',
    });
  }

  if (spec.geometry.needs_review) {
    issues.push({
      severity: 'warning',
      field: 'geometry',
      message:
        'Imported legacy geometry needs review — Height / Thickness / Pad may use ' +
        'Volume Tool semantics.',
      message_zh: '匯入的舊版幾何資料需人工確認（Height / Thick / Pad 可能沿用舊工具定義）。',
    });
  }

  // 04 §22 — an imported value with no recorded source is a traceability gap.
  if (component.power_W.value != null && component.power_W.source === 'Assumed') {
    issues.push({
      severity: 'warning',
      field: 'power_W',
      message: 'Power has no confirmed source.',
      message_zh: '功耗數值缺少確認來源。',
    });
  }

  return issues;
}

export function statusOf(component: Component, issues?: ComponentIssue[]): ComponentStatus {
  if (!component.enabled) return 'DISABLED';
  const list = issues ?? validateComponent(component);
  if (list.some((issue) => issue.severity === 'error')) return 'ERROR';
  if (list.some((issue) => issue.severity === 'warning')) return 'WARNING';
  return 'READY';
}

export interface ReadinessSummary {
  components: number;
  heat_sources: number;
  total_power_W: number;
  ready: number;
  warnings: number;
  errors: number;
  disabled: number;
}

export function summarizeReadiness(components: Component[]): ReadinessSummary {
  let ready = 0;
  let warnings = 0;
  let errors = 0;
  let disabled = 0;
  let units = 0;
  let heatSourceUnits = 0;
  let power = 0;

  for (const component of components) {
    switch (statusOf(component)) {
      case 'READY':
        ready++;
        break;
      case 'WARNING':
        warnings++;
        break;
      case 'ERROR':
        errors++;
        break;
      case 'DISABLED':
        disabled++;
        break;
    }
    if (!component.enabled) continue;
    units += component.qty || 0;
    if (isHeatSource(component)) heatSourceUnits += component.qty || 0;
    power += (component.qty || 0) * powerWOf(component);
  }

  return {
    components: units,
    heat_sources: heatSourceUnits,
    total_power_W: power,
    ready,
    warnings,
    errors,
    disabled,
  };
}
