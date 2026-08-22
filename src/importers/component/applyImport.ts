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
  GEOMETRY_RULES,
  inferLimitType,
  type Component,
  type ComponentProvenance,
  type HeatPathType,
  type ThermalSpec,
} from '@/domain/component';
import { sourced, unknownValue, type SourcedValue } from '@/domain/sourcedValue';
import type { MaterialDefaults } from '@/domain/materials';
import {
  duplicateKey,
  effectiveDuplicateAction,
  effectiveHeatPath,
  effectiveSourceFace,
} from './buildStagingRows';
import type { ApplyResult, DuplicatePolicy, ImportSourceDescriptor, StagingRow } from './types';

/**
 * Where a row's source face belongs once the heat path is known — the same
 * resolution the preview and the row warning show, so the three agree.
 *
 * On a package-sourced path a stated pad IS the package outline (the Volume
 * Evaluation Tool's own comment says a coin-soldered part is joined across its
 * whole package base), so it fills the package rather than landing in
 * `source_L/W` where that path would never look at it.
 */
function geometryFaces(row: StagingRow, heatPath: HeatPathType) {
  const face = effectiveSourceFace(row);
  const readsPackage = GEOMETRY_RULES[heatPath].source === 'package';
  return {
    package_L_mm: readsPackage ? face.L : row.package_L_mm,
    package_W_mm: readsPackage ? face.W : row.package_W_mm,
    package_H_mm: row.package_H_mm,
    // On a package-sourced path the face has been promoted above, so keeping a
    // copy here would let the two disagree the moment one is edited.
    source_L_mm: readsPackage ? null : face.L,
    source_W_mm: readsPackage ? null : face.W,
  };
}

function specFromRow(row: StagingRow, materials: MaterialDefaults): ThermalSpec {
  // No heat path stated means it is inferred, which must not read as a decision.
  const heatPath = effectiveHeatPath(row);
  const faces = geometryFaces(row, heatPath);
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
    package_type: row.package_type,
    geometry: {
      ...emptyGeometry(),
      ...faces,
      // The Volume Evaluation Tool overloads one Thick column: it is the board
      // on a via path and the coin on a coin path. Coin thickness is one
      // decision for the whole design, so it belongs to the project (01 §4)
      // rather than to each component. The imported value is not thrown away —
      // `buildMetadata` keeps it so it can be read off and entered there.
      board_thickness_mm:
        GEOMETRY_RULES[heatPath].thickness === 'board' ? row.thickness_mm : null,
      // 04 §30 — legacy geometry semantics must be confirmed, not assumed. An
      // explicitly mapped Package_L is not legacy: it says what it is, so only
      // the overloaded columns raise the flag.
      needs_review: row.thickness_mm != null || row.source_L_mm != null || undefined,
    },
    heat_path: { type: heatPath, parameters: {} },
    heat_path_confirmed: row.heat_path != null,
    tim: {
      ...emptyTim(matchTimId(row.tim_name, materials)),
      // A stated bond line is a build measurement, so it overrides the
      // material's default for this component only.
      blt_mm:
        row.tim_blt_mm == null ? null : sourced(row.tim_blt_mm, 'Imported', { confidence: 'medium' }),
    },
  };
}

/** Keeps a TIM name the library could not match, so it is recoverable. */
function buildMetadata(
  row: StagingRow,
  materials: MaterialDefaults,
): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = { ...row.extra };
  if (row.tim_name && matchTimId(row.tim_name, materials) == null) {
    extra._unmatched_tim = row.tim_name;
  }
  // Only a board path has somewhere to put a thickness. A coin row's Thick is
  // the coin, which is a project constant now; a top-surface or bolted row
  // conducts through no thickness at all. Dropping either silently would lose a
  // measured number, so it is preserved here and shown on the component's
  // Source tab under "Preserved Source Fields".
  const heatPath = effectiveHeatPath(row);
  if (row.thickness_mm != null && GEOMETRY_RULES[heatPath].thickness !== 'board') {
    const key =
      GEOMETRY_RULES[heatPath].thickness === 'project_coin'
        ? '_imported_coin_thickness_mm'
        : '_imported_thickness_mm';
    extra[key] = row.thickness_mm;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
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
  /** The project's TIM library, which a row's material name is matched against. */
  materials: MaterialDefaults;
}

/**
 * A source names its TIM; the project owns the material. Matching is by name,
 * case-insensitively, and a name the library does not have resolves to NO TIM
 * rather than to a new library row — a spreadsheet typo must not quietly grow
 * the project's material list. The unmatched name survives in `metadata`, and
 * Screen 04 shows the component as having no TIM so it is visible.
 */
function matchTimId(name: string | null, materials: MaterialDefaults): string | null {
  if (!name) return null;
  const wanted = name.trim().toLowerCase();
  return materials.tim.find((material) => material.name.toLowerCase() === wanted)?.id ?? null;
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

export function applyImport({ existing, rows, sessionPolicy, source, materials }: ApplyOptions): {
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
      const spec = specFromRow(row, materials);

      const nextSpec: ThermalSpec =
        action === 'REPLACE'
          ? {
              ...spec,
              // A limit type an engineer already settled outranks a fresh guess.
              limit_type: target.thermal_spec.limit_type,
              limit_type_confirmed: target.thermal_spec.limit_type_confirmed,
              // Same for the heat path: an unstated one must not overwrite a
              // decision, so a settled path survives a Replace.
              heat_path: row.heat_path == null ? target.thermal_spec.heat_path : spec.heat_path,
              heat_path_confirmed: row.heat_path != null || target.thermal_spec.heat_path_confirmed,
              // A stated package replaces; an unstated one must not erase what
              // Screen 04 already resolved.
              package_type: spec.package_type ?? target.thermal_spec.package_type,
            }
          : {
              ...target.thermal_spec,
              limit_C: mergeSourced(spec.limit_C, target.thermal_spec.limit_C),
              r_jc_C_per_W: mergeSourced(spec.r_jc_C_per_W, target.thermal_spec.r_jc_C_per_W),
              package_type: spec.package_type ?? target.thermal_spec.package_type,
              geometry: {
                ...target.thermal_spec.geometry,
                package_L_mm: mergeNonEmpty(
                  spec.geometry.package_L_mm,
                  target.thermal_spec.geometry.package_L_mm,
                ),
                package_W_mm: mergeNonEmpty(
                  spec.geometry.package_W_mm,
                  target.thermal_spec.geometry.package_W_mm,
                ),
                package_H_mm: mergeNonEmpty(
                  spec.geometry.package_H_mm,
                  target.thermal_spec.geometry.package_H_mm,
                ),
                source_L_mm: mergeNonEmpty(
                  spec.geometry.source_L_mm,
                  target.thermal_spec.geometry.source_L_mm,
                ),
                source_W_mm: mergeNonEmpty(
                  spec.geometry.source_W_mm,
                  target.thermal_spec.geometry.source_W_mm,
                ),
                board_thickness_mm: mergeNonEmpty(
                  spec.geometry.board_thickness_mm,
                  target.thermal_spec.geometry.board_thickness_mm,
                ),
              },
              heat_path: row.heat_path == null ? target.thermal_spec.heat_path : spec.heat_path,
              heat_path_confirmed: row.heat_path != null || target.thermal_spec.heat_path_confirmed,
              tim: spec.tim.tim_id == null ? target.thermal_spec.tim : spec.tim,
            };

      const nextQty = row.qty ?? target.qty;
      const nextPower = row.power_W == null ? target.power_W : sourced(row.power_W, 'Imported');

      // 02 §24 / 04 §32 — did anything the solver depends on actually move?
      const before = [
        target.power_W.value,
        target.qty,
        target.thermal_spec.r_jc_C_per_W?.value ?? null,
        target.thermal_spec.limit_C?.value ?? null,
        target.thermal_spec.tim.tim_id,
        target.thermal_spec.heat_path.type,
      ];
      const after = [
        nextPower.value,
        nextQty,
        nextSpec.r_jc_C_per_W?.value ?? null,
        nextSpec.limit_C?.value ?? null,
        nextSpec.tim.tim_id,
        nextSpec.heat_path.type,
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
      thermal_spec: specFromRow(row, materials),
      // 02 §34 / 04 §40 — importing never creates graph topology or preferences.
      architecture_prep: emptyArchitecturePrep(),
      provenance: provenanceFor(source, row),
      external_mappings: emptyExternalMappings(),
      metadata: buildMetadata(row, materials),
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
