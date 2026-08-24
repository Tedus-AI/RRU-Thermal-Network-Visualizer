import { describe, expect, it } from 'vitest';

import { besselJ0, besselJ1, j1Eigenvalues } from './bessel';
import { computeRth, spreadingDiscRth } from './calculators';
import { discSpreadingResistance, leeCorrelationPsi, sharedPlateSpreading } from './spreading';

/** The Golden Demo's real base: ADC12, 300 x 220 x 6 mm. */
const BASE = { plate_area_mm2: 300 * 220, thickness_mm: 6, k_W_mK: 96 };

const oneDimensional = (thickness_mm: number, k_W_mK: number, area_mm2: number) =>
  thickness_mm / 1000 / (k_W_mK * (area_mm2 / 1e6));

describe('Bessel functions', () => {
  /** Standard tabulated values — the anchor for everything downstream. */
  it('reproduces tabulated J0 and J1', () => {
    expect(besselJ0(0)).toBeCloseTo(1, 12);
    expect(besselJ1(0)).toBeCloseTo(0, 12);
    expect(besselJ0(1)).toBeCloseTo(0.7651976866, 9);
    expect(besselJ1(1)).toBeCloseTo(0.4400505857, 9);
    expect(besselJ0(5)).toBeCloseTo(-0.1775967713, 9);
    expect(besselJ1(5)).toBeCloseTo(-0.3275791376, 9);
    // Across the series/asymptotic crossover at x = 18. These, and the values
    // above, were checked against J_n(x) = (1/π)∫₀^π cos(nt − x·sin t) dt —
    // a different algorithm entirely, so agreement is evidence and not a
    // restatement of the same code.
    expect(besselJ0(17.9)).toBeCloseTo(-0.0321094577, 8);
    expect(besselJ0(18.1)).toBeCloseTo(0.0054270248, 8);
    expect(besselJ1(20)).toBeCloseTo(0.0668331242, 8);
    expect(besselJ0(100)).toBeCloseTo(0.0199858503, 7);
  });

  it('is odd in J1', () => {
    expect(besselJ1(-3.2)).toBeCloseTo(-besselJ1(3.2), 12);
  });

  it('finds the zeros of J1', () => {
    const { zeros, j0Squared } = j1Eigenvalues(50);
    // Tabulated j(1,s).
    expect(zeros[0]).toBeCloseTo(3.8317059702, 8);
    expect(zeros[1]).toBeCloseTo(7.0155866698, 8);
    expect(zeros[2]).toBeCloseTo(10.1734681351, 8);
    expect(zeros[3]).toBeCloseTo(13.3236919363, 8);
    expect(zeros[4]).toBeCloseTo(16.4706300509, 8);
    // Every one is genuinely a root, including deep into the asymptotic branch.
    for (const zero of zeros) expect(Math.abs(besselJ1(zero))).toBeLessThan(1e-10);
    // The cached J0(λ)² must belong to the same λ.
    expect(j0Squared[0]).toBeCloseTo(besselJ0(zeros[0]) ** 2, 12);
  });
});

describe('disc spreading resistance (Lee, Song, Au & Moran 1995)', () => {
  /**
   * Cross-checked against an independent Python implementation of Lee
   * eq. (19)–(21) built from the same tabulated J1 zeros, and against the exact
   * column of a separately commissioned review of the 1995 paper. Both agree to
   * six decimals on R for this plate at Bi → ∞.
   */
  it('matches the exact series on the reference plate', () => {
    const cases: Array<[number, number, number]> = [
      // [A_s mm², exact Ψ_ave, exact R_ave °C/W]
      [100, 0.314829, 0.327947],
      [225, 0.257938, 0.179124],
      [400, 0.215659, 0.112322],
      [900, 0.159539, 0.055396],
      [2500, 0.101694, 0.021186],
    ];
    for (const [area, psi, R] of cases) {
      const result = discSpreadingResistance({ ...BASE, source_area_mm2: area, variant: 'avg' })!;
      expect(result.psi).toBeCloseTo(psi, 5);
      expect(result.R_spreading_C_per_W).toBeCloseTo(R, 5);
    }
  });

  it('matches the exact series for the maximum-source variant', () => {
    const cases: Array<[number, number]> = [
      [100, 0.391253],
      [400, 0.267698],
      [2500, 0.115238],
    ];
    for (const [area, psi] of cases) {
      const result = discSpreadingResistance({ ...BASE, source_area_mm2: area, variant: 'max' })!;
      expect(result.psi).toBeCloseTo(psi, 4);
    }
  });

  it('agrees with the geometry Lee prints', () => {
    const result = discSpreadingResistance({ ...BASE, source_area_mm2: 400 })!;
    expect(result.tau).toBeCloseTo(0.0413956, 7);
    expect(result.epsilon).toBeCloseTo(0.0778499, 7);
    expect(result.lambda_c).toBeCloseTo(10.388739, 5);
    expect(result.phi_c).toBeCloseTo(0.4053615, 6);
  });

  /**
   * The whole reason the exact series is computed rather than the correlation.
   * If this ever stops holding, the choice in the header needs revisiting.
   */
  it('shows the p.205 correlation under-predicting at this plate thickness', () => {
    for (const area of [100, 400, 2500]) {
      for (const variant of ['avg', 'max'] as const) {
        const result = discSpreadingResistance({ ...BASE, source_area_mm2: area, variant })!;
        expect(result.psi_correlation).toBeLessThan(result.psi);
      }
    }
    // ...and by an amount worth caring about: 7-17% on the average variant.
    const four = discSpreadingResistance({ ...BASE, source_area_mm2: 400, variant: 'avg' })!;
    expect(1 - four.psi_correlation / four.psi).toBeGreaterThan(0.15);
  });

  /**
   * Qpedia Sept 2010 eq. (6) prints 1/2 for both variants. Only the average
   * line is right; 1/sqrt(pi) is what reproduces Lee's own tabulated Psi_max.
   */
  it('uses 1/sqrt(pi) in the correlation, not the Qpedia 1/2, for the max variant', () => {
    const epsilon = 0.0778499;
    const tau = 0.0413956;
    const max = leeCorrelationPsi(epsilon, tau, null, 'max');
    const qpediaMisprint = 0.5 * (1 - epsilon) * max.phi_c;
    expect(max.psi).toBeCloseTo(0.2108964, 6);
    expect(max.psi / qpediaMisprint).toBeCloseTo(2 / Math.sqrt(Math.PI), 9);
    // The average variant is unaffected: 1/2 is correct there.
    expect(leeCorrelationPsi(epsilon, tau, null, 'avg').psi).toBeCloseTo(0.1794795, 6);
  });

  /**
   * The reason the HSK base edge was changed at all. If this ratio were constant
   * the old model would only have shifted every result by the same factor and
   * the ranking would have survived; it is not constant, which is why it moved
   * components past each other.
   */
  it('diverges from t/(k·A_contact) by an amount that depends on the patch size', () => {
    const ratio = (area: number) =>
      oneDimensional(BASE.thickness_mm, BASE.k_W_mK, area) /
      discSpreadingResistance({ ...BASE, source_area_mm2: area })!.R_C_per_W;

    expect(ratio(100)).toBeGreaterThan(1.4);
    expect(ratio(2500)).toBeLessThan(1.2);
    expect(ratio(100)).toBeGreaterThan(ratio(2500));
  });

  it('collapses to plain 1D conduction when the source covers the plate', () => {
    const result = discSpreadingResistance({ ...BASE, source_area_mm2: BASE.plate_area_mm2 })!;
    expect(result.saturated).toBe(true);
    expect(result.R_spreading_C_per_W).toBe(0);
    expect(result.R_C_per_W).toBeCloseTo(
      oneDimensional(BASE.thickness_mm, BASE.k_W_mK, BASE.plate_area_mm2),
      12,
    );
  });

  /**
   * Lee eq. (12): R = R_f + R_m + R_c. The edge carries R_m + R_c, so the two
   * must be reported separately or a reader cannot tell which convention a
   * total follows.
   */
  it('separates Lee R_m from Lee R_c and sums them into the total', () => {
    const result = discSpreadingResistance({ ...BASE, source_area_mm2: 400 })!;
    expect(result.R_1d_C_per_W).toBeCloseTo(
      oneDimensional(BASE.thickness_mm, BASE.k_W_mK, BASE.plate_area_mm2),
      12,
    );
    expect(result.R_1d_C_per_W).toBeCloseTo(9.4697e-4, 8);
    expect(result.R_1d_C_per_W + result.R_spreading_C_per_W).toBeCloseTo(result.R_C_per_W, 12);
  });

  it('puts the peak source temperature above the patch average', () => {
    const max = discSpreadingResistance({ ...BASE, source_area_mm2: 400, variant: 'max' })!;
    const avg = discSpreadingResistance({ ...BASE, source_area_mm2: 400, variant: 'avg' })!;
    expect(max.R_C_per_W).toBeGreaterThan(avg.R_C_per_W);
  });

  /**
   * Bi → ∞ is the perfectly cooled far face, which is the least spreading the
   * model can produce. A real, finite h must therefore give MORE — that is the
   * direction of the bias the note on the edge warns about.
   */
  it('under-estimates at Bi → ∞ compared with any finite Biot number', () => {
    const infinite = discSpreadingResistance({ ...BASE, source_area_mm2: 400 })!;
    const finite = discSpreadingResistance({ ...BASE, source_area_mm2: 400, bi: 5 })!;
    expect(finite.R_spreading_C_per_W).toBeGreaterThan(infinite.R_spreading_C_per_W);
  });

  it('scales linearly with 1/k and leaves the shape factors alone', () => {
    const soft = discSpreadingResistance({ ...BASE, source_area_mm2: 400, k_W_mK: 96 })!;
    const stiff = discSpreadingResistance({ ...BASE, source_area_mm2: 400, k_W_mK: 192 })!;
    expect(stiff.R_C_per_W).toBeCloseTo(soft.R_C_per_W / 2, 12);
    expect(stiff.psi).toBeCloseTo(soft.psi, 12);
  });

  /** Lee validated 0.05 ≤ ε ≤ 0.833; small parts fall below it. */
  it('flags an ε outside the range Lee validated', () => {
    expect(discSpreadingResistance({ ...BASE, source_area_mm2: 100 })!.epsilon_out_of_range).toBe(
      true,
    );
    expect(discSpreadingResistance({ ...BASE, source_area_mm2: 2500 })!.epsilon_out_of_range).toBe(
      false,
    );
  });

  it('gives each of N devices its own share of the plate', () => {
    const single = discSpreadingResistance({ ...BASE, source_area_mm2: 400 })!;
    const four = sharedPlateSpreading({ ...BASE, source_area_mm2: 400 }, 4)!;
    // Four in parallel beat one, but by less than 4x: each spreads into a
    // quarter of the base, not the whole of it.
    expect(four.R_C_per_W).toBeLessThan(single.R_C_per_W);
    expect(four.R_C_per_W).toBeGreaterThan(single.R_C_per_W / 4);
  });

  it('returns null rather than a plausible number when an input is missing', () => {
    expect(discSpreadingResistance({ ...BASE, source_area_mm2: 0 })).toBeNull();
    expect(
      discSpreadingResistance({ ...BASE, source_area_mm2: 400, k_W_mK: Number.NaN }),
    ).toBeNull();
  });
});

describe('spreading_disc edge method', () => {
  it('names every missing input instead of resolving to zero', () => {
    const result = spreadingDiscRth({ thickness_mm: 6 });
    expect(result.value).toBeNull();
    expect(result.resolution).toBe('unresolved');
    expect(result.missing).toEqual(['source_area_mm2', 'plate_area_mm2', 'k_W_mK']);
  });

  it('warns that the Bi assumption biases the answer low', () => {
    const result = spreadingDiscRth({ ...BASE, source_area_mm2: 400 });
    expect(result.resolution).toBe('resolved');
    expect(result.note).toContain('UNDER-estimates');
  });

  it('drops the warning once a real Biot number is supplied', () => {
    const result = spreadingDiscRth({ ...BASE, source_area_mm2: 400, bi: 5 });
    expect(result.note).toBeUndefined();
  });

  it('is reachable through computeRth', () => {
    expect(computeRth('spreading_disc', { ...BASE, source_area_mm2: 400 }).value).toBeCloseTo(
      discSpreadingResistance({ ...BASE, source_area_mm2: 400 })!.R_C_per_W,
      12,
    );
  });
});
