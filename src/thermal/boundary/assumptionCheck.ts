/**
 * Checking a surface-temperature assumption against the solve that followed it.
 *
 * A boundary that computes `h` — the plate correlation, or the radiation
 * linearisation — rests on a surface temperature nobody has solved for at the
 * time it is entered. Screen 06 therefore reports `warning`, and until now
 * there was no way out of that state: the assumption could not be discharged by
 * filling in a field, because the field was already filled. On a real project
 * the engineer entered 85 °C, was told "Assumption" forever, and had no way to
 * learn that the solve had landed on 79.2 °C.
 *
 * Screen 07 knows the answer. The check is simply to ask it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES NOT DO
 *
 * It never writes a solved temperature into the boundary set. Screen 06's data
 * is scenario INPUT (06 §3.2, §12.1) and `validateBoundarySet` rejects a
 * profile carrying a solved value — deliberately, because a set that quietly
 * encoded a previous answer would make the next solve depend on the last one.
 *
 * So the comparison is computed live from the solution store and shown as a
 * check, labelled as coming from Screen 07. Applying it is an explicit act by
 * the engineer, and what it writes is a STATED input with their provenance on
 * it, not a solved value carried across.
 * ---------------------------------------------------------------------------
 *
 * WHY THE TOLERANCE IS ON THE RESISTANCE, NOT ON THE TEMPERATURE
 *
 * A fixed "within N kelvin" tolerance means different things at different
 * points. What actually matters is how much the boundary moves: `h_rad` goes as
 * T³ and the plate `h` roughly as ΔT^¼, so the same 5 K is worth much more on a
 * surface running 10 K above ambient than on one running 50 K above it. The
 * check therefore re-evaluates the whole preview at the solved temperature and
 * compares the resistances.
 */

import { buildDerivedPreview } from './calculations';
import type {
  BoundaryAssumptionKind,
  BoundaryConditionProfile,
  BoundaryPort,
} from './types';

/**
 * Below this the assumption is treated as confirmed.
 *
 * 2% of the boundary resistance. Natural-convection correlations carry 10–20%
 * of their own uncertainty, so a tolerance much tighter than this would be
 * reporting a difference smaller than the model can resolve — and one much
 * looser would pass an assumption that visibly moves the answer.
 */
export const SURFACE_ASSUMPTION_TOLERANCE_PCT = 2;

/** Assumptions that rest on a surface temperature, and so can be checked. */
const TEMPERATURE_DEPENDENT: ReadonlySet<BoundaryAssumptionKind> = new Set([
  'surface_temperature_guess',
  'plate_convection',
]);

export type SurfaceAssumptionVerdict = 'verified' | 'off' | 'unavailable';

export interface SurfaceAssumptionCheck {
  boundary_port_id: string;
  /** The temperature the boundary was evaluated at — stated or defaulted. */
  assumed_C: number;
  /** What Screen 07 solved for this surface, or null when there is no result. */
  solved_C: number | null;
  /** solved − assumed. Positive means the surface runs hotter than assumed. */
  delta_C: number | null;
  r_assumed_C_per_W: number | null;
  /** The same boundary re-evaluated at the solved temperature. */
  r_solved_C_per_W: number | null;
  /** |ΔR| / R as a percentage — what the tolerance is actually about. */
  r_error_pct: number | null;
  verdict: SurfaceAssumptionVerdict;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** The single resistance a boundary presents, whichever way it is described. */
function combined(preview: {
  r_combined_C_per_W?: number | null;
  r_conv_C_per_W?: number | null;
  r_rad_C_per_W?: number | null;
}): number | null {
  const value = preview.r_combined_C_per_W ?? preview.r_conv_C_per_W ?? preview.r_rad_C_per_W;
  return finite(value) && value > 0 ? value : null;
}

/**
 * One port's assumption, checked against the solve.
 *
 * Null when the port has no temperature-dependent assumption — a stated `h` on
 * a flat wall does not move when the surface turns out cooler, so there is
 * nothing here to confirm or contradict.
 */
export function checkSurfaceAssumption(
  port: BoundaryPort,
  profiles: BoundaryConditionProfile[],
  options: { ambient_C: number | null; solvedSurface_C: number | null },
): SurfaceAssumptionCheck | null {
  const atAssumed = buildDerivedPreview(port, profiles, { ambient_C: options.ambient_C });
  const assumption = atAssumed.assumptions?.find((entry) =>
    TEMPERATURE_DEPENDENT.has(entry.kind),
  );
  if (!assumption || !finite(assumption.value)) return null;

  const assumed_C = assumption.value;
  const solved_C = finite(options.solvedSurface_C) ? options.solvedSurface_C : null;
  const r_assumed = combined(atAssumed);

  if (solved_C == null) {
    return {
      boundary_port_id: port.id,
      assumed_C,
      solved_C: null,
      delta_C: null,
      r_assumed_C_per_W: r_assumed,
      r_solved_C_per_W: null,
      r_error_pct: null,
      verdict: 'unavailable',
    };
  }

  // The same profiles, evaluated at the temperature the solve produced. The
  // clone is local and never leaves this function: the stored profile keeps
  // the engineer's own number until they choose to replace it.
  const atSolved = buildDerivedPreview(
    port,
    profiles.map((profile) => ({
      ...profile,
      parameters: { ...profile.parameters, surfaceReferenceTemperatureGuess_C: solved_C },
    })),
    { ambient_C: options.ambient_C },
  );
  const r_solved = combined(atSolved);

  const r_error_pct =
    r_assumed != null && r_solved != null ? (Math.abs(r_solved - r_assumed) / r_assumed) * 100 : null;

  return {
    boundary_port_id: port.id,
    assumed_C,
    solved_C,
    delta_C: solved_C - assumed_C,
    r_assumed_C_per_W: r_assumed,
    r_solved_C_per_W: r_solved,
    r_error_pct,
    // No resistance to compare means no verdict. Reporting "verified" because
    // two nulls happen to be equal would be the worst possible failure here.
    verdict:
      r_error_pct == null
        ? 'unavailable'
        : r_error_pct <= SURFACE_ASSUMPTION_TOLERANCE_PCT
          ? 'verified'
          : 'off',
  };
}
