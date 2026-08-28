/**
 * Scenario boundary conditions — 06 §9, §10.
 *
 * The separation this file exists to enforce (06 §10.1, §2.4): the Screen 05
 * topology is scenario-INDEPENDENT and read-only here. Ambient temperature,
 * convection h, radiation parameters, solar load and fixed-temperature values
 * live in a `ScenarioBoundaryConditionSet` keyed by project + network +
 * scenario, never inside a graph node or edge.
 *
 * Naming note: 06 §10.2 sketches the contract in camelCase. The codebase settled
 * on snake_case in Screen 02 and kept it through 04 and 05, so the field
 * semantics are followed exactly and the casing stays consistent. The mock file
 * shipped with the specification is camelCase and is converted on read by
 * `mockAdapter.ts`.
 */

import type { Confidence } from '../types';

export const BOUNDARY_CONDITION_TYPES = [
  'ambient_reservoir',
  'convection_to_ambient',
  'radiation_to_surroundings',
  'combined_convection_radiation',
  'solar_load',
  'fixed_temperature_boundary',
  'adiabatic_symmetry',
  'external_cfd_placeholder',
] as const;
export type BoundaryConditionType = (typeof BOUNDARY_CONDITION_TYPES)[number];

export const BOUNDARY_TYPE_LABELS: Record<
  BoundaryConditionType,
  { label: string; zh: string }
> = {
  ambient_reservoir: { label: 'Ambient Reservoir', zh: '環境溫度參考' },
  convection_to_ambient: { label: 'Convection to Ambient', zh: '對流至環境' },
  radiation_to_surroundings: { label: 'Radiation to Surroundings', zh: '輻射至周圍' },
  combined_convection_radiation: { label: 'Combined Convection + Radiation', zh: '對流 + 輻射' },
  solar_load: { label: 'Solar Load', zh: '太陽熱負載' },
  fixed_temperature_boundary: { label: 'Fixed Temperature', zh: '固定溫度邊界' },
  adiabatic_symmetry: { label: 'Adiabatic / Symmetry', zh: '絕熱 / 對稱' },
  external_cfd_placeholder: { label: 'External CFD (placeholder)', zh: '外部 CFD 佔位' },
};

/** 06 §10.2 — how the profile will be represented in the Screen 07 solve. */
export type BoundaryRepresentation =
  | 'single_combined_edge'
  | 'parallel_boundary_edges'
  | 'external_load_only'
  | 'fixed_temperature_reservoir'
  | 'adiabatic_no_flow'
  | 'metadata_only';

/** 06 §10.2 `ThermalDataSource`, spelled to match the rest of the codebase. */
export type BoundaryDataSource =
  | 'manual'
  | 'analytical'
  | 'datasheet'
  | 'assumed'
  | 'measurement'
  | 'flotherm'
  | 'vendor';

export interface ProvenanceRecord {
  source_label: string;
  reference?: string;
  author?: string;
  created_at?: string;
  change_reason?: string;
}

/**
 * Reserved for Screen 03 — 06 §2.2, §8.3 Mapping tab.
 * Aliases are free text. Nothing here parses a FloTHERM file.
 */
export interface ExternalBoundaryMappings {
  flotherm_object_alias?: string;
  flotherm_surface_alias?: string;
  flotherm_result_table_alias?: string;
  measurement_point_alias?: string;
  import_status: 'deferred' | 'not_mapped' | 'mapped_metadata_only';
}

export function emptyBoundaryMappings(): ExternalBoundaryMappings {
  return { import_status: 'deferred' };
}

/**
 * A boundary port DERIVED from the saved Screen 05 topology (06 §5 step 2).
 *
 * It is not stored in the boundary set and never written back to the graph: it
 * is a read-only projection of the topology so the scenario can attach
 * conditions to it.
 */
export interface BoundaryPort {
  id: string;
  name: string;
  /** Graph node this port belongs to. */
  connected_node_id: string;
  /** Boundary-derived edge from Screen 05, when the port came from one. */
  boundary_edge_id?: string;
  surface_group_id: string;
  /** Surface area, m². Unknown until the engineer supplies it (never 0). */
  area_m2: number | null;
  orientation: string;
  allowed_boundary_types: BoundaryConditionType[];
  /** True when heat can leave the model through this port. */
  dissipating: boolean;
  external_mappings: ExternalBoundaryMappings;
}

export interface BoundaryConditionProfile {
  id: string;
  name: string;
  type: BoundaryConditionType;
  representation: BoundaryRepresentation;
  /** Type-specific inputs; see 06 §9 for the required keys per type. */
  parameters: Record<string, number | string | boolean | null | undefined>;
  source: BoundaryDataSource;
  confidence: Confidence;
  provenance?: ProvenanceRecord;
  external_mappings?: ExternalBoundaryMappings;
}

export interface BoundaryAssignment {
  id: string;
  boundary_port_id: string;
  boundary_edge_id?: string;
  profile_ids: string[];
  surface_group_id?: string;
  assignment_mode: 'manual' | 'generated_default' | 'applied_to_similar';
  enabled: boolean;
}

/**
 * Solar is an external heat INPUT, not a resistance (06 §9.5). It is stored
 * separately from component power and Screen 07 decides how to inject it.
 */
export interface ExternalHeatLoad {
  id: string;
  type: 'solar';
  target_boundary_port_id: string;
  target_node_id: string;
  q_W: number | null;
  source_profile_id: string;
  inject_in_screen_07: boolean;
}

export interface BoundaryDerivedPreview {
  boundary_port_id: string;
  profile_ids: string[];
  h_rad_W_m2K?: number | null;
  r_conv_C_per_W?: number | null;
  r_rad_C_per_W?: number | null;
  r_combined_C_per_W?: number | null;
  q_solar_W?: number | null;
  completeness: 'complete' | 'warning' | 'blocked';
  /** 06 §8.3 — the label that keeps a preview from reading as a result. */
  disclaimer: 'pre_solve_boundary_input_only';
}

export interface BoundaryValidationMessage {
  id: string;
  severity: 'error' | 'warning' | 'info';
  boundary_port_id?: string;
  profile_id?: string;
  message: string;
  message_zh: string;
  suggested_action?: string;
}

export interface BoundaryValidationState {
  status: 'blocked' | 'warnings' | 'ready_for_07';
  errors: BoundaryValidationMessage[];
  warnings: BoundaryValidationMessage[];
  infos: BoundaryValidationMessage[];
}

export interface AmbientDefinition {
  external_ambient_C: number | null;
  internal_air_C?: number | null;
  radiation_surrounding_C?: number | null;
  source: BoundaryDataSource;
  confidence: Confidence;
  provenance?: ProvenanceRecord;
}

export type AirflowMode = 'natural' | 'forced' | 'external_wind' | 'fan_blower';
export type ConvectionMethod = 'manual_h' | 'preset' | 'future_correlation';

export interface SiteConditions {
  altitude_m?: number | null;
  wind_speed_m_s?: number | null;
  wind_direction_deg?: number | null;
  wind_direction_label?: string;
  airflow_mode: AirflowMode;
  convection_method: ConvectionMethod;
  solar_enabled: boolean;
  solar_irradiance_W_m2?: number | null;
  solar_incidence_deg?: number | null;
  notes?: string;
}

/** Emissivity / absorptivity per surface group — 06 §8.1, PNG section 2. */
export interface SurfaceProperty {
  surface_group_id: string;
  name: string;
  emissivity: number | null;
  absorptivity: number | null;
  /** Optional swatch so a surface can be recognised on the canvas. */
  color?: string;
  source: BoundaryDataSource;
}

export const BOUNDARY_SET_SCHEMA_VERSION = '1.0';

export interface ScenarioBoundaryConditionSet {
  id: string;
  schema_version: string;
  project_id: string;
  network_id: string;
  scenario_id: string;
  /** 06 §14.2 — lets 06 notice that Screen 05 changed underneath it. */
  network_topology_version: number;
  status: 'draft' | 'needs_review' | 'ready_for_solve';
  ambient: AmbientDefinition;
  site: SiteConditions;
  profiles: BoundaryConditionProfile[];
  assignments: BoundaryAssignment[];
  external_loads: ExternalHeatLoad[];
  derived_preview: BoundaryDerivedPreview[];
  validation: BoundaryValidationState;
  surface_properties: SurfaceProperty[];
  created_at: string;
  updated_at: string;
  updated_by: string;
  source_screen: '06_Boundary_Conditions';
}

export function emptyValidationState(): BoundaryValidationState {
  return { status: 'blocked', errors: [], warnings: [], infos: [] };
}

export function createBoundarySet(input: {
  projectId: string;
  networkId: string;
  scenarioId: string;
  topologyVersion: number;
  ambient_C?: number | null;
  wind_m_s?: number | null;
  solar_W_m2?: number | null;
}): ScenarioBoundaryConditionSet {
  const now = new Date().toISOString();
  return {
    id: `BCS_${input.projectId}_${input.scenarioId}`,
    schema_version: BOUNDARY_SET_SCHEMA_VERSION,
    project_id: input.projectId,
    network_id: input.networkId,
    scenario_id: input.scenarioId,
    network_topology_version: input.topologyVersion,
    status: 'draft',
    ambient: {
      // Seeded from the scenario record, but unknown stays null — never 0.
      external_ambient_C: input.ambient_C ?? null,
      internal_air_C: null,
      radiation_surrounding_C: null,
      source: 'manual',
      confidence: 'medium',
    },
    site: {
      altitude_m: 0,
      wind_speed_m_s: input.wind_m_s ?? null,
      wind_direction_deg: null,
      airflow_mode: (input.wind_m_s ?? 0) > 0 ? 'external_wind' : 'natural',
      convection_method: 'manual_h',
      solar_enabled: (input.solar_W_m2 ?? 0) > 0,
      solar_irradiance_W_m2: input.solar_W_m2 ?? null,
      solar_incidence_deg: null,
    },
    profiles: [],
    assignments: [],
    external_loads: [],
    derived_preview: [],
    validation: emptyValidationState(),
    surface_properties: [],
    created_at: now,
    updated_at: now,
    updated_by: 'Thermal_Engineer',
    source_screen: '06_Boundary_Conditions',
  };
}
