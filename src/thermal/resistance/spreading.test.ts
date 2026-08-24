import { describe, expect, it } from 'vitest';

import { computeRth, spreadingDiscRth } from './calculators';
import { discSpreadingResistance, sharedPlateSpreading } from './spreading';

/** The Golden Demo's real base: ADC12, 300 x 220 x 6 mm. */
const BASE = { plate_area_mm2: 300 * 220, thickness_mm: 6, k_W_mK: 96 };

const oneDimensional = (thickness_mm: number, k_W_mK: number, area_mm2: number) =>
  thickness_mm / 1000 / (k_W_mK * (area_mm2 / 1e6));

describe('disc spreading resistance (Lee, Song, Au & Moran 1995)', () => {
  it('matches the published correlation on a hand-worked case', () => {
    // a = 11.2838 mm, b = 144.9429 mm, ε = 0.0778499, τ = 0.0344963,
    // λ = 10.388739, Φ = tanh(λτ) = 0.3437805, Ψ_max = 0.1600238,
    // R = Ψ/(k·a·√π) = 0.0833457 °C/W.
    const result = discSpreadingResistance({
      source_area_mm2: 400,
      plate_area_mm2: 66000,
      thickness_mm: 5,
      k_W_mK: 96,
    })!;
    expect(result.epsilon).toBeCloseTo(0.0778499, 7);
    expect(result.tau).toBeCloseTo(0.0344963, 7);
    expect(result.lambda).toBeCloseTo(10.388739, 6);
    expect(result.phi).toBeCloseTo(0.3437805, 7);
    expect(result.psi).toBeCloseTo(0.1600238, 7);
    expect(result.R_C_per_W).toBeCloseTo(0.0833457, 7);
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

    expect(ratio(100)).toBeGreaterThan(1.9);
    expect(ratio(2500)).toBeLessThan(1.3);
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
   * The first term of Ψ is exactly t/(k·A_plate), so the result already contains
   * the drop through the thickness. Anyone putting a second L/kA edge in series
   * across the same plate would be counting it twice.
   */
  it('carries the 1D drop through the plate inside the total', () => {
    const result = discSpreadingResistance({ ...BASE, source_area_mm2: 400 })!;
    expect(result.R_1d_C_per_W).toBeCloseTo(
      oneDimensional(BASE.thickness_mm, BASE.k_W_mK, BASE.plate_area_mm2),
      12,
    );
    expect(result.R_1d_C_per_W + result.R_spreading_C_per_W).toBeCloseTo(result.R_C_per_W, 12);
  });

  it('puts the peak source temperature above the patch average', () => {
    const max = discSpreadingResistance({ ...BASE, source_area_mm2: 400, variant: 'max' })!;
    const avg = discSpreadingResistance({ ...BASE, source_area_mm2: 400, variant: 'avg' })!;
    expect(max.R_C_per_W).toBeGreaterThan(avg.R_C_per_W);
  });

  /**
   * Bi → ∞ is the perfectly cooled far face, which is the least spreading the
   * correlation can produce. A real, finite h must therefore give MORE — that is
   * the direction of the bias the note on the edge warns about.
   */
  it('under-estimates at Bi → ∞ compared with any finite Biot number', () => {
    const infinite = discSpreadingResistance({ ...BASE, source_area_mm2: 400 })!;
    const finite = discSpreadingResistance({ ...BASE, source_area_mm2: 400, bi: 5 })!;
    expect(finite.R_C_per_W).toBeGreaterThan(infinite.R_C_per_W);
  });

  it('scales linearly with 1/k and leaves the shape factors alone', () => {
    const soft = discSpreadingResistance({ ...BASE, source_area_mm2: 400, k_W_mK: 96 })!;
    const stiff = discSpreadingResistance({ ...BASE, source_area_mm2: 400, k_W_mK: 192 })!;
    expect(stiff.R_C_per_W).toBeCloseTo(soft.R_C_per_W / 2, 12);
    expect(stiff.psi).toBeCloseTo(soft.psi, 12);
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
    expect(
      discSpreadingResistance({ ...BASE, source_area_mm2: 0 }),
    ).toBeNull();
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
