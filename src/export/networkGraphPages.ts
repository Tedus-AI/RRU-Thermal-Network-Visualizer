/**
 * Which single-component pictures a PDF of the network should carry.
 *
 * The whole graph answers "how does this product reject its heat"; it does not
 * answer "what does this part's path look like", because at the width the whole
 * graph needs, one part's chain is a few millimetres of a very wide sheet. So
 * the PDF carries the whole graph and then one page per part.
 *
 * ONE page per part, not one per device. A ×4 PA is four identical chains at
 * identical power — the graph draws all four because the solver solves all four,
 * but four identical pages is padding, and padding is what stops a report being
 * read. So instances are grouped by the dissipation they carry and one stands
 * for each group.
 *
 * Grouped by POWER rather than collapsed outright, because instances are not
 * always identical. A GROUPED qty model splits a part across instances that
 * stand for different device counts — eight devices as 4 + 4, or 5 + 3 — and
 * those chains genuinely differ. Two pages then, one per distinct number, each
 * saying how many devices it speaks for.
 */

import type { Component } from '@/domain/component';

import type { ThermalNetwork, ThermalNode } from '@/thermal/types';

export interface ComponentGraphPage {
  component_id: string;
  component_name: string;
  /** Null when the part is modelled as a single chain. */
  instance: string | null;
  /** Per-device dissipation, W. */
  power_W: number;
  /** Devices this one chain stands for. */
  devices: number;
  /** How many instances this page speaks for — 4 on a ×4 part. */
  represents_instances: number;
  /** Every other component, for the existing component-level view filter. */
  hidden_component_ids: ReadonlySet<string>;
  /** This component's OTHER instances, which the component filter cannot reach. */
  hidden_node_ids: ReadonlySet<string>;
}

function componentOf(node: ThermalNode): string | null {
  return node.origin?.component_id ?? node.component_ref ?? null;
}

function instanceOf(node: ThermalNode): string | null {
  const value = node.metadata?.instance;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The node carrying the dissipation. `component_power_linked` is the flag the
 * builder stamps on it; `power_W !== 0` is the fallback for a graph written
 * before that flag existed, and matches what `followsComponentPower` accepts.
 */
function isSource(node: ThermalNode): boolean {
  return node.metadata?.component_power_linked === true || node.power_W !== 0;
}

function devicesOf(node: ThermalNode): number {
  const value = Number(node.metadata?.devices_represented);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function componentGraphPages(
  network: ThermalNetwork,
  components: readonly Component[],
): ComponentGraphPage[] {
  const nodesByComponent = new Map<string, ThermalNode[]>();
  for (const node of Object.values(network.nodes)) {
    if (node.disabled) continue;
    const componentId = componentOf(node);
    if (!componentId) continue;
    const list = nodesByComponent.get(componentId);
    if (list) list.push(node);
    else nodesByComponent.set(componentId, [node]);
  }

  const modelled = new Set(nodesByComponent.keys());
  const pages: ComponentGraphPage[] = [];

  // Screen 04's order, so the PDF reads in the same sequence as every table.
  for (const component of components) {
    const nodes = nodesByComponent.get(component.id);
    if (!component.enabled || !nodes || nodes.length === 0) continue;

    // instance key -> its source node. A part with no instance key is one chain
    // and lands under a single null key.
    const sources = new Map<string | null, ThermalNode>();
    for (const node of nodes) {
      if (!isSource(node)) continue;
      const key = instanceOf(node);
      if (!sources.has(key)) sources.set(key, node);
    }
    // No source at all — a part whose subgraph carries no dissipation. It still
    // has a path worth drawing, so it gets its one page rather than vanishing.
    if (sources.size === 0) sources.set(null, nodes[0]);

    const byPower = new Map<string, Array<{ instance: string | null; node: ThermalNode }>>();
    for (const [instance, node] of sources) {
      // Keyed on the pair, not the power alone: two instances at 4 W each and
      // one at 4 W standing for two devices are different chains.
      const key = `${node.power_W}|${devicesOf(node)}`;
      const group = byPower.get(key);
      if (group) group.push({ instance, node });
      else byPower.set(key, [{ instance, node }]);
    }

    for (const group of byPower.values()) {
      group.sort((a, b) => (a.instance ?? '').localeCompare(b.instance ?? '', undefined, { numeric: true }));
      const [representative] = group;
      const keptInstance = representative.instance;

      pages.push({
        component_id: component.id,
        component_name: component.name,
        instance: keptInstance,
        power_W: representative.node.power_W,
        devices: devicesOf(representative.node),
        represents_instances: group.length,
        hidden_component_ids: new Set([...modelled].filter((id) => id !== component.id)),
        hidden_node_ids: new Set(
          nodes.filter((node) => instanceOf(node) !== keptInstance).map((node) => node.id),
        ),
      });
    }
  }

  return pages;
}

/** Page title, e.g. "GTRB384608FC · 53.0 W · 1 of 4 identical". */
export function pageTitle(page: ComponentGraphPage): string {
  const parts = [page.component_name, `${page.power_W.toFixed(page.power_W < 10 ? 3 : 1)} W`];
  if (page.devices > 1) parts.push(`×${page.devices} devices`);
  if (page.represents_instances > 1) parts.push(`1 of ${page.represents_instances} identical`);
  return parts.join(' · ');
}
