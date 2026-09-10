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
        h_rad_W_m2K: 7.1,
        r_combined_C_per_W: 0.52,
        plate_convection: { h_conv_W_m2K: 6.2 },
        completeness: 'warning',
      },
      {
        // The real shape: 1/(h·A) is the surface, and `fin.R` adds the fin's
        // own conduction on top of it.
        boundary_port_id: 'FIN',
        profile_ids: ['P_FIN'],
        r_combined_C_per_W: 0.126,
        fin_array: {
          h_conv_W_m2K: 6.2,
          h_rad_W_m2K: 2.4,
          h_total_W_m2K: 8.6,
          area_m2: 0.918,
          effectiveness: 0.884,
          R_C_per_W: 0.143,
        },
        completeness: 'complete',
      },
      {
        boundary_port_id: 'STATED',
        profile_ids: ['P_STATED'],
        r_conv_C_per_W: 0.7,
        r_combined_C_per_W: 0.7,
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

    expect(summary.surfaces.map((row) => [row.name, row.R_total_C_per_W])).toEqual([
      ['Fin Surface', 0.143],
      ['Housing', 0.52],
      ['Lid', 0.7],
    ]);
  });

  /**
   * The half that was missing. Convection and radiation reach the same air in
   * parallel, so the conductances add — and a screen that showed only h_conv
   * beside a resistance built from both left the reader unable to reproduce
   * the number in front of them.
   */
  it('carries both halves of the coefficient, and their sum', () => {
    const [fin, housing] = boundarySummary(set(), PORTS)!.surfaces;

    expect(housing.h_conv_W_m2K).toBe(6.2);
    expect(housing.h_rad_W_m2K).toBe(7.1);
    expect(housing.h_total_W_m2K).toBeCloseTo(13.3, 6);

    expect(fin.h_conv_W_m2K).toBe(6.2);
    expect(fin.h_rad_W_m2K).toBe(2.4);
    expect(fin.h_total_W_m2K).toBeCloseTo(8.6, 6);
  });

  /**
   * A fin's efficiency is the METAL's, not the air's, so it is a series step on
   * its own edge. Reporting only `1/(h·A)` would understate the path; reporting
   * only `fin.R` would leave `1/(h·A)` looking wrong.
   */
  it('splits a fin into its surface and its own conduction', () => {
    const [fin] = boundarySummary(set(), PORTS)!.surfaces;

    expect(fin.R_surface_C_per_W).toBe(0.126);
    expect(fin.fin_conduction_C_per_W).toBeCloseTo(0.017, 6);
    expect(fin.R_total_C_per_W).toBe(0.143);
    expect(fin.fin_effectiveness).toBe(0.884);
  });

  it('says how each coefficient was arrived at, not only what it is', () => {
    const [fin, housing, stated] = boundarySummary(set(), PORTS)!.surfaces;

    expect(fin.derivation).toBe('fin_array');
    // Geometry knows the wetted area; the port's own figure would be the base.
    expect(fin.area_m2).toBe(0.918);
    expect(housing.derivation).toBe('flat_plate');
    expect(housing.completeness).toBe('warning');
    // Stated: no derivation, no fin conduction, and the h is what was typed.
    expect(stated.derivation).toBeNull();
    expect(stated.h_conv_W_m2K).toBe(12);
    expect(stated.fin_conduction_C_per_W).toBeNull();
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
