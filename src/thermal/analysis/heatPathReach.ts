/**
 * Where a set of nodes' heat actually goes.
 *
 * A picture captioned as one part's — or one board's — heat path used to draw
 * every shared node the component filter did not remove: the heatsink base, the
 * fin surface, ambient. For the RF, digital and power boards that is right,
 * because their heat runs through the base and out of the fins, so the tail IS
 * their path.
 *
 * It is wrong for the cavity filter. The base runs hotter than the filter body,
 * so heat crosses that contact INTO the filter and leaves again through the
 * filter's own convection to ambient. Drawing `HSK Base -> Fin Surface ->
 * Ambient` after it invites the reader to conclude the filter is cooled by the
 * fins, when the arrow beside it says the opposite.
 *
 * So a figure follows the heat instead of the wiring: out from the subject's
 * own nodes along each edge in the direction the solver actually found, and
 * everything reached that way is the subject's path. A node on the OTHER side
 * of an edge that flows inward is kept as well, because "this heat arrives from
 * the heatsink base" is the finding, but the walk stops there -- what happens
 * beyond a node that is FEEDING this subject is some other subject's story.
 *
 * Without a solution there are no directions to follow, so nothing is trimmed
 * and the caller's own filtering stands. A FAILED solve counts as none: it has
 * no edge results, and reading that as "no edge carries heat" cut every chain
 * at its first shared node.
 */

import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

export function heatPathReach(input: {
  network: ThermalNetwork;
  /** The solve whose flow directions say where the heat goes; null trims nothing. */
  solution: ThermalSolution | null | undefined;
  /** The subject's own nodes — where the walk starts. */
  own: ReadonlySet<string>;
  /**
   * Nodes the caller has already put away, so the walk cannot route through
   * them: a hidden duplicate instance, or another component's chain.
   */
  excluded?: ReadonlySet<string>;
}): Set<string> {
  const { network, solution, own, excluded } = input;
  const isExcluded = (id: string) => Boolean(excluded?.has(id));

  const keep = new Set(own);
  const usable =
    solution != null &&
    solution.status !== 'FAILED' &&
    Object.keys(solution.edge_results ?? {}).length > 0;
  if (!usable) {
    for (const node of Object.values(network.nodes)) {
      if (!node.disabled && !isExcluded(node.id)) keep.add(node.id);
    }
    return keep;
  }

  const edges = Object.values(network.edges).filter(
    (edge) => edge.enabled && !isExcluded(edge.from) && !isExcluded(edge.to),
  );

  const frontier = [...own];
  const walked = new Set(own);
  while (frontier.length > 0) {
    const current = frontier.pop() as string;
    for (const edge of edges) {
      if (edge.from !== current && edge.to !== current) continue;
      const other = edge.from === current ? edge.to : edge.from;
      const result = solution.edge_results[edge.id];
      // No heat flowing: the node is adjacent structure worth showing, but
      // there is nothing to follow past it. No RESULT is different. A current
      // solve has one for every enabled edge, so a missing one is an edge added
      // since the solve ran, and a direction nobody knows yet is no reason to
      // cut the chain short there -- the walk goes on through it, as it would
      // with no solve at all, until a re-solve says which way it runs.
      const reversed = result?.actual_direction === 'reverse';
      const upstreamEnd = reversed ? edge.to : edge.from;
      const flowsOutward = result
        ? upstreamEnd === current && result.actual_direction !== 'zero'
        : true;

      keep.add(other);
      if (flowsOutward && !walked.has(other)) {
        walked.add(other);
        frontier.push(other);
      }
    }
  }
  return keep;
}
