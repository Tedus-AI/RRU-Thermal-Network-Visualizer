/**
 * Local folder sync.
 *
 * Owns the bound folder, its permission state, and the mirroring that happens
 * after a save. The mechanics live in `folderBinding`; the policy is here.
 *
 * Mirroring is deliberately best-effort. A failed disk write is surfaced but
 * never blocks or reverts the localStorage write that already succeeded — the
 * folder is a durable copy of the working store, not a second source of truth
 * that could disagree with it.
 */

import { create } from 'zustand';

import { BUILD_ID } from './bootstrapStorage';
import { onStorageWrite } from './persistence';
import { collectProject, serializeProjectFile } from './projectFile';
import {
  clearStoredHandle,
  listProjectFiles,
  loadStoredHandle,
  mirrorFilename,
  pickFolder,
  queryPermission,
  readTextFile,
  requestPermission,
  storeHandle,
  supportsFolderBinding,
  writeTextFile,
  type DirectoryHandle,
  type FolderEntry,
} from './folderBinding';

export type FolderStatus =
  /** Browser cannot do this at all (not Chromium). */
  | 'unsupported'
  /** Supported, but no folder chosen. */
  | 'unbound'
  /** Bound and writable. */
  | 'connected'
  /** Bound, but the browser wants the permission re-granted via a click. */
  | 'needs_permission'
  /** Bound, but the last write failed. */
  | 'error';

interface FolderStoreState {
  status: FolderStatus;
  handle: DirectoryHandle | null;
  folderName: string | null;
  lastSyncAt: string | null;
  lastSyncedProjectId: string | null;
  lastError: string | null;
  syncing: boolean;

  /** Called once at startup to pick up a folder bound in an earlier session. */
  restore: () => Promise<void>;
  /** Opens the picker. Must run from a user gesture. */
  bind: () => Promise<boolean>;
  /** Re-prompts for a downgraded permission. Must run from a user gesture. */
  reconnect: () => Promise<boolean>;
  unbind: () => Promise<void>;

  /** Writes one project to the folder now. */
  mirror: (projectId: string) => Promise<boolean>;
  listFiles: () => Promise<FolderEntry[]>;
  readFile: (filename: string) => Promise<string | null>;
}

export const useFolderStore = create<FolderStoreState>((set, get) => ({
  status: supportsFolderBinding() ? 'unbound' : 'unsupported',
  handle: null,
  folderName: null,
  lastSyncAt: null,
  lastSyncedProjectId: null,
  lastError: null,
  syncing: false,

  restore: async () => {
    if (!supportsFolderBinding()) {
      set({ status: 'unsupported' });
      return;
    }
    const handle = await loadStoredHandle();
    if (!handle) {
      set({ status: 'unbound' });
      return;
    }
    // A stored handle can come back with its permission downgraded to `prompt`;
    // regaining it needs a click, so the state says so rather than failing later.
    const permission = await queryPermission(handle);
    set({
      handle,
      folderName: handle.name,
      status: permission === 'granted' ? 'connected' : 'needs_permission',
    });
  },

  bind: async () => {
    const handle = await pickFolder();
    if (!handle) return false;

    const permission =
      (await queryPermission(handle)) === 'granted'
        ? 'granted'
        : await requestPermission(handle);
    if (permission !== 'granted') {
      set({ status: 'needs_permission', handle, folderName: handle.name });
      return false;
    }

    try {
      await storeHandle(handle);
    } catch {
      // Failing to remember the handle only costs the binding at next reload;
      // it must not cost the binding the user just made.
    }
    set({
      handle,
      folderName: handle.name,
      status: 'connected',
      lastError: null,
    });
    return true;
  },

  reconnect: async () => {
    const { handle } = get();
    if (!handle) return false;
    const permission = await requestPermission(handle);
    if (permission !== 'granted') {
      set({ status: 'needs_permission' });
      return false;
    }
    set({ status: 'connected', lastError: null });
    return true;
  },

  unbind: async () => {
    await clearStoredHandle();
    set({
      handle: null,
      folderName: null,
      status: supportsFolderBinding() ? 'unbound' : 'unsupported',
      lastSyncAt: null,
      lastSyncedProjectId: null,
      lastError: null,
    });
  },

  mirror: async (projectId) => {
    const { handle, status } = get();
    if (!handle || status === 'unsupported' || status === 'unbound') return false;

    // Re-check rather than trusting the cached status: the browser can revoke
    // between one save and the next.
    if ((await queryPermission(handle)) !== 'granted') {
      set({ status: 'needs_permission' });
      return false;
    }

    const file = collectProject(projectId, BUILD_ID);
    if (!file) return false;

    set({ syncing: true });
    try {
      await writeTextFile(handle, mirrorFilename(projectId), serializeProjectFile(file));
      set({
        status: 'connected',
        syncing: false,
        lastSyncAt: new Date().toISOString(),
        lastSyncedProjectId: projectId,
        lastError: null,
      });
      return true;
    } catch (error) {
      set({
        status: 'error',
        syncing: false,
        lastError: error instanceof Error ? error.message : 'Write failed',
      });
      return false;
    }
  },

  listFiles: async () => {
    const { handle } = get();
    if (!handle) return [];
    try {
      return await listProjectFiles(handle);
    } catch {
      return [];
    }
  },

  readFile: async (filename) => {
    const { handle } = get();
    if (!handle) return null;
    return readTextFile(handle, filename);
  },
}));

// --- Auto-sync -------------------------------------------------------------

/** Which project the mirror should write. Set by the shell as you navigate. */
let activeProjectId: string | null = null;

export function setSyncProject(projectId: string | null): void {
  activeProjectId = projectId;
}

/**
 * Coalescing window. A single user-visible "save" fans out into many
 * `writeCollection` calls — project, scenarios, components, network — and
 * mirroring each one would rewrite the same file a dozen times per click.
 */
const DEBOUNCE_MS = 1200;

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/**
 * Starts mirroring on every persisted write. Idempotent.
 *
 * Returns an unsubscribe for tests; the app installs this once and leaves it.
 */
export function startFolderAutoSync(): () => void {
  if (started) return () => {};
  started = true;

  const stop = onStorageWrite(() => {
    const { status } = useFolderStore.getState();
    if (status !== 'connected' || !activeProjectId) return;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const projectId = activeProjectId;
      if (projectId) void useFolderStore.getState().mirror(projectId);
    }, DEBOUNCE_MS);
  });

  return () => {
    stop();
    if (timer) clearTimeout(timer);
    timer = null;
    started = false;
  };
}
