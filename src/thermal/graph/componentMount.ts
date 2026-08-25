/**
 * The attachment between a component's HEAT_OUT and the shared heat-sink base.
 *
 * WHY THIS IS ITS OWN THING
 * -------------------------
 * A heat path answers "where does heat leave the part". It stops at HEAT_OUT.
 * What happens between there and the base is a mechanical decision with nothing
 * to do with the package: the same PA can sit flat on the base, on a machined
 * boss, or on a local plate fed by a heat pipe.
 *
 * Modelling that as more heat paths would have meant four paths x four mounts =
 * sixteen templates. As its own axis it is four plus four. It also dissolves the
 * confusion between the `pedestal` and `small_base` node types: both are mounts,
 * and they only ever looked like different things because one template emitted
 * each.
 *
 * WHERE HEAT_OUT ACTUALLY IS
 * --------------------------
 * HEAT_OUT is the far side of the component's own TIM, so it is already the
 * surface the mount presents — the top of the boss, or the top of the local
 * plate. There is no extra contact joint to add between the two; the TIM edge
 * upstream has already crossed that gap. Adding one would have counted the same
 * interface twice.
 *
 * WHAT EACH MOUNT BUILDS
 * ----------------------
 *   Direct             HEAT_OUT ─spreading→ base
 *   Pedestal           HEAT_OUT ─L/kA up the boss→ Boss Root ─spreading→ base
 *   SmallBaseHeatPipe  HEAT_OUT ─L/kA through the plate→ Small Base
 *                      ─heat pipe→ Condenser ─contact→ base
 *   HeatPipeOnly       HEAT_OUT ─heat pipe→ Condenser ─contact→ base
 *
 * The final step into the base is added by the caller for the first two, and it
 * is the Lee spreading edge (`hskBaseConnection`). The area it spreads from is
 * then the MOUNT's footprint rather than the component's, which falls out for
 * free: `terminalArea()` reads the last edge into the node the spreading edge
 * starts at, and for a boss that is the boss conduction edge.
 *
 * A heat pipe does not spread into the base the way a bolted block does — it
 * delivers to a condenser whose joint is a clamped contact. So the two
 * heat-pipe mounts finish themselves and never reach the spreading model.
 *
 * NOTHING HERE INVENTS A NUMBER
 * -----------------------------
 * Every edge is built with its parameters and left to `computeRth`. A missing
 * boss height or an unquoted heat-pipe resistance produces an UNRESOLVED edge
 * naming the field, and the topology is drawn regardless — the graph is always
 * complete, the numbers arrive when someone states them (05 §61).
 */

import { emptyMount, mountHasHeatPipe, type MountSpec, type MountType } from '@/domain/component';
import type { MaterialDefaults } from '@/domain/materials';
import { computeRth } from '../resistance/calculators';
import { createRth } from '../rth';
import type { ThermalEdge, ThermalNode } from '../types';

/** Marks every node and edge a mount owns, so a rebuild can find them all. */
export const MOUNT_OWNER_KEY = 'mount_for';
/** Which step of the chain an edge is, for the inspector and for debugging. */
export const MOUNT_ROLE_KEY = 'mount_role';
/**
 * Where the component's mount rides on its HEAT_OUT node.
 *
 * `connectPort` needs the mount but is called with a node id, not a component.
 * Rather than widen its signature at every call site, `networkBuilder` — the
 * one place component data enters the graph — stamps the spec here. A mount
 * changed in Screen 04 therefore reaches Screen 05 by the same rebuild that
 * carries a changed power or limit.
 */
export const MOUNT_SPEC_KEY = 'mount_spec';

/** Reads the stamped spec back, defaulting to Direct for anything older. */
export function mountOf(node: { metadata?: Record<string, unknown> }): MountSpec {
  const stored = node.metadata?.[MOUNT_SPEC_KEY];
  return stored && typeof stored === 'object'
    ? { ...emptyMount(), ...(stored as MountSpec) }
    : emptyMount();
}

export interface MountChain {
  nodes: ThermalNode[];
  edges: ThermalEdge[];
  /**
   * Where the caller's spreading edge into the base must start. For `Direct`
   * this is the port node itself; otherwise it is the last node the mount built.
   */
  entryNodeId: string;
  /**
   * False when the chain already reaches the base on its own, which is the case
   * for both heat-pipe mounts: their last edge is the condenser joint, and a
   * spreading edge on top of it would be a second path into the same plate.
   */
  needsBaseEdge: boolean;
}

const mountNodeId = (portNodeId: string, role: string) =>
  `NODE_MOUNT_${portNodeId.replace(/^NODE_/, '')}_${role}`;

/**
 * The `EDGE_PORT_` prefix is deliberate: the store's disconnect path already
 * sweeps edges by that prefix, so a mount edge cannot outlive the connection
 * that created it.
 */
const mountEdgeId = (portNodeId: string, role: string) =>
  `EDGE_PORT_MOUNT_${portNodeId.replace(/^NODE_/, '')}_${role}`;

function mountNode(
  portNodeId: string,
  role: string,
  name: string,
  type: ThermalNode['type'],
  componentRef: string | undefined,
): ThermalNode {
  return {
    id: mountNodeId(portNodeId, role),
    name,
    type,
    component_ref: componentRef,
    power_W: 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    zone_id: null,
    ports: [],
    origin: { kind: 'template', component_id: componentRef },
    metadata: { [MOUNT_OWNER_KEY]: portNodeId },
  };
}

function mountEdge(
  portNodeId: string,
  role: string,
  from: string,
  to: string,
  spec: {
    type: ThermalEdge['type'];
    method: ThermalEdge['method'];
    parameters: NonNullable<ThermalEdge['parameters']>;
    missingNote: string;
  },
): ThermalEdge {
  const computed = computeRth(spec.method, spec.parameters);
  return {
    id: mountEdgeId(portNodeId, role),
    from,
    to,
    type: spec.type,
    method: spec.method,
    rth: createRth(computed.value, 'Analytical', computed.value == null ? 'low' : 'medium'),
    parameters: spec.parameters,
    heat_flow_W: null,
    delta_T_C: null,
    resolution: computed.resolution,
    resolution_note: computed.missing.length > 0 ? spec.missingNote : computed.note,
    enabled: true,
    origin: { kind: 'template' },
    metadata: { [MOUNT_OWNER_KEY]: portNodeId, [MOUNT_ROLE_KEY]: role },
  };
}

/** True for anything a given port's mount created. */
export function isOwnedByMount(
  item: { metadata?: Record<string, unknown> },
  portNodeId: string,
): boolean {
  return item.metadata?.[MOUNT_OWNER_KEY] === portNodeId;
}

/** True for anything any mount created. */
export function belongsToSomeMount(item: { metadata?: Record<string, unknown> }): boolean {
  return typeof item.metadata?.[MOUNT_OWNER_KEY] === 'string';
}

function footprintMm2(mount: MountSpec): number | null {
  const { contact_L_mm: L, contact_W_mm: W } = mount;
  return L != null && W != null && L > 0 && W > 0 ? L * W : null;
}

/**
 * Builds the chain for one port. `Direct` adds nothing and hands the port node
 * straight back, which is exactly what the caller did before mounts existed —
 * so an unchanged project keeps an unchanged graph.
 */
export function buildMountChain(input: {
  portNodeId: string;
  targetNodeId: string;
  componentRef: string | undefined;
  mount: MountSpec;
  materials: MaterialDefaults;
}): MountChain {
  const { portNodeId, targetNodeId, componentRef, mount, materials } = input;
  const type: MountType = mount.type;

  if (type === 'Direct') {
    return { nodes: [], edges: [], entryNodeId: portNodeId, needsBaseEdge: true };
  }

  const nodes: ThermalNode[] = [];
  const edges: ThermalEdge[] = [];
  const area = footprintMm2(mount);
  // A boss and a local plate are machined from the heat sink, so they are the
  // heat sink's metal. Asking for a second conductivity per component would
  // invite two answers for one piece of aluminium.
  const k = materials.hsk_base_k_W_mK.value;

  let cursor = portNodeId;

  if (type === 'Pedestal' || type === 'SmallBaseHeatPipe') {
    const isBoss = type === 'Pedestal';
    const block = mountNode(
      portNodeId,
      isBoss ? 'PEDESTAL' : 'SMALL_BASE',
      isBoss ? 'Mount Boss Root' : 'Small Base',
      isBoss ? 'pedestal' : 'small_base',
      componentRef,
    );
    nodes.push(block);

    // Straight down through the metal. For a boss `height_mm` is how far it
    // stands proud of the base; for a local plate it is the plate thickness.
    edges.push(
      mountEdge(portNodeId, 'BLOCK', cursor, block.id, {
        type: 'conduction',
        method: 'conduction_LkA',
        parameters: {
          ...(mount.height_mm != null ? { length_mm: mount.height_mm } : {}),
          ...(k != null ? { k_W_mK: k } : {}),
          ...(area != null ? { area_mm2: area } : {}),
        },
        missingNote: isBoss
          ? 'Boss height and footprint come from Screen 04; the metal k from Screen 01.'
          : 'Small base thickness and footprint come from Screen 04; the metal k from Screen 01.',
      }),
    );
    cursor = block.id;
  }

  if (mountHasHeatPipe(type)) {
    const condenser = mountNode(
      portNodeId,
      'HP_CONDENSER',
      'Heat Pipe Condenser',
      'heat_pipe_condenser',
      componentRef,
    );
    nodes.push(condenser);

    edges.push(
      mountEdge(portNodeId, 'HEAT_PIPE', cursor, condenser.id, {
        type: 'heat_pipe',
        method: 'direct_rth',
        parameters:
          mount.heat_pipe_R_C_per_W != null ? { R_C_per_W: mount.heat_pipe_R_C_per_W } : {},
        missingNote:
          'Heat pipe resistance is a vendor number and cannot be derived from geometry. State it in Screen 04.',
      }),
    );
    cursor = condenser.id;

    // The condenser's own joint to the base: a clamped contact, not a source
    // patch spreading into a plate, so the Lee model does not apply here.
    edges.push(
      mountEdge(portNodeId, 'CONDENSER_JOINT', cursor, targetNodeId, {
        type: 'contact',
        method: 'contact_hc',
        parameters: {
          ...(materials.contact_conductance_W_m2K.value != null
            ? { h_c_W_m2K: materials.contact_conductance_W_m2K.value }
            : {}),
          ...(area != null ? { area_mm2: area } : {}),
        },
        missingNote: 'Condenser joint area is missing — state the mount L and W in Screen 04.',
      }),
    );

    return { nodes, edges, entryNodeId: cursor, needsBaseEdge: false };
  }

  return { nodes, edges, entryNodeId: cursor, needsBaseEdge: true };
}
