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
 * about 2× too high, while for a 50 × 50 mm patch it is about 1.2× too high.
 * Because the distortion depends on patch size, it does not cancel out of a
 * comparison — it reorders the bottleneck ranking.
 *
 * THE CORRELATION
 * ---------------
 * Circular source of radius `a` centred on a circular plate of radius `b` and
 * thickness `t`, cooled on the far face. Non-circular footprints are converted
 * by equal area, which is the standard practice this correlation is quoted with.
 *
 *   ε  = a / b                        (relative source size)
 *   τ  = t / b                        (relative plate thickness)
 *   Bi = h·b / k                      (biot number of the far face)
 *   λ  = π + 1 / (√π · ε)
 *   Φ  = (tanh(λτ) + λ/Bi) / (1 + (λ/Bi)·tanh(λτ))
 *
 *   Ψ_avg = ετ/√π + (1/2)·(1−ε)^{3/2}·Φ      average source temperature
 *   Ψ_max = ετ/√π + (1/2)·(1−ε)·Φ            peak (source centre) temperature
 *
 *   R = Ψ / (k · a · √π)              because Ψ ≡ k·√A_s·R and √A_s = a·√π
 *
 * Source: R. Lee, S. Song, V. Au, K. Moran, "Constriction/Spreading Resistance
 * Model for Electronics Packaging", ASME/JSME Thermal Engineering Conference,
 * 1995 — as printed in Qpedia Thermal eMagazine, September 2010, eq. (2)–(9).
 * Song et al. quote ~10% accuracy against measurement when the plate is a heat
 * sink base. That 10% — plus the Bi assumption below — is why an edge built on
 * this carries its assumption in the note the caller shows beside the number.
 *
 * R IS THE WHOLE STEP, NOT AN EXTRA
 * ---------------------------------
 * Setting ε = 1 (source covers the plate) collapses Ψ to τ/√π, and
 * τ/√π / (k·a·√π) = t/(k·π·b²) = t/(k·A_plate). So the first term of Ψ IS the
 * one-dimensional resistance through the thickness and the second term is the
 * spreading on top of it. Adding a separate t/(k·A) edge beside this one would
 * count the thickness twice. The result carries the two parts separately so the
 * inspector can show the split without anyone re-deriving it.
 *
 * THE BIOT NUMBER
 * ---------------
 * Bi needs h on the far face, which is a Screen 06 boundary condition; Screen 05
 * has none by design (05 §15). Absent Bi we take Bi → ∞, i.e. Φ = tanh(λτ).
 * That is the SMALLEST Φ the formula can produce, so it is the smallest
 * spreading resistance — the assumption UNDER-estimates, and the caller is
 * expected to say so rather than present the number as tight. A caller that
 * does know h (Screen 06, later) can pass `bi` and get the finite-Bi answer.
 */

export type SpreadingVariant = 'avg' | 'max';

export interface SpreadingInput {
  /** Contact footprint the heat enters through, mm². */
  source_area_mm2: number;
  /** Plate footprint the heat spreads across, mm². */
  plate_area_mm2: number;
  /** Plate thickness, mm. */
  thickness_mm: number;
  /** Plate conductivity, W/m·K. */
  k_W_mK: number;
  /** Far-face Biot number. Omitted or non-finite means Bi → ∞. */
  bi?: number | null;
  /** Peak source temperature by default; see the header. */
  variant?: SpreadingVariant;
}

export interface SpreadingResult {
  /** Total resistance of the step, °C/W — 1D through the thickness + spreading. */
  R_C_per_W: number;
  /** t / (k·A_plate): the part that is plain one-dimensional conduction. */
  R_1d_C_per_W: number;
  /** What the fan-out costs on top of R_1d. */
  R_spreading_C_per_W: number;
  epsilon: number;
  tau: number;
  lambda: number;
  phi: number;
  psi: number;
  variant: SpreadingVariant;
  /** True when the source is at least as large as the plate: no spreading left. */
  saturated: boolean;
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

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

  // Equal-area circles. `a` is the source radius, `b` the plate radius.
  const a = Math.sqrt(A_s / Math.PI);
  const b = Math.sqrt(A_p / Math.PI);
  const tau = t / b;

  // A source that fills the plate has nowhere to spread to, and (1−ε)^{3/2}
  // would go imaginary past it. Fall back to the one-dimensional answer over
  // the plate, which is what the correlation itself converges to at ε = 1.
  if (A_s >= A_p) {
    const R_1d = t / (k * A_p);
    return {
      R_C_per_W: R_1d,
      R_1d_C_per_W: R_1d,
      R_spreading_C_per_W: 0,
      epsilon: 1,
      tau,
      lambda: Math.PI + 1 / Math.sqrt(Math.PI),
      phi: Math.tanh((Math.PI + 1 / Math.sqrt(Math.PI)) * tau),
      psi: tau / Math.sqrt(Math.PI),
      variant,
      saturated: true,
    };
  }

  const epsilon = a / b;
  const lambda = Math.PI + 1 / (Math.sqrt(Math.PI) * epsilon);

  // Bi → ∞ drops the λ/Bi terms and leaves Φ = tanh(λτ).
  const ratio = positive(input.bi) ? lambda / input.bi! : 0;
  const th = Math.tanh(lambda * tau);
  const phi = (th + ratio) / (1 + ratio * th);

  const oneD = (epsilon * tau) / Math.sqrt(Math.PI);
  const spread = variant === 'avg' ? 0.5 * (1 - epsilon) ** 1.5 * phi : 0.5 * (1 - epsilon) * phi;
  const psi = oneD + spread;

  const denominator = k * a * Math.sqrt(Math.PI);
  return {
    R_C_per_W: psi / denominator,
    R_1d_C_per_W: oneD / denominator,
    R_spreading_C_per_W: spread / denominator,
    epsilon,
    tau,
    lambda,
    phi,
    psi,
    variant,
    saturated: false,
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
