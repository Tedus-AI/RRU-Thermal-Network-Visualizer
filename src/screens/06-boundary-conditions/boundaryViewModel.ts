/**
 * Read-only projections for the Screen 06 UI — 06 §7, §11.
 *
 * Calculations live in `thermal/boundary`; this file only shapes them for
 * display, so no React component has to know how a KPI is counted.
 */

import type {
  BoundaryConditionProfile,
  BoundaryConditionType,
  BoundaryPort,
  ScenarioBoundaryConditionSet,
} from '@/thermal/boundary/types';

/** How each boundary type will be represented in the Screen 07 solve (06 §10.2). */
export const REPRESENTATION_FOR: Record<
  BoundaryConditionType,
  BoundaryConditionProfile['representation']
> = {
  ambient_reservoir: 'fixed_temperature_reservoir',
  convection_to_ambient: 'parallel_boundary_edges',
  radiation_to_surroundings: 'parallel_boundary_edges',
  combined_convection_radiation: 'single_combined_edge',
  solar_load: 'external_load_only',
  fixed_temperature_boundary: 'fixed_temperature_reservoir',
  adiabatic_symmetry: 'adiabatic_no_flow',
  external_cfd_placeholder: 'metadata_only',
};

export interface BoundarySummary {
  portsTotal: number;
  portsAssigned: number;
  convectionProfiles: number;
  convectionMissingInputs: number;
  radiationProfiles: number;
  solarLoads: number;
  fixedTemperatureProfiles: number;
  adiabaticProfiles: number;
  /** Percentage of dissipating ports that are assigned and not blocked. */
  readinessPct: number;
}

function isConvective(profile: BoundaryConditionProfile): boolean {
  return (
    profile.type === 'convection_to_ambient' ||
    profile.type === 'combined_convection_radiation'
  );
}

function isRadiative(profile: BoundaryConditionProfile): boolean {
  return (
    profile.type === 'radiation_to_surroundings' ||
    profile.type === 'combined_convection_radiation'
  );
}

export function summarize(
  set: ScenarioBoundaryConditionSet | null,
  ports: BoundaryPort[],
): BoundarySummary {
  const dissipating = ports.filter((port) => port.dissipating);

  if (!set) {
    return {
      portsTotal: dissipating.length,
      portsAssigned: 0,
      convectionProfiles: 0,
      convectionMissingInputs: 0,
      radiationProfiles: 0,
      solarLoads: 0,
      fixedTemperatureProfiles: 0,
      adiabaticProfiles: 0,
      readinessPct: 0,
    };
  }

  const assignedPorts = new Set(
    set.assignments
      .filter((assignment) => assignment.enabled && assignment.profile_ids.length > 0)
      .map((assignment) => assignment.boundary_port_id),
  );

  const convection = set.profiles.filter(isConvective);
  const missing = convection.filter(
    (profile) =>
      typeof profile.parameters.h_W_m2K !== 'number' ||
      (profile.parameters.h_W_m2K as number) <= 0 ||
      typeof profile.parameters.area_m2 !== 'number' ||
      (profile.parameters.area_m2 as number) <= 0,
  ).length;

  const dissipatingPortIds = new Set(dissipating.map((port) => port.id));
  const complete = set.derived_preview.filter(
    (preview) =>
      dissipatingPortIds.has(preview.boundary_port_id) && preview.completeness !== 'blocked',
  ).length;

  return {
    portsTotal: dissipating.length,
    portsAssigned: dissipating.filter((port) => assignedPorts.has(port.id)).length,
    convectionProfiles: convection.length,
    convectionMissingInputs: missing,
    radiationProfiles: set.profiles.filter(isRadiative).length,
    solarLoads: set.profiles.filter((profile) => profile.type === 'solar_load').length,
    fixedTemperatureProfiles: set.profiles.filter(
      (profile) => profile.type === 'fixed_temperature_boundary',
    ).length,
    adiabaticProfiles: set.profiles.filter((profile) => profile.type === 'adiabatic_symmetry')
      .length,
    readinessPct:
      dissipating.length === 0 ? 0 : Math.round((complete / dissipating.length) * 100),
  };
}

/** Profiles currently attached to one port. */
export function profilesForPort(
  set: ScenarioBoundaryConditionSet | null,
  portId: string,
): BoundaryConditionProfile[] {
  if (!set) return [];
  const assignment = set.assignments.find(
    (candidate) => candidate.boundary_port_id === portId && candidate.enabled,
  );
  if (!assignment) return [];
  return assignment.profile_ids
    .map((id) => set.profiles.find((profile) => profile.id === id))
    .filter(Boolean) as BoundaryConditionProfile[];
}

/** Canvas status for one port — 06 §8.2 visual rules. */
export type PortStatus = 'unassigned' | 'ok' | 'warning' | 'blocked' | 'adiabatic';

export function portStatus(
  set: ScenarioBoundaryConditionSet | null,
  port: BoundaryPort,
): PortStatus {
  if (!port.dissipating) {
    const ambient_C = set?.ambient.external_ambient_C;
    return ambient_C != null && Number.isFinite(ambient_C) ? 'ok' : 'blocked';
  }

  const profiles = profilesForPort(set, port.id);
  if (profiles.length === 0) return 'unassigned';
  if (profiles.some((profile) => profile.type === 'adiabatic_symmetry')) return 'adiabatic';

  const preview = set?.derived_preview.find(
    (candidate) => candidate.boundary_port_id === port.id,
  );
  if (!preview) return 'warning';
  if (preview.completeness === 'blocked') return 'blocked';
  if (preview.completeness === 'warning') return 'warning';
  return 'ok';
}

export const PORT_STATUS_LABELS: Record<PortStatus, { label: string; zh: string; tone: string }> = {
  unassigned: { label: 'Unassigned', zh: '未指定', tone: 'neutral' },
  ok: { label: 'Ready', zh: '就緒', tone: 'ok' },
  warning: { label: 'Assumption', zh: '含假設', tone: 'warn' },
  blocked: { label: 'Incomplete', zh: '不完整', tone: 'danger' },
  adiabatic: { label: 'Adiabatic', zh: '絕熱', tone: 'neutral' },
};

export function formatRth(value: number | null | undefined): string {
  return value == null ? 'N/A' : `${value.toFixed(4)} °C/W`;
}

export function formatNumber(value: number | null | undefined, digits = 2, unit = ''): string {
  return value == null ? 'N/A' : `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}
