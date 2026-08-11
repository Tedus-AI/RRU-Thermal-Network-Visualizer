/**
 * Screen 08 analysis tests — 08 §1–§5, §12, §13, §21, §22, §24.
 *
 * The headline test is `bottleneck is not the largest Rth`: a network is built
 * where the biggest resistance carries almost no heat, and the analysis is
 * required to rank the small shared resistance above it.
 */

import { describe, expect, it } from 'vitest';

import { createRth } from '../rth';
import {
  DEFAULT_SOLVER_SETTINGS,
  type ThermalEdge,
  type ThermalNetwork,
  type ThermalNode,
} from '../types';
import { createBoundarySet } from '../boundary/types';
import { deriveBoundaryPorts } from '../boundary/boundaryPorts';
import { solveScenario } from '../solver/solveScenario';

import { runAnalysis, AnalysisCancelled, type AnalysisInput } from './bottleneckScore';
import { selectCandidates } from './candidateSelector';
import { normalizeAgainstMax, normalizeMagnitude } from './normalization';
import { analysisKey, isAnalysisCurrent } from './analysisCache';
import { worstComponentTemperature, worstThermalMargin } from './affectedComponents';
import {
  SCORE_WEIGHTS,
  classify,
  defaultSettings,
  type AnalysisSettings,
} from './analysisTypes';

// --- builders --------------------------------------------------------------

function node(
  id: string,
  options: {
    power?: number;
    type?: ThermalNode['type'];
    ambient?: boolean;
    component?: string;
    limit?: number;
  } = {},
): ThermalNode {
  return {
    id,
    name: id,
    type: options.type ?? (options.ambient ? 'ambient' : 'custom'),
    power_W: options.power ?? 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    boundary_role: options.ambient ? 'placeholder' : undefined,
    component_ref: options.component,
    limit_C: options.limit ?? null,
    limit_type: options.limit == null ? null : 'Tj',
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  R: number | null,
  overrides: Partial<ThermalEdge> = {},
): ThermalEdge {
  return {
    id,
    from,
    to,
    type: 'conduction',
    method: 'direct_rth',
    rth: createRth(R, 'Analytical', 'high'),
    heat_flow_W: null,
    delta_T_C: null,
    resolution: R == null ? 'unresolved' : 'resolved',
    enabled: true,
    ...overrides,
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

/** Solve with Screen 07, then hand the result to Screen 08. */
function analysisInputFor(
  net: ThermalNetwork,
  settings: Partial<AnalysisSettings> = {},
  ambient_C = 20,
): AnalysisInput {
  const scenarioId = 'SCN_A';
  const boundarySet = createBoundarySet({
    projectId: 'TEST',
    networkId: 'Main Thermal Network',
    scenarioId,
    topologyVersion: 1,
    ambient_C,
  });
  const ports = deriveBoundaryPorts(net);
  const outcome = solveScenario({ network: net, boundarySet, ports, scenarioId });

  return {
    project_id: 'TEST',
    network_id: 'Main Thermal Network',
    scenario_id: scenarioId,
    network: net,
    baselineInput: outcome.input,
    baselineSolution: outcome.solution,
    settings: { ...defaultSettings(), ...settings },
    solverSettings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

// --- Core physics rule (08 §1) ---------------------------------------------

describe('Bottleneck is not the largest Rth (08 §1, §33)', () => {
  /**
   * SHARED carries the heat of both sources; STARVED has a resistance ten times
   * larger but sits on a branch carrying almost nothing. Ranking by Rth would
   * put STARVED first, which is the mistake the whole screen exists to avoid.
   */
  const net = network(
    [
      node('SRC_A', { power: 100, component: 'CMP_A', limit: 110 }),
      node('SRC_B', { power: 100, component: 'CMP_B', limit: 110 }),
      node('TINY', { power: 0.05, component: 'CMP_TINY', limit: 125 }),
      node('BASE', { type: 'main_base' }),
      node('AMB', { ambient: true }),
    ],
    [
      edge('E_A', 'SRC_A', 'BASE', 0.05),
      edge('E_B', 'SRC_B', 'BASE', 0.05),
      // 10× the resistance, but almost no heat goes through it.
      edge('E_STARVED', 'TINY', 'BASE', 0.5),
      edge('E_SHARED', 'BASE', 'AMB', 0.05, { type: 'spreading' }),
    ],
  );

  it('ranks the shared low-Rth segment above the starved high-Rth one', async () => {
    const analysis = await runAnalysis(analysisInputFor(net));
    const shared = analysis.results.find((entry) => entry.edge_id === 'E_SHARED');
    const starved = analysis.results.find((entry) => entry.edge_id === 'E_STARVED');

    expect(shared).toBeDefined();
    expect(starved).toBeDefined();
    // The larger resistance is genuinely larger …
    expect(starved!.baseline.rth_C_per_W).toBeGreaterThan(shared!.baseline.rth_C_per_W);
    // … and still ranks below it.
    expect(shared!.rank).toBeLessThan(starved!.rank);
    expect(shared!.score).toBeGreaterThan(starved!.score);
    expect(analysis.summary.top_bottleneck).toBe('BASE → AMB');
  });

  it('reports Rth as context on every row without ranking by it', async () => {
    const analysis = await runAnalysis(analysisInputFor(net));
    for (const result of analysis.results) {
      expect(result.baseline.rth_C_per_W).toBeGreaterThan(0);
    }
    const byRth = [...analysis.results].sort((a, b) => b.baseline.rth_C_per_W - a.baseline.rth_C_per_W);
    const byScore = [...analysis.results].sort((a, b) => b.score - a.score);
    expect(byRth[0].edge_id).not.toBe(byScore[0].edge_id);
  });
});

// --- Full-network re-solve (08 §2, §13) ------------------------------------

describe('Full-network sensitivity re-solve (08 §2, §13)', () => {
  /**
   * Two parallel legs from a shared base. Improving one leg pulls heat towards
   * it, so the OTHER leg's heat flow changes too. A local estimate that reused
   * baseline Q could not see that.
   */
  const net = network(
    [
      node('SRC', { power: 100, component: 'CMP', limit: 110 }),
      node('LEFT'),
      node('RIGHT'),
      node('AMB', { ambient: true }),
    ],
    [
      edge('E_IN', 'SRC', 'LEFT', 0.1),
      edge('E_CROSS', 'SRC', 'RIGHT', 0.4),
      edge('E_L_AMB', 'LEFT', 'AMB', 0.2),
      edge('E_R_AMB', 'RIGHT', 'AMB', 0.2),
    ],
  );

  it('redistributes heat flow instead of reusing baseline Q', async () => {
    const input = analysisInputFor(net);
    const baselineLeft = input.baselineSolution.edge_results.E_IN.heat_flow_W;
    const baselineCross = input.baselineSolution.edge_results.E_CROSS.heat_flow_W;

    const analysis = await runAnalysis(input);
    const left = analysis.results.find((entry) => entry.edge_id === 'E_IN');
    expect(left).toBeDefined();

    // A local estimate would predict exactly this improvement:
    const naive = baselineLeft * left!.baseline.rth_C_per_W * 0.2;
    // The real re-solve gives a different number because Q moved.
    expect(Math.abs(left!.sensitivity.target_improvement_C - naive)).toBeGreaterThan(1e-6);

    // And the parallel leg's own baseline flow is unchanged in the record —
    // the analysis re-solved, it did not overwrite the baseline.
    expect(input.baselineSolution.edge_results.E_CROSS.heat_flow_W).toBe(baselineCross);
  });

  it('improves the target and records both the original and modified Rth', async () => {
    const analysis = await runAnalysis(analysisInputFor(net));
    const entry = analysis.results[0];
    expect(entry.sensitivity.reduction_pct).toBe(20);
    expect(entry.sensitivity.modified_rth_C_per_W).toBeCloseTo(
      entry.sensitivity.original_rth_C_per_W * 0.8,
      12,
    );
    expect(entry.sensitivity.target_improvement_C).toBeGreaterThan(0);
    expect(entry.sensitivity.modified_target_C).toBeLessThan(entry.sensitivity.baseline_target_C!);
  });
});

// --- Baseline preservation (08 §22) ----------------------------------------

describe('Baseline preservation (08 §22)', () => {
  const net = network(
    [
      node('SRC', { power: 50, component: 'CMP', limit: 110 }),
      node('MID'),
      node('AMB', { ambient: true }),
    ],
    [edge('E1', 'SRC', 'MID', 0.3), edge('E2', 'MID', 'AMB', 0.2)],
  );

  it('never mutates the stored network or the Screen 07 solution', async () => {
    const input = analysisInputFor(net);
    const networkBefore = JSON.stringify(net);
    const solutionBefore = JSON.stringify(input.baselineSolution);
    const inputNetworkBefore = JSON.stringify(input.baselineInput.network);

    await runAnalysis(input);

    expect(JSON.stringify(net)).toBe(networkBefore);
    expect(JSON.stringify(input.baselineSolution)).toBe(solutionBefore);
    expect(JSON.stringify(input.baselineInput.network)).toBe(inputNetworkBefore);
  });

  it('leaves no scenario override behind on the stored topology', async () => {
    await runAnalysis(analysisInputFor(net));
    for (const stored of Object.values(net.edges)) {
      expect(stored.scenario_overrides).toBeUndefined();
    }
  });
});

// --- Metrics (08 §3, §12) ---------------------------------------------------

describe('Metrics (08 §3, §12)', () => {
  const net = network(
    [
      node('HOT', { power: 60, component: 'CMP_HOT', limit: 100 }),
      node('WARM', { power: 20, component: 'CMP_WARM', limit: 150 }),
      node('BASE', { type: 'main_base' }),
      node('AMB', { ambient: true }),
    ],
    [
      edge('E_HOT', 'HOT', 'BASE', 0.4),
      edge('E_WARM', 'WARM', 'BASE', 0.4),
      edge('E_BASE', 'BASE', 'AMB', 0.2, { type: 'spreading' }),
    ],
  );

  it('computes worst component temperature and worst margin from the solve', () => {
    const input = analysisInputFor(net);
    const temps = input.baselineSolution.node_temperatures_C;
    expect(worstComponentTemperature(net, temps).node_id).toBe('HOT');
    // CMP_HOT has the tighter limit and the higher temperature.
    expect(worstThermalMargin(net, temps).node_id).toBe('HOT');
  });

  it('counts affected components and lists their before / after temperatures', async () => {
    const analysis = await runAnalysis(analysisInputFor(net));
    const shared = analysis.results.find((entry) => entry.edge_id === 'E_BASE');
    expect(shared).toBeDefined();
    // The shared segment cools both components at once.
    expect(shared!.sensitivity.affected_component_count).toBe(2);
    for (const component of shared!.sensitivity.affected_components) {
      expect(component.modified_C).toBeLessThan(component.baseline_C);
      expect(component.improvement_C).toBeGreaterThan(0);
      expect(component.baseline_margin_C).not.toBeNull();
    }
  });

  it('improves the margin when the target metric is the worst margin', async () => {
    const analysis = await runAnalysis(
      analysisInputFor(net, { target_metric: 'worst_thermal_margin' }),
    );
    const top = analysis.results[0];
    expect(top.sensitivity.target_improvement_C).toBeGreaterThan(0);
    expect(top.sensitivity.modified_worst_margin_C).toBeGreaterThan(
      top.sensitivity.baseline_worst_margin_C!,
    );
  });
});

// --- Scoring (08 §4) --------------------------------------------------------

describe('Composite score (08 §4)', () => {
  const net = network(
    [
      node('SRC', { power: 80, component: 'CMP', limit: 110 }),
      node('MID'),
      node('AMB', { ambient: true }),
    ],
    [edge('E1', 'SRC', 'MID', 0.5), edge('E2', 'MID', 'AMB', 0.2)],
  );

  it('uses the 35 / 45 / 20 weights and a 0–100 range', async () => {
    const analysis = await runAnalysis(analysisInputFor(net));
    expect(SCORE_WEIGHTS).toEqual({ delta_t: 0.35, sensitivity: 0.45, margin_impact: 0.2 });

    for (const result of analysis.results) {
      const expected = Math.round(
        100 *
          (0.35 * result.normalized.delta_t +
            0.45 * result.normalized.sensitivity +
            0.2 * result.normalized.margin_impact),
      );
      expect(result.score).toBe(expected);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.classification).toBe(classify(result.score));
    }
  });

  it('classifies by the documented thresholds', () => {
    expect(classify(92)).toBe('Critical');
    expect(classify(80)).toBe('Critical');
    expect(classify(79)).toBe('High');
    expect(classify(60)).toBe('High');
    expect(classify(59)).toBe('Medium');
    expect(classify(35)).toBe('Medium');
    expect(classify(34)).toBe('Low');
    expect(classify(0)).toBe('Low');
  });

  it('ranks by score, descending, with rank 1 first', async () => {
    const analysis = await runAnalysis(analysisInputFor(net));
    expect(analysis.results[0].rank).toBe(1);
    for (let index = 1; index < analysis.results.length; index++) {
      expect(analysis.results[index - 1].score).toBeGreaterThanOrEqual(analysis.results[index].score);
      expect(analysis.results[index].rank).toBe(index + 1);
    }
  });
});

// --- Normalisation ----------------------------------------------------------

describe('Normalisation (08 §4)', () => {
  it('scales against the batch maximum', () => {
    expect(normalizeAgainstMax([2, 1, 0])).toEqual([1, 0.5, 0]);
  });

  it('treats a change in the wrong direction as no evidence, not negative', () => {
    expect(normalizeAgainstMax([4, -2])).toEqual([1, 0]);
  });

  it('gives every candidate 0 when nothing helps, instead of dividing by zero', () => {
    expect(normalizeAgainstMax([0, 0, -1])).toEqual([0, 0, 0]);
    expect(normalizeAgainstMax([]).length).toBe(0);
  });

  it('uses magnitude for signed quantities such as edge ΔT', () => {
    expect(normalizeMagnitude([-10, 5])).toEqual([1, 0.5]);
  });
});

// --- Candidate eligibility (08 §5) -----------------------------------------

describe('Candidate eligibility (08 §5)', () => {
  // The ideal link sits IN SERIES. In parallel it would short out the edge
  // beside it, and that edge would then be rejected for carrying no heat —
  // correct behaviour, but not what this test is about.
  const net = network(
    [
      node('SRC', { power: 50, component: 'CMP', limit: 110 }),
      node('JOINT'),
      node('MID'),
      node('AMB', { ambient: true }),
    ],
    [
      edge('E_IDEAL', 'SRC', 'JOINT', 1e-9),
      edge('E_OK', 'JOINT', 'MID', 0.3),
      edge('E_AMB', 'MID', 'AMB', 0.2),
      edge('E_OFF', 'SRC', 'MID', 0.9, { enabled: false }),
    ],
  );

  it('excludes disabled and ideal links, with the reason recorded', () => {
    const input = analysisInputFor(net);
    const { candidates, rejected } = selectCandidates({
      network: net,
      solution: input.baselineSolution,
      scenarioId: 'SCN_A',
      scope: 'all_edges',
      filters: defaultSettings().filters,
      targetNodeId: null,
      customEdgeIds: [],
    });

    const ids = candidates.map((entry) => entry.edge.id);
    expect(ids).toContain('E_OK');
    expect(ids).not.toContain('E_OFF');
    expect(ids).not.toContain('E_IDEAL');
    expect(rejected.find((entry) => entry.edge_id === 'E_OFF')?.reason).toBe('disabled');
    expect(rejected.find((entry) => entry.edge_id === 'E_IDEAL')?.reason).toBe('ideal_link');
  });

  it('narrows to the boundary path when that scope is chosen', async () => {
    const boundaryNet = network(
      [
        node('SRC', { power: 50, component: 'CMP', limit: 110 }),
        node('FIN', { type: 'fin_surface' }),
        node('AMB', { ambient: true }),
      ],
      [
        edge('E_SRC_FIN', 'SRC', 'FIN', 0.3),
        edge('E_BOUNDARY', 'FIN', 'AMB', 0.2, { type: 'convection', method: 'convection_hA' }),
      ],
    );
    const input = analysisInputFor(boundaryNet, { scope: 'boundary_path' });
    const analysis = await runAnalysis(input);
    expect(analysis.results.map((entry) => entry.edge_id)).toEqual(['E_BOUNDARY']);
  });

  it('reports an error, not an empty ranking, when nothing is eligible', async () => {
    const analysis = await runAnalysis(
      analysisInputFor(net, { scope: 'custom_selection', custom_edge_ids: [] }),
    );
    expect(analysis.results).toHaveLength(0);
    expect(analysis.state).toBe('FAILED');
    expect(analysis.issues.map((entry) => entry.code)).toContain('no_candidates');
  });
});

// --- Failure isolation (08 §21) --------------------------------------------

describe('Failure isolation and warnings (08 §21)', () => {
  it('keeps ranking the rest when one candidate carries a low-confidence value', async () => {
    const net = network(
      [
        node('SRC', { power: 50, component: 'CMP', limit: 110 }),
        node('MID'),
        node('AMB', { ambient: true }),
      ],
      [
        edge('E1', 'SRC', 'MID', 0.3, { rth: createRth(0.3, 'Analytical', 'low') }),
        edge('E2', 'MID', 'AMB', 0.2),
      ],
    );
    const analysis = await runAnalysis(analysisInputFor(net));
    expect(analysis.results).toHaveLength(2);
    expect(analysis.state).toBe('WARNING');
    expect(analysis.issues.map((entry) => entry.code)).toContain('low_confidence_candidate');
    const low = analysis.results.find((entry) => entry.edge_id === 'E1');
    expect(low?.confidence).toBe('low');
  });
});

// --- Cancel (08 §27) --------------------------------------------------------

describe('Cancel (08 §27)', () => {
  it('throws AnalysisCancelled and leaves the baseline intact', async () => {
    const net = network(
      [
        node('SRC', { power: 50, component: 'CMP', limit: 110 }),
        node('MID'),
        node('AMB', { ambient: true }),
      ],
      [edge('E1', 'SRC', 'MID', 0.3), edge('E2', 'MID', 'AMB', 0.2)],
    );
    const input = analysisInputFor(net);
    const before = JSON.stringify(input.baselineSolution);

    await expect(runAnalysis(input, { shouldCancel: () => true })).rejects.toBeInstanceOf(
      AnalysisCancelled,
    );
    expect(JSON.stringify(input.baselineSolution)).toBe(before);
  });

  it('reports progress for every candidate', async () => {
    const net = network(
      [
        node('SRC', { power: 50, component: 'CMP', limit: 110 }),
        node('MID'),
        node('AMB', { ambient: true }),
      ],
      [edge('E1', 'SRC', 'MID', 0.3), edge('E2', 'MID', 'AMB', 0.2)],
    );
    const seen: Array<[number, number]> = [];
    const analysis = await runAnalysis(analysisInputFor(net), {
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([
      [1, analysis.results.length],
      [2, analysis.results.length],
    ]);
  });
});

// --- Cache / dirty (08 §14) -------------------------------------------------

describe('Analysis freshness (08 §14)', () => {
  it('goes stale when the reduction, scope or target metric changes', async () => {
    const net = network(
      [
        node('SRC', { power: 50, component: 'CMP', limit: 110 }),
        node('MID'),
        node('AMB', { ambient: true }),
      ],
      [edge('E1', 'SRC', 'MID', 0.3), edge('E2', 'MID', 'AMB', 0.2)],
    );
    const input = analysisInputFor(net);
    const analysis = await runAnalysis(input);
    const signature = input.baselineSolution.metadata.input_signature;

    expect(isAnalysisCurrent(analysis, signature, input.settings)).toBe(true);
    expect(isAnalysisCurrent(analysis, signature, { ...input.settings, reduction_pct: 30 })).toBe(false);
    expect(isAnalysisCurrent(analysis, signature, { ...input.settings, scope: 'boundary_path' })).toBe(false);
    expect(
      isAnalysisCurrent(analysis, signature, { ...input.settings, target_metric: 'worst_thermal_margin' }),
    ).toBe(false);
    // A different 07 baseline invalidates it too.
    expect(isAnalysisCurrent(analysis, 'other-signature', input.settings)).toBe(false);
  });

  it('keys on the filters as well', () => {
    const settings = defaultSettings();
    const narrowed = { ...settings, filters: { ...settings.filters, edge_type: 'tim' } };
    expect(analysisKey('sig', settings)).not.toBe(analysisKey('sig', narrowed));
  });
});

// --- Reduction percentage ---------------------------------------------------

describe('Rth reduction (08 §10)', () => {
  const net = network(
    [
      node('SRC', { power: 80, component: 'CMP', limit: 110 }),
      node('MID'),
      node('AMB', { ambient: true }),
    ],
    [edge('E1', 'SRC', 'MID', 0.5), edge('E2', 'MID', 'AMB', 0.2)],
  );

  it('gives a bigger improvement at a bigger reduction', async () => {
    const small = await runAnalysis(analysisInputFor(net, { reduction_pct: 10 }));
    const large = await runAnalysis(analysisInputFor(net, { reduction_pct: 40 }));

    const at = (analysis: Awaited<ReturnType<typeof runAnalysis>>, id: string) =>
      analysis.results.find((entry) => entry.edge_id === id)!.sensitivity.target_improvement_C;

    expect(at(large, 'E1')).toBeGreaterThan(at(small, 'E1'));
    // 0.5 °C/W × 80 W, reduced 40 %: the source cools by 0.5 × 0.4 × 80 = 16 °C.
    expect(at(large, 'E1')).toBeCloseTo(16, 6);
    expect(at(small, 'E1')).toBeCloseTo(4, 6);
  });
});
