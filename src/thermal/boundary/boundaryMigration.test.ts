import { describe, expect, it } from 'vitest';

import { normalizeBoundarySet } from './boundaryMigration';
import { createBoundarySet } from './types';
import type { BoundaryConditionProfile, ScenarioBoundaryConditionSet } from './types';

function setWith(overrides: Partial<ScenarioBoundaryConditionSet>): ScenarioBoundaryConditionSet {
  return {
    ...createBoundarySet({
      projectId: 'P1',
      networkId: 'RRU',
      scenarioId: 'SCN_1',
      topologyVersion: 1,
      ambient_C: 55,
    }),
    ...overrides,
  };
}

function profile(parameters: BoundaryConditionProfile['parameters']): BoundaryConditionProfile {
  return {
    id: 'BCP_1',
    name: 'Fin surface — convection + radiation',
    type: 'combined_convection_radiation',
    representation: 'single_combined_edge',
    parameters,
    source: 'manual',
    confidence: 'medium',
  };
}

describe('normalizeBoundarySet', () => {
  it('drops the retired ambient radiation surrounding temperature', () => {
    const stored = setWith({
      ambient: {
        external_ambient_C: 55,
        radiation_surrounding_C: -3,
        source: 'manual',
        confidence: 'medium',
      } as unknown as ScenarioBoundaryConditionSet['ambient'],
    });

    const normalized = normalizeBoundarySet(stored);

    expect(normalized.ambient).not.toHaveProperty('radiation_surrounding_C');
    expect(normalized.ambient.external_ambient_C).toBe(55);
  });

  it('drops the retired radiationTemperature_C from every profile', () => {
    const stored = setWith({
      profiles: [
        profile({ h_W_m2K: 8, area_m2: 0.89, emissivity: 0.85, radiationTemperature_C: -3 }),
      ],
    });

    const normalized = normalizeBoundarySet(stored);

    expect(normalized.profiles[0].parameters).not.toHaveProperty('radiationTemperature_C');
    // The parameters that DO reach the calculation are untouched, so an old
    // project keeps the resistance it had rather than losing h with the strip.
    expect(normalized.profiles[0].parameters).toEqual({
      h_W_m2K: 8,
      area_m2: 0.89,
      emissivity: 0.85,
    });
  });

  it('returns the same object when there is nothing to strip', () => {
    const clean = setWith({ profiles: [profile({ h_W_m2K: 8, area_m2: 0.89 })] });

    expect(normalizeBoundarySet(clean)).toBe(clean);
  });
});
