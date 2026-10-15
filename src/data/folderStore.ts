/**
 * Project storage sync — a local folder, or SharePoint.
 *
 * Owns where projects live (the "backend"), its permission state, and the
 * mirroring that happens after a save. The mechanics live in `folderBinding`
 * (local folder) and `sharepointFolder` (SharePoint, through the same
 * `DirectoryHandle`); the policy is here and is the same for both.
 *
 * The browser cache is the synchronous working copy; the folder is the durable
 * source of truth. "Saved" therefore means the latest edit generation reached
 * its project JSON file, not merely localStorage.
 *
 * SharePoint is shared, so a save can find the file changed by someone else
 * (412). Nothing is overwritten then: this session's version becomes a separate
 * "conflict copy" project, the original takes SharePoint's version, and the
 * shell moves the engineer onto their copy (see `resolveConflict`).
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
import {
  applyProjectFile,
  collectProject,
  parseProjectFile,
  serializeProjectFile,
  type ProjectFile,
} from './projectFile';
import { hydrateFromFolder } from './workspace';
import { isSyncSuspended, withSyncSuspended, withSyncSuspendedSync } from './syncSuspend';
import { currentSaveGeneration, markSaveIdle, markSaveSettled } from './saveStatus';
import { flushProjectAutoCommit, useProjectStore } from './projectStore';
import { flushAutoPersistNow } from './autoPersist';
import { LIBRARY_FILENAME, mergeLibraries, parseLibraryFile, serializeLibrary } from './componentLibraryFile';
import { isSharePointError, sharePoint, type SignInResult } from './sharepoint';
import { SharePointDirectory, isSharePointDirectory } from './sharepointFolder';
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
  /** No storage chosen yet: the gate asks for SharePoint or a local folder. */
  | 'unbound'
  /** Bound and writable. */
  | 'connected'
  /**
   * Bound, but a click is needed first: the browser wants the folder
   * permission re-granted, or the Microsoft sign-in expired.
   */
  | 'needs_permission'
  /** Bound, but the last write (or opening it) failed. */
  | 'error';

/** Where projects live. */
export type StorageBackend = 'folder' | 'sharepoint';

/** A save that found the project changed on SharePoint by someone else. */
export interface ConflictNotice {
  /** The project as it was; it now holds SharePoint's version. */
  projectId: string;
  projectName: string;
  /** This session's version, kept as a new project. */
  copyId: string;
  copyName: string;
  /** Who saved the SharePoint version, when SharePoint says. */
  remoteBy: string | null;
  remoteAt: string | null;
}

/** The active project was saved on SharePoint by someone else since it was read. */
export interface RemoteChange {
  projectId: string;
  by: string | null;
  at: string | null;
}

export interface UploadReport {
  ok: boolean;
  /** Project files written to SharePoint. */
  uploaded: string[];
  /** Already on SharePoint under the same name — left as they were. */
  skipped: string[];
  /** Whether the component library was merged into SharePoint's. */
  library: boolean;
  error?: string;
}

interface FolderStoreState {
  status: FolderStatus;
  /** Null until a storage location is chosen. */
  backend: StorageBackend | null;
  /** Whether this browser can bind a local folder (Chromium only). SharePoint works everywhere. */
  folderSupported: boolean;
  handle: DirectoryHandle | null;
  folderName: string | null;
  /** The Microsoft account, in SharePoint mode. */
  account: { name: string; email: string } | null;
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
  /** The last SharePoint save conflict, until the shell has dealt with it. */
  conflict: ConflictNotice | null;
  clearConflict: () => void;
  /** The active project changed on SharePoint since it was read. */
  remoteChange: RemoteChange | null;
  /** A local folder is being moved to SharePoint (`uploadToSharePoint`). */
  uploading: boolean;

  /** Called once at startup to pick up a folder bound in an earlier session. */
  restore: () => Promise<void>;
  /** Opens the picker. Must run from a user gesture. */
  bind: () => Promise<boolean>;
  /**
   * Opens the SharePoint project folder: Microsoft sign-in (popup), then the
   * site, then the projects. Must run from a user gesture. `select` lets the
   * engineer pick another account.
   */
  connectSharePoint: (options?: { select?: boolean }) => Promise<boolean>;
  /**
   * Moves the open local folder's projects to SharePoint and continues there.
   * A project already on SharePoint under the same file name is left alone;
   * the component library is merged. The local files are not touched.
   */
  uploadToSharePoint: () => Promise<UploadReport>;
  /**
   * Re-prompts for a downgraded permission — or signs in to Microsoft again.
   * Must run from a user gesture.
   */
  reconnect: () => Promise<boolean>;
  unbind: () => Promise<void>;
  /**
   * Asks SharePoint whether the active project was saved by someone else since
   * this session read it, and records the answer in `remoteChange`.
   */
  checkRemote: (projectId: string) => Promise<void>;
  /**
   * Before a project is opened: when SharePoint holds a newer version than the
   * cache and this browser has no unsaved edits to it, the newer version is
   * read in first, so the screens open on it. Never throws.
   */
  refreshProject: (projectId: string, deadline?: number) => Promise<void>;
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
  status: 'unbound',
  backend: null,
  folderSupported: supportsFolderBinding(),
  handle: null,
  folderName: null,
  account: null,
  lastSyncAt: null,
  lastSyncedProjectId: null,
  lastError: null,
  syncing: false,
  projectFilenames: {},
  restoring: true,
  hydrated: false,
  skipped: [],
  notice: null,
  conflict: null,
  remoteChange: null,
  uploading: false,

  clearNotice: () => set({ notice: null }),
  clearConflict: () => set({ conflict: null }),

  restore: () => {
    // Once per page: StrictMode mounts the shell twice in development, and two
    // restores would read (and clear) everything twice.
    restoreRun ??= (async () => {
      try {
        if (readBackendChoice() === 'sharepoint') {
          await restoreSharePoint();
          return;
        }
        if (!supportsFolderBinding()) {
          set({ status: 'unbound' });
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
          set({ backend: 'folder', handle, folderName: handle.name, status: 'needs_permission' });
          return;
        }
        set({ backend: 'folder', handle, folderName: handle.name, status: 'connected' });
        await get().hydrate();
      } finally {
        set({ restoring: false });
      }
      })();
    return restoreRun;
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
    writeBackendChoice('folder');
    set({
      backend: 'folder',
      handle,
      folderName: handle.name,
      account: null,
      status: 'connected',
      lastError: null,
      hydrated: false,
      remoteChange: null,
    });
    await get().hydrate();
    return true;
  },

  connectSharePoint: async (options = {}) => {
    const signedIn = await sharePoint.signIn(options);
    if (!signedIn.ok) {
      if (signedIn.reason !== 'cancelled') set({ lastError: signInError(signedIn) });
      return false;
    }
    const probe = await sharePoint.probe();
    if (!probe.ok) {
      set({ lastError: probe.error, account: sharePoint.account() });
      return false;
    }
    // Switching account keeps the folder; anything else starts a new one.
    const current = get().handle;
    const handle =
      get().backend === 'sharepoint' && isSharePointDirectory(current)
        ? current
        : new SharePointDirectory();
    writeBackendChoice('sharepoint');
    set({
      backend: 'sharepoint',
      handle,
      folderName: handle.name,
      account: sharePoint.account(),
      status: 'connected',
      lastError: null,
      hydrated: false,
      remoteChange: null,
    });
    await get().hydrate();
    return get().status === 'connected';
  },

  uploadToSharePoint: async () => {
    const report: UploadReport = { ok: false, uploaded: [], skipped: [], library: false };
    const { handle: local, backend } = get();
    if (backend !== 'folder' || !local) {
      return { ...report, error: 'No local folder is open / 目前沒有開啟本機資料夾' };
    }

    const signedIn = await sharePoint.signIn();
    if (!signedIn.ok) {
      return { ...report, error: signedIn.reason === 'cancelled' ? undefined : signInError(signedIn) };
    }
    const probe = await sharePoint.probe();
    if (!probe.ok) return { ...report, error: probe.error };

    // Whatever the folder has not received yet goes there first, so the
    // upload below carries it.
    flushProjectAutoCommit();
    flushAutoPersistNow();
    await flushFolderSyncNow();
    for (const projectId of Object.keys(loadUnsyncedMarkers())) {
      if (projectIdExists(projectId)) await get().mirror(projectId);
    }
    // The cache is replaced at the end, so an edit that is still only in it
    // would be lost: stop here instead, with the folder still open.
    if (hasUnsyncedProjects()) {
      return {
        ...report,
        error:
          'Some edits could not be written to the local folder first, so nothing was uploaded / 有修改無法先寫入本機資料夾，因此未上傳',
      };
    }

    // The screens come down while uploading, so nothing is edited into a
    // cache that is about to be replaced.
    set({ hydrated: false, uploading: true });
    const remote = new SharePointDirectory();
    try {
      const onSharePoint = new Set(await remote.list());
      // The files the open workspace was read from — not older duplicates.
      for (const [projectId, filename] of Object.entries(get().projectFilenames)) {
        const text = await readTextFile(local, filename);
        if (text == null || !parseProjectFile(text).ok) continue;
        const target = mirrorFilename(projectId);
        if (onSharePoint.has(target)) {
          report.skipped.push(target);
          continue;
        }
        await writeTextFile(remote, target, text);
        report.uploaded.push(target);
      }

      const libraryText = await readTextFile(local, LIBRARY_FILENAME);
      const localLibrary = libraryText ? parseLibraryFile(libraryText) : null;
      if (localLibrary?.ok && localLibrary.file.entries.length > 0) {
        const existing = onSharePoint.has(LIBRARY_FILENAME)
          ? await remote.readRemote(LIBRARY_FILENAME)
          : null;
        const parsed = existing ? parseLibraryFile(existing.text) : null;
        const merged = mergeLibraries(
          parsed?.ok ? parsed.file.entries : [],
          localLibrary.file.entries,
        );
        await writeTextFile(remote, LIBRARY_FILENAME, serializeLibrary(merged));
        report.library = true;
      }
    } catch (error) {
      set({ hydrated: true, uploading: false });
      return {
        ...report,
        error: `${error instanceof Error ? error.message : String(error)} — the local folder is still open / 本機資料夾仍維持開啟`,
      };
    }

    // Everything is on SharePoint now: continue there. The local files stay.
    await clearStoredHandle();
    await withSyncSuspended(async () => {
      clearWorkingCache();
    });
    writeBackendChoice('sharepoint');
    set({
      backend: 'sharepoint',
      handle: remote,
      folderName: remote.name,
      account: sharePoint.account(),
      status: 'connected',
      lastSyncAt: null,
      lastSyncedProjectId: null,
      lastError: null,
      hydrated: false,
      skipped: [],
      projectFilenames: {},
      remoteChange: null,
      uploading: false,
    });
    await get().hydrate();
    return { ...report, ok: get().status === 'connected' };
  },

  reconnect: async () => {
    const { handle } = get();
    if (!handle) return false;
    const permission = await requestPermission(handle);
    if (isSharePointDirectory(handle)) set({ account: sharePoint.account() });
    if (permission !== 'granted') {
      set({ status: 'needs_permission' });
      return false;
    }
    set({ status: 'connected', lastError: null });
    await get().hydrate();
    return get().status === 'connected';
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
    clearBackendChoice();
    // The cache only ever mirrored the folder; keeping it would leave projects
    // on screen that the app can no longer write to.
    await withSyncSuspended(async () => {
      clearWorkingCache();
    });
    // The Microsoft sign-in is kept, like the TIM Manager's: switching back
    // to SharePoint later needs no new popup.
    set({
      backend: null,
      handle: null,
      folderName: null,
      account: null,
      remoteChange: null,
      status: 'unbound',
      lastSyncAt: null,
      lastSyncedProjectId: null,
      lastError: null,
      hydrated: false,
      skipped: [],
      projectFilenames: {},
    });
  },

  hydrate: () => {
    // Concurrent calls share one read: a second hydrate finishing after the
    // screens came back would clear the project they had just opened.
    hydrateRun ??= hydrateFrom(get().handle).finally(() => {
      hydrateRun = null;
    });
    return hydrateRun;
  },

  mirror: (projectId) => {
    // One write per project at a time. On SharePoint two overlapping writes
    // of one file would race each other's eTag and read as someone else's
    // change; locally they would just write the same file twice.
    const previous = inflight.get(projectId);
    const run = (previous ? previous.catch(() => false) : Promise.resolve(false)).then(() =>
      mirrorOnce(projectId),
    );
    inflight.set(projectId, run);
    void run.finally(() => {
      if (inflight.get(projectId) === run) inflight.delete(projectId);
    });
    return run;
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

  checkRemote: async (projectId) => {
    const { handle, status, projectFilenames } = get();
    if (!isSharePointDirectory(handle) || status !== 'connected') return;
    if (!Object.hasOwn(projectFilenames, projectId)) return;
    const filename = projectFilenames[projectId];
    const before = handle.cached(filename);
    if (!before) return;
    try {
      const now = await handle.peek(filename);
      const changed = now == null || now.etag !== before.etag;
      // Our own write in flight changes the eTag too; only a newer file that
      // this session did not write counts.
      if (!changed || inflight.has(projectId)) return;
      set({
        remoteChange: {
          projectId,
          by: now?.modifiedBy ?? null,
          at: now ? new Date(now.modified).toISOString() : null,
        },
      });
    } catch {
      // Offline or signed out: the next save says so.
    }
  },

  refreshProject: async (projectId, deadline = Infinity) => {
    const { handle, status, projectFilenames } = get();
    if (!isSharePointDirectory(handle) || status !== 'connected') return;
    if (!Object.hasOwn(projectFilenames, projectId)) return;
    const filename = projectFilenames[projectId];
    // Unsaved edits here have the right to be written first; the save path
    // decides what happens if SharePoint moved on meanwhile.
    const busy = () => Object.hasOwn(loadUnsyncedMarkers(), projectId) || inflight.has(projectId);
    if (busy()) return;
    try {
      const before = handle.cached(filename);
      const now = await handle.peek(filename);
      if (!before || !now || now.etag === before.etag) return;
      const remote = await handle.fetchRemote(filename);
      if (!remote) return;
      const parsed = parseProjectFile(remote.text);
      if (!parsed.ok || parsed.file.project_id !== projectId) return;
      // Too late (the screen already opened on the cache) or an edit started
      // meanwhile: the cache and its eTag stay as they were, together.
      if (Date.now() > deadline || busy()) return;
      withSyncSuspendedSync(() => {
        applyProjectFile(parsed.file, 'overwrite');
        handle.adopt(filename, remote.meta, remote.text);
      });
      saveSyncRecord(projectId, { filename, modified_at: remote.meta.modified });
      useProjectStore.getState().refreshProjects();
      if (get().remoteChange?.projectId === projectId) set({ remoteChange: null });
    } catch {
      // The cached copy opens instead; a save still cannot overwrite anything.
    }
  },
}));

let restoreRun: Promise<void> | null = null;
let hydrateRun: Promise<void> | null = null;

/** The read behind `hydrate`, which makes sure only one runs at a time. */
async function hydrateFrom(handle: DirectoryHandle | null): Promise<void> {
  const set = useFolderStore.setState;
  if (!handle) return;
  // The screens come down while the cache is replaced (the gate shows
  // "Opening…"), and come back reading the new cache — see the end.
  set({ hydrated: false });
  try {
    // Edits still waiting in the stores go into the cache first, where they
    // are marked unsynced and rescued below like any other.
    flushProjectAutoCommit();
    flushAutoPersistNow();
    // Writes already running finish first; scheduled ones are dropped,
    // because the rescue below writes everything that is behind — two
    // writes of one file at once would race on SharePoint.
    await Promise.allSettled([...inflight.values()]);
    cancelScheduledMirror();
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
    // The cache was replaced wholesale; the project list must be re-read,
    // and the open project reopened from it — the draft in memory may be the
    // version that was just kept as a recovered copy. Before `hydrated`, so
    // the screens mount onto the cleared draft and open it themselves.
    if (!useProjectStore.getState().isNew) useProjectStore.getState().clear();
    useProjectStore.getState().refreshProjects();
    set({
      hydrated: true,
      skipped: result.skipped,
      projectFilenames: result.projectFiles,
      lastError: null,
      remoteChange: null,
      notice:
        recovered.length > 0
          ? `Unsaved edits were found that the project folder did not have, and the folder copy had changed since. They were kept as a separate project so nothing is lost: ${recovered.join(', ')}. / 發現資料夾中沒有的未儲存修改，且資料夾內的檔案之後也被變更過；為避免遺失，已另存為獨立專案：${recovered.join('、')}。`
          : null,
    });
  } catch (error) {
    // An expired sign-in is a click away, not a failure.
    if (isSharePointError(error) && error.auth) {
      set({ status: 'needs_permission', hydrated: false, lastError: error.message });
      return;
    }
    set({
      status: 'error',
      hydrated: false,
      lastError: error instanceof Error ? error.message : 'Could not read the folder',
    });
  }
}

// --- backend choice ---------------------------------------------------------

/**
 * Which storage the engineer chose, so a reload opens it again.
 *
 * Deliberately outside the `tnv.` namespace: the build stamp clears that on
 * every deploy, and a deploy must not send everyone back to the start page.
 */
const BACKEND_CHOICE_KEY = 'tnv-storage-backend';

function readBackendChoice(): StorageBackend | null {
  try {
    const value = localStorage.getItem(BACKEND_CHOICE_KEY);
    return value === 'sharepoint' || value === 'folder' ? value : null;
  } catch {
    return null;
  }
}

function writeBackendChoice(backend: StorageBackend): void {
  try {
    localStorage.setItem(BACKEND_CHOICE_KEY, backend);
  } catch {
    // Only costs the automatic reopen on the next visit.
  }
}

function clearBackendChoice(): void {
  try {
    localStorage.removeItem(BACKEND_CHOICE_KEY);
  } catch {
    // Nothing stored is the same outcome.
  }
}

function signInError(result: Extract<SignInResult, { ok: false }>): string {
  return result.reason === 'popup'
    ? 'The browser blocked the Microsoft sign-in window — allow pop-ups for this site and try again / 登入視窗被瀏覽器擋下：請允許本網站的彈出式視窗後再試一次'
    : `Microsoft sign-in failed: ${result.error ?? result.reason} / Microsoft 登入失敗`;
}

/** Page load in SharePoint mode: open it without a popup if the sign-in is still good. */
async function restoreSharePoint(): Promise<void> {
  const handle = new SharePointDirectory();
  useFolderStore.setState({ backend: 'sharepoint', handle, folderName: handle.name });
  const result = await sharePoint.tryRestore();
  useFolderStore.setState({ account: sharePoint.account() });
  if (result.ok) {
    useFolderStore.setState({ status: 'connected', lastError: null });
    await useFolderStore.getState().hydrate();
    return;
  }
  if (result.needsLogin) {
    useFolderStore.setState({ status: 'needs_permission' });
    return;
  }
  useFolderStore.setState({
    status: 'error',
    lastError: result.error ?? 'Could not reach SharePoint / 無法連線到 SharePoint',
  });
}

// --- writing one project ------------------------------------------------------

/** The write running for each project, so the next one waits for it. */
const inflight = new Map<string, Promise<boolean>>();

/** Writes one project's file; see `mirror`. */
async function mirrorOnce(projectId: string): Promise<boolean> {
  const set = useFolderStore.setState;
  const get = useFolderStore.getState;
  const { handle, status } = get();
  if (!handle || status === 'unbound') return false;
  const saveGeneration = currentSaveGeneration();

  // Re-check rather than trusting the cached status: the browser can revoke
  // between one save and the next, and a Microsoft sign-in can expire.
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
  const filenames = get().projectFilenames;
  const filename = Object.hasOwn(filenames, projectId)
    ? filenames[projectId]
    : mirrorFilename(projectId);
  try {
    const text = serializeProjectFile(file);
    try {
      await writeTextFile(handle, filename, text);
    } catch (error) {
      if (!(isSharePointDirectory(handle) && isSharePointError(error) && error.conflict)) throw error;
      const outcome = await resolveConflict(handle, projectId, filename, text);
      if (outcome === 'copied') {
        // The original now holds SharePoint's version, already on SharePoint.
        markSaveSettled(saveGeneration);
        set({ status: 'connected', syncing: false, lastError: null });
        return true;
      }
    }
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
      remoteChange: get().remoteChange?.projectId === projectId ? null : get().remoteChange,
    });
    return true;
  } catch (error) {
    markSaveSettled(saveGeneration);
    if (isSharePointError(error) && error.auth) {
      set({ status: 'needs_permission', syncing: false, lastError: error.message });
      return false;
    }
    set({
      status: 'error',
      syncing: false,
      lastError: error instanceof Error ? error.message : 'Write failed',
    });
    return false;
  }
}

/** Whether two project files hold the same project, whenever they were written. */
function sameProjectData(a: string, b: string): boolean {
  try {
    const left = JSON.parse(a) as { data?: unknown };
    const right = JSON.parse(b) as { data?: unknown };
    return JSON.stringify(left.data) === JSON.stringify(right.data);
  } catch {
    return false;
  }
}

/**
 * A save that SharePoint refused because the file changed since it was read.
 *
 * Not every refusal is someone else's work. The file may be gone (deleted on
 * SharePoint), may be our own earlier write that timed out but landed, or may
 * have been re-saved with the very same project in it. In those cases the save
 * simply goes through ('written').
 *
 * Otherwise both versions are real work and neither may be lost ('copied'):
 *
 *   1. everything this session has — including edits still in the stores —
 *      becomes a new project, "<name> (conflict copy …)";
 *   2. the original project takes SharePoint's version;
 *   3. `conflict` is set, and the shell moves the engineer onto their copy.
 *
 * Steps 1–3 run in one synchronous block, so no store flush can land between
 * them and write this session's edits over SharePoint's version.
 */
async function resolveConflict(
  handle: SharePointDirectory,
  projectId: string,
  filename: string,
  attempted: string,
): Promise<'written' | 'copied'> {
  const remote = await handle.readRemote(filename);
  const benign =
    remote == null ||
    handle.wasOurUncertainWrite(filename, remote.text) ||
    (remote.base != null && sameProjectData(remote.base, remote.text));
  if (benign) {
    await writeTextFile(handle, filename, attempted);
    return 'written';
  }

  const parsed = parseProjectFile(remote.text);
  if (!parsed.ok || parsed.file.project_id !== projectId) {
    throw new Error(
      `${filename} on SharePoint was changed by ${remote.meta.modifiedBy ?? 'someone else'} and is no longer a copy of this project; nothing was overwritten / SharePoint 上的 ${filename} 已被改成其他內容，未覆蓋`,
    );
  }

  const set = useFolderStore.setState;
  const get = useFolderStore.getState;
  const listed = await handle.list().catch(() => [] as string[]);
  let notice: ConflictNotice | null = null;
  withSyncSuspendedSync(() => {
    // Edits still waiting in the stores belong to this session's version.
    // Flushed with sync suspended: they go into the cache, and from there into
    // the copy below — never into a write of the original.
    const { draft, isNew } = useProjectStore.getState();
    if (draft?.project_id === projectId && !isNew) {
      flushProjectAutoCommit();
      flushAutoPersistNow();
    }
    const latest = collectProject(projectId, BUILD_ID);
    if (!latest) return;
    const taken = new Set([...listed, ...Object.values(get().projectFilenames)]);
    const copyId = copyProjectId(projectId, 'conflict', taken);
    const copy = asSeparateCopy(latest, copyId, 'conflict copy');
    applyProjectFile(copy, 'overwrite');
    applyProjectFile(parsed.file, 'overwrite');
    notice = {
      projectId,
      projectName: parsed.file.project_name || projectId,
      copyId,
      copyName: copy.project_name,
      remoteBy: remote.meta.modifiedBy,
      remoteAt: remote.meta.modified ? new Date(remote.meta.modified).toISOString() : null,
    };
  });
  if (!notice) return 'written';
  const conflict: ConflictNotice = notice;

  // The original is exactly SharePoint's file now; the copy has never been written.
  pendingProjects.delete(projectId);
  markProjectSynced(projectId);
  saveSyncRecord(projectId, { filename, modified_at: remote.meta.modified });
  markProjectUnsynced(conflict.copyId);
  set({
    projectFilenames: withOwn(get().projectFilenames, conflict.copyId, mirrorFilename(conflict.copyId)),
    remoteChange: null,
    conflict,
  });
  useProjectStore.getState().refreshProjects();
  // Not awaited: this runs inside the original's write, and the copy is a
  // different file. Its unsynced marker covers a failure.
  void get().mirror(conflict.copyId);
  return 'copied';
}

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
function asSeparateCopy(file: ProjectFile, copyId: string, label: string): ProjectFile {
  // Local time: it is read by the engineer next to the clock on their desk.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const name = `${file.project_name} (${label} ${stamp})`;
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

/** `<id>_<kind>`, `<id>_<kind>2`, … — free in the cache and in the folder. */
function copyProjectId(projectId: string, kind: string, taken: ReadonlySet<string>): string {
  const base = `${projectId.slice(0, 50)}_${kind}`;
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
        const copyId = copyProjectId(projectId, 'recovered', taken);
        const copy = asSeparateCopy(file, copyId, 'recovered');
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

/** Drops the scheduled folder write; for a hydrate, which writes everything behind itself. */
function cancelScheduledMirror(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pendingProjects.clear();
}

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
