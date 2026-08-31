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
  emptyMount,
  inferHeatPath,
  inferLimitType,
  migrateHeatPathType,
  mountAttachmentIsFixed,
  normalizeArchitectureTemplate,
  normalizeMountType,
  DISSOLVED_TEMPLATE_MOUNTS,
  HEAT_PATH_TYPES,
  TEMPLATE_FOR_HEAT_PATH,
  LEGACY_HEAT_PATHS,
  MODULE_SURFACE_EQUIVALENT_PARAMETERS,
  normalizeModuleReferenceLocation,
  normalizeZoneKey,
  type Component,
  type ComponentCategory,
  type ComponentGeometry,
  type HeatPathType,
  type LimitType,
  type MountAttachment,
  type MountSpec,
  type MountType,
  type PackageType,
  MOUNT_ATTACHMENTS,
} from '@/domain/component';
import { sourced, unknownValue, type SourcedValue } from '@/domain/sourcedValue';
import { BUILTIN_TIM_IDS, LEGACY_SOLDER_TIM_ID } from '@/domain/materials';
import type { DataSource } from '@/thermal/types';

type Raw = Record<string, unknown>;

const HEAT_PATH_TYPES_SET = new Set<HeatPathType>(HEAT_PATH_TYPES);
const LIMIT_TYPES_SET = new Set<LimitType>(['Tj', 'Tc', 'Tb', 'Ts']);

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
      ? (migrateHeatPathType(storedType) ?? HEAT_PATH_FOR_BOARD_TYPE[storedType])
      : undefined;

  const confirmed =
    typeof spec.heat_path_confirmed === 'boolean' ? spec.heat_path_confirmed : known != null;

  // A ModuleSurface component becomes DirectMetal, and needs the two settings
  // that make DirectMetal behave the way ModuleSurface always did: the source
  // on the face rather than behind an Rjc, and the contact area following the
  // package outline. Its own stored parameters still win — it had none of
  // these keys, but a hand-edited file might.
  const migrated =
    storedType != null && LEGACY_HEAT_PATHS[storedType] != null
      ? { ...MODULE_SURFACE_EQUIVALENT_PARAMETERS, ...parameters }
      : parameters;

  return {
    heat_path: {
      type: known ?? inferHeatPath(category),
      parameters: withBodySourceForZeroRjc(migrated, spec),
    },
    heat_path_confirmed: confirmed && known != null,
  };
}

/**
 * Reads `Rjc = 0` as "this part is one isothermal body".
 *
 * Before the source model applied to every heat path, that was the only way to
 * say it: a circulator whose surface temperature, mounting-pad temperature and
 * body temperature are the same number got `Rjc = 0` so the junction step would
 * vanish. It never vanished — it became a zero-resistance edge, which has
 * infinite conductance and cannot appear in `[G][T] = [P]`, so Screen 07
 * refused to solve the scenario at all.
 *
 * The stored 0 is left in place rather than cleared. It is no longer read while
 * the part is body-sourced, and an engineer who switches back to a junction is
 * better served seeing the number they typed — with Screen 04 now reporting it
 * as an error — than finding the field silently emptied.
 *
 * Only applied when nothing was stated. A component that already carries a
 * `source_model` has had the question answered, and answering it again from a
 * leftover 0 would override a deliberate choice.
 */
function withBodySourceForZeroRjc(
  parameters: Component['thermal_spec']['heat_path']['parameters'],
  spec: Raw,
): Component['thermal_spec']['heat_path']['parameters'] {
  if (parameters.source_model != null) return parameters;
  const rjc = toSourced(spec.r_jc_C_per_W);
  if (rjc?.value !== 0) return parameters;
  return { ...parameters, source_model: 'SurfaceBodyBased' };
}

/**
 * Tj, Tc, Tb and Ts are distinct engineering references. `Custom` and
 * `Unknown` never were limit types; they meant nobody had decided, which is
 * exactly what `limit_type_confirmed: false` records.
 */
function migrateLimitType(
  raw: unknown,
  category: ComponentCategory,
  name: string,
): { limit_type: LimitType; limit_type_confirmed: boolean } {
  if (LIMIT_TYPES_SET.has(raw as LimitType)) {
    return { limit_type: raw as LimitType, limit_type_confirmed: true };
  }
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
  // `Solder` is deliberately absent. The library row it pointed at is gone —
  // Screen 01's standalone solder pair is the one copy now — so old text that
  // says "Solder" resolves to nothing and Screen 04 asks for a material rather
  // than pointing the component at an id the library does not have.
};

/**
 * A component whose interface material was the removed `Solder` row.
 *
 * The row is gone, so the reference cannot stand: `resolveTim` would report the
 * material missing anyway. The id is kept in `metadata` rather than dropped, so
 * the engineer can see what it used to say — and Screen 01 takes new rows, so
 * a part that really is soldered down gets its own.
 */
function withoutRemovedSolder(tim: Component['thermal_spec']['tim']): {
  tim: Component['thermal_spec']['tim'];
  removed: boolean;
} {
  if (tim.tim_id !== LEGACY_SOLDER_TIM_ID) return { tim, removed: false };
  return { tim: { ...tim, tim_id: null }, removed: true };
}

function migrateTim(timRaw: Raw | null, specRaw: Raw): Component['thermal_spec']['tim'] {
  // Already in the current shape.
  if (timRaw && 'tim_id' in timRaw) {
    return {
      tim_id: typeof timRaw.tim_id === 'string' ? timRaw.tim_id : null,
      blt_mm: toSourced(timRaw.blt_mm),
      measured_rth_C_per_W: toSourced(timRaw.measured_rth_C_per_W),
      contact_area_mode: timRaw.contact_area_mode === 'custom' ? 'custom' : 'derived',
    };
  }

  const legacyType = (timRaw?.type ?? specRaw.tim_type) as string | undefined;
  return {
    tim_id: legacyType ? (LEGACY_TIM_ID[legacyType] ?? null) : null,
    blt_mm: toSourced(timRaw?.thickness_mm),
    measured_rth_C_per_W: null,
    contact_area_mode: timRaw?.contact_area_mode === 'custom' ? 'custom' : 'derived',
  };
}

/** A per-component k the library cannot hold; kept so it is never lost silently. */
function legacyTimK(timRaw: Raw | null): number | null {
  if (!timRaw || 'tim_id' in timRaw) return null;
  return toSourced(timRaw.k_W_mK)?.value ?? null;
}

/**
 * How the part reaches the shared structure (04 §33).
 *
 * Every record written before the mount axis existed has no `mount` key, and
 * every one of them was built flat on the base — so `Direct` is the honest
 * reading of their silence, not a guess. An unrecognised type falls back the
 * same way rather than throwing the record away.
 *
 * Dimensions stay `null` when absent. A boss whose height nobody has stated
 * must draw as an unresolved edge, not as a zero-height boss (00 Rule 6).
 */
function migrateMount(spec: Raw, dissolved: MountType | undefined): MountSpec {
  const raw = isObject(spec.mount) ? spec.mount : {};
  // `HeatPipeOnly` became `EmbeddedHeatPipe` when its circuit was corrected
  // from series to parallel — a bare pipe with nothing holding it is not a
  // structure anyone builds.
  const stored = normalizeMountType(raw.type) ?? 'Direct';
  /*
   * A component that named `BARE_DIE` or `SMALL_BASE_HEAT_PIPE` was describing
   * a heat path AND a mount under one name. It keeps the mount that name
   * implied — unless it already has one of its own, because a choice made in
   * Screen 04 after the split is the engineer speaking more recently than the
   * template they picked before it.
   */
  const type = stored === 'Direct' && dissolved != null ? dissolved : stored;
  const base = emptyMount(type);
  return {
    ...base,
    contact_L_mm: num(raw.contact_L_mm),
    contact_W_mm: num(raw.contact_W_mm),
    // Absent means one pipe, so a width stored before the count existed keeps
    // meaning exactly the copper it always meant.
    heat_pipe_count: num(raw.heat_pipe_count),
    height_mm: num(raw.height_mm),
    heat_pipe_R_C_per_W: num(raw.heat_pipe_R_C_per_W),
    // Written after the mount axis shipped. A record from before says nothing
    // about them, and `emptyMount` already holds what that silence meant: a
    // boss milled out of the base, in the base's own metal, with no joint.
    // A vapour chamber is never milled out of the heat sink, so `emptyMount`
    // has the last word for it whatever an older or hand-edited record says.
    attachment:
      mountAttachmentIsFixed(type) || !MOUNT_ATTACHMENTS.includes(raw.attachment as MountAttachment)
        ? base.attachment
        : (raw.attachment as MountAttachment),
    block_k_W_mK: num(raw.block_k_W_mK),
    joint_tim_id: typeof raw.joint_tim_id === 'string' ? raw.joint_tim_id : null,
    joint_blt_mm: num(raw.joint_blt_mm),
  };
}

export function migrateComponent(raw: unknown, index: number): Component | null {
  if (!isObject(raw)) return null;

  const name = typeof raw.name === 'string' ? raw.name : String(raw.component ?? '');
  if (!name && !raw.id) return null;

  const specRaw = isObject(raw.thermal_spec) ? raw.thermal_spec : {};

  const timRaw = isObject(specRaw.tim) ? specRaw.tim : null;

  const architecture = isObject(raw.architecture_prep) ? raw.architecture_prep : {};
  const category = (raw.category as ComponentCategory) ?? 'Other';
  const migratedLimit = migrateLimitType(specRaw.limit_type, category, name);
  const limit =
    typeof specRaw.limit_type_confirmed === 'boolean'
      ? {
          limit_type: LIMIT_TYPES_SET.has(specRaw.limit_type as LimitType)
            ? (specRaw.limit_type as LimitType)
            : migratedLimit.limit_type,
          limit_type_confirmed:
            specRaw.limit_type_confirmed && LIMIT_TYPES_SET.has(specRaw.limit_type as LimitType),
        }
      : migratedLimit;
  const heat = migrateHeatPath(specRaw, category);
  const migratedTim = withoutRemovedSolder(migrateTim(timRaw, specRaw));
  /*
   * A dissolved template is not mapped to a fixed replacement: the component's
   * own heat path already says which chain it wants, and that is a better
   * answer than anything this table could guess. The template only contributes
   * the mount it used to imply.
   */
  const dissolved = DISSOLVED_TEMPLATE_MOUNTS[String(architecture.template_preference)];
  const templatePreference = dissolved
    ? TEMPLATE_FOR_HEAT_PATH[heat.heat_path.type]
    : normalizeArchitectureTemplate(architecture.template_preference);

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
      limit_reference_note: normalizeModuleReferenceLocation(specRaw.limit_reference_note) ?? '',
      r_jc_C_per_W: toSourced(specRaw.r_jc_C_per_W),
      package_type: (specRaw.package_type as PackageType) ?? null,
      geometry: migrateGeometry(specRaw),
      ...heat,
      mount: migrateMount(specRaw, dissolved),
      // Built field by field rather than spread, so a dropped field (such as the
      // never-solved `compression_pct`) cannot ride back in from stored data.
      tim: migratedTim.tim,
    },

    architecture_prep: {
      ...emptyArchitecturePrep(),
      ...architecture,
      // Zones became keys when the vocabulary started coming from the project's
      // base structure; anything stored as a display name is mapped across.
      preferred_base_zone: normalizeZoneKey(architecture.preferred_base_zone),
      // A preference naming a template the registry no longer has makes the
      // component UNBUILDABLE, and Generate skips it in silence. Anything not
      // in the registry is mapped onto its replacement or back to UNASSIGNED.
      template_preference: templatePreference,
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
    metadata: withLegacyTimK(
      migratedTim.removed
        ? { ...(isObject(raw.metadata) ? raw.metadata : {}), _removed_tim_id: LEGACY_SOLDER_TIM_ID }
        : isObject(raw.metadata)
          ? raw.metadata
          : undefined,
      timRaw,
    ),
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
