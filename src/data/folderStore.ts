/**
 * Local folder sync.
 *
 * Owns the bound folder, its permission state, and the mirroring that happens
 * after a save. The mechanics live in `folderBinding`; the policy is here.
 *
 * The browser cache is the synchronous working copy; the selected folder is
 * the durable source of truth. "Saved" therefore means the latest edit
 * generation reached its project JSON file, not merely localStorage.
 */

import { create } from 'zustand';

import { BUILD_ID } from './bootstrapStorage';
import { loadProjects, onStorageWrite } from './persistence';
import { collectProject, serializeProjectFile } from './projectFile';
import { clearOwnedStorage } from './buildStamp';
import { hydrateFromFolder } from './workspace';
import { isSyncSuspended, withSyncSuspended } from './syncSuspend';
import { currentSaveGeneration, markSaveIdle, markSaveSettled } from './saveStatus';
import { useProjectStore } from './projectStore';
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
  /** Actual JSON filename each project was loaded from. */
  projectFilenames: Record<string, string>;

  /**
   * True until the startup restore has settled. Without it the gate would flash
   * "choose a folder" before the remembered handle has been looked up.
   */
  restoring: boolean;
  /** True once the folder has been read into the local cache. */
  hydrated: boolean;
  /** Files in the folder that are not usable project files. */
  skipped: Array<{ filename: string; reason: string }>;

  /** Called once at startup to pick up a folder bound in an earlier session. */
  restore: () => Promise<void>;
  /** Opens the picker. Must run from a user gesture. */
  bind: () => Promise<boolean>;
  /** Re-prompts for a downgraded permission. Must run from a user gesture. */
  reconnect: () => Promise<boolean>;
  unbind: () => Promise<void>;
  /** Reads the folder into the local cache, replacing whatever was cached. */
  hydrate: () => Promise<void>;

  /** Writes one project to the folder now. */
  mirror: (projectId: string) => Promise<boolean>;
  /**
   * Writes every cached project. Needed after anything that creates or changes
   * a project other than the active one — seeding the demo makes two.
   */
  mirrorAll: () => Promise<number>;
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
  projectFilenames: {},
  restoring: true,
  hydrated: false,
  skipped: [],

  restore: async () => {
    try {
      if (!supportsFolderBinding()) {
        set({ status: 'unsupported' });
        return;
      }
      const handle = await loadStoredHandle();
      if (!handle) {
        set({ status: 'unbound' });
        return;
      }
      // A stored handle can come back with its permission downgraded to
      // `prompt`; regaining it needs a click, so the state says so rather than
      // failing later.
      const permission = await queryPermission(handle);
      if (permission !== 'granted') {
        set({ handle, folderName: handle.name, status: 'needs_permission' });
        return;
      }
      set({ handle, folderName: handle.name, status: 'connected' });
      await get().hydrate();
    } finally {
      set({ restoring: false });
    }
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
      hydrated: false,
    });
    await get().hydrate();
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
    await get().hydrate();
    return true;
  },

  unbind: async () => {
    await clearStoredHandle();
    // The cache only ever mirrored the folder; keeping it would leave projects
    // on screen that the app can no longer write to.
    await withSyncSuspended(async () => {
      if (typeof localStorage !== 'undefined') clearOwnedStorage(localStorage);
    });
    set({
      handle: null,
      folderName: null,
      status: supportsFolderBinding() ? 'unbound' : 'unsupported',
      lastSyncAt: null,
      lastSyncedProjectId: null,
      lastError: null,
      hydrated: false,
      skipped: [],
      projectFilenames: {},
    });
  },

  hydrate: async () => {
    const { handle } = get();
    if (!handle) return;
    try {
      const result = await hydrateFromFolder(handle);
      set({
        hydrated: true,
        skipped: result.skipped,
        projectFilenames: result.projectFiles,
        lastError: null,
      });
      // The cache was replaced wholesale; the project list must be re-read.
      useProjectStore.getState().refreshProjects();
    } catch (error) {
      set({
        status: 'error',
        hydrated: false,
        lastError: error instanceof Error ? error.message : 'Could not read the folder',
      });
    }
  },

  mirror: async (projectId) => {
    const { handle, status } = get();
    if (!handle || status === 'unsupported' || status === 'unbound') return false;
    const saveGeneration = currentSaveGeneration();

    // Re-check rather than trusting the cached status: the browser can revoke
    // between one save and the next.
    if ((await queryPermission(handle)) !== 'granted') {
      markSaveSettled(saveGeneration);
      set({ status: 'needs_permission' });
      return false;
    }

    const file = collectProject(projectId, BUILD_ID);
    if (!file) {
      markSaveSettled(saveGeneration);
      set({
        status: 'error',
        lastError: `Project "${projectId}" is missing from the working cache`,
      });
      return false;
    }

    set({ syncing: true });
    try {
      const filename = get().projectFilenames[projectId] ?? mirrorFilename(projectId);
      await writeTextFile(handle, filename, serializeProjectFile(file));
      markSaveSettled(saveGeneration);
      set({
        status: 'connected',
        syncing: false,
        lastSyncAt: new Date().toISOString(),
        lastSyncedProjectId: projectId,
        projectFilenames: { ...get().projectFilenames, [projectId]: filename },
        lastError: null,
      });
      return true;
    } catch (error) {
      markSaveSettled(saveGeneration);
      set({
        status: 'error',
        syncing: false,
        lastError: error instanceof Error ? error.message : 'Write failed',
      });
      return false;
    }
  },

  mirrorAll: async () => {
    const { handle, status } = get();
    if (!handle || status !== 'connected') return 0;
    let written = 0;
    for (const project of loadProjects()) {
      if (await get().mirror(project.project_id)) written += 1;
    }
    return written;
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
 * Coalescing window.
 *
 * One user-visible edit fans out into many `writeCollection` calls — project,
 * scenarios, components, network — and each keystroke in a form is another
 * round. A Golden Demo project file is ~415 KB, so writing per call would mean
 * rewriting that much disk many times a second. Everything inside the window
 * collapses into a single write.
 */
const DEBOUNCE_MS = 800;

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
    // No mirror will be scheduled on any of these paths, and `mirror` is the
    // only thing that settles the save indicator — so say so here rather than
    // leaving it reading "Writing JSON…" against a folder that is not bound,
    // is suspended, or has no project selected.
    if (isSyncSuspended()) {
      markSaveIdle();
      return;
    }
    const { status } = useFolderStore.getState();
    if (status !== 'connected' || !activeProjectId) {
      markSaveIdle();
      return;
    }

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
