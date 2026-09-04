/** Projects Screen 04 master values onto a clone without mutating Screen 05. */

import type { Component } from '@/domain/component';
import { mountFootprintMm2, mountSpec, powerWOf } from '@/domain/component';
import { valueOf } from '@/domain/sourcedValue';

import { defaultMaterials, type MaterialDefaults } from '@/domain/materials';
import { setRthFromSource } from '../rth';
import {
  computeRth,
  scaleParametersForDevices,
  type EdgeParameters,
} from '../resistance/calculators';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '../types';
import { readLinkedInput } from './networkBuilder';
import { limitReferenceNodeId } from './limitReference';
import { SOURCE_AREA_OVERRIDE_KEY } from './hskBaseConnection';

function followsComponentPower(node: ThermalNode): boolean {
  if (node.metadata?.component_power_linked === true) return true;
  return (
    node.origin?.kind === 'template' &&
    node.origin.modified !== true &&
    Boolean(node.component_ref) &&
    node.power_W !== 0
  );
}

function followsComponentLimit(node: ThermalNode): boolean {
  if (node.metadata?.component_limit_linked === true) return true;
  return (
    node.origin?.kind === 'template' &&
    node.origin.modified !== true &&
    Boolean(node.component_ref) &&
    (node.limit_C != null || node.power_W !== 0)
  );
}

function representedDevices(
  network: ThermalNetwork,
  node: ThermalNode,
  component: Component,
): number {
  const explicit = Number(node.metadata?.devices_represented);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const binding = network.templates[component.id];
  if (!binding || binding.qty_model === 'AGGREGATE') return component.qty;
  return 1;
}

/**
 * The aluminium an embedded pipe leaves behind, mm² — or null if it does not apply.
 *
 * `fullAreaMm2` is the whole contact face the link resolved to; the copper is
 * `contact_L × contact_W × pipes`, one groove per pipe. Pipes covering the face
 * completely leave nothing to spread through, and that is a real arrangement as
 * well as what a mistyped width looks like, so it returns 0 and the branch goes
 * unresolved rather than silently falling back to the full face.
 */
function embeddedPipeCarveOutMm2(
  component: Component,
  fullAreaMm2: EdgeParameters['source_area_mm2'],
): number | null {
  const mount = mountSpec(component.thermal_spec);
  if (mount.type !== 'EmbeddedHeatPipe') return null;
  if (typeof fullAreaMm2 !== 'number' || !Number.isFinite(fullAreaMm2) || fullAreaMm2 <= 0) {
    return null;
  }
  const copper = mountFootprintMm2(mount);
  if (copper == null) return null;
  return Math.max(0, fullAreaMm2 - copper);
}

function updateLinkedEdge(
  network: ThermalNetwork,
  edge: ThermalEdge,
  component: Component,
  materials: MaterialDefaults,
): void {
  if (!edge.parameter_links || Object.keys(edge.parameter_links).length === 0) return;

  // The component states ONE device; this edge may stand for several, so the
  // count it was built with has to be reapplied. Without it, re-reading the
  // component here would silently narrow an aggregated edge back to one joint.
  const devices = Number(edge.metadata?.devices_represented);
  const perDevice: EdgeParameters = { ...(edge.parameters ?? {}) };
  for (const [parameter, componentPath] of Object.entries(edge.parameter_links)) {
    const edgeParameterLink = componentPath.match(/^(.+)\.parameters\.([^.]+)$/);
    const linkedEdgeValue = edgeParameterLink
      ? network.edges[edgeParameterLink[1]]?.parameters?.[edgeParameterLink[2] as keyof EdgeParameters]
      : undefined;
    const value =
      typeof linkedEdgeValue === 'number'
        ? linkedEdgeValue
        : readLinkedInput(component, componentPath, materials);
    if (value == null) delete perDevice[parameter];
    else perDevice[parameter] = value;
  }

  // An embedded heat pipe lies in a groove machined flush with the face the
  // part sits on, so the aluminium branch spreads through only what the copper
  // leaves behind. The link points at the FULL contact face, which is what the
  // copper and the aluminium share, so resolving it would restore the whole
  // footprint and let Screen 05 show the carved-out area while Screen 07 solved
  // the full one.
  //
  // Recomputed from the component's mount AS IT STANDS wherever the mount can
  // say, and only otherwise read back from the number the edge was built with.
  // The stored one is written once, when the port is connected, and then
  // re-applied faithfully for ever — so an edge that arrives carrying a stale
  // area (an older build, an imported save, a hand-edited file) keeps it, and
  // correcting the pipe width in Screen 04 changed the picture everywhere
  // except the one number it was supposed to change. On the STARKCORE FPGA a
  // stale 315 mm² against the true 770 reads 0.418 °C/W where the mount says
  // 0.322: a 30 % error in that part's dominant path, from data already fixed
  // upstream.
  const carveOut = embeddedPipeCarveOutMm2(component, perDevice.source_area_mm2);
  if (carveOut != null) {
    perDevice.source_area_mm2 = carveOut;
  } else {
    // The mount could not answer — no embedded pipe, or no footprint stated.
    // Then the number the edge was built with is all there is, and keeping it
    // is the safe direction: a carve-out that is too SMALL over-estimates the
    // resistance, while restoring the full face under-estimates it, and an
    // optimistic thermal answer is the one that ships a part over its limit.
    const stored = edge.metadata?.[SOURCE_AREA_OVERRIDE_KEY];
    if (typeof stored === 'number' && Number.isFinite(stored) && stored > 0) {
      perDevice.source_area_mm2 = stored;
    }
  }

  const parameters = scaleParametersForDevices(
    edge.method,
    perDevice,
    Number.isFinite(devices) ? devices : 1,
  );

  const computed = computeRth(edge.method, parameters);
  edge.parameters = parameters as ThermalEdge['parameters'];
  edge.rth = setRthFromSource(
    edge.rth,
    'Analytical',
    computed.value,
    computed.value == null ? 'low' : 'medium',
    { reference: `Component Master ${component.id}` },
  );
  edge.resolution = computed.resolution;
  edge.resolution_note =
    computed.note ??
    (computed.missing.length > 0 ? `Missing input: ${computed.missing.join(', ')}` : undefined);
}

export interface ComponentProjectionOptions {
  physics?: boolean;
  limits?: boolean;
}

/**
 * Puts each component's limit on the node its limit TYPE names.
 *
 * Not a per-node decision, because it has to MOVE: an engineer who switches a
 * part from Tj to Tc is re-stating where the number is measured, and the limit
 * has to leave the junction and land on the case. A per-node pass can only ever
 * refresh a limit where one already sits, so the wrong node keeps it and the
 * right node never gets it.
 *
 * Clearing goes through `followsComponentLimit`, so a limit is taken away from
 * exactly the nodes the old per-node pass would have written one to. That
 * predicate lets an explicit `component_limit_linked` outrank `modified`, which
 * is why a limit typed into a linked node has never survived a solve —
 * unchanged here, and not this fix's to change.
 */
function applyComponentLimits(network: ThermalNetwork, byId: Map<string, Component>): void {
  const intended = new Map<string, Component>();

  for (const node of Object.values(network.nodes)) {
    const component = node.component_ref ? byId.get(node.component_ref) : undefined;
    // Anchored on the POWER link, never on the limit link: after one pass the
    // case carries a limit too, and anchoring on that would let it claim a
    // second limit of its own and never give the junction its Tj back.
    if (!component || !followsComponentPower(node)) continue;
    const target = limitReferenceNodeId(network, node.id, component.thermal_spec.limit_type);
    if (network.nodes[target]) intended.set(target, component);
  }

  for (const node of Object.values(network.nodes)) {
    if (!node.component_ref || !byId.has(node.component_ref)) continue;
    const component = intended.get(node.id);

    if (component) {
      // The target may never have carried a limit before — a lid on a graph
      // built while the part was still Tj — so eligibility cannot be read from
      // the `component_limit_linked` flag it does not have yet. A template node
      // is Screen 04's slot to fill; a hand-drawn one is not.
      if (node.origin?.kind !== 'template') continue;
      node.limit_C = valueOf(component.thermal_spec.limit_C);
      node.limit_type = component.thermal_spec.limit_type;
      node.metadata = { ...node.metadata, component_limit_linked: true };
    } else if (followsComponentLimit(node)) {
      node.limit_C = null;
      node.limit_type = null;
      node.metadata = { ...node.metadata, component_limit_linked: false };
    }
  }
}

/** Returns a clone; Component Master follows explicit template links only. */
export function projectComponentMaster(
  network: ThermalNetwork,
  components: Component[],
  materials: MaterialDefaults,
  options: ComponentProjectionOptions = { physics: true, limits: true },
): ThermalNetwork {
  const clone = structuredClone(network);
  const byId = new Map(components.map((component) => [component.id, component]));

  for (const node of Object.values(clone.nodes)) {
    const component = node.component_ref ? byId.get(node.component_ref) : undefined;
    if (!component) continue;

    if (options.physics) {
      if (!component.enabled && node.origin?.component_id === component.id) {
        node.disabled = true;
      } else if (followsComponentPower(node)) {
        node.power_W = powerWOf(component) * representedDevices(clone, node, component);
      }
    }

  }

  if (options.limits) applyComponentLimits(clone, byId);

  if (options.physics) {
    for (const edge of Object.values(clone.edges)) {
      const componentId = edge.origin?.component_id;
      const component = componentId ? byId.get(componentId) : undefined;
      if (!component) continue;
      if (!component.enabled) edge.enabled = false;
      else updateLinkedEdge(clone, edge, component, materials);
    }
  }

  return clone;
}

/**
 * Result-side projection changes interpretation only, never the physics — so it
 * needs no material constants; nothing on this path reads them.
 */
export function projectComponentLimits(
  network: ThermalNetwork,
  components: Component[],
): ThermalNetwork {
  return projectComponentMaster(network, components, defaultMaterials(), {
    physics: false,
    limits: true,
  });
}
