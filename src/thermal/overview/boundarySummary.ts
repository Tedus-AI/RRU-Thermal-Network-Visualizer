/**
 * The boundary conditions the solve actually ran on, as a short list.
 *
 * Screen 10 used to offer a button reading "View Boundary Conditions", which
 * asked the reader to leave the conclusion, load Screen 06, find the port, read
 * the number and come back. The numbers are four or five short rows; the ones
 * that decide the answer are how the heat leaves the machine and what it leaves
 * into, so they belong on the page that reports the answer.
 *
 * Read-only and read from the SET, never recomputed: the resistances here are
 * the ones Screen 06 derived and Screen 07 solved with, so this cannot quietly
 * disagree with the temperatures beside it.
 */

import type {
  BoundaryPort,
  ScenarioBoundaryConditionSet,
} from '../boundary/types';
import { BOUNDARY_TYPE_LABELS } from '../boundary/types';

export interface BoundarySurfaceRow {
  port_id: string;
  /** The surface, as Screen 06 names it. */
  name: string;
  /** What kind of boundary it is — "Combined Convection + Radiation". */
  kind: string;
  kind_zh: string;
  /**
   * How the coefficient was arrived at, when the profile did more than state
   * one: fin geometry, or a plate correlation. Null when it was stated.
   */
  derivation: 'fin_array' | 'flat_plate' | null;
  h_W_m2K: number | null;
  area_m2: number | null;
  /** The resistance the solve used for this surface, °C/W. */
  R_C_per_W: number | null;
  /** Screen 06's own completeness for this port. */
  completeness: 'complete' | 'warning' | 'blocked';
}

export interface BoundarySummary {
  external_ambient_C: number | null;
  internal_air_C: number | null;
  /** Σ solar injected through this set, W. */
  solar_W: number;
  status: ScenarioBoundaryConditionSet['status'];
  surfaces: BoundarySurfaceRow[];
}

/**
 * The dissipating surfaces, smallest resistance first.
 *
 * Smallest first because that is the one carrying the heat: on a finned RRU
 * the fin array is an order of magnitude below everything else, and a list
 * that opened with a housing panel would bury the surface that matters.
 */
export function boundarySummary(
  set: ScenarioBoundaryConditionSet | null,
  ports: readonly BoundaryPort[],
): BoundarySummary | null {
  if (!set) return null;

  const portById = new Map(ports.map((port) => [port.id, port]));
  const profileById = new Map(set.profiles.map((profile) => [profile.id, profile]));
  const enabled = new Set(
    set.assignments.filter((entry) => entry.enabled).map((entry) => entry.boundary_port_id),
  );

  const surfaces: BoundarySurfaceRow[] = [];
  for (const preview of set.derived_preview) {
    if (!enabled.has(preview.boundary_port_id)) continue;
    const port = portById.get(preview.boundary_port_id);
    const profile = preview.profile_ids
      .map((id) => profileById.get(id))
      .find((entry) => entry !== undefined);
    // A port that only carries solar is a heat INPUT, not a way out; it is
    // reported by `solar_W` rather than as a surface with a resistance.
    const resistance =
      preview.r_combined_C_per_W ?? preview.r_conv_C_per_W ?? preview.r_rad_C_per_W ?? null;
    if (resistance == null && !preview.fin_array && !preview.plate_convection) continue;

    surfaces.push({
      port_id: preview.boundary_port_id,
      name: port?.name ?? preview.boundary_port_id,
      kind: profile ? BOUNDARY_TYPE_LABELS[profile.type].label : 'Boundary',
      kind_zh: profile ? BOUNDARY_TYPE_LABELS[profile.type].zh : '邊界',
      derivation: preview.fin_array ? 'fin_array' : preview.plate_convection ? 'flat_plate' : null,
      h_W_m2K:
        preview.fin_array?.h_total_W_m2K ??
        preview.plate_convection?.h_conv_W_m2K ??
        numeric(profile?.parameters.h_W_m2K) ??
        null,
      area_m2: preview.fin_array?.area_m2 ?? port?.area_m2 ?? null,
      R_C_per_W: preview.fin_array?.R_C_per_W ?? resistance,
      completeness: preview.completeness,
    });
  }

  surfaces.sort((a, b) => (a.R_C_per_W ?? Infinity) - (b.R_C_per_W ?? Infinity));

  return {
    external_ambient_C: set.ambient.external_ambient_C ?? null,
    internal_air_C: set.ambient.internal_air_C ?? null,
    solar_W: set.external_loads.reduce((sum, load) => sum + (load.q_W ?? 0), 0),
    status: set.status,
    surfaces,
  };
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
