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
  /** Called the moment something changes. */
  markPending: () => void;
  /** Called once a write completes, successfully or not. */
  markSettled: () => void;
}

export const useSaveStatus = create<SaveStatusState>((set) => ({
  pending: false,
  markPending: () => set({ pending: true }),
  markSettled: () => set({ pending: false }),
}));

/** Non-hook access, for stores and watchers. */
export function markSavePending(): void {
  useSaveStatus.getState().markPending();
}

export function markSaveSettled(): void {
  useSaveStatus.getState().markSettled();
}
