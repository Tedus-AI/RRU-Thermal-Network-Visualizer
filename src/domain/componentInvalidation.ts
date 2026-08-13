/**
 * Downstream invalidation matrix — 04 §32, AC-04-15.
 *
 * Not every edit invalidates the same thing. Changing a datasheet reference is
 * bookkeeping; changing Qty rewrites how many heat sources exist. Getting this
 * wrong in either direction is harmful: too eager and every keystroke discards
 * results, too lax and stale numbers are presented as current (00 Rule 6).
 */

import type { Component } from './component';

export interface InvalidationEffect {
  /** The existing topology must be reviewed before the next solve is trusted. */
  networkReview: boolean;
  /** Previous solver results are stale. */
  solverDirty: boolean;
}

const NONE: InvalidationEffect = { networkReview: false, solverDirty: false };

/**
 * 04 §32. `isMapped` = this component already backs nodes in the graph; several
 * rows in the matrix are conditional on that.
 */
export function effectOfChange(field: string, isMapped: boolean): InvalidationEffect {
  switch (field) {
    // Identity: only matters once the graph references it.
    case 'name':
      return { networkReview: isMapped, solverDirty: isMapped };

    // Topology-shaping changes.
    case 'category':
    case 'qty':
    case 'tim':
    case 'tim.type':
    case 'board_path':
    case 'board_path.type':
    case 'geometry':
    case 'architecture_prep':
    case 'enabled':
      return { networkReview: true, solverDirty: true };

    // Power changes the load, not the shape of the graph.
    case 'power_W':
      return { networkReview: false, solverDirty: true };

    // Resistance changes the physical solution, never topology.
    case 'r_jc_C_per_W':
    case 'package_type':
      return { networkReview: false, solverDirty: true };

    // A limit changes margin/risk interpretation, not [G], [P] or temperature.
    // Its independent limit revision invalidates Screens 08–12 without forcing
    // the engineer to re-solve an unchanged physical network.
    case 'limit_C':
    case 'limit_type':
      return NONE;

    // Bookkeeping only.
    case 'notes':
    case 'provenance':
    case 'external_mappings':
    case 'flotherm_alias':
      return NONE;

    default:
      // Unknown edits are treated as thermally relevant — the safe direction.
      return { networkReview: false, solverDirty: true };
  }
}

export function combineEffects(effects: InvalidationEffect[]): InvalidationEffect {
  return {
    networkReview: effects.some((e) => e.networkReview),
    solverDirty: effects.some((e) => e.solverDirty),
  };
}

/** A component participates in the graph once Screen 05 has drafted a profile. */
export function isMappedToNetwork(component: Component): boolean {
  return component.architecture_prep.thermal_profile_status !== 'Not Assigned';
}
