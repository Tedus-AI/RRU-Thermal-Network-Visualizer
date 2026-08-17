/**
 * Boot-time storage check — imported first by `main.tsx` so it runs before any
 * store touches localStorage.
 *
 * Policy, on top of `buildStamp.ts`'s mechanics:
 *
 *  - Same build → leave everything alone. Working through Screens 01–12 and
 *    pressing F5 must not cost you the project.
 *  - New build with data present → clear, then re-seed the demo project, so the
 *    app opens on something rather than on an empty list nobody asked for.
 *  - New build with storage already empty → stamp only. A first-time visitor
 *    keeps Screen 01's empty state, which is a specified UI state and must stay
 *    reachable.
 *
 * In `vite dev` the build id is the constant `dev`, so HMR and dev-server
 * restarts never wipe a project mid-session. Deployed builds carry the commit
 * sha, so every deploy refreshes automatically. `resetProjectStorage()` is the
 * manual escape hatch for the dev case.
 */

import { seedDemoProject } from '@/mock/seed';

import {
  clearOwnedStorage,
  syncBuildStamp,
  type BuildStampOutcome,
  type StorageLike,
} from './buildStamp';

/** Injected by Vite — see `vite.config.ts`. */
export const BUILD_ID: string = __BUILD_ID__;

/**
 * localStorage, or null where it cannot be used.
 *
 * Access itself can throw — Safari in private mode, and any browser with
 * site data blocked — so the read is guarded rather than merely type-checked.
 */
function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Runs the build check. Resolves with what happened, or null if storage is
 * unusable.
 *
 * Async because `seedDemoProject` builds the Golden Flow — it solves the
 * network and writes every downstream artifact — and the caller must be able to
 * wait for those writes before reading them back.
 */
export async function bootstrapStorage(
  buildId: string = BUILD_ID,
): Promise<BuildStampOutcome | null> {
  const store = storage();
  if (store == null) return null;

  const outcome = syncBuildStamp(buildId, store);

  if (outcome.action === 'reset') {
    await seedDemoProject();
    // Say it out loud: data disappearing without explanation is worse than the
    // stale data this check exists to prevent.
    console.info(
      `[tnv] Project storage was written by build "${
        outcome.previous_build_id ?? 'unstamped'
      }" and has been reset for build "${outcome.build_id}". ` +
        `Cleared ${outcome.cleared.length} collection(s) and re-seeded the Golden Demo.`,
    );
  }

  return outcome;
}

/**
 * Clears every `tnv.*` collection, re-seeds the Golden Demo and reloads.
 *
 * Exposed on `window` as `tnvResetStorage()` for the case the build id cannot
 * catch: local development, where the id stays `dev` across code changes.
 *
 * The reload waits for the seed. Reloading first would race the Golden Flow's
 * writes and leave storage half-populated.
 */
export async function resetProjectStorage(): Promise<void> {
  const store = storage();
  if (store == null) return;
  clearOwnedStorage(store);
  await seedDemoProject();
  if (typeof location !== 'undefined') location.reload();
}

/**
 * The boot check, started at import time.
 *
 * `main.tsx` awaits this before mounting, so no store can read storage while it
 * is being rebuilt. It never rejects: a failed seed leaves the app to open on
 * its empty state rather than not opening at all.
 */
export const storageReady: Promise<BuildStampOutcome | null> = bootstrapStorage().catch(
  (error: unknown) => {
    console.error('[tnv] Storage bootstrap failed; continuing with empty storage.', error);
    return null;
  },
);

if (typeof window !== 'undefined') {
  window.tnvResetStorage = resetProjectStorage;
}
