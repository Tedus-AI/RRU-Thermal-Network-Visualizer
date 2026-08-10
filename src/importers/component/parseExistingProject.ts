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

const HEADERS = [
  'Component',
  'Category',
  'Qty',
  'Power(W)',
  'R_jc',
  'Limit(C)',
  'Board_Type',
  'TIM_Type',
  'Height(mm)',
  'Pad_L',
  'Pad_W',
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
    text(component.thermal_spec.board_path.type),
    text(component.thermal_spec.tim.type),
    text(component.thermal_spec.geometry.legacy_height_mm),
    text(component.thermal_spec.geometry.pad_L_mm),
    text(component.thermal_spec.geometry.pad_W_mm),
    text(component.thermal_spec.geometry.board_thickness_mm),
    // Keep the original lineage if the source already had one, else point here.
    text(component.provenance.ref_origin_project ?? projectId),
    text(component.provenance.ref_origin_id ?? component.id),
  ]);

  return { headers: HEADERS, rows, sourceName: projectId };
}
