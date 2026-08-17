/**
 * Cross-screen source revisions — 99 System Integration §12.
 *
 * Revisions answer "which authoritative source state produced this result?".
 * They deliberately do not replace `solveInputSignature`: the signature remains
 * the exact test for whether the thermal answer changed, while revisions retain
 * broader provenance (including changes such as a component temperature limit).
 */

export type RevisionId = string;

export type RevisionKind =
  | 'project'
  | 'component'
  | 'solver_input'
  | 'limit'
  | 'network'
  | 'scenario';

/**
 * Component master data needs three independent clocks.
 *
 * `component_revision` moves for every component-master change.
 * `solver_input_revision` moves only when the physical solve input can change.
 * `limit_revision` moves when limit coverage/classification can change.
 *
 * Keeping the clocks separate prevents a Limit edit from invalidating a still
 * correct temperature solution while allowing Screens 08–12 to detect that
 * their margin-dependent result no longer describes the current master data.
 */
export interface ComponentRevisionSet {
  component_revision: RevisionId;
  solver_input_revision: RevisionId;
  limit_revision: RevisionId;
}

/** Frozen provenance attached to every newly produced ThermalSolution. */
export interface SourceRevision extends ComponentRevisionSet {
  project_revision: RevisionId;
  network_revision: RevisionId;
  scenario_revision: RevisionId;
}

/** Physics freshness deliberately ignores limit and bookkeeping clocks. */
export function physicsRevisionMatches(
  produced: Partial<SourceRevision> | null | undefined,
  current: Partial<SourceRevision> | null | undefined,
): boolean {
  if (!produced || !current) return false;
  return (
    produced.solver_input_revision === current.solver_input_revision &&
    produced.network_revision === current.network_revision
  );
}

/** Margin-dependent results also follow Component Master and limit clocks. */
export function resultRevisionMatches(
  produced: Partial<SourceRevision> | null | undefined,
  current: Partial<SourceRevision> | null | undefined,
): boolean {
  if (!produced || !current) return false;
  return (
    physicsRevisionMatches(produced, current) &&
    produced.component_revision === current.component_revision &&
    produced.limit_revision === current.limit_revision
  );
}

let sequence = 0;

/** Create a new opaque revision id. The value carries no ordering contract. */
export function createRevision(kind: RevisionKind, now = Date.now()): RevisionId {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  return `rev:${kind}:${now.toString(36)}:${sequence.toString(36)}`;
}

/**
 * Stable fallback for records written before Phase 1.
 *
 * The seed is normally an existing `updated_at` value. A short hash keeps the
 * id compact and, critically, produces the same revision on every reload until
 * that legacy record is explicitly saved with a first-class revision.
 */
export function legacyRevision(kind: RevisionKind, seed: unknown): RevisionId {
  return `legacy:${kind}:${fnv1a(String(seed ?? 'unknown'))}`;
}

export function hydrateRevision(
  value: unknown,
  kind: RevisionKind,
  fallbackSeed: unknown,
): RevisionId {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : legacyRevision(kind, fallbackSeed);
}

export function createComponentRevisionSet(): ComponentRevisionSet {
  return {
    component_revision: createRevision('component'),
    solver_input_revision: createRevision('solver_input'),
    limit_revision: createRevision('limit'),
  };
}

export function hydrateComponentRevisionSet(
  value: Partial<ComponentRevisionSet> | null | undefined,
  fallbackSeed: unknown,
): ComponentRevisionSet {
  return {
    component_revision: hydrateRevision(
      value?.component_revision,
      'component',
      fallbackSeed,
    ),
    solver_input_revision: hydrateRevision(
      value?.solver_input_revision,
      'solver_input',
      fallbackSeed,
    ),
    limit_revision: hydrateRevision(value?.limit_revision, 'limit', fallbackSeed),
  };
}

export function hydrateSourceRevision(
  value: Partial<SourceRevision> | null | undefined,
  fallbackSeed: unknown,
): SourceRevision {
  const component = hydrateComponentRevisionSet(value, fallbackSeed);
  return {
    project_revision: hydrateRevision(
      value?.project_revision,
      'project',
      fallbackSeed,
    ),
    ...component,
    network_revision: hydrateRevision(
      value?.network_revision,
      'network',
      fallbackSeed,
    ),
    scenario_revision: hydrateRevision(
      value?.scenario_revision,
      'scenario',
      fallbackSeed,
    ),
  };
}

function fnv1a(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}
