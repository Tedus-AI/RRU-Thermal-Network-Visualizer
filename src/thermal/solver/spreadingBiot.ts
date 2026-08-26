/**
 * Finite-Bi refinement of the spreading edges — the fin-side `h` the Lee model
 * has always wanted.
 *
 * THE PROBLEM
 * -----------
 * `resistance/spreading.ts` solves Lee/Song/Au/Moran exactly, but Φₙ needs a
 * Biot number, Bi = h·b/k, and h lives on the far face of the plate — which is
 * a Screen 06 boundary condition, not Screen 05 geometry. Screen 05 therefore
 * builds every spreading edge at Bi → ∞ and says so on the edge. Bi → ∞ is the
 * smallest Φ the formula can produce, so it is the smallest spreading
 * resistance the model can produce: the assumption biases the answer LOW, and
 * for an RRU base it is not a small bias. A 30 × 30 mm source on a
 * 300 × 220 × 7.3 mm k=155 base reads 0.049 °C/W at Bi → ∞ and 0.269 °C/W at
 * h = 100 W/m²K — 5.5×, about 10 °C at 45 W, all of it flattering.
 *
 * That understatement matters more since the mount axis gained its parallel
 * routes. A vapor chamber, an embedded heat pipe and a small base with a pipe
 * under it all split their heat between the pipe and the metal around it, and
 * the split is decided by the spreading edge. Get the spreading too low and the
 * tool credits the metal, understates the pipe, and ranks the mounts wrongly.
 *
 * WHY THIS BELONGS AT SOLVE TIME
 * ------------------------------
 * h is scenario data. The Screen 05 topology is scenario-INDEPENDENT by design
 * (06 §10.1), so the refined resistance may not be written back onto the stored
 * edge: two scenarios with different airflow would fight over one number. It is
 * applied here the same way Screen 06's convection and radiation resistances
 * are — as a `scenario_overrides` entry on the solve-ready CLONE (Rule 9), with
 * the edge's own analytical slot untouched.
 *
 * HOW h IS OBTAINED
 * -----------------
 * Not by looking up a profile: what Bi wants is the resistance of everything
 * downstream of the plate, and between the plate and ambient sit the fin
 * conduction edge, the convection edge and possibly radiation in parallel. So
 * the network answers the question itself.
 *
 * Inject 1 W at the plate node, hold every fixed node at 0 °C, zero every other
 * power, and solve. The plate then settles at exactly the Thevenin resistance
 * from itself to the boundary, in °C/W. The conductance matrix is the same one
 * the real solve uses — only the right-hand side differs — so this probe is
 * non-singular whenever the real solve is, and for a linear network the answer
 * is exact rather than an iteration. The upstream component chains dead-end at
 * their junctions, carry no current, and drop out on their own.
 *
 *   R_down = T_plate from the unit-injection probe
 *   h_eff  = 1 / (R_down · A_plate)        -- fin array flattened onto the base
 *   Bi     = h_eff · b / k,  b = √(A_influence/π)
 *
 * `h_eff` is deliberately the whole sink flattened onto the base footprint, fin
 * efficiency and all, because that is what Lee's uniform far-face h means. The
 * fins are not modelled as fins here; their conductance is.
 *
 * WHEN IT DOES NOT APPLY
 * ----------------------
 * No boundary condition, an adiabatic port, an unresolved fin edge — anything
 * that leaves the plate with no finite path to a fixed node — makes the probe
 * unsolvable or non-positive. Then nothing is refined, the Bi → ∞ edge stands,
 * and its existing note keeps telling the reader which way it errs. Nothing
 * here invents an h.
 */

import { solveNetwork } from '../networkSolver';
import { computeRth } from '../resistance/calculators';
import { edgeResistance } from '../rth';
import type { SolverSettings, ThermalNetwork } from '../types';

/** What the refinement did to one spreading edge, for the inspector and notes. */
export interface SpreadingBiotRefinement {
  edge_id: string;
  /** The plate the heat spreads into — the node the edge ends at. */
  plate_node_id: string;
  /** Thevenin resistance from the plate to the boundary, °C/W. */
  R_downstream_C_per_W: number;
  /** The whole sink flattened onto the plate footprint, W/m²K. */
  h_eff_W_m2K: number;
  bi: number;
  /** What the edge read before, at Bi → ∞. */
  R_before_C_per_W: number;
  R_after_C_per_W: number;
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Thevenin resistance from `plateNodeId` to the fixed nodes, °C/W.
 *
 * Returns null when the plate has no finite path to a boundary — which is the
 * signal to leave the edge at Bi → ∞ rather than to substitute anything.
 */
export function downstreamResistance(
  network: ThermalNetwork,
  plateNodeId: string,
  scenarioId: string,
  settings?: SolverSettings,
): number | null {
  if (!network.nodes[plateNodeId]) return null;

  // A probe network, not the solve network: same nodes, same edges, same
  // conductances, only the sources moved. Powers and fixed temperatures are the
  // only things touched, so the matrix is identical to the real solve's.
  const probe: ThermalNetwork = {
    ...network,
    nodes: Object.fromEntries(
      Object.entries(network.nodes).map(([id, node]) => [
        id,
        {
          ...node,
          power_W: id === plateNodeId ? 1 : 0,
          // Only a node the real solve actually pins gets pinned here. A node
          // marked `fixed_temperature` with no value is NOT fixed, and turning
          // it into a 0 °C reservoir would invent a heat path.
          fixed_temperature_C:
            node.boundary_type === 'fixed_temperature' && node.fixed_temperature_C != null
              ? 0
              : node.fixed_temperature_C,
        },
      ]),
    ),
  };

  const result = solveNetwork(probe, { scenarioId, powerScale: 1, settings });
  if (!result.ok) return null;

  const rise = result.temperatures[plateNodeId];
  return positive(rise) ? rise : null;
}

/**
 * Re-resolves every `spreading_disc` edge in `network` against the finite Bi its
 * own downstream path implies, writing the result as a scenario override.
 *
 * `network` is expected to be the solve-ready clone, already carrying the
 * scenario's boundary resistances. It is mutated; the stored graph is not.
 */
export function refineSpreadingWithBiot(
  network: ThermalNetwork,
  scenarioId: string,
  settings?: SolverSettings,
): SpreadingBiotRefinement[] {
  const spreadingEdges = Object.values(network.edges).filter(
    (edge) => edge.method === 'spreading_disc' && edge.enabled,
  );
  if (spreadingEdges.length === 0) return [];

  // One probe per plate, not one per edge: four parts on the same HSK base share
  // a downstream path and would otherwise pay for four identical solves.
  const downstream = new Map<string, number | null>();
  const refinements: SpreadingBiotRefinement[] = [];

  for (const edge of spreadingEdges) {
    const params = edge.parameters ?? {};
    const plateArea = params.plate_area_mm2;
    const k = params.k_W_mK;
    // An edge that is already unresolved has nothing to refine, and an edge a
    // person pinned by hand is not ours to move.
    const before = edgeResistance(edge, scenarioId);
    if (!positive(plateArea) || !positive(k) || !positive(before)) continue;
    if (edge.rth.active_source !== 'Analytical') continue;

    if (!downstream.has(edge.to)) {
      downstream.set(edge.to, downstreamResistance(network, edge.to, scenarioId, settings));
    }
    const R_down = downstream.get(edge.to);
    if (!positive(R_down)) continue;

    const plateArea_m2 = plateArea / 1e6;
    const h_eff = 1 / (R_down * plateArea_m2);

    // h is intensive, so N devices sharing a plate see the same h — but each
    // spreads inside its own share of it, and Bi is built on THAT radius,
    // because that is the b the series uses.
    const devices = positive(params.devices) ? params.devices : 1;
    const b = Math.sqrt(plateArea_m2 / devices / Math.PI);
    const bi = (h_eff * b) / k;
    if (!positive(bi)) continue;

    const computed = computeRth('spreading_disc', { ...params, bi });
    if (computed.value == null || !positive(computed.value)) continue;

    edge.parameters = { ...params, bi };
    edge.scenario_overrides = {
      ...edge.scenario_overrides,
      [scenarioId]: { ...edge.scenario_overrides?.[scenarioId], R_C_per_W: computed.value },
    };

    refinements.push({
      edge_id: edge.id,
      plate_node_id: edge.to,
      R_downstream_C_per_W: R_down,
      h_eff_W_m2K: h_eff,
      bi,
      R_before_C_per_W: before,
      R_after_C_per_W: computed.value,
    });
  }

  return refinements;
}
