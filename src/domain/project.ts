/**
 * Project & Scenario domain model — 01_Project_Info.md §24, §25, §36.
 *
 * Storage shape follows 01 §36: everything this tool owns lives under
 * `project_context` so it cannot collide with the columns the existing
 * 5G RRU Quick Volume Evaluation Tool keeps on the same project document.
 */

import { createRevision, type RevisionId } from './revision';

export const PROJECT_STAGES = ['Prototype', 'EVT', 'DVT', 'PVT'] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PRODUCT_TYPES = ['RRU', 'AAU', 'Small Cell'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const DEPLOYMENTS = ['Indoor', 'Outdoor'] as const;
export type Deployment = (typeof DEPLOYMENTS)[number];

/**
 * Where each product type can actually be installed.
 *
 * An AAU is an outdoor macro radio and a small cell is an indoor unit; only an
 * RRU is built both ways. Encoding that here keeps the pair from drifting into
 * a combination that does not exist — the ambient assumptions downstream differ
 * enormously between indoor and outdoor.
 */
export const DEPLOYMENTS_BY_PRODUCT: Record<ProductType, readonly Deployment[]> = {
  RRU: ['Indoor', 'Outdoor'],
  AAU: ['Outdoor'],
  'Small Cell': ['Indoor'],
};

/** The deployment to fall back to when the product type changes. */
export function defaultDeploymentFor(product: ProductType): Deployment {
  return DEPLOYMENTS_BY_PRODUCT[product][0];
}

export const FREQUENCY_RANGES = ['FR1', 'FR2'] as const;
export type FrequencyRange = (typeof FREQUENCY_RANGES)[number];

/**
 * HOW heat is moved and shed — the mechanisms in play.
 *
 * Multi-select, because real products combine them: natural convection at the
 * fins with a heat pipe and a vapor chamber inside is one common answer, not
 * three competing ones.
 *
 * Kept strictly to mechanism. WHERE the heat finally leaves is
 * `main_heat_rejection`, which is why no surface appears in this list and no
 * mechanism appears in that one — the overlap between the two was the whole
 * problem with the previous pair.
 */
export const COOLING_ARCHITECTURES = [
  'Natural Convection',
  'Forced Convection (Fan)',
  'Heat Pipe',
  'Vapor Chamber',
  'Liquid Cooling',
] as const;
export type CoolingArchitecture = (typeof COOLING_ARCHITECTURES)[number];

/**
 * How many faces of the enclosure actually reject heat.
 *
 * Single-sided is common on FR1: one face is the cavity filter block, which is
 * effectively dead weight thermally, leaving only the other face to carry the
 * heat sink. It halves the available rejection area, so it is worth stating up
 * front rather than discovering it in the results.
 */
export const ENCLOSURE_TYPES = ['Double-sided Cooling', 'Single-sided Cooling'] as const;
export type EnclosureType = (typeof ENCLOSURE_TYPES)[number];

/**
 * WHERE heat leaves the product — the surfaces, not the mechanisms.
 *
 * The pair with `cooling_architecture` used to overlap: a heat pipe and a fan
 * appeared in both lists, so the same fact could be recorded twice or in
 * neither. Splitting mechanism from surface makes each answer a question the
 * other cannot.
 */
export const MAIN_HEAT_REJECTIONS = [
  'Finned Heat Sink',
  'Flat Housing Surface',
  'Cavity Filter Body',
  'Liquid Cold Plate',
  'Mounting Bracket Conduction',
] as const;
export type MainHeatRejection = (typeof MAIN_HEAT_REJECTIONS)[number];

export type ProjectStatus = 'active' | 'archived';

/**
 * Architecture summary only. 01 §45 / 00 §53: none of these fields may be turned
 * into graph topology here — topology is built in Screen 05.
 */
export interface ProjectContext {
  customer: string;
  owner: string;
  description: string;
  product_type: ProductType;
  /** Constrained by `product_type` — see `DEPLOYMENTS_BY_PRODUCT`. */
  deployment: Deployment;
  frequency_range: FrequencyRange;
  project_stage: ProjectStage;
  /** Mechanisms in play; multi-select. */
  cooling_architecture: CoolingArchitecture[];
  enclosure_type: EnclosureType;
  /** Surfaces that shed heat; multi-select. */
  main_heat_rejection: MainHeatRejection[];
  notes: string;
}

export interface ProjectMeta {
  created_at: string;
  updated_at: string;
  schema_version: string;
}

export interface Project {
  project_id: string;
  project_name: string;
  /**
   * Source-provenance clock; optional only for pre-Phase-1 in-memory fixtures.
   * Constructors and persistence hydration always supply it.
   */
  revision?: RevisionId;
  project_context: ProjectContext;
  active_scenario_id: string | null;
  status: ProjectStatus;
  meta: ProjectMeta;
  /**
   * Fields owned by other tools sharing this project document. Never edited here,
   * always written back untouched (01 §35, AC-09).
   */
  foreign_fields?: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  project_id: string;
  /**
   * Moves for scenario scalars and the separate Screen 06 boundary set.
   * Optional at the type boundary so legacy records remain readable.
   */
  revision?: RevisionId;
  name: string;
  ambient_C: number;
  wind_mps: number;
  solar_W_m2: number;
  power_scale: number;
  notes: string;
  is_default: boolean;
}

export const SCENARIO_LIMITS = {
  ambient_C: { min: -40, max: 85 },
  wind_mps: { min: 0, max: 30 },
  solar_W_m2: { min: 0, max: 1500 },
  power_scale: { min: 0, max: 2 },
} as const;

export const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

export const SCHEMA_VERSION = '1.0';

export function defaultProjectContext(): ProjectContext {
  return {
    customer: '',
    owner: '',
    description: '',
    product_type: 'RRU',
    deployment: 'Outdoor',
    frequency_range: 'FR1',
    project_stage: 'Prototype',
    cooling_architecture: ['Natural Convection'],
    enclosure_type: 'Double-sided Cooling',
    main_heat_rejection: ['Finned Heat Sink'],
    notes: '',
  };
}

export function createEmptyProject(): Project {
  const now = new Date().toISOString();
  return {
    project_id: '',
    project_name: '',
    revision: createRevision('project'),
    project_context: defaultProjectContext(),
    active_scenario_id: null,
    status: 'active',
    meta: { created_at: now, updated_at: now, schema_version: SCHEMA_VERSION },
  };
}

/** Baseline scenario auto-created on first save — 01 §8, AC-03. */
export function createBaselineScenario(projectId: string): Scenario {
  return {
    id: 'SCN_001',
    project_id: projectId,
    revision: createRevision('scenario'),
    name: 'Baseline',
    ambient_C: 55,
    wind_mps: 0,
    solar_W_m2: 0,
    power_scale: 1,
    notes: '',
    is_default: true,
  };
}

/**
 * An additional scenario, authored in Screen 06 (00 §34).
 * It inherits the baseline environment so a new scenario starts from something
 * real rather than from zeros, and the engineer edits from there.
 */
export function createScenario(
  projectId: string,
  name: string,
  base?: Partial<Scenario>,
): Scenario {
  return {
    id: `SCN_${Date.now().toString(36).toUpperCase()}`,
    project_id: projectId,
    revision: createRevision('scenario'),
    name,
    ambient_C: base?.ambient_C ?? 55,
    wind_mps: base?.wind_mps ?? 0,
    solar_W_m2: base?.solar_W_m2 ?? 0,
    power_scale: base?.power_scale ?? 1,
    notes: '',
    is_default: false,
  };
}

/** Derive a database-key-safe Project ID from a display name. */
export function suggestProjectId(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return cleaned.toUpperCase();
}

/**
 * Maps a stored context onto the current option sets.
 *
 * Project files on disk outlive any one version of these lists, and the folder
 * is the source of truth — so an older file has to open, not break. Anything
 * unrecognised falls back to the default rather than being shown as a value the
 * dropdown cannot offer.
 */
export function normalizeProjectContext(raw: Partial<ProjectContext>): ProjectContext {
  const base = defaultProjectContext();

  const stage = LEGACY_STAGES[raw.project_stage as string] ?? raw.project_stage;
  const product = LEGACY_PRODUCTS[raw.product_type as string] ?? raw.product_type;
  const productType = PRODUCT_TYPES.includes(product as ProductType)
    ? (product as ProductType)
    : base.product_type;

  // A stored deployment is only kept if the product type actually allows it.
  const allowed = DEPLOYMENTS_BY_PRODUCT[productType];
  const storedDeployment =
    (raw.deployment as Deployment | undefined) ??
    (LEGACY_OUTDOOR_PRODUCTS.has(raw.product_type as string) ? 'Outdoor' : undefined);
  const deployment =
    storedDeployment && allowed.includes(storedDeployment)
      ? storedDeployment
      : // Prefer the overall default where the product allows it, so an
        // untouched context matches `defaultProjectContext` exactly.
        allowed.includes(base.deployment)
        ? base.deployment
        : defaultDeploymentFor(productType);

  // Was a single value before it became a list.
  const coolingAbsent = raw.cooling_architecture == null;
  const coolingRaw = Array.isArray(raw.cooling_architecture)
    ? raw.cooling_architecture
    : raw.cooling_architecture
      ? [raw.cooling_architecture as string]
      : [];
  const cooling = coolingRaw
    .map((entry) => LEGACY_COOLING[entry] ?? entry)
    .filter((entry): entry is CoolingArchitecture =>
      COOLING_ARCHITECTURES.includes(entry as CoolingArchitecture),
    );

  const rejectionAbsent = raw.main_heat_rejection == null;
  const rejection = (raw.main_heat_rejection ?? [])
    .map((entry) => LEGACY_REJECTION[entry] ?? entry)
    .filter((entry): entry is MainHeatRejection =>
      MAIN_HEAT_REJECTIONS.includes(entry as MainHeatRejection),
    );

  return {
    ...base,
    ...raw,
    product_type: productType,
    deployment,
    frequency_range: FREQUENCY_RANGES.includes(raw.frequency_range as FrequencyRange)
      ? (raw.frequency_range as FrequencyRange)
      : base.frequency_range,
    project_stage: PROJECT_STAGES.includes(stage as ProjectStage)
      ? (stage as ProjectStage)
      : base.project_stage,
    // Three cases, not two: absent takes the default; deliberately emptied
    // stays empty; and non-empty-but-nothing-survived means the stored values
    // are no longer offered, so falling back beats showing nothing.
    cooling_architecture:
      coolingAbsent || (coolingRaw.length > 0 && cooling.length === 0)
        ? base.cooling_architecture
        : [...new Set(cooling)],
    enclosure_type: ENCLOSURE_TYPES.includes(raw.enclosure_type as EnclosureType)
      ? (raw.enclosure_type as EnclosureType)
      : LEGACY_ENCLOSURE[raw.enclosure_type as string] ?? base.enclosure_type,
    main_heat_rejection: rejectionAbsent ? base.main_heat_rejection : [...new Set(rejection)],
    // A rejection list emptied by filtering is left empty: unlike cooling, the
    // legacy entries that vanish here (fan, heat pipe) moved to the mechanism
    // field rather than disappearing, so re-adding a surface would invent one.
  };
}

const LEGACY_STAGES: Record<string, ProjectStage> = {
  Concept: 'Prototype',
  Architecture: 'Prototype',
  MP: 'PVT',
  'Field Validation': 'PVT',
};

const LEGACY_PRODUCTS: Record<string, ProductType> = {
  'Outdoor Radio': 'RRU',
  'Indoor Radio': 'RRU',
  Custom: 'RRU',
};

const LEGACY_OUTDOOR_PRODUCTS = new Set(['Outdoor Radio', 'AAU']);

const LEGACY_COOLING: Record<string, CoolingArchitecture> = {
  'Forced Convection': 'Forced Convection (Fan)',
  'Heat Pipe Assisted': 'Heat Pipe',
  'Vapor Chamber Assisted': 'Vapor Chamber',
  Hybrid: 'Natural Convection',
  Custom: 'Natural Convection',
};

const LEGACY_ENCLOSURE: Record<string, EnclosureType> = {
  'Outdoor Sealed': 'Double-sided Cooling',
  'Outdoor Vented': 'Double-sided Cooling',
  Indoor: 'Double-sided Cooling',
  'IP-rated Custom': 'Double-sided Cooling',
  Custom: 'Double-sided Cooling',
};

const LEGACY_REJECTION: Record<string, MainHeatRejection> = {
  'Rear Heat Sink': 'Finned Heat Sink',
  'Front Heat Sink': 'Finned Heat Sink',
  'Side Heat Sink': 'Finned Heat Sink',
  'Housing Surface': 'Flat Housing Surface',
  'Liquid Cold Plate': 'Liquid Cold Plate',
};
