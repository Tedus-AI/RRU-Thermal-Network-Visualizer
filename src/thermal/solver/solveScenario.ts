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

import type { PowerBasis } from '@/domain/powerBasis';
import type { MaterialDefaults } from '@/domain/materials';
import { solveNetwork } from '../networkSolver';
import { edgeResistance } from '../rth';
import { DEFAULT_SOLVER_SETTINGS, type SolverSettings } from '../types';
import type { BoundaryPort, ScenarioBoundaryConditionSet } from '../boundary/types';
import type { ThermalNetwork } from '../types';
import type { SourceRevision } from '@/domain/revision';
import type { Component } from '@/domain/component';

import {
  buildSolveInput,
  solveInputSignature,
  type SolveInput,
} from './buildSolveInput';
import { runPreSolveChecks, type PreSolveReport } from './preSolveChecks';
import { refineSpreadingWithBiot, type SpreadingBiotRefinement } from './spreadingBiot';
import { refineSpreadingDomains, type SpreadingDomainResult } from './spreadingDomain';
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
  components?: Component[];
  /** Project material constants — see BuildSolveInputOptions. */
  materials: MaterialDefaults;
  boundarySet: ScenarioBoundaryConditionSet | null;
  ports: BoundaryPort[];
  scenarioId: string;
  sourceRevision?: SourceRevision;
  powerScale?: number;
  powerBasis?: PowerBasis;
  settings?: SolverSettings;
}

export interface SolveScenarioOutcome {
  solution: ThermalSolution;
  checks: PreSolveReport;
  input: SolveInput;
  signature: string;
  /** Spreading edges re-solved at finite Bi for this scenario; see spreadingBiot.ts. */
  spreading_refinements: SpreadingBiotRefinement[];
  /** Base edges spreading into less than the whole base; see spreadingDomain.ts. */
  spreading_domains: SpreadingDomainResult[];
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
      source_revision: input.source_revision,
      solved_nodes: 0,
      solved_edges: 0,
      fixed_nodes: Object.keys(input.fixed_nodes).length,
      max_node_residual_W: 0,
      solve_time_ms: 0,
      power_scale: input.power_scale,
      power_basis: input.power_basis,
      ambient_C: input.ambient_C,
      matrix_size: 0,
    },
  };
}

/** Pre-solve only — the "Pre-Solve Check" button (07 §9, §47). */
/**
 * The solve-ready input for a scenario — the SAME network whether it is being
 * checked or solved.
 *
 * The finite-Bi spreading refinement used to live in `solveScenario`, after
 * this function had already returned. That made the input two different
 * networks depending on which door you came in by: `solve()` kept the refined
 * one, while `refresh()` and `runPreSolveCheck()` replaced it with an
 * unrefined rebuild — and the stored solution stayed put either way. Screen 08
 * mounts, calls `loadFor`, and gets the pair back mismatched, which is exactly
 * how it came to show a PA junction 12.9 °C cooler than Screen 07 was showing
 * for the same solve.
 *
 * So the refinement happens here, once, for everyone. The signature is taken
 * BEFORE it, so a solution stored by an earlier build is not invalidated by
 * this move.
 */
export function checkScenario(options: SolveScenarioOptions): {
  checks: PreSolveReport;
  input: SolveInput;
  signature: string;
  spreading_refinements: SpreadingBiotRefinement[];
  spreading_domains: SpreadingDomainResult[];
} {
  const settings = options.settings ?? options.network.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const input = buildSolveInput({
    network: options.network,
    components: options.components,
    materials: options.materials,
    boundarySet: options.boundarySet,
    ports: options.ports,
    scenarioId: options.scenarioId,
    sourceRevision: options.sourceRevision,
    powerScale: options.powerScale,
    powerBasis: options.powerBasis,
  });
  const signature = solveInputSignature(input);

  // Screen 05 has to build every spreading edge at Bi → ∞ because h is scenario
  // data. Here the scenario's boundary resistances are already on the clone, so
  // the far-face h can be measured off the network itself and the edge re-solved
  // against it. See `spreadingBiot.ts`; it refines nothing when the plate has no
  // finite path to a boundary, so an unsolvable network simply keeps Bi → ∞.
  const biot = refineSpreadingWithBiot(input.network, input.scenario_id, settings);

  // Heat-share domains are sized from solved flows, so they are found here too —
  // after the Biot pass, which they re-run for every edge they resize — and the
  // network every caller gets back already carries them.
  const domainPass = refineSpreadingDomains(input.network, input.scenario_id, settings);
  const resized = new Set(
    domainPass.domains.filter((entry) => entry.mode === 'HeatShare').map((entry) => entry.edge_id),
  );
  const spreading_refinements = [
    ...biot.filter((entry) => !resized.has(entry.edge_id)),
    ...domainPass.biot,
  ];

  return {
    checks: runPreSolveChecks(input),
    input,
    signature,
    spreading_refinements,
    spreading_domains: domainPass.domains,
  };
}

export function solveScenario(options: SolveScenarioOptions): SolveScenarioOutcome {
  const settings = options.settings ?? options.network.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const {
    checks,
    input,
    signature,
    spreading_refinements: spreadingRefinements,
    spreading_domains: spreadingDomains,
  } = checkScenario(options);

  if (!checks.can_solve) {
    return {
      solution: emptySolution(input, signature, [...checks.errors, ...checks.warnings], settings),
      checks,
      input,
      signature,
      spreading_refinements: [],
      spreading_domains: [],
    };
  }

  // --- finite-Bi spreading -------------------------------------------------
  // Applied in `checkScenario` so every caller sees the same network; here we
  // only report what it did.
  const spreadingByEdge = new Map(
    spreadingRefinements.map((entry) => [entry.edge_id, entry]),
  );
  const spreadingIssues: SolverIssue[] = [];
  if (spreadingRefinements.length > 0) {
    const worst = spreadingRefinements.reduce((a, b) =>
      b.R_after_C_per_W - b.R_before_C_per_W > a.R_after_C_per_W - a.R_before_C_per_W ? b : a,
    );
    // Built once, then interpolated into both messages AND handed over as the
    // emphasis runs. The panel matches them literally, so anything that retyped
    // them here would have to stay character-identical forever; sharing the
    // string makes that impossible to get wrong.
    const figuresEn = `h_eff ${worst.h_eff_W_m2K.toFixed(1)} W/m²K, Bi ${worst.bi.toFixed(3)}`;
    const figuresZh = `h_eff 為 ${worst.h_eff_W_m2K.toFixed(1)} W/m²K、Bi 為 ${worst.bi.toFixed(3)}`;
    spreadingIssues.push(
      issue(
        'info',
        'spreading_biot_applied',
        'boundary',
        `${spreadingRefinements.length} spreading edge(s) re-solved at finite Bi from the scenario's own boundary — ${figuresEn} on the largest change, which rose from ${worst.R_before_C_per_W.toFixed(3)} to ${worst.R_after_C_per_W.toFixed(3)} °C/W. Screen 05 shows the Bi → ∞ value, which is always the lower of the two.`,
        `已依本情境的邊界條件，以有限 Bi 重新計算 ${spreadingRefinements.length} 條擴散邊；變化最大的一條 ${figuresZh}，熱阻由 ${worst.R_before_C_per_W.toFixed(3)} 升至 ${worst.R_after_C_per_W.toFixed(3)} °C/W。畫面 05 顯示的是 Bi → ∞ 的值，恆為兩者中的較小者。`,
        { emphasis: [figuresEn, figuresZh] },
      ),
    );
  }

  // --- reduced spreading domains ---------------------------------------------
  // A part spreading into less than the whole base is an assumption about where
  // it sits, and the result has to say which parts rest on it.
  const domainByEdge = new Map(spreadingDomains.map((entry) => [entry.edge_id, entry]));
  const reduced = spreadingDomains.filter((entry) => !entry.reverse);
  if (reduced.length > 0) {
    const nameOf = (entry: SpreadingDomainResult) => {
      const edge = input.network.edges[entry.edge_id];
      return input.network.nodes[edge?.from ?? '']?.name ?? entry.edge_id;
    };
    const area = (entry: SpreadingDomainResult) =>
      `${Math.round(entry.plate_area_mm2).toLocaleString('en-US')} mm² (${(
        (100 * entry.plate_area_mm2) /
        entry.base_area_mm2
      ).toFixed(1)} %)`;
    const listEn = reduced
      .map(
        (entry) =>
          `${nameOf(entry)} — ${entry.mode === 'HeatShare' ? 'own share of the heat' : 'stated area'}, ${area(entry)}`,
      )
      .join('; ');
    const listZh = reduced
      .map(
        (entry) =>
          `${nameOf(entry)}：${entry.mode === 'HeatShare' ? '依熱量分配' : '指定面積'} ${area(entry)}`,
      )
      .join('；');
    spreadingIssues.push(
      issue(
        'info',
        'spreading_domain_reduced',
        'result_integrity',
        `${reduced.length} base edge(s) spread into less than the whole HSK base: ${listEn}. Percentages are of the base. These parts assume the base around them runs no hotter than its average — reasonable away from the hot cluster, optimistic inside it.`,
        `有 ${reduced.length} 條基座擴散邊只擴散到部分 HSK 基座：${listZh}。百分比為佔整片基座的比例。這些元件假設周圍底座不比平均溫度高——遠離熱源群時合理，位在熱源群內則偏樂觀。`,
        { fix_in: '04' },
      ),
    );
  }
  const unsettled = spreadingDomains.filter(
    (entry) => entry.mode === 'HeatShare' && !entry.converged,
  );
  if (unsettled.length > 0) {
    spreadingIssues.push(
      issue(
        'warning',
        'spreading_domain_unconverged',
        'result_integrity',
        `The heat-share spreading domains did not settle within ${unsettled[0].passes} passes; the areas shown are the last pass, not a converged answer.`,
        `「依熱量分配」的擴散面積在 ${unsettled[0].passes} 次迭代內未收斂；顯示的是最後一次的面積，並非收斂結果。`,
        { edge_id: unsettled[0].edge_id, fix_in: '04' },
      ),
    );
  }
  const backflow = spreadingDomains.filter((entry) => entry.reverse);
  if (backflow.length > 0) {
    spreadingIssues.push(
      issue(
        'info',
        'spreading_domain_reverse',
        'result_integrity',
        `${backflow.length} base edge(s) set to spread into their own share of the heat carry heat OUT of the base, so they have no share to spread into and keep the whole base.`,
        `有 ${backflow.length} 條設為「依熱量分配」的基座擴散邊，熱是從底座流出，沒有可分配的份額，維持整片基座。`,
        { edge_id: backflow[0].edge_id, fix_in: '04' },
      ),
    );
  }

  // The note belongs in BOTH places. Screen 07 reads `checks` while a run is
  // fresh and falls back to the solution's warnings once it is not, so a note
  // filed only on the solution would be invisible for the whole time anyone is
  // actually looking at the result.
  const spreadingWarnings = spreadingIssues.filter((entry) => entry.severity === 'warning');
  const spreadingInfos = spreadingIssues.filter((entry) => entry.severity !== 'warning');
  const report: PreSolveReport =
    spreadingIssues.length > 0
      ? {
          ...checks,
          warnings: [...checks.warnings, ...spreadingWarnings],
          infos: [...checks.infos, ...spreadingInfos],
        }
      : checks;

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
      solution: emptySolution(input, signature, [failure, ...report.warnings], settings),
      checks: { ...report, can_solve: false, errors: [...report.errors, failure] },
      input,
      signature,
      spreading_refinements: spreadingRefinements,
      spreading_domains: spreadingDomains,
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
    const refined = spreadingByEdge.get(edgeId);
    const domain = domainByEdge.get(edgeId);
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
      rth_origin: boundaryEdgeIds.has(edgeId)
        ? 'boundary_scenario'
        : refined
          ? 'spreading_biot'
          : 'edge',
      ...(refined
        ? {
            spreading_biot: {
              h_eff_W_m2K: refined.h_eff_W_m2K,
              bi: refined.bi,
              R_bi_infinite_C_per_W: refined.R_before_C_per_W,
            },
          }
        : {}),
      ...(domain
        ? {
            spreading_domain: {
              mode: domain.mode,
              plate_area_mm2: domain.plate_area_mm2,
              base_area_mm2: domain.base_area_mm2,
              heat_share: domain.heat_share,
              reverse: domain.reverse,
            },
          }
        : {}),
    };
  }

  // --- two-phase transport limits -------------------------------------------
  postIssues.push(...heatPipeLimitIssues(input.network, edgeResults));

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

  const warnings = [...report.warnings, ...report.infos, ...postIssues];
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
      source_revision: input.source_revision,
      solved_nodes: Object.keys(result.temperatures).length,
      solved_edges: Object.keys(edgeResults).length,
      fixed_nodes: fixedCount,
      max_node_residual_W: result.max_node_residual_W,
      solve_time_ms: result.solve_time_ms,
      power_scale: input.power_scale,
      power_basis: input.power_basis,
      ambient_C: input.ambient_C,
      matrix_size: Object.keys(input.network.nodes).length - fixedCount,
    },
  };

  return {
    solution,
    checks: report,
    input,
    signature,
    spreading_refinements: spreadingRefinements,
    spreading_domains: spreadingDomains,
  };
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

/**
 * Heat routed through a heat pipe or vapour chamber, against what it can carry.
 *
 * The solve gives a two-phase device a constant vendor resistance, which is
 * only true below its transport (capillary / dry-out) limit. Past it the wick
 * dries, the device stops spreading heat and its resistance climbs by an order
 * of magnitude — a temperature the linear network cannot show. So the heat it
 * was asked to carry is checked against the stated Qmax and an overload is a
 * warning on the result, not a footnote.
 *
 * A device with no stated Qmax is reported once, as unchecked, rather than
 * passed silently: "not checked" and "checked and fine" must not read alike.
 */
export function heatPipeLimitIssues(
  network: ThermalNetwork,
  edgeResults: Record<string, EdgeSolutionResult>,
): SolverIssue[] {
  const issues: SolverIssue[] = [];
  const unchecked: string[] = [];

  for (const edge of Object.values(network.edges)) {
    if (edge.type !== 'heat_pipe') continue;
    const result = edgeResults[edge.id];
    if (!result) continue;
    const qmax = edge.parameters?.q_max_W;
    const carried = Math.abs(result.heat_flow_W);
    if (typeof qmax !== 'number' || !Number.isFinite(qmax) || qmax <= 0) {
      unchecked.push(edge.id);
      continue;
    }
    if (carried <= qmax) continue;

    const from = network.nodes[edge.from]?.name ?? edge.from;
    const to = network.nodes[edge.to]?.name ?? edge.to;
    const percent = ((carried / qmax) * 100).toFixed(0);
    issues.push(
      issue(
        'warning',
        'heat_pipe_qmax_exceeded',
        'result_integrity',
        `Heat pipe "${from} → ${to}" carries ${carried.toFixed(1)} W against a stated Qmax of ${qmax.toFixed(1)} W (${percent} %). Above Qmax the wick dries out and its resistance rises sharply, so the temperatures upstream of it are optimistic.`,
        `熱管「${from} → ${to}」承載 ${carried.toFixed(1)} W，超過標示的 Qmax ${qmax.toFixed(1)} W（${percent} %）。超過 Qmax 時毛細結構乾涸、熱阻急遽上升，上游溫度會被低估。`,
        { edge_id: edge.id, fix_in: '04' },
      ),
    );
  }

  if (unchecked.length > 0) {
    issues.push(
      issue(
        'info',
        'heat_pipe_qmax_unchecked',
        'result_integrity',
        `${unchecked.length} heat pipe / vapour chamber edge(s) have no stated Qmax, so the heat routed through them was not checked against a dry-out limit. State Qmax in Screen 04.`,
        `有 ${unchecked.length} 條熱管／均熱板連線未標示 Qmax，未檢查其承載熱量是否超過乾涸極限。請於 04 填寫 Qmax。`,
        { edge_id: unchecked[0], fix_in: '04' },
      ),
    );
  }

  return issues;
}
