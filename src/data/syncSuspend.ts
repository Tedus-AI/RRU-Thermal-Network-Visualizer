/**
 * A latch for writes that must not bounce back to disk.
 *
 * Hydration replays folder contents into the local cache through the normal
 * save path, which trips the same write listener that mirrors changes out.
 * Without suspending that, opening a workspace would immediately rewrite every
 * file it just read.
 *
 * This lives on its own so the workspace loader and the sync store can both
 * reach it without importing each other.
 */

/** A counter, not a flag, so nested suspensions cannot end one another early. */
let depth = 0;

export function isSyncSuspended(): boolean {
  return depth > 0;
}

/** Runs `body` with mirroring off, restoring it even if `body` throws. */
export async function withSyncSuspended<T>(body: () => Promise<T>): Promise<T> {
  depth += 1;
  try {
    return await body();
  } finally {
    depth -= 1;
  }
}
