/**
 * Component record migration.
 *
 * Screen 04 widened the component model (04 §29): scalar numbers became
 * `SourcedValue`, board type and TIM moved into their own specs, geometry was
 * split out, and architecture prep plus external mapping hooks were added.
 *
 * Data written by earlier versions is still in browser storage, so every record
 * is upgraded on read. Nothing may assume a stored component already matches the
 * current shape — the loader is the single gate where that is guaranteed.
 */

import {
  emptyArchitecturePrep,
  emptyExternalMappings,
  emptyGeometry,
  inferHeatPath,
  inferLimitType,
  normalizeZoneKey,
  type Component,
  type ComponentCategory,
  type ComponentGeometry,
  type HeatPathType,
  type LimitType,
  type PackageType,
} from '@/domain/component';
import { sourced, unknownValue, type SourcedValue } from '@/domain/sourcedValue';
import { BUILTIN_TIM_IDS } from '@/domain/materials';
import type { DataSource } from '@/thermal/types';

type Raw = Record<string, unknown>;

const HEAT_PATH_TYPES_SET = new Set<HeatPathType>(['Coin', 'Board', 'TopSurface', 'DirectMetal']);

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Accepts either a bare number (old shape) or an existing SourcedValue.
 * A missing value stays null — never 0 (04 §11, AC-04-06).
 */
function toSourced(
  value: unknown,
  fallbackSource: DataSource = 'Imported',
): SourcedValue<number> | null {
  if (value == null) return null;
  if (isObject(value) && 'value' in value) {
    return {
      value: num(value.value),
      source: (value.source as DataSource) ?? fallbackSource,
      reference: value.reference as string | undefined,
      confidence: value.confidence as SourcedValue<number>['confidence'],
      updated_at: value.updated_at as string | undefined,
    };
  }
  const parsed = num(value);
  return parsed == null ? null : sourced(parsed, fallbackSource, { confidence: 'medium' });
}

function migrateGeometry(spec: Raw): ComponentGeometry {
  const existing = isObject(spec.geometry) ? spec.geometry : {};
  const geometry: ComponentGeometry = { ...emptyGeometry() };

  for (const key of Object.keys(geometry) as Array<keyof ComponentGeometry>) {
    const value = existing[key];
    if (typeof value === 'number' || value === null) {
      (geometry[key] as number | null) = value;
    }
  }
  if (typeof existing.needs_review === 'boolean') geometry.needs_review = existing.needs_review;

  // The source face used to be stored twice: a `contact_*` pair and a `pad_*`
  // pair. `contactAreaMm2` preferred contact, so that order is preserved here
  // and no stored component changes area across the rename. Flat pre-04 fields
  // sat directly on thermal_spec, which is the last place to look.
  geometry.source_L_mm =
    geometry.source_L_mm ??
    num(existing.contact_L_mm) ??
    num(existing.pad_L_mm) ??
    num(spec.pad_L_mm);
  geometry.source_W_mm =
    geometry.source_W_mm ??
    num(existing.contact_W_mm) ??
    num(existing.pad_W_mm) ??
    num(spec.pad_W_mm);
  geometry.board_thickness_mm = geometry.board_thickness_mm ?? num(spec.thickness_mm);

  // 04 §30 — legacy geometry semantics must be confirmed, not assumed.
  if (spec.thickness_mm != null || spec.pad_L_mm != null) {
    geometry.needs_review = true;
  }

  // `legacy_height_mm`, `custom_thickness_mm`, the two `custom_*_area_mm2`
  // overrides and `coin_thickness_mm` are all gone — the first two long since,
  // the areas because a face is described by its L and W, and coin thickness
  // because it is one decision for the whole design and now lives in the
  // project's materials (01 §4). The loop above only copies keys the current
  // shape declares, so every one of them is dropped on read.
  return geometry;
}

/**
 * Board types collapse onto heat paths.
 *
 * `None` becomes TopSurface, not "no path": in the Volume Evaluation Tool those
 * rows still conduct, straight from the package top into the TIM. `PCB Only`
 * and `Thermal Via` were two names for heat going down through the board.
 * `Custom` was never a path, so it infers and stays unconfirmed.
 */
const HEAT_PATH_FOR_BOARD_TYPE: Record<string, HeatPathType> = {
  'Copper Coin': 'Coin',
  'Thermal Via': 'Board',
  'PCB Only': 'Board',
  None: 'TopSurface',
  'Direct Metal': 'DirectMetal',
};

function migrateHeatPath(
  spec: Raw,
  category: ComponentCategory,
): { heat_path: Component['thermal_spec']['heat_path']; heat_path_confirmed: boolean } {
  const raw = isObject(spec.heat_path)
    ? spec.heat_path
    : isObject(spec.board_path)
      ? spec.board_path
      : null;
  const storedType = (raw?.type ?? spec.board_type) as string | undefined;
  const parameters =
    raw && isObject(raw.parameters)
      ? (raw.parameters as Component['thermal_spec']['heat_path']['parameters'])
      : {};

  const known = HEAT_PATH_TYPES_SET.has(storedType as HeatPathType)
    ? (storedType as HeatPathType)
    : storedType
      ? HEAT_PATH_FOR_BOARD_TYPE[storedType]
      : undefined;

  const confirmed =
    typeof spec.heat_path_confirmed === 'boolean' ? spec.heat_path_confirmed : known != null;

  return {
    heat_path: { type: known ?? inferHeatPath(category), parameters },
    heat_path_confirmed: confirmed && known != null,
  };
}

/**
 * Legacy limit types collapse onto Tj / Tc.
 *
 * `Ts` named the package exterior, which `Tc` already covers — but calling a
 * surface limit a case limit is a reinterpretation, so it lands unconfirmed.
 * `Custom` and `Unknown` never were limit types; they meant nobody had decided,
 * which is exactly what `limit_type_confirmed: false` records.
 */
function migrateLimitType(
  raw: unknown,
  category: ComponentCategory,
  name: string,
): { limit_type: LimitType; limit_type_confirmed: boolean } {
  if (raw === 'Tj' || raw === 'Tc') return { limit_type: raw, limit_type_confirmed: true };
  if (raw === 'Ts') return { limit_type: 'Tc', limit_type_confirmed: false };
  return { limit_type: inferLimitType(category, name), limit_type_confirmed: false };
}

/**
 * A component used to carry its own TIM: a type from a fixed enum plus its own
 * k and thickness. Materials now live in the project's library (01 §4), so the
 * type becomes a reference to one of the shipped rows.
 *
 * `None` and `Custom` both become "no TIM": one meant it, and the other meant
 * nobody had decided, which is the same thing to a resistance calculation.
 *
 * A stored thickness becomes the component's bond-line override, since a build
 * measurement is exactly what that field is for. A stored `k` has nowhere to go
 * — k is the material's now — so rather than drop it silently it is preserved
 * in `metadata` and `validateComponent` asks for it to be folded into a
 * project material.
 */
const LEGACY_TIM_ID: Record<string, string> = {
  Grease: BUILTIN_TIM_IDS.grease,
  Pad: BUILTIN_TIM_IDS.pad,
  Pad2: BUILTIN_TIM_IDS.pad2,
  Putty: BUILTIN_TIM_IDS.putty,
  PCM: BUILTIN_TIM_IDS.pcm,
  'Gap Filler': BUILTIN_TIM_IDS.gapFiller,
  Solder: BUILTIN_TIM_IDS.solder,
};

function migrateTim(timRaw: Raw | null, specRaw: Raw): Component['thermal_spec']['tim'] {
  // Already in the current shape.
  if (timRaw && 'tim_id' in timRaw) {
    return {
      tim_id: typeof timRaw.tim_id === 'string' ? timRaw.tim_id : null,
      blt_mm: toSourced(timRaw.blt_mm),
      contact_area_mode: timRaw.contact_area_mode === 'custom' ? 'custom' : 'derived',
    };
  }

  const legacyType = (timRaw?.type ?? specRaw.tim_type) as string | undefined;
  return {
    tim_id: legacyType ? (LEGACY_TIM_ID[legacyType] ?? null) : null,
    blt_mm: toSourced(timRaw?.thickness_mm),
    contact_area_mode: timRaw?.contact_area_mode === 'custom' ? 'custom' : 'derived',
  };
}

/** A per-component k the library cannot hold; kept so it is never lost silently. */
function legacyTimK(timRaw: Raw | null): number | null {
  if (!timRaw || 'tim_id' in timRaw) return null;
  return toSourced(timRaw.k_W_mK)?.value ?? null;
}

export function migrateComponent(raw: unknown, index: number): Component | null {
  if (!isObject(raw)) return null;

  const name = typeof raw.name === 'string' ? raw.name : String(raw.component ?? '');
  if (!name && !raw.id) return null;

  const specRaw = isObject(raw.thermal_spec) ? raw.thermal_spec : {};

  const timRaw = isObject(specRaw.tim) ? specRaw.tim : null;

  const architecture = isObject(raw.architecture_prep) ? raw.architecture_prep : {};
  const category = (raw.category as ComponentCategory) ?? 'Other';
  const limit =
    typeof specRaw.limit_type_confirmed === 'boolean'
      ? {
          limit_type: (specRaw.limit_type === 'Tc' ? 'Tc' : 'Tj') as LimitType,
          limit_type_confirmed: specRaw.limit_type_confirmed,
        }
      : migrateLimitType(specRaw.limit_type, category, name);
  const heat = migrateHeatPath(specRaw, category);

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `CMP_MIGRATED_${index + 1}`,
    name,
    category,
    // Pre-04 records had no enabled flag; they were all active.
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    qty: num(raw.qty) ?? 1,
    power_W: toSourced(raw.power_W) ?? unknownValue<number>('Imported'),

    thermal_spec: {
      ...limit,
      limit_C: toSourced(specRaw.limit_C),
      r_jc_C_per_W: toSourced(specRaw.r_jc_C_per_W),
      package_type: (specRaw.package_type as PackageType) ?? null,
      geometry: migrateGeometry(specRaw),
      ...heat,
      // Built field by field rather than spread, so a dropped field (such as the
      // never-solved `compression_pct`) cannot ride back in from stored data.
      tim: migrateTim(timRaw, specRaw),
    },

    architecture_prep: {
      ...emptyArchitecturePrep(),
      ...architecture,
      // Zones became keys when the vocabulary started coming from the project's
      // base structure; anything stored as a display name is mapped across.
      preferred_base_zone: normalizeZoneKey(architecture.preferred_base_zone),
    },
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: new Date().toISOString(),
      ...(isObject(raw.provenance) ? (raw.provenance as Partial<Component['provenance']>) : {}),
    },
    external_mappings: isObject(raw.external_mappings)
      ? { ...emptyExternalMappings(), ...raw.external_mappings }
      : emptyExternalMappings(),

    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    metadata: withLegacyTimK(isObject(raw.metadata) ? raw.metadata : undefined, timRaw),
  };
}

function withLegacyTimK(
  metadata: Raw | undefined,
  timRaw: Raw | null,
): Record<string, unknown> | undefined {
  const k = legacyTimK(timRaw);
  if (k == null) return metadata;
  return { ...(metadata ?? {}), _legacy_tim_k_W_mK: k };
}

export function migrateComponents(raw: unknown): Component[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      try {
        return migrateComponent(entry, index);
      } catch {
        // One malformed record must not take the whole project down.
        return null;
      }
    })
    .filter((component): component is Component => component !== null);
}
