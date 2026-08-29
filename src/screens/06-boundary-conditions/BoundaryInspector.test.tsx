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
    expect(html).toContain('Inherited from Scenario Environment');
    expect(html).toContain('Edit Scenario Environment');
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

    expect(html).toContain('Boundary Setup / 邊界條件設定');
    expect(html).toContain('Required Inputs');
    expect(html).toContain('Calculated Preview');
    expect(html).toContain('0.1323 °C/W');
    expect(html).toContain('No issues for this boundary port.');
    expect(html).toContain('Advanced Details');
    expect(html).not.toContain('External Mapping');
    expect(html).not.toContain('FloTHERM Surface Alias');
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
