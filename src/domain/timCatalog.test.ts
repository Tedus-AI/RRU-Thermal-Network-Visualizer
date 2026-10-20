import { describe, expect, it } from 'vitest';

import { normalizeMaterials, type TimMaterial } from './materials';
import { sourced } from './sourcedValue';
import {
  followCatalog,
  parseTimCatalog,
  sameName,
  timFromCatalog,
  type TimCatalog,
  type TimCatalogMaterial,
} from './timCatalog';

const RAW = {
  format: 'tim-catalog',
  version: 1,
  updated_at: '2026-10-20T00:00:00Z',
  materials: [
    { id: 'mat_gf', vendor: 'Vendor-B', model: 'GF-750', family: 'Pad', family_exact: true, k: 7.8, k_method: 'ASTM D5470', type_label: 'Thermal Pad' },
    { id: 'mat_tp', vendor: 'Vendor-A', model: 'TP-910', family: 'Putty', family_exact: true, k: 9.1, type_label: 'Thermal Putty' },
    { id: 'mat_pcm', vendor: 'Vendor-D', model: 'PCM-45', family: 'Grease', family_exact: false, k: 4.5 },
    { id: 'mat_nok', vendor: 'Vendor-F', model: 'NK-1', family: 'Pad', k: null },
    { id: '', model: 'no id' },
    { id: 'mat_nomodel', model: '  ' },
    'junk',
  ],
};

const catalog = (): TimCatalog => parseTimCatalog(RAW)!;
const find = (id: string): TimCatalogMaterial => catalog().materials.find((m) => m.id === id)!;

describe('TIM 型號目錄 (TIM Management Tool)', () => {
  it('reads only a catalog file, keeping entries with an id and a model', () => {
    expect(parseTimCatalog({ schema: 'tim-db' })).toBeNull();
    expect(parseTimCatalog(null)).toBeNull();
    const c = catalog();
    expect(c.materials.map((m) => m.id)).toEqual(['mat_gf', 'mat_tp', 'mat_pcm', 'mat_nok']);
    expect(find('mat_nok').k).toBeNull();
    expect(find('mat_pcm').family_exact).toBe(false);
  });

  it('a new linked material: catalog name and k (Datasheet, with the TIM manager as reference); BLT a typical Assumed value', () => {
    const t = timFromCatalog(find('mat_tp'), 'TIM_CUSTOM_7');
    expect(t).toMatchObject({ id: 'TIM_CUSTOM_7', name: 'Vendor-A TP-910', catalog: { id: 'mat_tp' } });
    expect(t.k_W_mK).toMatchObject({ value: 9.1, source: 'Datasheet', reference: 'TIM 管理工具 · Vendor-A TP-910' });
    expect(t.blt_mm).toMatchObject({ value: 0.3, source: 'Assumed', confidence: 'low' });
    expect(timFromCatalog(find('mat_gf'), 'X').k_W_mK.reference).toBe('TIM 管理工具 · Vendor-B GF-750 · ASTM D5470');
    // unknown k stays a low-confidence assumption, never a number the TIM manager did not state
    expect(timFromCatalog(find('mat_nok'), 'Y').k_W_mK).toMatchObject({ source: 'Assumed', confidence: 'low' });
  });

  it('linked materials follow name and k; the BLT and unlinked materials never change', () => {
    const linked: TimMaterial = {
      id: 'TIM_PAD',
      name: 'GF-750',
      k_W_mK: sourced(7.5, 'Manual'),
      blt_mm: sourced(1.7, 'Manual'),
      catalog: { id: 'mat_gf' },
    };
    const own: TimMaterial = { id: 'TIM_GREASE', name: 'Grease', k_W_mK: sourced(3, 'Assumed'), blt_mm: sourced(0.05, 'Assumed') };
    const gone: TimMaterial = { ...own, id: 'TIM_X', name: 'Old', catalog: { id: 'mat_deleted' } };
    const noK: TimMaterial = { ...own, id: 'TIM_N', name: 'Vendor-F NK-1', k_W_mK: sourced(2, 'Manual'), catalog: { id: 'mat_nok' } };
    const r = followCatalog([linked, own, gone, noK], catalog());
    expect(r.tim[0]).toMatchObject({ id: 'TIM_PAD', name: 'Vendor-B GF-750', blt_mm: { value: 1.7, source: 'Manual' } });
    expect(r.tim[0].k_W_mK).toMatchObject({ value: 7.8, source: 'Datasheet' });
    expect(r.tim[1]).toBe(own);
    expect(r.tim[2]).toBe(gone);
    expect(r.tim[3]).toBe(noK);
    expect(r.gone).toEqual(['TIM_X']);
    expect(r.changed).toEqual([{ id: 'TIM_PAD', name: 'Vendor-B GF-750', what: ['名稱 GF-750 → Vendor-B GF-750', 'k 7.5 → 7.8'] }]);
    // already in step → the same array, nothing to save
    const again = followCatalog(r.tim, catalog());
    expect(again.tim).toBe(r.tim);
    expect(again.changed).toEqual([]);
  });

  it('same name: "Vendor Model" or the bare model, case and spaces ignored', () => {
    const t = (name: string): TimMaterial => ({ id: 'a', name, k_W_mK: sourced(1), blt_mm: sourced(1) });
    expect(sameName(t('gf-750'), find('mat_gf'))).toBe(true);
    expect(sameName(t(' Vendor-B   GF-750 '), find('mat_gf'))).toBe(true);
    expect(sameName(t('GF-750S'), find('mat_gf'))).toBe(false);
  });

  it('a saved project keeps the link; an unusable link is dropped', () => {
    const m = normalizeMaterials({
      tim: [
        { id: 'TIM_PAD', name: 'Vendor-B GF-750', k_W_mK: { value: 7.8, source: 'Datasheet' }, blt_mm: 1.7, catalog: { id: 'mat_gf' } },
        { id: 'TIM_B', name: 'B', k_W_mK: 3, blt_mm: 0.1, catalog: { id: '' } },
        { id: 'TIM_C', name: 'C', k_W_mK: 3, blt_mm: 0.1, catalog: 'mat_x' },
      ],
    });
    expect(m.tim[0].catalog).toEqual({ id: 'mat_gf' });
    expect(m.tim[0].k_W_mK).toMatchObject({ value: 7.8, source: 'Datasheet' });
    expect('catalog' in m.tim[1]).toBe(false);
    expect('catalog' in m.tim[2]).toBe(false);
  });
});
