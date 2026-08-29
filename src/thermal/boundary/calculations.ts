/**
 * Boundary input calculations — 06 §13.
 *
 * Everything here is a PRE-SOLVE BOUNDARY INPUT. None of it is a solved node
 * temperature, an edge heat flow or a temperature drop: those belong to Screen
 * 07 (06 §3.3, §8.3). A missing input yields `null`, never 0.
 */

import type {
  BoundaryConditionProfile,
  BoundaryDerivedPreview,
  BoundaryPort,
} from './types';

/** Stefan–Boltzmann constant, W/m²K⁴. */
export const SIGMA = 5.670374419e-8;

/** Surface temperature guess used when the engineer supplies none (06 §13.2). */
export const DEFAULT_SURFACE_GUESS_OFFSET_C = 35;

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function inUnitRange(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** R_conv = 1 / (h · A). Null when either input is missing or non-positive. */
export function calculateConvectionRth(
  h_W_m2K: number | null | undefined,
  area_m2: number | null | undefined,
): number | null {
  const h = positive(h_W_m2K);
  const area = positive(area_m2);
  if (h == null || area == null) return null;
  return 1 / (h * area);
}

/**
 * Linearised radiation coefficient, 06 §13.2:
 *   h_rad ≈ 4 · ε · σ · F · T_ref_K³
 *
 * The reference temperature is the engineer's pre-solve surface guess. Screen 06
 * cannot know the real surface temperature — that is the whole point of Screen
 * 07 — so the guess is an explicit, visible assumption.
 */
export function calculateLinearizedRadiationHrad(input: {
  emissivity: number | null | undefined;
  viewFactor: number | null | undefined;
  surfaceReferenceTemperatureGuess_C: number | null | undefined;
}): number | null {
  const emissivity = inUnitRange(input.emissivity);
  const viewFactor = inUnitRange(input.viewFactor);
  const tGuess = numeric(input.surfaceReferenceTemperatureGuess_C);
  if (emissivity == null || viewFactor == null || tGuess == null) return null;

  const tRefK = tGuess + 273.15;
  if (tRefK <= 0) return null;
  return 4 * emissivity * SIGMA * viewFactor * tRefK ** 3;
}

/** R_rad = 1 / (h_rad · A). */
export function calculateRadiationRth(
  hrad_W_m2K: number | null | undefined,
  area_m2: number | null | undefined,
): number | null {
  const hrad = positive(hrad_W_m2K);
  const area = positive(area_m2);
  if (hrad == null || area == null) return null;
  return 1 / (hrad * area);
}

/**
 * Convection and radiation act in PARALLEL to the same environment, so their
 * conductances add — 06 §13.3. Summing the resistances would be wrong physics.
 */
export function calculateCombinedBoundaryRth(input: {
  hconv_W_m2K?: number | null;
  hrad_W_m2K?: number | null;
  area_m2?: number | null;
}): number | null {
  const area = positive(input.area_m2);
  if (area == null) return null;

  const gConv = (positive(input.hconv_W_m2K) ?? 0) * area;
  const gRad = (positive(input.hrad_W_m2K) ?? 0) * area;
  const gTotal = gConv + gRad;
  if (gTotal <= 0) return null;
  return 1 / gTotal;
}

/**
 * Q_solar = G · A · α · projected · shading — 06 §13.4.
 * The result is an external heat INPUT, never a resistance and never added to
 * component power.
 */
export function calculateSolarHeatLoad(input: {
  irradiance_W_m2?: number | null;
  receivingArea_m2?: number | null;
  absorptivity?: number | null;
  projectedAreaFactor?: number | null;
  shadingFactor?: number | null;
}): number | null {
  const irradiance = positive(input.irradiance_W_m2);
  const area = positive(input.receivingArea_m2);
  const absorptivity = inUnitRange(input.absorptivity);
  const projected = inUnitRange(input.projectedAreaFactor);
  const shading = inUnitRange(input.shadingFactor);
  if (
    irradiance == null ||
    area == null ||
    absorptivity == null ||
    projected == null ||
    shading == null
  ) {
    return null;
  }
  return irradiance * area * absorptivity * projected * shading;
}

function parameter(profile: BoundaryConditionProfile, key: string): number | null {
  return numeric(profile.parameters[key]);
}

/**
 * The Derived Preview for one boundary port, from every profile assigned to it.
 *
 * `completeness` is about the INPUTS, not about a result:
 *   blocked  — nothing assigned, or a required input is missing;
 *   warning  — computed, but resting on an assumption the engineer should see;
 *   complete — every input the assigned profiles need is present.
 */
export function buildDerivedPreview(
  port: BoundaryPort,
  profiles: BoundaryConditionProfile[],
  options: { ambient_C: number | null } = { ambient_C: null },
): BoundaryDerivedPreview {
  const preview: BoundaryDerivedPreview = {
    boundary_port_id: port.id,
    profile_ids: profiles.map((profile) => profile.id),
    completeness: 'blocked',
    disclaimer: 'pre_solve_boundary_input_only',
  };

  // The ambient placeholder is a non-dissipating temperature reference. It
  // does not need a profile or an Rth preview; readiness follows the one
  // authoritative ambient value in Scenario Environment.
  if (!port.dissipating) {
    preview.completeness =
      options.ambient_C != null && Number.isFinite(options.ambient_C) ? 'complete' : 'blocked';
    return preview;
  }

  if (profiles.length === 0) return preview;

  let assumed = false;
  let missing = false;
  let hconv: number | null = null;
  let hrad: number | null = null;

  for (const profile of profiles) {
    const area = parameter(profile, 'area_m2') ?? port.area_m2;

    switch (profile.type) {
      case 'convection_to_ambient': {
        hconv = parameter(profile, 'h_W_m2K');
        preview.r_conv_C_per_W = calculateConvectionRth(hconv, area);
        if (preview.r_conv_C_per_W == null) missing = true;
        break;
      }

      case 'radiation_to_surroundings': {
        const guess =
          parameter(profile, 'surfaceReferenceTemperatureGuess_C') ??
          (options.ambient_C != null ? options.ambient_C + DEFAULT_SURFACE_GUESS_OFFSET_C : null);
        if (parameter(profile, 'surfaceReferenceTemperatureGuess_C') == null) assumed = true;

        hrad = calculateLinearizedRadiationHrad({
          emissivity: parameter(profile, 'emissivity'),
          viewFactor: parameter(profile, 'viewFactor'),
          surfaceReferenceTemperatureGuess_C: guess,
        });
        preview.h_rad_W_m2K = hrad;
        preview.r_rad_C_per_W = calculateRadiationRth(hrad, area);
        if (preview.r_rad_C_per_W == null) missing = true;
        break;
      }

      case 'combined_convection_radiation': {
        hconv = parameter(profile, 'h_W_m2K');
        const guess =
          parameter(profile, 'surfaceReferenceTemperatureGuess_C') ??
          (options.ambient_C != null ? options.ambient_C + DEFAULT_SURFACE_GUESS_OFFSET_C : null);
        if (parameter(profile, 'surfaceReferenceTemperatureGuess_C') == null) assumed = true;

        hrad = calculateLinearizedRadiationHrad({
          emissivity: parameter(profile, 'emissivity'),
          viewFactor: parameter(profile, 'viewFactor'),
          surfaceReferenceTemperatureGuess_C: guess,
        });
        preview.h_rad_W_m2K = hrad;
        preview.r_conv_C_per_W = calculateConvectionRth(hconv, area);
        preview.r_rad_C_per_W = calculateRadiationRth(hrad, area);
        if (preview.r_conv_C_per_W == null && preview.r_rad_C_per_W == null) missing = true;
        break;
      }

      case 'solar_load': {
        preview.q_solar_W = calculateSolarHeatLoad({
          irradiance_W_m2: parameter(profile, 'irradiance_W_m2'),
          receivingArea_m2: parameter(profile, 'receivingArea_m2') ?? area,
          absorptivity: parameter(profile, 'absorptivity'),
          projectedAreaFactor: parameter(profile, 'projectedAreaFactor'),
          shadingFactor: parameter(profile, 'shadingFactor'),
        });
        if (preview.q_solar_W == null) missing = true;
        else assumed = true; // solar inputs are estimates until the site is surveyed
        break;
      }

      case 'fixed_temperature_boundary': {
        // A fixed temperature is a Dirichlet condition, not a resistance: no
        // Rth preview is produced for it (06 §13.5).
        if (parameter(profile, 'fixedTemperature_C') == null) missing = true;
        break;
      }

      case 'adiabatic_symmetry': {
        // Intentional no-flow. No resistance is invented (06 §9.7).
        break;
      }

      case 'ambient_reservoir': {
        // Legacy compatibility only. Scenario Environment owns the ambient
        // value; a stored ambient profile neither overrides it nor blocks it.
        break;
      }

      case 'external_cfd_placeholder': {
        // Metadata only while Screen 03 is deferred; nothing is computed.
        assumed = true;
        break;
      }
    }
  }

  if (hconv != null || hrad != null) {
    const area =
      profiles.map((profile) => parameter(profile, 'area_m2')).find((value) => value != null) ??
      port.area_m2;
    preview.r_combined_C_per_W = calculateCombinedBoundaryRth({
      hconv_W_m2K: hconv,
      hrad_W_m2K: hrad,
      area_m2: area,
    });
  }

  preview.completeness = missing ? 'blocked' : assumed ? 'warning' : 'complete';
  return preview;
}
