/**
 * A finned surface's boundary, computed from the fin geometry.
 *
 * Screen 06 otherwise asks for `h`, an area, an emissivity and a view factor as
 * four free numbers. Nobody knows those four numbers; what an engineer knows is
 * the heat sink — how tall the fins are, how wide the channels are, what it is
 * made of. So the numbers get carried across from a sizing tool by hand, and
 * the carrying is where the errors live: on one real project the view factor
 * had become 0.26 because it was quietly absorbing an area ratio, the fin
 * efficiency had been multiplied into `h` and left no trace, and the resulting
 * boundary was 58% optimistic.
 *
 * Taking the geometry instead removes the transcription step. Every derived
 * quantity below is recomputed from inputs that mean something on a drawing.
 *
 * ---------------------------------------------------------------------------
 * Provenance of the correlations
 *
 * `h_conv` and `h_rad` are EMPIRICAL, fitted to CFD runs of 5G FR1 RRU heat
 * sinks in still air. They are not Elenbaas, Bar-Cohen–Rohsenow, or any other
 * textbook channel correlation — those give roughly 4.4–4.7 W/m²K for the
 * geometry these were fitted on, against the fitted 6.2. Outside that envelope
 * — forced air, a very different aspect ratio, a non-RRU form factor — they are
 * extrapolation, and `finArrayAspectRatio` exists so a caller can see how far
 * out it is standing.
 *
 * The fin efficiency is not empirical: it is the standard straight-fin result
 * with an adiabatic-tip correction, and holds wherever the fin is straight.
 * ---------------------------------------------------------------------------
 */

/** How the fin stack is made. Sets the fin's conductivity and its draft. */
export const FIN_TECHNOLOGIES = ['Embedded', 'DieCasting'] as const;
export type FinTechnology = (typeof FIN_TECHNOLOGIES)[number];

export const FIN_TECHNOLOGY_LABELS: Record<FinTechnology, { en: string; zh: string }> = {
  Embedded: { en: 'Bonded / extruded fin', zh: '埋入式・擠型鰭片' },
  DieCasting: { en: 'Die-cast fin', zh: '壓鑄鰭片' },
};

/**
 * Fin conductivity by process: pure aluminium for a bonded or extruded stack,
 * ADC12 for a die-casting. Defaults only — a project that knows its alloy says
 * so, and `k_W_mK` overrides this.
 */
export const FIN_TECHNOLOGY_DEFAULT_K_W_mK: Record<FinTechnology, number> = {
  Embedded: 200,
  DieCasting: 160,
};

/** A die-cast fin has to draw from the mould; a bonded one does not. */
export const FIN_TECHNOLOGY_DEFAULT_DRAFT_DEG: Record<FinTechnology, number> = {
  Embedded: 0,
  DieCasting: 1.25,
};

// --- empirical convection fit ----------------------------------------------
/** Channel h at the reference fin height, before the gap and height factors. */
const H_CONV_SATURATED_W_m2K = 6.4;
/** Gap at which the channel stops behaving like a slot, in the tanh sense. */
const H_CONV_GAP_SCALE_mm = 7.0;
/** Fin height the fit is anchored at. */
const FIN_HEIGHT_REFERENCE_mm = 70.0;
/** How fast h falls as fins grow: a taller channel has a thicker boundary layer. */
const FIN_HEIGHT_EXPONENT = 0.20;
/**
 * The fit was never exercised on very short fins and goes badly non-physical
 * there, so the height factor is clamped rather than extrapolated.
 */
const FIN_HEIGHT_FLOOR_mm = 20.0;

// --- empirical radiation fit -----------------------------------------------
/**
 * Radiation is a constant once the channel is open enough to see out of.
 *
 * It is NOT `4·ε·σ·F·T³` with the emissivity and view factor of the fin faces:
 * a fin channel mostly sees other fins, and what escapes is set by the
 * envelope, not by the wetted area. The fit rolls all of that — emissivity,
 * the cavity effect, the envelope-to-wetted area ratio — into one number,
 * derated below the reference gap, where a narrowing channel traps more of
 * what it emits.
 */
const H_RAD_SATURATED_W_m2K = 2.4;
const H_RAD_GAP_REFERENCE_mm = 10.0;

/** The channel aspect ratio band the fit was calibrated across. */
export const FIN_ASPECT_RATIO_BAND = { min: 4.5, max: 6.5 } as const;

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Channel convection coefficient, `6.4 · tanh(gap/7) · (70/FH)^0.20`.
 *
 * The height term is the part a constant-h model gets wrong: a taller fin does
 * not buy heat transfer in proportion to its area, because the boundary layer
 * along the channel thickens as it goes. Ignoring it makes a tall heat sink
 * look better than it is, and the error grows with every millimetre added.
 */
export function finConvectionH(
  gap_mm: number | null | undefined,
  finHeight_mm: number | null | undefined,
): number | null {
  const gap = positive(gap_mm);
  const finHeight = positive(finHeight_mm);
  if (gap == null || finHeight == null) return null;
  const clamped = Math.max(finHeight, FIN_HEIGHT_FLOOR_mm);
  const heightFactor = (FIN_HEIGHT_REFERENCE_mm / clamped) ** FIN_HEIGHT_EXPONENT;
  return H_CONV_SATURATED_W_m2K * Math.tanh(gap / H_CONV_GAP_SCALE_mm) * heightFactor;
}

/** Radiation coefficient, saturated above the reference gap. */
export function finRadiationH(gap_mm: number | null | undefined): number | null {
  const gap = positive(gap_mm);
  if (gap == null) return null;
  const derate = Math.min(1, Math.sqrt(gap / H_RAD_GAP_REFERENCE_mm));
  return H_RAD_SATURATED_W_m2K * derate;
}

/**
 * Straight-fin efficiency with the adiabatic-tip correction,
 * `tanh(m·Lc)/(m·Lc)`, `m = √(2h/(k·t))`, `Lc = FH + t/2`.
 *
 * Standard result, not a fit. It is the fraction of the fin's area that is
 * pulling its weight: a fin is hottest at its root and the tip runs cooler, so
 * the far end of a tall thin fin in a low-conductivity alloy contributes less
 * than its area suggests.
 */
export function finEfficiency(input: {
  finHeight_mm: number | null | undefined;
  thickness_mm: number | null | undefined;
  h_W_m2K: number | null | undefined;
  k_W_mK: number | null | undefined;
}): number | null {
  const finHeight = positive(input.finHeight_mm);
  const thickness = positive(input.thickness_mm);
  const h = positive(input.h_W_m2K);
  const k = positive(input.k_W_mK);
  if (finHeight == null || thickness == null || h == null || k == null) return null;

  const t_m = thickness / 1000;
  const Lc_m = (finHeight + thickness / 2) / 1000;
  const m = Math.sqrt((2 * h) / (k * t_m));
  const mLc = m * Lc_m;
  // A vanishing mLc is a perfectly conducting fin, and tanh(x)/x → 1 there.
  if (mLc < 1e-6) return 1;
  return Math.tanh(mLc) / mLc;
}

/**
 * How many fins of `thickness` at `gap` pitch fit across `width`.
 *
 * The span holds n fins and n-1 channels, so it is not simply width/pitch: the
 * last channel does not need a fin after it. The loop trims a fin when rounding
 * has overshot the available width.
 */
export function finCount(
  width_mm: number | null | undefined,
  gap_mm: number | null | undefined,
  thickness_mm: number | null | undefined,
): number | null {
  const width = positive(width_mm);
  const gap = positive(gap_mm);
  const thickness = positive(thickness_mm);
  if (width == null || gap == null || thickness == null) return null;

  let n = Math.floor((width + gap) / (gap + thickness));
  while (n > 0 && n * thickness + (n - 1) * gap > width + 1e-3) n -= 1;
  return n > 0 ? n : null;
}

/** Channel aspect ratio, fin height over channel width. */
export function finAspectRatio(
  finHeight_mm: number | null | undefined,
  gap_mm: number | null | undefined,
): number | null {
  const finHeight = positive(finHeight_mm);
  const gap = positive(gap_mm);
  if (finHeight == null || gap == null) return null;
  return finHeight / gap;
}

export interface FinArrayInput {
  /** Finned face, along the fin length. */
  baseLength_mm: number | null | undefined;
  /** Finned face, across the fins. */
  baseWidth_mm: number | null | undefined;
  finHeight_mm: number | null | undefined;
  /** Channel width between two fins. */
  gap_mm: number | null | undefined;
  /** Fin thickness at the tip; a die-cast fin thickens toward the root. */
  thickness_mm: number | null | undefined;
  technology: FinTechnology;
  /** Overrides the technology default. */
  k_W_mK?: number | null;
  /** Overrides the technology default. Die-casting only. */
  draftAngle_deg?: number | null;
  /**
   * Whatever the fin model does not represent, as a multiplier on the fin
   * efficiency.
   *
   * DEFAULT 1, which means "nothing". The tool this correlation came from ships
   * 1.06, and a fin effectiveness above 1 is not a physical quantity — it is a
   * residual, absorbing what that model has no term for. The largest thing it
   * has no term for is spreading resistance in the base, and THIS tool computes
   * that separately. Carrying 1.06 across as well would count the same physics
   * twice, once as a bonus on the boundary and once as a resistance above it.
   *
   * It stays an input because the residual is real and someone re-calibrating
   * against their own CFD needs somewhere to put it — but they should be
   * putting a measured number there, not inheriting another tool's.
   */
  processEfficiency?: number | null;
  /** Overrides the count derived from the width. */
  finCountOverride?: number | null;
}

export interface FinArrayResult {
  h_conv_W_m2K: number;
  h_rad_W_m2K: number;
  h_total_W_m2K: number;
  eta_fin: number;
  /** `eta_fin × processEfficiency`. */
  effectiveness: number;
  fin_count: number;
  /** Fin thickness at the root; equals the tip thickness with no draft. */
  rootThickness_mm: number;
  /** Thickness the efficiency was evaluated at: the mean of tip and root. */
  efficiencyThickness_mm: number;
  base_area_m2: number;
  fin_area_m2: number;
  /** Geometric wetted area: exposed base plus both faces of every fin. */
  area_m2: number;
  aspect_ratio: number;
  /** `1 / (h_total · A · effectiveness)` — the whole root-to-ambient path. */
  R_C_per_W: number;
  /**
   * `m·Lc`, the dimensionless fin parameter the whole temperature profile
   * follows from. Small means a nearly isothermal fin; large means a tip that
   * has stopped contributing.
   */
  mLc: number;
  /**
   * Tip excess temperature over root excess temperature, `1 / cosh(m·Lc)`.
   *
   * The classical straight-fin solution is
   * `θ(x)/θ_root = cosh(m(L−x)) / cosh(m·L)`, so this is that profile read at
   * the tip. Its companion — the MEAN of the same profile over the fin — works
   * out to `tanh(m·Lc)/(m·Lc)`, which is `eta_fin` itself: the fin efficiency
   * IS the mean excess-temperature ratio, not merely a heat-transfer derate.
   */
  tipExcessRatio: number;
  /**
   * The fin's own conduction, as a lumped resistance between the root and the
   * fin's mean surface temperature.
   *
   * `R_C_per_W` is the exact fin result and is not changed by splitting it.
   * What the split buys is that the intermediate node then sits at
   * `T_amb + eta · θ_root`, which is the mean fin surface temperature — a
   * quantity you could put a thermocouple on. Modelled as one isothermal step
   * to the boundary, the same node reports the ROOT temperature under a name
   * that promises a surface.
   *
   * Zero when `effectiveness` exceeds 1, where the excess is a process residual
   * rather than a fin gradient and there is nothing to put on this step.
   */
  conductionResistance_C_per_W: number;
  /** `1 / (h_total · A)` — convection alone, with the fin gradient taken out. */
  surfaceResistance_C_per_W: number;
}

/**
 * The whole finned boundary from geometry. Null when an input is missing, so a
 * half-filled form yields no resistance rather than a plausible-looking one.
 *
 * No iteration, unlike the sizing tool this came from. That tool solves for the
 * fin height, so its `h(FH)` and `η(h)` close a loop it has to converge. Here
 * the fin height is stated — it is a heat sink that exists — so `h` follows
 * from the geometry in one step and `η` from `h` in a second.
 */
export function finArrayBoundary(input: FinArrayInput): FinArrayResult | null {
  const baseLength = positive(input.baseLength_mm);
  const baseWidth = positive(input.baseWidth_mm);
  const finHeight = positive(input.finHeight_mm);
  const gap = positive(input.gap_mm);
  const thickness = positive(input.thickness_mm);
  if (
    baseLength == null ||
    baseWidth == null ||
    finHeight == null ||
    gap == null ||
    thickness == null
  ) {
    return null;
  }

  const k = positive(input.k_W_mK) ?? FIN_TECHNOLOGY_DEFAULT_K_W_mK[input.technology];
  const draft =
    input.technology === 'DieCasting'
      ? (input.draftAngle_deg ?? FIN_TECHNOLOGY_DEFAULT_DRAFT_DEG.DieCasting)
      : 0;
  const processEfficiency = positive(input.processEfficiency) ?? 1;

  // A draft angle widens the fin toward the root, which takes width from the
  // channel: the pitch is fixed by the tooling, so a thicker root is a narrower
  // gap and fewer fins across the same face.
  const rootThickness =
    draft > 0 ? thickness + 2 * finHeight * Math.tan((draft * Math.PI) / 180) : thickness;
  const pitch = gap + thickness;
  const rootGap = pitch - rootThickness;
  const efficiencyThickness = (thickness + rootThickness) / 2;

  const derivedCount =
    rootGap > 0
      ? (finCount(baseWidth, rootGap, rootThickness) ?? finCount(baseWidth, gap, thickness))
      : finCount(baseWidth, gap, thickness);
  const count = positive(input.finCountOverride) ?? derivedCount;
  if (count == null) return null;
  const fins = Math.floor(count);
  if (fins <= 0) return null;

  const h_conv = finConvectionH(gap, finHeight);
  const h_rad = finRadiationH(gap);
  if (h_conv == null || h_rad == null) return null;
  const h_total = h_conv + h_rad;

  const eta = finEfficiency({
    finHeight_mm: finHeight,
    thickness_mm: efficiencyThickness,
    h_W_m2K: h_total,
    k_W_mK: k,
  });
  if (eta == null) return null;
  const effectiveness = eta * processEfficiency;

  const base_area_m2 = (baseLength * baseWidth) / 1e6;
  // Both faces of every fin. The tips are left out, as they are in the fit this
  // matches — they are under 2% of the wetted area at these aspect ratios.
  const fin_area_m2 = (2 * fins * baseLength * finHeight) / 1e6;
  const area_m2 = base_area_m2 + fin_area_m2;

  const conductance = h_total * area_m2 * effectiveness;
  if (!(conductance > 0)) return null;

  const total = 1 / conductance;
  const surfaceResistance = 1 / (h_total * area_m2);
  // Never negative: an effectiveness above 1 is a process residual, not a fin
  // gradient, so it stays on the boundary rather than becoming a conduction
  // step that would have to conduct heat uphill.
  const conductionResistance = Math.max(0, total - surfaceResistance);

  const m = Math.sqrt((2 * h_total) / (k * (efficiencyThickness / 1000)));
  const mLc = m * ((finHeight + efficiencyThickness / 2) / 1000);

  return {
    h_conv_W_m2K: h_conv,
    h_rad_W_m2K: h_rad,
    h_total_W_m2K: h_total,
    eta_fin: eta,
    effectiveness,
    fin_count: fins,
    rootThickness_mm: rootThickness,
    efficiencyThickness_mm: efficiencyThickness,
    base_area_m2,
    fin_area_m2,
    area_m2,
    aspect_ratio: finHeight / gap,
    R_C_per_W: total,
    mLc,
    tipExcessRatio: 1 / Math.cosh(mLc),
    conductionResistance_C_per_W: conductionResistance,
    surfaceResistance_C_per_W: total - conductionResistance,
  };
}

/**
 * Where the channel sits relative to the band the correlation was fitted on.
 *
 * `outside` is not "a bad heat sink" — it is "this correlation is extrapolating
 * here", which is a different warning and the one Screen 06 can actually make.
 */
export function finAspectRatioVerdict(
  aspectRatio: number | null | undefined,
): 'inside' | 'narrow' | 'wide' | null {
  if (typeof aspectRatio !== 'number' || !Number.isFinite(aspectRatio)) return null;
  if (aspectRatio < FIN_ASPECT_RATIO_BAND.min) return 'wide';
  if (aspectRatio > FIN_ASPECT_RATIO_BAND.max) return 'narrow';
  return 'inside';
}
