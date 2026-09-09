/**
 * What survived Screen 09.
 *
 * The screen is gone — its histogram binned NODES, which is a count of how
 * finely the network was drawn rather than a physical population — and with it
 * went the scope, filter, group, rank, CSV and scenario-compare tests that only
 * described its five tabs.
 *
 * These three did not, because the code under them did not: the binning and the
 * statistics still feed Screen 10's aggregator and the PNG export, and the row
 * builder feeds the overview layer, the report and the temperature CSV. They
 * keep their original cases, which were good ones.
 */

import { describe, expect, it } from 'vitest';

import type { Component } from '@/domain/component';
import { createRth } from '../rth';
import { DEFAULT_SOLVER_SETTINGS, type ThermalNetwork, type ThermalNode } from '../types';
import type { ThermalSolution } from '../solver/solverTypes';

import { percentile, percentilePositionOf, sortedFinite } from './percentile';
import {
  autoBinWidth,
  buildHistogram,
  computeStatistics,
  resolveBinWidth,
} from './temperatureStatistics';
import {
  NEAR_LIMIT_MARGIN_C,
  buildTemperatureDataset,
  statusFor,
} from './temperatureDataset';

// --- builders --------------------------------------------------------------

function node(
  id: string,
  options: {
    name?: string;
    power?: number;
    type?: ThermalNode['type'];
    component?: string;
    limit?: number;
    limitType?: 'Tj' | 'Tc';
    zone?: string;
    ambient?: boolean;
  } = {},
): ThermalNode {
  return {
    id,
    name: options.name ?? id,
    type: options.type ?? (options.ambient ? 'ambient' : 'custom'),
    power_W: options.power ?? 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: options.ambient ? 'fixed_temperature' : null,
    boundary_role: options.ambient ? 'placeholder' : undefined,
    component_ref: options.component,
    zone: options.zone,
    limit_C: options.limit ?? null,
    limit_type: options.limitType ?? (options.limit == null ? null : 'Tj'),
  };
}

function network(nodes: ThermalNode[]): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    status: 'VALID',
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
    edges: {
      E1: {
        id: 'E1',
        from: nodes[0].id,
        to: nodes[nodes.length - 1].id,
        type: 'conduction',
        method: 'direct_rth',
        rth: createRth(0.5, 'Analytical', 'high'),
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

function solution(temperatures: Record<string, number>, scenarioId = 'SCN_A'): ThermalSolution {
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_id: 'Main Thermal Network',
    scenario_id: scenarioId,
    status: 'SOLVED',
    solver_version: 'v1.0',
    solver_engine: 'test',
    solved_at: '2026-01-01T00:00:00.000Z',
    node_temperatures_C: temperatures,
    edge_results: {},
    energy_balance: {
      generated_W: 100,
      rejected_W: 100,
      residual_W: 0,
      error_pct: 0,
      grade: 'green',
      component_W: 100,
      solar_W: 0,
    },
    warnings: [],
    metadata: {
      input_signature: 'sig',
      solved_nodes: Object.keys(temperatures).length,
      solved_edges: 0,
      fixed_nodes: 1,
      max_node_residual_W: 0,
      solve_time_ms: 1,
      power_scale: 1,
      ambient_C: 55,
      matrix_size: Object.keys(temperatures).length,
    },
  };
}

function component(id: string, name: string, category: Component['category']): Component {
  return { id, name, category } as Component;
}

// --- histogram ------------------------------------------------------------

describe('deterministic histogram bins', () => {
  const temperatures = [55, 60, 62, 70, 75, 85, 90, 96, 103];
  const entries = temperatures.map((temperature_C, index) => ({
    node_id: `N${index}`,
    temperature_C,
  }));

  it('anchors 5 °C bins to multiples of the width', () => {
    const bins = buildHistogram(entries, 5);
    expect(bins.map((bin) => bin.label)).toEqual([
      '55–60',
      '60–65',
      '65–70',
      '70–75',
      '75–80',
      '80–85',
      '85–90',
      '90–95',
      '95–100',
      '100–105',
    ]);
    // 55 | 60,62 | – | 70 | 75 | – | 85 | 90 | 96 | 103
    expect(bins.map((bin) => bin.count)).toEqual([1, 2, 0, 1, 1, 0, 1, 1, 1, 1]);
    expect(bins.reduce((total, bin) => total + bin.count, 0)).toBe(temperatures.length);
  });

  it('puts a value on a boundary into the bin it opens', () => {
    // 60 opens 60–65; 55 opens 55–60.
    const bins = buildHistogram(entries, 5);
    expect(bins.find((bin) => bin.label === '55–60')?.node_ids).toEqual(['N0']);
    expect(bins.find((bin) => bin.label === '60–65')?.node_ids).toEqual(['N1', 'N2']);
  });

  it('is stable across repeated calls with the same inputs', () => {
    expect(JSON.stringify(buildHistogram(entries, 5))).toBe(
      JSON.stringify(buildHistogram(entries, 5)),
    );
  });

  it('honours the bin mode rather than re-guessing per render', () => {
    expect(resolveBinWidth('5', 0, temperatures)).toBe(5);
    expect(resolveBinWidth('10', 0, temperatures)).toBe(10);
    expect(resolveBinWidth('custom', 2.5, temperatures)).toBe(2.5);
    // A nonsense custom width falls back rather than dividing by zero.
    expect(resolveBinWidth('custom', 0, temperatures)).toBe(5);
    expect(autoBinWidth(temperatures)).toBeGreaterThan(0);
  });

  it('keeps the maximum inside the last bin', () => {
    const bins = buildHistogram([{ node_id: 'N', temperature_C: 100 }], 10);
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(1);
  });

  it('returns nothing for an empty dataset instead of an empty axis of zeros', () => {
    expect(buildHistogram([], 5)).toEqual([]);
  });
});

// --- statistics -----------------------------------------------------------

describe('temperature statistics', () => {
  it('computes count / min / max / mean / median / P90 / P95 / std-dev', () => {
    const stats = computeStatistics([55, 60, 62, 70, 75, 85, 90, 96, 103]);
    expect(stats.count).toBe(9);
    expect(stats.min_C).toBe(55);
    expect(stats.max_C).toBe(103);
    expect(stats.mean_C).toBeCloseTo(77.333333, 5);
    expect(stats.median_C).toBe(75);
    // Interpolated (R-7): position = 8 × 0.9 = 7.2 → 96 + 0.2 × (103 − 96).
    expect(stats.p90_C).toBeCloseTo(97.4, 10);
    expect(stats.p95_C).toBeCloseTo(100.2, 10);
    // Population sigma: sqrt(2319.9 / 9). Dividing by n-1 would give 17.03.
    expect(stats.std_dev_C).toBeCloseTo(16.0555, 3);
  });

  it('reports null, not zero, for an empty dataset', () => {
    const stats = computeStatistics([]);
    expect(stats.count).toBe(0);
    expect(stats.min_C).toBeNull();
    expect(stats.mean_C).toBeNull();
    expect(stats.p95_C).toBeNull();
    expect(stats.std_dev_C).toBeNull();
  });

  it('handles a single node without dividing by zero', () => {
    const stats = computeStatistics([88]);
    expect(stats.min_C).toBe(88);
    expect(stats.max_C).toBe(88);
    expect(stats.median_C).toBe(88);
    expect(stats.p95_C).toBe(88);
    expect(stats.std_dev_C).toBe(0);
  });

  it('drops non-finite values rather than propagating NaN', () => {
    const stats = computeStatistics([70, Number.NaN, 80, Number.POSITIVE_INFINITY]);
    expect(stats.count).toBe(2);
    expect(stats.mean_C).toBe(75);
  });

  it('interpolates percentiles deterministically', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20], 0.95)).toBeCloseTo(19.5, 10);
    expect(percentile([], 0.95)).toBeNull();
  });

  it('reports a percentile position for one node (09 §30)', () => {
    const sorted = sortedFinite([55, 60, 70, 80, 96.8, 103.4]);
    // 96.8 is at or above 5 of the 6 values.
    expect(percentilePositionOf(sorted, 96.8)).toBeCloseTo((5 / 6) * 100, 10);
    expect(percentilePositionOf(sorted, 103.4)).toBe(100);
    expect(percentilePositionOf([], 90)).toBeNull();
  });
});

// --- the row builder ------------------------------------------------------

describe('rows with mixed limits', () => {
  const net = network([
    node('N_FPGA', { component: 'CMP_FPGA', limit: 110, limitType: 'Tj', power: 35 }),
    node('N_DDR', { component: 'CMP_DDR', limit: 95, limitType: 'Tc', power: 5 }),
    node('N_PA', { component: 'CMP_PA', limit: 180, limitType: 'Tj', power: 52 }),
    node('AMB', { ambient: true }),
  ]);
  const rows = buildTemperatureDataset({
    network: net,
    solution: solution({ N_FPGA: 96.8, N_DDR: 88, N_PA: 103.4, AMB: 55 }),
    components: [
      component('CMP_FPGA', 'FPGA', 'Digital'),
      component('CMP_DDR', 'DDR', 'Digital'),
      component('CMP_PA', 'Final PA', 'RF'),
    ],
  });

  it('keeps each component on its own limit rather than one global line', () => {
    const limits = rows
      .filter((row) => row.limit_C != null)
      .map((row) => ({ node: row.node_id, type: row.limit_type, limit: row.limit_C }));
    expect(limits).toEqual(
      expect.arrayContaining([
        { node: 'N_FPGA', type: 'Tj', limit: 110 },
        { node: 'N_DDR', type: 'Tc', limit: 95 },
        { node: 'N_PA', type: 'Tj', limit: 180 },
      ]),
    );
    // Three different limits, so there is no single value a global line could use.
    expect(new Set(limits.map((entry) => entry.limit)).size).toBe(3);
  });

  it('computes each margin against its own limit', () => {
    const byId = Object.fromEntries(rows.map((row) => [row.node_id, row]));
    expect(byId.N_FPGA.margin_C).toBeCloseTo(13.2, 10);
    expect(byId.N_DDR.margin_C).toBeCloseTo(7, 10);
    expect(byId.N_PA.margin_C).toBeCloseTo(76.6, 10);
  });

  it('classifies near limit at 10 °C without calling it a product verdict', () => {
    expect(statusFor(13.2)).toBe('within_limit');
    expect(statusFor(NEAR_LIMIT_MARGIN_C)).toBe('near_limit');
    expect(statusFor(7)).toBe('near_limit');
    expect(statusFor(-2)).toBe('over_limit');
    expect(statusFor(undefined)).toBe('no_limit');
  });

  it('leaves a node without a limit with no margin, not a margin of zero', () => {
    const ambient = rows.find((row) => row.node_id === 'AMB');
    expect(ambient?.margin_C).toBeUndefined();
    expect(ambient?.status).toBe('no_limit');
  });
});
