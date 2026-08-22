/**
 * Existing Project source — 02 §5, §6.
 *
 * Deliberately emits a ParsedTable rather than components, so an existing-project
 * import travels the exact same Mapping → Normalization → Validation → Duplicate
 * pipeline as a file. One pipeline, one set of guarantees.
 *
 * Lineage columns (`_ref_origin_*`) ride along as unmapped columns and end up in
 * component metadata, preserving provenance (02 §6, §27).
 */

import { defaultMaterials, findTimMaterial, type MaterialDefaults } from '@/domain/materials';
import type { Component } from '@/domain/component';
import { loadComponents } from '@/data/persistence';
import type { ComponentCategory } from '@/domain/component';
import type { ParsedTable } from './types';

export interface ExistingProjectSummary {
  project_id: string;
  project_name: string;
  last_updated: string;
  rf_count: number;
  digital_count: number;
  power_count: number;
  total_count: number;
}

export function summarizeSourceProject(
  projectId: string,
  projectName: string,
  lastUpdated: string,
): ExistingProjectSummary {
  const components = loadComponents(projectId);
  const count = (category: ComponentCategory) =>
    components.filter((c) => c.category === category).length;

  return {
    project_id: projectId,
    project_name: projectName,
    last_updated: lastUpdated,
    rf_count: count('RF'),
    digital_count: count('Digital'),
    power_count: count('Power'),
    total_count: components.length,
  };
}

/**
 * One column per canonical field the component model can still answer, so a
 * project exported here re-imports without losing anything. The spread face is
 * absent because it is derived from the heat path now, not stored.
 */
export const EXISTING_PROJECT_HEADERS = [
  'Component',
  'Category',
  'Qty',
  'Power(W)',
  'R_jc',
  'Limit(C)',
  'Package',
  'Package_L',
  'Package_W',
  'Package_H',
  'Heat_Path',
  'TIM_Type',
  'TIM_BLT',
  'Source_L',
  'Source_W',
  'Thick(mm)',
  '_ref_origin_project',
  '_ref_origin_id',
];

const text = (value: unknown): string => (value == null ? '' : String(value));

export interface ExistingProjectScope {
  /** Categories to include — 02 §6 Import Scope. */
  categories: ComponentCategory[];
  includeHidden: boolean;
}

export function parseExistingProject(
  projectId: string,
  scope: ExistingProjectScope,
  /** The SOURCE project's library, so a TIM exports under its own name. */
  materials: MaterialDefaults = defaultMaterials(),
): ParsedTable {
  const components = loadComponents(projectId).filter((component) => {
    if (!scope.categories.includes(component.category)) return false;
    // Disabled components are the tool's own "hidden / excluded" set (02 §6).
    if (!scope.includeHidden && !component.enabled) return false;
    if (!scope.includeHidden && component.metadata?._hidden === 'true') return false;
    return true;
  });

  const rows = components.map((component: Component) => [
    component.name,
    component.category,
    text(component.qty),
    text(component.power_W.value),
    text(component.thermal_spec.r_jc_C_per_W?.value),
    text(component.thermal_spec.limit_C?.value),
    text(component.thermal_spec.package_type),
    text(component.thermal_spec.geometry.package_L_mm),
    text(component.thermal_spec.geometry.package_W_mm),
    text(component.thermal_spec.geometry.package_H_mm),
    text(component.thermal_spec.heat_path.type),
    // The material's NAME, since that is what another project can match on —
    // an id is meaningless outside this project's library.
    text(findTimMaterial(materials, component.thermal_spec.tim.tim_id)?.name),
    // Only a component's own bond line is re-exported; the material's default
    // would turn an inherited value into a per-component decision on re-import.
    text(component.thermal_spec.tim.blt_mm?.value),
    text(component.thermal_spec.geometry.source_L_mm),
    text(component.thermal_spec.geometry.source_W_mm),
    text(component.thermal_spec.geometry.board_thickness_mm),
    // Keep the original lineage if the source already had one, else point here.
    text(component.provenance.ref_origin_project ?? projectId),
    text(component.provenance.ref_origin_id ?? component.id),
  ]);

  return { headers: EXISTING_PROJECT_HEADERS, rows, sourceName: projectId };
}
