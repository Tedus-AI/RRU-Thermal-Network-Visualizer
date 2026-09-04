/**
 * Which node a component's thermal limit is judged at.
 *
 * The limit and the limit TYPE are two halves of one statement: 95 °C means
 * nothing until you say 95 °C measured where. A datasheet that gives Tc 95 is
 * making a claim about the package case, and a part can sit well inside it
 * while its junction — which the datasheet never bounded — runs hotter.
 *
 * The graph used to put the limit on the heat source and stop there, so a
 * junction-based part with a CASE limit had its 95 °C compared against its
 * JUNCTION temperature. That is not conservative, it is a different question:
 * reported on the real STARKCORE project, the 2GB_DDR read Tj 96.9 against a
 * Tc 95 limit and came back −1.9 K over, when its lid was at 89 and the part
 * had 6 K of margin on the number the datasheet actually states.
 *
 * The rule is the same one the templates are already built around: every
 * template starts `JUNCTION --package_rjc--> <exit face>`, and that exit face
 * IS the case — the CASE of a coined part, the E-PAD of a via part, the LID of
 * a lidded one, the METAL_BASE of a bolted module. So Tj stays on the junction
 * and Tc/Tb/Ts move one step down, across the Rjc.
 *
 * Two shapes need no move and get none. A body-sourced part has had its
 * junction stripped by `withoutJunction`, so its exit face already IS its heat
 * source. And CUSTOM has no `package_rjc` edge to cross. Both fall back to the
 * source node, which is where their limit belongs anyway.
 */

import type { LimitType } from '@/domain/component';

import type { ThermalTemplate } from '../templates/types';
import type { ThermalNetwork } from '../types';

/** Limit types that name a surface rather than the die behind the Rjc. */
function crossesRjc(limitType: LimitType | null | undefined): boolean {
  return limitType != null && limitType !== 'Tj';
}

/**
 * The template role that carries the limit, given the component's limit type.
 *
 * Null when the template has no heat source at all, which no shipped template
 * does — but a malformed one would otherwise silently put the limit nowhere.
 */
export function limitReferenceRole(
  template: ThermalTemplate,
  limitType: LimitType | null | undefined,
): string | null {
  const source = template.nodes.find((node) => node.heatSource);
  if (!source) return null;
  if (!crossesRjc(limitType)) return source.role;

  const rjc = template.edges.find(
    (edge) => edge.fromRole === source.role && edge.type === 'package_rjc',
  );
  if (!rjc) return source.role;
  // A port is not a node and cannot hold a limit; only cross to a real node.
  return template.nodes.some((node) => node.role === rjc.toRole) ? rjc.toRole : source.role;
}

/**
 * The same step taken on a network that already exists.
 *
 * Roles are not stored on nodes, so this walks the built graph instead: from
 * the source node, out along its own `package_rjc` edge. Per-instance by
 * construction — a ×4 part has four junctions and four Rjc edges, and each
 * lands on its own case.
 *
 * Edges are read regardless of `enabled`: switching an Rjc off is a modelling
 * choice about heat flow, not a statement that the case has stopped existing.
 */
export function limitReferenceNodeId(
  network: ThermalNetwork,
  sourceNodeId: string,
  limitType: LimitType | null | undefined,
): string {
  if (!crossesRjc(limitType)) return sourceNodeId;

  for (const edge of Object.values(network.edges)) {
    if (edge.type !== 'package_rjc' || edge.from !== sourceNodeId) continue;
    if (network.nodes[edge.to]) return edge.to;
  }
  return sourceNodeId;
}
