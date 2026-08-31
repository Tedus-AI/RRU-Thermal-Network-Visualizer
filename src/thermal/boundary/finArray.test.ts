import { describe, expect, it } from 'vitest';

import {
  finArrayBoundary,
  finAspectRatio,
  finAspectRatioVerdict,
  finConvectionH,
  finCount,
  finEfficiency,
  finRadiationH,
} from './finArray';

/**
 * The reference case is a real FR1 RRU: a 336 x 275 mm base carrying 22 fins
 * 55.86 mm tall, sized by the volume-evaluation tool at 45 C ambient for
 * 353.72 W. Its screen reads h_conv 6.23, h_rad 2.40, eta_fin 0.930, aspect
 * ratio 4.8 and a required area of 0.918 m². Reproducing all five from the
 * geometry alone is what says this port is faithful.
 */
const RRU = {
  baseLength_mm: 336,
  baseWidth_mm: 275,
  finHeight_mm: 55.86,
  gap_mm: 11.66,
  thickness_mm: 1.2,
  technology: 'Embedded',
} as const;

describe('the FR1 RRU reference heat sink', () => {
  it('reproduces the sizing tool, coefficient by coefficient', () => {
    const result = finArrayBoundary(RRU)!;

    expect(result.h_conv_W_m2K).toBeCloseTo(6.23, 2);
    expect(result.h_rad_W_m2K).toBeCloseTo(2.4, 3);
    expect(result.h_total_W_m2K).toBeCloseTo(8.63, 2);
    expect(result.eta_fin).toBeCloseTo(0.93, 3);
    expect(result.aspect_ratio).toBeCloseTo(4.79, 2);
  });

  it('reproduces its area from the fin count it derives', () => {
    const result = finArrayBoundary(RRU)!;

    expect(result.fin_count).toBe(22);
    expect(result.base_area_m2).toBeCloseTo(0.0924, 4);
    expect(result.area_m2).toBeCloseTo(0.918, 3);
  });

  // 353.72 W over that boundary from 45 C. The sizing tool puts the base at
  // 90.3 C, but only because it ships a 1.06 process factor; at the honest
  // fin efficiency the same geometry runs 2.7 C hotter, and that 2.7 C is the
  // room this tool's spreading resistance has to occupy.
  it('leaves the process residual out unless it is asked for', () => {
    const honest = finArrayBoundary(RRU)!;
    const withResidual = finArrayBoundary({ ...RRU, processEfficiency: 1.06 })!;

    expect(honest.effectiveness).toBeCloseTo(honest.eta_fin, 12);
    expect(withResidual.effectiveness).toBeCloseTo(0.9858, 4);

    const rise = (r: { R_C_per_W: number }) => 353.72 * r.R_C_per_W;
    expect(45 + rise(withResidual)).toBeCloseTo(90.3, 1);
    expect(45 + rise(honest)).toBeCloseTo(93.0, 1);
    expect(rise(honest) - rise(withResidual)).toBeCloseTo(2.72, 2);
  });

  // Two fits reach eta = 0.930: pure aluminium at 1.2 mm and ADC12 at 1.5 mm.
  // The screens do not distinguish them, so neither does this — but the
  // conductivity has to be an input rather than a constant for both to be
  // expressible.
  it('reaches the same efficiency for ADC12 at a thicker fin', () => {
    const dieCast = finArrayBoundary({
      ...RRU,
      technology: 'DieCasting',
      thickness_mm: 1.5,
      draftAngle_deg: 0,
    })!;

    expect(dieCast.eta_fin).toBeCloseTo(0.93, 3);
  });
});

describe('finConvectionH', () => {
  // The height term is the whole point of the correlation: a constant-h model
  // flatters a tall heat sink, and the error grows with every millimetre.
  it('falls as the fins grow', () => {
    const short = finConvectionH(11.66, 40)!;
    const tall = finConvectionH(11.66, 90)!;

    expect(short).toBeGreaterThan(tall);
    expect(tall / short).toBeCloseTo((40 / 90) ** 0.2, 6);
  });

  it('is unchanged at the reference fin height', () => {
    expect(finConvectionH(11.66, 70)).toBeCloseTo(6.4 * Math.tanh(11.66 / 7), 9);
  });

  // The fit was never exercised on very short fins, so the height factor is
  // clamped rather than extrapolated into a coefficient nobody measured.
  it('clamps below the floor instead of extrapolating', () => {
    expect(finConvectionH(11.66, 5)).toBeCloseTo(finConvectionH(11.66, 20)!, 12);
  });

  it('returns null rather than a number when an input is missing', () => {
    expect(finConvectionH(null, 55.86)).toBeNull();
    expect(finConvectionH(11.66, 0)).toBeNull();
  });
});

describe('finRadiationH', () => {
  it('saturates at the reference gap and derates below it', () => {
    expect(finRadiationH(10)).toBeCloseTo(2.4, 9);
    expect(finRadiationH(20)).toBeCloseTo(2.4, 9);
    expect(finRadiationH(2.5)).toBeCloseTo(1.2, 9);
  });
});

describe('finEfficiency', () => {
  it('approaches 1 for a perfectly conducting fin', () => {
    const eta = finEfficiency({
      finHeight_mm: 55.86,
      thickness_mm: 1.2,
      h_W_m2K: 8.63,
      k_W_mK: 1e7,
    })!;

    expect(eta).toBeGreaterThan(0.9999);
  });

  it('drops for a tall fin in a poor conductor', () => {
    const eta = finEfficiency({
      finHeight_mm: 120,
      thickness_mm: 0.8,
      h_W_m2K: 8.63,
      k_W_mK: 160,
    })!;

    expect(eta).toBeLessThan(0.8);
  });
});

describe('finCount', () => {
  // n fins leave n-1 channels, so the span is not width/pitch: the last channel
  // needs no fin after it, and rounding up by one overruns the face.
  it('fits n fins and n-1 channels inside the width', () => {
    expect(finCount(275, 11.66, 1.2)).toBe(22);
    expect(22 * 1.2 + 21 * 11.66).toBeLessThanOrEqual(275);
    expect(23 * 1.2 + 22 * 11.66).toBeGreaterThan(275);
  });

  it('returns null when not even one fin fits', () => {
    expect(finCount(1, 11.66, 1.2)).toBeNull();
  });
});

describe('draft angle', () => {
  // A die-cast fin thickens toward the root, which narrows the channel at fixed
  // pitch and can cost a fin across the same face.
  it('thickens the root and never adds fins', () => {
    const straight = finArrayBoundary({ ...RRU, technology: 'DieCasting', draftAngle_deg: 0 })!;
    const drafted = finArrayBoundary({ ...RRU, technology: 'DieCasting', draftAngle_deg: 1.25 })!;

    expect(drafted.rootThickness_mm).toBeGreaterThan(drafted.efficiencyThickness_mm);
    expect(drafted.efficiencyThickness_mm).toBeGreaterThan(RRU.thickness_mm);
    expect(drafted.fin_count).toBeLessThanOrEqual(straight.fin_count);
    // A thicker fin conducts better, so the efficiency rises even as the count
    // falls — the two effects pull opposite ways and both have to be modelled.
    expect(drafted.eta_fin).toBeGreaterThan(straight.eta_fin);
  });
});

describe('finArrayBoundary guards', () => {
  it('returns null when any geometry input is missing', () => {
    expect(finArrayBoundary({ ...RRU, finHeight_mm: null })).toBeNull();
    expect(finArrayBoundary({ ...RRU, gap_mm: null })).toBeNull();
    expect(finArrayBoundary({ ...RRU, baseWidth_mm: undefined })).toBeNull();
  });

  it('returns null rather than a boundary when no fin fits the face', () => {
    expect(finArrayBoundary({ ...RRU, baseWidth_mm: 1 })).toBeNull();
  });
});

describe('finAspectRatioVerdict', () => {
  it('reports where the channel sits relative to the calibrated band', () => {
    expect(finAspectRatio(55.86, 11.66)).toBeCloseTo(4.79, 2);
    expect(finAspectRatioVerdict(4.79)).toBe('inside');
    expect(finAspectRatioVerdict(3.0)).toBe('wide');
    expect(finAspectRatioVerdict(9.0)).toBe('narrow');
    expect(finAspectRatioVerdict(null)).toBeNull();
  });
});
