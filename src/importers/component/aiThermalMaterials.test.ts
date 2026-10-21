/**
 * 5G-RRU's parameter console offered to 01's materials.
 *
 * The global_params below are StarKcore-12L's as stored in the 2026-09-21
 * backup (the fixture of aiThermalImport.test.ts keeps only t_PCB): coin 43 ×
 * 39.6 with no thickness or k saved, solder 58 / 0.3 / 0.75, the generic via
 * 30 × 0.9, base 7 mm under a 320 × 256 board with 8/11/8/8 margins, and the
 * three TIM fallbacks.
 */

import { describe, expect, it } from 'vitest';

import { BUILTIN_TIM_IDS, defaultMaterials, type MaterialDefaults } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';

import { rruMaterialDefaultPick, rruMaterialPatch, rruMaterialRows } from './aiThermalMaterials';

const STARKCORE = {
  global_params: {
    T_amb: 55,
    L_pcb: 320,
    W_pcb: 256,
    t_PCB: 2,
    t_base: 7,
    Top: 8,
    Btm: 11,
    Left: 8,
    Right: 8,
    Coin_L_Setting: 43,
    Coin_W_Setting: 39.6,
    K_Via: 30,
    Via_Eff: 0.9,
    K_Solder: 58,
    t_Solder: 0.3,
    Voiding: 0.75,
    K_Pad: 7.5,
    t_Pad: 1.7,
    K_Putty: 9.1,
    t_Putty: 0.5,
    K_Grease: 3,
    t_Grease: 0.05,
  },
};
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('5G-RRU parameter console → 01', () => {
  const materials = defaultMaterials();
  const rows = rruMaterialRows(STARKCORE, materials);
  const at = (id: string) => rows.find((r) => r.id === id)!;

  it('offers only what 5G-RRU stored: no coin thickness or coin k (5G-RRU runs those on its defaults)', () => {
    expect(ids(rows)).not.toContain('coin_thickness_mm');
    expect(ids(rows)).not.toContain('copper_k_W_mK');
    expect(ids(rows)).toEqual(
      expect.arrayContaining([
        'coin_L_mm',
        'coin_W_mm',
        'solder_k_W_mK',
        'solder_thickness_mm',
        'solder_voiding',
        'via_effective_k_W_mK',
        'via_efficiency',
        'hsk_base_thickness_mm',
        'hsk_base_L_mm',
        'hsk_base_W_mm',
      ]),
    );
  });

  it('the base envelope is the enclosure footprint: length takes Top + Bottom, width Left + Right', () => {
    expect(at('hsk_base_L_mm')).toMatchObject({ incoming: 339, from: 'PCB 長 320 ＋ Top 8 ＋ Bottom 11' });
    expect(at('hsk_base_W_mm')).toMatchObject({ incoming: 272, from: 'PCB 寬 256 ＋ Left 8 ＋ Right 8' });
  });

  it('marks what already matches, and what 01 still holds as the shipped value', () => {
    // 01 ships the same solder and via numbers 5G-RRU uses.
    for (const id of ['solder_k_W_mK', 'solder_thickness_mm', 'solder_voiding', 'via_effective_k_W_mK', 'via_efficiency']) {
      expect(at(id).same).toBe(true);
    }
    expect(at('coin_L_mm')).toMatchObject({ current: null, currentStated: false, same: false, incoming: 43 });
    expect(at(`${BUILTIN_TIM_IDS.pad}.k`)).toMatchObject({ current: 3, currentStated: false, incoming: 7.5 });
    expect(at(`${BUILTIN_TIM_IDS.pad}.blt`)).toMatchObject({ current: 0.5, incoming: 1.7 });
    // Grease 3 / 0.05 is 01's own default too.
    expect(at(`${BUILTIN_TIM_IDS.grease}.k`).same).toBe(true);
  });

  it('ticks empty and shipped values, leaves a stated one for the engineer', () => {
    const stated: MaterialDefaults = { ...materials, coin_L_mm: sourced(50, 'Manual') };
    const pick = rruMaterialDefaultPick(rruMaterialRows(STARKCORE, stated));
    expect(pick).not.toContain('coin_L_mm');
    expect(pick).toEqual(expect.arrayContaining(['coin_W_mm', 'hsk_base_L_mm', `${BUILTIN_TIM_IDS.pad}.k`]));
    expect(pick).not.toContain('solder_k_W_mK');
  });

  it('applies the picked rows only, stamped Imported with where they came from', () => {
    const patch = rruMaterialPatch(materials, rows, ['coin_L_mm', 'hsk_base_W_mm', `${BUILTIN_TIM_IDS.pad}.blt`], '5G-RRU 參數控制台（StarKcore-12L）');
    expect(Object.keys(patch).sort()).toEqual(['coin_L_mm', 'hsk_base_W_mm', 'tim']);
    expect(patch.coin_L_mm).toMatchObject({ value: 43, source: 'Imported', reference: '5G-RRU 參數控制台（StarKcore-12L）' });
    expect(patch.hsk_base_W_mm?.value).toBe(272);
    const pad = patch.tim!.find((m) => m.id === BUILTIN_TIM_IDS.pad)!;
    expect(pad.blt_mm).toMatchObject({ value: 1.7, source: 'Imported' });
    // Only the picked property; the rest of the library untouched.
    expect(pad.k_W_mK).toBe(materials.tim.find((m) => m.id === BUILTIN_TIM_IDS.pad)!.k_W_mK);
    expect(patch.tim!.filter((m) => m.id !== BUILTIN_TIM_IDS.pad)).toEqual(
      materials.tim.filter((m) => m.id !== BUILTIN_TIM_IDS.pad),
    );
    // Nothing picked → nothing to patch.
    expect(rruMaterialPatch(materials, rows, [], 'x')).toEqual({});
  });

  it('a TIM linked to the TIM Management Tool keeps its k; a removed built-in gets nothing', () => {
    const linked: MaterialDefaults = {
      ...materials,
      tim: materials.tim
        .filter((m) => m.id !== BUILTIN_TIM_IDS.putty)
        .map((m) => (m.id === BUILTIN_TIM_IDS.pad ? { ...m, catalog: { id: 'cat-1' } } : m)),
    };
    const r = ids(rruMaterialRows(STARKCORE, linked));
    expect(r).not.toContain(`${BUILTIN_TIM_IDS.pad}.k`);
    expect(r).toContain(`${BUILTIN_TIM_IDS.pad}.blt`);
    expect(r.some((id) => id.startsWith(BUILTIN_TIM_IDS.putty))).toBe(false);
  });

  it('ignores what is not a value: missing, zero, text, a fraction above 1, a missing margin', () => {
    const odd = rruMaterialRows(
      { global_params: { Coin_L_Setting: 0, Coin_W_Setting: 'abc', Voiding: 1.5, Via_Eff: '0.8', L_pcb: 320, Top: 8, W_pcb: 256, Left: 8, Right: 0 } },
      materials,
    );
    expect(ids(odd)).toEqual(['via_efficiency', 'hsk_base_W_mm']);
    expect(odd[0].incoming).toBe(0.8);
    expect(odd[1].incoming).toBe(264);
    expect(rruMaterialRows({}, materials)).toEqual([]);
  });
});
