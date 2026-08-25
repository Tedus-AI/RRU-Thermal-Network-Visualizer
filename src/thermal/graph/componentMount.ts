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
 *   Direct                HEAT_OUT ─spreading→ base
 *   Pedestal, integral    HEAT_OUT ─block→ Boss Root ─spreading→ base
 *   Pedestal, bolted      HEAT_OUT ─block→ Boss Root ─joint→ Seat ─spreading→ base
 *   SmallBaseHeatPipe     HEAT_OUT ─block→ Small Base ─pipe→ Condenser
 *                         ─joint→ Seat ─spreading→ base
 *   HeatPipeOnly          HEAT_OUT ─pipe→ Condenser ─joint→ Seat ─spreading→ base
 *   VaporChamber          HEAT_OUT ─vendor R→ Chamber ─joint→ Seat ─spreading→ base
 *
 * The last step is added by the caller and is the Lee spreading edge
 * (`hskBaseConnection`). The area it spreads from is the MOUNT's footprint
 * rather than the component's, which falls out for free: `terminalArea()` reads
 * the last edge into the node the spreading edge starts at, and that edge
 * carries the mount footprint whether it is the block or the joint.
 *
 * THE SEAT, AND WHY IT IS A NODE
 * -----------------------------
 * Anything bolted on has a real interface underneath it, and that interface is
 * IN SERIES with the base spreading. Hang both between the block and the base
 * and the graph reads them as parallel, which is a different circuit and a
 * wrong answer. So the joint lands on a seat node and the spreading starts
 * there. An integral boss has no interface — it is the same piece of metal — so
 * it gets neither, and its number is unchanged.
 *
 * The heat-pipe mounts used to stop at a clamped contact with no spreading at
 * all, on the reasoning that a pipe does not spread into a plate the way a
 * bolted block does. That reasoning was wrong: heat arriving at a condenser
 * footprint still has to travel sideways through the base to reach the fins,
 * and a condenser footprint is small, so that step was the largest thing those
 * two mounts were missing.
 *
 * NOTHING HERE INVENTS A NUMBER
 * -----------------------------
 * Every edge is built with its parameters and left to `computeRth`. A missing
 * boss height or an unquoted heat-pipe resistance produces an UNRESOLVED edge
 * naming the field, and the topology is drawn regardless — the graph is always
 * complete, the numbers arrive when someone states them (05 §61).
 */

import {
  emptyMount,
  mountHasHeatPipe,
  mountHasSeat,
  mountHasVendorResistance,
  type MountSpec,
  type MountType,
} from '@/domain/component';
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
  componentRef: string | undefined,
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
    // The component id matters: `replaceComponentSubgraph` sweeps by it, and
    // the mount's nodes carry it. An edge without it would outlive the nodes it
    // joins and dangle after a rebuild.
    origin: { kind: 'template', component_id: componentRef },
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
  componentRef: string | undefined;
  mount: MountSpec;
  materials: MaterialDefaults;
  /**
   * The face heat arrives on — the component's TIM exit area, read off the last
   * edge into the port node. Only the block step uses it, and only to decide
   * whether the block is wide enough to be a spreading problem.
   */
  sourceAreaMm2?: number | null;
}): MountChain {
  const { portNodeId, componentRef, mount, materials, sourceAreaMm2 } = input;
  const type: MountType = mount.type;

  if (type === 'Direct') {
    return { nodes: [], edges: [], entryNodeId: portNodeId };
  }

  const nodes: ThermalNode[] = [];
  const edges: ThermalEdge[] = [];
  const area = footprintMm2(mount);
  // An integral boss is the heat sink's own metal, so that is the default and
  // asking for a second conductivity would invite two answers for one piece of
  // aluminium. A bolted block can be something else entirely — a copper boss on
  // an aluminium base — so a stated k wins when there is one.
  const k = mount.block_k_W_mK ?? materials.hsk_base_k_W_mK.value;

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

    /*
     * A block wider than the part it carries is a SPREADING problem, not a
     * column.
     *
     * This step used to be L/(k·A) with A the block's own footprint over the
     * whole height. When the block is bigger than the part — which is the
     * normal case, and the reason for machining a boss at all — that charges
     * nothing for the constriction at the top: heat enters over the component's
     * exit face and has to fan out inside the metal before it uses the full
     * width. A 30x30 FPGA on a 40x40x3 boss in 155 W/m·K came out at 0.0121
     * C/W that way against 0.0215 C/W for the real spreading problem, and the
     * error grows with the ratio, so it is not an offset that cancels out of a
     * comparison — it flatters exactly the parts someone bothered to raise.
     *
     * Lee's disc solution is already in the tool for the base plate, and the
     * geometry here is the same one a size smaller: a patch on the face of a
     * finite plate, `thickness` = the boss height. It contains the 1-D drop
     * through the height, so nothing else goes in series with it.
     *
     * A block no bigger than the part has no fan-out to model and stays L/kA —
     * there the block IS the constriction. An unstated component exit area
     * falls back the same way rather than guessing one.
     */
    const spreads = sourceAreaMm2 != null && area != null && area > sourceAreaMm2;
    edges.push(
      mountEdge(portNodeId, 'BLOCK', cursor, block.id, componentRef, {
        type: spreads ? 'spreading' : 'conduction',
        method: spreads ? 'spreading_disc' : 'conduction_LkA',
        parameters: spreads
          ? {
              ...(mount.height_mm != null ? { thickness_mm: mount.height_mm } : {}),
              ...(k != null ? { k_W_mK: k } : {}),
              plate_area_mm2: area!,
              source_area_mm2: sourceAreaMm2!,
              // Peak under the source, matching the base edge: the junction
              // chain upstream hangs off the hottest point of the patch.
              psi_variant: 'max',
            }
          : {
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

  if (mountHasVendorResistance(type)) {
    const isPipe = mountHasHeatPipe(type);
    const device = mountNode(
      portNodeId,
      isPipe ? 'HP_CONDENSER' : 'VAPOR_CHAMBER',
      isPipe ? 'Heat Pipe Condenser' : 'Vapour Chamber',
      isPipe ? 'heat_pipe_condenser' : 'vapor_chamber',
      componentRef,
    );
    nodes.push(device);

    edges.push(
      mountEdge(
        portNodeId,
        isPipe ? 'HEAT_PIPE' : 'VAPOR_CHAMBER',
        cursor,
        device.id,
        componentRef,
        {
          type: 'heat_pipe',
          method: 'direct_rth',
          parameters:
            mount.heat_pipe_R_C_per_W != null ? { R_C_per_W: mount.heat_pipe_R_C_per_W } : {},
          missingNote: isPipe
            ? 'Heat pipe resistance is a vendor number and cannot be derived from geometry. State it in Screen 04.'
            : 'Vapour chamber resistance is a vendor number, quoted at a stated power and source size. It cannot be derived from geometry — state it in Screen 04.',
        },
      ),
    );
    cursor = device.id;
  }

  /*
   * THE SEAT
   *
   * Every mount that is not `Direct` finishes the same way: an interface where
   * it meets the base, then a seat node, and the caller's Lee spreading edge
   * out of that seat.
   *
   * The seat is a node and not just an edge because the joint and the base
   * spreading are IN SERIES. Hang both between the block and the base and the
   * graph reads them as parallel, which is a different circuit and a wrong
   * answer.
   *
   * The heat-pipe mounts used to stop at a clamped contact with no spreading at
   * all, on the reasoning that a pipe does not spread into a plate the way a
   * bolted block does. That reasoning was wrong: heat arriving at a condenser
   * footprint still has to travel sideways through the base to reach the fins,
   * and a condenser footprint is small, so that step is not negligible — it was
   * the largest thing those two mounts were missing. They now spread like
   * everything else, which makes them more resistive and more honest.
   *
   * An integral boss has no interface underneath — it is the same piece of
   * metal — so it gets no joint edge and no seat, and its number is unchanged.
   */
  const bolted = mount.attachment === 'Bolted';
  if (mountHasSeat(type) && (bolted || mountHasVendorResistance(type))) {
    const seat = mountNode(portNodeId, 'BASE_SEAT', 'Base Seat', 'base_zone', componentRef);
    nodes.push(seat);
    edges.push(
      mountEdge(
        portNodeId,
        'BASE_JOINT',
        cursor,
        seat.id,
        componentRef,
        jointSpec(mount, area, materials),
      ),
    );
    cursor = seat.id;
  }

  return { nodes, edges, entryNodeId: cursor };
}

/**
 * The interface under a bolted block or a two-phase device.
 *
 * A stated TIM is a material model, `BLT / (k · A)`. No TIM means dry
 * metal-to-metal, which is Screen 01's contact conductance over the same area.
 * Either way the area is the mount footprint, so it is also what the base then
 * spreads from — `terminalArea` reads this edge.
 */
function jointSpec(
  mount: MountSpec,
  area: number | null,
  materials: MaterialDefaults,
): Parameters<typeof mountEdge>[5] {
  if (mount.joint_tim_id != null) {
    const material = materials.tim.find((entry) => entry.id === mount.joint_tim_id);
    return {
      type: 'tim',
      method: 'tim_thickness_k',
      parameters: {
        ...(mount.joint_blt_mm != null ? { thickness_mm: mount.joint_blt_mm } : {}),
        ...(material?.k_W_mK.value != null ? { k_W_mK: material.k_W_mK.value } : {}),
        ...(area != null ? { area_mm2: area } : {}),
      },
      missingNote:
        'The joint under the mount needs its bond line and footprint from Screen 04, and the material k from Screen 01.',
    };
  }
  return {
    type: 'contact',
    method: 'contact_hc',
    parameters: {
      ...(materials.contact_conductance_W_m2K.value != null
        ? { h_c_W_m2K: materials.contact_conductance_W_m2K.value }
        : {}),
      ...(area != null ? { area_mm2: area } : {}),
    },
    missingNote: 'The dry joint under the mount needs its footprint — state the mount L and W.',
  };
}
