/**
 * Project-level material and process defaults.
 *
 * These are the constants a design shares across every component: what copper
 * conducts at, how well a via array really works, what the solder preform is,
 * how thick a grease line ends up. The 5G RRU Quick Volume Evaluation Tool
 * keeps the same set as global parameters, and for the same reason — they are
 * properties of the DESIGN, not of any one part.
 *
 * Two rules shape this file.
 *
 * 1. Almost everything here ships with a value, marked `Assumed`. A material
 *    constant is knowable: copper is 380 W/m·K whether or not anyone has opened
 *    Screen 01. Shipping the number means Screen 04 always has something to
 *    inherit, so a component is never blocked waiting on a screen further along
 *    the flow. Touch a field and it becomes `Manual`.
 *
 * 2. The coin size ships EMPTY, and that is deliberate. It is a mechanical
 *    decision that differs per design, so there is no defensible default — and
 *    a fabricated one would silently change the margin of every PA in the
 *    project without anybody being told. Unknown stays null and surfaces as
 *    N/A, the same rule the rest of the tool follows.
 */

import { sourced, type SourcedValue } from './sourcedValue';
import type { TimSpec } from './component';

/**
 * One TIM the project uses.
 *
 * A project works with a handful of interface materials, not a fixed
 * vocabulary, so this is a LIST the engineer edits rather than an enum. Two
 * consequences follow from that, and both matter:
 *
 *  - Components reference `id`, never `name`. Renaming Grease to the part
 *    number actually on the BOM must not orphan every component that uses it.
 *  - `k` belongs here because it is a property of the material. `blt_mm` is the
 *    project's DEFAULT bond line, not a property: the same grease compresses to
 *    a different thickness under screws than under a clip, so a component may
 *    override the thickness — and only the thickness.
 */
export interface TimMaterial {
  /** Stable. Components reference this, so it must survive a rename. */
  id: string;
  name: string;
  k_W_mK: SourcedValue<number>;
  /** Default bond line thickness — what it compresses to, not as supplied. */
  blt_mm: SourcedValue<number>;
}

/** Ids of the materials a new project starts with. */
export const BUILTIN_TIM_IDS = {
  grease: 'TIM_GREASE',
  pad: 'TIM_PAD',
  pad2: 'TIM_PAD2',
  putty: 'TIM_PUTTY',
  pcm: 'TIM_PCM',
  gapFiller: 'TIM_GAP_FILLER',
  solder: 'TIM_SOLDER',
} as const;

export interface MaterialDefaults {
  /** The project's TIM library. Order is the order Screen 01 shows. */
  tim: TimMaterial[];

  /** Copper coin bulk conductivity. */
  copper_k_W_mK: SourcedValue<number>;

  /** Through-plane effective conductivity of a via array, and its process derate. */
  via_effective_k_W_mK: SourcedValue<number>;
  via_efficiency: SourcedValue<number>;

  /** Solder preform between a package and its coin. */
  solder_k_W_mK: SourcedValue<number>;
  solder_thickness_mm: SourcedValue<number>;
  /** Fraction of the joint that is actually solder rather than void. */
  solder_voiding: SourcedValue<number>;

  /**
   * The coin's heatsink-side face. Null by design — see the note at the top.
   * The component-level `spread_L/W_mm` overrides it for a part that differs.
   */
  coin_L_mm: SourcedValue<number> | null;
  coin_W_mm: SourcedValue<number> | null;
  /**
   * How thick the coin is. A mechanical decision like its footprint, shared by
   * every coin in the design, so it lives here rather than on each component —
   * and like the footprint it ships empty, because there is no coin thickness
   * that is right for an unknown build.
   */
  coin_thickness_mm: SourcedValue<number> | null;
}

const assumed = (value: number) => sourced(value, 'Assumed', { confidence: 'medium' });

/** Typical values, all `Assumed` — see rule 1 at the top of this file. */
export function defaultMaterials(): MaterialDefaults {
  return {
    tim: [
      { id: BUILTIN_TIM_IDS.grease, name: 'Grease', k_W_mK: assumed(3.0), blt_mm: assumed(0.05) },
      { id: BUILTIN_TIM_IDS.pad, name: 'Pad', k_W_mK: assumed(3.0), blt_mm: assumed(0.5) },
      { id: BUILTIN_TIM_IDS.pad2, name: 'Pad2', k_W_mK: assumed(5.0), blt_mm: assumed(1.0) },
      { id: BUILTIN_TIM_IDS.putty, name: 'Putty', k_W_mK: assumed(3.5), blt_mm: assumed(0.3) },
      { id: BUILTIN_TIM_IDS.pcm, name: 'PCM', k_W_mK: assumed(4.0), blt_mm: assumed(0.1) },
      {
        id: BUILTIN_TIM_IDS.gapFiller,
        name: 'Gap Filler',
        k_W_mK: assumed(3.0),
        blt_mm: assumed(1.0),
      },
      { id: BUILTIN_TIM_IDS.solder, name: 'Solder', k_W_mK: assumed(58), blt_mm: assumed(0.3) },
    ],
    copper_k_W_mK: assumed(380),
    via_effective_k_W_mK: assumed(30),
    via_efficiency: assumed(0.9),
    solder_k_W_mK: assumed(58),
    solder_thickness_mm: assumed(0.3),
    solder_voiding: assumed(0.75),
    coin_L_mm: null,
    coin_W_mm: null,
    coin_thickness_mm: null,
  };
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Accepts a bare number (hand-edited file) or a stored SourcedValue. */
function readSourced(raw: unknown, fallback: SourcedValue<number>): SourcedValue<number> {
  if (typeof raw === 'number' && Number.isFinite(raw)) return sourced(raw, 'Manual');
  if (isObject(raw) && 'value' in raw) {
    const value = raw.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return {
      value,
      source: (raw.source as SourcedValue<number>['source']) ?? 'Manual',
      reference: raw.reference as string | undefined,
      confidence: raw.confidence as SourcedValue<number>['confidence'],
      updated_at: raw.updated_at as string | undefined,
    };
  }
  return fallback;
}

/** Same, but an absent value stays absent — used only for the coin size. */
function readOptional(raw: unknown): SourcedValue<number> | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return sourced(raw, 'Manual');
  if (isObject(raw) && 'value' in raw) {
    const value = raw.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return readSourced(raw, sourced(value, 'Manual'));
  }
  return null;
}

/**
 * The TIM library, from a list OR from the keyed object earlier builds wrote.
 *
 * The keyed shape is read by name, which is exactly why the shape changed: an
 * engineer renaming a material would have orphaned every component using it.
 * Reading it here converts those keys into ids once, on open.
 *
 * An empty library is legal — an engineer may genuinely have deleted every
 * material — so an explicit empty list stays empty. Only a missing or unusable
 * `tim` falls back to the shipped set.
 */
function normalizeTimLibrary(raw: unknown, fallback: TimMaterial[]): TimMaterial[] {
  if (Array.isArray(raw)) {
    const seen = new Set<string>();
    const list: TimMaterial[] = [];
    raw.forEach((entry, index) => {
      if (!isObject(entry)) return;
      const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null;
      const id =
        typeof entry.id === 'string' && entry.id.trim()
          ? entry.id.trim()
          : `TIM_${index + 1}_${(name ?? 'MATERIAL').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
      // A duplicate id would make one of the two unreachable from a component.
      if (seen.has(id)) return;
      seen.add(id);
      list.push({
        id,
        name: name ?? id,
        k_W_mK: readSourced(entry.k_W_mK, sourced(1, 'Assumed', { confidence: 'low' })),
        blt_mm: readSourced(entry.blt_mm, sourced(0.1, 'Assumed', { confidence: 'low' })),
      });
    });
    return list;
  }

  if (isObject(raw)) {
    const byName = new Map(fallback.map((material) => [material.name, material]));
    const list: TimMaterial[] = [];
    for (const [name, entry] of Object.entries(raw)) {
      if (!isObject(entry)) continue;
      const builtin = byName.get(name);
      list.push({
        id: builtin?.id ?? `TIM_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
        name,
        k_W_mK: readSourced(entry.k_W_mK, builtin?.k_W_mK ?? sourced(1, 'Assumed')),
        blt_mm: readSourced(entry.blt_mm, builtin?.blt_mm ?? sourced(0.1, 'Assumed')),
      });
    }
    if (list.length > 0) return list;
  }

  return fallback;
}

/**
 * A project file may predate this section, be hand-edited, or come from a build
 * that shipped different defaults. Every field falls back to the factory value
 * rather than to null, so a partial record still yields a usable set.
 */
export function normalizeMaterials(raw: unknown): MaterialDefaults {
  const base = defaultMaterials();
  if (!isObject(raw)) return base;

  const tim = normalizeTimLibrary(raw.tim, base.tim);

  return {
    tim,
    copper_k_W_mK: readSourced(raw.copper_k_W_mK, base.copper_k_W_mK),
    via_effective_k_W_mK: readSourced(raw.via_effective_k_W_mK, base.via_effective_k_W_mK),
    via_efficiency: readSourced(raw.via_efficiency, base.via_efficiency),
    solder_k_W_mK: readSourced(raw.solder_k_W_mK, base.solder_k_W_mK),
    solder_thickness_mm: readSourced(raw.solder_thickness_mm, base.solder_thickness_mm),
    solder_voiding: readSourced(raw.solder_voiding, base.solder_voiding),
    coin_L_mm: readOptional(raw.coin_L_mm),
    coin_W_mm: readOptional(raw.coin_W_mm),
    coin_thickness_mm: readOptional(raw.coin_thickness_mm),
  };
}

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

/** The project's coin footprint, mm² — null until both dimensions are stated. */
export function coinAreaMm2(materials: MaterialDefaults): number | null {
  const L = materials.coin_L_mm?.value;
  const W = materials.coin_W_mm?.value;
  if (L == null || W == null) return null;
  return L * W;
}

export interface ResolvedTim {
  k_W_mK: number | null;
  thickness_mm: number | null;
  /** The material the component points at, or null when it points at nothing. */
  material: TimMaterial | null;
  /** True when the BLT came from the material rather than from the component. */
  inherited: boolean;
  /**
   * The component references a material this project no longer has. Distinct
   * from "no TIM": one is a decision, the other is a dangling reference that an
   * engineer has to resolve, so the UI must be able to tell them apart.
   */
  missing: boolean;
}

export function findTimMaterial(
  materials: MaterialDefaults,
  id: string | null,
): TimMaterial | null {
  if (!id) return null;
  return materials.tim.find((material) => material.id === id) ?? null;
}

/**
 * The TIM properties an edge should actually use.
 *
 * `k` always comes from the material — that is the point of the library, and
 * why a component can no longer define one of its own. The BLT comes from the
 * component when it states one, because bond line is a build outcome rather
 * than a material property: the same grease ends up thinner under screws than
 * under a clip.
 *
 * A component with no TIM, or one pointing at a material that has been deleted,
 * resolves to nothing rather than borrowing another material's numbers, and the
 * edge stays unresolved.
 */
export function resolveTim(tim: TimSpec, materials: MaterialDefaults): ResolvedTim {
  const material = findTimMaterial(materials, tim.tim_id);
  const missing = tim.tim_id != null && material == null;

  if (!material) {
    return { k_W_mK: null, thickness_mm: null, material: null, inherited: false, missing };
  }

  const ownBlt = tim.blt_mm?.value ?? null;
  return {
    k_W_mK: material.k_W_mK.value,
    thickness_mm: ownBlt ?? material.blt_mm.value,
    material,
    inherited: ownBlt == null,
    missing: false,
  };
}

/** How many enabled-or-not components point at a material — the delete guard. */
export function timUsageCount(
  components: Array<{ thermal_spec: { tim: TimSpec } }>,
  id: string,
): number {
  return components.filter((component) => component.thermal_spec.tim.tim_id === id).length;
}

/** A new material gets an id nothing else in the library is using. */
export function nextTimId(materials: MaterialDefaults): string {
  const taken = new Set(materials.tim.map((material) => material.id));
  let index = materials.tim.length + 1;
  while (taken.has(`TIM_CUSTOM_${index}`)) index++;
  return `TIM_CUSTOM_${index}`;
}

/** Numeric labels for the non-TIM rows, so the panel and its tests agree. */
export const PROCESS_FIELDS = [
  ['copper_k_W_mK', 'Copper k', '銅導熱係數', 'W/m·K'],
  ['via_effective_k_W_mK', 'Via effective k', '導熱孔等效 k', 'W/m·K'],
  ['via_efficiency', 'Via efficiency', '導熱孔製程係數', '—'],
  ['solder_k_W_mK', 'Solder k', '焊料導熱係數', 'W/m·K'],
  ['solder_thickness_mm', 'Solder thickness', '焊料厚度', 'mm'],
  ['solder_voiding', 'Solder effective area', '焊料有效面積率', '—'],
] as const;

export type ProcessField = (typeof PROCESS_FIELDS)[number][0];

/** How many entries still carry the shipped value rather than a stated one. */
export function assumedCount(materials: MaterialDefaults): number {
  let count = 0;
  for (const material of materials.tim) {
    if (material.k_W_mK.source === 'Assumed') count++;
    if (material.blt_mm.source === 'Assumed') count++;
  }
  for (const [field] of PROCESS_FIELDS) {
    if (materials[field].source === 'Assumed') count++;
  }
  return count;
}
