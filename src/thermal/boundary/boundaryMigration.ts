import type { ScenarioBoundaryConditionSet } from './types';

/**
 * Keys a boundary set used to carry that no longer mean anything.
 *
 * `radiation_surrounding_C` (on the ambient block) and its per-profile copy
 * `radiationTemperature_C` were written by Screen 06 and read by nobody: the V1
 * linearized coefficient is `4·ε·σ·F·T_ref³`, which takes the SURFACE reference
 * temperature and no sink temperature at all. Screen 06 never offered an input
 * for the ambient one either, so whatever a project stored — one carried
 * -3 °C — was a number the engineer could neither see nor change, sitting in
 * the parameter table looking like it was radiating to a winter sky.
 *
 * They are stripped rather than left in place because a value that is displayed
 * but unused is worse than no value: it invites the reader to reason about a
 * radiation sink the solve never had.
 */
const RETIRED_AMBIENT_KEYS = ['radiation_surrounding_C'] as const;
const RETIRED_PROFILE_PARAMETERS = ['radiationTemperature_C'] as const;

function withoutKeys<T extends object>(source: T, keys: readonly string[]): T {
  const present = keys.filter((key) => key in source);
  if (present.length === 0) return source;
  const next = { ...source } as Record<string, unknown>;
  for (const key of present) delete next[key];
  return next as T;
}

/**
 * Drops retired fields from a stored boundary set.
 *
 * Returns the same object when there is nothing to strip, so a caller can use
 * identity to tell "already clean" from "rewritten" and callers that map over
 * every set on read do not churn references for no reason.
 */
export function normalizeBoundarySet(
  set: ScenarioBoundaryConditionSet,
): ScenarioBoundaryConditionSet {
  const ambient = withoutKeys(set.ambient, RETIRED_AMBIENT_KEYS);

  let profilesChanged = false;
  const profiles = set.profiles.map((profile) => {
    const parameters = withoutKeys(profile.parameters, RETIRED_PROFILE_PARAMETERS);
    if (parameters === profile.parameters) return profile;
    profilesChanged = true;
    return { ...profile, parameters };
  });

  if (ambient === set.ambient && !profilesChanged) return set;
  return { ...set, ambient, profiles };
}
