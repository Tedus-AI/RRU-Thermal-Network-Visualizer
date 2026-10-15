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
 * from itself to the boundary, in °C/W, and for a linear network the answer is
 * exact rather than an iteration.
 *
 * The probe is run on the plate's DOWNSTREAM network only. Lee's h describes
 * the plate's far face, not every route out of the plate node — and the probe
 * used to solve the whole graph, assuming the component chains upstream
 * dead-end at their junctions. They do not when a part has a second route to
 * a boundary (its board, a lid to the housing, a heat pipe): then 1 W injected
 * at the plate ran back up through the very spreading edge being refined and
 * out the other way, R_down came out low, h_eff and Bi high, and the spreading
 * resistance was under-refined — the same optimistic direction Bi → ∞ errs in.
 * So the probe network is grown from the plate outwards (see
 * `downstreamNodes`): it follows any edge forwards, never steps back across a
 * spreading edge or into a component's own nodes, and stops at a fixed node.
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
import type { SolverSettings, ThermalEdge, ThermalNetwork, ThermalNode } from '../types';

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
function isPinned(node: ThermalNode | undefined): boolean {
  return node?.boundary_type === 'fixed_temperature' && node.fixed_temperature_C != null;
}

/**
 * The plate and everything downstream of it.
 *
 * Grown outwards from the plate over the edges that carry heat in this
 * scenario. Graph edges point the way the templates route heat — from the
 * source towards the fins — so any edge can be followed forwards. Backwards is
 * where the source side lives, so an edge is followed backwards only into a
 * shared-structure node (a housing, a cover, a board that is not a part), and
 * never across a spreading edge, whose `from` side is by definition the source
 * patch. A fixed node is a reservoir: it is included, and the walk stops there,
 * because nothing beyond a pinned temperature changes what the plate sees.
 */
export function downstreamNodes(
  network: ThermalNetwork,
  plateNodeId: string,
  scenarioId: string,
): Set<string> {
  const incident = new Map<string, ThermalEdge[]>();
  for (const edge of Object.values(network.edges)) {
    if (edge.from === edge.to) continue;
    if (edgeResistance(edge, scenarioId) == null) continue;
    for (const end of [edge.from, edge.to]) {
      const list = incident.get(end);
      if (list) list.push(edge);
      else incident.set(end, [edge]);
    }
  }

  const reached = new Set<string>([plateNodeId]);
  const queue = [plateNodeId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current !== plateNodeId && isPinned(network.nodes[current])) continue;
    for (const edge of incident.get(current) ?? []) {
      const forward = edge.from === current;
      const other = forward ? edge.to : edge.from;
      if (!network.nodes[other] || reached.has(other)) continue;
      if (!forward) {
        if (edge.method === 'spreading_disc') continue;
        if (network.nodes[other].component_ref) continue;
      }
      reached.add(other);
      queue.push(other);
    }
  }
  return reached;
}

export function downstreamResistance(
  network: ThermalNetwork,
  plateNodeId: string,
  scenarioId: string,
  settings?: SolverSettings,
): number | null {
  if (!network.nodes[plateNodeId]) return null;

  const downstream = downstreamNodes(network, plateNodeId, scenarioId);

  // A probe network, not the solve network: the plate's downstream nodes and
  // the edges among them, with the same conductances and only the sources
  // moved. The spreading edges INTO the plate are the ones being refined, so
  // they are never part of their own far-face boundary.
  const probe: ThermalNetwork = {
    ...network,
    nodes: Object.fromEntries(
      [...downstream].map((id) => {
        const node = network.nodes[id];
        return [
          id,
          {
            ...node,
            power_W: id === plateNodeId ? 1 : 0,
            // Only a node the real solve actually pins gets pinned here. A node
            // marked `fixed_temperature` with no value is NOT fixed, and turning
            // it into a 0 °C reservoir would invent a heat path.
            fixed_temperature_C: isPinned(node) ? 0 : node.fixed_temperature_C,
          },
        ];
      }),
    ),
    edges: Object.fromEntries(
      Object.entries(network.edges).filter(
        ([, edge]) =>
          downstream.has(edge.from) &&
          downstream.has(edge.to) &&
          !(edge.method === 'spreading_disc' && edge.to === plateNodeId),
      ),
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
  // An edge that is already unresolved has nothing to refine, and an edge a
  // person pinned by hand is not ours to move.
  const eligible = Object.values(network.edges).filter((edge) => {
    if (edge.method !== 'spreading_disc' || !edge.enabled) return false;
    const params = edge.parameters ?? {};
    return (
      positive(params.plate_area_mm2) &&
      positive(params.k_W_mK) &&
      positive(edgeResistance(edge, scenarioId)) &&
      edge.rth.active_source === 'Analytical'
    );
  });
  if (eligible.length === 0) return [];

  // One probe per plate, not one per edge: four parts on the same HSK base share
  // a downstream path and would otherwise pay for four identical solves.
  //
  // Plates are refined DOWNSTREAM FIRST. A boss on the base is a plate whose
  // own downstream contains the base's spreading edge; probed while that edge
  // still sat at its Bi → ∞ floor, the boss saw too strong a boundary. The
  // downstream resistance orders them — the base is always the shorter path —
  // and each plate is re-probed just before it is refined, so it sees every
  // refinement below it.
  const initial = new Map<string, number | null>();
  for (const edge of eligible) {
    if (!initial.has(edge.to)) {
      initial.set(edge.to, downstreamResistance(network, edge.to, scenarioId, settings));
    }
  }
  const plates = [...initial.entries()]
    .filter((entry): entry is [string, number] => positive(entry[1]))
    .sort((a, b) => a[1] - b[1])
    .map(([plate]) => plate);

  const refinements: SpreadingBiotRefinement[] = [];

  for (const [index, plate] of plates.entries()) {
    const R_down =
      index === 0 ? initial.get(plate) : downstreamResistance(network, plate, scenarioId, settings);
    if (!positive(R_down)) continue;

    for (const edge of eligible) {
      if (edge.to !== plate) continue;
      const refinement = refineEdge(edge, R_down, scenarioId);
      if (refinement) refinements.push(refinement);
    }
  }

  return refinements;
}

/**
 * Re-resolves one spreading edge against the downstream resistance of its plate.
 *
 * Exported for the heat-share domain refinement, which moves an edge's
 * `plate_area_mm2` and has to re-solve its Bi against the new domain.
 */
export function refineEdge(
  edge: ThermalEdge,
  R_down: number,
  scenarioId: string,
): SpreadingBiotRefinement | null {
  const params = edge.parameters ?? {};
  const plateArea = params.plate_area_mm2 as number;
  const k = params.k_W_mK as number;
  const before = edgeResistance(edge, scenarioId) as number;

  const plateArea_m2 = plateArea / 1e6;
  // h is taken off the WHOLE base: that is the area the downstream path cools.
  // An edge spreading into a reduced domain (see `spreadingDomain.ts`) carries
  // the base separately; for every other edge the two are the same plate.
  const baseArea = positive(params.base_area_mm2) ? params.base_area_mm2 : plateArea;
  const h_eff = 1 / (R_down * (baseArea / 1e6));

  // h is intensive, so N devices sharing a plate see the same h — but each
  // spreads inside its own share of it, and Bi is built on THAT radius,
  // because that is the b the series uses.
  const devices = positive(params.devices) ? params.devices : 1;
  const b = Math.sqrt(plateArea_m2 / devices / Math.PI);
  const bi = (h_eff * b) / k;
  if (!positive(bi)) return null;

  const computed = computeRth('spreading_disc', { ...params, bi });
  if (computed.value == null || !positive(computed.value)) return null;

  edge.parameters = { ...params, bi };
  edge.scenario_overrides = {
    ...edge.scenario_overrides,
    [scenarioId]: { ...edge.scenario_overrides?.[scenarioId], R_C_per_W: computed.value },
  };

  return {
    edge_id: edge.id,
    plate_node_id: edge.to,
    R_downstream_C_per_W: R_down,
    h_eff_W_m2K: h_eff,
    bi,
    R_before_C_per_W: before,
    R_after_C_per_W: computed.value,
  };
}
