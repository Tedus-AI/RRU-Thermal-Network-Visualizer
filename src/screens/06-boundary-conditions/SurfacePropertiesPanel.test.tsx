import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { SurfaceProperty } from '@/thermal/boundary/types';

import { SurfacePropertiesPanel } from './SurfacePropertiesPanel';

describe('SurfacePropertiesPanel', () => {
  it('renders Chinese source labels while preserving source enum values', () => {
    const properties: SurfaceProperty[] = [
      {
        surface_group_id: 'SG_FIN',
        name: 'Fin Surface',
        emissivity: 0.85,
        absorptivity: 0.7,
        source: 'datasheet',
      },
    ];

    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <SurfacePropertiesPanel
          groups={[{ id: 'SG_FIN', name: 'Fin Surface' }]}
          properties={properties}
          solarEnabled={true}
          solarIrradiance_W_m2={800}
          readOnly={false}
          onChange={vi.fn()}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('<option value="manual">手動輸入</option>');
    expect(html).toContain('<option value="datasheet" selected="">規格書</option>');
    expect(html).toContain('<option value="assumed">工程假設</option>');
    expect(html).toContain('<option value="measurement">實測值</option>');
    expect(html).toContain('<option value="vendor">原廠資料</option>');
  });

  it('masks absorptivity without deleting it when Screen 01 solar load is zero', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <SurfacePropertiesPanel
          groups={[{ id: 'SG_FIN', name: 'Fin Surface' }]}
          properties={[
            {
              surface_group_id: 'SG_FIN',
              name: 'Fin Surface',
              emissivity: 0.85,
              absorptivity: 0.7,
              source: 'datasheet',
            },
          ]}
          solarEnabled={false}
          solarIrradiance_W_m2={0}
          readOnly={false}
          onChange={vi.fn()}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('未使用');
    expect(html).toContain('SCR01 日照負載為 0 W/m²');
    expect(html).not.toContain('Absorptivity for Fin Surface');
  });
});
