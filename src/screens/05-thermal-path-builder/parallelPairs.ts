/**
 * A parallel pair that NO bus is drawing, and the brace that names it.
 *
 * Two edges between the same two nodes are the one place on these graphs where
 * the arithmetic is not obvious: 0.322 beside 0.065 is 0.054, not 0.387 and not
 * 0.194. The bus already writes that combination out where four or more
 * branches fan onto one bar — but a bar only forms at four, so filtering the
 * graph down to a single component dissolves it, and the combination went with
 * it. That was backwards: the pair is a property of the network, not of the bar
 * that happens to be drawn over it, and reading one part's chain is exactly
 * when the combination matters most.
 *
 * This module is shared by Screens 05, 06 and 07 so the three cannot drift. 06
 * renders through 05's canvas, so there are two call sites for three screens.
 *
 * It draws a BRACE rather than a floating caption: an extra dotted arc between
 * the same two nodes, bowed wider than the branches, carrying the combination
 * as its own label. Cytoscape places an edge label on the curve itself, so the
 * value is tied to the pair it belongs to by a line the reader can follow —
 * and, unlike a free-standing note, it can never be left behind at a stale
 * coordinate when a layout moves the nodes.
 */

import type { ElementDefinition } from 'cytoscape';

import { MOUNT_ROLE_KEY } from '@/thermal/graph/componentMount';
import type { ThermalEdge, ThermalNetwork } from '@/thermal/types';

const EDGE_SHORT: Record<string, string> = {
  package_rjc: 'Rjc',
  package_rjb: 'Rjb',
  package_rja: 'Rja',
  conduction: 'Cond',
  tim: 'TIM',
  solder: 'Solder',
  thermal_via: 'Via',
  contact: 'Contact',
  spreading: 'Spreading',
  heat_pipe: 'Heat Pipe',
  convection: 'Conv',
  radiation: 'Rad',
  custom: 'Custom',
};

/**
 * Mount edges whose type alone names them wrongly.
 *
 * A vapour chamber is built as a `heat_pipe` edge — the same two-phase vendor
 * resistance — and read "Heat Pipe" on a chain that has no heat pipe in it. The
 * interface under a mount is a `tim` edge, and read "TIM" right after the
 * part's own TIM, as if the part had two; the field that sets it in Screen 04
 * is called the joint, so the graph calls it "Joint TIM" — or "Joint Contact"
 * when nothing is between the metal faces.
 */
const MOUNT_ROLE_SHORT: Record<string, (edge: ThermalEdge) => string> = {
  VAPOR_CHAMBER: () => 'Vapour Chamber',
  BASE_JOINT: (edge) => (edge.type === 'tim' ? 'Joint TIM' : 'Joint Contact'),
};

/**
 * What a branch is called on the graph — "Spreading", "Heat Pipe ×2".
 *
 * Two lines converging on the same bar are indistinguishable without it: the
 * pair of numbers alone says nothing about WHICH route is which, and the whole
 * point of drawing the pair is that the reader can see where the heat prefers
 * to go. The pipe count rides on the name because `R` is already the combined
 * value for all of them, and a lone 0.065 beside a 0.13 datasheet figure is a
 * discrepancy the reader would otherwise have to work out.
 *
 * Shared with Screen 07, which draws the same branches over the solved graph.
 */
export function branchShortName(edge: ThermalEdge): string {
  const role = edge.metadata?.[MOUNT_ROLE_KEY];
  if (typeof role === 'string' && MOUNT_ROLE_SHORT[role]) return MOUNT_ROLE_SHORT[role](edge);
  const base = EDGE_SHORT[edge.type] ?? edge.type;
  const pipes = edge.parameters?.pipes;
  return edge.type === 'heat_pipe' && typeof pipes === 'number' && pipes > 1
    ? `${base} ×${pipes}`
    : base;
}

/**
 * True when this edge's resistance is a Bi → ∞ FLOOR rather than an answer.
 *
 * Screens 05 and 06 have no boundary condition — h on the far face is Screen
 * 06's data and Bi = h·b/k cannot be formed without it — so a disc-spreading
 * edge is built at Bi → ∞, a perfectly cooled far face. That is the smallest
 * spreading the model can produce, so it is a lower bound, and Screen 07
 * re-solves the same edge at the Bi the scenario actually implies.
 *
 * On the STARKCORE FPGA the two differ by 5.7× — 0.057 against 0.322 °C/W — and
 * the pair's combination with the heat pipe by 1.8× — 0.030 against 0.054. The
 * numbers were always documented as a floor in the edge's own resolution note,
 * but the graph printed them like any other resistance, so 05 and 07 read as
 * though they simply disagreed. A `≥` is the whole fix: it says the value can
 * only go up, which is exactly what Screen 07 then does to it.
 */
export function isSpreadingFloor(edge: ThermalEdge | undefined): boolean {
  return edge?.method === 'spreading_disc' && edge.parameters?.bi == null;
}

/** `≥` where any branch of the combination is only a floor. */
export function floorPrefix(network: ThermalNetwork, edgeIds: readonly string[]): string {
  return edgeIds.some((id) => isSpreadingFloor(network.edges[id])) ? '≥' : '';
}

/**
 * How far the brace bows past the straight line between the pair, px.
 *
 * Cytoscape fans parallel edges apart by `control-point-step-size` (40 px), so
 * a pair of branches reaches about 20 px either side. This clears the outer one
 * and leaves room for the label between them and it.
 */
export const PARALLEL_BRACE_BOW_PX = 104;

/**
 * How far apart the two branches of a bus-less pair are drawn, px.
 *
 * Cytoscape fans siblings apart on its own, but the direction it picks is an
 * implementation detail — and relying on it put each label on the WRONG side of
 * its own curve, so the two converged on one spot in the middle of the gap
 * instead of separating. The curve and the label that names it have to be
 * placed by the same number or they cannot disagree.
 */
const PARALLEL_BRANCH_SPREAD_PX = 44;

/** How far a branch's label sits beyond its own curve, px. */
const PARALLEL_BRANCH_LABEL_PX = 14;

/**
 * The bow and the label offset for branch `index` of `count`, in one place.
 *
 * Symmetric about the straight line between the nodes, so a pair reads as two
 * routes of equal standing rather than one route with a detour. Each label is
 * pushed further out on ITS OWN side, which is the whole point: on a short span
 * the gap between two boxes is all the room there is, and two labels aimed at
 * the middle of it land on top of each other.
 */
export function parallelBranchGeometry(
  index: number,
  count: number,
): { bow: number; labelMargin: number } {
  const bow = (index - (count - 1) / 2) * PARALLEL_BRANCH_SPREAD_PX;
  return {
    bow,
    labelMargin: Math.sign(bow) * PARALLEL_BRANCH_LABEL_PX,
  };
}

export interface ParallelPair {
  /** Stable element id, derived from the node pair. */
  id: string;
  from: string;
  to: string;
  /** In network order, so the brace names them the way they are drawn. */
  edgeIds: string[];
}

/**
 * Node pairs joined by more than one enabled edge that the bus is not drawing.
 *
 * Keyed by the ORDERED pair, because "parallel" means precisely "between the
 * same two nodes, the same way round" — that is what makes the two share a ΔT
 * and lets their conductances add. Two edges that merely touch the same nodes
 * in opposite directions are a loop, not a parallel pair, and combining them
 * would be wrong.
 */
export function parallelPairs(
  network: ThermalNetwork,
  hidden: ReadonlySet<string>,
  /** Edges the bus already routes and captions; it owns those combinations. */
  routed: ReadonlySet<string> | ReadonlyMap<string, unknown>,
): ParallelPair[] {
  const isRouted = (id: string) =>
    routed instanceof Set ? routed.has(id) : (routed as ReadonlyMap<string, unknown>).has(id);

  const byPair = new Map<string, ParallelPair>();
  for (const edge of Object.values(network.edges)) {
    if (!edge.enabled) continue;
    if (isRouted(edge.id)) continue;
    if (hidden.has(edge.from) || hidden.has(edge.to)) continue;
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    const key = `${edge.from}\u0000${edge.to}`;
    const pair = byPair.get(key);
    if (pair) pair.edgeIds.push(edge.id);
    else
      byPair.set(key, {
        id: `PARALLEL_BRACE_${edge.from}__${edge.to}`,
        from: edge.from,
        to: edge.to,
        edgeIds: [edge.id],
      });
  }

  return [...byPair.values()].filter((pair) => pair.edgeIds.length > 1);
}

/**
 * The branches by name, joined by what the combination DOES to them.
 *
 * "Spreading ∥ Heat Pipe ×2" is the half of the answer a bare `∥ 0.054 °C/W`
 * never gave: which two of the lines on screen it was computed from. The names
 * are the same ones the branches themselves carry, so the reader matches them
 * by reading, not by tracing curves.
 *
 * The connector states the operation, and it differs by quantity: resistances
 * combine in parallel, flows add, and a pair shares one ΔT rather than
 * combining at all.
 */
export function parallelPairNames(
  network: ThermalNetwork,
  edgeIds: readonly string[],
  quantity: 'rth' | 'heat_flow' | 'delta_t' | 'none' = 'rth',
): string {
  const names = edgeIds
    .map((id) => network.edges[id])
    .filter((edge): edge is ThermalEdge => edge != null)
    .map((edge) => branchShortName(edge));
  if (names.length < 2) return '';
  const joiner = quantity === 'heat_flow' ? ' + ' : quantity === 'delta_t' ? ', ' : ' ∥ ';
  return names.join(joiner);
}

/**
 * The brace itself: a dotted arc over the pair, labelled with the combination.
 *
 * `unbundled-bezier` with an explicit control point, rather than the automatic
 * fan Cytoscape gives sibling edges — the automatic one would tuck the brace
 * BETWEEN the two branches, where it reads as a third route rather than as a
 * bracket over both.
 */
export function parallelBraceElement(
  pair: ParallelPair,
  label: string,
  color: string,
  /** Wider on Screen 08 when a branch carries a rank badge under the brace. */
  bow: number = PARALLEL_BRACE_BOW_PX,
): ElementDefinition {
  return {
    group: 'edges',
    data: {
      id: pair.id,
      source: pair.from,
      target: pair.to,
      label,
      color,
      // Read by the stylesheet, so one constant governs the bow and the
      // clearance the branches need beneath it.
      bow,
    },
    classes: 'view-only parallel-brace',
    selectable: false,
  };
}

/**
 * The one stylesheet rule both canvases use for the brace.
 *
 * Dotted and thin so it never reads as a route carrying heat, and painted under
 * the branches it brackets. Its label is upright rather than rotated along the
 * curve: it is a statement about the pair, not a name for a line.
 */
export function parallelBranchStyles() {
  return [
    {
      // `parallel-pair-branch`, not `parallel-branch`: that name is already
      // 05's, for a bus branch whose label is drawn by a separate anchor node —
      // and whose stylesheet rule therefore BLANKS the edge's own label. Reusing
      // it silently erased every label on a bus-less pair.
      selector: 'edge.parallel-pair-branch',
      style: {
        // Bowed by OUR number, not Cytoscape's own fan, so the label offset
        // below is guaranteed to be on the same side as the curve it names.
        'curve-style': 'unbundled-bezier',
        'control-point-distances': 'data(bow)',
        'control-point-weights': 0.5,
        // Upright, not rotated along the curve: on a short bowed span an
        // autorotated label slides along its arc and ends up over the box at
        // one end, which is what a named branch did the moment it got longer.
        'text-rotation': 'none',
        'text-margin-y': 'data(labelMargin)',
        'text-background-opacity': 1,
      },
    },
  ];
}

export function parallelBraceStyle(color: string) {
  return {
    selector: 'edge.parallel-brace',
    style: {
      width: 1,
      'line-color': color,
      'line-style': 'dotted',
      'curve-style': 'unbundled-bezier',
      'control-point-distances': 'data(bow)',
      'control-point-weights': 0.5,
      'target-arrow-shape': 'none',
      'source-arrow-shape': 'none',
      label: 'data(label)',
      'font-size': 9,
      'font-weight': 600,
      color,
      'text-rotation': 'none',
      'text-background-color': '#ffffff',
      'text-background-opacity': 1,
      'text-background-padding': '3px',
      'text-wrap': 'wrap',
      // At the apex of the arc, clear of both branches beneath it.
      'text-margin-y': 0,
      events: 'no',
      'z-index': 3,
    },
  };
}
