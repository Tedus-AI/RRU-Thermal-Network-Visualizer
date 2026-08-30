/**
 * Whether an edit is still on its way to disk.
 *
 * Kept apart from `folderStore` for two reasons. It has to be marked at the
 * moment of the edit — by the project store and the auto-persist watcher, both
 * of which `folderStore` already imports, so putting it there would be circular.
 * And it is genuinely a different fact: `folderStore.syncing` is "a file is open
 * for writing", which lasts milliseconds, while this covers the whole interval
 * from keystroke to write, which is what the user actually wants to see.
 *
 * Getting this wrong is worse than having no indicator: during the debounce the
 * light would otherwise still read "Saved", with a timestamp from before the
 * edit — a confident claim about work that is not yet stored.
 */

import { create } from 'zustand';

interface SaveStatusState {
  /** An edit has happened and has not finished being written. */
  pending: boolean;
  /** Monotonic edit generation used to reject stale write completions. */
  generation: number;
  /** Called the moment something changes. */
  markPending: () => number;
  /** Called once the write containing `generation` completes. */
  markSettled: (generation: number) => void;
}

export const useSaveStatus = create<SaveStatusState>((set) => ({
  pending: false,
  generation: 0,
  markPending: () => {
    let nextGeneration = 0;
    set((state) => {
      nextGeneration = state.generation + 1;
      return { pending: true, generation: nextGeneration };
    });
    return nextGeneration;
  },
  markSettled: (generation) =>
    set((state) =>
      generation >= state.generation ? { pending: false } : state,
    ),
}));

/** Non-hook access, for stores and watchers. */
export function markSavePending(): number {
  return useSaveStatus.getState().markPending();
}

export function currentSaveGeneration(): number {
  return useSaveStatus.getState().generation;
}

export function markSaveSettled(generation: number): void {
  useSaveStatus.getState().markSettled(generation);
}
