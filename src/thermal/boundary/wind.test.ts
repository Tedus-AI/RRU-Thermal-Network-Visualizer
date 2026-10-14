/**
 * Wind is recorded but no convection model applies it, so every place that
 * shows a non-zero wind has to say so — and the solve has to carry it as a
 * property of the result.
 */

import { defaultMaterials } from '@/domain/materials';
import { describe, expect, it } from 'vitest';

import { createRth } from '../rth';
import { buildSolveInput } from '../solver/buildSolveInput';
import { solveScenario } from '../solver/solveScenario';
import { DEFAULT_SOLVER_SETTINGS, type ThermalNetwork } from '../types';
import { deriveBoundaryPorts } from './boundaryPorts';
import { createBoundarySet, type ScenarioBoundaryConditionSet } from './types';
import { validateBoundarySet } from './validation';
import { windLabel, windRecordedOnly } from './wind';

function network(): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    status: 'VALID',
    nodes: {
      SRC: {
        id: 'SRC',
        name: 'SRC',
        type: 'custom',
        power_W: 10,
        temperature_C: null,
        temperature_source: null,
        boundary_type: null,
      },
      AMB: {
        id: 'AMB',
        name: 'AMB',
        type: 'ambient',
        power_W: 0,
        temperature_C: null,
        temperature_source: null,
        boundary_type: null,
        boundary_role: 'placeholder',
      },
    },
    edges: {
      E: {
        id: 'E',
        from: 'SRC',
        to: 'AMB',
        type: 'conduction',
        method: 'direct_rth',
        rth: createRth(1, 'Analytical', 'high'),
        heat_flow_W: null,
        delta_T_C: null,
        resolution: 'resolved',
        enabled: true,
      },
    },
    templates: {},
    zones: {},
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

function setWithWind(
  wind: number | null,
  method: ScenarioBoundaryConditionSet['site']['convection_method'] = 'manual_h',
): ScenarioBoundaryConditionSet {
  const set = createBoundarySet({
    projectId: 'TEST',
    networkId: 'Main Thermal Network',
    scenarioId: 'SCN_A',
    topologyVersion: 1,
    ambient_C: 25,
    wind_m_s: wind,
  });
  return { ...set, site: { ...set.site, convection_method: method } };
}

describe('wind is recorded, not applied', () => {
  it('only flags a positive, finite wind', () => {
    expect(windRecordedOnly(3)).toBe(true);
    expect(windRecordedOnly(0)).toBe(false);
    expect(windRecordedOnly(null)).toBe(false);
    expect(windRecordedOnly(Number.NaN)).toBe(false);
  });

  it('labels the value in the reader’s language', () => {
    expect(windLabel('3.0 m/s', 3, 'english')).toBe('3.0 m/s (not applied — natural convection only)');
    expect(windLabel('3.0 m/s', 3, 'chinese')).toBe('3.0 m/s (未套用，僅自然對流)');
    expect(windLabel('0.0 m/s', 0)).toBe('0.0 m/s');
  });

  // It used to warn only for a manual h, so a fin-geometry or preset profile
  // let 3 m/s pass silently.
  it.each(['manual_h', 'preset', 'future_correlation'] as const)(
    'warns in Screen 06 whatever the convection method (%s)',
    (method) => {
      const net = network();
      const result = validateBoundarySet({
        set: setWithWind(3, method),
        ports: deriveBoundaryPorts(net),
        hasTopology: true,
        hasScenario: true,
        topologyVersion: 1,
      });
      expect(result.warnings.map((entry) => entry.id)).toContain('WIND_NOT_APPLIED');
    },
  );

  it('carries a warning on the solve, and none in still air', () => {
    const net = network();
    const ports = deriveBoundaryPorts(net);
    const windy = buildSolveInput({
      materials: defaultMaterials(),
      network: net,
      boundarySet: setWithWind(3),
      ports,
      scenarioId: 'SCN_A',
    });
    expect(windy.notes.map((entry) => entry.code)).toContain('wind_not_applied');

    const still = buildSolveInput({
      materials: defaultMaterials(),
      network: net,
      boundarySet: setWithWind(0),
      ports,
      scenarioId: 'SCN_A',
    });
    expect(still.notes.map((entry) => entry.code)).not.toContain('wind_not_applied');

    const solved = solveScenario({
      materials: defaultMaterials(),
      network: net,
      boundarySet: setWithWind(3),
      ports,
      scenarioId: 'SCN_A',
    });
    expect(solved.solution.status).toBe('WARNING');
    expect(solved.solution.warnings.map((entry) => entry.code)).toContain('wind_not_applied');
  });
});
