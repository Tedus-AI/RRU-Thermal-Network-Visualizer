import { describe, expect, it } from 'vitest';

import { createBoundarySet, type BoundaryPort } from '@/thermal/boundary/types';

import { portStatus, summarize } from './boundaryViewModel';

const ambientPort: BoundaryPort = {
  id: 'BP_AMBIENT',
  name: 'Ambient Reference',
  connected_node_id: 'NODE_AMBIENT',
  surface_group_id: 'SG_AMBIENT',
  area_m2: null,
  orientation: 'unspecified',
  allowed_boundary_types: ['ambient_reservoir', 'external_cfd_placeholder'],
  dissipating: false,
  external_mappings: { import_status: 'deferred' },
};

const finPort: BoundaryPort = {
  id: 'BP_FIN',
  name: 'Fin Surface Boundary',
  connected_node_id: 'NODE_FIN',
  surface_group_id: 'SG_FIN',
  area_m2: 0.42,
  orientation: 'vertical_fins',
  allowed_boundary_types: ['convection_to_ambient'],
  dissipating: true,
  external_mappings: { import_status: 'deferred' },
};

describe('boundary view model ambient reference', () => {
  it('derives ambient readiness from Scenario Environment instead of profile assignment', () => {
    const set = createBoundarySet({
      projectId: 'P1',
      networkId: 'MAIN',
      scenarioId: 'SCN_001',
      topologyVersion: 1,
      ambient_C: 55,
    });

    expect(portStatus(set, ambientPort)).toBe('ok');
    set.ambient.external_ambient_C = null;
    expect(portStatus(set, ambientPort)).toBe('blocked');
    set.ambient.external_ambient_C = Number.NaN;
    expect(portStatus(set, ambientPort)).toBe('blocked');
  });

  it('excludes the non-dissipating ambient preview from readiness percentage', () => {
    const set = createBoundarySet({
      projectId: 'P1',
      networkId: 'MAIN',
      scenarioId: 'SCN_001',
      topologyVersion: 1,
      ambient_C: 55,
    });
    set.derived_preview = [
      {
        boundary_port_id: ambientPort.id,
        profile_ids: [],
        completeness: 'complete',
        disclaimer: 'pre_solve_boundary_input_only',
      },
      {
        boundary_port_id: finPort.id,
        profile_ids: [],
        completeness: 'blocked',
        disclaimer: 'pre_solve_boundary_input_only',
      },
    ];

    expect(summarize(set, [ambientPort, finPort]).readinessPct).toBe(0);
  });

  it('treats retained solar-only data as inactive rather than an assigned heat outlet', () => {
    const set = createBoundarySet({
      projectId: 'P1',
      networkId: 'MAIN',
      scenarioId: 'SCN_001',
      topologyVersion: 1,
      ambient_C: 55,
      solar_W_m2: 0,
    });
    set.profiles = [
      {
        id: 'BCP_SOLAR',
        name: 'Fin solar',
        type: 'solar_load',
        representation: 'external_load_only',
        parameters: { irradiance_W_m2: 0, absorptivity: 0.7 },
        source: 'manual',
        confidence: 'medium',
      },
    ];
    set.assignments = [
      {
        id: 'BCA_FIN',
        boundary_port_id: finPort.id,
        profile_ids: ['BCP_SOLAR'],
        assignment_mode: 'manual',
        enabled: true,
      },
    ];

    expect(portStatus(set, finPort)).toBe('unassigned');
    expect(summarize(set, [finPort])).toMatchObject({ portsAssigned: 0, solarLoads: 0 });

    set.site.solar_enabled = true;
    set.site.solar_irradiance_W_m2 = 800;
    expect(summarize(set, [finPort]).solarLoads).toBe(1);
    expect(portStatus(set, finPort)).toBe('unassigned');
  });
});
