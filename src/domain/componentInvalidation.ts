/**
 * Downstream invalidation matrix — 04 §32, AC-04-15.
 *
 * Not every edit invalidates the same thing. Changing a datasheet reference is
 * bookkeeping; changing Qty rewrites how many heat sources exist. Getting this
 * wrong in either direction is harmful: too eager and every keystroke discards
 * results, too lax and stale numbers are presented as current (00 Rule 6).
 */

import type { Component } from './component';
import type { DirtyReason } from '@/thermal/types';

export interface InvalidationEffect {
  /** The existing topology must be reviewed before the next solve is trusted. */
  networkReview: boolean;
  /** Previous solver results are stale. */
  solverDirty: boolean;
  dirtyReasons: DirtyReason[];
}

const NONE: InvalidationEffect = { networkReview: false, solverDirty: false, dirtyReasons: [] };

function effect(
  networkReview: boolean,
  solverDirty: boolean,
  reason: DirtyReason,
): InvalidationEffect {
  return { networkReview, solverDirty, dirtyReasons: solverDirty ? [reason] : [] };
}

/**
 * 04 §32. `isMapped` = this component already backs nodes in the graph; several
 * rows in the matrix are conditional on that.
 */
export function effectOfChange(field: string, isMapped: boolean): InvalidationEffect {
  switch (field) {
    // Identity: only matters once the graph references it.
    case 'name':
      return effect(isMapped, isMapped, 'component_identity_changed');

    // Topology-shaping changes.
    case 'category':
    case 'qty':
      return effect(true, true, field === 'qty' ? 'component_qty_changed' : 'component_architecture_changed');
    case 'tim':
    case 'tim.type':
      return effect(true, true, 'component_tim_changed');
    case 'board_path':
    case 'board_path.type':
      return effect(true, true, 'component_architecture_changed');
    case 'geometry':
      return effect(true, true, 'component_geometry_changed');
    case 'architecture_prep':
      return effect(true, true, 'component_architecture_changed');
    case 'enabled':
      return effect(true, true, 'component_enabled_changed');

    // Power changes the load, not the shape of the graph.
    case 'power_W':
      return effect(false, true, 'component_power_changed');

    // Resistance changes the physical solution, never topology.
    case 'r_jc_C_per_W':
    case 'package_type':
      return effect(false, true, 'component_rth_changed');

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
      return effect(false, true, 'component_physics_changed');
  }
}

export function combineEffects(effects: InvalidationEffect[]): InvalidationEffect {
  return {
    networkReview: effects.some((e) => e.networkReview),
    solverDirty: effects.some((e) => e.solverDirty),
    dirtyReasons: Array.from(new Set(effects.flatMap((entry) => entry.dirtyReasons))),
  };
}

/** A component participates in the graph once Screen 05 has drafted a profile. */
export function isMappedToNetwork(component: Component): boolean {
  return component.architecture_prep.thermal_profile_status !== 'Not Assigned';
}
