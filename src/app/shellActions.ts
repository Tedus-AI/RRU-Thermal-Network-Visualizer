import { create } from 'zustand';

/**
 * Lets the active screen expose its Save action to the shared header without the
 * header knowing which screen is mounted.
 */
interface ShellActions {
  saveHandler: (() => void) | null;
  setSaveHandler: (handler: (() => void) | null) => void;
}

export const useShellActions = create<ShellActions>((set) => ({
  saveHandler: null,
  setSaveHandler: (handler) => set({ saveHandler: handler }),
}));
