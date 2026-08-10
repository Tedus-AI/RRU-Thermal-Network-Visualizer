/**
 * Apply step — 02 §17, §23, §24, §27.
 *
 * Pure function: takes the existing component list plus reviewed staging rows and
 * returns the next component list. Persisting and store invalidation happen in the
 * caller, so this stays testable and can never half-write.
 */

import {
  emptyThermalSpec,
  type Component,
  type ComponentProvenance,
  type ThermalSpec,
} from '@/domain/component';
import { duplicateKey, effectiveDuplicateAction } from './buildStagingRows';
import type { ApplyResult, DuplicatePolicy, ImportSourceDescriptor, StagingRow } from './types';

/** Fields whose change invalidates a previous solve — 02 §24. */
const SOLVER_RELEVANT: Array<keyof ThermalSpec | 'power_W' | 'qty'> = [
  'power_W',
  'qty',
  'r_jc_C_per_W',
  'limit_C',
  'tim_type',
  'board_type',
];

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

function specFromRow(row: StagingRow): ThermalSpec {
  return {
    ...emptyThermalSpec(),
    r_jc_C_per_W: row.r_jc_C_per_W,
    limit_C: row.limit_C,
    height_mm: row.height_mm,
    pad_L_mm: row.pad_L_mm,
    pad_W_mm: row.pad_W_mm,
    thickness_mm: row.thickness_mm,
    board_type: row.board_type,
    tim_type: row.tim_type,
  };
}

function provenanceFor(source: ImportSourceDescriptor, row: StagingRow): ComponentProvenance {
  return {
    source_type: source.source_type,
    source_project_id: source.source_project_id,
    source_project_name: source.source_project_name,
    source_file: source.source_file,
    imported_at: new Date().toISOString(),
    ref_origin_project: (row.extra._ref_origin_project as string) ?? null,
    ref_origin_id: (row.extra._ref_origin_id as string) ?? null,
    ref_locked: row.extra._ref_locked === 'true' ? true : null,
  };
}

/** Imported non-empty replaces; imported empty keeps the existing value (02 §17). */
function mergeNonEmpty<T>(incoming: T | null, existing: T | null): T | null {
  return incoming == null || incoming === ('' as unknown as T) ? existing : incoming;
}

export interface ApplyOptions {
  existing: Component[];
  rows: StagingRow[];
  sessionPolicy: DuplicatePolicy;
  source: ImportSourceDescriptor;
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
          ? spec
          : {
              ...target.thermal_spec,
              r_jc_C_per_W: mergeNonEmpty(spec.r_jc_C_per_W, target.thermal_spec.r_jc_C_per_W),
              limit_C: mergeNonEmpty(spec.limit_C, target.thermal_spec.limit_C),
              height_mm: mergeNonEmpty(spec.height_mm, target.thermal_spec.height_mm),
              pad_L_mm: mergeNonEmpty(spec.pad_L_mm, target.thermal_spec.pad_L_mm),
              pad_W_mm: mergeNonEmpty(spec.pad_W_mm, target.thermal_spec.pad_W_mm),
              thickness_mm: mergeNonEmpty(spec.thickness_mm, target.thermal_spec.thickness_mm),
              board_type: mergeNonEmpty(spec.board_type, target.thermal_spec.board_type),
              tim_type: mergeNonEmpty(spec.tim_type, target.thermal_spec.tim_type),
            };

      const nextQty = action === 'REPLACE' ? (row.qty ?? target.qty) : (row.qty ?? target.qty);
      const nextPower =
        action === 'REPLACE' ? (row.power_W ?? target.power_W) : (row.power_W ?? target.power_W);

      // Did anything the solver depends on actually move?
      const before: Record<string, unknown> = {
        power_W: target.power_W,
        qty: target.qty,
        ...target.thermal_spec,
      };
      const after: Record<string, unknown> = {
        power_W: nextPower,
        qty: nextQty,
        ...nextSpec,
      };
      if (SOLVER_RELEVANT.some((field) => before[field] !== after[field])) {
        invalidatedSolver = true;
        // A changed component that already sits in the graph must be re-reviewed.
        if (target.thermal_profile) requiresNetworkReview = true;
      }

      components[existingIndex] = {
        ...target,
        qty: nextQty,
        power_W: nextPower,
        thermal_spec: nextSpec,
        // 02 §17: Replace only overwrites component-owned fields; unknown
        // metadata written by other tools survives either way.
        metadata: { ...(target.metadata ?? {}), ...row.extra },
        provenance: provenanceFor(source, row),
        // thermal_profile is graph data and is never touched by an import.
        thermal_profile: target.thermal_profile,
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
      qty: row.qty ?? 0,
      power_W: row.power_W ?? 0,
      thermal_spec: specFromRow(row),
      // 02 §34 — importing never creates graph topology.
      thermal_profile: null,
      provenance: provenanceFor(source, row),
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
