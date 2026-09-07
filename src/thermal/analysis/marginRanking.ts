/**
 * Which parts are closest to their own spec — the question Screen 08 opens on.
 *
 * Screen 07 already produced every node temperature. This ranks the parts that
 * carry a limit by `Limit − Temperature`, smallest first, because that is the
 * number a thermal review is actually judged on: not the hottest part, the one
 * with the least room left. A 181 °C junction with a 225 °C limit is fine; a
 * 92 °C body with a 95 °C limit is not.
 *
 * One row per limited node, which is one row per physical part: the internal
 * nodes of a component (case, solder, TIM) carry no datasheet number and would
 * only repeat their junction's story.
 */

import type { ThermalNetwork } from '../types';
import { componentNodes } from './affectedComponents';

export interface MarginRank {
  node_id: string;
  /** The part as the reader knows it, e.g. "XCZU67DR Junction". */
  name: string;
  component_id: string | null;
  temperature_C: number;
  limit_C: number;
  /** Tj / Tc / Ts — which surface the limit is quoted against. */
  limit_type: string | null;
  /** Limit − Temperature. Negative means the part is over spec. */
  margin_C: number;
  power_W: number;
}

export function marginRanking(
  network: ThermalNetwork,
  temperatures: Record<string, number>,
  count = 3,
): MarginRank[] {
  const ranked: MarginRank[] = [];

  for (const node of componentNodes(network)) {
    if (node.limit_C == null) continue;
    const temperature = temperatures[node.id];
    if (!Number.isFinite(temperature)) continue;
    ranked.push({
      node_id: node.id,
      name: node.name,
      component_id: node.origin?.component_id ?? node.component_ref ?? null,
      temperature_C: temperature,
      limit_C: node.limit_C,
      limit_type: node.limit_type ?? null,
      margin_C: node.limit_C - temperature,
      power_W: node.power_W,
    });
  }

  // Least margin first. Ties break on the hotter part, then on the name, so the
  // order is stable between runs rather than following object insertion.
  ranked.sort(
    (a, b) =>
      a.margin_C - b.margin_C ||
      b.temperature_C - a.temperature_C ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  return count > 0 ? ranked.slice(0, count) : ranked;
}
