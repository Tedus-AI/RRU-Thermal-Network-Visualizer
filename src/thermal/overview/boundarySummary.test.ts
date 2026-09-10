/**
 * What the solve ran on, shown where the answer is reported.
 *
 * The risks are all about agreeing with Screen 06 rather than paraphrasing it:
 * a disabled assignment that is no longer in the solve, a solar port that is a
 * heat INPUT rather than a way out, and an order that buries the surface
 * actually carrying the heat behind one that carries almost none.
 */

import { describe, expect, it } from 'vitest';

import type { BoundaryPort, ScenarioBoundaryConditionSet } from '../boundary/types';

import { boundarySummary } from './boundarySummary';

const port = (id: string, name: string, area: number | null = 0.2): BoundaryPort =>
  ({ id, name, area_m2: area, connected_node_id: `N_${id}` }) as BoundaryPort;

function set(overrides: Partial<ScenarioBoundaryConditionSet> = {}): ScenarioBoundaryConditionSet {
  return {
    status: 'ready_for_solve',
    ambient: { external_ambient_C: 45, internal_air_C: null },
    profiles: [
      { id: 'P_FIN', name: 'Fin', type: 'combined_convection_radiation', parameters: {} },
      { id: 'P_PLATE', name: 'Housing', type: 'convection_to_ambient', parameters: {} },
      { id: 'P_STATED', name: 'Stated', type: 'convection_to_ambient', parameters: { h_W_m2K: 12 } },
    ],
    assignments: [
      { boundary_port_id: 'FIN', profile_ids: ['P_FIN'], enabled: true },
      { boundary_port_id: 'HOUSING', profile_ids: ['P_PLATE'], enabled: true },
      { boundary_port_id: 'STATED', profile_ids: ['P_STATED'], enabled: true },
    ],
    external_loads: [],
    derived_preview: [
      {
        boundary_port_id: 'HOUSING',
        profile_ids: ['P_PLATE'],
        r_conv_C_per_W: 1.4,
        plate_convection: { h_conv_W_m2K: 6.2 },
        completeness: 'warning',
      },
      {
        boundary_port_id: 'FIN',
        profile_ids: ['P_FIN'],
        fin_array: { h_total_W_m2K: 11.5, area_m2: 1.8, R_C_per_W: 0.09 },
        completeness: 'complete',
      },
      {
        boundary_port_id: 'STATED',
        profile_ids: ['P_STATED'],
        r_conv_C_per_W: 0.7,
        completeness: 'complete',
      },
    ],
    ...overrides,
  } as unknown as ScenarioBoundaryConditionSet;
}

const PORTS = [port('FIN', 'Fin Surface', null), port('HOUSING', 'Housing'), port('STATED', 'Lid')];

describe('boundarySummary', () => {
  it('lists the surfaces smallest resistance first — the one carrying the heat', () => {
    const summary = boundarySummary(set(), PORTS)!;

    expect(summary.surfaces.map((row) => [row.name, row.R_C_per_W])).toEqual([
      ['Fin Surface', 0.09],
      ['Lid', 0.7],
      ['Housing', 1.4],
    ]);
  });

  it('says how each coefficient was arrived at, not only what it is', () => {
    const [fin, stated, housing] = boundarySummary(set(), PORTS)!.surfaces;

    expect(fin.derivation).toBe('fin_array');
    expect(fin.h_W_m2K).toBe(11.5);
    // Geometry knows the wetted area; the port's own figure would be the base.
    expect(fin.area_m2).toBe(1.8);
    expect(housing.derivation).toBe('flat_plate');
    expect(housing.h_W_m2K).toBe(6.2);
    expect(housing.completeness).toBe('warning');
    // Stated: no derivation, and the h is the one the engineer typed.
    expect(stated.derivation).toBeNull();
    expect(stated.h_W_m2K).toBe(12);
    expect(stated.area_m2).toBe(0.2);
  });

  it('leaves out a surface whose assignment is switched off', () => {
    const summary = boundarySummary(
      set({
        assignments: [
          { boundary_port_id: 'FIN', profile_ids: ['P_FIN'], enabled: false },
          { boundary_port_id: 'HOUSING', profile_ids: ['P_PLATE'], enabled: true },
        ],
      } as unknown as Partial<ScenarioBoundaryConditionSet>),
      PORTS,
    )!;

    expect(summary.surfaces.map((row) => row.name)).toEqual(['Housing']);
  });

  /** Solar is heat going IN. A row with no resistance is not a way out. */
  it('reports solar as a load rather than as a surface', () => {
    const summary = boundarySummary(
      set({
        external_loads: [
          { id: 'L1', type: 'solar', q_W: 18.5 },
          { id: 'L2', type: 'solar', q_W: null },
        ],
        derived_preview: [
          { boundary_port_id: 'FIN', profile_ids: ['P_FIN'], q_solar_W: 18.5, completeness: 'complete' },
        ],
      } as unknown as Partial<ScenarioBoundaryConditionSet>),
      PORTS,
    )!;

    expect(summary.solar_W).toBe(18.5);
    expect(summary.surfaces).toHaveLength(0);
  });

  it('carries the ambient the solve used, and answers nothing without a set', () => {
    expect(boundarySummary(set(), PORTS)!.external_ambient_C).toBe(45);
    expect(boundarySummary(null, PORTS)).toBeNull();
  });
});
