import { describe, expect, it } from 'vitest';

import { computeRth } from './calculators';

/**
 * A calculator either produces a usable positive resistance or says it cannot.
 *
 * Each case below used to come back `resolved` with a value that is not a
 * resistance at all — infinite, zero or negative — so the Edge Inspector showed
 * a good number that the pre-solve checks would only reject later.
 */
describe('Rth calculator input validation', () => {
  const via = { thickness_mm: 1.6, effective_k_W_mK: 20, area_mm2: 100 };

  it('accepts a via efficiency in (0, 1]', () => {
    const full = computeRth('via_array', { ...via, via_efficiency: 1 });
    const derated = computeRth('via_array', { ...via, via_efficiency: 0.8 });
    expect(full.resolution).toBe('resolved');
    expect(derated.value!).toBeCloseTo(full.value! / 0.8, 12);
  });

  it.each([0, -1, 5])('refuses a via efficiency of %s', (efficiency) => {
    const result = computeRth('via_array', { ...via, via_efficiency: efficiency });
    expect(result.value).toBeNull();
    expect(result.resolution).toBe('unresolved');
    expect(result.note).toMatch(/efficiency/i);
  });

  it.each([
    ['conduction_LkA', { length_mm: -5, k_W_mK: 200, area_mm2: 100 }],
    ['conduction_LkA', { length_mm: 0, k_W_mK: 200, area_mm2: 100 }],
    ['tim_thickness_k', { thickness_mm: -1, k_W_mK: 3, area_mm2: 100 }],
    ['via_array', { thickness_mm: 0, effective_k_W_mK: 20, area_mm2: 100 }],
    ['solder_voiding', { thickness_mm: -0.1, k_W_mK: 58, area_mm2: 100 }],
  ] as const)('refuses a non-positive length for %s', (method, params) => {
    const result = computeRth(method, params);
    expect(result.value).toBeNull();
    expect(result.resolution).toBe('unresolved');
    expect(result.note).toMatch(/must be positive/);
  });

  it('refuses a negative quoted resistance but keeps a stated zero', () => {
    expect(computeRth('direct_rth', { R_C_per_W: -0.2 }).value).toBeNull();
    // Zero stays: the pre-solve check explains it as an isothermal part.
    const zero = computeRth('direct_rth', { R_C_per_W: 0 });
    expect(zero.resolution).toBe('resolved');
    expect(zero.value).toBe(0);
  });

  it('still resolves ordinary inputs', () => {
    expect(computeRth('conduction_LkA', { length_mm: 5, k_W_mK: 200, area_mm2: 100 }).value).toBeCloseTo(
      0.25,
      12,
    );
    expect(computeRth('tim_thickness_k', { thickness_mm: 0.1, k_W_mK: 3, area_mm2: 200 }).value).toBeCloseTo(
      0.1 / 1000 / (3 * 200e-6),
      12,
    );
  });
});
