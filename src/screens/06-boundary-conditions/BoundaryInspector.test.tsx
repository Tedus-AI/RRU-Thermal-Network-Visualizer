import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type {
  BoundaryConditionProfile,
  BoundaryDerivedPreview,
  BoundaryPort,
} from '@/thermal/boundary/types';

import { BoundaryInspector } from './BoundaryInspector';
import { SurfaceAssumptionResult } from './BoundaryInspectorPanels';
import type { SurfaceAssumptionCheck } from '@/thermal/boundary/assumptionCheck';

// The fin panel links to 01, so it renders inside a router.
const renderInRouter = (node: ReactElement) =>
  renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

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
    let html: string;
    try {
      html = renderInRouter(
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
    expect(html).toContain('表面溫度是求解前的假設值');
    expect(html).toContain('80.0 °C');
  });

  it('says nothing when the preview carries no assumptions', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html: string;
    try {
      html = renderInRouter(
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

    expect(html).toContain('計算預覽');
    expect(html).not.toContain('表面溫度是求解前的假設值');
  });
});

describe('BoundaryInspector simplification', () => {
  it('renders Ambient Reference as one inherited-temperature summary without setup tabs', () => {
    const html = renderInRouter(
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
    expect(html).not.toContain('計算預覽');
    expect(html).not.toContain('FloTHERM');
  });

  it('combines setup, required inputs, applicable preview and validation for a surface', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html: string;
    try {
      html = renderInRouter(
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

    expect(html).toContain('data-boundary-inspector');
    expect(html).toContain('data-active-profile');
    expect(html).toContain('計算預覽');
    expect(html).toContain('0.1323 °C/W');
    // Rendered through the shared `Bi` helper, which shows the Chinese.
    // No messages for this surface: nothing is listed (card ④ says the page is clean).
    expect(html).not.toContain('border-danger-500/40 bg-danger-100');
    expect(html).toContain('進階資訊');
    expect(html).toContain('取自03 的元件幾何');
    expect(html).not.toMatch(/<input[^>]+id="bc-param-area_m2"/);
    expect(html).not.toContain('External Mapping');
    expect(html).not.toContain('FloTHERM Surface Alias');
  });

  it('keeps HSK fin effective area editable when topology has no derived area', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html: string;
    try {
      html = renderInRouter(
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
    expect(html).not.toContain('取自03 的元件幾何');
  });

  // A fin stack has no h of its own to state, so the manual description is not
  // offered there at all — the geometry panel replaces it.
  it('offers only the fin geometry on a finned surface', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html: string;
    try {
      html = renderInRouter(
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

    expect(html).toContain('鰭片表面以幾何描述');
    // No toggle: it is not a choice on this surface.
    expect(html).not.toContain('以鰭片幾何描述');
    expect(html).toMatch(/<input[^>]+id="bc-fin-finGap_mm"/);
    expect(html).not.toMatch(/<input[^>]+id="bc-param-h_W_m2K"/);
    expect(html).not.toMatch(/<input[^>]+id="bc-param-area_m2"/);
  });

  // A flat wall's h is the one number on its form nobody can state, so it is
  // offered as a computed value there — and only there.
  it('offers the plate coefficient on a flat wall and not on a fin stack', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let flat: string;
    let finned: string;
    try {
      flat = renderInRouter(
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
      finned = renderInRouter(
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

    expect(flat).toContain('由平板幾何計算 h');
    expect(finned).not.toContain('由平板幾何計算 h');
  });

  it('replaces the h field with the plate readout once enabled', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html: string;
    try {
      html = renderInRouter(
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
    let html: string;
    try {
      html = renderInRouter(
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
    let html: string;
    try {
      html = renderInRouter(
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

    expect(html).toContain('取自表面性質');
    expect(html).toContain('0.91');
    expect(html).not.toMatch(/<input[^>]+id="bc-param-emissivity"/);
  });

  it('retains but disables a solar profile when Screen 01 solar load is zero', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html: string;
    try {
      html = renderInRouter(
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
    expect(html).toContain('01 的日照是 0 W/m²');
    expect(html).not.toContain('value="solar_load"');
    expect(html).not.toContain('bc-param-irradiance_W_m2');
  });

  it('marks an adiabatic reason as optional', () => {
    const suppressSsrLayoutWarning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let html: string;
    try {
      html = renderInRouter(
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

    expect(html).toContain('理由（選填）');
    expect(html).toContain('不會阻擋求解');
    expect(html).not.toContain('required=""');
  });
});

describe('the surface temperature 05 solved', () => {
  const check = (patch: Partial<SurfaceAssumptionCheck> = {}): SurfaceAssumptionCheck => ({
    boundary_port_id: 'BP_FIN',
    profile_id: 'BCP_RAD',
    covers_every_assumption: true,
    assumed_C: 80,
    solved_C: 82.1,
    delta_C: 2.1,
    r_assumed_C_per_W: 0.6346,
    r_solved_C_per_W: 0.627,
    r_error_pct: 1.2,
    verdict: 'verified',
    ...patch,
  });

  it('says in Chinese what 05 found, in °C, and offers to fill it in even when the assumption holds', () => {
    const html = renderToStaticMarkup(<SurfaceAssumptionResult check={check()} readOnly={false} onApply={() => {}} />);
    expect(html).toContain('已對照 05：假設成立');
    expect(html).toContain('假設 80.0 °C → 05 解出 82.1 °C（+2.1 °C）');
    expect(html).toContain('把 82.1 °C 帶入「表面溫度假設」');
    expect(html).not.toMatch(/Checked against|assumed|solved|SCR07| K\)/);
  });

  it('a surface that solved far from the assumption asks for another round', () => {
    const html = renderToStaticMarkup(
      <SurfaceAssumptionResult
        check={check({ verdict: 'off', solved_C: 95, delta_C: 15, r_error_pct: 8 })}
        readOnly={false}
        onApply={() => {}}
      />,
    );
    expect(html).toContain('表面解出 95.0 °C，不是假設的 80.0 °C');
    expect(html).toContain('帶入後請回 05 重新求解');
  });
});
