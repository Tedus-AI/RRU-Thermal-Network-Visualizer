/** Projects Screen 04 master values onto a clone without mutating Screen 05. */

import type { Component } from '@/domain/component';
import { powerWOf } from '@/domain/component';
import { valueOf } from '@/domain/sourcedValue';

import { setRthFromSource } from '../rth';
import { computeRth, type EdgeParameters } from '../resistance/calculators';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '../types';
import { readComponentField } from './networkBuilder';

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

function updateLinkedEdge(edge: ThermalEdge, component: Component): void {
  if (!edge.parameter_links || Object.keys(edge.parameter_links).length === 0) return;

  const parameters: EdgeParameters = { ...(edge.parameters ?? {}) };
  for (const [parameter, componentPath] of Object.entries(edge.parameter_links)) {
    const value = readComponentField(component, componentPath);
    if (value == null) delete parameters[parameter];
    else parameters[parameter] = value;
  }

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

/** Returns a clone; Component Master follows explicit template links only. */
export function projectComponentMaster(
  network: ThermalNetwork,
  components: Component[],
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

    if (options.limits && followsComponentLimit(node)) {
      node.limit_C = valueOf(component.thermal_spec.limit_C);
      node.limit_type = component.thermal_spec.limit_type;
    }
  }

  if (options.physics) {
    for (const edge of Object.values(clone.edges)) {
      const componentId = edge.origin?.component_id;
      const component = componentId ? byId.get(componentId) : undefined;
      if (!component) continue;
      if (!component.enabled) edge.enabled = false;
      else updateLinkedEdge(edge, component);
    }
  }

  return clone;
}

/** Result-side projection changes interpretation only, never the physics. */
export function projectComponentLimits(
  network: ThermalNetwork,
  components: Component[],
): ThermalNetwork {
  return projectComponentMaster(network, components, { physics: false, limits: true });
}
