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
import {
  clearWorkingCache,
  loadProjects,
  loadSyncState,
  loadUnsyncedMarkers,
  markProjectSynced,
  markProjectUnsynced,
  onStorageWrite,
  projectIdExists,
  saveSyncRecord,
} from './persistence';
import { collectProject, serializeProjectFile, type ProjectFile } from './projectFile';
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
  deleteFile,
  fileModifiedAt,
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
  /**
   * Something the engineer should be told once, not an error — e.g. unsaved
   * edits that were written back as a recovered copy. The shell shows it and
   * clears it.
   */
  notice: string | null;
  clearNotice: () => void;

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
  /**
   * Removes the project's own file from the folder, and forgets its name.
   *
   * Deleting a project cleared every browser-side collection but left the JSON
   * on disk, so the next hydrate read it straight back in — the delete looked
   * like it worked until the folder was re-read, and the file counted against
   * the engineer's own directory in the meantime. Only the file this project
   * was loaded from is touched; nothing else in the folder is the app's to
   * remove. Returns false when the file is still there afterwards.
   */
  deleteProjectFile: (projectId: string) => Promise<boolean>;
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
  notice: null,

  clearNotice: () => set({ notice: null }),

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
    // The cache is about to be emptied. Anything in it that never reached the
    // folder goes there first, while there is still a folder to write to.
    if (get().handle && get().status === 'connected') {
      for (const projectId of Object.keys(loadUnsyncedMarkers())) {
        if (projectIdExists(projectId)) await get().mirror(projectId);
      }
    }
    await clearStoredHandle();
    // The cache only ever mirrored the folder; keeping it would leave projects
    // on screen that the app can no longer write to.
    await withSyncSuspended(async () => {
      clearWorkingCache();
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
      // Hydration replaces the cache with the folder. Edits that were in the
      // cache but never reached the folder — a tab closed inside the save
      // debounce, a permission that lapsed mid-session, a write that failed —
      // would be wiped by that, silently. They are written out first.
      const recovered = await rescueUnsyncedProjects(handle);
      const result = await hydrateFromFolder(handle);
      for (const [projectId, filename] of Object.entries(result.projectFiles)) {
        const modified_at = result.projectFileModifiedAt[projectId];
        if (typeof modified_at === 'number') saveSyncRecord(projectId, { filename, modified_at });
      }
      set({
        hydrated: true,
        skipped: result.skipped,
        projectFilenames: result.projectFiles,
        lastError: null,
        notice:
          recovered.length > 0
            ? `Unsaved edits were found that the project folder did not have, and the folder copy had changed since. They were kept as a separate project so nothing is lost: ${recovered.join(', ')}. / 發現資料夾中沒有的未儲存修改，且資料夾內的檔案之後也被變更過；為避免遺失，已另存為獨立專案：${recovered.join('、')}。`
            : null,
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

    // The marker's version when this write starts: an edit that lands while
    // the file is open bumps it, and the marker then survives this write.
    const markers = loadUnsyncedMarkers();
    const markerVersion = Object.hasOwn(markers, projectId)
      ? markers[projectId].version
      : undefined;
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
      const filenames = get().projectFilenames;
      const filename = Object.hasOwn(filenames, projectId)
        ? filenames[projectId]
        : mirrorFilename(projectId);
      await writeTextFile(handle, filename, serializeProjectFile(file));
      markProjectSynced(projectId, markerVersion);
      const modified_at = await fileModifiedAt(handle, filename);
      if (modified_at != null) saveSyncRecord(projectId, { filename, modified_at });
      markSaveSettled(saveGeneration);
      set({
        status: 'connected',
        syncing: false,
        lastSyncAt: new Date().toISOString(),
        lastSyncedProjectId: projectId,
        projectFilenames: withOwn(get().projectFilenames, projectId, filename),
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

  deleteProjectFile: async (projectId) => {
    const { handle, projectFilenames } = get();
    const filename = Object.hasOwn(projectFilenames, projectId)
      ? projectFilenames[projectId]
      : mirrorFilename(projectId);
    // Forget the name either way: the project is gone from the cache, so a
    // later save must never resurrect it under the name it used to hold.
    const remaining = { ...projectFilenames };
    if (Object.hasOwn(remaining, projectId)) delete remaining[projectId];
    set({ projectFilenames: remaining });
    // Nor may a later hydrate "rescue" it back from the cache it just left.
    markProjectSynced(projectId);
    saveSyncRecord(projectId, null);
    if (!handle) return false;
    const removed = await deleteFile(handle, filename);
    if (!removed) {
      set({
        status: 'error',
        lastError: `Deleted the project, but could not remove "${filename}" from the folder`,
      });
    }
    return removed;
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

// --- rescue -----------------------------------------------------------------

/** `{ ...record, [key]: value }` without the `__proto__` setter. */
function withOwn<T>(record: Record<string, T>, key: string, value: T): Record<string, T> {
  return Object.fromEntries([...Object.entries(record), [key, value]]);
}

/**
 * The cached project as a separate project: a new id and a name that says so.
 *
 * `applyProjectFile` re-points every row at `file.project_id`, so changing
 * the file's id and the project record is enough for the copy to load as its
 * own project, beside — not over — the folder's version.
 */
function asRecoveredCopy(file: ProjectFile, copyId: string): ProjectFile {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const name = `${file.project_name} (recovered ${stamp})`;
  return {
    ...file,
    project_id: copyId,
    project_name: name,
    data: {
      ...file.data,
      project: { ...file.data.project, project_id: copyId, project_name: name },
    },
  };
}

/** `<id>_recovered`, `<id>_recovered2`, … — free in the cache and in the folder. */
function recoveredId(projectId: string, taken: ReadonlySet<string>): string {
  const base = `${projectId.slice(0, 50)}_recovered`;
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? base : `${base}${n}`;
    if (!projectIdExists(candidate) && !taken.has(mirrorFilename(candidate))) return candidate;
  }
  return `${base}_${Date.now()}`;
}

/**
 * Writes every project whose cache is ahead of its file to the folder, before
 * a hydrate replaces the cache with the folder's contents.
 *
 * When the file is exactly as this tool last wrote it, the newer edits simply
 * go into it — the ordinary save that never happened. When the file changed
 * since (edited on another machine, replaced by hand, or this is a different
 * folder altogether), overwriting it would trade one side's work for the
 * other's, so the edits are written as a separate, clearly named project
 * instead and both survive. Returns the names of any such copies.
 */
async function rescueUnsyncedProjects(handle: DirectoryHandle): Promise<string[]> {
  const markers = loadUnsyncedMarkers();
  const ids = Object.keys(markers);
  if (ids.length === 0) return [];

  const state = loadSyncState();
  const entries = await listProjectFiles(handle);
  const onDisk = new Map(entries.map((entry) => [entry.filename, entry]));
  const taken = new Set(onDisk.keys());
  const recovered: string[] = [];

  for (const projectId of ids) {
    // Deleted since the edit: nothing to rescue, and nothing to resurrect.
    const file = projectIdExists(projectId) ? collectProject(projectId, BUILD_ID) : null;
    if (!file) {
      markProjectSynced(projectId);
      continue;
    }

    const record = Object.hasOwn(state, projectId) ? state[projectId] : undefined;
    const filename = record?.filename ?? mirrorFilename(projectId);
    const current = onDisk.get(filename);
    const untouched =
      current == null ? record == null : record != null && current.modified_at === record.modified_at;

    try {
      if (untouched) {
        await writeTextFile(handle, filename, serializeProjectFile(file));
      } else {
        const copyId = recoveredId(projectId, taken);
        const copy = asRecoveredCopy(file, copyId);
        const copyName = mirrorFilename(copyId);
        await writeTextFile(handle, copyName, serializeProjectFile(copy));
        taken.add(copyName);
        recovered.push(copy.project_name);
      }
      markProjectSynced(projectId);
    } catch {
      // Leave the marker: the cache keeps the edits, and the next hydrate
      // tries again rather than replacing them.
      throw new Error(
        `Could not write the unsaved edits of "${projectId}" to the folder before reloading it, so the folder was not reloaded.`,
      );
    }
  }
  return recovered;
}

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
/** Projects written since the last mirror, so each gets its own file write. */
const pendingProjects = new Set<string>();

/** Writes every project that changed since the last mirror. */
function mirrorPending(): Promise<unknown> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const ids = [...pendingProjects];
  pendingProjects.clear();
  const store = useFolderStore.getState();
  return Promise.all(
    ids.map((projectId) => {
      // A project deleted after its last edit has no file to write.
      if (!projectIdExists(projectId)) {
        markProjectSynced(projectId);
        return Promise.resolve(false);
      }
      return store.mirror(projectId);
    }),
  );
}

/**
 * Starts the pending folder writes NOW instead of after the debounce.
 *
 * For a tab being hidden or closed. The write is asynchronous and may not
 * finish before the page goes; that is what the unsynced marker is for — the
 * next session finds it and writes the edits out before reloading the folder.
 */
export function flushFolderSyncNow(): Promise<unknown> {
  if (pendingProjects.size === 0) return Promise.resolve();
  if (useFolderStore.getState().status !== 'connected') return Promise.resolve();
  return mirrorPending();
}

/** True while some project's cache is ahead of its file on disk. */
export function hasUnsyncedProjects(): boolean {
  return Object.keys(loadUnsyncedMarkers()).some((projectId) => projectIdExists(projectId));
}

/**
 * Starts mirroring on every persisted write. Idempotent.
 *
 * Returns an unsubscribe for tests; the app installs this once and leaves it.
 */
export function startFolderAutoSync(): () => void {
  if (started) return () => {};
  started = true;

  const stop = onStorageWrite((_key, writtenProjectId) => {
    // Hydration replays the folder through the save path; nothing it writes
    // is newer than the folder, so it neither marks nor mirrors anything.
    if (isSyncSuspended()) {
      markSaveIdle();
      return;
    }

    // Recorded whatever the folder's state: this is what lets the next
    // session find edits that never reached disk and write them out before
    // the cache is replaced.
    const projectId = writtenProjectId ?? activeProjectId;
    if (projectId) markProjectUnsynced(projectId);

    // No mirror will be scheduled on any of these paths, and `mirror` is the
    // only thing that settles the save indicator — so say so here rather than
    // leaving it reading "Writing JSON…" against a folder that is not bound or
    // has no project selected. The marker above keeps the truth meanwhile.
    const { status } = useFolderStore.getState();
    if (status !== 'connected' || !projectId) {
      markSaveIdle();
      return;
    }

    pendingProjects.add(projectId);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void mirrorPending();
    }, DEBOUNCE_MS);
  });

  return () => {
    stop();
    if (timer) clearTimeout(timer);
    timer = null;
    pendingProjects.clear();
    started = false;
  };
}
