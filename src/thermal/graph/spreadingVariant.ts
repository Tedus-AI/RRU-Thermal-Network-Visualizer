/**
 * Which temperature a spreading edge reports for its source patch: the peak
 * under the source (Ψ_max) or the average over the patch (Ψ_avg).
 *
 * Lee's series is solved for a UNIFORM-FLUX source, and under uniform flux the
 * centre of the patch is the hottest point. That is the right reading when a
 * junction sits above the edge: the die hangs off the hottest point of the
 * patch, and sizing its margin against the average would flatter it. So Ψ_max
 * stays the default.
 *
 * It is the wrong reading for a part that IS a metal body — a power module's
 * baseplate, a filter or circulator housing, built as Metal Base + Interface
 * with no junction (`isBodySourced`). That body is the isothermal source the
 * component model already says it is, and an isothermal source does not have a
 * hot centre for the plate to report: its constriction resistance is BELOW the
 * uniform-flux average (≈ 0.925× on a half-space), so Ψ_avg is still the
 * conservative side of it, while Ψ_max adds a centre peak the metal face
 * cannot carry. On the STARKCORE half-brick module (61 × 58 mm into a
 * 339 × 272 × 7 mm base at Bi 0.084) that peak is 1.0 °C of a 5.75 °C step.
 *
 * Whatever the default, an engineer's own choice in the Edge Inspector is
 * pinned on the edge and nothing here overrides it.
 */

import type { SpreadingVariant } from '../resistance/spreading';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '../types';
import { MOUNT_OWNER_KEY } from './componentMount';

/** Set on an edge whose variant an engineer picked; the default no longer applies. */
export const PSI_VARIANT_PINNED_KEY = 'psi_variant_pinned';

/**
 * The component port a node belongs to. A boss or a local plate hands the base
 * its own face, so a spreading edge may start on a mount node; the part it
 * carries is the port that owns that mount.
 */
function portNodeOf(network: ThermalNetwork, nodeId: string): ThermalNode | undefined {
  const node = network.nodes[nodeId];
  const owner = node?.metadata?.[MOUNT_OWNER_KEY];
  return typeof owner === 'string' ? (network.nodes[owner] ?? node) : node;
}

const componentOf = (node: ThermalNode): string | undefined =>
  node.origin?.component_id ?? node.component_ref;

/**
 * True when the heat reaching `nodeId` comes from a metal body with no junction
 * in front of it: a Metal Base + Interface subgraph built without its junction.
 *
 * Read off the graph rather than the component record, because the graph is
 * what gets solved: a part re-stated in Screen 04 but not yet rebuilt still has
 * the topology it was built with, and the variant has to match that topology.
 */
export function isMetalBodySource(network: ThermalNetwork, nodeId: string): boolean {
  const port = portNodeOf(network, nodeId);
  if (!port || port.origin?.template_id !== 'DIRECT_METAL') return false;
  const componentId = componentOf(port);
  if (!componentId) return false;
  return !Object.values(network.nodes).some(
    (node) => node.type === 'junction' && componentOf(node) === componentId,
  );
}

/** The variant a spreading edge starting at `fromNodeId` gets when nobody chose one. */
export function defaultSpreadingVariant(
  network: ThermalNetwork,
  fromNodeId: string,
): SpreadingVariant {
  return isMetalBodySource(network, fromNodeId) ? 'avg' : 'max';
}

export function isSpreadingVariantPinned(edge: Pick<ThermalEdge, 'metadata'>): boolean {
  return edge.metadata?.[PSI_VARIANT_PINNED_KEY] === true;
}

/** The variant an existing edge should carry: the pinned choice, else the default. */
export function spreadingVariantFor(
  network: ThermalNetwork,
  edge: Pick<ThermalEdge, 'from' | 'parameters' | 'metadata'>,
): SpreadingVariant {
  if (isSpreadingVariantPinned(edge)) {
    return edge.parameters?.psi_variant === 'avg' ? 'avg' : 'max';
  }
  return defaultSpreadingVariant(network, edge.from);
}
