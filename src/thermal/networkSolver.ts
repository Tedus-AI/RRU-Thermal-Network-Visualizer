/**
 * Nodal thermal network solver — 00 §12.
 *
 * Solves [G][T] = [P] for every non-fixed node, then back-computes edge heat flow
 * and ΔT. Deliberately generic: it knows only nodes, edges, power and boundary
 * conditions (00 §12.5). It must never learn about PAs, FPGAs or templates —
 * that knowledge belongs to the Network Builder.
 *
 * Supports series, parallel, branch, merge, shared nodes, multiple heat sources,
 * multiple ambient nodes, disabled edges and scenario overrides (00 §12.4).
 */

import { edgeResistance } from './rth';
import type { SolverSettings, ThermalEdge, ThermalNetwork, ThermalNode } from './types';
import { DEFAULT_SOLVER_SETTINGS } from './types';

export interface EdgeResult {
  edge_id: string;
  R_C_per_W: number;
  heat_flow_W: number;
  delta_T_C: number;
  /** Positive means heat flows from `from` to `to`. */
  from: string;
  to: string;
}

export interface EnergyBalance {
  total_generated_W: number;
  total_rejected_W: number;
  residual_W: number;
  error_pct: number;
  status: 'ok' | 'warning' | 'error';
}

export interface SolveResult {
  ok: boolean;
  temperatures: Record<string, number>;
  edges: Record<string, EdgeResult>;
  energy: EnergyBalance;
  /** Largest |Pi - Σ Qij| over solved nodes, W. */
  max_node_residual_W: number;
  solve_time_ms: number;
  message?: string;
}

export interface SolveOptions {
  scenarioId?: string;
  /** Multiplies every node power — scenario power_scale, 00 §34. */
  powerScale?: number;
  settings?: SolverSettings;
}

/** Dense Gaussian elimination with partial pivoting. n is small (hundreds). */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Work on copies; the caller keeps its matrices.
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-14) return null; // singular: floating island
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];

    const diag = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}

function isFixed(node: ThermalNode): boolean {
  return node.boundary_type === 'fixed_temperature' && node.fixed_temperature_C != null;
}

/** Edges that carry heat under the given scenario, with a usable positive resistance. */
export function activeEdges(
  network: ThermalNetwork,
  scenarioId?: string,
): Array<{ edge: ThermalEdge; R: number }> {
  const out: Array<{ edge: ThermalEdge; R: number }> = [];
  for (const edge of Object.values(network.edges)) {
    const R = edgeResistance(edge, scenarioId);
    if (R == null || !(R > 0)) continue;
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    if (edge.from === edge.to) continue;
    out.push({ edge, R });
  }
  return out;
}

export function solveNetwork(network: ThermalNetwork, options: SolveOptions = {}): SolveResult {
  const started = performance.now();
  const settings = options.settings ?? network.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const powerScale = options.powerScale ?? 1;

  const nodes = Object.values(network.nodes);
  const edges = activeEdges(network, options.scenarioId);

  const temperatures: Record<string, number> = {};
  const unknowns: string[] = [];
  const indexOf: Record<string, number> = {};

  for (const node of nodes) {
    if (isFixed(node)) {
      temperatures[node.id] = node.fixed_temperature_C as number;
    } else {
      indexOf[node.id] = unknowns.length;
      unknowns.push(node.id);
    }
  }

  const emptyEnergy: EnergyBalance = {
    total_generated_W: 0,
    total_rejected_W: 0,
    residual_W: 0,
    error_pct: 0,
    status: 'ok',
  };

  if (unknowns.length === 0) {
    return {
      ok: false,
      temperatures,
      edges: {},
      energy: emptyEnergy,
      max_node_residual_W: 0,
      solve_time_ms: performance.now() - started,
      message: 'Network has no solvable node. Every node is a fixed-temperature boundary.',
    };
  }

  const n = unknowns.length;
  const G: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const P: number[] = new Array<number>(n).fill(0);

  for (const id of unknowns) {
    P[indexOf[id]] = (network.nodes[id].power_W || 0) * powerScale;
  }

  for (const { edge, R } of edges) {
    const g = 1 / R;
    const a = edge.from;
    const b = edge.to;
    const aFixed = isFixed(network.nodes[a]);
    const bFixed = isFixed(network.nodes[b]);

    if (aFixed && bFixed) continue; // both pinned: carries heat but adds no equation

    if (!aFixed && !bFixed) {
      const i = indexOf[a];
      const j = indexOf[b];
      G[i][i] += g;
      G[j][j] += g;
      G[i][j] -= g;
      G[j][i] -= g;
    } else if (!aFixed) {
      const i = indexOf[a];
      G[i][i] += g;
      P[i] += g * temperatures[b];
    } else {
      const j = indexOf[b];
      G[j][j] += g;
      P[j] += g * temperatures[a];
    }
  }

  const solution = solveLinearSystem(G, P);
  if (!solution) {
    return {
      ok: false,
      temperatures,
      edges: {},
      energy: emptyEnergy,
      max_node_residual_W: 0,
      solve_time_ms: performance.now() - started,
      message:
        'Conductance matrix is singular. A node or sub-network has no conduction path to a ' +
        'fixed-temperature boundary.',
    };
  }

  unknowns.forEach((id, i) => {
    temperatures[id] = solution[i];
  });

  // Back-compute edge heat flow and ΔT.
  const edgeResults: Record<string, EdgeResult> = {};
  for (const { edge, R } of edges) {
    const dT = temperatures[edge.from] - temperatures[edge.to];
    edgeResults[edge.id] = {
      edge_id: edge.id,
      R_C_per_W: R,
      heat_flow_W: dT / R,
      delta_T_C: dT,
      from: edge.from,
      to: edge.to,
    };
  }

  // Node residuals: Pi - Σ Qij must vanish for solved nodes.
  let maxResidual = 0;
  for (const id of unknowns) {
    let outflow = 0;
    for (const result of Object.values(edgeResults)) {
      if (result.from === id) outflow += result.heat_flow_W;
      else if (result.to === id) outflow -= result.heat_flow_W;
    }
    const residual = Math.abs((network.nodes[id].power_W || 0) * powerScale - outflow);
    if (residual > maxResidual) maxResidual = residual;
  }

  const energy = computeEnergyBalance(network, edgeResults, temperatures, powerScale, settings);

  return {
    ok: true,
    temperatures,
    edges: edgeResults,
    energy,
    max_node_residual_W: maxResidual,
    solve_time_ms: performance.now() - started,
  };
}

/**
 * Energy balance — 00 §14.
 * Generated = Σ node power. Rejected = net heat absorbed by fixed-temperature nodes.
 */
export function computeEnergyBalance(
  network: ThermalNetwork,
  edgeResults: Record<string, EdgeResult>,
  _temperatures: Record<string, number>,
  powerScale: number,
  settings: SolverSettings,
): EnergyBalance {
  let generated = 0;
  for (const node of Object.values(network.nodes)) {
    if (!isFixed(node)) generated += (node.power_W || 0) * powerScale;
  }

  let rejected = 0;
  for (const result of Object.values(edgeResults)) {
    const fromFixed = isFixed(network.nodes[result.from]);
    const toFixed = isFixed(network.nodes[result.to]);
    if (toFixed && !fromFixed) rejected += result.heat_flow_W;
    else if (fromFixed && !toFixed) rejected -= result.heat_flow_W;
  }

  const residual = generated - rejected;
  const errorPct = generated > 0 ? Math.abs(residual / generated) * 100 : 0;

  let status: EnergyBalance['status'] = 'ok';
  if (errorPct > settings.energy_error_pct) status = 'error';
  else if (errorPct > settings.energy_warn_pct) status = 'warning';

  return {
    total_generated_W: generated,
    total_rejected_W: rejected,
    residual_W: residual,
    error_pct: errorPct,
    status,
  };
}
