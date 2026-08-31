/**
 * Scenario & Boundary JSON — 12 §14, AC-12-16.
 *
 * §14's field list mixes the scenario record (Screen 01) with the boundary set
 * (Screen 06), so the document keeps both under their own keys instead of
 * flattening them: an importer needs to know which screen owns which number.
 *
 * Boundary profiles carry their own `source` and `confidence`, and those travel
 * with them — a boundary h of 12 W/m²K sourced from `Assumed` must not arrive
 * downstream looking like a measurement.
 */

import type { Scenario } from '@/domain/project';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';

import { EXPORT_SCHEMA_VERSION } from './exportTypes';

export interface ScenarioJsonInput {
  project_id: string;
  project_name: string;
  scenario: Scenario;
  boundary: ScenarioBoundaryConditionSet | null;
  exported_at: string;
  export_session_id: string;
}

export interface ScenarioJsonDocument {
  export_schema_version: string;
  exported_at: string;
  export_session_id: string;
  project: { id: string; name: string };

  scenario: {
    id: string;
    name: string;
    ambient_C: number;
    wind_mps: number;
    /** From the boundary set when Screen 06 recorded one; null otherwise. */
    wind_direction_deg: number | null;
    wind_direction_label: string | null;
    solar_W_m2: number;
    power_scale: number;
    notes: string;
    is_default: boolean;
  };

  boundary: {
    id: string;
    status: ScenarioBoundaryConditionSet['status'];
    ambient: ScenarioBoundaryConditionSet['ambient'];
    site: ScenarioBoundaryConditionSet['site'];
    /** 12 §14 "Boundary Models". */
    profiles: ScenarioBoundaryConditionSet['profiles'];
    /** 12 §14 "Boundary Overrides" — which port each profile is applied to. */
    assignments: ScenarioBoundaryConditionSet['assignments'];
    external_loads: ScenarioBoundaryConditionSet['external_loads'];
    surface_properties: ScenarioBoundaryConditionSet['surface_properties'];
    /** 12 §14 "Boundary Sources" — provenance per profile, pulled out for reading. */
    sources: Array<{ profile_id: string; name: string; source: string; confidence: string }>;
    updated_at: string;
    updated_by: string;
  } | null;

  metadata: {
    scenario_count_note: string;
    external_cfd_validation: 'Deferred';
  };
}

export function exportScenarioJson(input: ScenarioJsonInput): ScenarioJsonDocument {
  const { scenario, boundary } = input;

  return {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: input.exported_at,
    export_session_id: input.export_session_id,
    project: { id: input.project_id, name: input.project_name },

    scenario: {
      id: scenario.id,
      name: scenario.name,
      ambient_C: scenario.ambient_C,
      wind_mps: scenario.wind_mps,
      wind_direction_deg: boundary?.site.wind_direction_deg ?? null,
      wind_direction_label: boundary?.site.wind_direction_label ?? null,
      solar_W_m2: scenario.solar_W_m2,
      power_scale: scenario.power_scale,
      notes: scenario.notes,
      is_default: scenario.is_default,
    },

    boundary: boundary
      ? {
          id: boundary.id,
          status: boundary.status,
          ambient: boundary.ambient,
          site: boundary.site,
          profiles: boundary.profiles,
          assignments: boundary.assignments,
          external_loads: boundary.external_loads,
          surface_properties: boundary.surface_properties,
          sources: boundary.profiles.map((profile) => ({
            profile_id: profile.id,
            name: profile.name,
            source: profile.source,
            confidence: profile.confidence,
          })),
          updated_at: boundary.updated_at,
          updated_by: boundary.updated_by,
        }
      : null,

    metadata: {
      scenario_count_note: 'One scenario per export. Scenarios are exported individually (12 §14).',
      external_cfd_validation: 'Deferred',
    },
  };
}
