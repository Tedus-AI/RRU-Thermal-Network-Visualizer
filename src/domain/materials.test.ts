import { describe, expect, it } from 'vitest';

import {
  TIM_MATERIAL_TYPES,
  assumedCount,
  coinAreaMm2,
  defaultMaterials,
  normalizeMaterials,
  resolveTim,
} from './materials';
import { emptyTim, type TimSpec } from './component';
import { sourced } from './sourcedValue';

const tim = (patch: Partial<TimSpec> = {}): TimSpec => ({ ...emptyTim(), ...patch });

/**
 * Every SourcedValue is stamped with the moment it was built, so two separately
 * constructed default sets differ by whatever milliseconds elapsed between
 * them. That is real behaviour and worth keeping, but it is not what these
 * assertions are about — comparing shapes means comparing them without it.
 */
function withoutTimestamps<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutTimestamps) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'updated_at')
        .map(([key, entry]) => [key, withoutTimestamps(entry)]),
    ) as T;
  }
  return value;
}

describe('shipped defaults', () => {
  it('ships a value for every material constant, marked Assumed', () => {
    const materials = defaultMaterials();
    for (const type of TIM_MATERIAL_TYPES) {
      expect(materials.tim[type].k_W_mK.value).toBeGreaterThan(0);
      expect(materials.tim[type].blt_mm.value).toBeGreaterThan(0);
      expect(materials.tim[type].k_W_mK.source).toBe('Assumed');
    }
    expect(materials.copper_k_W_mK.value).toBe(380);
    expect(materials.copper_k_W_mK.source).toBe('Assumed');
  });

  /**
   * The point of shipping values: Screen 04 can inherit on day one, without
   * anyone having visited Screen 01 first.
   */
  it('resolves a TIM straight out of the box', () => {
    const resolved = resolveTim(tim({ type: 'Grease' }), defaultMaterials());
    expect(resolved.k_W_mK).toBe(3.0);
    expect(resolved.thickness_mm).toBe(0.05);
    expect(resolved.inherited).toBe(true);
  });

  // A guessed coin size would move every PA's margin with nobody being told.
  it('ships NO coin size, because there is no defensible one', () => {
    const materials = defaultMaterials();
    expect(materials.coin_L_mm).toBeNull();
    expect(materials.coin_W_mm).toBeNull();
    expect(coinAreaMm2(materials)).toBeNull();
  });

  it('needs both coin dimensions before it reports an area', () => {
    const materials = defaultMaterials();
    expect(coinAreaMm2({ ...materials, coin_L_mm: sourced(55, 'Manual') })).toBeNull();
    expect(
      coinAreaMm2({
        ...materials,
        coin_L_mm: sourced(55, 'Manual'),
        coin_W_mm: sourced(35, 'Manual'),
      }),
    ).toBe(1925);
  });

  it('counts what is still on a shipped value', () => {
    const materials = defaultMaterials();
    // 7 TIM materials x 2 properties, plus the 6 process constants.
    expect(assumedCount(materials)).toBe(20);
    expect(assumedCount({ ...materials, copper_k_W_mK: sourced(400, 'Manual') })).toBe(19);
  });
});

describe('resolveTim', () => {
  it('lets a component value win over the project one', () => {
    const resolved = resolveTim(
      tim({ type: 'Grease', inheritance: 'component', k_W_mK: sourced(8, 'Measurement') }),
      defaultMaterials(),
    );
    expect(resolved.k_W_mK).toBe(8);
    // The BLT was not overridden, so it still comes from the project.
    expect(resolved.thickness_mm).toBe(0.05);
    expect(resolved.inherited).toBe(false);
  });

  /**
   * The flag drives the UI; it must not decide resolution. A measured number
   * that was saved would otherwise be silently dropped for a shipped constant
   * because of a checkbox nobody had touched.
   */
  it('honours a stored value even when the flag says inherit', () => {
    const resolved = resolveTim(
      tim({ type: 'Grease', inheritance: 'project', thickness_mm: sourced(0.02, 'Measurement') }),
      defaultMaterials(),
    );
    expect(resolved.thickness_mm).toBe(0.02);
  });

  it('resolves nothing for None or Custom rather than borrowing another material', () => {
    for (const type of ['None', 'Custom'] as const) {
      const resolved = resolveTim(tim({ type }), defaultMaterials());
      expect(resolved.k_W_mK).toBeNull();
      expect(resolved.thickness_mm).toBeNull();
    }
  });
});

describe('normalizeMaterials', () => {
  it('returns the shipped set for a project written before this section existed', () => {
    const expected = withoutTimestamps(defaultMaterials());
    expect(withoutTimestamps(normalizeMaterials(undefined))).toEqual(expected);
    expect(withoutTimestamps(normalizeMaterials(null))).toEqual(expected);
  });

  it('fills a partial record rather than leaving holes', () => {
    const materials = normalizeMaterials({ copper_k_W_mK: { value: 400, source: 'Vendor' } });
    expect(materials.copper_k_W_mK.value).toBe(400);
    expect(materials.copper_k_W_mK.source).toBe('Vendor');
    expect(materials.tim.Grease.k_W_mK.value).toBe(3.0);
    expect(materials.via_efficiency.value).toBe(0.9);
  });

  it('accepts a bare number from a hand-edited file and calls it Manual', () => {
    const materials = normalizeMaterials({ solder_voiding: 0.6 });
    expect(materials.solder_voiding.value).toBe(0.6);
    expect(materials.solder_voiding.source).toBe('Manual');
  });

  it('falls back rather than storing a value that is not a number', () => {
    const materials = normalizeMaterials({
      copper_k_W_mK: 'four hundred',
      via_efficiency: { value: null },
    });
    expect(materials.copper_k_W_mK.value).toBe(380);
    expect(materials.via_efficiency.value).toBe(0.9);
  });

  // Absent must survive a round trip, or every project would gain a coin size.
  it('keeps an absent coin size absent', () => {
    expect(normalizeMaterials({}).coin_L_mm).toBeNull();
    expect(normalizeMaterials({ coin_L_mm: null }).coin_L_mm).toBeNull();
    expect(normalizeMaterials({ coin_L_mm: 55 }).coin_L_mm?.value).toBe(55);
  });

  it('round trips its own output', () => {
    const materials = defaultMaterials();
    const reloaded = normalizeMaterials(JSON.parse(JSON.stringify(materials)));
    expect(reloaded).toEqual(materials);
    // The stamp is part of the payload here, so a round trip must preserve it
    // rather than restamp the value as if it had just been decided.
    expect(reloaded.tim.Grease.k_W_mK.updated_at).toBe(materials.tim.Grease.k_W_mK.updated_at);
  });
});
