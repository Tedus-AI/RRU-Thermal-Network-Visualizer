/**
 * A vertical plate's height, taken from the machine by default.
 *
 * The buoyant layer on a vertical face runs the face's height. On an RRU hung
 * on a pole the long side of the enclosure is vertical, and 01 states it as the
 * heat sink base length L (5G-RRU's L_pcb + Top + Bottom) — the machine height.
 * A face spanning the enclosure, like a cavity filter forming the back cover,
 * has that height; a shorter one is taken over with ✂ and typed in.
 *
 * Stored per profile as `plateHeightSource`: 'project' follows 01, 'manual' is
 * the engineer's. A profile from before the link has no source: it follows 01
 * when its height is empty or already equals 01's, and is treated as the
 * engineer's otherwise — a typed height is never overwritten.
 *
 * A taller assumed face gives a lower laminar h (h ∝ (ΔT / H)^¼), so taking the
 * machine height for a shorter face errs towards a hotter result.
 */

import type { BoundaryConditionProfile } from './types';
import { PLATE_GEOMETRY_KEYS } from './calculations';

export const PLATE_HEIGHT_SOURCE_KEY = 'plateHeightSource';
export type PlateHeightSource = 'project' | 'manual';

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function usable(height: number | null | undefined): height is number {
  return typeof height === 'number' && Number.isFinite(height) && height > 0;
}

/** A vertical plate the machine height can describe; horizontal plates have two sides instead. */
function isVerticalPlate(parameters: Record<string, unknown>): boolean {
  const orientation = parameters[PLATE_GEOMETRY_KEYS.orientation];
  return orientation == null || orientation === 'Vertical';
}

/** Whether this profile's plate height follows 01's machine height. */
export function plateHeightFollowsProject(
  profile: Pick<BoundaryConditionProfile, 'parameters'>,
  machineHeight_mm: number | null | undefined,
): boolean {
  const parameters = profile.parameters;
  if (parameters[PLATE_GEOMETRY_KEYS.enabled] !== true || !isVerticalPlate(parameters)) return false;
  if (!usable(machineHeight_mm)) return false;
  const source = parameters[PLATE_HEIGHT_SOURCE_KEY];
  if (source === 'project') return true;
  if (source === 'manual') return false;
  const height = parameters[PLATE_GEOMETRY_KEYS.height];
  return typeof height !== 'number' || same(height, machineHeight_mm);
}

/**
 * Writes 01's machine height into a following profile, and records that it
 * follows so a later change to 01 carries on. Returns whether anything changed.
 */
export function applyProjectPlateHeight(
  parameters: BoundaryConditionProfile['parameters'],
  machineHeight_mm: number | null | undefined,
): boolean {
  if (!plateHeightFollowsProject({ parameters }, machineHeight_mm)) return false;
  let changed = false;
  const height = parameters[PLATE_GEOMETRY_KEYS.height];
  if (typeof height !== 'number' || !same(height, machineHeight_mm as number)) {
    parameters[PLATE_GEOMETRY_KEYS.height] = machineHeight_mm;
    changed = true;
  }
  if (parameters[PLATE_HEIGHT_SOURCE_KEY] !== 'project') {
    parameters[PLATE_HEIGHT_SOURCE_KEY] = 'project';
    changed = true;
  }
  return changed;
}
