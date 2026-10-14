/**
 * The last moments of a tab.
 *
 * An edit reaches disk through two debounces: the store flush (~350 ms) into
 * the browser cache, then the folder write (~800 ms). Closing or reloading the
 * tab inside that window used to lose the edit outright — the next session
 * hydrates the cache FROM the folder, so a value that only ever reached the
 * cache was replaced by the older file without a word.
 *
 * Three things close that gap:
 *   - when the tab is hidden or being unloaded, every pending store flush and
 *     the project auto-commit run immediately (synchronously, into the cache),
 *     and the folder write is started without waiting for its debounce;
 *   - an unload while something has still not reached disk asks the browser
 *     to confirm leaving;
 *   - whatever still did not make it is marked unsynced in the cache, and the
 *     next session writes it to the folder before reloading from it (see
 *     `folderStore.hydrate`).
 */

import { flushAutoPersistNow } from './autoPersist';
import { flushFolderSyncNow, hasUnsyncedProjects, useFolderStore } from './folderStore';
import { flushProjectAutoCommit } from './projectStore';
import { useSaveStatus } from './saveStatus';

/** Moves every pending edit into the cache and starts the folder write. */
export function flushPendingWork(): void {
  flushProjectAutoCommit();
  flushAutoPersistNow();
  void flushFolderSyncNow();
}

/** Whether leaving now could cost an edit that has not reached disk. */
export function hasWorkNotOnDisk(): boolean {
  const { status } = useFolderStore.getState();
  if (status === 'unbound' || status === 'unsupported') return false;
  return useSaveStatus.getState().pending || hasUnsyncedProjects();
}

let started = false;

/** Installs the handlers. Idempotent; returns an uninstall for tests. */
export function startUnloadGuard(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flushPendingWork();
  };
  const onPageHide = () => flushPendingWork();
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    flushPendingWork();
    if (!hasWorkNotOnDisk()) return;
    // The browser shows its own wording; both of these are how a page asks.
    event.preventDefault();
    event.returnValue = '';
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
    started = false;
  };
}
