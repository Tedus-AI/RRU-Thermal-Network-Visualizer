/**
 * Boundary input calculations — 06 §13.
 *
 * Everything here is a PRE-SOLVE BOUNDARY INPUT. None of it is a solved node
 * temperature, an edge heat flow or a temperature drop: those belong to Screen
 * 07 (06 §3.3, §8.3). A missing input yields `null`, never 0.
 */

import {
  finArrayBoundary,
  FIN_TECHNOLOGIES,
  type FinArrayResult,
  type FinTechnology,
} from './finArray';
import { isFinnedSurfacePort } from './boundaryPorts';
import {
  flatPlateConvection,
  PLATE_ORIENTATIONS,
  type FlatPlateResult,
  type PlateOrientation,
} from './flatPlate';
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
 * Parameter keys a profile carries when its surface is described as a fin
 * array rather than as an h and an area.
 *
 * They live in the same free-form `parameters` bag as everything else so no
 * stored profile changes shape; `enabled` is what makes a profile fin-derived.
 */
export const FIN_GEOMETRY_KEYS = {
  enabled: 'finGeometryEnabled',
  baseLength: 'finBaseLength_mm',
  baseWidth: 'finBaseWidth_mm',
  height: 'finHeight_mm',
  gap: 'finGap_mm',
  thickness: 'finThickness_mm',
  technology: 'finTechnology',
  conductivity: 'finConductivity_W_mK',
  draftAngle: 'finDraftAngle_deg',
  processEfficiency: 'finProcessEfficiency',
  countOverride: 'finCount',
} as const;

/**
 * Parameter keys a profile carries when its convection coefficient is computed
 * from the plate rather than stated.
 *
 * Only `h` is derived here. A flat surface's area, emissivity and view factor
 * are real, statable properties of it, so they stay where they are — the split
 * is deliberately different from a fin array's, where the geometry sets all
 * four because none of the four exists without it.
 */
export const PLATE_GEOMETRY_KEYS = {
  enabled: 'plateGeometryEnabled',
  orientation: 'plateOrientation',
  height: 'plateHeight_mm',
  width: 'plateWidth_mm',
} as const;

export function usesPlateGeometry(profile: BoundaryConditionProfile): boolean {
  return profile.parameters[PLATE_GEOMETRY_KEYS.enabled] === true;
}

/**
 * The plate convection this profile describes, or null when it states its own
 * `h` instead.
 *
 * The surface-temperature guess is the same one the radiation term already
 * uses, so a single stated assumption drives both halves of the boundary and
 * they cannot drift apart.
 */
export function plateConvectionOf(
  profile: BoundaryConditionProfile,
  ambient_C: number | null,
): FlatPlateResult | null {
  if (!usesPlateGeometry(profile)) return null;
  const stored = profile.parameters[PLATE_GEOMETRY_KEYS.orientation];
  const orientation: PlateOrientation =
    typeof stored === 'string' && (PLATE_ORIENTATIONS as readonly string[]).includes(stored)
      ? (stored as PlateOrientation)
      : 'Vertical';

  return flatPlateConvection({
    orientation,
    height_mm: parameter(profile, PLATE_GEOMETRY_KEYS.height),
    width_mm: parameter(profile, PLATE_GEOMETRY_KEYS.width),
    surfaceTemperature_C:
      parameter(profile, 'surfaceReferenceTemperatureGuess_C') ??
      (ambient_C != null ? ambient_C + DEFAULT_SURFACE_GUESS_OFFSET_C : null),
    ambientTemperature_C: ambient_C,
  });
}

/**
 * Whether this profile is described as a fin array.
 *
 * On a finned port the answer is always yes and the flag is not consulted: a
 * fin stack has no honest `h` of its own, so "state h and an area" was never a
 * description of it, only a place to put numbers copied from somewhere else.
 * The manual mode stays available on flat surfaces, where it IS the right
 * description.
 *
 * Off a finned port it is an explicit flag, not an inference from the fin
 * height. The height was the trigger at first, and conflating "is this mode on"
 * with "how tall are the fins" made that field behave unlike every other number
 * on the screen: clearing it to retype switched the whole mode off, and
 * toggling off then on again erased the one value that had been entered.
 *
 * A stored profile written before the flag existed is still read correctly: a
 * height on its own continues to mean fin mode.
 */
export function usesFinGeometry(
  profile: BoundaryConditionProfile,
  port?: BoundaryPort | null,
): boolean {
  const flag = profile.parameters[FIN_GEOMETRY_KEYS.enabled];
  const stated = typeof flag === 'boolean' ? flag : parameter(profile, FIN_GEOMETRY_KEYS.height) != null;
  if (stated) return true;
  // On a finned port the geometry is the only description Screen 06 offers, so
  // a convection profile that has not already been described some other way is
  // fin-derived by default. A set saved before this existed keeps computing
  // from the h and area it was solved with — silently reinterpreting stored
  // numbers under a different model would be worse than leaving them — and
  // `validateBoundarySet` says loudly that it should be restated as geometry.
  //
  // Only the convection-carrying types. A radiation-only profile on the same
  // port is still `4·ε·σ·F·T³` and a solar load is still an absorbed flux;
  // neither is a thing the fin correlation has an opinion about, and sweeping
  // them in would delete two boundary types from the finned surface.
  if (!FIN_CAPABLE_TYPES.has(profile.type)) return false;
  return port != null && isFinnedSurfacePort(port) && !hasManualSurfaceDescription(profile, port);
}

/** Boundary types whose surface the fin geometry can describe. */
const FIN_CAPABLE_TYPES = new Set<BoundaryConditionProfile['type']>([
  'convection_to_ambient',
  'combined_convection_radiation',
]);

/**
 * True when the profile already carries the numbers the manual mode needs.
 *
 * Only a COMPLETE description counts. A leftover `h` with no area anywhere is
 * not a description of anything, and treating it as one would be the fallback
 * the fin mode exists to remove. The port's own area counts, because that is
 * the area the preview would have used.
 */
export function hasManualSurfaceDescription(
  profile: BoundaryConditionProfile,
  port?: BoundaryPort | null,
): boolean {
  const h = positive(profile.parameters.h_W_m2K);
  const area = positive(profile.parameters.area_m2) ?? positive(port?.area_m2);
  return h != null && area != null;
}

/**
 * The fin-array boundary a profile describes, or null when it describes an h
 * and an area instead.
 *
 * Returning null for a half-filled geometry rather than falling back to the
 * manual parameters is deliberate: a surface that is halfway through being
 * described as a fin array has no resistance yet, and silently answering with
 * whatever `h_W_m2K` happened to be left behind would be the transcription bug
 * this mode exists to remove.
 */
export function finArrayOf(
  profile: BoundaryConditionProfile,
  port?: BoundaryPort | null,
): FinArrayResult | null {
  if (!usesFinGeometry(profile, port)) return null;
  const stored = profile.parameters[FIN_GEOMETRY_KEYS.technology];
  const technology: FinTechnology =
    typeof stored === 'string' && (FIN_TECHNOLOGIES as readonly string[]).includes(stored)
      ? (stored as FinTechnology)
      : 'Embedded';

  return finArrayBoundary({
    baseLength_mm: parameter(profile, FIN_GEOMETRY_KEYS.baseLength),
    baseWidth_mm: parameter(profile, FIN_GEOMETRY_KEYS.baseWidth),
    finHeight_mm: parameter(profile, FIN_GEOMETRY_KEYS.height),
    gap_mm: parameter(profile, FIN_GEOMETRY_KEYS.gap),
    thickness_mm: parameter(profile, FIN_GEOMETRY_KEYS.thickness),
    technology,
    k_W_mK: parameter(profile, FIN_GEOMETRY_KEYS.conductivity),
    draftAngle_deg: parameter(profile, FIN_GEOMETRY_KEYS.draftAngle),
    processEfficiency: parameter(profile, FIN_GEOMETRY_KEYS.processEfficiency),
    finCountOverride: parameter(profile, FIN_GEOMETRY_KEYS.countOverride),
  });
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
    // A fin-derived profile computes its own area from the geometry: the whole
    // point is that the wetted area is not a number anyone retypes.
    const fin = finArrayOf(profile, port);
    if (fin != null) preview.fin_array = fin;
    const plate = fin != null ? null : plateConvectionOf(profile, options.ambient_C);
    if (plate != null) preview.plate_convection = plate;
    const area = fin?.area_m2 ?? parameter(profile, 'area_m2') ?? port.area_m2;

    // Fin mode with the geometry half-filled has no resistance yet. Answering
    // with whatever `h_W_m2K` and `area_m2` were left behind by an earlier
    // manual setup would be the transcription bug this mode exists to remove —
    // and it would look completely convincing, because those stale numbers were
    // once correct. The port is reported as blocked instead.
    if (fin == null && usesFinGeometry(profile, port)) {
      missing = true;
      continue;
    }

    switch (profile.type) {
      case 'convection_to_ambient': {
        if (fin != null) {
          // The efficiency belongs on this branch and nowhere else. Folding it
          // into `h` or into the area is what made it invisible in the first
          // place, so it is applied here, once, where it can be read back.
          hconv = fin.h_conv_W_m2K * fin.effectiveness;
          preview.r_conv_C_per_W = calculateConvectionRth(hconv, area);
          break;
        }
        hconv = plate?.h_conv_W_m2K ?? parameter(profile, 'h_W_m2K');
        // The plate coefficient rests on a surface temperature nobody has
        // solved for yet, so it is an assumption in exactly the sense the
        // radiation term already is, and is labelled the same way.
        if (plate != null) assumed = true;
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
        if (fin != null) {
          // Both coefficients come from the geometry, so neither the emissivity
          // nor the view factor is consulted — the radiation fit already has
          // the emissivity, the cavity effect and the envelope ratio inside it,
          // and asking for a view factor as well is what turned that field into
          // an area ratio in disguise.
          hconv = fin.h_conv_W_m2K * fin.effectiveness;
          hrad = fin.h_rad_W_m2K * fin.effectiveness;
          preview.h_rad_W_m2K = hrad;
          preview.r_conv_C_per_W = calculateConvectionRth(hconv, area);
          preview.r_rad_C_per_W = calculateRadiationRth(hrad, area);
          break;
        }
        hconv = plate?.h_conv_W_m2K ?? parameter(profile, 'h_W_m2K');
        if (plate != null) assumed = true;
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
      preview.fin_array?.area_m2 ??
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
