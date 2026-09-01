import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type {
  BoundaryConditionProfile,
  BoundaryDerivedPreview,
  BoundaryPort,
} from '@/thermal/boundary/types';

import { BoundaryInspector } from './BoundaryInspector';

const validation = { status: 'ready_for_07' as const, errors: [], warnings: [], infos: [] };
const callbacks = {
  solarEnabled: true,
  onEditAmbient: vi.fn(),
  onUpsertProfile: vi.fn(),
  onRemoveProfile: vi.fn(),
  onAddProfile: vi.fn(),
};

function port(overrides: Partial<BoundaryPort> = {}): BoundaryPort {
  return {
    id: 'BP_FIN',
    name: 'Fin Surface Boundary',
    connected_node_id: 'NODE_FIN_SURFACE',
    surface_group_id: 'SG_FIN',
    area_m2: 0.42,
    orientation: 'vertical_fins',
    allowed_boundary_types: ['convection_to_ambient', 'radiation_to_surroundings'],
    dissipating: true,
    external_mappings: { import_status: 'deferred' },
    ...overrides,
  };
}

function profile(overrides: Partial<BoundaryConditionProfile> = {}): BoundaryConditionProfile {
  return {
    id: 'BCP_CONV',
    name: 'Fin convection',
    type: 'convection_to_ambient',
    representation: 'parallel_boundary_edges',
    parameters: { h_W_m2K: 18, area_m2: 0.42 },
    source: 'manual',
    confidence: 'high',
    ...overrides,
  };
}

function preview(overrides: Partial<BoundaryDerivedPreview> = {}): BoundaryDerivedPreview {
  return {
    boundary_port_id: 'BP_FIN',
    profile_ids: ['BCP_CONV'],
    r_conv_C_per_W: 0.13228,
    r_combined_C_per_W: 0.13228,
    completeness: 'complete',
    disclaimer: 'pre_solve_boundary_input_only',
    ...overrides,
  };
}

describe('why a filled-in port still says Assumption', () => {
  it('names the assumption and its value instead of only the badge', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ orientation: 'housing_wall' })}
          status="warning"
          profiles={[
            profile({
              id: 'BCP_RAD',
              name: 'Cavity filter exposed surface',
              type: 'radiation_to_surroundings',
              parameters: { emissivity: 0.9, viewFactor: 0.95, area_m2: 0.1405 },
            }),
          ]}
          preview={preview({
            profile_ids: ['BCP_RAD'],
            r_conv_C_per_W: undefined,
            r_combined_C_per_W: 0.9274,
            r_rad_C_per_W: 0.9274,
            h_rad_W_m2K: 7.502,
            completeness: 'warning',
            assumptions: [{ kind: 'surface_temperature_guess', value: 80 }],
          })}
          validation={validation}
          ambientTemperature_C={45}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    // The reader's actual question — "everything is filled in, so what is the
    // warning about?" — is answered on the page, with the number it stands on.
    expect(html).toContain('Surface temperature is a pre-solve guess');
    expect(html).toContain('80.0 °C');
  });

  it('says nothing when the preview carries no assumptions', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ orientation: 'housing_wall' })}
          status="ok"
          profiles={[profile()]}
          preview={preview()}
          validation={validation}
          ambientTemperature_C={45}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('Calculated Preview');
    expect(html).not.toContain('pre-solve guess');
  });
});

describe('BoundaryInspector simplification', () => {
  it('renders Ambient Reference as one inherited-temperature summary without setup tabs', () => {
    const html = renderToStaticMarkup(
      <BoundaryInspector
        port={port({
          id: 'BP_AMBIENT',
          name: 'Ambient Reference',
          connected_node_id: 'NODE_AMBIENT',
          surface_group_id: 'SG_AMBIENT',
          area_m2: null,
          dissipating: false,
          allowed_boundary_types: ['ambient_reservoir', 'external_cfd_placeholder'],
        })}
        status="ok"
        profiles={[]}
        preview={preview({ boundary_port_id: 'BP_AMBIENT', profile_ids: [] })}
        validation={validation}
        ambientTemperature_C={55}
        readOnly={false}
        {...callbacks}
      />,
    );

    expect(html).toContain('55.0 °C');
    expect(html).toContain('Inherited from Screen 01 Scenario Settings');
    expect(html).toContain('Edit Scenario Settings in 01');
    expect(html).not.toContain('Add Boundary Type');
    expect(html).not.toContain('Calculated Preview');
    expect(html).not.toContain('FloTHERM');
  });

  it('combines setup, required inputs, applicable preview and validation for a surface', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          // A flat housing wall. The effective-area field this asserts belongs
          // to the manual description, which a fin stack no longer offers.
          port={port({ orientation: 'housing_wall' })}
          status="ok"
          profiles={[profile()]}
          preview={preview()}
          validation={validation}
          ambientTemperature_C={55}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('Boundary Setup / 邊界條件設定');
    expect(html).toContain('Required Inputs');
    expect(html).toContain('Calculated Preview');
    expect(html).toContain('0.1323 °C/W');
    expect(html).toContain('No issues for this boundary port.');
    expect(html).toContain('Advanced Details');
    expect(html).toContain('由SCR04/05 邊界幾何同步');
    expect(html).not.toMatch(/<input[^>]+id="bc-param-area_m2"/);
    expect(html).not.toContain('External Mapping');
    expect(html).not.toContain('FloTHERM Surface Alias');
  });

  it('keeps HSK fin effective area editable when topology has no derived area', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ area_m2: null, orientation: 'housing_wall' })}
          status="ok"
          profiles={[profile()]}
          preview={preview()}
          validation={validation}
          ambientTemperature_C={55}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toMatch(/<input[^>]+id="bc-param-area_m2"/);
    expect(html).not.toContain('由SCR04/05 邊界幾何同步');
  });

  // A fin stack has no h of its own to state, so the manual description is not
  // offered there at all — the geometry panel replaces it.
  it('offers only the fin geometry on a finned surface', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ orientation: 'vertical_fins' })}
          status="ok"
          profiles={[profile()]}
          preview={preview()}
          validation={validation}
          ambientTemperature_C={55}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('Described as a fin array');
    // No toggle: it is not a choice on this surface.
    expect(html).not.toContain('Describe as a fin array');
    expect(html).toMatch(/<input[^>]+id="bc-fin-finGap_mm"/);
    expect(html).not.toMatch(/<input[^>]+id="bc-param-h_W_m2K"/);
    expect(html).not.toMatch(/<input[^>]+id="bc-param-area_m2"/);
  });

  // A flat wall's h is the one number on its form nobody can state, so it is
  // offered as a computed value there — and only there.
  it('offers the plate coefficient on a flat wall and not on a fin stack', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let flat = '';
    let finned = '';
    try {
      flat = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ orientation: 'housing_wall' })}
          status="ok"
          profiles={[profile()]}
          preview={preview()}
          validation={validation}
          ambientTemperature_C={45}
          readOnly={false}
          {...callbacks}
        />,
      );
      finned = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ orientation: 'vertical_fins' })}
          status="ok"
          profiles={[profile()]}
          preview={preview()}
          validation={validation}
          ambientTemperature_C={45}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(flat).toContain('Compute h from the plate');
    expect(finned).not.toContain('Compute h from the plate');
  });

  it('replaces the h field with the plate readout once enabled', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ orientation: 'housing_wall', area_m2: 0.1405 })}
          status="ok"
          profiles={[
            {
              ...profile(),
              type: 'combined_convection_radiation',
              parameters: {
                plateGeometryEnabled: true,
                plateOrientation: 'Vertical',
                plateHeight_mm: 336,
                surfaceReferenceTemperatureGuess_C: 80,
                emissivity: 0.8,
                viewFactor: 1,
                area_m2: 0.1405,
              },
            },
          ]}
          preview={preview()}
          validation={validation}
          ambientTemperature_C={45}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    // The coefficient is shown, not asked for.
    expect(html).not.toMatch(/<input[^>]+id="bc-param-h_W_m2K"/);
    expect(html).toMatch(/<input[^>]+id="bc-plate-plateHeight_mm"/);
    expect(html).toContain('4.79 W/m²K');
    // A vertical plate does not need the second side.
    expect(html).not.toMatch(/<input[^>]+id="bc-plate-plateWidth_mm"/);
    // Area, emissivity and view factor stay stated — they are real properties.
    expect(html).toMatch(/id="bc-param-emissivity"/);
    expect(html).toMatch(/id="bc-param-viewFactor"/);
  });

  it('shows Chinese labels in the data-source selector', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port()}
          status="ok"
          profiles={[profile()]}
          preview={preview()}
          validation={validation}
          ambientTemperature_C={55}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('<option value="manual" selected="">手動輸入</option>');
    expect(html).toContain('<option value="analytical">解析計算</option>');
    expect(html).not.toContain('>assumed</option>');
  });

  it('shows profile emissivity as inherited from the authoritative surface property', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ allowed_boundary_types: ['radiation_to_surroundings'] })}
          status="ok"
          profiles={[
            profile({
              id: 'BCP_RAD',
              type: 'radiation_to_surroundings',
              parameters: { emissivity: 0.91, viewFactor: 0.9, area_m2: 0.42 },
            }),
          ]}
          preview={preview({ h_rad_W_m2K: 5.2, r_rad_C_per_W: 0.45 })}
          validation={validation}
          ambientTemperature_C={55}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('由表面性質同步');
    expect(html).toContain('0.91');
    expect(html).not.toMatch(/<input[^>]+id="bc-param-emissivity"/);
  });

  it('retains but disables a solar profile when Screen 01 solar load is zero', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port({
            allowed_boundary_types: ['convection_to_ambient', 'solar_load'],
          })}
          status="unassigned"
          profiles={[
            profile({
              id: 'BCP_SOLAR',
              type: 'solar_load',
              representation: 'external_load_only',
              parameters: {
                irradiance_W_m2: 0,
                absorptivity: 0.7,
                receivingArea_m2: 0.42,
                projectedAreaFactor: 1,
                shadingFactor: 1,
              },
            }),
          ]}
          preview={preview({ profile_ids: [] })}
          validation={validation}
          ambientTemperature_C={55}
          readOnly={false}
          {...callbacks}
          solarEnabled={false}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('（停用）');
    expect(html).toContain('SCR01 日照負載為 0 W/m²');
    expect(html).not.toContain('value="solar_load"');
    expect(html).not.toContain('bc-param-irradiance_W_m2');
  });

  it('marks an adiabatic reason as optional', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html = '';
    try {
      html = renderToStaticMarkup(
        <BoundaryInspector
          port={port({ allowed_boundary_types: ['adiabatic_symmetry'] })}
          status="adiabatic"
          profiles={[
            profile({
              id: 'BCP_ADIA',
              type: 'adiabatic_symmetry',
              representation: 'adiabatic_no_flow',
              parameters: {},
            }),
          ]}
          preview={preview({ profile_ids: ['BCP_ADIA'] })}
          validation={validation}
          ambientTemperature_C={55}
          readOnly={false}
          {...callbacks}
        />,
      );
    } finally {
      suppressSsrLayoutWarning.mockRestore();
    }

    expect(html).toContain('Reason (optional)');
    expect(html).toContain('does not block the solver');
    expect(html).not.toContain('required=""');
  });
});
