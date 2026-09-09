/**
 * How much hotter the air can get before this machine stops passing.
 *
 * This is the one number Screen 09 was worth building for, and it is not a
 * chart — it is a sentence. Every screen up to here answers "at this operating
 * point"; the specification the machine is built to is written as a RANGE
 * ("operating ambient up to 55 °C"), and nothing else in the tool says where in
 * that range the design actually stops.
 *
 * ## Why it is addition, not a sweep
 *
 * The first design for this re-solved the network across a range of ambients,
 * on the argument that the temperature rise is not constant: h for natural
 * convection moves with ΔT and h for radiation with absolute temperature, so
 * the rise "should" change as the air warms. Measured on the STARKCORE 12L
 * model, through the real solver, it barely does:
 *
 *   ambient  25 °C → rise 48.95 °C
 *   ambient  45 °C → rise 49.31 °C
 *   ambient  65 °C → rise 49.87 °C
 *
 * — a slope of 0.023 °C of rise per °C of air. At the model's own 45 °C the
 * worst margin is 0.686 °C, so the arithmetic answer is 45.686 °C and the
 * solved crossing is 45.67 °C. The difference is 0.02 °C, well inside what any
 * of the inputs are known to. A sweep would have spent a screen and twenty
 * solves to move the answer by less than the last digit shown.
 *
 * ## Where the arithmetic stops being true
 *
 * Two things would break it, and `assumes_uniform_rise` reports whether either
 * is in play rather than leaving the reader to know:
 *
 *   - A node pinned to a FIXED TEMPERATURE does not move with the air, so the
 *     rise across the path that ends on it genuinely changes with ambient.
 *   - Forced convection, if wind ever reaches the physics — today `wind_mps` is
 *     stored, validated and exported but never read by `src/thermal`, so every
 *     solve is a natural-convection one.
 */

import type { ThermalNetwork } from '../types';
import type { ThermalSolution } from '../solver/solverTypes';

export interface AmbientHeadroom {
  /** Smallest limit − temperature over every node that has a limit, °C. */
  worst_margin_C: number;
  worst_node_id: string;
  worst_node_name: string;
  worst_temperature_C: number;
  worst_limit_C: number;
  /** The ambient this solution was computed at, °C. */
  ambient_C: number;
  /** Ambient at which the worst part reaches its limit, °C. */
  max_ambient_C: number;
  /**
   * `max_ambient_C − ambient_C`, which equals the worst margin. Negative when
   * the machine is already over: it says how far the air must COOL to pass.
   */
  headroom_C: number;
  /** How many parts carry a limit at all — the population this is worst of. */
  limited_node_count: number;
  /** False when a fixed-temperature node makes the constant-rise reading unsafe. */
  assumes_uniform_rise: boolean;
}

/**
 * The worst-off part, and the ambient that would put it exactly on its limit.
 *
 * Null when nothing has a limit or nothing solved: a headroom with no part
 * behind it is a number with no engineering meaning, and 0 would read as
 * "no margin" rather than "not asked".
 */
export function ambientHeadroom(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  ambient_C: number | null,
): AmbientHeadroom | null {
  if (!solution || ambient_C == null || !Number.isFinite(ambient_C)) return null;

  let worst: {
    id: string;
    name: string;
    margin: number;
    temperature: number;
    limit: number;
  } | null = null;
  let limited = 0;
  let pinned = false;

  for (const node of Object.values(network.nodes)) {
    if (node.disabled) continue;
    if (node.boundary_type === 'fixed_temperature') pinned = true;
    if (node.limit_C == null) continue;
    const temperature = solution.node_temperatures_C[node.id];
    if (!Number.isFinite(temperature)) continue;
    limited += 1;
    const margin = node.limit_C - temperature;
    if (!worst || margin < worst.margin) {
      worst = {
        id: node.id,
        name: node.name,
        margin,
        temperature,
        limit: node.limit_C,
      };
    }
  }

  if (!worst) return null;

  return {
    worst_margin_C: worst.margin,
    worst_node_id: worst.id,
    worst_node_name: worst.name,
    worst_temperature_C: worst.temperature,
    worst_limit_C: worst.limit,
    ambient_C,
    max_ambient_C: ambient_C + worst.margin,
    headroom_C: worst.margin,
    limited_node_count: limited,
    assumes_uniform_rise: !pinned,
  };
}
