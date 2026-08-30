/**
 * Read-only Screen 06 boundary values projected onto the Screen 05 graph.
 *
 * The topology remains scenario-independent. This module intentionally returns
 * view data instead of patching an edge or filling any of its Rth source slots.
 */

import { buildAllPreviews } from '@/thermal/boundary/validation';
import type {
  BoundaryConditionProfile,
  BoundaryPort,
  ScenarioBoundaryConditionSet,
} from '@/thermal/boundary/types';
import type { ThermalEdge, ThermalNetwork } from '@/thermal/types';

export type ScenarioBoundaryKind = 'combined' | 'convection' | 'radiation';

export interface ScenarioBoundaryEdgeView {
  edge_id: string;
  boundary_port_id: string;
  scenario_id: string;
  kind: ScenarioBoundaryKind;
  rth_C_per_W: number | null;
  h_W_m2K: number | null;
  emissivity: number | null;
  area_m2: number | null;
  ambient_C: number | null;
  completeness: 'complete' | 'warning' | 'blocked';
  resolved: boolean;
}

const BOUNDARY_METHODS = new Set<ThermalEdge['method']>(['convection_hA', 'radiation_hA']);

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstParameter(
  profiles: readonly BoundaryConditionProfile[],
  key: string,
  positive = false,
): number | null {
  for (const profile of profiles) {
    const value = positive
      ? finitePositive(profile.parameters[key])
      : finiteNumber(profile.parameters[key]);
    if (value != null) return value;
  }
  return null;
}

/**
 * Mirrors the boundary-edge selection in Screen 07's solve-input builder, but
 * returns display-only records for Screen 05. Preview values are recomputed so
 * the graph never renders a stale resistance saved before the latest edit.
 */
export function projectScenarioBoundaryEdges(
  network: ThermalNetwork | null,
  ports: readonly BoundaryPort[],
  set: ScenarioBoundaryConditionSet | null,
): ReadonlyMap<string, ScenarioBoundaryEdgeView> {
  const projected = new Map<string, ScenarioBoundaryEdgeView>();
  if (!network || !set) return projected;

  const previews = buildAllPreviews(set, [...ports]);
  const previewByPort = new Map(previews.map((preview) => [preview.boundary_port_id, preview]));
  const profileById = new Map(set.profiles.map((profile) => [profile.id, profile]));
  const portById = new Map(ports.map((port) => [port.id, port]));

  for (const assignment of set.assignments) {
    if (!assignment.enabled) continue;
    const port = portById.get(assignment.boundary_port_id);
    if (!port?.dissipating) continue;
    const preview = previewByPort.get(port.id);
    if (!preview) continue;

    const profiles = assignment.profile_ids
      .map((profileId) => profileById.get(profileId))
      .filter((profile): profile is BoundaryConditionProfile => profile != null);
    const hasConvection = profiles.some(
      (profile) =>
        profile.type === 'convection_to_ambient' ||
        profile.type === 'combined_convection_radiation',
    );
    const hasRadiation = profiles.some(
      (profile) =>
        profile.type === 'radiation_to_surroundings' ||
        profile.type === 'combined_convection_radiation',
    );
    if (!hasConvection && !hasRadiation) continue;

    const edges = Object.values(network.edges).filter(
      (edge) =>
        edge.enabled &&
        BOUNDARY_METHODS.has(edge.method) &&
        (edge.from === port.connected_node_id || edge.to === port.connected_node_id),
    );
    const parallel =
      edges.some((edge) => edge.method === 'convection_hA') &&
      edges.some((edge) => edge.method === 'radiation_hA');
    const h = firstParameter(profiles, 'h_W_m2K', true);
    const emissivity = firstParameter(profiles, 'emissivity');
    const area = firstParameter(profiles, 'area_m2', true) ?? finitePositive(port.area_m2);

    for (const edge of edges) {
      const kind: ScenarioBoundaryKind = parallel
        ? edge.method === 'radiation_hA'
          ? 'radiation'
          : 'convection'
        : 'combined';
      const rawRth = parallel
        ? kind === 'radiation'
          ? preview.r_rad_C_per_W
          : preview.r_conv_C_per_W
        : (preview.r_combined_C_per_W ??
          preview.r_conv_C_per_W ??
          preview.r_rad_C_per_W);
      const rth = finitePositive(rawRth);
      projected.set(edge.id, {
        edge_id: edge.id,
        boundary_port_id: port.id,
        scenario_id: set.scenario_id,
        kind,
        rth_C_per_W: rth,
        h_W_m2K: h,
        emissivity,
        area_m2: area,
        ambient_C: finiteNumber(set.ambient.external_ambient_C),
        completeness: preview.completeness,
        resolved: preview.completeness !== 'blocked' && rth != null,
      });
    }
  }

  return projected;
}
