import { describe, expect, it } from 'vitest';

import {
  flatPlateConvection,
  plateCharacteristicLength_m,
  type PlateOrientation,
} from './flatPlate';

/**
 * The reference case is the cavity filter's exposed shell on a real FR1 RRU:
 * a 336 mm tall outer face at 45 °C ambient. Textbook natural convection puts
 * a vertical plate that size between 4 and 6 W/m²K across the temperature range
 * it will actually run at — which is the point, because the fin correlation
 * next door reads 6.23 and had been copied onto it.
 */
const RRU_FACE = {
  orientation: 'Vertical' as PlateOrientation,
  height_mm: 336,
  ambientTemperature_C: 45,
};

describe('a vertical exposed wall', () => {
  it('lands where Churchill–Chu puts it', () => {
    const result = flatPlateConvection({ ...RRU_FACE, surfaceTemperature_C: 80 })!;

    expect(result.characteristicLength_m).toBeCloseTo(0.336, 6);
    expect(result.deltaT_C).toBe(35);
    // Ra ~7e7 is laminar-to-transitional for air on a plate this size.
    expect(result.rayleigh).toBeGreaterThan(5e7);
    expect(result.rayleigh).toBeLessThan(1e8);
    expect(result.h_conv_W_m2K).toBeCloseTo(4.79, 1);
  });

  // The whole reason this module exists: a fin channel's coefficient is not a
  // flat wall's, and the gap is large enough to matter.
  it('is well below the fin-array correlation it was being copied from', () => {
    const result = flatPlateConvection({ ...RRU_FACE, surfaceTemperature_C: 80 })!;

    expect(result.h_conv_W_m2K).toBeLessThan(6.23 * 0.85);
  });

  it('rises with the driving temperature difference, and slowly', () => {
    const cool = flatPlateConvection({ ...RRU_FACE, surfaceTemperature_C: 70 })!;
    const hot = flatPlateConvection({ ...RRU_FACE, surfaceTemperature_C: 100 })!;

    expect(hot.h_conv_W_m2K).toBeGreaterThan(cool.h_conv_W_m2K);
    // Roughly ΔT^(1/4): more than doubling ΔT buys about a quarter more h, and
    // a model that scaled it linearly would be badly wrong at the extremes.
    expect(hot.h_conv_W_m2K / cool.h_conv_W_m2K).toBeLessThan(1.35);
  });

  // Each column of fluid rises independently, so a wall twice as wide has the
  // same coefficient — only a taller one differs.
  it('ignores the width and follows the height', () => {
    const short = flatPlateConvection({
      ...RRU_FACE,
      height_mm: 120,
      surfaceTemperature_C: 80,
    })!;
    const tall = flatPlateConvection({ ...RRU_FACE, surfaceTemperature_C: 80 })!;

    expect(short.h_conv_W_m2K).toBeGreaterThan(tall.h_conv_W_m2K);
    expect(
      flatPlateConvection({ ...RRU_FACE, width_mm: 9999, surfaceTemperature_C: 80 })!.h_conv_W_m2K,
    ).toBeCloseTo(tall.h_conv_W_m2K, 12);
  });
});

describe('orientation', () => {
  const horizontal = (orientation: PlateOrientation) =>
    flatPlateConvection({
      orientation,
      height_mm: 336,
      width_mm: 275,
      ambientTemperature_C: 45,
      surfaceTemperature_C: 80,
    })!;

  // Hot face down has to push the fluid sideways to get rid of it, so it is
  // about half as good as the same plate facing up.
  it('makes a downward-facing plate roughly half an upward-facing one', () => {
    const up = horizontal('HorizontalUp');
    const down = horizontal('HorizontalDown');

    expect(down.h_conv_W_m2K).toBeLessThan(up.h_conv_W_m2K);
    expect(down.h_conv_W_m2K / up.h_conv_W_m2K).toBeCloseTo(0.5, 1);
  });

  it('uses area over perimeter for a horizontal plate', () => {
    expect(plateCharacteristicLength_m('HorizontalUp', 336, 275)).toBeCloseTo(
      (0.336 * 0.275) / (2 * (0.336 + 0.275)),
      9,
    );
    // A vertical plate does not need the width at all.
    expect(plateCharacteristicLength_m('Vertical', 336, null)).toBeCloseTo(0.336, 9);
    expect(plateCharacteristicLength_m('HorizontalUp', 336, null)).toBeNull();
  });
});

describe('guards', () => {
  // At ΔT ≤ 0 there is no buoyant plume to correlate. Returning a small number
  // would be inventing one; the honest answer is that the model does not apply.
  it('returns null when the surface is not hotter than the air', () => {
    expect(flatPlateConvection({ ...RRU_FACE, surfaceTemperature_C: 45 })).toBeNull();
    expect(flatPlateConvection({ ...RRU_FACE, surfaceTemperature_C: 30 })).toBeNull();
  });

  it('returns null when an input is missing', () => {
    expect(flatPlateConvection({ ...RRU_FACE, height_mm: null, surfaceTemperature_C: 80 })).toBeNull();
    expect(
      flatPlateConvection({ ...RRU_FACE, surfaceTemperature_C: null }),
    ).toBeNull();
    expect(
      flatPlateConvection({ ...RRU_FACE, ambientTemperature_C: null, surfaceTemperature_C: 80 }),
    ).toBeNull();
  });
});
