/**
 * Read-only Screen 06 boundary values projected onto the Screen 05 graph.
 *
 * The topology remains scenario-independent. This module intentionally returns
 * view data instead of patching an edge or filling any of its Rth source slots.
 */

import { finRootLinkOf } from '@/thermal/boundary/boundaryPorts';
import { buildAllPreviews } from '@/thermal/boundary/validation';
import type {
  BoundaryConditionProfile,
  BoundaryDerivedPreview,
  BoundaryPort,
  ScenarioBoundaryConditionSet,
} from '@/thermal/boundary/types';
import type { ThermalEdge, ThermalNetwork } from '@/thermal/types';

export type ScenarioBoundaryKind = 'combined' | 'convection' | 'radiation' | 'fin_conduction';

/**
 * Where the projected coefficients came from.
 *
 * This is not decoration. A finned profile no longer READS `h_W_m2K`,
 * `area_m2` or `emissivity` — it computes all three from the geometry — but the
 * stored keys from an older manual setup are still sitting in the profile.
 * Showing those alongside a resistance they no longer produce is precisely the
 * mismatch this field exists to make impossible to render.
 */
export type ScenarioBoundarySource = 'fin_geometry' | 'plate_convection' | 'stated';

/** The fin's own gradient, carried so the graph can show what the step means. */
export interface ScenarioFinGradient {
  eta_fin: number;
  effectiveness: number;
  /** Tip excess temperature over root excess temperature, `1/cosh(m·Lc)`. */
  tipExcessRatio: number;
  mLc: number;
}

export interface ScenarioBoundaryEdgeView {
  edge_id: string;
  boundary_port_id: string;
  scenario_id: string;
  kind: ScenarioBoundaryKind;
  rth_C_per_W: number | null;
  /**
   * The coefficient this edge's resistance actually rests on: `h_conv` for a
   * convection edge, `h_rad` for a radiation edge, their SUM for an edge that
   * carries both. `rth = 1/(h·A)` holds for every kind, which is the property
   * the inspector needs and the one the old projection did not have.
   *
   * Null on a fin-conduction edge, which is a solid step and has no `h`.
   */
  h_W_m2K: number | null;
  h_conv_W_m2K: number | null;
  h_rad_W_m2K: number | null;
  emissivity: number | null;
  area_m2: number | null;
  ambient_C: number | null;
  source: ScenarioBoundarySource;
  fin: ScenarioFinGradient | null;
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
 * The coefficients and the area the preview actually used, in the same order of
 * precedence `buildDerivedPreview` used to produce the resistance.
 *
 * Reading the stored parameters instead is what made the Edge Inspector show
 * `h = 8.00`, `A = 0.890000` and `R = 0.1263 °C/W` at the same time: those two
 * inputs give 0.1404, and the 0.1263 came from the fin geometry, which had
 * replaced them without replacing what was displayed.
 */
function boundaryTermsOf(
  preview: BoundaryDerivedPreview,
  profiles: readonly BoundaryConditionProfile[],
  port: BoundaryPort,
): {
  h_conv: number | null;
  h_rad: number | null;
  area: number | null;
  emissivity: number | null;
  source: ScenarioBoundarySource;
  fin: ScenarioFinGradient | null;
} {
  const fin = preview.fin_array ?? null;
  if (fin) {
    return {
      h_conv: fin.h_conv_W_m2K,
      h_rad: fin.h_rad_W_m2K,
      area: fin.area_m2,
      // Neither the emissivity nor the view factor is consulted in fin mode:
      // the radiation fit already contains the emissivity, the cavity effect
      // and the envelope-to-wetted-area ratio. Reporting a stored emissivity
      // here would claim an input the resistance never saw.
      emissivity: null,
      source: 'fin_geometry',
      fin: {
        eta_fin: fin.eta_fin,
        effectiveness: fin.effectiveness,
        tipExcessRatio: fin.tipExcessRatio,
        mLc: fin.mLc,
      },
    };
  }

  const plate = preview.plate_convection ?? null;
  return {
    h_conv: plate?.h_conv_W_m2K ?? firstParameter(profiles, 'h_W_m2K', true),
    h_rad: finitePositive(preview.h_rad_W_m2K),
    area: firstParameter(profiles, 'area_m2', true) ?? finitePositive(port.area_m2),
    emissivity: firstParameter(profiles, 'emissivity'),
    source: plate ? 'plate_convection' : 'stated',
    fin: null,
  };
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
  const ambient_C = finiteNumber(set.ambient.external_ambient_C);

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
    const terms = boundaryTermsOf(preview, profiles, port);

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
      // One edge carrying both mechanisms rests on the SUM of the two
      // coefficients — that is what `calculateCombinedBoundaryRth` adds up — so
      // reporting only `h_conv` there would under-state the edge by the
      // radiation share and no longer reproduce its own resistance.
      const h =
        kind === 'radiation'
          ? terms.h_rad
          : kind === 'convection'
            ? terms.h_conv
            : terms.h_conv != null || terms.h_rad != null
              ? (terms.h_conv ?? 0) + (terms.h_rad ?? 0)
              : null;
      projected.set(edge.id, {
        edge_id: edge.id,
        boundary_port_id: port.id,
        scenario_id: set.scenario_id,
        kind,
        rth_C_per_W: rth,
        h_W_m2K: finitePositive(h),
        h_conv_W_m2K: kind === 'radiation' ? null : terms.h_conv,
        h_rad_W_m2K: kind === 'convection' ? null : terms.h_rad,
        emissivity: kind === 'convection' ? null : terms.emissivity,
        area_m2: terms.area,
        ambient_C,
        source: terms.source,
        fin: terms.fin,
        completeness: preview.completeness,
        resolved: preview.completeness !== 'blocked' && rth != null,
      });
    }

    // --- the fin's own conduction ------------------------------------------
    // Screen 07 moves this resistance onto the root-to-surface step as a
    // scenario override on its solve clone. Screen 05 shows the same number on
    // the same edge, chosen by the same helper, so the graph stops calling a
    // step "isothermal" that the solver is about to give a real gradient to.
    const finConduction = finitePositive(preview.fin_array?.conductionResistance_C_per_W);
    if (finConduction != null && terms.fin != null) {
      const link = finRootLinkOf(network, port.connected_node_id);
      if (link && !projected.has(link.id)) {
        projected.set(link.id, {
          edge_id: link.id,
          boundary_port_id: port.id,
          scenario_id: set.scenario_id,
          kind: 'fin_conduction',
          rth_C_per_W: finConduction,
          h_W_m2K: null,
          h_conv_W_m2K: null,
          h_rad_W_m2K: null,
          emissivity: null,
          area_m2: terms.area,
          ambient_C,
          source: 'fin_geometry',
          fin: terms.fin,
          completeness: preview.completeness,
          resolved: preview.completeness !== 'blocked',
        });
      }
    }
  }

  return projected;
}
