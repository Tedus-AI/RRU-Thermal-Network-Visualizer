/**
 * Screen 10 tests — the developer test cases in 10 §34 (A–F), plus the status
 * priority of §4, the component classification of §8, the readiness rules of
 * §16/§17, the completeness counts of §12 and the snapshot contract of §18/§19.
 */

import { describe, expect, it } from 'vitest';

import type { Component } from '@/domain/component';
import type { Scenario } from '@/domain/project';
import { createRth } from '../rth';
import {
  DEFAULT_SOLVER_SETTINGS,
  type ThermalEdge,
  type ThermalNetwork,
  type ThermalNode,
} from '../types';
import type { ThermalSolution } from '../solver/solverTypes';
import type { BottleneckAnalysis, BottleneckResult } from '../analysis/analysisTypes';

import { buildResultsOverview, bottleneckAvailabilityOf } from './overviewAggregator';
import { buildCriticalComponents, classifyComponent, sortByMargin } from './criticalComponents';
import { evaluateOverallStatus } from './overallStatus';
import { buildReadiness, evaluateReportReadiness } from './reportReadiness';
import { buildSnapshot, isSnapshotCurrent } from './snapshotBuilder';
import { rthBucketOf } from './overviewTypes';
import type { CriticalComponentSummary, SolverQualitySummary } from './overviewTypes';

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
    limit_C: options.limit ?? null,
    limit_type: options.limitType ?? (options.limit == null ? null : 'Tj'),
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  options: {
    source?: ThermalEdge['rth']['active_source'];
    confidence?: 'high' | 'medium' | 'low';
  } = {},
): ThermalEdge {
  return {
    id,
    from,
    to,
    type: 'conduction',
    method: 'direct_rth',
    rth: createRth(0.5, options.source ?? 'Analytical', options.confidence ?? 'high'),
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
    confidence: options.confidence ?? 'high',
  };
}

function network(nodes: ThermalNode[], edges: ThermalEdge[]): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    status: 'VALID',
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
    edges: Object.fromEntries(edges.map((entry) => [entry.id, entry])),
    templates: {},
    zones: {},
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

function solution(
  temperatures: Record<string, number>,
  options: {
    status?: ThermalSolution['status'];
    errorPct?: number;
    edges?: Array<{ id: string; from: string; to: string; q: number; source?: string }>;
    signature?: string;
    warnings?: number;
  } = {},
): ThermalSolution {
  const errorPct = options.errorPct ?? 0.05;
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_id: 'Main Thermal Network',
    scenario_id: 'SCN_A',
    status: options.status ?? 'SOLVED',
    solver_version: 'v1.0',
    solver_engine: 'test',
    solved_at: '2026-01-01T00:00:00.000Z',
    node_temperatures_C: temperatures,
    edge_results: Object.fromEntries(
      (options.edges ?? []).map((entry) => [
        entry.id,
        {
          edge_id: entry.id,
          from: entry.from,
          to: entry.to,
          heat_flow_W: entry.q,
          delta_T_C: 1,
          actual_direction: entry.q >= 0 ? ('forward' as const) : ('reverse' as const),
          active_rth_C_per_W: 0.5,
          active_rth_source: (entry.source ?? 'Analytical') as ThermalEdge['rth']['active_source'],
          rth_origin: 'edge' as const,
        },
      ]),
    ),
    energy_balance: {
      generated_W: 412.3,
      rejected_W: 412.1,
      residual_W: 0.2,
      error_pct: errorPct,
      grade: 'green',
      component_W: 412.3,
      solar_W: 0,
    },
    warnings: Array.from({ length: options.warnings ?? 0 }, (_, index) => ({
      id: `W${index}`,
      severity: 'warning' as const,
      code: 'test',
      message: 'test',
      message_zh: 'test',
      group: 'energy_balance' as const,
    })),
    metadata: {
      input_signature: options.signature ?? 'sig-1',
      solved_nodes: Object.keys(temperatures).length,
      solved_edges: (options.edges ?? []).length,
      fixed_nodes: 1,
      max_node_residual_W: 0,
      solve_time_ms: 1,
      power_scale: 1,
      ambient_C: 55,
      matrix_size: Object.keys(temperatures).length,
    },
  };
}

function component(id: string, name: string, limit: number | null): Component {
  return {
    id,
    name,
    category: 'RF',
    enabled: true,
    thermal_spec: { limit_C: limit == null ? null : { value: limit, source: 'Datasheet' } },
  } as unknown as Component;
}

const scenario: Scenario = {
  id: 'SCN_A',
  project_id: 'TEST',
  name: 'Baseline 55C',
  ambient_C: 55,
  wind_mps: 0,
  solar_W_m2: 0,
  power_scale: 1,
  notes: '',
  is_default: true,
};

function analysis(options: {
  signature?: string;
  state?: BottleneckAnalysis['state'];
  results?: Array<Partial<BottleneckResult> & { edge_id: string; edge_label: string }>;
}): BottleneckAnalysis {
  const results = (options.results ?? []).map(
    (entry, index) =>
      ({
        edge_id: entry.edge_id,
        rank: index + 1,
        edge_label: entry.edge_label,
        path_label: entry.edge_label,
        edge_type: 'conduction',
        baseline: {
          rth_C_per_W: 0.5,
          heat_flow_W: 10,
          delta_T_C: 5,
          T_from_C: 90,
          T_to_C: 85,
          rth_source: 'Analytical',
          confidence: entry.confidence ?? 'medium',
        },
        sensitivity: {
          reduction_pct: 20,
          original_rth_C_per_W: 0.5,
          modified_rth_C_per_W: 0.4,
          baseline_target_C: 103.4,
          modified_target_C: 96.6,
          target_improvement_C: 6.8,
          baseline_worst_margin_C: 13.2,
          modified_worst_margin_C: 20,
          margin_improvement_C: 6.8,
          affected_component_count: 6,
          affected_components: [],
          solve_status: 'SOLVED',
          energy_error_pct: 0.05,
          ...(entry.sensitivity ?? {}),
        },
        normalized: { delta_t: 1, sensitivity: 1, margin_impact: 1 },
        score: entry.score ?? 92,
        classification: entry.classification ?? 'Critical',
        confidence: entry.confidence ?? 'medium',
        recommendation: { title: 'x', zh: 'x', points: [] },
      }) as BottleneckResult,
  );

  return {
    schema_version: '1.0',
    project_id: 'TEST',
    network_id: 'Main Thermal Network',
    scenario_id: 'SCN_A',
    state: options.state ?? 'COMPLETE',
    settings: {} as BottleneckAnalysis['settings'],
    baseline_signature: options.signature ?? 'sig-1',
    analyzed_at: '2026-01-01T01:00:00.000Z',
    elapsed_ms: 10,
    results,
    rejected: [],
    issues: [],
    summary: {
      top_bottleneck: results[0]?.edge_label ?? null,
      top_score: results[0]?.score ?? null,
      worst_margin_C: 13.2,
      best_improvement_C: 6.8,
      analyzed_edges: results.length,
      failed_candidates: 0,
    },
  };
}

/** A three-node chain: junction → case → ambient. */
function chain(options: { limit?: number | null; temperature?: number } = {}) {
  const nodes = [
    node('N_J', {
      name: 'PA1 Junction',
      component: 'C1',
      power: 40,
      limit: options.limit === undefined ? 110 : (options.limit ?? undefined),
    }),
    node('N_C', { name: 'PA1 Case', component: 'C1' }),
    node('N_A', { name: 'Ambient', ambient: true }),
  ];
  const edges = [edge('E1', 'N_J', 'N_C'), edge('E2', 'N_C', 'N_A')];
  return {
    network: network(nodes, edges),
    solution: solution(
      { N_J: options.temperature ?? 96.8, N_C: 80, N_A: 55 },
      {
        edges: [
          { id: 'E1', from: 'N_J', to: 'N_C', q: 40 },
          { id: 'E2', from: 'N_C', to: 'N_A', q: 40 },
        ],
      },
    ),
  };
}

function overviewOf(options: {
  limit?: number | null;
  temperature?: number;
  components?: Component[];
  analysis?: BottleneckAnalysis | null;
  stale?: boolean;
  errorPct?: number;
  status?: ThermalSolution['status'];
}) {
  const built = chain({ limit: options.limit, temperature: options.temperature });
  const solved =
    options.errorPct != null || options.status != null
      ? {
          ...built.solution,
          status: options.status ?? built.solution.status,
          energy_balance: {
            ...built.solution.energy_balance,
            error_pct: options.errorPct ?? built.solution.energy_balance.error_pct,
          },
        }
      : built.solution;

  return buildResultsOverview({
    project_id: 'TEST',
    scenario,
    network: built.network,
    solution: solved,
    components: options.components ?? [component('C1', 'PA1', 110)],
    analysis: options.analysis ?? null,
    solution_stale: options.stale ?? false,
    now: '2026-02-01T00:00:00.000Z',
  }).overview;
}

// --- Test A — PASS (10 §34 A) ----------------------------------------------

describe('Test A — PASS (10 §34 A)', () => {
  it('reports PASS when every monitored margin clears the near-limit threshold', () => {
    const overview = overviewOf({
      limit: 150,
      temperature: 96.8,
      analysis: analysis({ results: [{ edge_id: 'E1', edge_label: 'PA1 Junction → PA1 Case' }] }),
    });

    expect(overview.overall_status).toBe('PASS');
    expect(overview.report_readiness).toBe('READY');
    expect(overview.critical_components[0].status).toBe('PASS');
    // Everything passes, but Screen 08 still ranked a Critical candidate, so the
    // recommendation points at it. PASS means "no margin is in trouble", not
    // "there is nothing worth improving" (10 §15).
    expect(overview.recommended.action).toBe('Review Bottleneck');
  });

  it('recommends nothing when the ranked candidate is not worth acting on', () => {
    const overview = overviewOf({
      limit: 150,
      analysis: analysis({
        results: [{ edge_id: 'E1', edge_label: 'A → B', score: 12, classification: 'Low' }],
      }),
    });

    expect(overview.overall_status).toBe('PASS');
    expect(overview.recommended.action).toBe('No Immediate Action');
    expect(overview.recommended.goto).toBeNull();
  });

  it('fills all six KPI cards from the sources the specification names', () => {
    const overview = overviewOf({
      limit: 150,
      analysis: analysis({ results: [{ edge_id: 'E1', edge_label: 'PA1 Junction → PA1 Case' }] }),
    });

    expect(overview.kpis.max_temperature_C).toBeCloseTo(96.8, 5);
    expect(overview.kpis.worst_margin_C).toBeCloseTo(53.2, 5);
    expect(overview.kpis.top_bottleneck).toBe('PA1 Junction → PA1 Case');
    expect(overview.kpis.energy_error_pct).toBeCloseTo(0.05, 5);
    expect(overview.kpis.total_power_W).toBeCloseTo(412.3, 5);
  });
});

// --- Test B — WARNING (10 §34 B) -------------------------------------------

describe('Test B — WARNING near limit (10 §34 B)', () => {
  it('classifies a +7 °C margin as NEAR LIMIT and the screen as WARNING', () => {
    // 103.8 against a 110.8 limit is a margin of exactly +7.
    const overview = overviewOf({
      limit: 103.8,
      temperature: 96.8,
      analysis: analysis({ results: [{ edge_id: 'E1', edge_label: 'A → B' }] }),
    });

    expect(overview.critical_components[0].margin_C).toBeCloseTo(7, 5);
    expect(overview.critical_components[0].status).toBe('NEAR LIMIT');
    expect(overview.overall_status).toBe('WARNING');
    expect(overview.recommended.action).toBe('Review Near-Limit Component');
  });

  it('reuses Screen 09 near-limit rule at exactly 10 °C', () => {
    expect(classifyComponent(10)).toBe('NEAR LIMIT');
    expect(classifyComponent(10.1)).toBe('PASS');
    expect(classifyComponent(0)).toBe('NEAR LIMIT');
    expect(classifyComponent(-0.1)).toBe('FAIL');
    expect(classifyComponent(undefined)).toBe('NO LIMIT');
  });
});

// --- Test C — FAIL (10 §34 C) ----------------------------------------------

describe('Test C — FAIL over limit (10 §34 C)', () => {
  it('reports FAIL for T=116 against a 110 limit', () => {
    const overview = overviewOf({
      limit: 110,
      temperature: 116,
      analysis: analysis({ results: [{ edge_id: 'E1', edge_label: 'A → B' }] }),
    });

    expect(overview.critical_components[0].margin_C).toBeCloseTo(-6, 5);
    expect(overview.critical_components[0].status).toBe('FAIL');
    expect(overview.overall_status).toBe('FAIL');
    expect(overview.recommended.action).toBe('Review Failed Component');
    // 10 §17 — a FAIL is a finding, not a blocked report. It can be reported.
    expect(overview.report_readiness).not.toBe('BLOCKED');
  });
});

// --- Test D — STALE (10 §34 D) ---------------------------------------------

describe('Test D — STALE (10 §34 D)', () => {
  it('outranks FAIL and blocks the report', () => {
    const overview = overviewOf({ limit: 110, temperature: 116, stale: true });

    expect(overview.overall_status).toBe('STALE');
    expect(overview.report_readiness).toBe('BLOCKED');
    expect(overview.recommended.action).toBe('Re-Solve Network');
    expect(overview.recommended.goto).toBe('07');
  });

  it('still names the failure among the reasons rather than hiding it', () => {
    const overview = overviewOf({ limit: 110, temperature: 116, stale: true });
    expect(overview.status_reasons.map((reason) => reason.code)).toContain('component_over_limit');
    expect(overview.status_reasons[0].code).toBe('solution_stale');
  });
});

// --- Test E — no Screen 08 (10 §34 E) --------------------------------------

describe('Test E — bottleneck analysis not run (10 §34 E)', () => {
  it('says Not Available and invents no ranking', () => {
    const overview = overviewOf({ limit: 150, analysis: null });

    expect(overview.bottleneck_availability).toBe('not_run');
    expect(overview.bottlenecks).toEqual([]);
    expect(overview.kpis.top_bottleneck).toBeNull();
    expect(overview.report_readiness).toBe('WARNING');
    expect(overview.recommended.action).toBe('Run Bottleneck Analysis');
  });

  it('never asserts an improvement Screen 08 did not calculate', () => {
    const overview = overviewOf({ limit: 150, analysis: null });
    const text = overview.action_summary.join(' ');
    expect(text).not.toMatch(/projected/i);
    expect(text).toMatch(/has not been run/i);
  });

  it('treats an analysis built on a different solve as stale, not current', () => {
    const built = chain({ limit: 150 });
    expect(bottleneckAvailabilityOf(analysis({ signature: 'other-sig' }), built.solution)).toBe(
      'stale',
    );
    expect(bottleneckAvailabilityOf(analysis({ state: 'FAILED' }), built.solution)).toBe('failed');
    expect(bottleneckAvailabilityOf(null, built.solution)).toBe('not_run');
  });
});

// --- Test F — analytical only (10 §34 F) -----------------------------------

describe('Test F — analytical-only (10 §34 F)', () => {
  it('keeps FloTHERM at zero and Deferred without failing the screen', () => {
    const overview = overviewOf({
      limit: 150,
      analysis: analysis({ results: [{ edge_id: 'E1', edge_label: 'A → B' }] }),
    });

    expect(overview.result_mode).toBe('Analytical');
    expect(overview.completeness.rth_source_counts.FloTHERM).toBe(0);
    expect(overview.completeness.external_cfd_validation).toBe('Deferred');
    expect(overview.completeness.data_confidence).toBe('Analytical-only');
    expect(overview.overall_status).toBe('PASS');
  });

  it('maps every DataSource into a bucket rather than dropping edges', () => {
    expect(rthBucketOf('Analytical')).toBe('Analytical');
    expect(rthBucketOf('Manual')).toBe('Manual');
    expect(rthBucketOf('Measurement')).toBe('Measurement');
    expect(rthBucketOf('FloTHERM')).toBe('FloTHERM');
    expect(rthBucketOf('Datasheet')).toBe('Other');
    expect(rthBucketOf('Assumed')).toBe('Other');
  });
});

// --- status priority (10 §4, AC-10-03) -------------------------------------

describe('Overall status priority (10 §4)', () => {
  const base = {
    solution_stale: false,
    solver_status: 'SOLVED' as const,
    energy_grade: 'green' as const,
    component_statuses: [] as CriticalComponentSummary['status'][],
    solver_warning_count: 0,
    components_without_limits: 0,
    monitored_node_count: 3,
    bottleneck_available: true,
    distribution_available: true,
    low_confidence_critical_edges: 0,
  };

  it('picks STALE over FAIL, INCOMPLETE and WARNING together', () => {
    expect(
      evaluateOverallStatus({
        ...base,
        solution_stale: true,
        component_statuses: ['FAIL', 'NEAR LIMIT'],
        components_without_limits: 2,
      }).status,
    ).toBe('STALE');
  });

  it('picks FAIL over INCOMPLETE', () => {
    expect(
      evaluateOverallStatus({
        ...base,
        component_statuses: ['FAIL'],
        components_without_limits: 2,
      }).status,
    ).toBe('FAIL');
  });

  it('picks INCOMPLETE over WARNING', () => {
    expect(
      evaluateOverallStatus({
        ...base,
        component_statuses: ['NEAR LIMIT'],
        components_without_limits: 1,
      }).status,
    ).toBe('INCOMPLETE');
  });

  it('is PASS only when nothing at all fires', () => {
    expect(evaluateOverallStatus({ ...base, component_statuses: ['PASS'] }).status).toBe('PASS');
    expect(
      evaluateOverallStatus({ ...base, component_statuses: ['PASS'], bottleneck_available: false })
        .status,
    ).toBe('WARNING');
  });

  it('treats a total absence of limits as INCOMPLETE, never PASS', () => {
    expect(
      evaluateOverallStatus({ ...base, monitored_node_count: 0, component_statuses: ['NO LIMIT'] })
        .status,
    ).toBe('INCOMPLETE');
  });
});

// --- critical components (10 §8) -------------------------------------------

describe('Critical components (10 §8)', () => {
  it('shows the minimum-margin node when a component has several', () => {
    const rows = [
      {
        node_id: 'N1',
        node_name: 'FPGA Junction',
        component_id: 'C1',
        component_name: 'FPGA',
        node_type: 'junction' as const,
        temperature_C: 96.8,
        limit_C: 110,
        limit_type: 'Tj' as const,
        margin_C: 13.2,
        status: 'within_limit' as const,
        is_heat_source: true,
        is_boundary: false,
        result_source: 'analytical' as const,
        scenario_id: 'SCN_A',
      },
      {
        node_id: 'N2',
        node_name: 'FPGA Case',
        component_id: 'C1',
        component_name: 'FPGA',
        node_type: 'case' as const,
        temperature_C: 92,
        limit_C: 95,
        limit_type: 'Tc' as const,
        margin_C: 3,
        status: 'near_limit' as const,
        is_heat_source: false,
        is_boundary: false,
        result_source: 'analytical' as const,
        scenario_id: 'SCN_A',
      },
    ];

    const summaries = buildCriticalComponents(rows);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].node_name).toBe('FPGA Case');
    expect(summaries[0].margin_C).toBe(3);
    expect(summaries[0].monitored_node_count).toBe(2);
  });

  it('sorts limitless components last instead of calling them safe', () => {
    const rows: CriticalComponentSummary[] = [
      {
        component_name: 'No limit',
        node_id: 'N3',
        node_name: 'N3',
        temperature_C: 120,
        status: 'NO LIMIT',
        monitored_node_count: 0,
      },
      {
        component_name: 'Tight',
        node_id: 'N1',
        node_name: 'N1',
        temperature_C: 96,
        margin_C: 4,
        status: 'NEAR LIMIT',
        monitored_node_count: 1,
      },
      {
        component_name: 'Loose',
        node_id: 'N2',
        node_name: 'N2',
        temperature_C: 60,
        margin_C: 40,
        status: 'PASS',
        monitored_node_count: 1,
      },
    ];

    expect(sortByMargin(rows).map((row) => row.component_name)).toEqual([
      'Tight',
      'Loose',
      'No limit',
    ]);
  });
});

// --- readiness and report readiness (10 §16, §17) --------------------------

describe('Readiness (10 §16, §17)', () => {
  const solver: SolverQualitySummary = {
    status: 'SOLVED',
    solved_nodes: 3,
    solved_edges: 2,
    generated_W: 412.3,
    rejected_W: 412.1,
    residual_W: 0.2,
    energy_error_pct: 0.05,
    quality: 'green',
    solved_at: '2026-01-01T00:00:00.000Z',
  };

  const completeness = {
    components_with_limits: 15,
    components_without_limits: 0,
    rth_source_counts: { Analytical: 31, Manual: 16, Measurement: 0, FloTHERM: 0, Other: 0 },
    low_confidence_critical_edges: 0,
    external_cfd_validation: 'Deferred' as const,
    data_confidence: 'Analytical-only' as const,
  };

  it('is READY when every item is ready', () => {
    const checks = buildReadiness({
      solution_stale: false,
      solver,
      bottleneck_availability: 'current',
      distribution_available: true,
      completeness,
      monitored_node_count: 3,
    });
    expect(checks).toHaveLength(6);
    expect(checks.every((check) => check.state === 'READY')).toBe(true);
    expect(evaluateReportReadiness(checks).readiness).toBe('READY');
  });

  it('matches the audit note: missing limits plus low confidence gives WARNING', () => {
    const checks = buildReadiness({
      solution_stale: false,
      solver,
      bottleneck_availability: 'current',
      distribution_available: true,
      completeness: {
        ...completeness,
        components_without_limits: 3,
        low_confidence_critical_edges: 2,
      },
      monitored_node_count: 3,
    });

    const outcome = evaluateReportReadiness(checks);
    expect(outcome.readiness).toBe('WARNING');
    expect(outcome.reasons.join(' ')).toMatch(/3 component\(s\) are missing a thermal limit/);
    expect(outcome.reasons.join(' ')).toMatch(/2 critical edge\(s\)/);
  });

  it('blocks only on the solver result itself', () => {
    const stale = buildReadiness({
      solution_stale: true,
      solver,
      bottleneck_availability: 'current',
      distribution_available: true,
      completeness,
      monitored_node_count: 3,
    });
    expect(evaluateReportReadiness(stale).readiness).toBe('BLOCKED');

    const noBottleneck = buildReadiness({
      solution_stale: false,
      solver,
      bottleneck_availability: 'not_run',
      distribution_available: true,
      completeness,
      monitored_node_count: 3,
    });
    expect(evaluateReportReadiness(noBottleneck).readiness).toBe('WARNING');
  });
});

// --- data completeness (10 §12) --------------------------------------------

describe('Data completeness (10 §12)', () => {
  it('counts components with and without limits from the component records', () => {
    const overview = overviewOf({
      limit: 150,
      components: [
        component('C1', 'PA1', 110),
        component('C2', 'FPGA', null),
        component('C3', 'DDR', null),
      ],
    });

    expect(overview.completeness.components_with_limits).toBe(1);
    expect(overview.completeness.components_without_limits).toBe(2);
    // Missing limits mean the judgement does not cover everything (10 §4).
    expect(overview.overall_status).toBe('INCOMPLETE');
  });

  it('counts a node-level limit as coverage even when the record has none', () => {
    // Screen 05 can carry a limit on the node while the Screen 04 record has
    // none. The judgement is made against that limit, so the component is
    // covered — reporting it as uncovered would contradict the margin shown in
    // the Critical Components table.
    const overview = overviewOf({
      limit: 150,
      components: [component('C1', 'PA1', null)],
    });

    expect(overview.completeness.components_with_limits).toBe(1);
    expect(overview.completeness.components_without_limits).toBe(0);
    expect(overview.critical_components[0].margin_C).toBeCloseTo(53.2, 5);
  });

  it('counts every enabled edge into an Rth bucket', () => {
    const overview = overviewOf({ limit: 150 });
    const counts = overview.completeness.rth_source_counts;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(2);
    expect(counts.Analytical).toBe(2);
  });

  it('counts a low-confidence edge on the critical path', () => {
    const nodes = [
      node('N_J', { name: 'PA1 Junction', component: 'C1', power: 40, limit: 150 }),
      node('N_C', { name: 'PA1 Case', component: 'C1' }),
      node('N_A', { name: 'Ambient', ambient: true }),
    ];
    const edges = [edge('E1', 'N_J', 'N_C', { confidence: 'low' }), edge('E2', 'N_C', 'N_A')];
    const built = buildResultsOverview({
      project_id: 'TEST',
      scenario,
      network: network(nodes, edges),
      solution: solution(
        { N_J: 96.8, N_C: 80, N_A: 55 },
        {
          edges: [
            { id: 'E1', from: 'N_J', to: 'N_C', q: 40 },
            { id: 'E2', from: 'N_C', to: 'N_A', q: 40 },
          ],
        },
      ),
      components: [component('C1', 'PA1', 150)],
      analysis: null,
      solution_stale: false,
      now: '2026-02-01T00:00:00.000Z',
    });

    expect(built.critical_path.edge_ids).toEqual(['E1', 'E2']);
    expect(built.overview.completeness.low_confidence_critical_edges).toBe(1);
  });
});

// --- distribution summary (10 §10) -----------------------------------------

describe('Distribution summary (10 §10)', () => {
  it('reads min / average / P95 / max and the row count from the Screen 09 dataset', () => {
    const overview = overviewOf({ limit: 150 });
    const distribution = overview.distribution;
    expect(distribution).not.toBeNull();
    expect(distribution?.row_count).toBe(3);
    expect(distribution?.min_C).toBeCloseTo(55, 5);
    expect(distribution?.max_C).toBeCloseTo(96.8, 5);
    // 96.8 is the only node above the 90 °C warning threshold.
    expect(distribution?.nodes_above_warning).toBe(1);
    expect(distribution?.warning_threshold_C).toBe(90);
  });
});

// --- snapshot (10 §18, §19) ------------------------------------------------

describe('Report snapshot (10 §18, §19)', () => {
  it('freezes the summary and never claims to produce a document', () => {
    const overview = overviewOf({ limit: 150 });
    const snapshot = buildSnapshot(overview, { now: '2026-02-01T00:00:00.000Z' });

    expect(snapshot.produces_document).toBe(false);
    expect(snapshot.scenario_id).toBe('SCN_A');
    expect(snapshot.overall_status).toBe(overview.overall_status);
    expect(snapshot.source_signature).toBe(overview.source_signature);
    expect(isSnapshotCurrent(snapshot, overview)).toBe(true);
  });

  it('goes stale when a temperature moves', () => {
    const before = overviewOf({ limit: 150, temperature: 96.8 });
    const snapshot = buildSnapshot(before, { now: '2026-02-01T00:00:00.000Z' });
    const after = overviewOf({ limit: 150, temperature: 99.1 });

    expect(after.source_signature).not.toBe(before.source_signature);
    expect(isSnapshotCurrent(snapshot, after)).toBe(false);
  });

  it('goes stale when a thermal limit moves', () => {
    const before = overviewOf({ limit: 150 });
    const snapshot = buildSnapshot(before, { now: '2026-02-01T00:00:00.000Z' });
    const after = overviewOf({ limit: 120 });
    expect(isSnapshotCurrent(snapshot, after)).toBe(false);
  });

  it('goes stale when Screen 08 results arrive', () => {
    const before = overviewOf({ limit: 150, analysis: null });
    const snapshot = buildSnapshot(before, { now: '2026-02-01T00:00:00.000Z' });
    const after = overviewOf({
      limit: 150,
      analysis: analysis({ results: [{ edge_id: 'E1', edge_label: 'A → B' }] }),
    });
    expect(isSnapshotCurrent(snapshot, after)).toBe(false);
  });

  it('goes stale the moment the solution is superseded, even byte-identical', () => {
    // A boundary or power change leaves the STORED solution untouched — its own
    // input signature was fingerprinted at solve time — so staleness has to be
    // part of the overview signature or the snapshot would claim to be current.
    const before = overviewOf({ limit: 150 });
    const snapshot = buildSnapshot(before, { now: '2026-02-01T00:00:00.000Z' });
    const after = overviewOf({ limit: 150, stale: true });

    expect(after.source_signature).not.toBe(before.source_signature);
    expect(isSnapshotCurrent(snapshot, after)).toBe(false);
  });

  it('survives merely re-opening the screen', () => {
    const first = overviewOf({ limit: 150 });
    const snapshot = buildSnapshot(first, { now: '2026-02-01T00:00:00.000Z' });
    // A second build a minute later with identical inputs must not invalidate it.
    const second = overviewOf({ limit: 150 });
    expect(isSnapshotCurrent(snapshot, second)).toBe(true);
  });
});

// --- energy thresholds (10 §11, AC-10-13) ----------------------------------

describe('Solver / energy quality (10 §11)', () => {
  it('uses the Screen 07 bands, not a second set', () => {
    expect(overviewOf({ limit: 150, errorPct: 0.4 }).solver_quality.quality).toBe('green');
    expect(overviewOf({ limit: 150, errorPct: 1.2 }).solver_quality.quality).toBe('warning');
    expect(overviewOf({ limit: 150, errorPct: 3 }).solver_quality.quality).toBe('error');
  });

  it('turns an unacceptable energy error into FAIL', () => {
    expect(overviewOf({ limit: 150, errorPct: 3 }).overall_status).toBe('FAIL');
  });
});
