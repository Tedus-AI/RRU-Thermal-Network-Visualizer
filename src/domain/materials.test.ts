import { describe, expect, it } from 'vitest';

import {
  BUILTIN_TIM_IDS,
  assumedCount,
  coinAreaMm2,
  defaultMaterials,
  findTimMaterial,
  nextTimId,
  normalizeMaterials,
  resolveTim,
  timUsageCount,
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
    expect(materials.tim.length).toBe(7);
    for (const material of materials.tim) {
      expect(material.id).toBeTruthy();
      expect(material.name).toBeTruthy();
      expect(material.k_W_mK.value).toBeGreaterThan(0);
      expect(material.blt_mm.value).toBeGreaterThan(0);
      expect(material.k_W_mK.source).toBe('Assumed');
    }
    expect(materials.copper_k_W_mK.value).toBe(380);
    expect(materials.copper_k_W_mK.source).toBe('Assumed');
  });

  /**
   * The point of shipping values: Screen 04 can inherit on day one, without
   * anyone having visited Screen 01 first.
   */
  it('resolves a TIM straight out of the box', () => {
    const resolved = resolveTim(tim({ tim_id: BUILTIN_TIM_IDS.grease }), defaultMaterials());
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
  it('lets a component override the bond line but not the conductivity', () => {
    const resolved = resolveTim(
      tim({ tim_id: BUILTIN_TIM_IDS.grease, blt_mm: sourced(0.02, 'Measurement') }),
      defaultMaterials(),
    );
    // Bond line is a build outcome, so the component's measurement wins.
    expect(resolved.thickness_mm).toBe(0.02);
    // Conductivity is a material property; there is no way to override it.
    expect(resolved.k_W_mK).toBe(3.0);
    expect(resolved.inherited).toBe(false);
  });

  it('uses the material default when the component states no bond line', () => {
    const resolved = resolveTim(tim({ tim_id: BUILTIN_TIM_IDS.grease }), defaultMaterials());
    expect(resolved.thickness_mm).toBe(0.05);
    expect(resolved.inherited).toBe(true);
  });

  it('resolves nothing when no material is chosen', () => {
    const resolved = resolveTim(tim({ tim_id: null }), defaultMaterials());
    expect(resolved.k_W_mK).toBeNull();
    expect(resolved.thickness_mm).toBeNull();
    expect(resolved.missing).toBe(false);
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
    expect(findTimMaterial(materials, BUILTIN_TIM_IDS.grease)!.k_W_mK.value).toBe(3.0);
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
    expect(reloaded.tim[0].k_W_mK.updated_at).toBe(materials.tim[0].k_W_mK.updated_at);
  });
});

describe('the library as a list', () => {
  const spec = (id: string | null) => ({ thermal_spec: { tim: tim({ tim_id: id }) } });

  it('counts what points at a material, which is what guards deletion', () => {
    const components = [
      spec(BUILTIN_TIM_IDS.grease),
      spec(BUILTIN_TIM_IDS.grease),
      spec(BUILTIN_TIM_IDS.putty),
      spec(null),
    ];
    expect(timUsageCount(components, BUILTIN_TIM_IDS.grease)).toBe(2);
    expect(timUsageCount(components, BUILTIN_TIM_IDS.pcm)).toBe(0);
  });

  it('never hands out an id the library already uses', () => {
    const materials = defaultMaterials();
    expect(materials.tim.some((material) => material.id === nextTimId(materials))).toBe(false);
  });

  // Components reference the id, so renaming must not disturb resolution.
  it('resolves through a rename', () => {
    const materials = defaultMaterials();
    materials.tim = materials.tim.map((material) =>
      material.id === BUILTIN_TIM_IDS.grease ? { ...material, name: 'Shin-Etsu G777' } : material,
    );
    const resolved = resolveTim(tim({ tim_id: BUILTIN_TIM_IDS.grease }), materials);
    expect(resolved.k_W_mK).toBe(3.0);
    expect(resolved.material?.name).toBe('Shin-Etsu G777');
  });

  /**
   * A dangling reference and "no TIM" both resolve to nothing, but they are
   * different situations: one is a decision, the other needs fixing. The UI can
   * only say so if the model tells them apart.
   */
  it('distinguishes a deleted material from no TIM at all', () => {
    const deleted = resolveTim(tim({ tim_id: 'TIM_GONE' }), defaultMaterials());
    expect(deleted.k_W_mK).toBeNull();
    expect(deleted.missing).toBe(true);

    const none = resolveTim(tim({ tim_id: null }), defaultMaterials());
    expect(none.missing).toBe(false);
  });

  it('reads a library written by an older build as a keyed object', () => {
    const materials = normalizeMaterials({
      tim: { Grease: { k_W_mK: { value: 4.2, source: 'Vendor' }, blt_mm: 0.08 } },
    });
    expect(materials.tim).toHaveLength(1);
    // The builtin id is reused, so components already pointing at it still work.
    expect(materials.tim[0].id).toBe(BUILTIN_TIM_IDS.grease);
    expect(materials.tim[0].k_W_mK.value).toBe(4.2);
  });

  it('keeps a deliberately empty library empty', () => {
    expect(normalizeMaterials({ tim: [] }).tim).toEqual([]);
  });

  it('drops a duplicate id rather than leaving one unreachable', () => {
    const materials = normalizeMaterials({
      tim: [
        { id: 'TIM_X', name: 'One', k_W_mK: 3, blt_mm: 0.1 },
        { id: 'TIM_X', name: 'Two', k_W_mK: 5, blt_mm: 0.2 },
      ],
    });
    expect(materials.tim).toHaveLength(1);
    expect(materials.tim[0].name).toBe('One');
  });
});
