/**
 * Build stamp — stops persisted data from outliving the code that wrote it.
 *
 * Every `tnv.*` document was written by some particular build. When the build
 * changes, what is on disk may describe a shape the new code no longer reads,
 * and the failure is silent: the app boots, shows stale numbers, and a hard
 * reload never helps because Ctrl+Shift+R clears the HTTP cache, not
 * localStorage. The usual symptom is that a second browser "shows the latest"
 * purely because its profile has no `tnv.*` data at all.
 *
 * So the build id is stored next to the data and compared on boot. A mismatch
 * clears the `tnv.` namespace. Storage that carries no stamp counts as a
 * mismatch — it predates this check, so its build is unknown and cannot be
 * assumed compatible.
 *
 * This module is pure storage mechanics and takes its `Storage` as an argument
 * so it is testable without a DOM. Deciding what to re-seed afterwards belongs
 * to `bootstrapStorage.ts`.
 */

/** Where the stamp itself lives. Inside the namespace, but never cleared with it. */
export const BUILD_STAMP_KEY = 'tnv.build_stamp';

/** Everything this tool owns is under one prefix, so a sweep can be exhaustive. */
const OWNED_PREFIX = 'tnv.';

/** The slice of the `Storage` interface this module needs. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type BuildStampOutcome =
  /** The stamp matched — the data belongs to this build and is left alone. */
  | { action: 'kept'; build_id: string }
  /** Mismatch, but there was nothing to clear: record the stamp and move on. */
  | { action: 'stamped'; build_id: string; previous_build_id: string | null }
  /** Mismatch with data present: the namespace was cleared. */
  | {
      action: 'reset';
      build_id: string;
      previous_build_id: string | null;
      cleared: string[];
    };

/**
 * Every owned key currently in storage, excluding the stamp.
 *
 * Read into an array before deleting anything — `Storage.key(i)` walks a live
 * index, so removing during the walk skips entries.
 */
export function ownedKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key != null && key.startsWith(OWNED_PREFIX) && key !== BUILD_STAMP_KEY) {
      keys.push(key);
    }
  }
  return keys;
}

/** Removes every owned key and reports what went. Foreign keys are untouched. */
export function clearOwnedStorage(storage: StorageLike): string[] {
  const keys = ownedKeys(storage);
  for (const key of keys) storage.removeItem(key);
  return keys;
}

/**
 * Compares the stored stamp with the running build and clears on mismatch.
 *
 * The stamp is written even when nothing was cleared, so a browser that arrives
 * empty is not treated as stale on its next visit.
 */
export function syncBuildStamp(buildId: string, storage: StorageLike): BuildStampOutcome {
  const previous = storage.getItem(BUILD_STAMP_KEY);
  if (previous === buildId) return { action: 'kept', build_id: buildId };

  const cleared = clearOwnedStorage(storage);
  storage.setItem(BUILD_STAMP_KEY, buildId);

  return cleared.length === 0
    ? { action: 'stamped', build_id: buildId, previous_build_id: previous }
    : { action: 'reset', build_id: buildId, previous_build_id: previous, cleared };
}
