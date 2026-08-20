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
import type { TimSpec, TimType } from './component';

/** TIM types that name an actual material, so have properties to look up. */
export const TIM_MATERIAL_TYPES = [
  'Grease',
  'Pad',
  'Pad2',
  'Putty',
  'PCM',
  'Gap Filler',
  'Solder',
] as const;
export type TimMaterialType = (typeof TIM_MATERIAL_TYPES)[number];

export function isTimMaterialType(type: TimType): type is TimMaterialType {
  return (TIM_MATERIAL_TYPES as readonly string[]).includes(type);
}

export interface TimMaterial {
  k_W_mK: SourcedValue<number>;
  /** Bond line thickness — what the TIM compresses to in the build, not as supplied. */
  blt_mm: SourcedValue<number>;
}

export interface MaterialDefaults {
  tim: Record<TimMaterialType, TimMaterial>;

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
}

const assumed = (value: number) => sourced(value, 'Assumed', { confidence: 'medium' });

/** Typical values, all `Assumed` — see rule 1 at the top of this file. */
export function defaultMaterials(): MaterialDefaults {
  return {
    tim: {
      Grease: { k_W_mK: assumed(3.0), blt_mm: assumed(0.05) },
      Pad: { k_W_mK: assumed(3.0), blt_mm: assumed(0.5) },
      Pad2: { k_W_mK: assumed(5.0), blt_mm: assumed(1.0) },
      Putty: { k_W_mK: assumed(3.5), blt_mm: assumed(0.3) },
      PCM: { k_W_mK: assumed(4.0), blt_mm: assumed(0.1) },
      'Gap Filler': { k_W_mK: assumed(3.0), blt_mm: assumed(1.0) },
      Solder: { k_W_mK: assumed(58), blt_mm: assumed(0.3) },
    },
    copper_k_W_mK: assumed(380),
    via_effective_k_W_mK: assumed(30),
    via_efficiency: assumed(0.9),
    solder_k_W_mK: assumed(58),
    solder_thickness_mm: assumed(0.3),
    solder_voiding: assumed(0.75),
    coin_L_mm: null,
    coin_W_mm: null,
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
 * A project file may predate this section, be hand-edited, or come from a build
 * that shipped different defaults. Every field falls back to the factory value
 * rather than to null, so a partial record still yields a usable set.
 */
export function normalizeMaterials(raw: unknown): MaterialDefaults {
  const base = defaultMaterials();
  if (!isObject(raw)) return base;

  const timRaw = isObject(raw.tim) ? raw.tim : {};
  const tim = { ...base.tim };
  for (const type of TIM_MATERIAL_TYPES) {
    const entry = isObject(timRaw[type]) ? (timRaw[type] as Record<string, unknown>) : {};
    tim[type] = {
      k_W_mK: readSourced(entry.k_W_mK, base.tim[type].k_W_mK),
      blt_mm: readSourced(entry.blt_mm, base.tim[type].blt_mm),
    };
  }

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
  /** True when the numbers came from the project rather than the component. */
  inherited: boolean;
}

/**
 * The TIM properties an edge should actually use.
 *
 * `None` conducts nothing to look up, and `Custom` means the engineer has not
 * said what it is — neither may borrow another material's numbers, so both stay
 * null and the edge stays unresolved.
 *
 * A stored value always wins, whatever `inheritance` says. The flag drives the
 * UI — whether the fields are editable, and clearing them when the user chooses
 * to inherit — but it must not decide this, because a number somebody measured
 * and saved would then be silently dropped in favour of a shipped constant. If
 * a value is not meant to apply, it is removed, not overruled.
 *
 * Each property resolves on its own. Filling in just the BLT because it was
 * measured is normal, and must not blank out the k that would be inherited.
 */
export function resolveTim(tim: TimSpec, materials: MaterialDefaults): ResolvedTim {
  const material = isTimMaterialType(tim.type) ? materials.tim[tim.type] : null;

  const ownK = tim.k_W_mK?.value ?? null;
  const ownThickness = tim.thickness_mm?.value ?? null;

  return {
    k_W_mK: ownK ?? material?.k_W_mK.value ?? null,
    thickness_mm: ownThickness ?? material?.blt_mm.value ?? null,
    inherited: ownK == null && ownThickness == null,
  };
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
  for (const type of TIM_MATERIAL_TYPES) {
    if (materials.tim[type].k_W_mK.source === 'Assumed') count++;
    if (materials.tim[type].blt_mm.source === 'Assumed') count++;
  }
  for (const [field] of PROCESS_FIELDS) {
    if (materials[field].source === 'Assumed') count++;
  }
  return count;
}
