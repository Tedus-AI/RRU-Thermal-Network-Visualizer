/**
 * The Screen 04 field that says how much of the base a part spreads into — see
 * `SpreadingDomainSpec`. The default has to read as the default, an unfinished
 * stated area has to say what it falls back to, and a stated one has to say
 * what share of the base it is.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { createComponent, type Component, type SpreadingDomainSpec } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';

import { ThermalSpecTab } from './ComponentInspectorThermalTab';
import { deriveInspector } from './componentInspectorModel';

const materials = {
  ...defaultMaterials(),
  hsk_base_L_mm: sourced(339, 'Manual'),
  hsk_base_W_mm: sourced(272, 'Manual'),
};

function part(domain?: SpreadingDomainSpec): Component {
  const component = createComponent({
    id: 'CMP_PM',
    name: 'Power Module',
    category: 'Power',
    power_W: 29,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: new Date().toISOString(),
    },
  });
  if (domain) component.thermal_spec = { ...component.thermal_spec, spreading_domain: domain };
  return component;
}

function render(component: Component, readOnly = false) {
  const onPatch = vi.fn();
  const derived = deriveInspector(component, onPatch, materials, undefined);
  const html = renderToStaticMarkup(
    <ThermalSpecTab component={component} readOnly={readOnly} onPatch={onPatch} derived={derived} />,
  );
  return { html, onPatch, derived };
}

describe('Screen 04 spreading domain field', () => {
  it('offers the three choices and marks the whole base as the default', () => {
    const { html } = render(part());
    expect(html).toContain('Spreading into the Base / 擴散範圍');
    expect(html).toContain('Whole base / 整片基座 — default');
    expect(html).toContain('Own share of the heat / 依熱量分配');
    expect(html).toContain('Stated area / 指定面積');
    expect(html).not.toContain('ins-spreading-area');
  });

  it('says a stated mode without its area falls back to the whole base', () => {
    const { html } = render(part({ mode: 'Manual', area_mm2: null }));
    expect(html).toContain('ins-spreading-area');
    expect(html).toContain('No area stated — this part spreads into the whole base until one is.');
  });

  it('shows a stated area as a share of the base, and says when it is clamped', () => {
    expect(render(part({ mode: 'Manual', area_mm2: 8000 })).html).toContain(
      '8.7 % of the 92,208 mm² base.',
    );
    expect(render(part({ mode: 'Manual', area_mm2: 200000 })).html).toContain(
      'larger than the base, so the whole base is used',
    );
  });

  it('writes the choice to the component under its own field name', () => {
    const { derived, onPatch } = render(part());
    derived.patchSpreadingDomain({ mode: 'HeatShare' });
    expect(onPatch).toHaveBeenCalledWith(
      'CMP_PM',
      {
        thermal_spec: expect.objectContaining({
          spreading_domain: { mode: 'HeatShare', area_mm2: null },
        }),
      },
      ['spreading_domain'],
    );
  });
});
