import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { sourced } from '@/domain/sourcedValue';
import { parseTimCatalog } from '@/domain/timCatalog';
import type { TimMaterial } from '@/domain/materials';
import type { TimCatalogState } from '@/data/timCatalogStore';

import { TimCatalogPicker } from './TimCatalogPicker';

const CATALOG = parseTimCatalog({
  format: 'tim-catalog',
  materials: [
    { id: 'mat_gf', vendor: 'Vendor-B', model: 'GF-750', family: 'Pad', k: 7.8, k_method: 'ASTM D5470', type_label: 'Thermal Pad', avl_label: '已承認' },
    { id: 'mat_tp', vendor: 'Vendor-A', model: 'TP-910', family: 'Putty', k: 9.1, type_label: 'Thermal Putty' },
    { id: 'mat_pcm', vendor: 'Vendor-D', model: 'PCM-45', family: 'Grease', family_exact: false, k: 4.5, type_label: 'Phase Change' },
    { id: 'mat_x', vendor: 'Vendor-E', model: '<b>x</b>', family: 'Pad', k: 3 },
  ],
})!;

const tim = (id: string, name: string, catalog?: string): TimMaterial => ({
  id,
  name,
  k_W_mK: sourced(1),
  blt_mm: sourced(1),
  ...(catalog ? { catalog: { id: catalog } } : {}),
});

function render(library: TimMaterial[], state: TimCatalogState = 'ok') {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return renderToStaticMarkup(
      <TimCatalogPicker
        library={library}
        catalog={state === 'ok' ? CATALOG : null}
        state={state}
        error=""
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  } finally {
    quiet.mockRestore();
  }
}

describe('TimCatalogPicker', () => {
  it('lists the catalog with k, its method and what picking would do', () => {
    const html = render([tim('TIM_A', 'Vendor-A TP-910', 'mat_tp'), tim('TIM_B', 'gf-750')]);
    expect(html).toContain('TIM 管理工具 4 筆材料');
    expect(html).toMatch(/TP-910[\s\S]*已在本專案/);
    expect(html).toMatch(/GF-750[\s\S]*ASTM D5470[\s\S]*本專案有同名，將改為連結/);
    expect(html).toMatch(/PCM-45[\s\S]*類型請確認/);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
    // the linked one cannot be picked twice
    expect(html).toMatch(/aria-label="選取 Vendor-A TP-910" disabled=""/);
  });

  it('without a catalog it says why (not signed in / not published yet)', () => {
    expect(render([], 'login')).toContain('需要登入 Microsoft（SharePoint）');
    expect(render([], 'missing')).toContain('SharePoint 上還沒有 TIM 型號目錄');
  });
});
