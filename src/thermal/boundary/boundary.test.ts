/**
 * Screen 06 boundary conditions — 06 §12, §13, and the acceptance checklist.
 *
 * The two things these tests exist to defend:
 *   • Screen 06 produces boundary INPUTS. No solved temperature, no edge heat
 *     flow, no fake resistance for a fixed-temperature or adiabatic boundary.
 *   • A missing input yields null and a blocking error, never a fabricated 0.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SIGMA,
  buildDerivedPreview,
  calculateCombinedBoundaryRth,
  calculateConvectionRth,
  calculateLinearizedRadiationHrad,
  calculateRadiationRth,
  calculateSolarHeatLoad,
} from './calculations';
import { deriveBoundaryPorts, surfaceGroupsOf } from './boundaryPorts';
import { buildAllPreviews, validateBoundarySet } from './validation';
import { boundaryPortsFromMock, boundarySetFromMock, topologyVersionFromMock } from './mockAdapter';
import { createBoundarySet } from './types';
import type {
  BoundaryConditionProfile,
  BoundaryPort,
  ScenarioBoundaryConditionSet,
} from './types';

import { buildSharedStructure } from '../graph/sharedStructure';
import { DEFAULT_SOLVER_SETTINGS } from '../types';
import type { ThermalNetwork } from '../types';

// --- fixtures --------------------------------------------------------------

function networkWithBoundary(): ThermalNetwork {
  const structure = buildSharedStructure('SINGLE_MAIN_BASE');
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_name: 'MAIN',
    mode: 'analytical',
    status: 'DRAFT',
    nodes: Object.fromEntries(structure.nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(structure.edges.map((edge) => [edge.id, edge])),
    templates: {},
    zones: Object.fromEntries(structure.zones.map((zone) => [zone.id, zone])),
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

function dualNetworkWithBoundary(): ThermalNetwork {
  const structure = buildSharedStructure('DUAL_HSK_BASE');
  return {
    ...networkWithBoundary(),
    nodes: Object.fromEntries(structure.nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(structure.edges.map((edge) => [edge.id, edge])),
    zones: Object.fromEntries(structure.zones.map((zone) => [zone.id, zone])),
  };
}

function port(overrides: Partial<BoundaryPort> = {}): BoundaryPort {
  return {
    id: 'BP_TEST',
    name: 'Test Surface Boundary',
    connected_node_id: 'NODE_FIN_SURFACE',
    surface_group_id: 'SG_TEST',
    area_m2: 0.42,
    orientation: 'vertical_fins',
    allowed_boundary_types: ['convection_to_ambient', 'radiation_to_surroundings'],
    dissipating: true,
    external_mappings: { import_status: 'deferred' },
    ...overrides,
  };
}

function profile(
  overrides: Partial<BoundaryConditionProfile> & Pick<BoundaryConditionProfile, 'type'>,
): BoundaryConditionProfile {
  return {
    id: 'BCP_TEST',
    name: 'Test profile',
    representation: 'parallel_boundary_edges',
    parameters: {},
    source: 'manual',
    confidence: 'medium',
    ...overrides,
  };
}

function setWith(
  profiles: BoundaryConditionProfile[],
  overrides: Partial<ScenarioBoundaryConditionSet> = {},
): ScenarioBoundaryConditionSet {
  const base = createBoundarySet({
    projectId: 'TEST',
    networkId: 'MAIN',
    scenarioId: 'SCN_BASE',
    topologyVersion: 1,
    ambient_C: 55,
  });
  return { ...base, profiles, ...overrides };
}

// --- calculations ----------------------------------------------------------

describe('boundary calculations (06 §13)', () => {
  it('computes convection resistance as 1 / (h·A)', () => {
    // 18 W/m²K over 0.42 m² -> 0.1323 °C/W, the value the specification quotes.
    expect(calculateConvectionRth(18, 0.42)).toBeCloseTo(0.13228, 4);
  });

  it('returns null rather than zero when h or area is missing', () => {
    expect(calculateConvectionRth(null, 0.42)).toBeNull();
    expect(calculateConvectionRth(18, null)).toBeNull();
    expect(calculateConvectionRth(0, 0.42)).toBeNull();
    expect(calculateConvectionRth(18, 0)).toBeNull();
    expect(calculateConvectionRth(-5, 0.42)).toBeNull();
  });

  it('linearises the radiation coefficient as 4·ε·σ·F·T³', () => {
    const hrad = calculateLinearizedRadiationHrad({
      emissivity: 0.86,
      viewFactor: 0.9,
      surfaceReferenceTemperatureGuess_C: 90,
    })!;
    const expected = 4 * 0.86 * SIGMA * 0.9 * (90 + 273.15) ** 3;
    expect(hrad).toBeCloseTo(expected, 10);
    // Sanity: a hot anodised fin radiates a few W/m²K, not hundreds.
    expect(hrad).toBeGreaterThan(3);
    expect(hrad).toBeLessThan(12);
  });

  it('refuses an emissivity or view factor outside 0–1', () => {
    expect(
      calculateLinearizedRadiationHrad({
        emissivity: 1.4,
        viewFactor: 0.9,
        surfaceReferenceTemperatureGuess_C: 90,
      }),
    ).toBeNull();
    expect(
      calculateLinearizedRadiationHrad({
        emissivity: 0.8,
        viewFactor: 1.5,
        surfaceReferenceTemperatureGuess_C: 90,
      }),
    ).toBeNull();
  });

  it('adds conductances, not resistances, for combined convection + radiation', () => {
    const area = 0.42;
    const hconv = 18;
    const hrad = 5.2;
    const combined = calculateCombinedBoundaryRth({
      hconv_W_m2K: hconv,
      hrad_W_m2K: hrad,
      area_m2: area,
    })!;

    expect(combined).toBeCloseTo(1 / ((hconv + hrad) * area), 10);
    // The parallel result must be SMALLER than either path alone.
    expect(combined).toBeLessThan(calculateConvectionRth(hconv, area)!);
    expect(combined).toBeLessThan(calculateRadiationRth(hrad, area)!);
    // And it must not be the series sum, which would be the classic mistake.
    const series = calculateConvectionRth(hconv, area)! + calculateRadiationRth(hrad, area)!;
    expect(combined).not.toBeCloseTo(series, 6);
  });

  it('computes solar heat load as an external input', () => {
    // 800 · 0.38 · 0.72 · 0.55 · 0.8 = 96.31 W, matching the specification mock.
    const q = calculateSolarHeatLoad({
      irradiance_W_m2: 800,
      receivingArea_m2: 0.38,
      absorptivity: 0.72,
      projectedAreaFactor: 0.55,
      shadingFactor: 0.8,
    })!;
    expect(q).toBeCloseTo(96.31, 2);
  });

  it('returns null for solar when any factor is missing', () => {
    expect(
      calculateSolarHeatLoad({
        irradiance_W_m2: 800,
        receivingArea_m2: 0.38,
        absorptivity: null,
        projectedAreaFactor: 0.55,
        shadingFactor: 0.8,
      }),
    ).toBeNull();
  });
});

// --- derived preview -------------------------------------------------------

describe('derived preview (06 §8.3)', () => {
  it('carries the pre-solve disclaimer on every preview', () => {
    const preview = buildDerivedPreview(port(), []);
    expect(preview.disclaimer).toBe('pre_solve_boundary_input_only');
    expect(preview.completeness).toBe('blocked');
  });

  it('treats a non-dissipating ambient reference as ready from Scenario Environment', () => {
    const ambient = buildDerivedPreview(
      port({ id: 'BP_AMBIENT', dissipating: false, area_m2: null }),
      [],
      { ambient_C: 55 },
    );
    const missing = buildDerivedPreview(
      port({ id: 'BP_AMBIENT', dissipating: false, area_m2: null }),
      [],
      { ambient_C: null },
    );

    expect(ambient.completeness).toBe('complete');
    expect(ambient.r_conv_C_per_W).toBeUndefined();
    expect(missing.completeness).toBe('blocked');
  });

  it('produces convection, radiation and combined Rth for a mixed port', () => {
    const preview = buildDerivedPreview(
      port(),
      [
        profile({
          id: 'P_CONV',
          type: 'convection_to_ambient',
          parameters: { h_W_m2K: 18, area_m2: 0.42 },
        }),
        profile({
          id: 'P_RAD',
          type: 'radiation_to_surroundings',
          parameters: {
            emissivity: 0.86,
            viewFactor: 0.9,
            area_m2: 0.42,
            surfaceReferenceTemperatureGuess_C: 90,
          },
        }),
      ],
      { ambient_C: 55 },
    );

    expect(preview.r_conv_C_per_W).toBeCloseTo(0.13228, 4);
    expect(preview.r_rad_C_per_W).toBeGreaterThan(0);
    expect(preview.r_combined_C_per_W).toBeLessThan(preview.r_conv_C_per_W!);
    expect(preview.completeness).toBe('complete');
  });

  it('marks the preview as an assumption when the surface guess is missing', () => {
    const preview = buildDerivedPreview(
      port(),
      [
        profile({
          type: 'radiation_to_surroundings',
          parameters: { emissivity: 0.86, viewFactor: 0.9, area_m2: 0.42 },
        }),
      ],
      { ambient_C: 55 },
    );
    expect(preview.completeness).toBe('warning');
    expect(preview.h_rad_W_m2K).not.toBeNull();
  });

  it('never invents a resistance for a fixed-temperature or adiabatic boundary', () => {
    const fixed = buildDerivedPreview(port(), [
      profile({
        type: 'fixed_temperature_boundary',
        representation: 'fixed_temperature_reservoir',
        parameters: { fixedTemperature_C: 25 },
      }),
    ]);
    expect(fixed.r_conv_C_per_W).toBeUndefined();
    expect(fixed.r_combined_C_per_W).toBeUndefined();

    const adiabatic = buildDerivedPreview(port(), [
      profile({
        type: 'adiabatic_symmetry',
        representation: 'adiabatic_no_flow',
        parameters: { reason: 'Symmetry plane' },
      }),
    ]);
    expect(adiabatic.r_conv_C_per_W).toBeUndefined();
    expect(adiabatic.r_combined_C_per_W).toBeUndefined();
  });

  it('keeps solar as a heat load, not a resistance', () => {
    const preview = buildDerivedPreview(port(), [
      profile({
        type: 'solar_load',
        representation: 'external_load_only',
        parameters: {
          irradiance_W_m2: 800,
          receivingArea_m2: 0.38,
          absorptivity: 0.72,
          projectedAreaFactor: 0.55,
          shadingFactor: 0.8,
        },
      }),
    ]);
    expect(preview.q_solar_W).toBeCloseTo(96.31, 2);
    expect(preview.r_conv_C_per_W).toBeUndefined();
    expect(preview.r_combined_C_per_W).toBeUndefined();
  });
});

// --- boundary ports --------------------------------------------------------

describe('boundary ports derived from Screen 05 (06 §5)', () => {
  it('finds the surface behind every boundary-derived edge', () => {
    const ports = deriveBoundaryPorts(networkWithBoundary());
    const surface = ports.find((entry) => entry.connected_node_id === 'NODE_FIN_SURFACE');

    expect(surface).toBeDefined();
    expect(surface!.dissipating).toBe(true);
    expect(surface!.boundary_edge_id).toBeTruthy();
    expect(surface!.allowed_boundary_types).toContain('convection_to_ambient');
    // Area is not known from the topology and must not be guessed.
    expect(surface!.area_m2).toBeNull();
  });

  it('treats the ambient placeholder as a reference, not a dissipating surface', () => {
    const ports = deriveBoundaryPorts(networkWithBoundary());
    const ambient = ports.find((entry) => entry.connected_node_id.includes('AMBIENT'));
    expect(ambient?.dissipating).toBe(false);
  });

  it('derives separate RF and Digital boundary ports for dual HSK bases', () => {
    const dissipating = deriveBoundaryPorts(dualNetworkWithBoundary()).filter(
      (entry) => entry.dissipating,
    );

    expect(dissipating.map((entry) => entry.connected_node_id).sort()).toEqual([
      'NODE_DIGITAL_FIN_SURFACE',
      'NODE_RF_FIN_SURFACE',
    ]);
    expect(new Set(dissipating.map((entry) => entry.boundary_edge_id)).size).toBe(2);
    expect(new Set(dissipating.map((entry) => entry.surface_group_id)).size).toBe(2);
  });

  it('does not mutate the topology it reads', () => {
    const network = networkWithBoundary();
    const before = JSON.stringify(network);
    deriveBoundaryPorts(network);
    expect(JSON.stringify(network)).toBe(before);
  });

  it('groups surfaces for the surface-properties table', () => {
    const groups = surfaceGroupsOf(deriveBoundaryPorts(networkWithBoundary()));
    expect(groups.length).toBeGreaterThan(0);
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
  });
});

// --- validation ------------------------------------------------------------

describe('boundary validation (06 §12)', () => {
  const ports = [port()];

  it('blocks when there is no topology or no scenario', () => {
    const result = validateBoundarySet({
      set: null,
      ports: [],
      hasTopology: false,
      hasScenario: false,
      topologyVersion: 1,
    });
    expect(result.status).toBe('blocked');
    expect(result.errors.map((error) => error.id)).toEqual(
      expect.arrayContaining(['NO_TOPOLOGY', 'NO_SCENARIO']),
    );
  });

  it('blocks a missing external ambient temperature', () => {
    const set = setWith([]);
    set.ambient.external_ambient_C = null;
    const result = validateBoundarySet({
      set,
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    });
    expect(result.errors.map((error) => error.id)).toContain('MISSING_AMBIENT');
  });

  it('does not demand ambient when every port is fixed temperature', () => {
    const fixed = profile({
      id: 'P_FIXED',
      type: 'fixed_temperature_boundary',
      representation: 'fixed_temperature_reservoir',
      parameters: { fixedTemperature_C: 25 },
    });
    const set = setWith([fixed], {
      assignments: [
        {
          id: 'A1',
          boundary_port_id: 'BP_TEST',
          profile_ids: ['P_FIXED'],
          assignment_mode: 'manual',
          enabled: true,
        },
      ],
    });
    set.ambient.external_ambient_C = null;

    const result = validateBoundarySet({
      set,
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    });
    expect(result.errors.map((error) => error.id)).not.toContain('MISSING_AMBIENT');
  });

  it('blocks an unassigned dissipating port', () => {
    const result = validateBoundarySet({
      set: setWith([]),
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    });
    expect(result.errors.some((error) => error.id.startsWith('PORT_UNASSIGNED'))).toBe(true);
    expect(result.status).toBe('blocked');
  });

  it('blocks non-positive h and area, and out-of-range emissivity and view factor', () => {
    const set = setWith([
      profile({ id: 'P1', type: 'convection_to_ambient', parameters: { h_W_m2K: 0, area_m2: -1 } }),
      profile({
        id: 'P2',
        type: 'radiation_to_surroundings',
        parameters: { emissivity: 1.3, viewFactor: -0.2, area_m2: 0 },
      }),
    ]);
    const codes = validateBoundarySet({
      set,
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    }).errors.map((error) => error.id);

    expect(codes).toContain('PROFILE_H_P1');
    expect(codes).toContain('PROFILE_AREA_P1');
    expect(codes).toContain('PROFILE_EMISSIVITY_P2');
    expect(codes).toContain('PROFILE_VIEWFACTOR_P2');
    expect(codes).toContain('PROFILE_AREA_P2');
  });

  it('blocks a fixed-temperature boundary with no temperature but only warns on a missing adiabatic reason', () => {
    const set = setWith([
      profile({
        id: 'P_FIXED',
        type: 'fixed_temperature_boundary',
        parameters: { fixedTemperature_C: null },
      }),
      profile({ id: 'P_ADIA', type: 'adiabatic_symmetry', parameters: {} }),
    ]);
    const result = validateBoundarySet({
      set,
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    });
    const errorCodes = result.errors.map((error) => error.id);
    const warningCodes = result.warnings.map((warning) => warning.id);

    expect(errorCodes).toContain('PROFILE_FIXED_T_P_FIXED');
    expect(errorCodes).not.toContain('PROFILE_ADIABATIC_REASON_P_ADIA');
    expect(warningCodes).toContain('PROFILE_ADIABATIC_REASON_P_ADIA');
  });

  it('accepts a legacy ambient profile temperature without mistaking it for a solved value', () => {
    const set = setWith([
      profile({
        id: 'P_AMBIENT',
        type: 'ambient_reservoir',
        representation: 'fixed_temperature_reservoir',
        parameters: { temperature_C: 99 },
      }),
    ]);
    const codes = validateBoundarySet({
      set,
      ports: [],
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    }).errors.map((error) => error.id);

    expect(codes).not.toContain('PROFILE_SOLVED_VALUE_P_AMBIENT_temperature_C');
    expect(codes).not.toContain('PROFILE_AMBIENT_T_P_AMBIENT');
  });

  it('blocks a solar profile that is missing any factor', () => {
    const set = setWith([
      profile({
        id: 'P_SOLAR',
        type: 'solar_load',
        parameters: { irradiance_W_m2: 800, receivingArea_m2: 0.38, absorptivity: 0.72 },
      }),
    ]);
    const codes = validateBoundarySet({
      set,
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    }).errors.map((error) => error.id);

    expect(codes).toContain('PROFILE_SOLAR_projectedAreaFactor_P_SOLAR');
    expect(codes).toContain('PROFILE_SOLAR_shadingFactor_P_SOLAR');
  });

  it('refuses to carry a solved value into Screen 07', () => {
    const set = setWith([
      profile({
        id: 'P_LEAK',
        type: 'convection_to_ambient',
        parameters: { h_W_m2K: 18, area_m2: 0.42, temperature_C: 92.4 },
      }),
    ]);
    const codes = validateBoundarySet({
      set,
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    }).errors.map((error) => error.id);

    expect(codes).toContain('PROFILE_SOLVED_VALUE_P_LEAK_temperature_C');
  });

  it('warns rather than blocks on assumptions', () => {
    const set = setWith(
      [
        profile({
          id: 'P_CONV',
          type: 'convection_to_ambient',
          confidence: 'low',
          parameters: { h_W_m2K: 8, area_m2: 0.42 },
        }),
      ],
      {
        assignments: [
          {
            id: 'A1',
            boundary_port_id: 'BP_TEST',
            profile_ids: ['P_CONV'],
            assignment_mode: 'manual',
            enabled: true,
          },
        ],
      },
    );
    set.site.wind_speed_m_s = 3;

    const result = validateBoundarySet({
      set,
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.id)).toEqual(
      expect.arrayContaining(['PROFILE_H_LOW_P_CONV', 'WIND_WITH_MANUAL_H']),
    );
    expect(result.status).toBe('warnings');
  });

  it('reaches ready_for_07 when every input is present', () => {
    const set = setWith(
      [
        profile({
          id: 'P_CONV',
          type: 'convection_to_ambient',
          confidence: 'high',
          parameters: { h_W_m2K: 18, area_m2: 0.42 },
        }),
      ],
      {
        assignments: [
          {
            id: 'A1',
            boundary_port_id: 'BP_TEST',
            profile_ids: ['P_CONV'],
            assignment_mode: 'manual',
            enabled: true,
          },
        ],
      },
    );

    const result = validateBoundarySet({
      set,
      ports,
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    });
    expect(result.status).toBe('ready_for_07');
  });

  it('warns when the topology changed after the set was saved', () => {
    const result = validateBoundarySet({
      set: setWith([]),
      ports: [],
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 99,
    });
    expect(result.warnings.map((warning) => warning.id)).toContain('STALE_TOPOLOGY');
  });
});

// --- Screen 03 deferred ----------------------------------------------------

describe('FloTHERM deferred contract (06 §2.2)', () => {
  it('blocks a profile that claims a FloTHERM source without metadata-only status', () => {
    const set = setWith([
      profile({
        id: 'P_CFD',
        type: 'convection_to_ambient',
        source: 'flotherm',
        parameters: { h_W_m2K: 18, area_m2: 0.42 },
        external_mappings: { import_status: 'not_mapped' },
      }),
    ]);
    const codes = validateBoundarySet({
      set,
      ports: [port()],
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    }).errors.map((error) => error.id);

    expect(codes).toContain('PROFILE_FLOTHERM_STATUS_P_CFD');
  });

  it('treats an external CFD placeholder as information, not data', () => {
    const set = setWith([
      profile({
        id: 'P_PLACEHOLDER',
        type: 'external_cfd_placeholder',
        representation: 'metadata_only',
        parameters: {},
      }),
    ]);
    const result = validateBoundarySet({
      set,
      ports: [port()],
      hasTopology: true,
      hasScenario: true,
      topologyVersion: 1,
    });
    expect(result.infos.map((info) => info.id)).toContain('PROFILE_CFD_P_PLACEHOLDER');
  });
});

// --- the specification's own mock -----------------------------------------

describe('06_Boundary_Conditions_mock.json', () => {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), '06/06_Boundary_Conditions_mock.json'), 'utf8'),
  );

  it('loads without parser errors', () => {
    const set = boundarySetFromMock(raw);
    const ports = boundaryPortsFromMock(raw);

    expect(ports).toHaveLength(3);
    expect(set.profiles).toHaveLength(5);
    expect(set.assignments).toHaveLength(3);
    expect(set.ambient.external_ambient_C).toBe(55);
    expect(set.site.solar_enabled).toBe(true);
    expect(topologyVersionFromMock(raw)).toBeGreaterThan(0);
  });

  it('carries no solved node temperature or edge heat flow', () => {
    const topology = raw.thermalNetworkTopologyFrom05;
    for (const node of topology.nodes) {
      expect(node.solvedTemperature_C ?? null).toBeNull();
      expect(node.temperature_C ?? null).toBeNull();
    }
    for (const edge of topology.edges) {
      expect(edge.heatFlow_W ?? null).toBeNull();
      expect(edge.heat_flow_W ?? null).toBeNull();
    }
  });

  /**
   * The mock's convection and solar numbers reproduce exactly. Its radiation
   * numbers (hrad 5.2, Rrad 0.458, Rcombined 0.103) do NOT follow from 06 §13.2
   * with the mock's own inputs: 4·0.86·σ·0.9·(90+273.15)³ is 8.41 W/m²K, and
   * 5.2 would need a 35 °C surface — below the 55 °C ambient. 06 states the
   * Markdown wins over any other artefact, so the documented formula is what is
   * implemented and what is asserted here.
   */
  it('reproduces the specification’s derived previews, and follows §13.2 for radiation', () => {
    const set = boundarySetFromMock(raw);
    const ports = boundaryPortsFromMock(raw);
    const previews = buildAllPreviews(set, ports);

    const fin = previews.find((preview) => preview.boundary_port_id === 'BP_FIN_RF_EXTERNAL_AIR')!;
    expect(fin.r_conv_C_per_W).toBeCloseTo(0.132, 3);

    const expectedHrad = 4 * 0.86 * SIGMA * 0.9 * (90 + 273.15) ** 3;
    expect(fin.h_rad_W_m2K).toBeCloseTo(expectedHrad, 6);
    expect(fin.r_rad_C_per_W).toBeCloseTo(1 / (expectedHrad * 0.42), 6);
    expect(fin.r_combined_C_per_W).toBeCloseTo(1 / ((18 + expectedHrad) * 0.42), 6);

    const sun = previews.find((preview) => preview.boundary_port_id === 'BP_HOUSING_SUN_FACE')!;
    expect(sun.q_solar_W).toBeCloseTo(96.31, 2);
    expect(sun.completeness).toBe('warning');

    const plate = previews.find((preview) => preview.boundary_port_id === 'BP_CHAMBER_BASE_PLATE')!;
    expect(plate.completeness).toBe('blocked');
  });

  it('recomputes validation rather than trusting the stored snapshot', () => {
    const set = boundarySetFromMock(raw);
    // The mock ships a validation block; the adapter must not import it.
    expect(set.validation.errors).toHaveLength(0);
    expect(set.validation.status).toBe('blocked');

    const result = validateBoundarySet({
      set,
      ports: boundaryPortsFromMock(raw),
      hasTopology: true,
      hasScenario: true,
      topologyVersion: topologyVersionFromMock(raw),
    });
    // The mock's base plate is deliberately unassigned, so the set is blocked.
    expect(result.status).toBe('blocked');
    expect(result.errors.some((error) => error.id.includes('BP_CHAMBER_BASE_PLATE'))).toBe(true);
  });
});
