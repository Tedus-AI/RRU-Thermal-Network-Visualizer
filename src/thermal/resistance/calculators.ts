/**
 * Analytical edge resistance — 05 §20, §21.
 *
 * These are scenario-independent: geometry and material only. Anything that
 * depends on ambient conditions, h, wind or solar belongs to Screen 06 (05 §15).
 *
 * The rule every calculator obeys: if an input is missing, the result is
 * UNRESOLVED. It never falls back to zero and never guesses (05 §61, AC-05-35).
 */

import type { EdgeMethod, ResolutionState } from '../types';

export interface RthComputation {
  value: number | null;
  resolution: ResolutionState;
  /** Which inputs were missing, so the inspector can name them. */
  missing: string[];
  note?: string;
}

export type EdgeParameters = Record<string, number | string | boolean | null | undefined>;

function numeric(params: EdgeParameters, key: string): number | null {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function unresolved(missing: string[], note?: string): RthComputation {
  return { value: null, resolution: 'unresolved', missing, note };
}

/** R = L / (k·A). Length in mm, k in W/m·K, area in mm² → °C/W. */
export function conductionRth(params: EdgeParameters): RthComputation {
  const L = numeric(params, 'length_mm');
  const k = numeric(params, 'k_W_mK');
  const A = numeric(params, 'area_mm2');

  const missing: string[] = [];
  if (L == null) missing.push('length_mm');
  if (k == null) missing.push('k_W_mK');
  if (A == null) missing.push('area_mm2');
  if (missing.length > 0) return unresolved(missing);

  if (k! <= 0 || A! <= 0) {
    return unresolved([], 'Conductivity and area must be positive.');
  }

  // mm / (W/m·K × mm²) → multiply by 1000 to convert mm→m against k's metre basis.
  const value = (L! / 1000) / (k! * (A! / 1e6));
  return { value, resolution: 'resolved', missing: [] };
}

/** R = t / (k·A_eff). Same units as conduction. */
export function timRth(params: EdgeParameters): RthComputation {
  const t = numeric(params, 'thickness_mm');
  const k = numeric(params, 'k_W_mK');
  const A = numeric(params, 'area_mm2');

  const missing: string[] = [];
  if (t == null) missing.push('thickness_mm');
  if (k == null) missing.push('k_W_mK');
  if (A == null) missing.push('area_mm2');
  if (missing.length > 0) return unresolved(missing);

  if (k! <= 0 || A! <= 0) return unresolved([], 'Conductivity and area must be positive.');

  const value = (t! / 1000) / (k! * (A! / 1e6));
  return { value, resolution: 'resolved', missing: [] };
}

/**
 * Thermal via array, treated as a slab with an effective through-plane
 * conductivity. The effective k must be supplied — it is not derivable from via
 * count alone without a correlation the tool does not yet own.
 */
export function viaArrayRth(params: EdgeParameters): RthComputation {
  const t = numeric(params, 'thickness_mm');
  const k = numeric(params, 'effective_k_W_mK');
  const A = numeric(params, 'area_mm2');

  const missing: string[] = [];
  if (t == null) missing.push('thickness_mm');
  if (k == null) missing.push('effective_k_W_mK');
  if (A == null) missing.push('area_mm2');
  if (missing.length > 0) return unresolved(missing);
  if (k! <= 0 || A! <= 0) return unresolved([], 'Effective k and area must be positive.');

  const efficiency = numeric(params, 'via_efficiency') ?? 1;
  const value = (t! / 1000) / (k! * (A! / 1e6) * efficiency);
  return { value, resolution: 'resolved', missing: [] };
}

/** A directly quoted resistance: package Rjc, vendor heat pipe, manual value. */
export function directRth(params: EdgeParameters): RthComputation {
  const R = numeric(params, 'R_C_per_W');
  if (R == null) return unresolved(['R_C_per_W']);
  return { value: R, resolution: 'resolved', missing: [] };
}

/**
 * Spreading resistance — 05 §21.
 *
 * Only computed when a correlation and its inputs are both present. Substituting
 * L/kA here would silently misrepresent 3D spreading, so an unknown stays
 * unresolved (05 §57 tooltip, AC-05-33).
 */
export function spreadingRth(params: EdgeParameters): RthComputation {
  const method = params.correlation;
  const R = numeric(params, 'R_C_per_W');

  if (R != null) return { value: R, resolution: 'resolved', missing: [] };
  if (!method) {
    return unresolved(
      ['correlation'],
      'Spreading resistance needs a correlation or a directly quoted value. ' +
        'L/kA is not a substitute.',
    );
  }
  return unresolved(['R_C_per_W'], 'Selected correlation still needs its input parameters.');
}

/**
 * A boundary-derived edge cannot be resolved in Screen 05 at all: it depends on
 * ambient temperature, h and radiation, which Screen 06 supplies (05 §15).
 */
export function boundaryDerivedRth(): RthComputation {
  return {
    value: null,
    resolution: 'unresolved',
    missing: ['boundary_conditions'],
    note: 'Resolved in Screen 06 once boundary conditions are defined.',
  };
}

export function computeRth(method: EdgeMethod, params: EdgeParameters): RthComputation {
  switch (method) {
    case 'conduction_LkA':
      return conductionRth(params);
    case 'tim_thickness_k':
      return timRth(params);
    case 'via_array':
      return viaArrayRth(params);
    case 'direct_rth':
    case 'contact_area':
    case 'solder_voiding':
      return directRth(params);
    case 'convection_hA':
    case 'radiation_hA':
      return boundaryDerivedRth();
    case 'imported':
      return unresolved([], 'Imported values arrive with Screen 03.');
    default:
      return unresolved(['method']);
  }
}
