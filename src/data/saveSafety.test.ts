/**
 * The paths by which an edit used to be lost without a word:
 *
 *   - a save that threw inside a timer (a full browser quota is the usual
 *     cause) — the light stayed on "Writing…" and nothing reached disk;
 *   - a tab closed or reloaded inside the save debounce — the next session
 *     reloaded the cache FROM the folder and the newer edit was replaced;
 *   - a folder permission that lapsed mid-session — "Reconnect" reloaded the
 *     folder over the edits made since;
 *   - a new build — the cache was cleared with edits still in it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedDemoProject } from '@/mock/seed';
import { DEMO_PROJECT_ID } from '@/mock/demoProject';

import { startAutoPersist } from './autoPersist';
import { BUILD_STAMP_KEY } from './buildStamp';
import { mirrorFilename, type DirectoryHandle, type PermissionState } from './folderBinding';
import { setSyncProject, startFolderAutoSync, useFolderStore } from './folderStore';
import {
  loadProject,
  loadProjects,
  loadUnsyncedMarkers,
  saveProject,
} from './persistence';
import { useProjectStore } from './projectStore';
import { useSaveStatus } from './saveStatus';
import { useScenarioStore } from './scenarioStore';
import { flushPendingWork, hasWorkNotOnDisk } from './unloadGuard';

class MemoryStorage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

/** A folder whose files carry real, advancing modification times. */
function fakeFolder(permission: { current: PermissionState } = { current: 'granted' }) {
  const files = new Map<string, { text: string; modified: number }>();
  let clock = 1000;
  const handle: DirectoryHandle & {
    files: typeof files;
    /** Someone else edits a file: new content, newer timestamp. */
    touch: (name: string, text?: string) => void;
  } = {
    name: 'ThermalProjects',
    kind: 'directory',
    files,
    touch(name, text) {
      const entry = files.get(name);
      if (entry) files.set(name, { text: text ?? entry.text, modified: (clock += 10) });
    },
    async queryPermission() {
      return permission.current;
    },
    async requestPermission() {
      return permission.current;
    },
    async getFileHandle(name: string) {
      return {
        name,
        kind: 'file' as const,
        async getFile() {
          const entry = files.get(name);
          if (!entry) throw new Error('NotFoundError');
          return {
            text: async () => entry.text,
            lastModified: entry.modified,
            size: entry.text.length,
          };
        },
        async createWritable() {
          let buffer = '';
          return {
            async write(data: string | Blob) {
              buffer += String(data);
            },
            async close() {
              files.set(name, { text: buffer, modified: (clock += 10) });
            },
          };
        },
      };
    },
    async *values() {
      for (const name of [...files.keys()]) {
        yield (await handle.getFileHandle(name)) as never;
      }
    },
  };
  return handle;
}

let stops: Array<() => void> = [];

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  useFolderStore.setState({
    status: 'unbound',
    handle: null,
    folderName: null,
    lastSyncAt: null,
    lastSyncedProjectId: null,
    lastError: null,
    syncing: false,
    projectFilenames: {},
    hydrated: false,
    notice: null,
  });
  useSaveStatus.setState({ pending: false, generation: 0, error: null });
  setSyncProject(null);
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  useScenarioStore.getState().clear();
  useProjectStore.getState().clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Binds the folder and loads the demo from it, as a real session starts. */
async function sessionWithDemo(folder = fakeFolder()) {
  await seedDemoProject();
  useFolderStore.setState({ handle: folder, folderName: folder.name, status: 'connected' });
  await useFolderStore.getState().mirror(DEMO_PROJECT_ID);
  await useFolderStore.getState().hydrate();
  setSyncProject(DEMO_PROJECT_ID);
  stops.push(startFolderAutoSync());
  return folder;
}

function rename(name: string) {
  saveProject({ ...loadProject(DEMO_PROJECT_ID)!, project_name: name });
}

describe('a save that throws', () => {
  it('is reported instead of leaving "Writing…" up, and the edit stays dirty', async () => {
    await seedDemoProject();
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);
    useScenarioStore.getState().loadFor(DEMO_PROJECT_ID);
    vi.useFakeTimers();
    stops.push(startAutoPersist());

    vi.spyOn(useScenarioStore.getState(), 'save').mockImplementation(() => {
      throw new Error('storage exploded');
    });
    useScenarioStore.setState({ dirty: true });

    await expect(vi.advanceTimersByTimeAsync(600)).resolves.not.toThrow();
    expect(useSaveStatus.getState().error).toBe('storage exploded');
    expect(useSaveStatus.getState().pending).toBe(false);
    expect(useScenarioStore.getState().dirty).toBe(true);
  });
});

describe('a tab closed inside the save debounce', () => {
  it('asks before leaving, and the next session writes the edit out before reloading', async () => {
    vi.useFakeTimers();
    const folder = await sessionWithDemo();

    rename('Edited just before closing');
    // The folder write is still waiting on its debounce…
    expect(hasWorkNotOnDisk()).toBe(true);
    expect(JSON.parse(folder.files.get(mirrorFilename(DEMO_PROJECT_ID))!.text).project_name).not.toBe(
      'Edited just before closing',
    );

    // …and the tab is gone before it runs. A new session hydrates the folder.
    for (const stop of stops) stop();
    stops = [];
    await useFolderStore.getState().hydrate();

    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Edited just before closing');
    expect(JSON.parse(folder.files.get(mirrorFilename(DEMO_PROJECT_ID))!.text).project_name).toBe(
      'Edited just before closing',
    );
    expect(loadUnsyncedMarkers()).toEqual({});
  });

  it('starts the folder write at once when the tab is hidden', async () => {
    vi.useFakeTimers();
    const folder = await sessionWithDemo();

    rename('Written on hide');
    flushPendingWork();
    // No debounce wait: only the pending promises need to settle.
    await vi.advanceTimersByTimeAsync(0);

    expect(JSON.parse(folder.files.get(mirrorFilename(DEMO_PROJECT_ID))!.text).project_name).toBe(
      'Written on hide',
    );
    expect(hasWorkNotOnDisk()).toBe(false);
  });
});

describe('a permission that lapses mid-session', () => {
  it('keeps the edits made meanwhile when the folder is reconnected', async () => {
    vi.useFakeTimers();
    const permission = { current: 'granted' as PermissionState };
    const folder = await sessionWithDemo(fakeFolder(permission));

    permission.current = 'prompt';
    rename('Edited while disconnected');
    await vi.advanceTimersByTimeAsync(2000);
    expect(useFolderStore.getState().status).toBe('needs_permission');

    permission.current = 'granted';
    await useFolderStore.getState().reconnect();

    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Edited while disconnected');
    expect(JSON.parse(folder.files.get(mirrorFilename(DEMO_PROJECT_ID))!.text).project_name).toBe(
      'Edited while disconnected',
    );
  });
});

describe('when both sides changed', () => {
  it('keeps the cached edits as a recovered copy instead of overwriting the folder', async () => {
    vi.useFakeTimers();
    const folder = await sessionWithDemo();

    rename('My unsaved edit');
    for (const stop of stops) stop();
    stops = [];
    // Meanwhile the file is changed somewhere else.
    const filename = mirrorFilename(DEMO_PROJECT_ID);
    const theirs = JSON.parse(folder.files.get(filename)!.text);
    theirs.project_name = 'Their edit';
    theirs.data.project.project_name = 'Their edit';
    folder.touch(filename, JSON.stringify(theirs));

    await useFolderStore.getState().hydrate();

    // Their file wins its own name…
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Their edit');
    // …and the edit survives beside it, named so nobody mistakes it.
    const recovered = loadProjects().find((project) => project.project_id !== DEMO_PROJECT_ID)!;
    expect(recovered.project_id).toBe(`${DEMO_PROJECT_ID}_recovered`);
    expect(recovered.project_name).toMatch(/^My unsaved edit \(recovered /);
    expect(useFolderStore.getState().notice).toContain('My unsaved edit');
  });
});

describe('a new build with edits still in the cache', () => {
  it('keeps the cache instead of clearing it', async () => {
    await seedDemoProject();
    localStorage.setItem(BUILD_STAMP_KEY, 'old-build');
    localStorage.setItem('tnv.unsynced', JSON.stringify({ [DEMO_PROJECT_ID]: { since: 'x', version: 1 } }));

    vi.resetModules();
    const { bootstrapStorage } = await import('./bootstrapStorage');
    const outcome = await bootstrapStorage('new-build');

    expect(outcome?.action).toBe('deferred');
    expect(localStorage.getItem(BUILD_STAMP_KEY)).toBe('new-build');
    expect(loadProject(DEMO_PROJECT_ID)).not.toBeNull();
  });
});
