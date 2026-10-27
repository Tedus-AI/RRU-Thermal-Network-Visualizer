/**
 * The heat sink's fin array as a project fact, copied into the fin surface's
 * boundary profile in every scenario.
 *
 * The fins are one casting for the whole design. They used to be typed into
 * each scenario's profile separately, so a room-temperature scenario could end
 * up with different fins from the hot one, and 5G-RRU's design had nowhere to
 * land. Now the project holds them (`MaterialDefaults.hsk_base_*` for the base,
 * `hsk_fin_*` for the fins, the fin process among 01's cooling elements) and
 * the boundary store copies them into the profile, the same way it copies the
 * ambient from 01 and the emissivity from the surface properties
 * (`boundaryStore.synchronizeInheritedProfileInputs`).
 *
 * Only for a design with ONE fin surface: 5G-RRU designs one heat sink, and two
 * independent heat sinks (RF and digital) have two different fin arrays, which
 * stay in their own profiles as before.
 */

import type { MaterialDefaults } from '@/domain/materials';
import type { CoolingArchitecture } from '@/domain/project';
import type { ThermalNetwork } from '../types';
import type { BoundaryConditionProfile, BoundaryPort } from './types';
import {
  FIN_CAPABLE_TYPES,
  FIN_GEOMETRY_KEYS,
  hasManualSurfaceDescription,
  usesFinGeometry,
} from './calculations';
import {
  RETIRED_DIE_CAST_DEFAULT_K_W_mK,
  defaultFinConductivity,
  type FinTechnology,
} from './finArray';

type FinSource = Pick<MaterialDefaults, 'hsk_base_L_mm' | 'hsk_base_W_mm'> &
  Partial<
    Pick<
      MaterialDefaults,
      | 'hsk_fin_height_mm'
      | 'hsk_fin_count'
      | 'hsk_fin_gap_mm'
      | 'hsk_fin_thickness_mm'
      | 'hsk_fin_draft_deg'
      | 'hsk_fin_k_W_mK'
      | 'hsk_fin_process_factor'
    >
  >;

/** Which project field each profile parameter comes from. */
export const FIN_PARAMETER_SOURCE = {
  [FIN_GEOMETRY_KEYS.baseLength]: 'hsk_base_L_mm',
  [FIN_GEOMETRY_KEYS.baseWidth]: 'hsk_base_W_mm',
  [FIN_GEOMETRY_KEYS.height]: 'hsk_fin_height_mm',
  [FIN_GEOMETRY_KEYS.gap]: 'hsk_fin_gap_mm',
  [FIN_GEOMETRY_KEYS.thickness]: 'hsk_fin_thickness_mm',
  [FIN_GEOMETRY_KEYS.conductivity]: 'hsk_fin_k_W_mK',
  [FIN_GEOMETRY_KEYS.draftAngle]: 'hsk_fin_draft_deg',
  [FIN_GEOMETRY_KEYS.processEfficiency]: 'hsk_fin_process_factor',
  [FIN_GEOMETRY_KEYS.countOverride]: 'hsk_fin_count',
} as const satisfies Record<string, keyof FinSource>;

/** The two parameters that are 01's own fields and only mirrored here. */
export const FIN_BASE_PARAMETERS: ReadonlySet<string> = new Set([
  FIN_GEOMETRY_KEYS.baseLength,
  FIN_GEOMETRY_KEYS.baseWidth,
]);

/** 01's fin process, when it names exactly one. */
export function projectFinTechnology(
  cooling: readonly CoolingArchitecture[],
): FinTechnology | null {
  const dieCast = cooling.includes('Die-casting Fin');
  const embedded = cooling.includes('Embedded Fin');
  if (dieCast === embedded) return null;
  return dieCast ? 'DieCasting' : 'Embedded';
}

/**
 * The profile parameters the project states. A field the project leaves empty
 * is not here: the profile keeps whatever it has (or the process default).
 */
export function projectFinParameters(
  materials: FinSource,
  cooling: readonly CoolingArchitecture[],
): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [parameter, field] of Object.entries(FIN_PARAMETER_SOURCE)) {
    const value = materials[field]?.value;
    if (typeof value === 'number' && Number.isFinite(value)) out[parameter] = value;
  }
  const technology = projectFinTechnology(cooling);
  if (technology) out[FIN_GEOMETRY_KEYS.technology] = technology;
  return out;
}

/**
 * The boundary port of the design's one fin surface, or null when there is
 * none or more than one (two independent heat sinks).
 */
export function singleFinSurfacePort(
  ports: readonly BoundaryPort[],
  network: Pick<ThermalNetwork, 'nodes'> | null,
): BoundaryPort | null {
  if (!network) return null;
  const fins = ports.filter((port) => network.nodes[port.connected_node_id]?.type === 'fin_surface');
  return fins.length === 1 ? fins[0] : null;
}

/** What the sync applies: the fin surface's port and the project's fins. */
export interface ProjectFinSync {
  portId: string;
  parameters: Record<string, number | string>;
  /** 01's base casting k: a die-cast fin's default when the project states no fin k. */
  baseK_W_mK: number | null;
}

/** The project states a whole fin array: base, height, air gap and thickness. */
function describesWholeArray(sync: ProjectFinSync): boolean {
  return [
    FIN_GEOMETRY_KEYS.baseLength,
    FIN_GEOMETRY_KEYS.baseWidth,
    FIN_GEOMETRY_KEYS.height,
    FIN_GEOMETRY_KEYS.gap,
    FIN_GEOMETRY_KEYS.thickness,
  ].every((key) => typeof sync.parameters[key] === 'number');
}

/**
 * Whether a profile on the fin surface takes the project's fins.
 *
 * A profile described as a fin array does. One still solving from an h stated
 * before the geometry existed keeps it until the project describes a whole
 * array — then, as when the geometry is typed in, the fins replace it (the
 * validation already asks for that). Never a radiation or solar profile, and
 * never one where the fin geometry was switched off.
 */
export function takesProjectFins(
  profile: BoundaryConditionProfile,
  port: BoundaryPort | undefined,
  sync: ProjectFinSync,
): boolean {
  if (!FIN_CAPABLE_TYPES.has(profile.type)) return false;
  if (profile.parameters[FIN_GEOMETRY_KEYS.enabled] === false) return false;
  if (usesFinGeometry(profile, port)) return true;
  return hasManualSurfaceDescription(profile, port) && describesWholeArray(sync);
}

/**
 * Copies the project's fins into a profile's parameters, in place. A field the
 * project leaves empty keeps the profile's value — except the fin k, which is
 * then the process default, so the shown default and the solved one never
 * part. Returns whether anything changed.
 */
export function applyProjectFins(
  parameters: Record<string, unknown>,
  sync: ProjectFinSync,
): boolean {
  let changed = false;
  const put = (key: string, value: unknown) => {
    if (Object.is(parameters[key], value)) return;
    parameters[key] = value;
    changed = true;
  };
  for (const [key, value] of Object.entries(sync.parameters)) put(key, value);
  if (sync.parameters[FIN_GEOMETRY_KEYS.conductivity] == null) {
    const technology: FinTechnology =
      parameters[FIN_GEOMETRY_KEYS.technology] === 'DieCasting' ? 'DieCasting' : 'Embedded';
    put(FIN_GEOMETRY_KEYS.conductivity, defaultFinConductivity(technology, sync.baseK_W_mK));
  }
  return changed;
}

/**
 * The fins a profile states that the project does not yet — what an older
 * project typed into 06 before the fins moved to the project. Taken when a
 * scenario loads, so nothing typed is lost; a field the project already states
 * is never overwritten, and clearing a field clears it in every scenario
 * (`boundaryStore.clearProjectFin`), so a cleared value does not come back.
 * The process is 01's and is not seeded; a k still at the process default it
 * was seeded with is not a measurement and is not seeded either.
 */
export function finFieldsToSeed(
  profile: BoundaryConditionProfile,
  port: BoundaryPort | undefined,
  materials: FinSource,
  baseK_W_mK: number | null,
): Partial<Record<keyof FinSource, number>> {
  const out: Partial<Record<keyof FinSource, number>> = {};
  if (!FIN_CAPABLE_TYPES.has(profile.type) || !usesFinGeometry(profile, port)) return out;
  const technology: FinTechnology =
    profile.parameters[FIN_GEOMETRY_KEYS.technology] === 'DieCasting' ? 'DieCasting' : 'Embedded';
  for (const [parameter, field] of Object.entries(FIN_PARAMETER_SOURCE)) {
    if (materials[field]?.value != null) continue;
    const value = profile.parameters[parameter];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (
      parameter === FIN_GEOMETRY_KEYS.conductivity &&
      (value === defaultFinConductivity(technology, baseK_W_mK) ||
        (technology === 'DieCasting' && value === RETIRED_DIE_CAST_DEFAULT_K_W_mK))
    ) {
      continue;
    }
    out[field] = value;
  }
  return out;
}
