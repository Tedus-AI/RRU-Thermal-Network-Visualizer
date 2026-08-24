/**
 * Screen 09 tests — the developer test cases in 09 §58 (A–E), plus the
 * statistics of §23/§24, the scope and filter rules of §7/§9, and the ranking
 * distinction of §26.
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
  applyFilters,
  applyScope,
  buildTemperatureDataset,
  emptyFilters,
  groupRows,
  rankRows,
  statusFor,
  temperatureCsv,
} from './temperatureDataset';
import { compareScenarios } from './scenarioTemperatureCompare';

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

// --- Test A — histogram (09 §58 A, §11, §40) --------------------------------

describe('Test A — deterministic histogram bins (09 §58 A)', () => {
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

// --- statistics (09 §23, §24, §37) ------------------------------------------

describe('Statistics (09 §23, §24, §37)', () => {
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

// --- Test B — mixed limits (09 §58 B, §12) ----------------------------------

describe('Test B — mixed limits (09 §58 B)', () => {
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

// --- Tests C and D — scenario compare (09 §58 C/D, §17, §18) ----------------

describe('Test C — scenario compare (09 §58 C)', () => {
  const net = network([
    node('N_PA', { component: 'CMP_PA', limit: 180, power: 52 }),
    node('N_FPGA', { component: 'CMP_FPGA', limit: 110, power: 35 }),
  ]);
  const baselineRows = buildTemperatureDataset({
    network: net,
    solution: solution({ N_PA: 103.4, N_FPGA: 96.8 }, 'SCN_BASE'),
    components: [component('CMP_PA', 'PA1', 'RF'), component('CMP_FPGA', 'FPGA', 'Digital')],
  });

  it('computes ΔT per node against the comparison scenario', () => {
    const result = compareScenarios({
      baselineRows,
      baselineScenarioId: 'SCN_BASE',
      comparisonSolution: solution({ N_PA: 97.0, N_FPGA: 91.2 }, 'SCN_COMP'),
      comparisonScenarioId: 'SCN_COMP',
      limitOf: (nodeId) => net.nodes[nodeId]?.limit_C ?? undefined,
    });

    const byId = Object.fromEntries(result.rows.map((row) => [row.node_id, row]));
    expect(byId.N_PA.delta_temperature_C).toBeCloseTo(-6.4, 10);
    expect(byId.N_FPGA.delta_temperature_C).toBeCloseTo(-5.6, 10);
    expect(result.matched).toBe(2);
    expect(result.partial_match).toBe(false);
    expect(result.compatible).toBe(true);
  });

  it('carries both margins so a cooler scenario shows its recovered headroom', () => {
    const result = compareScenarios({
      baselineRows,
      baselineScenarioId: 'SCN_BASE',
      comparisonSolution: solution({ N_PA: 97.0, N_FPGA: 91.2 }, 'SCN_COMP'),
      comparisonScenarioId: 'SCN_COMP',
      limitOf: (nodeId) => net.nodes[nodeId]?.limit_C ?? undefined,
    });
    const fpga = result.rows.find((row) => row.node_id === 'N_FPGA');
    expect(fpga?.baseline_margin_C).toBeCloseTo(13.2, 10);
    expect(fpga?.comparison_margin_C).toBeCloseTo(18.8, 10);
  });
});

describe('Test D — partial match (09 §58 D, §18)', () => {
  const net = network([
    node('N_PA', { component: 'CMP_PA', limit: 180, power: 52 }),
    node('N_FPGA', { component: 'CMP_FPGA', limit: 110, power: 35 }),
  ]);
  const baselineRows = buildTemperatureDataset({
    network: net,
    solution: solution({ N_PA: 103.4, N_FPGA: 96.8 }, 'SCN_BASE'),
    components: [component('CMP_PA', 'PA1', 'RF'), component('CMP_FPGA', 'FPGA', 'Digital')],
  });

  it('flags the partial match and still renders the nodes that do line up', () => {
    const result = compareScenarios({
      baselineRows,
      baselineScenarioId: 'SCN_BASE',
      // The comparison solution is missing N_FPGA and has a node the baseline lacks.
      comparisonSolution: solution({ N_PA: 97.0, N_EXTRA: 70 }, 'SCN_COMP'),
      comparisonScenarioId: 'SCN_COMP',
      limitOf: (nodeId) => net.nodes[nodeId]?.limit_C ?? undefined,
    });

    expect(result.partial_match).toBe(true);
    expect(result.compatible).toBe(true);
    expect(result.matched).toBe(1);
    expect(result.missing_comparison).toBe(1);
    expect(result.missing_baseline).toBe(1);

    const byId = Object.fromEntries(result.rows.map((row) => [row.node_id, row]));
    expect(byId.N_PA.delta_temperature_C).toBeCloseTo(-6.4, 10);
    // The unmatched node reports N/A rather than a fabricated delta.
    expect(byId.N_FPGA.comparison_temperature_C).toBeUndefined();
    expect(byId.N_FPGA.delta_temperature_C).toBeUndefined();
    expect(byId.N_FPGA.match_status).toBe('missing_comparison');
    expect(byId.N_EXTRA.match_status).toBe('missing_baseline');
  });

  it('reports incompatible when nothing lines up at all', () => {
    const result = compareScenarios({
      baselineRows,
      baselineScenarioId: 'SCN_BASE',
      comparisonSolution: solution({ OTHER_A: 70, OTHER_B: 80 }, 'SCN_COMP'),
      comparisonScenarioId: 'SCN_COMP',
      limitOf: () => undefined,
    });
    expect(result.compatible).toBe(false);
    expect(result.matched).toBe(0);
  });
});

// --- scope and filters (09 §7, §9) ------------------------------------------

describe('Scope and filters (09 §7, §9)', () => {
  const net = network([
    node('N_PA', { component: 'CMP_PA', limit: 180, power: 52, zone: 'RF Left' }),
    node('N_FPGA', { component: 'CMP_FPGA', limit: 110, power: 35, zone: 'Digital' }),
    node('N_BASE', { type: 'heat_sink_base', zone: 'Main' }),
    node('N_FIN', { type: 'fin_surface' }),
    node('AMB', { ambient: true }),
  ]);
  const rows = buildTemperatureDataset({
    network: net,
    solution: solution({ N_PA: 103.4, N_FPGA: 96.8, N_BASE: 78, N_FIN: 64, AMB: 55 }),
    components: [component('CMP_PA', 'PA1', 'RF'), component('CMP_FPGA', 'FPGA', 'Digital')],
  });

  it('defaults to the components that actually have a limit', () => {
    const scoped = applyScope(rows, 'components_with_limits', []);
    expect(scoped.map((row) => row.node_id).sort()).toEqual(['N_FPGA', 'N_PA']);
  });

  it('narrows to heat sources, shared structure and boundary nodes', () => {
    expect(
      applyScope(rows, 'heat_sources_only', [])
        .map((row) => row.node_id)
        .sort(),
    ).toEqual(['N_FPGA', 'N_PA']);
    expect(
      applyScope(rows, 'shared_structure', [])
        .map((row) => row.node_id)
        .sort(),
    ).toEqual(['N_BASE', 'N_FIN']);
    expect(applyScope(rows, 'boundary_nodes', []).map((row) => row.node_id)).toEqual(['AMB']);
    expect(applyScope(rows, 'all_solved_nodes', []).length).toBe(5);
    expect(applyScope(rows, 'custom_selection', ['N_FIN']).map((row) => row.node_id)).toEqual([
      'N_FIN',
    ]);
  });

  it('filters by category, zone and temperature range', () => {
    const base = emptyFilters();
    expect(applyFilters(rows, { ...base, category: 'RF' }).map((row) => row.node_id)).toEqual([
      'N_PA',
    ]);
    expect(applyFilters(rows, { ...base, zone: 'Digital' }).map((row) => row.node_id)).toEqual([
      'N_FPGA',
    ]);
    expect(
      applyFilters(rows, { ...base, temperature_min_C: 90 })
        .map((row) => row.node_id)
        .sort(),
    ).toEqual(['N_FPGA', 'N_PA']);
  });

  it('excludes limitless nodes from a margin filter rather than treating them as 0', () => {
    const filtered = applyFilters(rows, { ...emptyFilters(), margin_max_C: 20 });
    expect(filtered.map((row) => row.node_id)).toEqual(['N_FPGA']);
    expect(filtered.some((row) => row.margin_C == null)).toBe(false);
  });

  it('offers only the analytical dataset while Screen 03 is deferred', () => {
    expect(rows.every((row) => row.result_source === 'analytical')).toBe(true);
    expect(applyFilters(rows, { ...emptyFilters(), result_source: 'flotherm' })).toHaveLength(0);
  });

  it('groups by the selected dimension', () => {
    const groups = groupRows(applyScope(rows, 'all_solved_nodes', []), 'category');
    const keys = groups.map((group) => group.key).sort();
    expect(keys).toContain('RF');
    expect(keys).toContain('Digital');
    expect(keys).toContain('Uncategorised');
  });
});

// --- ranking (09 §25, §26) ---------------------------------------------------

describe('Temperature rank is not a bottleneck rank (09 §26)', () => {
  const net = network([
    node('HOT_SAFE', { component: 'CMP_PA', limit: 180, power: 52 }),
    node('COOLER_TIGHT', { component: 'CMP_FPGA', limit: 110, power: 35 }),
  ]);
  const rows = buildTemperatureDataset({
    network: net,
    solution: solution({ HOT_SAFE: 103.4, COOLER_TIGHT: 96.8 }),
    components: [component('CMP_PA', 'PA1', 'RF'), component('CMP_FPGA', 'FPGA', 'Digital')],
  });

  it('ranks by temperature descending', () => {
    expect(rankRows(rows, 'temperature').map((row) => row.node_id)).toEqual([
      'HOT_SAFE',
      'COOLER_TIGHT',
    ]);
  });

  it('ranks by margin ascending in margin mode — a different order', () => {
    expect(rankRows(rows, 'margin').map((row) => row.node_id)).toEqual([
      'COOLER_TIGHT',
      'HOT_SAFE',
    ]);
  });

  it('puts nodes with no margin last in margin mode', () => {
    const withAmbient = buildTemperatureDataset({
      network: network([
        node('HOT', { component: 'CMP_PA', limit: 180, power: 52 }),
        node('AMB', { ambient: true }),
      ]),
      solution: solution({ HOT: 103.4, AMB: 55 }),
      components: [component('CMP_PA', 'PA1', 'RF')],
    });
    expect(rankRows(withAmbient, 'margin').map((row) => row.node_id)).toEqual(['HOT', 'AMB']);
  });
});

// --- export (09 §43) ---------------------------------------------------------

describe('CSV export (09 §43)', () => {
  it('writes the specified columns and leaves a missing limit blank', () => {
    const net = network([
      node('N_PA', {
        name: 'PA1 Junction',
        component: 'CMP_PA',
        limit: 180,
        power: 52,
        zone: 'RF Left',
      }),
      node('AMB', { name: 'Ambient', ambient: true }),
    ]);
    const rows = buildTemperatureDataset({
      network: net,
      solution: solution({ N_PA: 103.4, AMB: 55 }),
      components: [component('CMP_PA', 'PA1', 'RF')],
    });

    const csv = temperatureCsv(rows, 'Baseline 55C');
    const [header, ...lines] = csv.split('\n');
    expect(header).toBe(
      'Scenario,Node,Component,Category,Node Type,Temperature (C),Limit Type,Limit (C),Margin (C),Zone,Result Source',
    );
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.includes('PA1 Junction'))).toContain('103.40');
    // The ambient row has no limit and no margin: two empty fields, not zeros.
    const ambientLine = lines.find((line) => line.includes('Ambient')) as string;
    expect(ambientLine).toContain(',"",,,');
  });
});
