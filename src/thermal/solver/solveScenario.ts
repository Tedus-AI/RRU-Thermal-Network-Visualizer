/**
 * Screen 07's solve entry point — 07 §1, §14, §15, §18, §40.
 *
 * Pipeline: build the solve input (05 topology + 06 scenario boundary), run the
 * pre-solve checks, solve, back-calculate every edge, check the energy balance,
 * and package the whole thing as one `ThermalSolution`.
 *
 * A note on 07 §54's recommended module list. `assembleMatrix`,
 * `solveLinearSystem`, `backCalculate` and `energyBalance` already exist, fully
 * tested, inside `src/thermal/networkSolver.ts` — they were built with the
 * architecture in 00 §12 and are what Screens 01 and 05 already report against.
 * Splitting that working core into four new files would duplicate it rather
 * than improve it, so this module composes it instead. The separation the
 * specification actually asks for is honoured: the numeric core knows nothing
 * about React, scenarios or boundary sets.
 *
 * Rule 4 (07 §43): heat flow is computed as Q = ΔT / R where R for that segment
 * is KNOWN. Nothing here runs that division backwards to invent a resistance
 * from a temperature drop and a component's total power.
 */

import { solveNetwork } from '../networkSolver';
import { edgeResistance } from '../rth';
import { DEFAULT_SOLVER_SETTINGS, type SolverSettings } from '../types';
import type { BoundaryPort, ScenarioBoundaryConditionSet } from '../boundary/types';
import type { ThermalNetwork } from '../types';

import {
  buildSolveInput,
  solveInputSignature,
  type SolveInput,
} from './buildSolveInput';
import { runPreSolveChecks, type PreSolveReport } from './preSolveChecks';
import {
  SOLUTION_SCHEMA_VERSION,
  SOLVER_ENGINE,
  SOLVER_VERSION,
  directionOf,
  energyGrade,
  issue,
  type EdgeSolutionResult,
  type SolverIssue,
  type ThermalSolution,
} from './solverTypes';

export interface SolveScenarioOptions {
  network: ThermalNetwork;
  boundarySet: ScenarioBoundaryConditionSet | null;
  ports: BoundaryPort[];
  scenarioId: string;
  powerScale?: number;
  settings?: SolverSettings;
}

export interface SolveScenarioOutcome {
  solution: ThermalSolution;
  checks: PreSolveReport;
  input: SolveInput;
  signature: string;
}

function emptySolution(
  input: SolveInput,
  signature: string,
  issues: SolverIssue[],
  settings: SolverSettings,
): ThermalSolution {
  return {
    schema_version: SOLUTION_SCHEMA_VERSION,
    project_id: input.project_id,
    network_id: input.network_id,
    scenario_id: input.scenario_id,
    status: 'FAILED',
    solver_version: SOLVER_VERSION,
    solver_engine: SOLVER_ENGINE,
    solved_at: new Date().toISOString(),
    node_temperatures_C: {},
    edge_results: {},
    energy_balance: {
      generated_W: input.component_power_W + input.solar_power_W,
      rejected_W: 0,
      residual_W: input.component_power_W + input.solar_power_W,
      // A failed solve has no meaningful percentage; it is reported as an error
      // grade rather than a comforting 0 %.
      error_pct: 100,
      grade: energyGrade(100, settings),
      component_W: input.component_power_W,
      solar_W: input.solar_power_W,
    },
    warnings: issues,
    metadata: {
      input_signature: signature,
      solved_nodes: 0,
      solved_edges: 0,
      fixed_nodes: Object.keys(input.fixed_nodes).length,
      max_node_residual_W: 0,
      solve_time_ms: 0,
      power_scale: input.power_scale,
      ambient_C: input.ambient_C,
      matrix_size: 0,
    },
  };
}

/** Pre-solve only — the "Pre-Solve Check" button (07 §9, §47). */
export function checkScenario(options: SolveScenarioOptions): {
  checks: PreSolveReport;
  input: SolveInput;
  signature: string;
} {
  const input = buildSolveInput({
    network: options.network,
    boundarySet: options.boundarySet,
    ports: options.ports,
    scenarioId: options.scenarioId,
    powerScale: options.powerScale,
  });
  return { checks: runPreSolveChecks(input), input, signature: solveInputSignature(input) };
}

export function solveScenario(options: SolveScenarioOptions): SolveScenarioOutcome {
  const settings = options.settings ?? options.network.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const { checks, input, signature } = checkScenario(options);

  if (!checks.can_solve) {
    return {
      solution: emptySolution(input, signature, [...checks.errors, ...checks.warnings], settings),
      checks,
      input,
      signature,
    };
  }

  // Power scale and solar are already baked into the clone's node powers, so the
  // numeric core is handed a plain network and a scale of 1.
  const result = solveNetwork(input.network, {
    scenarioId: input.scenario_id,
    powerScale: 1,
    settings,
  });

  if (!result.ok) {
    const failure = issue(
      'error',
      'singular_matrix',
      'matrix',
      result.message ?? 'The conductance matrix could not be solved.',
      result.message
        ? '導熱矩陣無法求解，請檢查邊界與連線設定。'
        : '導熱矩陣無法求解。',
      { fix_in: '05' },
    );
    return {
      solution: emptySolution(input, signature, [failure, ...checks.warnings], settings),
      checks: { ...checks, can_solve: false, errors: [...checks.errors, failure] },
      input,
      signature,
    };
  }

  // --- result integrity (07 §36) -------------------------------------------
  const postIssues: SolverIssue[] = [];
  const nonFinite = Object.entries(result.temperatures).filter(
    ([, value]) => !Number.isFinite(value),
  );
  for (const [nodeId] of nonFinite) {
    postIssues.push(
      issue(
        'error',
        'non_finite_result',
        'result_integrity',
        `Node "${input.network.nodes[nodeId]?.name ?? nodeId}" solved to a non-finite temperature.`,
        `節點「${input.network.nodes[nodeId]?.name ?? nodeId}」求得的溫度不是有效數值。`,
        { node_id: nodeId, fix_in: '05' },
      ),
    );
  }

  // --- edge results (07 §15, §17) ------------------------------------------
  const boundaryEdgeIds = new Set(input.boundary_edges.map((entry) => entry.edge_id));
  const edgeResults: Record<string, EdgeSolutionResult> = {};

  for (const [edgeId, edgeResult] of Object.entries(result.edges)) {
    const edge = input.network.edges[edgeId];
    if (!edge) continue;
    edgeResults[edgeId] = {
      edge_id: edgeId,
      from: edgeResult.from,
      to: edgeResult.to,
      heat_flow_W: edgeResult.heat_flow_W,
      delta_T_C: edgeResult.delta_T_C,
      // A negative Q is the real direction, not a failure (07 §15).
      actual_direction: directionOf(edgeResult.heat_flow_W),
      active_rth_C_per_W: edgeResult.R_C_per_W,
      active_rth_source: edge.rth.active_source,
      rth_origin: boundaryEdgeIds.has(edgeId) ? 'boundary_scenario' : 'edge',
    };
  }

  // --- energy balance (07 §18, §19) ----------------------------------------
  const generated = result.energy.total_generated_W;
  const solar = input.solar_power_W;
  const errorPct = result.energy.error_pct;
  const grade = energyGrade(errorPct, settings);

  if (grade === 'error') {
    postIssues.push(
      issue(
        'error',
        'energy_balance_error',
        'energy_balance',
        `Energy balance is off by ${errorPct.toFixed(2)} %. Above ${settings.energy_error_pct} % the result is not trustworthy.`,
        `能量平衡誤差 ${errorPct.toFixed(2)} %，超過 ${settings.energy_error_pct} % 的容許值，結果不可信。`,
        { fix_in: '07' },
      ),
    );
  } else if (grade === 'warning') {
    postIssues.push(
      issue(
        'warning',
        'energy_balance_warning',
        'energy_balance',
        `Energy balance is off by ${errorPct.toFixed(2)} %.`,
        `能量平衡誤差 ${errorPct.toFixed(2)} %。`,
        { fix_in: '07' },
      ),
    );
  }

  // The node residual is the direct check that [G][T] = [P] actually holds.
  if (result.max_node_residual_W > Math.max(1e-6, generated * 1e-6)) {
    postIssues.push(
      issue(
        'warning',
        'node_residual',
        'result_integrity',
        `Largest node imbalance is ${result.max_node_residual_W.toExponential(2)} W.`,
        `最大節點失衡量為 ${result.max_node_residual_W.toExponential(2)} W。`,
      ),
    );
  }

  const warnings = [...checks.warnings, ...checks.infos, ...postIssues];
  const failed = postIssues.some((entry) => entry.severity === 'error');
  const status: ThermalSolution['status'] = failed
    ? 'FAILED'
    : warnings.some((entry) => entry.severity === 'warning')
      ? 'WARNING'
      : 'SOLVED';

  const fixedCount = Object.values(input.network.nodes).filter(
    (node) => node.boundary_type === 'fixed_temperature' && node.fixed_temperature_C != null,
  ).length;

  const solution: ThermalSolution = {
    schema_version: SOLUTION_SCHEMA_VERSION,
    project_id: input.project_id,
    network_id: input.network_id,
    scenario_id: input.scenario_id,
    status,
    solver_version: SOLVER_VERSION,
    solver_engine: SOLVER_ENGINE,
    solved_at: new Date().toISOString(),
    node_temperatures_C: result.temperatures,
    edge_results: edgeResults,
    energy_balance: {
      generated_W: generated,
      rejected_W: result.energy.total_rejected_W,
      residual_W: result.energy.residual_W,
      error_pct: errorPct,
      grade,
      component_W: generated - solar,
      solar_W: solar,
    },
    warnings,
    metadata: {
      input_signature: signature,
      solved_nodes: Object.keys(result.temperatures).length,
      solved_edges: Object.keys(edgeResults).length,
      fixed_nodes: fixedCount,
      max_node_residual_W: result.max_node_residual_W,
      solve_time_ms: result.solve_time_ms,
      power_scale: input.power_scale,
      ambient_C: input.ambient_C,
      matrix_size: Object.keys(input.network.nodes).length - fixedCount,
    },
  };

  return { solution, checks, input, signature };
}

/**
 * Net heat leaving a node through its edges, W — 07 §32 "ΣQ + P ≈ 0".
 * Positive means heat flows away from the node.
 */
export function netHeatFlowOf(solution: ThermalSolution, nodeId: string): number {
  let net = 0;
  for (const result of Object.values(solution.edge_results)) {
    if (result.from === nodeId) net += result.heat_flow_W;
    else if (result.to === nodeId) net -= result.heat_flow_W;
  }
  return net;
}

/** Active resistance of an edge under a scenario, for display (07 §17). */
export function displayRth(
  network: ThermalNetwork,
  edgeId: string,
  scenarioId: string,
): number | null {
  const edge = network.edges[edgeId];
  return edge ? edgeResistance(edge, scenarioId) : null;
}
