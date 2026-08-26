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

/**
 * Package vocabulary, scoped to what an FR1 base station actually puts on a
 * thermal path.
 *
 * `SOT` and `QFP` were dropped: an RRU does carry SOT-223 regulators and the
 * odd LQFP on a control board, but they are sub-watt parts nobody models here,
 * and every extra row makes the list slower to read for the parts that matter.
 * They are still RECOGNISED — a project that stored one keeps it and the select
 * shows it as an off-list value, so no stored answer is rewritten (see
 * `LEGACY_PACKAGE_TYPES`).
 */
export const PACKAGE_TYPES = [
  'QFN',
  'BGA',
  'Lidded BGA',
  'LGA',
  'Bare Die',
  'RF Power Flanged Package',
  'Module',
  'Shielded Module',
  'Custom',
  'Unknown',
] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

/** Which base-station part wears each package — shown on hover in the select. */
export const PACKAGE_TYPE_HINTS: Record<PackageType, { en: string; zh: string }> = {
  QFN: {
    en: 'Leadless plastic with an exposed pad underneath (QFN/DFN). Drivers, LNAs, DC-DC controllers, small transceivers. Heat leaves downward through the pad.',
    zh: '底部有外露焊墊的無引腳塑封（QFN/DFN）。驅動級、LNA、DC-DC 控制器、小型收發器。熱從底部焊墊往下走。',
  },
  BGA: {
    en: 'Plastic or flip-chip BGA with no lid. Transceivers, DDR, mid-size SoCs. Heat splits between the balls and the bare top.',
    zh: '無上蓋的塑封或覆晶 BGA。收發器、DDR、中型 SoC。熱在錫球與裸露上表面之間分流。',
  },
  'Lidded BGA': {
    en: 'BGA with an integrated heat spreader. Large FPGAs, ASICs, baseband SoCs — the lid is the surface a heat sink presses on.',
    zh: '帶整合散熱蓋（IHS）的 BGA。大型 FPGA、ASIC、基頻 SoC —— 散熱器壓的就是這片蓋。',
  },
  LGA: {
    en: 'Land grid array, no balls. Power-stage and DC-DC modules, some SoCs. Heat leaves through the land pattern.',
    zh: '無錫球的接點陣列。功率級與 DC-DC 模組、部分 SoC。熱由底部接點導出。',
  },
  'Bare Die': {
    en: 'Unpackaged die, flip-chip or die-attached. GaN cells and some RF parts. Very small source area, so the mount usually needs a boss.',
    zh: '未封裝的裸晶，覆晶或直接黏晶。GaN 元胞與部分 RF 元件。熱源面積很小，安裝端通常需要凸台。',
  },
  'RF Power Flanged Package': {
    en: 'Bolted metal-flange RF power transistor — LDMOS or GaN, air-cavity ceramic or overmoulded. Final PA stages. The flange IS the thermal path; the datasheet Rth is junction-to-flange.',
    zh: '螺鎖金屬法蘭的 RF 功率電晶體 —— LDMOS 或 GaN，氣密陶瓷或塑封。末級 PA。法蘭本身就是散熱路徑，規格書的熱阻是 junction-to-flange。',
  },
  Module: {
    en: 'A multi-part assembly in one body: power module, optical module, SoM. Its own baseplate or case is the surface you model to.',
    zh: '多元件組成的單一模組：電源模組、光模組、SoM。要建模的是它自己的底板或外殼面。',
  },
  'Shielded Module': {
    en: 'A module under an RF can. The shield is not a heat path — heat still leaves through the board or the baseplate.',
    zh: '加了 RF 屏蔽罩的模組。屏蔽罩不是散熱路徑 —— 熱仍走板子或底板。',
  },
  Custom: {
    en: 'Something the list does not cover. Say what it is in Notes so the model can be reviewed.',
    zh: '清單沒有涵蓋的封裝。請在備註寫明實際型式，方便後續檢核。',
  },
  Unknown: {
    en: 'Not yet decided. Counts as incomplete — the readiness check asks for it.',
    zh: '尚未決定。視為未完成 —— 完整度檢查會要求填寫。',
  },
};

/**
 * Package values that are no longer offered but may sit in stored projects.
 *
 * Kept as text rather than remapped: `SOT` is not a `QFN` and `QFP` is not a
 * `BGA`, so rewriting one into the other would put an answer in the engineer's
 * mouth. Screen 04 shows the stored value as an off-list row instead.
 */
export const LEGACY_PACKAGE_TYPES = ['SOT', 'QFP'] as const;

/** 04 §19 — modelling preference only; Screen 05 turns it into topology. */
export const ARCHITECTURE_TEMPLATES = [
  'UNASSIGNED',
  'BOTTOM_COOL_COIN',
  'BOTTOM_COOL_VIA',
  'TOP_COOL_LID',
  'DIRECT_METAL',
  'CUSTOM',
] as const;
export type ArchitectureTemplate = (typeof ARCHITECTURE_TEMPLATES)[number];

/**
 * Template ids that were offered once and are no longer in the registry.
 *
 * A stored preference is a plain string, and nothing used to check it against
 * the registry. `MODULE_SURFACE_TIM` folded into `DIRECT_METAL`, and a
 * component still asking for it hit `getTemplate` → undefined →
 * `buildComponentSubgraph` → null → Generate's `continue`. The part was
 * silently SKIPPED on every regenerate: no error, no warning, no rebuild — and
 * so whatever its old subgraph contained stayed exactly as it was, forever.
 *
 * That is what kept the Power Module's duplicate source alive through three
 * separate attempts to sweep it: the sweep was never reached.
 */
export const LEGACY_ARCHITECTURE_TEMPLATES: Record<string, ArchitectureTemplate> = {
  MODULE_SURFACE_TIM: 'DIRECT_METAL',
  MODULE_SURFACE: 'DIRECT_METAL',
  // Dissolved into the mount axis — see DISSOLVED_TEMPLATE_MOUNTS. These two
  // fall back to Top Surface only when the component's own heat path cannot be
  // read; the migrator prefers the heat path, which is the better answer.
  BARE_DIE: 'TOP_COOL_LID',
  SMALL_BASE_HEAT_PIPE: 'TOP_COOL_LID',
};

/**
 * Templates that were really a heat path and a MOUNT wearing one name.
 *
 * `BARE_DIE` was Top Surface with a boss under it — a bare die's distinguishing
 * feature is that the base has to reach up to a very small source, not that it
 * lacks an Rjc, because it has one. `SMALL_BASE_HEAT_PIPE` was a package chain
 * with a local plate and a pipe hung off the end. Both are now a heat path plus
 * a mount, which is why the mount axis was worth having: two fewer templates,
 * and each of them buildable from Screen 04 rather than wired by hand.
 *
 * A component that named one keeps the mount it implied — unless it already has
 * a mount of its own, in which case the engineer's later choice wins.
 *
 * KNOWN LOSS, STATED PLAINLY: the old `SMALL_BASE_HEAT_PIPE` also modelled the
 * small base feeding a direct base path AND a pipe in PARALLEL, through two
 * ports. The mount is a series chain and cannot express that. Every edge of
 * that parallel branch shipped UNRESOLVED with no parameter links, so it was a
 * sketch to be wired by hand rather than a working model — and the same shape
 * is still reachable by drawing one extra edge from the Small Base node, which
 * survives a rebuild now that manual objects are preserved.
 */
export const DISSOLVED_TEMPLATE_MOUNTS: Record<string, MountType> = {
  BARE_DIE: 'Pedestal',
  SMALL_BASE_HEAT_PIPE: 'SmallBaseHeatPipe',
};

/**
 * Maps a stored preference onto a template that exists, or `UNASSIGNED`.
 *
 * Never guesses at a template for an id it does not recognise: `UNASSIGNED`
 * means "nobody has decided", which is the truth, and Screen 05 then asks.
 */
export function normalizeArchitectureTemplate(raw: unknown): ArchitectureTemplate {
  if (typeof raw !== 'string') return 'UNASSIGNED';
  if ((ARCHITECTURE_TEMPLATES as readonly string[]).includes(raw)) {
    return raw as ArchitectureTemplate;
  }
  return LEGACY_ARCHITECTURE_TEMPLATES[raw] ?? 'UNASSIGNED';
}

export const ARCHITECTURE_TEMPLATE_LABELS: Record<ArchitectureTemplate, string> = {
  UNASSIGNED: 'Unassigned',
  BOTTOM_COOL_COIN: 'Bottom Cool + Copper Coin',
  BOTTOM_COOL_VIA: 'Bottom Cool + Thermal Via',
  TOP_COOL_LID: 'Top Cool + Lid',
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
  /**
   * How this part is attached to the shared structure. Optional in the type so
   * a project written before mounts existed still loads; `mountSpec` supplies
   * `Direct`, which is what every one of those projects modelled.
   */
  mount?: MountSpec;
}

/**
 * How the component is ATTACHED to the shared structure — the third thing a
 * thermal path needs, after "where does heat leave the part" and "is there an
 * Rjc in the way".
 *
 * It is deliberately not part of the heat path. A pedestal, a small base with a
 * heat pipe, or a bare heat pipe all sit BETWEEN the component's HEAT_OUT and
 * the heat-sink base; none of them is inside the component. Folding them into
 * the path list would have multiplied four paths by four mounts into sixteen
 * templates for what is really four plus four.
 *
 * It also explains why `pedestal` and `small_base` looked like duplicates in
 * the node-type picker: they are both mounts, and they were only distinguished
 * by which template happened to emit them.
 */
export const MOUNT_TYPES = [
  'Direct',
  'Pedestal',
  'SmallBaseHeatPipe',
  'EmbeddedHeatPipe',
  'VaporChamber',
] as const;
export type MountType = (typeof MOUNT_TYPES)[number];

/**
 * `HeatPipeOnly` described hardware that does not get built.
 *
 * A heat pipe has to be HELD by something, and what holds it decides where the
 * heat goes. In a base station there are two ways: the pipe is embedded in the
 * heat-sink base, or the part sits on a small block with the pipe soldered
 * underneath. A bare pipe pressed against a part, with nothing under it, is not
 * a structure anyone ships — and modelling it as a series chain said the base
 * was not there at all, which made a heat pipe look like a penalty.
 *
 * It is replaced rather than renamed: the circuit changed from series to
 * parallel, so the numbers a stored `HeatPipeOnly` produced were not merely
 * relabelled, they were wrong. The two dimension fields keep their slots and
 * change meaning — see the hints.
 */
export const LEGACY_MOUNT_TYPES: Record<string, MountType> = {
  HeatPipeOnly: 'EmbeddedHeatPipe',
};

export function normalizeMountType(raw: unknown): MountType | null {
  if (typeof raw !== 'string') return null;
  if ((MOUNT_TYPES as readonly string[]).includes(raw)) return raw as MountType;
  return LEGACY_MOUNT_TYPES[raw] ?? null;
}

export const MOUNT_TYPE_LABELS: Record<MountType, { en: string; zh: string }> = {
  Direct: { en: 'Direct to base', zh: '直接貼合底座' },
  Pedestal: { en: 'Raised boss (pedestal)', zh: '凸台' },
  SmallBaseHeatPipe: { en: 'Small base + heat pipe', zh: '小基座＋熱管' },
  EmbeddedHeatPipe: { en: 'Heat pipe embedded in the base', zh: '底座埋入熱管' },
  VaporChamber: { en: 'Vapour chamber', zh: '均熱板' },
};

/**
 * Whether the block is part of the heat sink or a separate piece bolted to it.
 *
 * `Integral` is what the mount axis assumed from the start: a boss milled out
 * of the base, so it is the base's metal and there is no joint. A bolted block
 * breaks BOTH of those — it can be copper where the base is aluminium, and it
 * has a real interface underneath it that somebody has to specify.
 *
 * `Integral` is the default, so no project written before this moves a number.
 */
export const MOUNT_ATTACHMENTS = ['Integral', 'Bolted'] as const;
export type MountAttachment = (typeof MOUNT_ATTACHMENTS)[number];

export const MOUNT_ATTACHMENT_LABELS: Record<
  MountAttachment,
  { en: string; zh: string; description: string; descriptionZh: string }
> = {
  Integral: {
    en: 'Machined from the base',
    zh: '與底座同一本體',
    description: 'One piece of metal. No interface underneath, and it is the base material.',
    descriptionZh: '同一塊金屬，底下沒有接合面，材質即底座材質。',
  },
  Bolted: {
    en: 'Separate part, bolted on',
    zh: '獨立零件、後鎖',
    description: 'Its own material, and a real interface where it meets the base.',
    descriptionZh: '有自己的材質，與底座之間存在真實的接合面。',
  },
};

/**
 * Mounts whose attachment is not a choice.
 *
 * A vapour chamber is never milled out of the heat sink. A local block with a
 * pipe soldered under it cannot be either — the pipe has to get in there. And
 * an embedded pipe has no body of its own to attach at all, so the question
 * does not arise; `emptyMount` still reports Bolted for it, which is harmless
 * because nothing reads the attachment for a mount with no block.
 */
export function mountAttachmentIsFixed(type: MountType): boolean {
  return type !== 'Direct' && type !== 'Pedestal';
}

export const MOUNT_TYPE_HINTS: Record<MountType, { en: string; zh: string }> = {
  Direct: {
    en: 'The part meets the heat-sink base itself. Heat spreads straight out into the base.',
    zh: '元件直接接觸散熱器底座，熱由此擴散進底座。',
  },
  Pedestal: {
    en: 'The base is machined with a boss that stands up to reach this part. Its height is an extra conduction length before the heat spreads.',
    zh: '底座上長出凸台去搆到這顆元件。凸台高度是熱擴散前多出的一段導熱長度。',
  },
  SmallBaseHeatPipe: {
    en: 'The part sits on a local block with a heat pipe soldered under it. The block also sits on the main base, so heat leaving the block splits TWO ways, in parallel: down through the joint into the base, and along the pipe.',
    zh: '元件坐在局部小基座上，基座底下焊了熱管。小基座同時也坐在主底座上，所以熱離開小基座後會分成並聯的兩路：往下穿過接合面進主底座，以及沿著熱管走。',
  },
  EmbeddedHeatPipe: {
    en: 'Pipes lie in grooves in the base, machined flush, and the part sits on the face they share with the aluminium. Heat leaving the part therefore has TWO routes to the fins, in parallel: into the pipes, and straight into the base around them.',
    zh: '熱管嵌在底座的溝槽裡並銑平，元件壓在銅與鋁共同構成的那個面上。熱因此有兩條並聯的路可以到鰭片：進熱管，以及直接進周圍的鋁底座。',
  },
  VaporChamber: {
    en: 'A flat two-phase plate spreads the heat before it reaches the base. Its worth is the footprint it presents to the base, not its own conductivity — a chamber no bigger than the part buys nothing and only adds resistance.',
    zh: '扁平兩相均熱板，在熱進入底座前先把它攤開。它的價值在於呈現給底座的面積，不是它自己的導熱率 —— 均熱板若沒有比元件大，不但沒有好處，還純粹增加熱阻。',
  },
};

/**
 * The geometry a mount needs. Everything is optional and an unknown stays null:
 * a missing boss height leaves that edge UNRESOLVED naming the field, exactly
 * as a missing base thickness does (05 §61). The conductivity is NOT here — a
 * boss and a local plate are machined from the same metal as the heat sink, so
 * they read the project's `hsk_base_k_W_mK`.
 */
export interface MountSpec {
  type: MountType;
  /** Boss / local plate / vapour-chamber footprint, mm. */
  contact_L_mm: number | null;
  contact_W_mm: number | null;
  /** How far the boss stands up, mm. This is the conduction length. */
  height_mm: number | null;
  /**
   * Vendor resistance of the two-phase device, °C/W — a heat pipe or a vapour
   * chamber. One field because it is one quantity: a number the supplier
   * measured, which no geometry in this tool can derive. It is quoted at a
   * stated power and source size, so it belongs with its conditions; the edge
   * carries those in its reference.
   */
  heat_pipe_R_C_per_W: number | null;
  /** Milled out of the base, or a separate piece bolted to it. */
  attachment: MountAttachment;
  /**
   * The block's own conductivity, W/m·K. Null inherits the heat sink's, which
   * is the right answer for anything integral and a common one for a bolted
   * aluminium boss. A copper boss is why it can be overridden.
   *
   * Not offered for a vapour chamber: its resistance is the vendor number, and
   * asking for a k would invite an "effective k" nobody measured.
   */
  block_k_W_mK: number | null;
  /**
   * The interface under a bolted block. `null` means dry metal-to-metal, which
   * resolves from Screen 01's contact conductance.
   */
  joint_tim_id: string | null;
  joint_blt_mm: number | null;
}

export function emptyMount(type: MountType = 'Direct'): MountSpec {
  return {
    type,
    contact_L_mm: null,
    contact_W_mm: null,
    height_mm: null,
    heat_pipe_R_C_per_W: null,
    attachment: mountAttachmentIsFixed(type) ? 'Bolted' : 'Integral',
    block_k_W_mK: null,
    joint_tim_id: null,
    joint_blt_mm: null,
  };
}

/** Tolerates a spec written before the field existed. */
export function mountSpec(spec: ThermalSpec): MountSpec {
  const stored = spec.mount;
  const type = stored ? normalizeMountType(stored.type) : null;
  if (!stored || type == null) return emptyMount();
  const merged = { ...emptyMount(type), ...stored, type };
  // A vapour chamber is a separate part whatever an older record says.
  return mountAttachmentIsFixed(merged.type) ? { ...merged, attachment: 'Bolted' } : merged;
}

/** Mount footprint, mm² — the area heat enters the base through. */
export function mountContactAreaMm2(spec: ThermalSpec): number | null {
  const mount = mountSpec(spec);
  const { contact_L_mm: L, contact_W_mm: W } = mount;
  if (L == null || W == null || L <= 0 || W <= 0) return null;
  return L * W;
}

/** Which mounts put a solid conducting block between the part and the base. */
export function mountHasBlock(type: MountType): boolean {
  return type === 'Pedestal' || type === 'SmallBaseHeatPipe';
}

export function mountHasHeatPipe(type: MountType): boolean {
  return type === 'SmallBaseHeatPipe' || type === 'EmbeddedHeatPipe';
}

/**
 * Mounts where the pipe is a SECOND route rather than the only one.
 *
 * Both are parallel circuits: the conduction path into the base still exists,
 * and the pipe sits beside it. Modelling either as a series chain was the same
 * mistake twice — it says the base is not under the part, and a heat pipe then
 * reads as pure added resistance instead of the bypass it is.
 */
export function mountIsParallel(type: MountType): boolean {
  return type === 'SmallBaseHeatPipe' || type === 'EmbeddedHeatPipe';
}

/**
 * Mounts whose main step is a vendor resistance rather than a geometry.
 *
 * A heat pipe and a vapour chamber are the same kind of answer: a number the
 * supplier measured. Neither can be derived here, and neither should be faked
 * with an "effective k".
 */
export function mountHasVendorResistance(type: MountType): boolean {
  return mountHasHeatPipe(type) || type === 'VaporChamber';
}

/**
 * Whether the mount puts anything between the part and the base at all.
 *
 * An embedded pipe does not: the part still meets the base face directly, and
 * the pipe is a bypass off that same face. So it builds no seat and no joint —
 * there is nothing to join, the pipe is already IN the base.
 */
export function mountHasOwnBody(type: MountType): boolean {
  return type !== 'Direct' && type !== 'EmbeddedHeatPipe';
}

/** Everything except a bare Direct mount ends on a seat in the base. */
export function mountHasSeat(type: MountType): boolean {
  return mountHasOwnBody(type);
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
    mount: emptyMount(),
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

function finiteParameter(parameters: HeatPathSpec['parameters'], key: string): number | null {
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
    custom_contact_area_mm2: finiteParameter(parameters, 'custom_contact_area_mm2') ?? legacyArea,
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
  const spread = spreadAreaMm2(geometry, heatPath, projectCoinAreaMm2, heatPathParameters);
  if (source == null || source <= 0) return null;
  if (spread == null || spread <= 0) return null;
  return Math.sqrt(source * spread);
}
