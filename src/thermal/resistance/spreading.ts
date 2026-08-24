/**
 * Disc-source spreading resistance — Lee, Song, Au & Moran (1995).
 *
 * WHY THIS EXISTS
 * ---------------
 * A component hands its heat to the heat-sink base through a contact patch that
 * is small compared with the base. Heat then fans out sideways before it reaches
 * the fins. Modelling that step as t/(k·A_contact) — one-dimensional flow down a
 * column the width of the patch — ignores the fan-out entirely, and it is not a
 * small error: for a 10 × 10 mm patch on a 300 × 220 × 6 mm ADC12 base it is
 * about 2× too high. Because the distortion depends on patch size, it does not
 * cancel out of a comparison — it reorders the bottleneck ranking.
 *
 * THE GEOMETRY
 * ------------
 * Circular source of radius `a` centred on a circular plate of radius `b` and
 * thickness `t`, cooled on the far face. Non-circular footprints are converted
 * by equal area (Lee eq. 1–2), which is how the model is normally applied;
 * Muzychka et al. report that equivalence costs under ~10% for τ < 1, improving
 * as the plate gets thinner.
 *
 *   a = √(A_s/π),  b = √(A_p/π),  ε = a/b,  τ = t/b,  Bi = h·b/k
 *
 * Note Bi uses the plate radius, NOT the thickness. `Bi = h·t/k` is a classic
 * misreading of this model and it is not what Lee eq. (11) says.
 *
 * WHY THE EXACT SERIES AND NOT THE FAMILIAR CORRELATION
 * ----------------------------------------------------
 * Lee gives an exact solution as a series over the zeros of J₁ (eq. 19–21) and,
 * separately, a much-quoted algebraic correlation (p. 205). We compute the
 * exact series. Three reasons, in order of weight:
 *
 *  1. The correlation is systematically LOW in precisely this tool's regime. A
 *     5G RRU heat-sink base is thin relative to its span — the demo's is
 *     τ = 0.041 — and against the exact series the correlation under-predicts
 *     the spreading resistance by 7–17% (average variant) and 3–21% (maximum
 *     variant) across contact patches from 100 to 2500 mm². Low is the
 *     dangerous direction: it flatters the design.
 *  2. Lee's own validation of the correlation covers 0.05 ≤ ε ≤ 0.833. Small
 *     parts sit below that floor — the demo's Driver is ε = 0.037 — so for them
 *     the correlation is being extrapolated, not applied.
 *  3. Two reputable printings of the correlation disagree. Qpedia (Sept 2010,
 *     eq. 6) prints ½ as the coefficient of BOTH variants; the coefficient that
 *     actually reproduces Lee's own tabulated Ψ_max is 1/√π. Checking against
 *     the exact series settles it — 1/√π is right and the ½ in the magazine's
 *     maximum-variant line is a misprint — but a correlation whose published
 *     forms conflict is a poor thing to hang every project's numbers on.
 *
 * The correlation is still computed, and the Edge Inspector shows it beside the
 * series, because an engineer checking this by hand will reach for it and needs
 * to see the gap rather than be surprised by it.
 *
 *   Exact (Lee eq. 19–21):
 *     Ψ_ave = (4/(√π·ε)) Σ J₁²(λₙε) / (λₙ³·J₀²(λₙ)) · Φₙ
 *     Ψ_max = (2/√π)     Σ J₁(λₙε)  / (λₙ²·J₀²(λₙ)) · Φₙ
 *     Φₙ    = (tanh(λₙτ) + λₙ/Bi) / (1 + (λₙ/Bi)·tanh(λₙτ)),   J₁(λₙ) = 0
 *
 *   Correlation (Lee p. 205), kept for comparison:
 *     Ψ_ave = ½(1−ε)^{3/2}·Φ_c,   Ψ_max = (1/√π)(1−ε)·Φ_c,   λ_c = π + 1/(ε√π)
 *
 *   R_spreading = Ψ / (k·√A_s)
 *
 * λ_c is π + 1/(ε·√π) — ε OUTSIDE the root. Coding it as 1/√(πε) is the other
 * classic error in this model.
 *
 * WHAT THIS RESISTANCE IS, AND WHAT IT IS NOT
 * -------------------------------------------
 * Lee eq. (12–13) decomposes the whole path as R = R_f + R_m + R_c, where
 * R_m = t/(k·A_p) is the plain one-dimensional drop through the plate, R_f is
 * the far-face boundary, and R_c — the Ψ above — is the spreading term ALONE.
 * The graph edge this feeds runs from the contact face to the heat-sink base
 * node, so it carries R_m + R_c; R_f lives further downstream on the fin and
 * ambient edges. `R_1d_C_per_W` and `R_spreading_C_per_W` are returned
 * separately so nobody has to guess which convention a total follows.
 *
 * (Qpedia's eq. 6 folds R_m into Ψ as a leading ετ/√π term. That is the same
 * total, written differently: ετ/√π ÷ (k·a·√π) is identically t/(k·A_p).)
 *
 * THE BIOT NUMBER
 * ---------------
 * Bi needs h on the far face, which is a Screen 06 boundary condition; Screen 05
 * has none by design (05 §15). Absent Bi we take Bi → ∞, i.e. Φ = tanh(λτ).
 * That is the SMALLEST Φ the formula can produce, so it is the smallest
 * spreading resistance — the assumption UNDER-estimates, and the caller is
 * expected to say so rather than present the number as tight. A caller that
 * does know h (Screen 06, later) can pass `bi` and get the finite-Bi answer.
 *
 * Sources
 *   [1] S. Lee, S. Song, V. Au, K. P. Moran, "Constriction/Spreading Resistance
 *       Model for Electronics Packaging", Proc. 4th ASME/JSME Thermal
 *       Engineering Joint Conference, Vol. 4, 1995, pp. 199–206.
 *   [2] Qpedia Thermal eMagazine, September 2010, pp. 24–27 — reprints [1]'s
 *       correlation as eq. (2)–(9); see the misprint noted above.
 *   [3] Y. S. Muzychka, M. M. Yovanovich, J. R. Culham, "Thermal Spreading
 *       Resistances in Rectangular Flux Channels, Part I", AIAA 2003-4187 —
 *       the equal-area circular equivalence.
 */

import { besselJ1, j1Eigenvalues } from './bessel';

export type SpreadingVariant = 'avg' | 'max';

/**
 * Terms in the series. Ψ_ave converges fast; Ψ_max alternates and settles more
 * slowly, so this is sized for it: at 2000 terms both variants are inside
 * 0.05% of their limit across the ε and τ range this tool sees, which is two
 * orders of magnitude tighter than the model's own accuracy.
 */
const SERIES_TERMS = 2000;

export interface SpreadingInput {
  /** Contact footprint the heat enters through, mm². */
  source_area_mm2: number;
  /** Plate footprint the heat spreads across, mm². */
  plate_area_mm2: number;
  /** Plate thickness, mm. */
  thickness_mm: number;
  /** Plate conductivity, W/m·K. */
  k_W_mK: number;
  /** Far-face Biot number, h·b/k. Omitted or non-finite means Bi → ∞. */
  bi?: number | null;
  /** Peak source temperature by default; see the header. */
  variant?: SpreadingVariant;
}

export interface SpreadingResult {
  /** Total resistance of the step, °C/W — 1D through the thickness + spreading. */
  R_C_per_W: number;
  /** Lee's R_m = t/(k·A_plate): the part that is plain 1D conduction. */
  R_1d_C_per_W: number;
  /** Lee's R_c: what the fan-out costs on top of R_1d. */
  R_spreading_C_per_W: number;
  /** Dimensionless spreading resistance from the exact series. */
  psi: number;
  /** The p. 205 correlation's Ψ for the same inputs, for comparison only. */
  psi_correlation: number;
  epsilon: number;
  tau: number;
  /** The correlation's single eigenvalue. The series uses the real spectrum. */
  lambda_c: number;
  /** The correlation's Φ_c. */
  phi_c: number;
  variant: SpreadingVariant;
  /** True when the source is at least as large as the plate: no spreading left. */
  saturated: boolean;
  /** ε is outside 0.05–0.833, where Lee validated the model. */
  epsilon_out_of_range: boolean;
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Lee eq. (21). `biRatio` is λ/Bi, which is 0 at Bi → ∞. */
const phiOf = (lambdaTau: number, biRatio: number): number => {
  const th = Math.tanh(lambdaTau);
  return biRatio === 0 ? th : (th + biRatio) / (1 + biRatio * th);
};

/** Lee eq. (19)–(20), the exact solution. Returns the dimensionless Ψ. */
function seriesPsi(
  epsilon: number,
  tau: number,
  bi: number | null | undefined,
  variant: SpreadingVariant,
): number {
  const { zeros, j0Squared } = j1Eigenvalues(SERIES_TERMS);
  const finiteBi = positive(bi);
  let sum = 0;

  for (let n = 0; n < SERIES_TERMS; n += 1) {
    const lambda = zeros[n];
    const phi = phiOf(lambda * tau, finiteBi ? lambda / (bi as number) : 0);
    const j1 = besselJ1(lambda * epsilon);
    sum +=
      variant === 'avg'
        ? ((j1 * j1) / (lambda ** 3 * j0Squared[n])) * phi
        : (j1 / (lambda ** 2 * j0Squared[n])) * phi;
  }

  return variant === 'avg'
    ? (4 / (Math.sqrt(Math.PI) * epsilon)) * sum
    : (2 / Math.sqrt(Math.PI)) * sum;
}

/**
 * Lee p. 205's algebraic correlation. Not used for the answer — see the header
 * — but shown beside it so a hand-check has something to land on.
 */
export function leeCorrelationPsi(
  epsilon: number,
  tau: number,
  bi: number | null | undefined,
  variant: SpreadingVariant,
): { psi: number; lambda_c: number; phi_c: number } {
  const lambda_c = Math.PI + 1 / (epsilon * Math.sqrt(Math.PI));
  const phi_c = phiOf(lambda_c * tau, positive(bi) ? lambda_c / (bi as number) : 0);
  const psi =
    variant === 'avg'
      ? 0.5 * (1 - epsilon) ** 1.5 * phi_c
      : ((1 - epsilon) * phi_c) / Math.sqrt(Math.PI);
  return { psi, lambda_c, phi_c };
}

/**
 * Returns null when any input is missing or non-positive. It never substitutes a
 * default: an unknown base thickness or an unknown contact area must reach the
 * user as UNRESOLVED, not as a plausible number (05 §61).
 */
export function discSpreadingResistance(input: SpreadingInput): SpreadingResult | null {
  const { source_area_mm2, plate_area_mm2, thickness_mm, k_W_mK } = input;
  if (
    !positive(source_area_mm2) ||
    !positive(plate_area_mm2) ||
    !positive(thickness_mm) ||
    !positive(k_W_mK)
  ) {
    return null;
  }

  const variant: SpreadingVariant = input.variant ?? 'max';
  const A_s = source_area_mm2 / 1e6;
  const A_p = plate_area_mm2 / 1e6;
  const t = thickness_mm / 1000;
  const k = k_W_mK;

  const b = Math.sqrt(A_p / Math.PI);
  const tau = t / b;
  const R_1d = t / (k * A_p);

  // A source at least as large as the plate has nowhere to spread to. The
  // series already returns 0 at ε = 1 (J₁(λₙ) is 0 by definition), so this
  // guard exists for ε > 1, which is unphysical rather than merely extreme.
  if (A_s >= A_p) {
    return {
      R_C_per_W: R_1d,
      R_1d_C_per_W: R_1d,
      R_spreading_C_per_W: 0,
      psi: 0,
      psi_correlation: 0,
      epsilon: 1,
      tau,
      lambda_c: Math.PI + 1 / Math.sqrt(Math.PI),
      phi_c: Math.tanh((Math.PI + 1 / Math.sqrt(Math.PI)) * tau),
      variant,
      saturated: true,
      epsilon_out_of_range: true,
    };
  }

  const epsilon = Math.sqrt(A_s / Math.PI) / b;
  const psi = seriesPsi(epsilon, tau, input.bi, variant);
  const correlation = leeCorrelationPsi(epsilon, tau, input.bi, variant);

  // R = Ψ / (k·√A_s) — Lee eq. (5). The characteristic length is the SOURCE
  // area's root, not the plate's and not the thickness.
  const R_spreading = psi / (k * Math.sqrt(A_s));

  return {
    R_C_per_W: R_1d + R_spreading,
    R_1d_C_per_W: R_1d,
    R_spreading_C_per_W: R_spreading,
    psi,
    psi_correlation: correlation.psi,
    epsilon,
    tau,
    lambda_c: correlation.lambda_c,
    phi_c: correlation.phi_c,
    variant,
    saturated: false,
    epsilon_out_of_range: epsilon < 0.05 || epsilon > 0.833,
  };
}

/**
 * N identical devices sharing one plate.
 *
 * Each device is given an equal share of the plate as its influence area and
 * spreads inside it; the N steps are then in parallel. This is the usual
 * influence-area treatment and it is only valid while the devices are far
 * enough apart that their spreading fields do not overlap — which is exactly
 * the assumption the rest of the qty model already makes (one whole physical
 * copy per instance). Devices packed shoulder to shoulder need the multiple-
 * source treatment, which is a Screen 05 edit, not a qty multiplier.
 */
export function sharedPlateSpreading(
  input: SpreadingInput,
  devices: number,
): SpreadingResult | null {
  if (!Number.isFinite(devices) || devices <= 1) return discSpreadingResistance(input);

  const perDevice = discSpreadingResistance({
    ...input,
    plate_area_mm2: input.plate_area_mm2 / devices,
  });
  if (!perDevice) return null;

  return {
    ...perDevice,
    R_C_per_W: perDevice.R_C_per_W / devices,
    R_1d_C_per_W: perDevice.R_1d_C_per_W / devices,
    R_spreading_C_per_W: perDevice.R_spreading_C_per_W / devices,
  };
}
