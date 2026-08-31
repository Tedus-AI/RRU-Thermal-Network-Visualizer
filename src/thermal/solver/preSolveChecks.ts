/**
 * Pre-solve checks — 07 §4, §36, §37.
 *
 * Errors here BLOCK the solve. Each one names the object it is about and the
 * screen that owns the fix, so "Focus Issue / Go to 05 / Go to 06" have
 * something real to point at (07 §37).
 *
 * The design rule these checks protect: a missing number stays missing. Nothing
 * in this file substitutes a default resistance, a default ambient or a nominal
 * heat flow so the solve can proceed — an unsolvable model is reported as
 * unsolvable (00 Rule 4, 05 AC-05-35).
 */

import { activeProvenance, edgeResistance } from '../rth';
import type { ThermalEdge, ThermalNetwork } from '../types';
import type { SolveInput } from './buildSolveInput';
import { issue, type SolverIssue } from './solverTypes';

/** Resistances outside this band are suspicious enough to mention (07 §4). */
export const RTH_SANITY = { low_C_per_W: 1e-4, high_C_per_W: 50 };

export interface PreSolveReport {
  /** True when nothing blocks the solve. Warnings do not block. */
  can_solve: boolean;
  errors: SolverIssue[];
  warnings: SolverIssue[];
  infos: SolverIssue[];
  stats: {
    solvable_nodes: number;
    fixed_nodes: number;
    active_edges: number;
    heat_sources: number;
    total_power_W: number;
  };
}

function activeEdgeList(
  network: ThermalNetwork,
  scenarioId: string,
): Array<{ edge: ThermalEdge; R: number }> {
  const out: Array<{ edge: ThermalEdge; R: number }> = [];
  for (const edge of Object.values(network.edges)) {
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    if (edge.from === edge.to) continue;
    const R = edgeResistance(edge, scenarioId);
    if (R == null || !(R > 0) || !Number.isFinite(R)) continue;
    out.push({ edge, R });
  }
  return out;
}

/** Connected components over the ACTIVE edges, isolated nodes included. */
function connectedComponents(
  network: ThermalNetwork,
  edges: Array<{ edge: ThermalEdge }>,
): string[][] {
  const neighbours = new Map<string, string[]>();
  for (const id of Object.keys(network.nodes)) neighbours.set(id, []);
  for (const { edge } of edges) {
    neighbours.get(edge.from)?.push(edge.to);
    neighbours.get(edge.to)?.push(edge.from);
  }

  const seen = new Set<string>();
  const components: string[][] = [];

  for (const id of Object.keys(network.nodes)) {
    if (seen.has(id)) continue;
    const component: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length > 0) {
      const current = queue.shift() as string;
      component.push(current);
      for (const next of neighbours.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  }

  return components;
}

export function runPreSolveChecks(input: SolveInput): PreSolveReport {
  const errors: SolverIssue[] = [];
  const warnings: SolverIssue[] = [];
  const infos: SolverIssue[] = [...input.notes];

  const network = input.network;
  const nodes = Object.values(network.nodes);
  const active = activeEdgeList(network, input.scenario_id);
  const fixedIds = new Set(
    nodes
      .filter((node) => node.boundary_type === 'fixed_temperature' && node.fixed_temperature_C != null)
      .map((node) => node.id),
  );

  // --- structural integrity ------------------------------------------------
  for (const edge of Object.values(network.edges)) {
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) {
      errors.push(
        issue(
          'error',
          'missing_node_reference',
          'pre_solve',
          `Edge "${edge.id}" references a node that is not in the network.`,
          `連線 "${edge.id}" 參照到不存在的節點。`,
          { edge_id: edge.id, fix_in: '05' },
        ),
      );
      continue;
    }
    if (edge.from === edge.to) {
      errors.push(
        issue(
          'error',
          'self_loop',
          'pre_solve',
          `Edge "${edge.id}" starts and ends on the same node.`,
          `連線 "${edge.id}" 的起點與終點是同一個節點。`,
          { edge_id: edge.id, fix_in: '05' },
        ),
      );
    }
  }

  // --- numerical sanity of the inputs --------------------------------------
  for (const node of nodes) {
    if (!Number.isFinite(node.power_W)) {
      errors.push(
        issue(
          'error',
          'non_finite_power',
          'pre_solve',
          `Node "${node.name}" has a non-finite power value.`,
          `節點「${node.name}」的功耗不是有效數值。`,
          { node_id: node.id, fix_in: '04' },
        ),
      );
    }
    if (
      node.boundary_type === 'fixed_temperature' &&
      !Number.isFinite(node.fixed_temperature_C ?? NaN)
    ) {
      errors.push(
        issue(
          'error',
          'invalid_fixed_temperature',
          'boundary',
          `Boundary node "${node.name}" has no valid fixed temperature.`,
          `邊界節點「${node.name}」沒有有效的固定溫度。`,
          { node_id: node.id, fix_in: '06' },
        ),
      );
    }
  }

  // --- boundary conditions --------------------------------------------------
  if (input.ambient_C == null) {
    errors.push(
      issue(
        'error',
        'ambient_not_configured',
        'boundary',
        'The scenario has no ambient temperature. Screen 06 must define it before a solve.',
        '此情境尚未定義環境溫度，請先於 06 設定。',
        { fix_in: '06' },
      ),
    );
  }

  if (fixedIds.size === 0) {
    errors.push(
      issue(
        'error',
        'no_fixed_boundary',
        'boundary',
        'No fixed-temperature or ambient boundary exists. [G][T] = [P] has no reference and cannot be solved.',
        '沒有任何固定溫度或環境邊界，方程式缺少參考點，無法求解。',
        { fix_in: '06' },
      ),
    );
  }

  for (const assignment of input.boundary_edges) {
    if (assignment.R_C_per_W == null) {
      errors.push(
        issue(
          'error',
          'boundary_rth_unresolved',
          'boundary',
          `Boundary edge "${assignment.edge_id}" has no resolved resistance for this scenario. Complete h, area or emissivity in Screen 06.`,
          `邊界連線 "${assignment.edge_id}" 在此情境沒有可用熱阻，請於 06 補齊 h、面積或放射率。`,
          {
            edge_id: assignment.edge_id,
            boundary_port_id: assignment.boundary_port_id,
            fix_in: '06',
          },
        ),
      );
    } else if (!(assignment.R_C_per_W > 0)) {
      errors.push(
        issue(
          'error',
          'boundary_rth_non_positive',
          'boundary',
          `Boundary edge "${assignment.edge_id}" resolved to a non-positive resistance.`,
          `邊界連線 "${assignment.edge_id}" 的熱阻不是正值。`,
          { edge_id: assignment.edge_id, fix_in: '06' },
        ),
      );
    }
  }

  // --- edge resistances -----------------------------------------------------
  const boundaryEdgeIds = new Set(input.boundary_edges.map((entry) => entry.edge_id));
  const adiabatic = new Set(input.adiabatic_edge_ids);

  for (const edge of Object.values(network.edges)) {
    if (!edge.enabled || adiabatic.has(edge.id)) continue;
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    // A boundary edge with no scenario value already produced its own error.
    if (boundaryEdgeIds.has(edge.id)) continue;

    const R = edgeResistance(edge, input.scenario_id);

    if (R == null) {
      const boundaryDerived = edge.method === 'convection_hA' || edge.method === 'radiation_hA';
      errors.push(
        issue(
          'error',
          boundaryDerived ? 'boundary_not_configured' : 'active_rth_unresolved',
          boundaryDerived ? 'boundary' : 'pre_solve',
          boundaryDerived
            ? `Boundary edge "${edge.id}" has no boundary condition assigned in this scenario.`
            : `Edge "${edge.id}" has no value in its active Rth source (${edge.rth.active_source}).`,
          boundaryDerived
            ? `邊界連線 "${edge.id}" 在此情境尚未指派邊界條件。`
            : `連線 "${edge.id}" 的作用熱阻來源（${edge.rth.active_source}）沒有數值。`,
          { edge_id: edge.id, fix_in: boundaryDerived ? '06' : '05' },
        ),
      );
      continue;
    }

    if (!Number.isFinite(R)) {
      errors.push(
        issue(
          'error',
          'non_finite_rth',
          'pre_solve',
          `Edge "${edge.id}" has a non-finite resistance.`,
          `連線 "${edge.id}" 的熱阻不是有效數值。`,
          { edge_id: edge.id, fix_in: '05' },
        ),
      );
      continue;
    }

    if (R <= 0) {
      // An Rjc of 0 is not a stray zero — it is someone saying "this part has no
      // internal resistance", which is true of a circulator, a filter body or a
      // bolted module whose surface, pad and body are all one temperature. The
      // generic message sent them to Screen 05 to edit an edge that is doing
      // exactly what it was told; the fix is the component's Heat Source
      // Reference in Screen 04, followed by a subgraph rebuild so the junction
      // step goes away instead of being short-circuited.
      const packageRjc = edge.type === 'package_rjc' && R === 0;
      errors.push(
        issue(
          'error',
          packageRjc ? 'package_rjc_zero' : 'active_rth_non_positive',
          'pre_solve',
          packageRjc
            ? `Edge "${edge.id}" is a package Rjc of 0, which has infinite conductance and cannot be solved. If the part is one isothermal body, set its Heat Source Reference to surface/body in Screen 04, then rebuild its subgraph in Screen 05.`
            : `Edge "${edge.id}" has a resistance of ${R}. An active edge must have Rth > 0.`,
          packageRjc
            ? `連線 "${edge.id}" 的封裝熱阻為 0，導熱率為無限大而無法求解。若此零件為等溫本體，請於 04 將「熱源基準」改為表面／本體型，再於 05 重建其子圖。`
            : `連線 "${edge.id}" 的熱阻為 ${R}，作用中的連線熱阻必須大於 0。`,
          { edge_id: edge.id, fix_in: packageRjc ? '04' : '05' },
        ),
      );
      continue;
    }

    // --- warnings, not blockers ---------------------------------------------
    const provenance = activeProvenance(edge.rth);
    if (edge.confidence === 'low' || provenance?.confidence === 'low') {
      warnings.push(
        issue(
          'warning',
          'low_confidence_rth',
          'result_integrity',
          `Edge "${edge.id}" uses a low-confidence resistance. The solved temperatures inherit that uncertainty.`,
          `連線 "${edge.id}" 使用低信心度熱阻，求解結果會繼承此不確定性。`,
          { edge_id: edge.id, fix_in: '05' },
        ),
      );
    }

    if (edge.rth.active_source === 'Manual' && !provenance?.reference) {
      warnings.push(
        issue(
          'warning',
          'manual_rth_without_reference',
          'result_integrity',
          `Edge "${edge.id}" uses a manual resistance with no stated reference.`,
          `連線 "${edge.id}" 使用手動熱阻但沒有註明依據。`,
          { edge_id: edge.id, fix_in: '05' },
        ),
      );
    }

    if (R > RTH_SANITY.high_C_per_W || R < RTH_SANITY.low_C_per_W) {
      warnings.push(
        issue(
          'warning',
          'rth_out_of_usual_range',
          'result_integrity',
          `Edge "${edge.id}" has an unusual resistance (${R} °C/W). Check the geometry or the units.`,
          `連線 "${edge.id}" 的熱阻異常（${R} °C/W），請檢查幾何或單位。`,
          { edge_id: edge.id, fix_in: '05' },
        ),
      );
    }
  }

  // --- heat sources ---------------------------------------------------------
  const sources = nodes.filter((node) => node.power_W > 0 && !fixedIds.has(node.id));
  if (sources.length === 0) {
    errors.push(
      issue(
        'error',
        'no_heat_source',
        'pre_solve',
        'No active heat source. Every solvable node dissipates 0 W, so there is nothing to solve.',
        '沒有任何作用中的熱源，所有可解節點功耗皆為 0 W。',
        { fix_in: '04' },
      ),
    );
  }

  // --- connectivity ---------------------------------------------------------
  const components = connectedComponents(network, active);
  for (const component of components) {
    const hasFixed = component.some((id) => fixedIds.has(id));
    const powered = component.filter((id) => (network.nodes[id]?.power_W ?? 0) > 0);
    const solvable = component.filter((id) => !fixedIds.has(id));

    if (!hasFixed && solvable.length > 0) {
      // Without a reference this block of the matrix is singular. Test E.
      const label = component
        .slice(0, 3)
        .map((id) => network.nodes[id]?.name ?? id)
        .join(', ');
      errors.push(
        issue(
          'error',
          powered.length > 0 ? 'no_path_to_sink' : 'floating_island',
          'matrix',
          powered.length > 0
            ? `${powered.length} heat source(s) have no thermal path to a fixed-temperature boundary (${label}${component.length > 3 ? ', …' : ''}).`
            : `A disconnected sub-network has no boundary constraint (${label}${component.length > 3 ? ', …' : ''}). Its block of the matrix is singular.`,
          powered.length > 0
            ? `有 ${powered.length} 個熱源沒有通往固定溫度邊界的熱路徑（${label}）。`
            : `有一個未連接的子網路缺少邊界條件（${label}），其矩陣區塊為奇異矩陣。`,
          { node_id: component[0], fix_in: '05' },
        ),
      );
      continue;
    }

    if (hasFixed && powered.length === 0 && component.length > 1) {
      warnings.push(
        issue(
          'warning',
          'passive_island',
          'result_integrity',
          `A connected group of ${component.length} node(s) carries no heat. It will solve at the boundary temperature.`,
          `有 ${component.length} 個節點的區塊沒有熱量流過，其溫度會等於邊界溫度。`,
          { node_id: component[0], fix_in: '05' },
        ),
      );
    }
  }

  // --- Screen 03 compatibility ---------------------------------------------
  // Reported once, as information. Screen 03 is deferred, so the absence of an
  // external mapping is expected and must not read as a defect (07 §42).
  const mapped = Object.values(network.nodes).filter(
    (node) => node.external_mappings || node.simulation_alias,
  ).length;
  if (mapped === 0 && nodes.length > 0) {
    infos.push(
      issue(
        'info',
        'external_mapping_absent',
        'result_integrity',
        'No external simulation mapping is present. FloTHERM comparison stays unavailable until Screen 03 is implemented.',
        '尚無外部模擬對應。FloTHERM 比對需待 03 實作後才可使用。',
      ),
    );
  }

  return {
    can_solve: errors.length === 0,
    errors,
    warnings,
    infos,
    stats: {
      solvable_nodes: nodes.length - fixedIds.size,
      fixed_nodes: fixedIds.size,
      active_edges: active.length,
      heat_sources: sources.length,
      total_power_W: input.component_power_W + input.solar_power_W,
    },
  };
}
