/**
 * Apply step — 02 §17, §23, §24, §27; component model per 04 §29.
 *
 * Pure function: takes the existing component list plus reviewed staging rows and
 * returns the next component list. Persisting and store invalidation happen in the
 * caller, so this stays testable and can never half-write.
 */

import {
  emptyArchitecturePrep,
  emptyExternalMappings,
  emptyGeometry,
  emptyTim,
  inferLimitType,
  type Component,
  type ComponentProvenance,
  type ThermalSpec,
} from '@/domain/component';
import { sourced, unknownValue, type SourcedValue } from '@/domain/sourcedValue';
import { duplicateKey, effectiveDuplicateAction } from './buildStagingRows';
import type { ApplyResult, DuplicatePolicy, ImportSourceDescriptor, StagingRow } from './types';

function specFromRow(row: StagingRow): ThermalSpec {
  return {
    // No source this tool imports from records WHICH surface the limit belongs
    // to, so it is inferred and left unconfirmed for Screen 04 to settle.
    limit_type: inferLimitType(row.category ?? 'Other', row.name),
    limit_type_confirmed: false,
    limit_C:
      row.limit_C == null ? null : sourced(row.limit_C, 'Imported', { confidence: 'medium' }),
    r_jc_C_per_W:
      row.r_jc_C_per_W == null
        ? null
        : sourced(row.r_jc_C_per_W, 'Imported', { confidence: 'medium' }),
    package_type: null,
    geometry: {
      ...emptyGeometry(),
      pad_L_mm: row.pad_L_mm,
      pad_W_mm: row.pad_W_mm,
      board_thickness_mm: row.thickness_mm,
      // 04 §30 — legacy geometry semantics must be confirmed, not assumed.
      needs_review: row.thickness_mm != null || row.pad_L_mm != null || undefined,
    },
    board_path: { type: row.board_type ?? 'None', parameters: {} },
    tim: { ...emptyTim(), type: row.tim_type ?? 'None', inheritance: 'component' },
  };
}

function provenanceFor(source: ImportSourceDescriptor, row: StagingRow): ComponentProvenance {
  const now = new Date().toISOString();
  return {
    source_type: source.source_type,
    source_project_id: source.source_project_id,
    source_project_name: source.source_project_name,
    source_file: source.source_file,
    imported_at: now,
    last_modified_at: now,
    ref_origin_project: (row.extra._ref_origin_project as string) ?? null,
    ref_origin_id: (row.extra._ref_origin_id as string) ?? null,
    ref_locked: row.extra._ref_locked === 'true' ? true : null,
  };
}

/** Imported non-empty replaces; imported empty keeps the existing value (02 §17). */
function mergeNonEmpty<T>(incoming: T | null, existing: T | null): T | null {
  return incoming == null || incoming === ('' as unknown as T) ? existing : incoming;
}

function mergeSourced(
  incoming: SourcedValue<number> | null,
  existing: SourcedValue<number> | null,
): SourcedValue<number> | null {
  return incoming?.value == null ? existing : incoming;
}

export interface ApplyOptions {
  existing: Component[];
  rows: StagingRow[];
  sessionPolicy: DuplicatePolicy;
  source: ImportSourceDescriptor;
}

function slugId(name: string, taken: Set<string>): string {
  const base =
    'CMP_' +
    (name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'COMPONENT');

  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

export function applyImport({ existing, rows, sessionPolicy, source }: ApplyOptions): {
  components: Component[];
  result: ApplyResult;
} {
  const components = existing.map((component) => ({ ...component }));
  const byKey = new Map<string, number>();
  components.forEach((component, index) => {
    byKey.set(duplicateKey(component.name, component.category), index);
  });
  const takenIds = new Set(components.map((component) => component.id));

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let invalidatedSolver = false;
  let requiresNetworkReview = false;

  for (const row of rows) {
    if (!row.include) {
      skipped++;
      continue;
    }
    if (row.status === 'ERROR') {
      // 02 §23 step 2 — error rows are blocked, never partially written.
      errors++;
      continue;
    }

    const category = row.category ?? 'Other';
    const key = duplicateKey(row.name, category);
    const existingIndex = byKey.get(key);
    const action = existingIndex != null ? effectiveDuplicateAction(row, sessionPolicy) : null;

    if (existingIndex != null && action === 'SKIP') {
      skipped++;
      continue;
    }

    if (existingIndex != null && (action === 'REPLACE' || action === 'MERGE_NON_EMPTY')) {
      const target = components[existingIndex];
      const spec = specFromRow(row);

      const nextSpec: ThermalSpec =
        action === 'REPLACE'
          ? {
              ...spec,
              // A limit type an engineer already settled outranks a fresh guess.
              limit_type: target.thermal_spec.limit_type,
              limit_type_confirmed: target.thermal_spec.limit_type_confirmed,
              package_type: target.thermal_spec.package_type,
            }
          : {
              ...target.thermal_spec,
              limit_C: mergeSourced(spec.limit_C, target.thermal_spec.limit_C),
              r_jc_C_per_W: mergeSourced(spec.r_jc_C_per_W, target.thermal_spec.r_jc_C_per_W),
              geometry: {
                ...target.thermal_spec.geometry,
                pad_L_mm: mergeNonEmpty(
                  spec.geometry.pad_L_mm,
                  target.thermal_spec.geometry.pad_L_mm,
                ),
                pad_W_mm: mergeNonEmpty(
                  spec.geometry.pad_W_mm,
                  target.thermal_spec.geometry.pad_W_mm,
                ),
                board_thickness_mm: mergeNonEmpty(
                  spec.geometry.board_thickness_mm,
                  target.thermal_spec.geometry.board_thickness_mm,
                ),
              },
              board_path:
                spec.board_path.type === 'None' ? target.thermal_spec.board_path : spec.board_path,
              tim: spec.tim.type === 'None' ? target.thermal_spec.tim : spec.tim,
            };

      const nextQty = row.qty ?? target.qty;
      const nextPower = row.power_W == null ? target.power_W : sourced(row.power_W, 'Imported');

      // 02 §24 / 04 §32 — did anything the solver depends on actually move?
      const before = [
        target.power_W.value,
        target.qty,
        target.thermal_spec.r_jc_C_per_W?.value ?? null,
        target.thermal_spec.limit_C?.value ?? null,
        target.thermal_spec.tim.type,
        target.thermal_spec.board_path.type,
      ];
      const after = [
        nextPower.value,
        nextQty,
        nextSpec.r_jc_C_per_W?.value ?? null,
        nextSpec.limit_C?.value ?? null,
        nextSpec.tim.type,
        nextSpec.board_path.type,
      ];
      if (before.some((value, index) => value !== after[index])) {
        invalidatedSolver = true;
        if (target.architecture_prep.thermal_profile_status !== 'Not Assigned') {
          requiresNetworkReview = true;
        }
      }

      components[existingIndex] = {
        ...target,
        qty: nextQty,
        power_W: nextPower,
        thermal_spec: nextSpec,
        // 02 §17: Replace only overwrites component-owned fields; unknown
        // metadata written by other tools survives either way.
        metadata: { ...(target.metadata ?? {}), ...row.extra },
        provenance: { ...provenanceFor(source, row), last_modified_at: new Date().toISOString() },
        // Architecture prep is Screen 04/05 data and is never touched by an import.
        architecture_prep: target.architecture_prep,
        external_mappings: target.external_mappings,
      };
      updated++;
      continue;
    }

    // NEW_VARIANT against a duplicate, or a genuinely new component.
    const name =
      existingIndex != null && action === 'NEW_VARIANT' ? `${row.name} (Imported)` : row.name;
    const id = slugId(name, takenIds);
    takenIds.add(id);

    const component: Component = {
      id,
      name,
      category,
      enabled: true,
      qty: row.qty ?? 0,
      power_W:
        row.power_W == null ? unknownValue<number>('Imported') : sourced(row.power_W, 'Imported'),
      thermal_spec: specFromRow(row),
      // 02 §34 / 04 §40 — importing never creates graph topology or preferences.
      architecture_prep: emptyArchitecturePrep(),
      provenance: provenanceFor(source, row),
      external_mappings: emptyExternalMappings(),
      metadata: Object.keys(row.extra).length > 0 ? { ...row.extra } : undefined,
    };

    components.push(component);
    byKey.set(duplicateKey(component.name, component.category), components.length - 1);
    imported++;
    // New components are not wired into the graph yet (02 §24).
    requiresNetworkReview = true;
    invalidatedSolver = true;
  }

  return {
    components,
    result: {
      imported,
      updated,
      skipped,
      errors,
      invalidated_solver: invalidatedSolver,
      requires_network_review: requiresNetworkReview,
    },
  };
}
