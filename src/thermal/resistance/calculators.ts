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
import { sharedPlateSpreading, type SpreadingVariant } from './spreading';

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

/**
 * A solder joint, derated for voiding.
 *
 * A reflowed preform is never fully solid: voids take a fraction of the joint
 * out of the conduction path. `voiding` is the fraction that IS solder, so 0.75
 * means a quarter of the nominal area carries no heat.
 *
 * Modelling this as plain conduction over the nominal area would understate the
 * resistance by exactly that fraction — 33% at 0.75 — which is why it has its
 * own method rather than borrowing `conduction_LkA`.
 */
export function solderVoidingRth(params: EdgeParameters): RthComputation {
  const t = numeric(params, 'thickness_mm');
  const k = numeric(params, 'k_W_mK');
  const A = numeric(params, 'area_mm2');

  const missing: string[] = [];
  if (t == null) missing.push('thickness_mm');
  if (k == null) missing.push('k_W_mK');
  if (A == null) missing.push('area_mm2');
  if (missing.length > 0) return unresolved(missing);

  if (k! <= 0 || A! <= 0) return unresolved([], 'Conductivity and area must be positive.');

  // Absent, a joint is assumed void-free rather than unresolvable — that is the
  // nominal case, and it errs towards a LOWER resistance, so it can never hide
  // a hot component behind a pessimistic guess.
  const voiding = numeric(params, 'voiding') ?? 1;
  if (voiding <= 0 || voiding > 1) {
    return unresolved([], 'Effective solder area must be a fraction between 0 and 1.');
  }

  const value = t! / 1000 / (k! * (A! / 1e6) * voiding);
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

export const SPREADING_UNDER_ESTIMATE_NOTE =
  'Assumption: Lee/Song/Au/Moran disc spreading with Bi → ∞ (a perfectly cooled far ' +
  'face). Bi needs h, which is a Screen 06 boundary condition, and Bi → ∞ gives ' +
  'the smallest spreading the correlation can produce — so this UNDER-estimates. ' +
  'The correlation itself is quoted at about 10% for a heat-sink base.';

/**
 * Spreading into a plate — the Lee/Song/Au/Moran disc correlation.
 *
 * This result already contains the one-dimensional drop through the thickness
 * (see `resistance/spreading.ts`), so an edge using it must NOT be paired with a
 * separate t/(k·A) edge across the same plate.
 */
export function spreadingDiscRth(params: EdgeParameters): RthComputation {
  const A_s = numeric(params, 'source_area_mm2');
  const A_p = numeric(params, 'plate_area_mm2');
  const t = numeric(params, 'thickness_mm');
  const k = numeric(params, 'k_W_mK');

  const missing: string[] = [];
  if (A_s == null) missing.push('source_area_mm2');
  if (A_p == null) missing.push('plate_area_mm2');
  if (t == null) missing.push('thickness_mm');
  if (k == null) missing.push('k_W_mK');
  if (missing.length > 0) return unresolved(missing);

  const variant = params.psi_variant === 'avg' ? 'avg' : ('max' as SpreadingVariant);
  const result = sharedPlateSpreading(
    {
      source_area_mm2: A_s!,
      plate_area_mm2: A_p!,
      thickness_mm: t!,
      k_W_mK: k!,
      bi: numeric(params, 'bi'),
      variant,
    },
    numeric(params, 'devices') ?? 1,
  );

  if (!result) {
    return unresolved([], 'Areas, thickness and conductivity must all be positive.');
  }

  return {
    value: result.R_C_per_W,
    resolution: 'resolved',
    missing: [],
    note: numeric(params, 'bi') != null ? undefined : SPREADING_UNDER_ESTIMATE_NOTE,
  };
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

/**
 * A bolted metal-to-metal joint with nothing in the gap — R = 1 / (h_c · A).
 *
 * Two solids pressed together touch only across their asperities, so the joint
 * has a real resistance even with no TIM. It is conductance-based, not k/t:
 * there is no material and no thickness to quote, only how well the two faces
 * are made to meet. Faking it as a thin pseudo-TIM would put an invented
 * thickness and an invented conductivity into the report.
 *
 * `h_c` is the least defensible number in any chain that uses it — it depends
 * on flatness, surface finish, fastener pitch and preload, all of which vary
 * per build. It therefore ships `Assumed` and says so.
 */
export function contactConductanceRth(params: EdgeParameters): RthComputation {
  const h = numeric(params, 'h_c_W_m2K');
  const A = numeric(params, 'area_mm2');

  const missing: string[] = [];
  if (h == null) missing.push('h_c_W_m2K');
  if (A == null) missing.push('area_mm2');
  if (missing.length > 0) return unresolved(missing);

  if (h! <= 0 || A! <= 0) {
    return unresolved([], 'Contact conductance and area must be positive.');
  }

  return { value: 1 / (h! * (A! / 1e6)), resolution: 'resolved', missing: [] };
}

/**
 * Scales one device's parameters to the N devices a chain stands for.
 *
 * A subgraph built with AGGREGATE or GROUPED carries N devices' dissipation on
 * its source node — `perDevicePower * multiplier`. Until this existed, the
 * resistances beside it were still ONE device's, so four 45 W PAs were modelled
 * as 180 W forced through a single PA's coin, solder joint and junction. That
 * over-predicted the junction rise fourfold (50 °C instead of 12.5 °C on the
 * Golden Demo's PA) — and "conservative" is no defence, because a wrong
 * resistance reorders the bottleneck ranking whichever way it errs.
 *
 * N identical devices side by side are N resistances in parallel, so:
 *   - anything of the form t/(k·A) scales by its AREA: N paths, N × the area
 *   - a directly quoted resistance is simply divided
 *
 * Scaling the area rather than the result keeps the stored parameters honest:
 * they still reproduce the resistance shown beside them, and they say plainly
 * that this edge is four joints wide.
 *
 * The assumption is that an instance is a whole physical copy — its own coin,
 * its own solder joint, its own TIM patch. A design where several devices share
 * ONE spreader is a Screen 05 edit, not a qty model.
 */
export function scaleParametersForDevices(
  method: EdgeMethod,
  params: EdgeParameters,
  devices: number,
): EdgeParameters {
  if (!Number.isFinite(devices) || devices <= 1) return params;

  switch (method) {
    case 'conduction_LkA':
    case 'tim_thickness_k':
    case 'via_array':
    case 'solder_voiding':
    case 'contact_area':
    case 'contact_hc': {
      const area = numeric(params, 'area_mm2');
      return area == null ? params : { ...params, area_mm2: area * devices };
    }
    case 'direct_rth': {
      const R = numeric(params, 'R_C_per_W');
      return R == null ? params : { ...params, R_C_per_W: R / devices };
    }
    // Spreading does not scale by area: N patches on one plate each get their
    // own share of it, and the calculator needs the count to say so.
    case 'spreading_disc':
      return { ...params, devices };
    // Boundary and imported edges are never component-owned, so a device count
    // has nothing to say about them.
    default:
      return params;
  }
}

export function computeRth(method: EdgeMethod, params: EdgeParameters): RthComputation {
  switch (method) {
    case 'conduction_LkA':
      return conductionRth(params);
    case 'tim_thickness_k':
      return timRth(params);
    case 'via_array':
      return viaArrayRth(params);
    case 'solder_voiding':
      return solderVoidingRth(params);
    case 'contact_hc':
      return contactConductanceRth(params);
    case 'spreading_disc':
      return spreadingDiscRth(params);
    case 'direct_rth':
    case 'contact_area':
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
