/**
 * Canonical component model — 02 §28, expanded by 04 §29.
 *
 * 00 §5.2: this tool must NOT maintain a second independent component master
 * library. Components are imported from the existing 5G RRU Quick Volume
 * Evaluation Tool (or a file) and extended with thermal data.
 *
 * `thermal_profile` and everything under `architecture_prep` are PREPARATION for
 * Screen 05. Neither creates a thermal node or edge (04 §19, §40, AC-04-12/13/14).
 *
 * Naming note: the 04 document sketches this model in camelCase. The codebase
 * settled on snake_case in Screen 02, so the field semantics are followed exactly
 * and the casing stays consistent with the rest of the project.
 */

import { sourced, unknownValue, valueOf, type SourcedValue } from './sourcedValue';
import type { ExternalMappings } from '@/thermal/resultValue';

export const COMPONENT_CATEGORIES = ['RF', 'Digital', 'Power', 'Filter', 'Other'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

/**
 * Which way heat actually leaves the component — 04 §11, §17.
 *
 * This was `BOARD_TYPES`, a list that mixed two ideas and hid a third:
 *   - `None` did not mean "no path". In the Volume Evaluation Tool it means the
 *     board path is skipped because heat leaves through the component's TOP
 *     surface, which is a direction, not an absence.
 *   - `PCB Only` and `Thermal Via` both described heat going down through the
 *     board, so a component could be filed under either.
 *   - `Custom` was not a path at all; it meant nobody had decided. That now
 *     lives in `heat_path_confirmed`.
 *
 * The four that remain are the four the physics actually distinguishes, and
 * each selects a different resistance chain (see TEMPLATE_FOR_HEAT_PATH).
 */
export const HEAT_PATH_TYPES = ['Coin', 'Board', 'TopSurface', 'DirectMetal'] as const;
export type HeatPathType = (typeof HEAT_PATH_TYPES)[number];

export const HEAT_PATH_LABELS: Record<HeatPathType, { en: string; zh: string }> = {
  Coin: { en: 'Copper Coin (down)', zh: '銅塊焊接（往下）' },
  Board: { en: 'Board Vias (down)', zh: '板級導熱孔（往下）' },
  TopSurface: { en: 'Top Surface (up)', zh: '元件表面（往上）' },
  DirectMetal: { en: 'Direct Metal Mount', zh: '直接鎖附金屬' },
};

/**
 * What the source face L/W MEANS for each path.
 *
 * One stored field, four readings. In the Volume Evaluation Tool the single
 * `Pad_L` / `Pad_W` column already carried all of these — a Final PA's was the
 * copper block joint, a bottom-cooled IC's was its E-PAD, a top-cooled part's
 * was its case. The field is the same measurement in every case (the face heat
 * leaves through); only its name in the world changes, so the label changes
 * rather than the schema.
 */
export const SOURCE_FACE_LABELS: Record<HeatPathType, { en: string; zh: string }> = {
  Coin: { en: 'Coin joint face', zh: '銅塊接合面' },
  Board: { en: 'E-PAD', zh: 'E-PAD 散熱墊' },
  TopSurface: { en: 'Case face', zh: 'Case 上表面' },
  DirectMetal: { en: 'Contact face', zh: '鎖附接觸面' },
};

/**
 * Best guess at a component's heat path, mirroring the category defaults the
 * Volume Evaluation Tool ships (RF parts on copper coins, digital parts on
 * thermal vias, power parts cooled from the top).
 *
 * As with `inferLimitType`, a guess must leave `heat_path_confirmed` false.
 */
export function inferHeatPath(category: ComponentCategory): HeatPathType {
  switch (category) {
    case 'RF':
      return 'Coin';
    case 'Power':
      return 'TopSurface';
    case 'Filter':
      return 'DirectMetal';
    default:
      return 'Board';
  }
}

/**
 * Thermal interface material — 04 §11.
 * Solder and PCM are first-class here; naming a TIM still does not create an
 * edge, that stays Screen 05's decision (04 §11).
 */
export const TIM_TYPES = [
  'Grease',
  'Pad',
  'Pad2',
  'Putty',
  'PCM',
  'Gap Filler',
  'Solder',
  'None',
  'Custom',
] as const;
export type TimType = (typeof TIM_TYPES)[number];

/**
 * 04 §11: nothing may force every component onto Tj — a DDR case limit is a case
 * limit, and the margin has to be measured against the surface the datasheet
 * actually specifies.
 *
 * Only two survive. `Ts` was a third name for the package exterior, which `Tc`
 * already covers, and `Custom` / `Unknown` were not limit types at all — they
 * were a way of saying "nobody has decided yet". That state now lives in
 * `limit_type_confirmed`, so the type itself is always answerable.
 */
export const LIMIT_TYPES = ['Tj', 'Tc'] as const;
export type LimitType = (typeof LIMIT_TYPES)[number];

export const LIMIT_TYPE_LABELS: Record<LimitType, { en: string; zh: string }> = {
  Tj: { en: 'Junction', zh: '接面溫度' },
  Tc: { en: 'Case', zh: '殼溫' },
};

/**
 * Best guess at which surface a datasheet limit refers to, used when a source
 * does not say. Power devices and DDR are quoted against the case; everything
 * else is quoted against the junction.
 *
 * A guess is never silently trusted — whoever calls this must leave
 * `limit_type_confirmed` false so Screen 04 asks an engineer to check it.
 */
export function inferLimitType(category: ComponentCategory, name = ''): LimitType {
  if (category === 'Power') return 'Tc';
  // Underscore counts as a separator — `U500_DDR` is a DDR, `ADDRESS_BUF` is not.
  return /(^|[^a-z0-9])ddr/i.test(name) ? 'Tc' : 'Tj';
}

export const PACKAGE_TYPES = [
  'QFN',
  'BGA',
  'LGA',
  'Lidded BGA',
  'Bare Die',
  'Module',
  'Shielded Module',
  'SOT',
  'QFP',
  'Custom',
  'Unknown',
] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

/** 04 §19 — modelling preference only; Screen 05 turns it into topology. */
export const ARCHITECTURE_TEMPLATES = [
  'UNASSIGNED',
  'BOTTOM_COOL_COIN',
  'BOTTOM_COOL_VIA',
  'TOP_COOL_LID',
  'BARE_DIE',
  'SMALL_BASE_HEAT_PIPE',
  'DIRECT_METAL',
  'CUSTOM',
] as const;
export type ArchitectureTemplate = (typeof ARCHITECTURE_TEMPLATES)[number];

export const ARCHITECTURE_TEMPLATE_LABELS: Record<ArchitectureTemplate, string> = {
  UNASSIGNED: 'Unassigned',
  BOTTOM_COOL_COIN: 'Bottom Cool + Copper Coin',
  BOTTOM_COOL_VIA: 'Bottom Cool + Thermal Via',
  TOP_COOL_LID: 'Top Cool + Lid',
  BARE_DIE: 'Bare Die',
  SMALL_BASE_HEAT_PIPE: 'Small Base + Heat Pipe',
  DIRECT_METAL: 'Direct Metal Mount',
  CUSTOM: 'Custom',
};

/**
 * The template each heat path implies — 05 §8, §11.
 *
 * This is a SUGGESTION Screen 04 offers and Screen 05 applies; picking a heat
 * path never builds topology on its own (02 §34, 04 §40). `BARE_DIE`,
 * `SMALL_BASE_HEAT_PIPE` and `CUSTOM` stay hand-picked — no heat path implies
 * them, and Screen 05 can still reach every template and edit every edge.
 */
export const TEMPLATE_FOR_HEAT_PATH: Record<HeatPathType, ArchitectureTemplate> = {
  Coin: 'BOTTOM_COOL_COIN',
  Board: 'BOTTOM_COOL_VIA',
  TopSurface: 'TOP_COOL_LID',
  DirectMetal: 'DIRECT_METAL',
};

/** 04 §20 — a placement hint, never an actual base node. */
export const BASE_ZONES = [
  'Unassigned',
  'RF Left',
  'RF Right',
  'Digital',
  'Power',
  'Filter',
  'Custom',
] as const;
export type BaseZone = (typeof BASE_ZONES)[number];

/** 04 §21 — Screen 05 decides whether Qty 4 becomes 1, 4 or grouped nodes. */
export const QTY_MODELS = ['DECIDE_LATER', 'AGGREGATE', 'INDIVIDUAL', 'GROUPED'] as const;
export type QtyModel = (typeof QTY_MODELS)[number];

export const QTY_MODEL_LABELS: Record<QtyModel, string> = {
  DECIDE_LATER: 'Decide Later',
  AGGREGATE: 'Aggregate',
  INDIVIDUAL: 'Individual',
  GROUPED: 'Grouped',
};

export type ThermalProfileStatus = 'Not Assigned' | 'Draft' | 'Ready' | 'Custom';

// ---------------------------------------------------------------------------

/**
 * 04 §16 — package geometry plus the two faces the resistance chain needs.
 *
 * Heat entering a spreading path and heat leaving it cross DIFFERENT areas, and
 * conflating them is not a rounding error. For a 10 × 10 E-PAD on a 2.5 mm
 * board the source face is 100 mm² and the spread face 156 mm², so a TIM
 * resistance computed on the source face comes out 56% high.
 *
 * There used to be a `contact_*` pair AND a `pad_*` pair describing the same
 * measurement, with `contactAreaMm2` silently preferring one. They are one pair
 * now, named for the role rather than for the part of the package they sit on.
 */
export interface ComponentGeometry {
  package_L_mm: number | null;
  package_W_mm: number | null;
  package_H_mm: number | null;
  /**
   * The face heat LEAVES the component through. What it is called depends on
   * the heat path — see SOURCE_FACE_LABELS — but it is one measurement.
   */
  source_L_mm: number | null;
  source_W_mm: number | null;
  /** Overrides the L × W product when the face is not rectangular. */
  custom_source_area_mm2: number | null;
  /**
   * The face heat leaves the SPREADING structure through: the coin's heatsink
   * side, or the board footprint the via array has spread into. Left null it is
   * derived per heat path (see `spreadAreaMm2`); set, it wins.
   */
  spread_L_mm: number | null;
  spread_W_mm: number | null;
  custom_spread_area_mm2: number | null;
  board_thickness_mm: number | null;
  coin_thickness_mm: number | null;
  /**
   * Legacy Thick / Pad values may carry Volume-Tool-specific meaning.
   * 04 §30 forbids silently reinterpreting them, so they are flagged instead.
   */
  needs_review?: boolean;
}

/** 04 §17 — heat path spec. Parameters differ per type; none of it is an edge. */
export interface HeatPathSpec {
  type: HeatPathType;
  parameters: Record<string, number | string | boolean | null>;
}

/** 04 §18 — TIM can inherit the project default or be overridden per component. */
export interface TimSpec {
  type: TimType;
  inheritance: 'project' | 'component';
  k_W_mK: SourcedValue<number> | null;
  thickness_mm: SourcedValue<number> | null;
  contact_area_mode: 'derived' | 'custom';
}

export interface ThermalSpec {
  limit_type: LimitType;
  /**
   * False while `limit_type` is only this tool's inference from category or
   * name. Screen 04 shows it as unconfirmed until an engineer agrees.
   */
  limit_type_confirmed: boolean;
  limit_C: SourcedValue<number> | null;
  /** Unknown stays null. 04 §11 / AC-04-06 forbid 0 as "unknown". */
  r_jc_C_per_W: SourcedValue<number> | null;
  package_type: PackageType | null;
  geometry: ComponentGeometry;
  heat_path: HeatPathSpec;
  /**
   * False while `heat_path.type` is only this tool's inference from category.
   * The path selects the whole resistance chain, so an unchecked guess is worth
   * flagging as loudly as an unchecked limit type.
   */
  heat_path_confirmed: boolean;
  tim: TimSpec;
}

export interface ArchitecturePrep {
  template_preference: ArchitectureTemplate;
  preferred_base_zone: BaseZone;
  qty_model_preference: QtyModel;
  /** Status of Screen 05 readiness, not topology (04 §11). */
  thermal_profile_status: ThermalProfileStatus;
}

export type ImportSourceType = 'ExistingProject' | 'CSV' | 'Excel' | 'Paste' | 'Manual' | 'Library';

export interface ComponentProvenance {
  source_type: ImportSourceType;
  source_project_id: string | null;
  source_project_name: string | null;
  source_file: string | null;
  imported_at: string;
  last_modified_at?: string;
  modified_by?: string | null;
  ref_origin_project?: string | null;
  ref_origin_id?: string | null;
  ref_locked?: boolean | null;
}

export interface Component {
  id: string;
  name: string;
  category: ComponentCategory;
  /** Disabled components keep their data but leave the active dataset (04 §25). */
  enabled: boolean;
  qty: number;
  /** Dissipation of ONE unit, W. */
  power_W: SourcedValue<number>;

  thermal_spec: ThermalSpec;
  architecture_prep: ArchitecturePrep;
  provenance: ComponentProvenance;
  /** Reserved for Screen 03; never parsed here (04 §28.1, §33). */
  external_mappings: ExternalMappings;

  notes?: string;
  /**
   * Fields the source carried that this tool does not model. Preserved verbatim
   * (02 AC-02-14, 04 §30, AC-04-18).
   */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function emptyGeometry(): ComponentGeometry {
  return {
    package_L_mm: null,
    package_W_mm: null,
    package_H_mm: null,
    source_L_mm: null,
    source_W_mm: null,
    custom_source_area_mm2: null,
    spread_L_mm: null,
    spread_W_mm: null,
    custom_spread_area_mm2: null,
    board_thickness_mm: null,
    coin_thickness_mm: null,
  };
}

export function emptyHeatPath(type: HeatPathType = 'Board'): HeatPathSpec {
  return { type, parameters: {} };
}

export function emptyTim(): TimSpec {
  return {
    type: 'None',
    inheritance: 'project',
    k_W_mK: null,
    thickness_mm: null,
    contact_area_mode: 'derived',
  };
}

export function emptyThermalSpec(
  limitType: LimitType = 'Tj',
  heatPath: HeatPathType = 'Board',
): ThermalSpec {
  return {
    limit_type: limitType,
    limit_type_confirmed: false,
    limit_C: null,
    r_jc_C_per_W: null,
    package_type: null,
    geometry: emptyGeometry(),
    heat_path: emptyHeatPath(heatPath),
    heat_path_confirmed: false,
    tim: emptyTim(),
  };
}

export function emptyArchitecturePrep(): ArchitecturePrep {
  return {
    template_preference: 'UNASSIGNED',
    preferred_base_zone: 'Unassigned',
    qty_model_preference: 'DECIDE_LATER',
    thermal_profile_status: 'Not Assigned',
  };
}

export function emptyExternalMappings(): ExternalMappings {
  return { flotherm: { mapping_status: 'unmapped' }, measurement: { mapping_status: 'unmapped' } };
}

export function createComponent(input: {
  id: string;
  name: string;
  category?: ComponentCategory;
  qty?: number;
  power_W?: number | null;
  provenance: ComponentProvenance;
}): Component {
  const category = input.category ?? 'Other';
  return {
    id: input.id,
    name: input.name,
    category,
    enabled: true,
    qty: input.qty ?? 1,
    power_W:
      input.power_W == null ? unknownValue<number>('Manual') : sourced(input.power_W, 'Manual'),
    thermal_spec: emptyThermalSpec(inferLimitType(category, input.name), inferHeatPath(category)),
    architecture_prep: emptyArchitecturePrep(),
    provenance: input.provenance,
    external_mappings: emptyExternalMappings(),
  };
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function powerWOf(component: Component): number {
  return valueOf(component.power_W) ?? 0;
}

/**
 * Component dissipation summary, W.
 *
 * 02 §19 / 04 §11 / §40: Qty × Power is a REPORTING summary. It is NOT the heat
 * flow Q through any thermal edge — edge heat flow only exists after the solver
 * runs on a real topology, and a component's dissipation may split across paths.
 */
export function componentTotalPowerW(component: Component): number {
  return (component.qty || 0) * powerWOf(component);
}

/** Sums only enabled components — disabled ones are excluded from the project. */
export function totalPowerW(components: Component[]): number {
  return components.filter((c) => c.enabled).reduce((sum, c) => sum + componentTotalPowerW(c), 0);
}

export function isHeatSource(component: Component): boolean {
  return powerWOf(component) > 0;
}

/** Source face area, mm² — a custom override wins, else L × W. */
export function sourceAreaMm2(geometry: ComponentGeometry): number | null {
  if (geometry.custom_source_area_mm2 != null) return geometry.custom_source_area_mm2;
  if (geometry.source_L_mm != null && geometry.source_W_mm != null) {
    return geometry.source_L_mm * geometry.source_W_mm;
  }
  return null;
}

/**
 * Spread face area, mm² — the area heat leaves the spreading structure through.
 *
 * An explicit value always wins. Otherwise it is derived per heat path:
 *
 *   Board       heat spreads out by roughly one board thickness across the
 *               footprint, the 45° approximation the Volume Evaluation Tool uses
 *               (`Pad_L + Thick` by `Pad_W + Thick`).
 *   Coin        the coin's heatsink-side face, which is a MECHANICAL decision
 *               shared by the design, so it comes from the project defaults.
 *               With none supplied this returns null rather than guessing — a
 *               fabricated coin size would silently change every PA's margin.
 *   TopSurface  nothing spreads; heat leaves the case face it entered.
 *   DirectMetal same — the mount is modelled as its own edge in Screen 05.
 */
export function spreadAreaMm2(
  geometry: ComponentGeometry,
  heatPath: HeatPathType,
  projectCoinAreaMm2: number | null = null,
): number | null {
  if (geometry.custom_spread_area_mm2 != null) return geometry.custom_spread_area_mm2;
  if (geometry.spread_L_mm != null && geometry.spread_W_mm != null) {
    return geometry.spread_L_mm * geometry.spread_W_mm;
  }

  if (heatPath === 'Coin') return projectCoinAreaMm2;

  if (heatPath === 'Board') {
    const { source_L_mm: L, source_W_mm: W, board_thickness_mm: t } = geometry;
    if (L == null || W == null || t == null) return null;
    return (L + t) * (W + t);
  }

  return sourceAreaMm2(geometry);
}

/**
 * The area a conduction edge THROUGH the spreading structure sees.
 *
 * Neither face on its own is right: heat enters across the source face and
 * leaves across the spread face, so the effective area is the geometric mean
 * — the same approximation the Volume Evaluation Tool makes.
 */
export function spreadingAreaMm2(
  geometry: ComponentGeometry,
  heatPath: HeatPathType,
  projectCoinAreaMm2: number | null = null,
): number | null {
  const source = sourceAreaMm2(geometry);
  const spread = spreadAreaMm2(geometry, heatPath, projectCoinAreaMm2);
  if (source == null || source <= 0) return null;
  if (spread == null || spread <= 0) return source;
  return Math.sqrt(source * spread);
}
