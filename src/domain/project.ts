/**
 * Project & Scenario domain model — 01_Project_Info.md §24, §25, §36.
 *
 * Storage shape follows 01 §36: everything this tool owns lives under
 * `project_context` so it cannot collide with the columns the existing
 * 5G RRU Quick Volume Evaluation Tool keeps on the same project document.
 */

export const PROJECT_STAGES = [
  'Concept',
  'Architecture',
  'EVT',
  'DVT',
  'PVT',
  'MP',
  'Field Validation',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PRODUCT_TYPES = [
  'RRU',
  'AAU',
  'Small Cell',
  'Outdoor Radio',
  'Indoor Radio',
  'Custom',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** V1 product scope is FR1; the field is shown but locked (01 §7.2). */
export const FREQUENCY_RANGES = ['FR1'] as const;
export type FrequencyRange = (typeof FREQUENCY_RANGES)[number];

export const COOLING_ARCHITECTURES = [
  'Natural Convection',
  'Forced Convection',
  'Heat Pipe Assisted',
  'Vapor Chamber Assisted',
  'Liquid Cooling',
  'Hybrid',
  'Custom',
] as const;
export type CoolingArchitecture = (typeof COOLING_ARCHITECTURES)[number];

export const ENCLOSURE_TYPES = [
  'Outdoor Sealed',
  'Outdoor Vented',
  'Indoor',
  'IP-rated Custom',
  'Custom',
] as const;
export type EnclosureType = (typeof ENCLOSURE_TYPES)[number];

export const MAIN_HEAT_REJECTIONS = [
  'Rear Heat Sink',
  'Front Heat Sink',
  'Side Heat Sink',
  'Housing Surface',
  'Heat Pipe',
  'Internal Fan',
  'External Fan',
  'Liquid Cold Plate',
  'Other',
] as const;
export type MainHeatRejection = (typeof MAIN_HEAT_REJECTIONS)[number];

export const BASE_ARCHITECTURES = [
  'Single Main Base',
  'Multi-zone Main Base',
  'Small Base + Main Base',
  'Heat Pipe + Main Base',
  'Direct Housing',
  'Custom',
] as const;
export type BaseArchitecture = (typeof BASE_ARCHITECTURES)[number];

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
  frequency_range: FrequencyRange;
  project_stage: ProjectStage;
  cooling_architecture: CoolingArchitecture;
  enclosure_type: EnclosureType;
  main_heat_rejection: MainHeatRejection[];
  base_architecture: BaseArchitecture;
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
    frequency_range: 'FR1',
    project_stage: 'Concept',
    cooling_architecture: 'Natural Convection',
    enclosure_type: 'Outdoor Sealed',
    main_heat_rejection: ['Rear Heat Sink'],
    base_architecture: 'Single Main Base',
    notes: '',
  };
}

export function createEmptyProject(): Project {
  const now = new Date().toISOString();
  return {
    project_id: '',
    project_name: '',
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
    name: 'Baseline',
    ambient_C: 55,
    wind_mps: 0,
    solar_W_m2: 0,
    power_scale: 1,
    notes: '',
    is_default: true,
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
