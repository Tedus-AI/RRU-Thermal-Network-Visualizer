/**
 * Component readiness, thermal completeness and validation — 04 §7, §22, §23.
 *
 * The completeness view is a CHECKLIST, never a black-box score (04 §23): an
 * engineer must be able to see exactly which of the nine facts is missing.
 */

import {
  GEOMETRY_RULES,
  isHeatSource,
  metalBaseExposedAreaMm2,
  metalBaseParameters,
  normalizeModuleReferenceLocation,
  powerWOf,
  sourceAreaMm2,
  UNASSIGNED_ZONE,
  type Component,
} from './component';
import { isMeasuredInterface } from './materials';
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
  'Heat Path',
  'TIM',
  'Base Zone',
] as const;
export type CompletenessItem = (typeof COMPLETENESS_ITEMS)[number];

export const COMPLETENESS_ITEMS_ZH: Record<CompletenessItem, string> = {
  Identity: '識別資料',
  Power: '功耗',
  Limit: '溫度上限',
  Package: '封裝',
  Rjc: '接面熱阻',
  'Contact Geometry': '熱源面幾何',
  'Heat Path': '散熱路徑',
  TIM: '熱介面材料',
  'Base Zone': '基座區域',
};

export type CompletenessMap = Record<CompletenessItem, boolean>;

export function completenessOf(component: Component): CompletenessMap {
  const spec = component.thermal_spec;
  const metalBase = spec.heat_path.type === 'DirectMetal';
  const metalBaseModel = metalBaseParameters(spec);
  // ModuleSurface used to be a second way of saying this. It folded into
  // DirectMetal, where "the dissipation is referenced to a surface rather than
  // to a junction behind an Rjc" is what SurfaceBodyBased means.
  const surfaceReferenced = metalBase && metalBaseModel.source_model === 'SurfaceBodyBased';
  return {
    Identity: Boolean(component.name.trim()) && component.qty > 0,
    Power: component.power_W.value != null,
    Limit:
      spec.limit_type_confirmed &&
      valueOf(spec.limit_C) != null &&
      (!surfaceReferenced || normalizeModuleReferenceLocation(spec.limit_reference_note) != null),
    Package: spec.package_type != null && spec.package_type !== 'Unknown',
    // Rjc is genuinely not applicable when the manufacturer specifies the
    // allowed temperature at the very surface where this model injects heat.
    Rjc: surfaceReferenced || valueOf(spec.r_jc_C_per_W) != null,
    'Contact Geometry':
      sourceAreaMm2(spec.geometry, spec.heat_path.type, spec.heat_path.parameters) != null,
    'Heat Path': spec.heat_path_confirmed,
    // Direct metal contact is an answer, not an absence — the interface still
    // resolves, through the project's contact conductance.
    TIM:
      spec.tim.tim_id != null &&
      (!isMeasuredInterface(spec.tim) ||
        (valueOf(spec.tim.measured_rth_C_per_W) ?? 0) > 0),
    // The template is no longer asked for — the heat path decides it. What is
    // still an open choice is which shared structure the part sits on.
    'Base Zone': component.architecture_prep.preferred_base_zone !== UNASSIGNED_ZONE,
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
  const metalBase = spec.heat_path.type === 'DirectMetal';
  const metalBaseModel = metalBaseParameters(spec);
  // ModuleSurface used to be a second way of saying this. It folded into
  // DirectMetal, where "the dissipation is referenced to a surface rather than
  // to a junction behind an Rjc" is what SurfaceBodyBased means.
  const surfaceReferenced = metalBase && metalBaseModel.source_model === 'SurfaceBodyBased';

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
    ['source_L_mm', 'Source face L', '熱源面長'],
    ['source_W_mm', 'Source face W', '熱源面寬'],
    ['board_thickness_mm', 'Board thickness', '板厚'],
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

  if (!spec.limit_type_confirmed) {
    issues.push({
      severity: 'warning',
      field: 'limit_type',
      message: `Limit type is assumed to be ${spec.limit_type} — confirm it against the datasheet.`,
      message_zh: `溫度上限類型為推定值（${spec.limit_type}），請對照規格書確認。`,
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

  if (isHeatSource(component) && !surfaceReferenced && rjc == null) {
    issues.push({
      severity: 'warning',
      field: 'r_jc_C_per_W',
      message: 'Rjc is missing for a heat source.',
      message_zh: '此為熱源但缺少 Rjc。',
    });
  }

  if (surfaceReferenced && spec.limit_type === 'Tj') {
    issues.push({
      severity: 'error',
      field: 'limit_type',
      message: 'A surface/body-source model must use a surface reference (Tc, Tb or Ts), not Tj.',
      message_zh: '表面／本體熱源模型必須使用表面參考溫度（Tc、Tb 或 Ts），不可使用 Tj。',
    });
  }

  if (surfaceReferenced && normalizeModuleReferenceLocation(spec.limit_reference_note) == null) {
    issues.push({
      severity: 'warning',
      field: 'limit_reference_note',
      message: 'Choose Left, Center or Right for the surface/body temperature reference.',
      message_zh: '請選擇表面／本體溫度基準的左側、中央或右側量測位置。',
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

  // No TIM is a legitimate answer for a bolted part, so this is a warning that
  // names the consequence rather than an error.
  if (spec.tim.tim_id == null) {
    issues.push({
      severity: 'warning',
      field: 'tim.tim_id',
      message: 'No TIM assigned — the interface resistance cannot be computed.',
      message_zh: '未指定熱介面材料，介面熱阻將無法計算。',
    });
  }

  if (!spec.heat_path_confirmed) {
    issues.push({
      severity: 'warning',
      field: 'heat_path.type',
      message: `Heat path is assumed to be ${spec.heat_path.type} — it selects the whole resistance chain, so confirm it.`,
      message_zh: `散熱路徑為推定值（${spec.heat_path.type}），它決定整條熱阻鏈，請確認。`,
    });
  }

  if (
    isHeatSource(component) &&
    sourceAreaMm2(spec.geometry, spec.heat_path.type, spec.heat_path.parameters) == null
  ) {
    issues.push({
      severity: 'warning',
      // Named to a real field so the issue can be a link to it, not just a
      // sentence: plain `geometry` pointed at nothing the user could open. Two
      // paths take the face from the package, so that is where they are fixed.
      field:
        metalBase && metalBaseModel.contact_geometry === 'PerimeterFrame'
          ? 'heat_path.parameters.perimeter_land_width_mm'
          : metalBase && metalBaseModel.contact_geometry === 'CustomArea'
            ? 'heat_path.parameters.custom_contact_area_mm2'
            : GEOMETRY_RULES[spec.heat_path.type].source === 'package' || metalBase
          ? 'geometry.package_L_mm'
          : 'geometry.source_L_mm',
      message: 'Source face size is missing.',
      message_zh: '缺少熱源面尺寸。',
    });
  }

  if (metalBase && metalBaseModel.contact_geometry === 'PerimeterFrame') {
    const width = metalBaseModel.perimeter_land_width_mm;
    const limit = Math.min(
      spec.geometry.package_L_mm ?? 0,
      spec.geometry.package_W_mm ?? 0,
    ) / 2;
    if (width == null || width <= 0 || (limit > 0 && width >= limit)) {
      issues.push({
        severity: 'warning',
        field: 'heat_path.parameters.perimeter_land_width_mm',
        message: 'Perimeter land width is missing or does not fit inside the package base.',
        message_zh: '外圍接觸邊寬缺少，或尺寸已超出元件底面。',
      });
    }
  }

  if (metalBase && metalBaseModel.exposed_surface_enabled && metalBaseExposedAreaMm2(spec) == null) {
    issues.push({
      severity: 'warning',
      field:
        metalBaseModel.exposed_area_mode === 'Custom'
          ? 'heat_path.parameters.custom_exposed_area_mm2'
          : 'geometry.package_L_mm',
      message: 'Exposed-surface boundary is enabled but its area cannot be derived.',
      message_zh: '已啟用暴露表面邊界，但目前無法取得有效表面積。',
    });
  }

  if (
    isMeasuredInterface(spec.tim) &&
    (valueOf(spec.tim.measured_rth_C_per_W) ?? 0) <= 0
  ) {
    issues.push({
      severity: 'warning',
      field: 'tim.measured_rth_C_per_W',
      message: 'Measured interface mode requires a positive Rth.',
      message_zh: '實測介面熱阻模式必須輸入大於 0 的 Rth。',
    });
  }

  // Choosing "custom" bond line and then leaving it empty is not the same as
  // inheriting: the user asked to override and has not said with what.
  if (
    spec.tim.tim_id != null &&
    !isMeasuredInterface(spec.tim) &&
    spec.tim.blt_mm != null &&
    spec.tim.blt_mm.value == null
  ) {
    issues.push({
      severity: 'warning',
      field: 'tim.blt_mm',
      message: 'Bond line is set to custom but has no value.',
      message_zh: '壓合厚度選了自訂但未輸入數值。',
    });
  }

  if (component.architecture_prep.preferred_base_zone === UNASSIGNED_ZONE) {
    issues.push({
      severity: 'warning',
      field: 'architecture_prep',
      message: 'No base zone chosen — Screen 05 cannot suggest where this part attaches.',
      message_zh: '尚未指定基座區域，Screen 05 將無法建議此元件的連接位置。',
    });
  }

  if (spec.geometry.needs_review) {
    issues.push({
      severity: 'warning',
      field: 'geometry.needs_review',
      message:
        'Imported legacy geometry needs review — Thickness / Pad may use Volume Tool semantics.',
      message_zh: '匯入的舊版幾何資料需人工確認（Thick / Pad 可能沿用舊工具定義）。',
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
