/**
 * The Cavity Filter Exposed Surface, from the project that prompted this.
 *
 * ε 0.8, F 0.9, A 0.143724 m², a 336 mm vertical plate, ambient 45, and a
 * surface-temperature guess of 85 °C entered by hand. The screen said
 * "Assumption" and there was no way out of it: the field was already filled,
 * so no amount of typing would clear the state. Screen 07 solves that surface
 * at 79.2 °C, and that is the number the check exists to surface.
 */

import { describe, expect, it } from 'vitest';

import { checkSurfaceAssumption, SURFACE_ASSUMPTION_TOLERANCE_PCT } from './assumptionCheck';
import type { BoundaryConditionProfile, BoundaryPort } from './types';

function port(): BoundaryPort {
  return {
    id: 'BP_CAVITY',
    name: 'Cavity Filter Exposed Surface',
    connected_node_id: 'NODE_CAVITY',
    surface_group_id: 'SG_CAVITY',
    area_m2: 0.143724,
    orientation: 'housing_wall',
    allowed_boundary_types: ['combined_convection_radiation'],
    dissipating: true,
    external_mappings: { import_status: 'deferred' },
  };
}

function profile(guess_C: number | null = 85): BoundaryConditionProfile {
  const parameters: BoundaryConditionProfile['parameters'] = {
    emissivity: 0.8,
    viewFactor: 0.9,
    area_m2: 0.143724,
    plateGeometryEnabled: true,
    plateOrientation: 'Vertical',
    plateHeight_mm: 336,
  };
  if (guess_C != null) parameters.surfaceReferenceTemperatureGuess_C = guess_C;
  return {
    id: 'BCP_CAVITY',
    name: 'Cavity exposed surface',
    type: 'combined_convection_radiation',
    representation: 'single_combined_edge',
    parameters,
    source: 'manual',
    confidence: 'high',
  };
}

const AMBIENT = 45;

describe('checking a surface assumption against the solve', () => {
  it('reports the real gap on the project this came from', () => {
    const check = checkSurfaceAssumption(port(), [profile(85)], {
      ambient_C: AMBIENT,
      solvedSurface_C: 79.2,
    })!;

    expect(check.assumed_C).toBe(85);
    expect(check.solved_C).toBe(79.2);
    expect(check.delta_C).toBeCloseTo(-5.8, 1);
    // The whole point: the boundary is not the same boundary at 79.2 °C.
    expect(check.r_assumed_C_per_W).toBeCloseTo(0.558, 3);
    expect(check.r_solved_C_per_W).toBeGreaterThan(check.r_assumed_C_per_W!);
    expect(check.r_error_pct).toBeCloseTo(4.7, 1);
    expect(check.verdict).toBe('off');
  });

  it('confirms an assumption the solve lands on', () => {
    const check = checkSurfaceAssumption(port(), [profile(79.2)], {
      ambient_C: AMBIENT,
      solvedSurface_C: 79.2,
    })!;

    expect(check.r_error_pct).toBe(0);
    expect(check.verdict).toBe('verified');
  });

  /**
   * The tolerance is on the resistance, not on the temperature, because the
   * same kelvin is worth different amounts at different points: h_rad goes as
   * T³ and the plate h roughly as ΔT^¼.
   */
  it('measures the tolerance in resistance, not in kelvin', () => {
    const near = checkSurfaceAssumption(port(), [profile(85)], {
      ambient_C: AMBIENT,
      solvedSurface_C: 83,
    })!;
    expect(near.r_error_pct).toBeLessThanOrEqual(SURFACE_ASSUMPTION_TOLERANCE_PCT);
    expect(near.verdict).toBe('verified');

    // The same 2 K lower down the scale moves the boundary further, because
    // the surface is closer to ambient and the driving ΔT is a smaller number.
    const low = checkSurfaceAssumption(port(), [profile(52)], {
      ambient_C: AMBIENT,
      solvedSurface_C: 50,
    })!;
    expect(low.delta_C).toBe(near.delta_C);
    expect(low.r_error_pct!).toBeGreaterThan(near.r_error_pct!);
  });

  it('says so rather than guessing when there is no solve to check against', () => {
    const check = checkSurfaceAssumption(port(), [profile(85)], {
      ambient_C: AMBIENT,
      solvedSurface_C: null,
    })!;

    expect(check.verdict).toBe('unavailable');
    expect(check.solved_C).toBeNull();
    expect(check.r_error_pct).toBeNull();
  });

  it('checks a defaulted guess too, not only a stated one', () => {
    // ambient + 35 is still an assumption about the surface, and the solve
    // confirms or contradicts it in exactly the same way.
    const held = checkSurfaceAssumption(port(), [profile(null)], {
      ambient_C: AMBIENT,
      solvedSurface_C: 79.2,
    })!;
    expect(held.assumed_C).toBe(80);
    // The default happened to be within a kelvin of the answer here — which is
    // the outcome the reader most needs to be told, because a port stuck on
    // "Assumption" with a default nobody chose looks like an unfinished field.
    expect(held.verdict).toBe('verified');

    const missed = checkSurfaceAssumption(port(), [profile(null)], {
      ambient_C: AMBIENT,
      solvedSurface_C: 60,
    })!;
    expect(missed.assumed_C).toBe(80);
    expect(missed.verdict).toBe('off');
  });

  it('returns nothing for a boundary that does not rest on a surface temperature', () => {
    const stated: BoundaryConditionProfile = {
      ...profile(85),
      type: 'convection_to_ambient',
      parameters: { h_W_m2K: 12, area_m2: 0.14 },
    };
    // A stated h on a flat wall does not move when the surface turns out
    // cooler, so there is nothing here to confirm or contradict.
    expect(
      checkSurfaceAssumption(port(), [stated], { ambient_C: AMBIENT, solvedSurface_C: 79.2 }),
    ).toBeNull();
  });

  /**
   * A port can carry several profiles, and the one open in the inspector is not
   * necessarily the one holding the assumption. Applying to the open tab wrote
   * the temperature onto a profile that never reads it.
   */
  it('names the profile that actually owns the assumption', () => {
    const solar: BoundaryConditionProfile = {
      id: 'BCP_SOLAR',
      name: 'Solar',
      type: 'solar_load',
      representation: 'single_combined_edge',
      parameters: {
        irradiance_W_m2: 800,
        receivingArea_m2: 0.14,
        absorptivity: 0.7,
        projectedAreaFactor: 1,
        shadingFactor: 1,
      },
      source: 'manual',
      confidence: 'medium',
    };

    const check = checkSurfaceAssumption(port(), [solar, profile(85)], {
      ambient_C: AMBIENT,
      solvedSurface_C: 79.2,
    })!;

    expect(check.profile_id).toBe('BCP_CAVITY');
  });

  /**
   * Confirming the surface temperature says nothing about a solar estimate on
   * the same port. Reporting the port clear would discharge an assumption
   * nothing had checked.
   */
  it('does not claim to cover an assumption it never looked at', () => {
    const solar: BoundaryConditionProfile = {
      id: 'BCP_SOLAR',
      name: 'Solar',
      type: 'solar_load',
      representation: 'single_combined_edge',
      parameters: {
        irradiance_W_m2: 800,
        receivingArea_m2: 0.14,
        absorptivity: 0.7,
        projectedAreaFactor: 1,
        shadingFactor: 1,
      },
      source: 'manual',
      confidence: 'medium',
    };

    const alone = checkSurfaceAssumption(port(), [profile(79.2)], {
      ambient_C: AMBIENT,
      solvedSurface_C: 79.2,
    })!;
    expect(alone.verdict).toBe('verified');
    expect(alone.covers_every_assumption).toBe(true);

    const withSolar = checkSurfaceAssumption(port(), [profile(79.2), solar], {
      ambient_C: AMBIENT,
      solvedSurface_C: 79.2,
    })!;
    // The temperature still checks out — but the port is assuming more.
    expect(withSolar.verdict).toBe('verified');
    expect(withSolar.covers_every_assumption).toBe(false);
  });

  it('never reads the solved value back into the profile it was given', () => {
    const original = profile(85);
    const snapshot = JSON.stringify(original);
    checkSurfaceAssumption(port(), [original], { ambient_C: AMBIENT, solvedSurface_C: 79.2 });
    // Screen 06's data stays scenario input; applying is the engineer's act.
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
