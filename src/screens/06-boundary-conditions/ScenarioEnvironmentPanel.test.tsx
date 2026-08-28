import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { createBoundarySet } from '@/thermal/boundary/types';

import { ALTITUDE_OPTIONS, ScenarioEnvironmentPanel } from './ScenarioEnvironmentPanel';

describe('ScenarioEnvironmentPanel', () => {
  it('offers only the four approved altitude levels and omits ambient data source', () => {
    const set = createBoundarySet({
      projectId: 'P1',
      networkId: 'MAIN',
      scenarioId: 'SCN_001',
      topologyVersion: 1,
      ambient_C: 55,
    });

    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <ScenarioEnvironmentPanel
          ambient={set.ambient}
          site={set.site}
          readOnly={false}
          onAmbient={vi.fn()}
          onSite={vi.fn()}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(ALTITUDE_OPTIONS.map((option) => option.value)).toEqual(['0', '1000', '1500', '3000']);
    for (const option of ALTITUDE_OPTIONS) expect(html).toContain(option.label);
    expect(html).not.toContain('Data Source');
    expect(html).toContain('Confidence');
  });
});
