/**
 * Component-level metrics — 08 §3, §12, §16.
 *
 * "Component" here means a node that stands for real hardware: one linked to a
 * component record, or one that dissipates power. Structural nodes (bases, fins,
 * the ambient reference) are part of the path, not things with a datasheet
 * limit, so they are not what "worst component temperature" is about.
 *
 * Margin = Limit − Temperature (08 §3). A node with no limit has no margin, and
 * `null` is carried through rather than substituted with 0 — a missing limit is
 * not a margin of zero.
 */

import type { ThermalNetwork, ThermalNode } from '../types';
import { AFFECTED_THRESHOLD_C, type AffectedComponent } from './analysisTypes';

/** Nodes that represent hardware rather than structure. */
export function componentNodes(network: ThermalNetwork): ThermalNode[] {
  return Object.values(network.nodes).filter(
    (node) =>
      !node.disabled &&
      node.boundary_type !== 'fixed_temperature' &&
      (Boolean(node.component_ref) || node.power_W > 0 || node.limit_C != null),
  );
}

/** Highest solved temperature over the component nodes. */
export function worstComponentTemperature(
  network: ThermalNetwork,
  temperatures: Record<string, number>,
): { node_id: string | null; value: number | null } {
  let worst: { node_id: string | null; value: number | null } = { node_id: null, value: null };
  for (const node of componentNodes(network)) {
    const value = temperatures[node.id];
    if (!Number.isFinite(value)) continue;
    if (worst.value == null || value > worst.value) worst = { node_id: node.id, value };
  }
  return worst;
}

/** Smallest Limit − Temperature over the nodes that actually have a limit. */
export function worstThermalMargin(
  network: ThermalNetwork,
  temperatures: Record<string, number>,
): { node_id: string | null; value: number | null } {
  let worst: { node_id: string | null; value: number | null } = { node_id: null, value: null };
  for (const node of componentNodes(network)) {
    if (node.limit_C == null) continue;
    const temperature = temperatures[node.id];
    if (!Number.isFinite(temperature)) continue;
    const margin = node.limit_C - temperature;
    if (worst.value == null || margin < worst.value) worst = { node_id: node.id, value: margin };
  }
  return worst;
}

/**
 * Components whose temperature improved by at least the threshold — 08 §12.
 *
 * A component can also get WARMER: reducing one resistance pulls heat through a
 * different branch, and that is a real result of the redistribution. Those are
 * reported too, so the row count is "affected", not "improved only", and a
 * negative improvement is visible instead of being filtered away.
 *
 * "Component" here is a node that carries a LIMIT, not every node that belongs
 * to a component. Measured on STARKCORE, the difference is 81 rows against 22:
 * a PA contributed its Junction, Case, Solder, Copper Coin and TIM, five rows
 * that improve by the same amount because they are the same chain, and 59 of
 * the 81 rows had no limit, no margin and no new margin to show. Worse, the
 * count went out as "81 component(s) improve" on a board with 22 parts — a
 * number no reader could reconcile with their own hardware.
 *
 * The limited node is the one the margin metric ranks on and the one an
 * engineer acts on. A network where nobody has set a limit yet keeps the old,
 * wider set rather than reporting that nothing is affected.
 */
export function affectedComponents(
  network: ThermalNetwork,
  baseline: Record<string, number>,
  modified: Record<string, number>,
  threshold = AFFECTED_THRESHOLD_C,
): { affected: AffectedComponent[]; improved_count: number } {
  const affected: AffectedComponent[] = [];
  let improvedCount = 0;

  const candidates = componentNodes(network);
  const limited = candidates.filter((node) => node.limit_C != null);
  const reported = limited.length > 0 ? limited : candidates;

  for (const node of reported) {
    const before = baseline[node.id];
    const after = modified[node.id];
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;

    const improvement = before - after;
    if (Math.abs(improvement) < threshold) continue;

    if (improvement >= threshold) improvedCount++;

    affected.push({
      node_id: node.id,
      name: node.name,
      baseline_C: before,
      modified_C: after,
      improvement_C: improvement,
      limit_C: node.limit_C ?? null,
      baseline_margin_C: node.limit_C == null ? null : node.limit_C - before,
      modified_margin_C: node.limit_C == null ? null : node.limit_C - after,
    });
  }

  // Largest temperature change first — this is a per-candidate detail table, not
  // the cross-candidate ranking that Score owns.
  affected.sort((a, b) => Math.abs(b.improvement_C) - Math.abs(a.improvement_C));
  return { affected, improved_count: improvedCount };
}
