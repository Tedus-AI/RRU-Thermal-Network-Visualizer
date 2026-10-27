/**
 * The heat sink's fins as a project fact (`finSpec.ts`): which profile takes
 * them, what is copied, and what an older project's 06 profile seeds.
 */

import { describe, expect, it } from 'vitest';

import { defaultMaterials, type MaterialDefaults } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';
import type { ThermalNetwork } from '../types';
import type { BoundaryConditionProfile, BoundaryPort } from './types';
import { FIN_GEOMETRY_KEYS as K } from './calculations';
import {
  applyProjectFins,
  finFieldsToSeed,
  projectFinParameters,
  projectFinTechnology,
  singleFinSurfacePort,
  takesProjectFins,
  type ProjectFinSync,
} from './finSpec';

function materials(patch: Record<string, number> = {}): MaterialDefaults {
  const out = defaultMaterials();
  for (const [field, value] of Object.entries(patch)) {
    (out as unknown as Record<string, unknown>)[field] = sourced(value, 'Manual');
  }
  return out;
}

const finPort = (id = 'BP_FIN', node = 'NODE_FIN'): BoundaryPort => ({
  id,
  name: 'Fin Surface Boundary',
  connected_node_id: node,
  boundary_edge_id: `E_${id}`,
  surface_group_id: 'SG_FIN',
  area_m2: null,
  orientation: 'vertical_fins',
  allowed_boundary_types: ['convection_to_ambient', 'radiation_to_surroundings'],
  dissipating: true,
  external_mappings: { import_status: 'deferred' },
});

const profile = (
  parameters: Record<string, unknown>,
  type: BoundaryConditionProfile['type'] = 'combined_convection_radiation',
): BoundaryConditionProfile =>
  ({ id: 'P', name: 'Fin surface', type, parameters, source: 'manual', confidence: 'medium' }) as unknown as BoundaryConditionProfile;

const network = (types: Record<string, string>) =>
  ({ nodes: Object.fromEntries(Object.entries(types).map(([id, type]) => [id, { id, type }])) }) as unknown as Pick<
    ThermalNetwork,
    'nodes'
  >;

const sync = (parameters: Record<string, number | string>, baseK: number | null = null): ProjectFinSync => ({
  portId: 'BP_FIN',
  parameters,
  baseK_W_mK: baseK,
});

const WHOLE = {
  [K.baseLength]: 339,
  [K.baseWidth]: 272,
  [K.height]: 59.6,
  [K.gap]: 11.6,
  [K.thickness]: 1.2,
};

describe('projectFinTechnology', () => {
  it('is 01’s fin process when it names exactly one', () => {
    expect(projectFinTechnology(['Natural Convection', 'Embedded Fin'])).toBe('Embedded');
    expect(projectFinTechnology(['Die-casting Fin'])).toBe('DieCasting');
    expect(projectFinTechnology(['Natural Convection'])).toBeNull();
    expect(projectFinTechnology(['Embedded Fin', 'Die-casting Fin'])).toBeNull();
  });
});

describe('projectFinParameters', () => {
  it('copies what the project states and nothing it leaves empty', () => {
    const out = projectFinParameters(
      materials({ hsk_base_L_mm: 339, hsk_base_W_mm: 272, hsk_fin_gap_mm: 11.6, hsk_fin_k_W_mK: 200 }),
      ['Embedded Fin'],
    );
    expect(out).toEqual({
      [K.baseLength]: 339,
      [K.baseWidth]: 272,
      [K.gap]: 11.6,
      [K.conductivity]: 200,
      [K.technology]: 'Embedded',
    });
  });
});

describe('singleFinSurfacePort', () => {
  it('is the one fin surface, or none for two heat sinks', () => {
    const one = [finPort(), { ...finPort('BP_WALL', 'NODE_WALL'), orientation: 'housing_wall' as const }];
    expect(singleFinSurfacePort(one, network({ NODE_FIN: 'fin_surface', NODE_WALL: 'housing' }))?.id).toBe('BP_FIN');
    const two = [finPort('BP_RF', 'NODE_RF'), finPort('BP_DIG', 'NODE_DIG')];
    expect(singleFinSurfacePort(two, network({ NODE_RF: 'fin_surface', NODE_DIG: 'fin_surface' }))).toBeNull();
    expect(singleFinSurfacePort(one, null)).toBeNull();
  });
});

describe('takesProjectFins', () => {
  it('a profile described as a fin array does', () => {
    expect(takesProjectFins(profile({ [K.enabled]: true }), finPort(), sync({}))).toBe(true);
    // A finned port with nothing stated is fin-derived by default.
    expect(takesProjectFins(profile({}), finPort(), sync({}))).toBe(true);
  });

  it('a stored h stays until the project describes a whole array', () => {
    const legacy = profile({ h_W_m2K: 12, area_m2: 2 });
    expect(takesProjectFins(legacy, finPort(), sync({ [K.gap]: 11.6 }))).toBe(false);
    expect(takesProjectFins(legacy, finPort(), sync(WHOLE))).toBe(true);
  });

  it('never a radiation or solar profile, nor one with the geometry switched off', () => {
    expect(takesProjectFins(profile({}, 'radiation_to_surroundings'), finPort(), sync(WHOLE))).toBe(false);
    expect(takesProjectFins(profile({}, 'solar_load'), finPort(), sync(WHOLE))).toBe(false);
    expect(takesProjectFins(profile({ [K.enabled]: false }), finPort(), sync(WHOLE))).toBe(false);
  });
});

describe('applyProjectFins', () => {
  it('copies the project’s values and keeps what it leaves empty', () => {
    const parameters: Record<string, unknown> = { [K.height]: 40, [K.countOverride]: 20 };
    expect(applyProjectFins(parameters, sync({ [K.height]: 59.6, [K.conductivity]: 200 }))).toBe(true);
    expect(parameters).toMatchObject({ [K.height]: 59.6, [K.countOverride]: 20, [K.conductivity]: 200 });
    expect(applyProjectFins(parameters, sync({ [K.height]: 59.6, [K.conductivity]: 200 }))).toBe(false);
  });

  it('no fin k on the project: the process default, so shown and solved agree', () => {
    const embedded: Record<string, unknown> = { [K.technology]: 'Embedded', [K.conductivity]: 150 };
    applyProjectFins(embedded, sync({}, 96));
    expect(embedded[K.conductivity]).toBe(200);
    const dieCast: Record<string, unknown> = { [K.conductivity]: 200 };
    applyProjectFins(dieCast, sync({ [K.technology]: 'DieCasting' }, 96));
    expect(dieCast[K.conductivity]).toBe(96);
  });
});

describe('finFieldsToSeed', () => {
  const typed = profile({
    [K.enabled]: true,
    [K.technology]: 'DieCasting',
    [K.baseLength]: 300,
    [K.height]: 70,
    [K.gap]: 9,
    [K.thickness]: 2,
    [K.conductivity]: 120,
  });

  it('takes what the profile states and the project does not', () => {
    expect(finFieldsToSeed(typed, finPort(), materials({ hsk_fin_gap_mm: 11.6 }), 96)).toEqual({
      hsk_base_L_mm: 300,
      hsk_fin_height_mm: 70,
      hsk_fin_thickness_mm: 2,
      hsk_fin_k_W_mK: 120,
    });
  });

  it('a k still at the process default it was seeded with is not seeded', () => {
    const seeded = profile({ [K.enabled]: true, [K.technology]: 'DieCasting', [K.conductivity]: 96 });
    expect(finFieldsToSeed(seeded, finPort(), materials(), 96)).toEqual({});
    const retired = profile({ [K.enabled]: true, [K.technology]: 'DieCasting', [K.conductivity]: 160 });
    expect(finFieldsToSeed(retired, finPort(), materials(), 96)).toEqual({});
    const embedded = profile({ [K.enabled]: true, [K.conductivity]: 200 });
    expect(finFieldsToSeed(embedded, finPort(), materials(), 96)).toEqual({});
  });

  it('nothing from a profile that is not a fin array', () => {
    const legacy = profile({ h_W_m2K: 12, area_m2: 2, [K.gap]: 9 });
    expect(finFieldsToSeed(legacy, finPort(), materials(), 96)).toEqual({});
  });
});
