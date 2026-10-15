/**
 * Project storage sync — SharePoint AND a local folder, side by side.
 *
 * Every save is written to each storage target that is set up:
 *
 *   - SharePoint (`sharepoint` in the state): shared with the team, the copy
 *     everyone reads; written conditionally, so nobody's work is overwritten;
 *   - the local folder (the top-level `handle`, `status`, … — their names
 *     predate SharePoint): a copy on this computer that also works offline.
 *
 * Each target keeps its own record of what it has not received yet
 * (`persistence` markers per target), so one being unreachable — offline,
 * signed out, a lapsed folder permission — costs nothing: it catches up when it
 * is back, and the header shows the state of each.
 *
 * The browser cache is read from one of them, the `source`: SharePoint when it
 * can be reached (it has everyone's latest), otherwise the local copy, so the
 * tool still opens without the network. After reading SharePoint, the local
 * folder is brought up to date with it (`syncLocalCopy`).
 *
 * The mechanics live in `folderBinding` (local) and `sharepointFolder`
 * (SharePoint, through the same `DirectoryHandle`); the policy is here.
 *
 * A save can find a project changed on SharePoint by someone else (412).
 * Nothing is overwritten then: this session's version becomes a separate
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
  type SyncTarget,
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
import { LIBRARY_FILENAME } from './componentLibraryFile';
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

export type { SyncTarget } from './persistence';

export type FolderStatus =
  /** Not set up. */
  | 'unbound'
  /** Set up and writable. */
  | 'connected'
  /**
   * Set up, but a click is needed first: the browser wants the folder
   * permission re-granted, or the Microsoft sign-in expired.
   */
  | 'needs_permission'
  /** Set up, but the last write (or reading it) failed. */
  | 'error';

/** One storage target, as the header and Settings show it. */
export interface TargetState {
  status: FolderStatus;
  syncing: boolean;
  lastSyncAt: string | null;
  lastSyncedProjectId: string | null;
  lastError: string | null;
  /** The file each project lives in, on this target. */
  projectFilenames: Record<string, string>;
}

export interface SharePointState extends TargetState {
  /** Set up on this browser (remembered across reloads). */
  enabled: boolean;
  handle: SharePointDirectory | null;
  account: { name: string; email: string } | null;
}

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

interface FolderStoreState extends TargetState {
  // --- the local folder (TargetState, at the top level) ----------------------
  handle: DirectoryHandle | null;
  folderName: string | null;
  /** Whether this browser can bind a local folder (Chromium only). SharePoint works everywhere. */
  folderSupported: boolean;

  // --- SharePoint --------------------------------------------------------------
  sharepoint: SharePointState;

  /**
   * Where the cache was read from: SharePoint when it can be reached, else the
   * local copy. Null until something is open (the gate shows).
   */
  source: SyncTarget | null;
  /** Projects each target has not received yet, for the header. */
  pendingCount: Record<SyncTarget, number>;

  /**
   * True until the startup restore has settled. Without it the gate would flash
   * "choose" before the remembered choices have been looked up.
   */
  restoring: boolean;
  /** True once the source has been read into the local cache. */
  hydrated: boolean;
  /** What the screens are waiting for while they are down (shown by the gate). */
  busy: string | null;
  /** Files in the source that are not usable project files. */
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

  /** Called once at startup to pick up what was set up in an earlier session. */
  restore: () => Promise<void>;
  /** Opens the folder picker for the local folder. Must run from a user gesture. */
  bind: () => Promise<boolean>;
  /**
   * Sets up SharePoint: Microsoft sign-in (popup), then the site. Must run
   * from a user gesture. `select` lets the engineer pick another account.
   *
   * With a local folder already open, its projects go up to SharePoint
   * (pairing): one SharePoint lacks is uploaded, one that differs is kept as a
   * "(local copy …)" project — nothing is overwritten on either side.
   */
  connectSharePoint: (options?: { select?: boolean }) => Promise<boolean>;
  /**
   * Re-grants the folder permission or signs in to Microsoft again, then lets
   * that target catch up. Must run from a user gesture. Without a target: the
   * source, or the local folder.
   */
  reconnect: (target?: SyncTarget) => Promise<boolean>;
  /**
   * Stops using one target. What it has not received yet is written first;
   * its files are left where they are. When it was the source, the other
   * target takes over (or the gate shows when there is none).
   */
  disconnect: (target: SyncTarget) => Promise<void>;
  /** `disconnect('local')`. */
  unbind: () => Promise<void>;
  /**
   * Asks SharePoint whether the active project was saved by someone else since
   * this session read it, and records the answer in `remoteChange`.
   */
  checkRemote: (projectId: string) => Promise<void>;
  /**
   * Before a project is opened: when SharePoint holds a newer version than the
   * cache and this browser has no unsaved edits to it, the newer version is
   * read in first, so the screens open on it — unless `deadline` passed
   * first, when the cache and its eTag stay as they were. Never throws.
   */
  refreshProject: (projectId: string, deadline?: number) => Promise<void>;
  /** Reads the source into the local cache, replacing whatever was cached. */
  hydrate: () => Promise<void>;

  /** Writes one project to every target that is connected, now. */
  mirror: (projectId: string) => Promise<boolean>;
  /**
   * Writes every cached project. Needed after anything that creates or changes
   * a project other than the active one — seeding the demo makes two.
   */
  mirrorAll: () => Promise<number>;
  /**
   * Why a project cannot be deleted right now, or null. A target that is set
   * up but not reachable would keep the file, and the next read would bring
   * the project back.
   */
  deleteBlocker: () => string | null;
  /**
   * Removes the project's own file from every target, and forgets its name.
   *
   * Deleting a project cleared every browser-side collection but left the JSON
   * on disk, so the next hydrate read it straight back in. Only the file this
   * project was loaded from is touched; nothing else in the folder is the
   * app's to remove. Returns false when a file is still there afterwards.
   */
  deleteProjectFile: (projectId: string) => Promise<boolean>;
  /** Project files in the source. */
  listFiles: () => Promise<FolderEntry[]>;
  readFile: (filename: string) => Promise<string | null>;
}

function emptyTarget(): TargetState {
  return {
    status: 'unbound',
    syncing: false,
    lastSyncAt: null,
    lastSyncedProjectId: null,
    lastError: null,
    projectFilenames: {},
  };
}

function emptySharePoint(): SharePointState {
  return { ...emptyTarget(), enabled: false, handle: null, account: null };
}

export const useFolderStore = create<FolderStoreState>((set, get) => ({
  ...emptyTarget(),
  handle: null,
  folderName: null,
  folderSupported: supportsFolderBinding(),
  sharepoint: emptySharePoint(),
  source: null,
  pendingCount: { local: 0, sharepoint: 0 },
  restoring: true,
  hydrated: false,
  busy: null,
  skipped: [],
  notice: null,
  conflict: null,
  remoteChange: null,

  clearNotice: () => set({ notice: null }),
  clearConflict: () => set({ conflict: null }),

  restore: () => {
    // Once per page: StrictMode mounts the shell twice in development, and two
    // restores would read (and clear) everything twice.
    restoreRun ??= (async () => {
      try {
        if (supportsFolderBinding()) {
          const handle = await loadStoredHandle();
          if (handle) {
            // A stored handle can come back with its permission downgraded to
            // `prompt`; regaining it needs a click, so the state says so.
            const permission = await queryPermission(handle);
            set({
              handle,
              folderName: handle.name,
              status: permission === 'granted' ? 'connected' : 'needs_permission',
            });
          }
        }
        if (readSharePointChoice()) await restoreSharePoint();
        refreshPendingCounts();
        const source = pickSource();
        if (source) {
          set({ source });
          await get().hydrate();
        }
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
    const previousSource = get().source;
    set({ handle, folderName: handle.name, status: 'connected', lastError: null });
    // A folder new to this workspace may hold anything. With SharePoint set
    // up it is paired the first time both are reachable: what it has goes up,
    // and nothing in it is replaced unseen (see `syncLocalCopy`).
    if (get().sharepoint.enabled) writePairPending(true);

    if (previousSource === 'sharepoint') {
      await syncLocalCopy({ pairing: true });
      return true;
    }
    // The folder is (now) where projects are read from.
    set({ source: 'local', hydrated: false });
    await get().hydrate();
    return true;
  },

  connectSharePoint: async (options = {}) => {
    const signedIn = await sharePoint.signIn(options);
    if (!signedIn.ok) {
      if (signedIn.reason !== 'cancelled') patchTarget('sharepoint', { lastError: signInError(signedIn) });
      return false;
    }
    const probe = await sharePoint.probe();
    if (!probe.ok) {
      patchTarget('sharepoint', { lastError: probe.error });
      setSharePoint({ account: sharePoint.account() });
      return false;
    }
    const wasEnabled = get().sharepoint.enabled;
    const current = get().sharepoint.handle;
    writeSharePointChoice(true);
    setSharePoint({
      enabled: true,
      handle: current ?? new SharePointDirectory(),
      account: sharePoint.account(),
      status: 'connected',
      lastError: null,
    });

    if (!wasEnabled) {
      // Edits the local folder is still owed were never meant for SharePoint
      // either — it was not set up. They are owed to it now.
      for (const projectId of Object.keys(loadUnsyncedMarkers('local'))) {
        markProjectUnsynced(projectId, 'sharepoint');
      }
      if (get().source === 'local' && get().status === 'connected') {
        // The local folder was the whole workspace until now. Its projects
        // go up BEFORE SharePoint is read, or the one on screen would vanish
        // until they did.
        set({ busy: 'Adding the local projects to SharePoint… / 正在把本機專案加入 SharePoint…', hydrated: false });
        try {
          const paired = await pushWorkspaceToSharePoint();
          set({ notice: pairingNotice(paired.uploaded, paired.kept) });
        } catch (error) {
          setSharePoint({
            status: isSharePointError(error) && error.auth ? 'needs_permission' : 'error',
            lastError: error instanceof Error ? error.message : String(error),
          });
          set({ busy: null, hydrated: true });
          return false;
        }
      } else if (get().handle) {
        // A local folder that cannot be read yet is paired when it can.
        writePairPending(true);
      }
    }
    // SharePoint is the source whenever it can be reached.
    set({ source: 'sharepoint', remoteChange: null });
    await get().hydrate();
    return get().sharepoint.status === 'connected' && get().hydrated;
  },

  reconnect: async (target) => {
    const which: SyncTarget = target ?? get().source ?? 'local';
    const handle = targetHandle(which);
    if (!handle) return false;
    const permission = await requestPermission(handle);
    if (which === 'sharepoint') setSharePoint({ account: sharePoint.account() });
    if (permission !== 'granted') {
      patchTarget(which, { status: 'needs_permission' });
      return false;
    }
    patchTarget(which, { status: 'connected', lastError: null });

    const source = get().source;
    if (which === 'local' && source === 'sharepoint') {
      // The copy catches up; the screens stay as they are.
      await syncLocalCopy({ pairing: readPairPending() });
      return get().status === 'connected';
    }
    // The source itself came back — or SharePoint did, while the local copy
    // stood in for it: read (again) from SharePoint, after writing up
    // everything that waited for it.
    set({ source: which === 'sharepoint' ? 'sharepoint' : (source ?? 'local') });
    await get().hydrate();
    return targetState(which).status === 'connected';
  },

  disconnect: async (target) => {
    // Edits still in the stores reach the cache first, then every target
    // that can still be written.
    flushProjectAutoCommit();
    flushAutoPersistNow();
    await flushFolderSyncNow();
    await Promise.allSettled([...inflight.values()]);
    if (targetState(target).status === 'connected') {
      for (const projectId of Object.keys(loadUnsyncedMarkers(target))) {
        if (projectIdExists(projectId)) await mirrorTarget(target, projectId);
      }
    }

    const source = get().source ?? (get().handle ? 'local' : null);
    if (target === 'sharepoint') {
      writeSharePointChoice(false);
      writePairPending(false);
      // The Microsoft sign-in is kept, like the TIM Manager's: setting
      // SharePoint up again later needs no new popup.
      set({ sharepoint: emptySharePoint(), remoteChange: null });
      forgetTarget('sharepoint');
    } else {
      await clearStoredHandle();
      set({ ...emptyTarget(), handle: null, folderName: null });
      forgetTarget('local');
    }
    refreshPendingCounts();

    if (source !== target) return;
    const other: SyncTarget = target === 'sharepoint' ? 'local' : 'sharepoint';
    if (targetState(other).status === 'connected' && targetHandle(other)) {
      // The other target takes over as the source.
      set({ source: other });
      await get().hydrate();
      return;
    }
    // Nothing left to read from: the cache only ever mirrored storage, and
    // keeping it would leave projects on screen that cannot be written.
    await withSyncSuspended(async () => {
      clearWorkingCache();
    });
    set({ source: null, hydrated: false, skipped: [], remoteChange: null });
  },

  unbind: () => get().disconnect('local'),

  hydrate: () => {
    // Concurrent calls share one read: a second hydrate finishing after the
    // screens came back would clear the project they had just opened.
    hydrateRun ??= hydrateFromSource().finally(() => {
      hydrateRun = null;
    });
    return hydrateRun;
  },

  mirror: async (projectId) => {
    const targets = (['sharepoint', 'local'] as const).filter((target) => {
      const state = targetState(target);
      return targetHandle(target) != null && state.status !== 'unbound';
    });
    if (targets.length === 0) return false;
    const results = await Promise.all(targets.map((target) => mirrorTarget(target, projectId)));
    return results.every(Boolean);
  },

  mirrorAll: async () => {
    let written = 0;
    for (const project of loadProjects()) {
      if (await get().mirror(project.project_id)) written += 1;
    }
    return written;
  },

  deleteBlocker: () => {
    const { sharepoint, handle, status } = get();
    if (sharepoint.enabled && sharepoint.status !== 'connected') {
      return 'Sign in to SharePoint first — otherwise its copy would bring the project back. / 請先登入 SharePoint，否則 SharePoint 上的檔案會讓專案再出現。';
    }
    if (handle && status !== 'connected') {
      return 'Reconnect the local folder first — otherwise its copy would bring the project back. / 請先重新授權本機資料夾，否則本機的檔案會讓專案再出現。';
    }
    return null;
  },

  deleteProjectFile: async (projectId) => {
    let allRemoved = true;
    let any = false;
    for (const target of ['sharepoint', 'local'] as const) {
      const handle = targetHandle(target);
      const filenames = targetState(target).projectFilenames;
      const filename = Object.hasOwn(filenames, projectId)
        ? filenames[projectId]
        : mirrorFilename(projectId);
      // Forget the name either way: the project is gone from the cache, so a
      // later save must never resurrect it under the name it used to hold.
      const remaining = { ...filenames };
      if (Object.hasOwn(remaining, projectId)) delete remaining[projectId];
      patchTarget(target, { projectFilenames: remaining });
      // Nor may a later hydrate "rescue" it back from the cache it just left.
      markProjectSynced(projectId, undefined, target);
      saveSyncRecord(projectId, null, target);
      if (!handle || (target === 'sharepoint' && !get().sharepoint.enabled)) continue;
      any = true;
      const removed = await deleteFile(handle, filename).catch(() => false);
      if (!removed) {
        allRemoved = false;
        patchTarget(target, {
          status: 'error',
          lastError: `Deleted the project, but could not remove "${filename}" from ${target === 'sharepoint' ? 'SharePoint' : 'the folder'}`,
        });
      }
    }
    refreshPendingCounts();
    return any && allRemoved;
  },

  listFiles: async () => {
    const handle = targetHandle(get().source ?? 'local');
    if (!handle) return [];
    try {
      return await listProjectFiles(handle);
    } catch {
      return [];
    }
  },

  readFile: async (filename) => {
    const handle = targetHandle(get().source ?? 'local');
    if (!handle) return null;
    return readTextFile(handle, filename);
  },

  checkRemote: async (projectId) => {
    const { sharepoint, source } = get();
    const handle = sharepoint.handle;
    if (!handle || source !== 'sharepoint' || sharepoint.status !== 'connected') return;
    if (!Object.hasOwn(sharepoint.projectFilenames, projectId)) return;
    const filename = sharepoint.projectFilenames[projectId];
    const before = handle.cached(filename);
    if (!before) return;
    try {
      const now = await handle.peek(filename);
      const changed = now == null || now.etag !== before.etag;
      // Our own write in flight changes the eTag too; only a newer file that
      // this session did not write counts.
      if (!changed || inflight.has(inflightKey('sharepoint', projectId))) return;
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
    const { sharepoint, source } = get();
    const handle = sharepoint.handle;
    if (!handle || source !== 'sharepoint' || sharepoint.status !== 'connected') return;
    if (!Object.hasOwn(sharepoint.projectFilenames, projectId)) return;
    const filename = sharepoint.projectFilenames[projectId];
    // Unsaved edits here have the right to be written first; the save path
    // decides what happens if SharePoint moved on meanwhile.
    const busy = () =>
      Object.hasOwn(loadUnsyncedMarkers('sharepoint'), projectId) ||
      inflight.has(inflightKey('sharepoint', projectId));
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
      saveSyncRecord(projectId, { filename, modified_at: remote.meta.modified }, 'sharepoint');
      // The local copy follows.
      queueLocalWrite(projectId);
      useProjectStore.getState().refreshProjects();
      if (get().remoteChange?.projectId === projectId) set({ remoteChange: null });
    } catch {
      // The cached copy opens instead; a save still cannot overwrite anything.
    }
  },
}));

let restoreRun: Promise<void> | null = null;
let hydrateRun: Promise<void> | null = null;

// --- target helpers ------------------------------------------------------------

type TargetPatch = Partial<TargetState>;

function targetState(target: SyncTarget): TargetState {
  const state = useFolderStore.getState();
  return target === 'sharepoint' ? state.sharepoint : state;
}

function targetHandle(target: SyncTarget): DirectoryHandle | null {
  const state = useFolderStore.getState();
  return target === 'sharepoint' ? state.sharepoint.handle : state.handle;
}

function patchTarget(target: SyncTarget, patch: TargetPatch): void {
  if (target === 'sharepoint') setSharePoint(patch);
  else useFolderStore.setState(patch);
}

function setSharePoint(patch: Partial<SharePointState>): void {
  useFolderStore.setState((state) => ({ sharepoint: { ...state.sharepoint, ...patch } }));
}

/** Where to read from: SharePoint when it can be reached, else the local copy. */
function pickSource(): SyncTarget | null {
  const state = useFolderStore.getState();
  if (state.sharepoint.enabled && state.sharepoint.status === 'connected' && state.sharepoint.handle) {
    return 'sharepoint';
  }
  if (state.handle && state.status === 'connected') return 'local';
  return null;
}

/** Targets an edit is owed to. With none set up, the local folder (as before SharePoint). */
function configuredTargets(): SyncTarget[] {
  const state = useFolderStore.getState();
  const targets: SyncTarget[] = [];
  if (state.sharepoint.enabled) targets.push('sharepoint');
  if (state.handle) targets.push('local');
  return targets.length > 0 ? targets : ['local'];
}

function connectedTargets(): SyncTarget[] {
  return (['sharepoint', 'local'] as const).filter(
    (target) =>
      targetHandle(target) != null &&
      targetState(target).status === 'connected' &&
      (target === 'local' || useFolderStore.getState().sharepoint.enabled),
  );
}

/** Forgets what a target was owed: it is no longer one. */
function forgetTarget(target: SyncTarget): void {
  for (const projectId of Object.keys(loadUnsyncedMarkers(target))) {
    markProjectSynced(projectId, undefined, target);
  }
  for (const projectId of Object.keys(loadSyncState(target))) {
    saveSyncRecord(projectId, null, target);
  }
}

/** Keeps `pendingCount` in step with the markers. Cheap: two small JSON reads. */
function refreshPendingCounts(): void {
  const count = (target: SyncTarget) =>
    Object.keys(loadUnsyncedMarkers(target)).filter((projectId) => projectIdExists(projectId))
      .length;
  const next = { local: count('local'), sharepoint: count('sharepoint') };
  const current = useFolderStore.getState().pendingCount;
  if (current.local !== next.local || current.sharepoint !== next.sharepoint) {
    useFolderStore.setState({ pendingCount: next });
  }
}

// --- remembered choices -------------------------------------------------------

/**
 * Whether SharePoint is set up on this browser, so a reload opens it again.
 * (The local folder is remembered by its handle in IndexedDB.)
 *
 * Deliberately outside the `tnv.` namespace: the build stamp clears that on
 * every deploy, and a deploy must not send everyone back to the start page.
 */
const SHAREPOINT_CHOICE_KEY = 'tnv-storage-sharepoint';
/** The previous build's single-choice key: 'sharepoint' carries over. */
const LEGACY_BACKEND_KEY = 'tnv-storage-backend';
/** A local folder that has not yet been offered to SharePoint (see `syncLocalCopy`). */
const PAIR_PENDING_KEY = 'tnv-storage-pair-pending';

function readSharePointChoice(): boolean {
  try {
    if (localStorage.getItem(SHAREPOINT_CHOICE_KEY) === 'on') return true;
    if (localStorage.getItem(LEGACY_BACKEND_KEY) === 'sharepoint') {
      writeSharePointChoice(true);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function writeSharePointChoice(on: boolean): void {
  try {
    if (on) localStorage.setItem(SHAREPOINT_CHOICE_KEY, 'on');
    else localStorage.removeItem(SHAREPOINT_CHOICE_KEY);
    localStorage.removeItem(LEGACY_BACKEND_KEY);
  } catch {
    // Only costs the automatic reopen on the next visit.
  }
}

function readPairPending(): boolean {
  try {
    return localStorage.getItem(PAIR_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function writePairPending(on: boolean): void {
  try {
    if (on) localStorage.setItem(PAIR_PENDING_KEY, '1');
    else localStorage.removeItem(PAIR_PENDING_KEY);
  } catch {
    // At worst the folder is paired again, which keeps copies, never loses.
  }
}

function signInError(result: Extract<SignInResult, { ok: false }>): string {
  return result.reason === 'popup'
    ? 'The browser blocked the Microsoft sign-in window — allow pop-ups for this site and try again / 登入視窗被瀏覽器擋下：請允許本網站的彈出式視窗後再試一次'
    : `Microsoft sign-in failed: ${result.error ?? result.reason} / Microsoft 登入失敗`;
}

/** Page load with SharePoint set up: reach it without a popup if the sign-in is still good. */
async function restoreSharePoint(): Promise<void> {
  setSharePoint({ enabled: true, handle: new SharePointDirectory() });
  const result = await sharePoint.tryRestore();
  setSharePoint({ account: sharePoint.account() });
  if (result.ok) {
    setSharePoint({ status: 'connected', lastError: null });
  } else if (result.needsLogin) {
    setSharePoint({ status: 'needs_permission' });
  } else {
    setSharePoint({
      status: 'error',
      lastError: result.error ?? 'Could not reach SharePoint / 無法連線到 SharePoint',
    });
  }
}

// --- reading the source ----------------------------------------------------------

/** The read behind `hydrate`, which makes sure only one runs at a time. */
async function hydrateFromSource(): Promise<void> {
  const set = useFolderStore.setState;
  const get = useFolderStore.getState;
  const source = get().source ?? pickSource();
  if (!source) return;
  const handle = targetHandle(source);
  if (!handle) return;
  // The screens come down while the cache is replaced (the gate shows
  // "Opening…"), and come back reading the new cache — see the end.
  set({ hydrated: false, source });
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
    // The other target, if it can be written, gets what it is owed now —
    // after the read below the cache holds the source's version instead.
    const other: SyncTarget = source === 'sharepoint' ? 'local' : 'sharepoint';
    if (connectedTargets().includes(other)) {
      for (const projectId of Object.keys(loadUnsyncedMarkers(other))) {
        if (projectIdExists(projectId)) await mirrorTarget(other, projectId);
      }
    }
    // Hydration replaces the cache with the source. Edits that were in the
    // cache but never reached it — a tab closed inside the save debounce, a
    // sign-in or permission that lapsed, a write that failed, a day offline —
    // would be wiped by that, silently. They are written out first.
    const recovered = await rescueUnsyncedProjects(source, handle);
    const result = await hydrateFromFolder(handle);
    for (const [projectId, filename] of Object.entries(result.projectFiles)) {
      const modified_at = result.projectFileModifiedAt[projectId];
      if (typeof modified_at === 'number') {
        saveSyncRecord(projectId, { filename, modified_at }, source);
      }
    }
    // The cache was replaced wholesale; the project list must be re-read,
    // and the open project reopened from it — the draft in memory may be the
    // version that was just kept as a recovered copy. Before `hydrated`, so
    // the screens mount onto the cleared draft and open it themselves.
    if (!useProjectStore.getState().isNew) useProjectStore.getState().clear();
    useProjectStore.getState().refreshProjects();
    patchTarget(source, { projectFilenames: result.projectFiles, lastError: null, status: 'connected' });
    refreshPendingCounts();
    set({
      hydrated: true,
      busy: null,
      skipped: result.skipped,
      remoteChange: null,
      notice:
        recovered.length > 0
          ? `Unsaved edits were found that ${source === 'sharepoint' ? 'SharePoint' : 'the project folder'} did not have, and its copy had changed since. They were kept as a separate project so nothing is lost: ${recovered.join(', ')}. / 發現${source === 'sharepoint' ? ' SharePoint ' : '資料夾'}中沒有的未儲存修改，且該處的檔案之後也被變更過；為避免遺失，已另存為獨立專案：${recovered.join('、')}。`
          : get().notice,
    });
  } catch (error) {
    set({ busy: null });
    // An expired sign-in is a click away, not a failure.
    if (isSharePointError(error) && error.auth) {
      patchTarget(source, { status: 'needs_permission', lastError: error.message });
    } else {
      patchTarget(source, {
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Could not read the folder',
      });
    }
    set({ hydrated: false });
    // SharePoint unreachable: the local copy stands in, if there is one.
    if (source === 'sharepoint' && get().handle && get().status === 'connected') {
      set({ source: 'local' });
      hydrateRun = null;
      await hydrateFromSource();
    }
    return;
  }

  // The screens are back. The local copy catches up with SharePoint in the
  // background; its line in the header says so while it does.
  if (source === 'sharepoint' && get().handle && get().status === 'connected') {
    void syncLocalCopy({ pairing: readPairPending() });
  }
}

// --- the local copy --------------------------------------------------------------

/**
 * Pairing, from the local folder's side: every project in the workspace (read
 * from the local folder) goes up to SharePoint before SharePoint is read.
 *
 *   - one SharePoint lacks is uploaded under its own name;
 *   - one SharePoint has with the same content is left alone;
 *   - one SharePoint has differently stays as it is on SharePoint, and the
 *     local version goes up beside it as a "(local copy …)" project.
 */
async function pushWorkspaceToSharePoint(): Promise<{ uploaded: string[]; kept: string[] }> {
  const uploaded: string[] = [];
  const kept: string[] = [];
  const get = useFolderStore.getState;
  const sp = get().sharepoint.handle;
  const local = get().handle;
  if (!sp) return { uploaded, kept };
  flushProjectAutoCommit();
  flushAutoPersistNow();
  await flushFolderSyncNow();
  await Promise.allSettled([...inflight.values()]);
  const onSharePoint = new Set(await sp.list());
  const localNames = get().projectFilenames;
  for (const project of loadProjects()) {
    const projectId = project.project_id;
    const file = collectProject(projectId, BUILD_ID);
    if (!file) continue;
    const filename = mirrorFilename(projectId);
    if (!onSharePoint.has(filename)) {
      await writeTextFile(sp, filename, serializeProjectFile(file));
      const modified_at = await fileModifiedAt(sp, filename);
      if (modified_at != null) saveSyncRecord(projectId, { filename, modified_at }, 'sharepoint');
      markProjectSynced(projectId, undefined, 'sharepoint');
      uploaded.push(project.project_name || projectId);
      continue;
    }
    // File to file: the local one this project was read from, if any.
    const localText =
      local && Object.hasOwn(localNames, projectId)
        ? await readTextFile(local, localNames[projectId])
        : null;
    const remote = await sp.fetchRemote(filename);
    if (remote && sameProjectData(localText ?? serializeProjectFile(file), remote.text)) {
      markProjectSynced(projectId, undefined, 'sharepoint');
      continue;
    }
    kept.push(importAsCopy(file, 'local copy'));
    // The original takes SharePoint's version when SharePoint is read next.
    markProjectSynced(projectId, undefined, 'sharepoint');
  }
  for (const projectId of Object.keys(loadUnsyncedMarkers('sharepoint'))) {
    if (projectIdExists(projectId)) await mirrorTarget('sharepoint', projectId);
  }
  // The library joins SharePoint's.
  await syncLibrary();
  return { uploaded, kept };
}

/** The one-time message after a folder and SharePoint first met. */
function pairingNotice(uploaded: string[], kept: string[]): string | null {
  const parts: string[] = [];
  if (uploaded.length > 0) {
    parts.push(
      `Added to SharePoint from the local folder: ${uploaded.join(', ')}. / 已從本機資料夾加入 SharePoint：${uploaded.join('、')}。`,
    );
  }
  if (kept.length > 0) {
    parts.push(
      `SharePoint already had a different version of some projects; it was kept, and the local version was added beside it: ${kept.join(', ')}. / SharePoint 上已有不同版本的專案維持不變，本機版本另存為：${kept.join('、')}。`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

/** Moves a superseded local file into `Replaced/` — never deletes it. */
async function setAside(handle: DirectoryHandle, filename: string, text: string): Promise<void> {
  const stamp = localStamp().replace(/[-: ]/g, '');
  const base = filename.replace(/\.tnv\.json$/, '');
  if (typeof handle.getDirectoryHandle === 'function') {
    const dir = await handle.getDirectoryHandle('Replaced', { create: true });
    await writeTextFile(dir, `${base}_${stamp}.tnv.json`, text);
  } else {
    // A folder without sub-folders: a name the project list never reads.
    await writeTextFile(handle, `${filename}.${stamp}.replaced`, text);
  }
  await deleteFile(handle, filename);
}

/**
 * Brings the local folder in line with the cache just read from SharePoint,
 * so the copy on this computer opens offline exactly as SharePoint stood.
 *
 * Nothing in the folder is lost on the way:
 *
 *   - a local file the same as SharePoint's is left alone;
 *   - a local file this browser wrote last is simply replaced — its content
 *     already went to SharePoint (or survives there as a recovered copy);
 *   - a local file changed elsewhere since this browser wrote it (or any
 *     differing file while `pairing`, i.e. the first time this folder meets
 *     SharePoint) is first kept as a "(local copy …)" project, which goes to
 *     SharePoint like any other;
 *   - a project SharePoint does not have goes up to SharePoint — unless this
 *     browser has seen it there before, in which case it was deleted there,
 *     and the file moves to `Replaced/`.
 */
async function syncLocalCopy(options: { pairing: boolean }): Promise<void> {
  const get = useFolderStore.getState;
  const handle = get().handle;
  if (!handle || get().status !== 'connected' || get().source !== 'sharepoint') return;
  patchTarget('local', { syncing: true });
  const kept: string[] = [];
  const uploaded: string[] = [];
  const setAsideNames: string[] = [];
  try {
    const records = loadSyncState('local');
    const spRecords = loadSyncState('sharepoint');
    const entries = await listProjectFiles(handle);
    // Each project's newest file in the folder (entries are newest first).
    const local = new Map<string, { filename: string; modified: number; text: string; file: ProjectFile }>();
    for (const entry of entries) {
      if (entry.filename === LIBRARY_FILENAME) continue;
      const text = await readTextFile(handle, entry.filename);
      if (text == null) continue;
      const parsed = parseProjectFile(text);
      if (!parsed.ok || local.has(parsed.file.project_id)) continue;
      local.set(parsed.file.project_id, {
        filename: entry.filename,
        modified: entry.modified_at,
        text,
        file: parsed.file,
      });
    }

    const toWrite = new Set<string>();
    const filenames: Record<string, string> = { ...get().projectFilenames };
    const spHandle = get().sharepoint.handle;
    const spNames = get().sharepoint.projectFilenames;
    for (const project of loadProjects()) {
      const projectId = project.project_id;
      const file = collectProject(projectId, BUILD_ID);
      if (!file) continue;
      const existing = local.get(projectId);
      local.delete(projectId);
      if (existing) filenames[projectId] = existing.filename;
      // SharePoint's file as read, compared file to file (see `sameProjectData`).
      const spText =
        spHandle?.cachedText(Object.hasOwn(spNames, projectId) ? spNames[projectId] : mirrorFilename(projectId)) ??
        serializeProjectFile(file);
      if (existing && sameProjectData(existing.text, spText)) {
        saveSyncRecord(projectId, { filename: existing.filename, modified_at: existing.modified }, 'local');
        markProjectSynced(projectId, undefined, 'local');
        continue;
      }
      if (existing) {
        const record = Object.hasOwn(records, projectId) ? records[projectId] : undefined;
        const ours =
          record != null &&
          record.filename === existing.filename &&
          record.modified_at === existing.modified;
        if (options.pairing || !ours) {
          kept.push(importAsCopy(existing.file, 'local copy'));
        }
      }
      toWrite.add(projectId);
    }

    // Projects only the local folder has.
    for (const [projectId, existing] of local) {
      const seenOnSharePoint = Object.hasOwn(spRecords, projectId);
      if (seenOnSharePoint && !options.pairing) {
        await setAside(handle, existing.filename, existing.text);
        setAsideNames.push(existing.filename);
        continue;
      }
      withSyncSuspendedSync(() => {
        applyProjectFile(existing.file, 'overwrite');
      });
      filenames[projectId] = existing.filename;
      saveSyncRecord(projectId, { filename: existing.filename, modified_at: existing.modified }, 'local');
      markProjectUnsynced(projectId, 'sharepoint');
      uploaded.push(existing.file.project_name || projectId);
    }

    patchTarget('local', { projectFilenames: filenames });
    if (options.pairing) writePairPending(false);
    useProjectStore.getState().refreshProjects();

    // Imported projects go up to SharePoint; the cache goes down to the folder.
    for (const projectId of Object.keys(loadUnsyncedMarkers('sharepoint'))) {
      if (projectIdExists(projectId)) void mirrorTarget('sharepoint', projectId);
    }
    for (const projectId of toWrite) await mirrorTarget('local', projectId);
    for (const projectId of Object.keys(loadUnsyncedMarkers('local'))) {
      if (projectIdExists(projectId)) await mirrorTarget('local', projectId);
    }
    await syncLibrary();
  } catch (error) {
    patchTarget('local', {
      status: 'error',
      lastError: error instanceof Error ? error.message : 'Could not update the local copy',
    });
  } finally {
    patchTarget('local', { syncing: false });
    refreshPendingCounts();
  }

  const parts: string[] = [];
  if (uploaded.length > 0) {
    parts.push(
      `Projects only the local folder had were added to SharePoint: ${uploaded.join(', ')}. / 本機資料夾才有的專案已加入 SharePoint：${uploaded.join('、')}。`,
    );
  }
  if (kept.length > 0) {
    parts.push(
      `The local folder held versions SharePoint does not; they were kept as separate projects: ${kept.join(', ')}. / 本機資料夾有與 SharePoint 不同的版本，已另存為獨立專案：${kept.join('、')}。`,
    );
  }
  if (setAsideNames.length > 0) {
    parts.push(
      `Projects deleted on SharePoint were moved to the local folder's Replaced/: ${setAsideNames.join(', ')}. / SharePoint 已刪除的專案，本機檔案已移到 Replaced/ 資料夾：${setAsideNames.join('、')}。`,
    );
  }
  if (parts.length > 0) {
    const previous = useFolderStore.getState().notice;
    useFolderStore.setState({ notice: [previous, ...parts].filter(Boolean).join(' ') });
  }
}

/**
 * Adds `file` as a new project named "<name> (<label> …)", owed to every
 * target. Returns the new name.
 */
function importAsCopy(file: ProjectFile, label: string): string {
  const taken = new Set([
    ...Object.values(useFolderStore.getState().projectFilenames),
    ...Object.values(useFolderStore.getState().sharepoint.projectFilenames),
  ]);
  const copyId = copyProjectId(file.project_id, label.replace(/\s+/g, '_'), taken);
  const copy = asSeparateCopy(file, copyId, label);
  withSyncSuspendedSync(() => {
    applyProjectFile(copy, 'overwrite');
  });
  for (const target of configuredTargets()) markProjectUnsynced(copyId, target);
  return copy.project_name;
}

/** Writes one project to the local copy soon, outside the edit path. */
function queueLocalWrite(projectId: string): void {
  const { handle, status } = useFolderStore.getState();
  if (!handle) return;
  markProjectUnsynced(projectId, 'local');
  refreshPendingCounts();
  if (status === 'connected') void mirrorTarget('local', projectId);
}

/** The component library, merged from every target and written back to each. */
async function syncLibrary(): Promise<void> {
  try {
    const { useComponentLibraryStore } = await import('./componentLibraryStore');
    await useComponentLibraryStore.getState().loadWithFolder();
    await useComponentLibraryStore.getState().syncToFolders();
  } catch {
    // The library is a bonus here; the next library edit writes it anyway.
  }
}

// --- writing one project ---------------------------------------------------------

/** The write running for each project on each target, so the next one waits for it. */
const inflight = new Map<string, Promise<boolean>>();

function inflightKey(target: SyncTarget, projectId: string): string {
  return `${target}\u0000${projectId}`;
}

/**
 * Writes one project to one target. One write per project per target at a
 * time: on SharePoint two overlapping writes of one file would race each
 * other's eTag and read as someone else's change.
 */
function mirrorTarget(target: SyncTarget, projectId: string): Promise<boolean> {
  const key = inflightKey(target, projectId);
  const previous = inflight.get(key);
  const run = (previous ? previous.catch(() => false) : Promise.resolve(false)).then(() =>
    mirrorOnce(target, projectId),
  );
  inflight.set(key, run);
  void run.finally(() => {
    if (inflight.get(key) === run) inflight.delete(key);
  });
  return run;
}

async function mirrorOnce(target: SyncTarget, projectId: string): Promise<boolean> {
  const get = useFolderStore.getState;
  const handle = targetHandle(target);
  const state = targetState(target);
  if (!handle || state.status === 'unbound') return false;
  if (target === 'sharepoint' && !get().sharepoint.enabled) return false;
  const saveGeneration = currentSaveGeneration();

  // Re-check rather than trusting the cached status: the browser can revoke
  // between one save and the next, and a Microsoft sign-in can expire.
  if ((await queryPermission(handle)) !== 'granted') {
    markSaveSettled(saveGeneration);
    patchTarget(target, { status: 'needs_permission' });
    refreshPendingCounts();
    return false;
  }

  // The marker's version when this write starts: an edit that lands while
  // the file is open bumps it, and the marker then survives this write.
  const markers = loadUnsyncedMarkers(target);
  const markerVersion = Object.hasOwn(markers, projectId)
    ? markers[projectId].version
    : undefined;
  const file = collectProject(projectId, BUILD_ID);
  if (!file) {
    markSaveSettled(saveGeneration);
    patchTarget(target, {
      status: 'error',
      lastError: `Project "${projectId}" is missing from the working cache`,
    });
    return false;
  }

  patchTarget(target, { syncing: true });
  const filenames = targetState(target).projectFilenames;
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
        patchTarget(target, { status: 'connected', syncing: false, lastError: null });
        refreshPendingCounts();
        return true;
      }
    }
    markProjectSynced(projectId, markerVersion, target);
    const modified_at = await fileModifiedAt(handle, filename);
    if (modified_at != null) saveSyncRecord(projectId, { filename, modified_at }, target);
    markSaveSettled(saveGeneration);
    patchTarget(target, {
      status: 'connected',
      syncing: false,
      lastSyncAt: new Date().toISOString(),
      lastSyncedProjectId: projectId,
      projectFilenames: withOwn(targetState(target).projectFilenames, projectId, filename),
      lastError: null,
    });
    if (target === 'sharepoint' && get().remoteChange?.projectId === projectId) {
      useFolderStore.setState({ remoteChange: null });
    }
    refreshPendingCounts();
    return true;
  } catch (error) {
    markSaveSettled(saveGeneration);
    refreshPendingCounts();
    if (isSharePointError(error) && error.auth) {
      patchTarget(target, { status: 'needs_permission', syncing: false, lastError: error.message });
      return false;
    }
    patchTarget(target, {
      status: 'error',
      syncing: false,
      lastError: error instanceof Error ? error.message : 'Write failed',
    });
    return false;
  }
}

/**
 * Whether two project files hold the same project, whenever they were written.
 *
 * `exported_at` and the project's `updated_at` say when, not what: a project
 * re-saved without a change differs in nothing else. Compare FILES, though,
 * not a file with the cache's copy of it — reading a file in stamps a new
 * `updated_at` and fills in defaults for fields it predates, so that pair
 * would never compare equal.
 */
function sameProjectData(a: string, b: string): boolean {
  const comparable = (text: string): string => {
    const file = JSON.parse(text) as { data?: { project?: { meta?: Record<string, unknown> } } };
    const meta = file.data?.project?.meta;
    if (meta && 'updated_at' in meta) delete meta.updated_at;
    return JSON.stringify(file.data);
  };
  try {
    return comparable(a) === comparable(b);
  } catch {
    return false;
  }
}

/**
 * A save that SharePoint refused because the file changed since it was read.
 *
 * Not every refusal is someone else's work. The file may be gone (deleted on
 * SharePoint), may be our own earlier write that timed out but landed, may
 * have been re-saved with the very same project in it, or may be exactly the
 * file this browser last wrote, met again in a session that never read it. In
 * those cases the save simply goes through ('written').
 *
 * Otherwise both versions are real work and neither may be lost ('copied'):
 *
 *   1. everything this session has — including edits still in the stores —
 *      becomes a new project, "<name> (conflict copy …)";
 *   2. the original project takes SharePoint's version;
 *   3. `conflict` is set, and the shell moves the engineer onto their copy.
 *
 * Steps 1–3 run in one synchronous block, so no store flush can land between
 * them and write this session's edits over SharePoint's version. The local
 * copy then receives both.
 */
async function resolveConflict(
  handle: SharePointDirectory,
  projectId: string,
  filename: string,
  attempted: string,
): Promise<'written' | 'copied'> {
  const remote = await handle.readRemote(filename);
  // Never read in this session (it opened offline, say): the record of this
  // browser's last write to the file says whether anyone has touched it since.
  const records = loadSyncState('sharepoint');
  const record = Object.hasOwn(records, projectId) ? records[projectId] : undefined;
  const benign =
    remote == null ||
    handle.wasOurUncertainWrite(filename, remote.text) ||
    (remote.base != null && sameProjectData(remote.base, remote.text)) ||
    (remote.base == null &&
      record != null &&
      record.filename === filename &&
      record.modified_at === remote.meta.modified);
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
    const taken = new Set([
      ...listed,
      ...Object.values(get().sharepoint.projectFilenames),
      ...Object.values(get().projectFilenames),
    ]);
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
  markProjectSynced(projectId, undefined, 'sharepoint');
  saveSyncRecord(projectId, { filename, modified_at: remote.meta.modified }, 'sharepoint');
  for (const target of configuredTargets()) markProjectUnsynced(conflict.copyId, target);
  set({ remoteChange: null, conflict });
  useProjectStore.getState().refreshProjects();
  // Not awaited: this runs inside the original's write, and the copy is a
  // different file. Its unsynced markers cover a failure.
  void get().mirror(conflict.copyId);
  // The local copy of the original takes SharePoint's version too.
  queueLocalWrite(projectId);
  return 'copied';
}

// --- rescue -----------------------------------------------------------------

/** `{ ...record, [key]: value }` without the `__proto__` setter. */
function withOwn<T>(record: Record<string, T>, key: string, value: T): Record<string, T> {
  return Object.fromEntries([...Object.entries(record), [key, value]]);
}

/** "2026-10-15 10:12" in local time: it is read next to the clock on the desk. */
function localStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * The project as a separate project: a new id and a name that says so.
 *
 * `applyProjectFile` re-points every row at `file.project_id`, so changing
 * the file's id and the project record is enough for the copy to load as its
 * own project, beside — not over — the other version.
 */
function asSeparateCopy(file: ProjectFile, copyId: string, label: string): ProjectFile {
  const name = `${file.project_name} (${label} ${localStamp()})`;
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

/** `<id>_<kind>`, `<id>_<kind>2`, … — free in the cache and in the folders. */
function copyProjectId(projectId: string, kind: string, taken: ReadonlySet<string>): string {
  const base = `${projectId.slice(0, 50)}_${kind}`;
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? base : `${base}${n}`;
    if (!projectIdExists(candidate) && !taken.has(mirrorFilename(candidate))) return candidate;
  }
  return `${base}_${Date.now()}`;
}

/**
 * Writes every project whose cache is ahead of its file in `target`, before
 * a hydrate replaces the cache with that target's contents.
 *
 * When the file is exactly as this browser last wrote it (or holds the same
 * project), the newer edits simply go into it — the ordinary save that never
 * happened. When the file changed since (edited on another machine, replaced
 * by hand, or this is a different folder altogether), overwriting it would
 * trade one side's work for the other's, so the edits are written as a
 * separate, clearly named project instead and both survive. Returns the names
 * of any such copies.
 */
async function rescueUnsyncedProjects(
  target: SyncTarget,
  handle: DirectoryHandle,
): Promise<string[]> {
  const markers = loadUnsyncedMarkers(target);
  const ids = Object.keys(markers);
  if (ids.length === 0) return [];

  const state = loadSyncState(target);
  const entries = await listProjectFiles(handle);
  const onDisk = new Map(entries.map((entry) => [entry.filename, entry]));
  const taken = new Set(onDisk.keys());
  const recovered: string[] = [];

  for (const projectId of ids) {
    // Deleted since the edit: nothing to rescue, and nothing to resurrect.
    const file = projectIdExists(projectId) ? collectProject(projectId, BUILD_ID) : null;
    if (!file) {
      markProjectSynced(projectId, undefined, target);
      continue;
    }

    const record = Object.hasOwn(state, projectId) ? state[projectId] : undefined;
    const filename = record?.filename ?? mirrorFilename(projectId);
    const current = onDisk.get(filename);
    const text = serializeProjectFile(file);
    let untouched =
      current == null ? record == null : record != null && current.modified_at === record.modified_at;
    if (!untouched && current != null) {
      // Changed since — but perhaps to the very same project.
      const there = await readTextFile(handle, filename);
      if (there != null && sameProjectData(there, text)) untouched = true;
    }

    try {
      if (untouched) {
        await writeTextFile(handle, filename, text);
      } else {
        const copyId = copyProjectId(projectId, 'recovered', taken);
        const copy = asSeparateCopy(file, copyId, 'recovered');
        const copyName = mirrorFilename(copyId);
        await writeTextFile(handle, copyName, serializeProjectFile(copy));
        taken.add(copyName);
        recovered.push(copy.project_name);
      }
      markProjectSynced(projectId, undefined, target);
    } catch (error) {
      // Leave the marker: the cache keeps the edits, and the next hydrate
      // tries again rather than replacing them. An expired sign-in says so.
      if (isSharePointError(error) && error.auth) throw error;
      throw new Error(
        `Could not write the unsaved edits of "${projectId}" to ${target === 'sharepoint' ? 'SharePoint' : 'the folder'} before reloading it, so it was not reloaded.`,
        { cause: error },
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
 * collapses into a single write per target.
 */
const DEBOUNCE_MS = 800;

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
/** Projects written since the last mirror, so each gets its own file write. */
const pendingProjects = new Set<string>();

/** Drops the scheduled write; for a hydrate, which writes everything behind itself. */
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
        for (const target of ['local', 'sharepoint'] as const) {
          markProjectSynced(projectId, undefined, target);
        }
        refreshPendingCounts();
        return Promise.resolve(false);
      }
      return store.mirror(projectId);
    }),
  );
}

/**
 * Starts the pending writes NOW instead of after the debounce.
 *
 * For a tab being hidden or closed. The write is asynchronous and may not
 * finish before the page goes; that is what the unsynced markers are for — the
 * next session finds them and writes the edits out before reloading.
 */
export function flushFolderSyncNow(): Promise<unknown> {
  if (pendingProjects.size === 0) return Promise.resolve();
  if (connectedTargets().length === 0) return Promise.resolve();
  return mirrorPending();
}

/**
 * True while some project's latest edits are in this browser only — on none
 * of the targets it is owed to. An edit already on the local disk and still
 * waiting for SharePoint is safe: it goes up when SharePoint is back.
 */
export function hasUnsyncedProjects(): boolean {
  const targets = configuredTargets();
  const marked = targets.map((target) => loadUnsyncedMarkers(target));
  const candidates = new Set(marked.flatMap((markers) => Object.keys(markers)));
  for (const projectId of candidates) {
    if (!projectIdExists(projectId)) continue;
    if (marked.every((markers) => Object.hasOwn(markers, projectId))) return true;
  }
  return false;
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
    // Hydration replays a folder through the save path; nothing it writes is
    // newer than the folder, so it neither marks nor mirrors anything.
    if (isSyncSuspended()) {
      markSaveIdle();
      return;
    }

    // Recorded for every target, whatever its state: this is what lets the
    // next session (or the moment a target is back) find edits that never
    // reached it and write them out.
    const projectId = writtenProjectId ?? activeProjectId;
    if (projectId) {
      for (const target of configuredTargets()) markProjectUnsynced(projectId, target);
      refreshPendingCounts();
    }

    // No mirror will be scheduled on any of these paths, and a mirror is the
    // only thing that settles the save indicator — so say so here rather than
    // leaving it reading "Saving…" with nowhere to write to. The markers keep
    // the truth meanwhile.
    if (connectedTargets().length === 0 || !projectId) {
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
