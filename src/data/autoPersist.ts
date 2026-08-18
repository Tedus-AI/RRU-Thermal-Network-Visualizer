/**
 * Auto-persist — the replacement for the Save button.
 *
 * Each screen's store keeps a `dirty` flag for edits that have not reached
 * storage yet. That flag used to gate a Save button; now it is simply a signal
 * that a flush is due. This watches every such store and calls its `save`
 * shortly after anything changes, which persists and — through the storage
 * write listener — reaches the project folder.
 *
 * Centralised on purpose. Scattering a scheduler through six stores would mean
 * six chances to forget one, and the rule is identical for all of them.
 *
 * Explicitly NOT included: `solverStore`. Its `DIRTY` means a solved result is
 * stale, not that something needs writing, and re-solving is an engineering
 * decision the tool must never make on the user's behalf.
 */

import { useAnalysisStore } from './analysisStore';
import { useBoundaryStore } from './boundaryStore';
import { useComponentStore } from './componentStore';
import { useNetworkStore } from './networkStore';
import { useProjectStore } from './projectStore';
import { useReportStore } from './reportStore';
import { useSolutionStore } from './solutionStore';

/** A store that tracks unsaved edits and can flush them for a project. */
interface PersistableStore {
  subscribe: (listener: () => void) => () => void;
  getState: () => { dirty: boolean; save: (projectId: string) => void };
}

const STORES: Array<{ name: string; store: PersistableStore }> = [
  { name: 'components', store: useComponentStore as unknown as PersistableStore },
  { name: 'network', store: useNetworkStore as unknown as PersistableStore },
  { name: 'boundary', store: useBoundaryStore as unknown as PersistableStore },
  { name: 'analysis', store: useAnalysisStore as unknown as PersistableStore },
  { name: 'report', store: useReportStore as unknown as PersistableStore },
  { name: 'solution', store: useSolutionStore as unknown as PersistableStore },
];

/**
 * Shorter than the folder's own window, so a burst of edits produces one flush
 * per store and then a single file write, in that order.
 */
const FLUSH_MS = 350;

/**
 * The project edits belong to.
 *
 * Read at flush time rather than captured, because a store can go dirty just
 * before a project switch and must not be written under the wrong id.
 */
function activeProjectId(): string | null {
  const { draft, isNew } = useProjectStore.getState();
  // A project that has never been created has no file to write into.
  if (!draft || isNew) return null;
  return draft.project_id || null;
}

let started = false;

/** Starts watching. Idempotent; returns an unsubscribe for tests. */
export function startAutoPersist(): () => void {
  if (started) return () => {};
  started = true;

  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const unsubscribes = STORES.map(({ name, store }) =>
    store.subscribe(() => {
      if (!store.getState().dirty) return;

      const existing = timers.get(name);
      if (existing) clearTimeout(existing);

      timers.set(
        name,
        setTimeout(() => {
          timers.delete(name);
          const projectId = activeProjectId();
          if (!projectId) return;
          // Re-check: another path may have flushed it in the meantime.
          if (store.getState().dirty) store.getState().save(projectId);
        }, FLUSH_MS),
      );
    }),
  );

  return () => {
    for (const off of unsubscribes) off();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    started = false;
  };
}
