/**
 * Reads the specification's mock boundary set — `06_Boundary_Conditions_mock.json`.
 *
 * 06 §10.2 writes the contract in camelCase; the codebase is snake_case. Rather
 * than fork the naming convention, the conversion happens here, at the edge.
 * This is also what makes the acceptance item "the mock JSON loads without
 * parser errors" a thing that can actually be tested.
 *
 * It is a converter, not a parser of unknown formats: every field it reads is
 * one the specification defines.
 */

import { BOUNDARY_SET_SCHEMA_VERSION, emptyValidationState } from './types';
import type {
  BoundaryAssignment,
  BoundaryConditionProfile,
  BoundaryConditionType,
  BoundaryDerivedPreview,
  BoundaryPort,
  ExternalBoundaryMappings,
  ExternalHeatLoad,
  ScenarioBoundaryConditionSet,
} from './types';
import type { Confidence } from '../types';

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw => (value && typeof value === 'object' ? (value as Raw) : {});
const asArray = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function mappings(value: unknown): ExternalBoundaryMappings {
  const raw = asRecord(value);
  const status = asString(raw.importStatus, 'deferred');
  return {
    flotherm_object_alias: raw.flothermObjectAlias as string | undefined,
    flotherm_surface_alias: raw.flothermSurfaceAlias as string | undefined,
    flotherm_result_table_alias: raw.flothermResultTableAlias as string | undefined,
    measurement_point_alias: raw.measurementPointAlias as string | undefined,
    import_status:
      status === 'mapped_metadata_only' || status === 'not_mapped' ? status : 'deferred',
  };
}

export function boundaryPortsFromMock(json: unknown): BoundaryPort[] {
  const topology = asRecord(asRecord(json).thermalNetworkTopologyFrom05);
  return asArray(topology.boundaryPorts).map((raw) => ({
    id: asString(raw.id),
    name: asString(raw.name),
    connected_node_id: asString(raw.connectedNodeId),
    boundary_edge_id: raw.boundaryEdgeId as string | undefined,
    surface_group_id: asString(raw.surfaceGroupId),
    area_m2: asNumber(raw.area_m2),
    orientation: asString(raw.orientation, 'unspecified'),
    allowed_boundary_types: (Array.isArray(raw.allowedBoundaryTypes)
      ? (raw.allowedBoundaryTypes as BoundaryConditionType[])
      : []) as BoundaryConditionType[],
    // A port that may only be a fixed temperature or insulated still counts as
    // an opening the scenario has to answer for.
    dissipating: true,
    external_mappings: mappings(raw.externalMappings),
  }));
}

export function boundarySetFromMock(json: unknown): ScenarioBoundaryConditionSet {
  const root = asRecord(json);
  const set = asRecord(root.scenarioBoundaryConditionSet);
  const ambient = asRecord(set.ambientDefinition);
  const site = asRecord(set.siteConditions);
  const provenance = asRecord(ambient.provenance);

  const profiles: BoundaryConditionProfile[] = asArray(set.profiles).map((raw) => {
    const prov = asRecord(raw.provenance);
    return {
      id: asString(raw.id),
      name: asString(raw.name),
      type: asString(raw.type, 'external_cfd_placeholder') as BoundaryConditionType,
      representation: asString(
        raw.representation,
        'metadata_only',
      ) as BoundaryConditionProfile['representation'],
      parameters: asRecord(raw.parameters) as BoundaryConditionProfile['parameters'],
      source: asString(raw.source, 'manual') as BoundaryConditionProfile['source'],
      confidence: asString(raw.confidence, 'medium') as Confidence,
      provenance: prov.sourceLabel
        ? {
            source_label: asString(prov.sourceLabel),
            reference: prov.reference as string | undefined,
            author: prov.author as string | undefined,
            created_at: prov.createdAt as string | undefined,
            change_reason: prov.changeReason as string | undefined,
          }
        : undefined,
      external_mappings: mappings(raw.externalMappings),
    };
  });

  const assignments: BoundaryAssignment[] = asArray(set.assignments).map((raw) => ({
    id: asString(raw.id),
    boundary_port_id: asString(raw.boundaryPortId),
    boundary_edge_id: raw.boundaryEdgeId as string | undefined,
    profile_ids: Array.isArray(raw.profileIds) ? (raw.profileIds as string[]) : [],
    surface_group_id: raw.surfaceGroupId as string | undefined,
    assignment_mode: asString(
      raw.assignmentMode,
      'manual',
    ) as BoundaryAssignment['assignment_mode'],
    enabled: raw.enabled !== false,
  }));

  const externalLoads: ExternalHeatLoad[] = asArray(set.externalLoads).map((raw) => ({
    id: asString(raw.id),
    type: 'solar',
    target_boundary_port_id: asString(raw.targetBoundaryPortId),
    target_node_id: asString(raw.targetNodeId),
    q_W: asNumber(raw.q_W),
    source_profile_id: asString(raw.sourceProfileId),
    inject_in_screen_07: raw.injectInScreen07 !== false,
  }));

  const derivedPreview: BoundaryDerivedPreview[] = asArray(set.derivedPreview).map((raw) => ({
    boundary_port_id: asString(raw.boundaryPortId),
    profile_ids: Array.isArray(raw.profileIds) ? (raw.profileIds as string[]) : [],
    h_rad_W_m2K: asNumber(raw.hrad_W_m2K),
    r_conv_C_per_W: asNumber(raw.rconv_C_per_W),
    r_rad_C_per_W: asNumber(raw.rrad_C_per_W),
    r_combined_C_per_W: asNumber(raw.rcombined_C_per_W),
    q_solar_W: asNumber(raw.qsolar_W),
    completeness: asString(
      raw.completeness,
      'blocked',
    ) as BoundaryDerivedPreview['completeness'],
    disclaimer: 'pre_solve_boundary_input_only',
  }));

  const now = new Date().toISOString();

  return {
    id: asString(set.id, 'BCS_MOCK'),
    schema_version: BOUNDARY_SET_SCHEMA_VERSION,
    project_id: asString(set.projectId),
    network_id: asString(set.networkId),
    scenario_id: asString(set.scenarioId),
    network_topology_version: asNumber(set.networkTopologyVersion) ?? 1,
    status: asString(set.status, 'draft') as ScenarioBoundaryConditionSet['status'],
    ambient: {
      external_ambient_C: asNumber(ambient.externalAmbient_C),
      internal_air_C: asNumber(ambient.internalAir_C),
      radiation_surrounding_C: asNumber(ambient.radiationSurrounding_C),
      source: asString(ambient.source, 'manual') as ScenarioBoundaryConditionSet['ambient']['source'],
      confidence: asString(ambient.confidence, 'medium') as Confidence,
      provenance: provenance.sourceLabel
        ? {
            source_label: asString(provenance.sourceLabel),
            reference: provenance.reference as string | undefined,
            author: provenance.author as string | undefined,
            created_at: provenance.createdAt as string | undefined,
            change_reason: provenance.changeReason as string | undefined,
          }
        : undefined,
    },
    site: {
      altitude_m: asNumber(site.altitude_m),
      wind_speed_m_s: asNumber(site.windSpeed_m_s),
      wind_direction_deg: asNumber(site.windDirection_deg),
      airflow_mode: asString(site.airflowMode, 'natural') as ScenarioBoundaryConditionSet['site']['airflow_mode'],
      convection_method: asString(
        site.convectionMethod,
        'manual_h',
      ) as ScenarioBoundaryConditionSet['site']['convection_method'],
      solar_enabled: site.solarEnabled === true,
      solar_irradiance_W_m2: asNumber(site.solarIrradiance_W_m2),
      solar_incidence_deg: asNumber(site.solarIncidence_deg),
      notes: site.notes as string | undefined,
    },
    profiles,
    assignments,
    external_loads: externalLoads,
    derived_preview: derivedPreview,
    // The mock ships a validation snapshot; the app recomputes it on load so a
    // stale snapshot can never make a blocked set look ready.
    validation: emptyValidationState(),
    surface_properties: [],
    created_at: asString(set.updatedAt, now),
    updated_at: asString(set.updatedAt, now),
    updated_by: asString(set.updatedBy, 'Thermal_Engineer'),
    source_screen: '06_Boundary_Conditions',
  };
}

/** Topology version recorded by the mock, for the stale-topology check. */
export function topologyVersionFromMock(json: unknown): number {
  const topology = asRecord(asRecord(json).thermalNetworkTopologyFrom05);
  return asNumber(topology.networkTopologyVersion) ?? 1;
}
