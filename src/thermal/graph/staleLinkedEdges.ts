/**
 * Which stored resistances no longer match the inputs they are linked to.
 *
 * A generated edge keeps two things: a computed `rth.analytical`, and the
 * `parameter_links` that say where its inputs came from. The solver re-reads
 * those links on every run — `buildSolveInput` projects the component master
 * first — so a change to Screen 01's via conductivity or a component's own
 * override lands in the answer immediately. Screen 05 does not: it draws the
 * stored number, written once when the subgraph was built.
 *
 * So the two screens can disagree, and did. Measured on the STARKCORE project:
 * giving Si5518 its own via k of 60 moved Screen 07's via edge from 0.871 to
 * 0.406 °C/W while Screen 05 went on showing 0.871 — the same edge, a factor of
 * two apart, with nothing on screen to say which was current.
 *
 * The physics was never wrong; the solver had it right the whole time. What was
 * missing is that nothing told the engineer the drawing had fallen behind.
 * "Generate from Preferences" already rebuilds every subgraph from the current
 * inputs and brings the two back into line — this is what makes it discoverable
 * rather than something you have to remember.
 *
 * Two kinds of edge are deliberately NOT reported:
 *
 *   - one with no `parameter_links`, which has nothing upstream to fall behind;
 *   - one whose active source is not Analytical. A measured or hand-entered
 *     resistance is what the solver uses, so its analytical slot drifting
 *     changes no result, and saying so would only be noise.
 *
 * Nor is the Biot re-solve of a spreading edge staleness. That happens in
 * `solveScenario`, after this comparison's projection, and Screen 05 showing the
 * Bi → ∞ floor is the documented behaviour rather than a stale value.
 */

import type { Component } from '@/domain/component';
import type { MaterialDefaults } from '@/domain/materials';

import { projectComponentMaster } from './componentProjection';
import type { ThermalEdge, ThermalNetwork } from '../types';

export interface StaleLinkedEdge {
  edge_id: string;
  edge_name: string;
  component_id: string;
  component_name: string;
  /** What Screen 05 is drawing. */
  stored_C_per_W: number | null;
  /** What the solver would use. */
  resolved_C_per_W: number | null;
}

/** The slot the solver reads. A pinned Manual value outranks the computed one. */
function activeRth(edge: ThermalEdge): number | null {
  const value = edge.rth?.active_source === 'Manual' ? edge.rth.manual : edge.rth?.analytical;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function linkedToInputs(edge: ThermalEdge): boolean {
  return Object.keys(edge.parameter_links ?? {}).length > 0;
}

/**
 * Relative, because these span four orders of magnitude — a 0.013 °C/W
 * spreading edge and a 74 °C/W package sit in the same graph, and one absolute
 * epsilon cannot serve both. 1e-9 is far below anything an input change
 * produces and far above float replay noise.
 */
function differs(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a !== b;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) > scale * 1e-9;
}

export function staleLinkedEdges(
  network: ThermalNetwork,
  components: Component[],
  materials: MaterialDefaults,
): StaleLinkedEdge[] {
  const resolved = projectComponentMaster(network, components, materials, {
    physics: true,
    limits: false,
  });
  const byId = new Map(components.map((component) => [component.id, component]));
  const stale: StaleLinkedEdge[] = [];

  for (const edge of Object.values(network.edges)) {
    const componentId = edge.origin?.component_id;
    const component = componentId ? byId.get(componentId) : undefined;
    // A disabled component's edges are switched off by the same projection;
    // they are not stale, they are out of the network.
    if (!component || !component.enabled) continue;
    if (!linkedToInputs(edge)) continue;
    if (edge.rth?.active_source === 'Manual') continue;

    const after = resolved.edges[edge.id];
    if (!after) continue;

    const stored = activeRth(edge);
    const current = activeRth(after);
    if (!differs(stored, current)) continue;

    stale.push({
      edge_id: edge.id,
      edge_name: edge.type,
      component_id: component.id,
      component_name: component.name,
      stored_C_per_W: stored,
      resolved_C_per_W: current,
    });
  }

  return stale.sort((a, b) => a.edge_id.localeCompare(b.edge_id));
}

/** Distinct components behind a stale list — what the message counts. */
export function staleComponentNames(stale: readonly StaleLinkedEdge[]): string[] {
  return [...new Set(stale.map((entry) => entry.component_name))].sort();
}
