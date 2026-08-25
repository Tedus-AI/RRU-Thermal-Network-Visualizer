/**
 * What the Thermal Role tab may offer for a given node — 05 §26.
 *
 * The panel used to ask a single question: did a template build this node? If
 * yes the fields were read-only, if no they were editable. That let the shared
 * structure through, because the HSK Base and the Fin Surface are built by the
 * structure preset rather than by a template, and a fully editable Source Power
 * on a heat-sink base is not a cosmetic problem:
 *
 *   `buildSolveInput` sums `power_W` over EVERY node and injects the total. It
 *   does not ask whether the node belongs to a component. A watt typed into the
 *   HSK Base is heat arriving from nowhere — it lifts every temperature
 *   downstream and inflates the figure the energy balance is checked against,
 *   with nothing on screen to say where it came from.
 *
 * So the question is now what the node IS, not where it came from.
 */

import type { NodeType, ThermalNode } from '@/thermal/types';

export type NodeRoleMode =
  /** End of the path. Screen 06 owns its temperature; nothing to author. */
  | 'boundary'
  /** A plate, a fin, a zone. Never a source; may still carry a design limit. */
  | 'structure'
  /** A component's heat source. Screen 04 owns power and limit. */
  | 'derived_source'
  /** A component's case, TIM, coin… — no power and no limit of its own. */
  | 'derived_passive'
  /** Drawn by hand. The escape hatch, and the only fully editable mode. */
  | 'manual';

/**
 * Structure, not a part.
 *
 * Keyed on the node type rather than on `origin.kind`, because a zone added by
 * hand from the Shared Structure panel is stamped `manual` and is every bit as
 * structural as one the preset built.
 *
 * `custom` is deliberately absent: it is the escape hatch, and someone
 * modelling a busbar, a cable or a chassis loss as a custom node has a real
 * source that belongs to no component and must stay editable.
 */
export const STRUCTURAL_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'heat_sink_base',
  'fin_surface',
  'base_zone',
  'small_base',
  'housing',
  'heat_pipe_evaporator',
  'heat_pipe_condenser',
]);

export function isBoundaryRoleNode(node: ThermalNode): boolean {
  return node.type === 'ambient' || node.boundary_role === 'placeholder';
}

/**
 * A node built from a template carries the component's numbers, copied at build
 * time (`networkBuilder` sets power, limit and limit type from Screen 04).
 */
function derivedFromComponent(node: ThermalNode): boolean {
  return node.origin?.kind === 'template' && Boolean(node.component_ref);
}

function carriesSourceData(node: ThermalNode): boolean {
  return node.power_W > 0 || node.limit_C != null || node.limit_type != null;
}

/**
 * Boundary and structure are decided first, and deliberately outrank origin: a
 * template that puts a `housing` node on a component (DIRECT_METAL does) still
 * must not offer a source power on it.
 */
export function nodeRoleMode(node: ThermalNode): NodeRoleMode {
  if (isBoundaryRoleNode(node)) return 'boundary';
  if (STRUCTURAL_NODE_TYPES.has(node.type)) return 'structure';
  if (derivedFromComponent(node)) {
    return carriesSourceData(node) ? 'derived_source' : 'derived_passive';
  }
  return 'manual';
}

/** True only where a person may type a watt figure. */
export function allowsSourcePower(node: ThermalNode): boolean {
  return nodeRoleMode(node) === 'manual';
}

/**
 * A structural node's stored power is shown, never silently zeroed — it is the
 * user's data, and quietly discarding it would hide the very thing that needs
 * fixing. This flags the case so the panel can say what it costs.
 */
export function hasStrayStructuralPower(node: ThermalNode): boolean {
  const mode = nodeRoleMode(node);
  return (mode === 'structure' || mode === 'boundary') && node.power_W > 0;
}
