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
 * The paths that remain are the ones the physics actually distinguishes, and
 * each selects a different resistance chain (see TEMPLATE_FOR_HEAT_PATH).
 */
export const HEAT_PATH_TYPES = ['Coin', 'Board', 'TopSurface', 'DirectMetal'] as const;
export type HeatPathType = (typeof HEAT_PATH_TYPES)[number];

/**
 * Heat paths that were offered and turned out to be the same path.
 *
 * `ModuleSurface` and `DirectMetal` built an identical chain. Once
 * `DIRECT_METAL` grew its `SurfaceBodyBased` source model — which deletes the
 * junction and puts the dissipation on the metal face itself — the two produced
 * the same two nodes, the same two edges and, because both had `spread: 'none'`,
 * the same areas. `MODULE_SURFACE_TIM` was a second copy of one topology.
 *
 * Nothing is lost by folding it in. The one thing `ModuleSurface` enforced was
 * that the contact area follows the package outline, and that is exactly
 * `contact_geometry: 'FullBase'`, which `DirectMetal` already had alongside
 * `PerimeterFrame` and a custom area. A migrated component keeps its old
 * behaviour by being given `SurfaceBodyBased` + `FullBase`, and gains the
 * perimeter-frame and exposed-surface options it never had.
 *
 * The key stays `DirectMetal` rather than being renamed: "heat leaves directly
 * through metal" describes a vendor baseplate as accurately as a flange, so the
 * name has not gone stale — only the label needed to widen.
 */
export const LEGACY_HEAT_PATHS: Record<string, HeatPathType> = {
  ModuleSurface: 'DirectMetal',
};

/**
 * Named for the migration, not for parsing: `normalizeHeatPath` already exists
 * in the importer and turns free text like "Module Baseplate" into a path.
 * This one only maps a stored enum value that has since been retired.
 */
export function migrateHeatPathType(value: unknown): HeatPathType | null {
  if (typeof value !== 'string') return null;
  if ((HEAT_PATH_TYPES as readonly string[]).includes(value)) return value as HeatPathType;
  return LEGACY_HEAT_PATHS[value] ?? null;
}

/**
 * What a migrated `ModuleSurface` component needs so its chain is unchanged:
 * the source on the face rather than behind an Rjc, and the contact area
 * following the package outline.
 */
export const MODULE_SURFACE_EQUIVALENT_PARAMETERS = {
  source_model: 'SurfaceBodyBased',
  contact_geometry: 'FullBase',
  exposed_surface_enabled: false,
  exposed_area_mode: 'DerivedPackage',
} as const;

export const HEAT_PATH_LABELS: Record<HeatPathType, { en: string; zh: string }> = {
  Coin: { en: 'Copper Coin (down)', zh: '銅塊焊接（往下）' },
  Board: { en: 'Board Vias (down)', zh: '板級導熱孔（往下）' },
  TopSurface: { en: 'Top Surface (up)', zh: '元件表面（往上）' },
  DirectMetal: {
    en: 'Metal Face — baseplate, flange or module surface',
    zh: '金屬散熱面（底板・法蘭・模組面）',
  },
};

/** How a Metal Base + Interface component introduces heat into the network. */
export const METAL_BASE_SOURCE_MODELS = ['JunctionBased', 'SurfaceBodyBased'] as const;
export type MetalBaseSourceModel = (typeof METAL_BASE_SOURCE_MODELS)[number];

export const METAL_BASE_SOURCE_MODEL_LABELS: Record<
  MetalBaseSourceModel,
  { en: string; zh: string; description: string; descriptionZh: string }
> = {
  JunctionBased: {
    en: 'Junction-based',
    zh: '接面型',
    description: 'Junction → Rjc → metal base → interface',
    descriptionZh: '接面 → Rjc → 金屬底面 → 介面層',
  },
  SurfaceBodyBased: {
    en: 'Surface / body-based',
    zh: '表面／本體型',
    description: 'Distributed body loss → metal base → interface; no Rjc',
    descriptionZh: '本體分布損耗 → 金屬底面 → 介面層；不使用 Rjc',
  },
};

export const METAL_BASE_CONTACT_GEOMETRIES = ['FullBase', 'PerimeterFrame', 'CustomArea'] as const;
export type MetalBaseContactGeometry = (typeof METAL_BASE_CONTACT_GEOMETRIES)[number];

export const METAL_BASE_CONTACT_GEOMETRY_LABELS: Record<
  MetalBaseContactGeometry,
  { en: string; zh: string }
> = {
  FullBase: { en: 'Full Base', zh: '完整底面' },
  PerimeterFrame: { en: 'Perimeter Frame', zh: '外圍框接觸' },
  CustomArea: { en: 'Custom Effective Area', zh: '自訂有效接觸面積' },
};

export const METAL_BASE_EXPOSED_AREA_MODES = ['DerivedPackage', 'Custom'] as const;
export type MetalBaseExposedAreaMode = (typeof METAL_BASE_EXPOSED_AREA_MODES)[number];

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
  DirectMetal: { en: 'Metal face contact', zh: '金屬面接觸區' },
};

/**
 * Which geometry each heat path actually needs, and where it comes from.
 *
 * Read off the Volume Evaluation Tool's `calcThermalResistance`, where one
 * `Pad_L/W` column and one `Thick` column mean different things per board type.
 * Spelling that out here means a face is asked for exactly once, and never
 * asked for at all when the path already determines it:
 *
 *   Coin         The part is reflowed onto the coin across its whole base, so
 *                the joint face IS the package outline. The coin it spreads
 *                into — footprint and thickness — is one mechanical decision
 *                for the design, so it comes from the project (01 §4).
 *   Board        The face is the IC's E-PAD, which nothing else knows, so it is
 *                stated. Heat then spreads through the board at roughly 45°:
 *                `(L + t) x (W + t)`, the tool's own approximation.
 *   TopSurface   Heat leaves the case top into the TIM. The case top IS the
 *                package outline, and nothing spreads on the way.
 *   DirectMetal  A metal base, flange, housing land or vendor-specified
 *                module face meets the product structure through a thin
 *                interface. The effective contact can be the full base (which
 *                is the package outline, and what a module vendor means by its
 *                specified surface), a perimeter frame, or a custom area.
 *                `source_model` decides whether an Rjc stands in front of it:
 *                a flanged transistor has one, a filter body does not.
 */
export interface GeometryRule {
  /** `package` means read-only, following the package outline. */
  source: 'package' | 'stated';
  /** `none` means heat leaves through the same face it entered. */
  spread: 'project_coin' | 'board_spread' | 'none';
  /** Which thickness, if any, this path conducts through. */
  thickness: 'project_coin' | 'board' | 'none';
}

export const GEOMETRY_RULES: Record<HeatPathType, GeometryRule> = {
  Coin: { source: 'package', spread: 'project_coin', thickness: 'project_coin' },
  Board: { source: 'stated', spread: 'board_spread', thickness: 'board' },
  TopSurface: { source: 'package', spread: 'none', thickness: 'none' },
  // The contact is whatever the mechanical design bolts down: the whole base, a
  // perimeter land, a custom area, or — for a vendor-specified module face —
  // the package outline via `FullBase`. `contact_geometry` decides which.
  DirectMetal: { source: 'stated', spread: 'none', thickness: 'none' },
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
 * 04 §11: nothing may force every component onto Tj — a DDR case limit is a case
 * limit, and the margin has to be measured against the surface the datasheet
 * actually specifies.
 *
 * Surface-referenced modules need more precision than the original Tj/Tc pair:
 * `Tb` is a vendor-defined baseplate temperature and `Ts` is another explicitly
 * named manufacturer surface. The free-text reference-location field below
 * records exactly where the datasheet expects that temperature to be measured.
 */
export const LIMIT_TYPES = ['Tj', 'Tc', 'Tb', 'Ts'] as const;
export type LimitType = (typeof LIMIT_TYPES)[number];

export const LIMIT_TYPE_LABELS: Record<LimitType, { en: string; zh: string }> = {
  Tj: { en: 'Junction', zh: '接面溫度' },
  Tc: { en: 'Case', zh: '殼溫' },
  Tb: { en: 'Baseplate', zh: '底板溫度' },
  Ts: { en: 'Manufacturer Surface', zh: '原廠指定表面溫度' },
};

export const MODULE_REFERENCE_LOCATIONS = ['Left', 'Center', 'Right'] as const;
export type ModuleReferenceLocation = (typeof MODULE_REFERENCE_LOCATIONS)[number];

export const MODULE_REFERENCE_LOCATION_LABELS: Record<
  ModuleReferenceLocation,
  { en: string; zh: string }
> = {
  Left: { en: 'Left', zh: '左側' },
  Center: { en: 'Center', zh: '中央' },
  Right: { en: 'Right', zh: '右側' },
};

/** Normalizes older free-text locations into the current three choices. */
export function normalizeModuleReferenceLocation(value: unknown): ModuleReferenceLocation | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (/\bleft\b/.test(text) || text.includes('左')) return 'Left';
  if (/\b(center|centre|middle)\b/.test(text) || text.includes('中')) return 'Center';
  if (/\bright\b/.test(text) || text.includes('右')) return 'Right';
  return null;
}

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
  DIRECT_METAL: 'Metal Face + Interface',
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

/**
 * Choosing a heat path IS choosing the resistance chain, and each chain has
 * exactly one template — so Screen 04 no longer asks for the template
 * separately. It is written here whenever the path is set, which keeps
 * `networkBuilder` reading one field it can trust.
 *
 * Screen 05 can still override the template per component; the ones with no
 * heat path of their own (BARE_DIE, SMALL_BASE_HEAT_PIPE, CUSTOM) are chosen
 * there, where the topology they change is visible.
 */
export function heatPathPatch(
  component: Component,
  type: HeatPathType,
): { thermal_spec: ThermalSpec; architecture_prep: ArchitecturePrep } {
  return {
    thermal_spec: {
      ...component.thermal_spec,
      heat_path: {
        ...component.thermal_spec.heat_path,
        type,
        parameters:
          type === 'DirectMetal'
            ? {
                ...(component.thermal_spec.heat_path.type === 'DirectMetal'
                  ? component.thermal_spec.heat_path.parameters
                  : {}),
                source_model:
                  component.thermal_spec.heat_path.type === 'DirectMetal'
                    ? metalBaseSourceModel(component.thermal_spec)
                    : component.category === 'Filter'
                      ? 'SurfaceBodyBased'
                      : 'JunctionBased',
                contact_geometry:
                  component.thermal_spec.heat_path.type === 'DirectMetal'
                    ? metalBaseContactGeometry(component.thermal_spec)
                    : 'FullBase',
                exposed_surface_enabled:
                  component.thermal_spec.heat_path.type === 'DirectMetal'
                    ? metalBaseExposedSurfaceEnabled(component.thermal_spec)
                    : false,
                exposed_area_mode:
                  component.thermal_spec.heat_path.type === 'DirectMetal'
                    ? metalBaseExposedAreaMode(component.thermal_spec)
                    : 'DerivedPackage',
              }
            : component.thermal_spec.heat_path.parameters,
      },
      // Picking a path IS the confirmation.
      heat_path_confirmed: true,
    },
    architecture_prep: {
      ...component.architecture_prep,
      template_preference: TEMPLATE_FOR_HEAT_PATH[type],
    },
  };
}

export const HEAT_PATH_PATCH_FIELDS = ['heat_path.type', 'architecture_prep'];

/**
 * 04 §20 — which shared structure this part attaches to. A placement hint,
 * never an actual base node.
 *
 * A zone KEY, not a display name. Which keys are valid depends on the project's
 * base structure — `presetZones` is the vocabulary — so this cannot be a fixed
 * union. The stored value is the exact stable zone key, never a display name.
 */
export const UNASSIGNED_ZONE = 'Unassigned';
export type BaseZone = string;

/**
 * Keys that named the same physical place under an earlier vocabulary.
 *
 * A rename here is silent damage: `suggestedZoneFor` matches the stored key
 * against the structure's zone ids exactly, so a component still carrying the
 * old key simply stops matching — no error, no warning, it just never gets
 * wired and the engineer is left connecting ports by hand wondering why.
 * `MAIN_BASE` became `HSK_BASE` when the presets were reworked around a single
 * shared base and a dual-base split.
 */
const LEGACY_ZONE_KEYS: Record<string, BaseZone> = {
  MAIN_BASE: 'HSK_BASE',
  'Main Base': 'HSK_BASE',
};

export function normalizeZoneKey(value: unknown): BaseZone {
  if (typeof value !== 'string' || value.trim() === '') return UNASSIGNED_ZONE;
  const trimmed = value.trim();
  return LEGACY_ZONE_KEYS[trimmed] ?? trimmed;
}

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
   *
   * On paths whose source is the complete package face (Coin, TopSurface and
   * ModuleSurface), it is not stated separately: `sourceFaceMm` reads the
   * package outline so the two dimensions cannot disagree.
   */
  source_L_mm: number | null;
  source_W_mm: number | null;
  /**
   * The board a via path conducts through. Coin thickness is NOT here: it is a
   * project constant (01 §4), because one coin serves the whole design.
   */
  board_thickness_mm: number | null;
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

/**
 * 04 §18 — which of the project's TIMs this component uses.
 *
 * The material itself is defined once, in the project library (01 §4). A
 * component picks one; it cannot invent a new one here, because a project uses
 * a handful of interface materials and defining them per component meant
 * hundreds of copies of the same two numbers.
 *
 * `blt_mm` is the one thing a component may still say for itself. Bond line is
 * a build outcome, not a material property — the same grease ends up thinner
 * under screws than under a clip — so two components can share a material and
 * still have different thicknesses. Left null it uses the material's default.
 */
export interface TimSpec {
  /** A `TimMaterial.id`, or null for no TIM at all (direct contact). */
  tim_id: string | null;
  /** Overrides the material's default bond line for this component only. */
  blt_mm: SourcedValue<number> | null;
  /** Directly measured whole-interface resistance, used instead of k / BLT. */
  measured_rth_C_per_W: SourcedValue<number> | null;
  contact_area_mode: 'derived' | 'custom';
}

export interface MetalBaseParameters {
  source_model: MetalBaseSourceModel;
  contact_geometry: MetalBaseContactGeometry;
  perimeter_land_width_mm: number | null;
  custom_contact_area_mm2: number | null;
  exposed_surface_enabled: boolean;
  exposed_area_mode: MetalBaseExposedAreaMode;
  custom_exposed_area_mm2: number | null;
}

export interface ThermalSpec {
  limit_type: LimitType;
  /**
   * False while `limit_type` is only this tool's inference from category or
   * name. Screen 04 shows it as unconfirmed until an engineer agrees.
   */
  limit_type_confirmed: boolean;
  limit_C: SourcedValue<number> | null;
  /** Left/center/right point on the manufacturer reference surface. */
  limit_reference_note: ModuleReferenceLocation | '';
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
    board_thickness_mm: null,
  };
}

export function emptyHeatPath(type: HeatPathType = 'Board'): HeatPathSpec {
  return { type, parameters: {} };
}

export function emptyTim(timId: string | null = null): TimSpec {
  return {
    tim_id: timId,
    blt_mm: null,
    measured_rth_C_per_W: null,
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
    limit_reference_note: '',
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
    preferred_base_zone: UNASSIGNED_ZONE,
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

function finiteParameter(
  parameters: HeatPathSpec['parameters'],
  key: string,
): number | null {
  const value = parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Normalized Metal Base settings, including safe defaults for older projects. */
export function metalBaseParameters(spec: ThermalSpec): MetalBaseParameters {
  const parameters = spec.heat_path.parameters;
  const storedSource = parameters.source_model;
  const storedGeometry = parameters.contact_geometry;
  const storedAreaMode = parameters.exposed_area_mode;
  const legacyArea =
    spec.geometry.source_L_mm != null && spec.geometry.source_W_mm != null
      ? spec.geometry.source_L_mm * spec.geometry.source_W_mm
      : null;

  return {
    // DIRECT_METAL v1 always created a Junction/Rjc edge. Keeping that fallback
    // means an old saved project does not silently change physics on migration.
    source_model: METAL_BASE_SOURCE_MODELS.includes(storedSource as MetalBaseSourceModel)
      ? (storedSource as MetalBaseSourceModel)
      : 'JunctionBased',
    contact_geometry: METAL_BASE_CONTACT_GEOMETRIES.includes(
      storedGeometry as MetalBaseContactGeometry,
    )
      ? (storedGeometry as MetalBaseContactGeometry)
      : legacyArea != null
        ? 'CustomArea'
        : 'FullBase',
    perimeter_land_width_mm: finiteParameter(parameters, 'perimeter_land_width_mm'),
    custom_contact_area_mm2:
      finiteParameter(parameters, 'custom_contact_area_mm2') ?? legacyArea,
    exposed_surface_enabled: parameters.exposed_surface_enabled === true,
    exposed_area_mode: METAL_BASE_EXPOSED_AREA_MODES.includes(
      storedAreaMode as MetalBaseExposedAreaMode,
    )
      ? (storedAreaMode as MetalBaseExposedAreaMode)
      : 'DerivedPackage',
    custom_exposed_area_mm2: finiteParameter(parameters, 'custom_exposed_area_mm2'),
  };
}

export function metalBaseSourceModel(spec: ThermalSpec): MetalBaseSourceModel {
  return metalBaseParameters(spec).source_model;
}

export function metalBaseContactGeometry(spec: ThermalSpec): MetalBaseContactGeometry {
  return metalBaseParameters(spec).contact_geometry;
}

export function metalBaseExposedSurfaceEnabled(spec: ThermalSpec): boolean {
  return metalBaseParameters(spec).exposed_surface_enabled;
}

export function metalBaseExposedAreaMode(spec: ThermalSpec): MetalBaseExposedAreaMode {
  return metalBaseParameters(spec).exposed_area_mode;
}

/** Effective base contact area, including a perimeter-frame mounting land. */
export function metalBaseContactAreaMm2(spec: ThermalSpec): number | null {
  const model = metalBaseParameters(spec);
  const { package_L_mm: L, package_W_mm: W } = spec.geometry;
  switch (model.contact_geometry) {
    case 'FullBase':
      return L != null && W != null && L > 0 && W > 0 ? L * W : null;
    case 'PerimeterFrame': {
      const width = model.perimeter_land_width_mm;
      if (L == null || W == null || width == null || L <= 0 || W <= 0 || width <= 0) return null;
      if (width * 2 >= Math.min(L, W)) return null;
      // Outer rectangle minus the open centre.
      return L * W - (L - 2 * width) * (W - 2 * width);
    }
    case 'CustomArea': {
      const area = model.custom_contact_area_mm2;
      return area != null && area > 0 ? area : null;
    }
  }
}

/** Top plus four sides; the base itself belongs to the contact path. */
export function metalBaseExposedAreaMm2(spec: ThermalSpec): number | null {
  const model = metalBaseParameters(spec);
  if (!model.exposed_surface_enabled) return null;
  if (model.exposed_area_mode === 'Custom') {
    const area = model.custom_exposed_area_mm2;
    return area != null && area > 0 ? area : null;
  }
  const { package_L_mm: L, package_W_mm: W, package_H_mm: H } = spec.geometry;
  if (L == null || W == null || H == null || L <= 0 || W <= 0 || H <= 0) return null;
  return L * W + 2 * H * (L + W);
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
/**
 * The face heat leaves the component through, as L and W.
 *
 * Coin, TopSurface and ModuleSurface use the complete package face, so their
 * source fields are read-only in the UI and follow the package rather than
 * being typed a second time. Other paths state the source face directly.
 */
export function sourceFaceMm(
  geometry: ComponentGeometry,
  heatPath: HeatPathType,
): { L: number | null; W: number | null } {
  return GEOMETRY_RULES[heatPath].source === 'package'
    ? { L: geometry.package_L_mm, W: geometry.package_W_mm }
    : { L: geometry.source_L_mm, W: geometry.source_W_mm };
}

/**
 * The spread face as L and W, for display. Every path derives it — none is
 * typed — so this and `spreadAreaMm2` must agree, and both read the same rule.
 */
export function spreadFaceMm(
  geometry: ComponentGeometry,
  heatPath: HeatPathType,
  projectCoin: { L: number | null; W: number | null } = { L: null, W: null },
): { L: number | null; W: number | null } {
  const rule = GEOMETRY_RULES[heatPath];
  if (rule.spread === 'project_coin') return projectCoin;
  if (rule.spread === 'none') return sourceFaceMm(geometry, heatPath);

  const { L, W } = sourceFaceMm(geometry, heatPath);
  const t = geometry.board_thickness_mm;
  if (L == null || W == null || t == null) return { L: null, W: null };
  return { L: L + t, W: W + t };
}

export function sourceAreaMm2(
  geometry: ComponentGeometry,
  heatPath: HeatPathType = 'Board',
  heatPathParameters: HeatPathSpec['parameters'] = {},
): number | null {
  if (heatPath === 'DirectMetal') {
    const spec = {
      ...emptyThermalSpec('Tj', 'DirectMetal'),
      geometry,
      heat_path: { type: heatPath, parameters: heatPathParameters },
    };
    return metalBaseContactAreaMm2(spec);
  }
  const { L, W } = sourceFaceMm(geometry, heatPath);
  return L != null && W != null ? L * W : null;
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
 *   ModuleSurface same, using the complete package face selected by this model.
 *   DirectMetal uses the effective base-contact area selected by its contact
 *               geometry model; there is no separate spreading body here.
 */
export function spreadAreaMm2(
  geometry: ComponentGeometry,
  heatPath: HeatPathType,
  projectCoinAreaMm2: number | null = null,
  heatPathParameters: HeatPathSpec['parameters'] = {},
): number | null {
  const rule = GEOMETRY_RULES[heatPath];
  // The coin is the project's, and it is the whole answer: nothing on the
  // component may override a decision shared by every coin in the design.
  if (rule.spread === 'project_coin') return projectCoinAreaMm2;
  if (rule.spread === 'none') return sourceAreaMm2(geometry, heatPath, heatPathParameters);

  const { L, W } = spreadFaceMm(geometry, heatPath);
  return L != null && W != null ? L * W : null;
}

/**
 * The area a conduction edge THROUGH the spreading structure sees.
 *
 * Neither face on its own is right: heat enters across the source face and
 * leaves across the spread face, so the effective area is the geometric mean
 * — the same approximation the Volume Evaluation Tool makes.
 *
 * Both faces are required. Falling back to the source face when the spread one
 * is unknown would return a plausible, conservative, RESOLVED-looking number
 * built on a guess about how far heat spreads — and being conservative is no
 * defence, because a wrong resistance reorders the bottleneck ranking whichever
 * way it errs. A path with no known far face has no known area.
 *
 * Note this is not the same as "no spreading": for a top-cooled or bolted part
 * `spreadAreaMm2` returns the source face itself, so the mean is that face and
 * the edge resolves normally.
 */
export function spreadingAreaMm2(
  geometry: ComponentGeometry,
  heatPath: HeatPathType,
  projectCoinAreaMm2: number | null = null,
  heatPathParameters: HeatPathSpec['parameters'] = {},
): number | null {
  const source = sourceAreaMm2(geometry, heatPath, heatPathParameters);
  const spread = spreadAreaMm2(
    geometry,
    heatPath,
    projectCoinAreaMm2,
    heatPathParameters,
  );
  if (source == null || source <= 0) return null;
  if (spread == null || spread <= 0) return null;
  return Math.sqrt(source * spread);
}
