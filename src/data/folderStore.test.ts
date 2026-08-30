import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedDemoProject } from '@/mock/seed';
import { DEMO_PROJECT_ID } from '@/mock/demoProject';
import { saveProject, loadProject, loadScenarios } from './persistence';
import { mirrorFilename } from './folderBinding';
import type { DirectoryHandle, PermissionState } from './folderBinding';
import { setSyncProject, startFolderAutoSync, useFolderStore } from './folderStore';
import { collectProject, serializeProjectFile } from './projectFile';
import { useSaveStatus } from './saveStatus';
import { startAutoPersist } from './autoPersist';
import { useScenarioStore } from './scenarioStore';
import { useProjectStore } from './projectStore';

class MemoryStorage {
  private map = new Map<string, string>();
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
  clear() {
    this.map.clear();
  }
}

/** A directory handle backed by a Map, standing in for a real folder. */
function fakeFolder(
  options: {
    permission?: PermissionState;
    failWrites?: boolean;
    files?: Record<string, string>;
  } = {},
) {
  const files = new Map<string, string>(Object.entries(options.files ?? {}));
  const handle: DirectoryHandle & { files: Map<string, string> } = {
    name: 'ThermalProjects',
    kind: 'directory',
    files,
    async queryPermission() {
      return options.permission ?? 'granted';
    },
    async requestPermission() {
      return options.permission ?? 'granted';
    },
    async getFileHandle(name: string) {
      return {
        name,
        kind: 'file' as const,
        async getFile() {
          const text = files.get(name) ?? '';
          return { text: async () => text, lastModified: 1, size: text.length };
        },
        async createWritable() {
          let buffer = '';
          return {
            async write(data: string | Blob) {
              if (options.failWrites) throw new Error('Disk is full');
              buffer += String(data);
            },
            async close() {
              if (options.failWrites) return;
              files.set(name, buffer);
            },
          };
        },
      };
    },
    async *values() {
      for (const name of files.keys()) {
        yield (await handle.getFileHandle(name)) as never;
      }
    },
  };
  return handle;
}

/** Puts the store into the state a successful bind would leave. */
function connect(handle: DirectoryHandle) {
  useFolderStore.setState({ handle, folderName: handle.name, status: 'connected' });
}

let stopAutoSync: (() => void) | null = null;
let stopAutoPersist: (() => void) | null = null;

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
  });
  useSaveStatus.setState({ pending: false, generation: 0 });
  setSyncProject(null);
});

afterEach(() => {
  stopAutoSync?.();
  stopAutoSync = null;
  stopAutoPersist?.();
  stopAutoPersist = null;
  useScenarioStore.getState().clear();
  useProjectStore.getState().clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('mirror', () => {
  it('writes one file per project, named from the project id', async () => {
    await seedDemoProject();
    const folder = fakeFolder();
    connect(folder);

    const ok = await useFolderStore.getState().mirror(DEMO_PROJECT_ID);

    expect(ok).toBe(true);
    expect([...folder.files.keys()]).toEqual([mirrorFilename(DEMO_PROJECT_ID)]);
    const written = JSON.parse(folder.files.get(mirrorFilename(DEMO_PROJECT_ID))!);
    expect(written.project_id).toBe(DEMO_PROJECT_ID);
    expect(written.data.components.length).toBeGreaterThan(0);
  });

  // Repeated saves must overwrite, not pile up timestamped copies.
  it('overwrites the same file on a second write', async () => {
    await seedDemoProject();
    const folder = fakeFolder();
    connect(folder);

    await useFolderStore.getState().mirror(DEMO_PROJECT_ID);
    const project = loadProject(DEMO_PROJECT_ID)!;
    saveProject({ ...project, project_name: 'Renamed' });
    await useFolderStore.getState().mirror(DEMO_PROJECT_ID);

    expect(folder.files.size).toBe(1);
    const written = JSON.parse(folder.files.get(mirrorFilename(DEMO_PROJECT_ID))!);
    expect(written.data.project.project_name).toBe('Renamed');
  });

  it('writes back to the JSON filename the project was loaded from', async () => {
    await seedDemoProject();
    const sourceName = 'FR1_RRU_GOLDEN_DEMO_20260829.tnv.json';
    const sourceText = serializeProjectFile(collectProject(DEMO_PROJECT_ID, 'test')!);
    const folder = fakeFolder({ files: { [sourceName]: sourceText } });
    connect(folder);
    await useFolderStore.getState().hydrate();

    const project = loadProject(DEMO_PROJECT_ID)!;
    saveProject({ ...project, project_name: 'Persisted into source JSON' });
    const ok = await useFolderStore.getState().mirror(DEMO_PROJECT_ID);

    expect(ok).toBe(true);
    expect([...folder.files.keys()]).toEqual([sourceName]);
    const written = JSON.parse(folder.files.get(sourceName)!);
    expect(written.data.project.project_name).toBe('Persisted into source JSON');
    expect(useFolderStore.getState().projectFilenames[DEMO_PROJECT_ID]).toBe(sourceName);

    // A hard refresh rebuilds the cache from the folder. The edited value must
    // therefore survive even after the browser working copy is discarded.
    localStorage.clear();
    await useFolderStore.getState().hydrate();
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Persisted into source JSON');
  });

  it('records the failure without throwing when the write fails', async () => {
    await seedDemoProject();
    connect(fakeFolder({ failWrites: true }));

    const ok = await useFolderStore.getState().mirror(DEMO_PROJECT_ID);

    expect(ok).toBe(false);
    expect(useFolderStore.getState().status).toBe('error');
    expect(useFolderStore.getState().lastError).toContain('Disk is full');
  });

  // The browser can revoke between one save and the next.
  it('flips to needs_permission when access was revoked', async () => {
    await seedDemoProject();
    connect(fakeFolder({ permission: 'prompt' }));

    const ok = await useFolderStore.getState().mirror(DEMO_PROJECT_ID);

    expect(ok).toBe(false);
    expect(useFolderStore.getState().status).toBe('needs_permission');
  });

  it('does nothing for a project that is not in storage', async () => {
    const folder = fakeFolder();
    connect(folder);

    expect(await useFolderStore.getState().mirror('GHOST')).toBe(false);
    expect(folder.files.size).toBe(0);
  });

  it('does nothing while no folder is bound', async () => {
    await seedDemoProject();
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(false);
  });
});

describe('auto-sync', () => {
  it('mirrors after a save, coalescing the burst of writes into one', async () => {
    vi.useFakeTimers();
    await seedDemoProject();
    const folder = fakeFolder();
    connect(folder);
    setSyncProject(DEMO_PROJECT_ID);
    stopAutoSync = startFolderAutoSync();

    const project = loadProject(DEMO_PROJECT_ID)!;
    // One user-visible save fans out into several collection writes.
    saveProject({ ...project, project_name: 'A' });
    saveProject({ ...project, project_name: 'B' });
    saveProject({ ...project, project_name: 'C' });

    expect(folder.files.size).toBe(0); // still inside the debounce window

    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() => expect(folder.files.size).toBe(1));

    const written = JSON.parse(folder.files.get(mirrorFilename(DEMO_PROJECT_ID))!);
    expect(written.data.project.project_name).toBe('C');
  });

  it('persists an edited store through the project JSON and a hard refresh', async () => {
    vi.useFakeTimers();
    await seedDemoProject();
    const folder = fakeFolder();
    connect(folder);
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);
    useScenarioStore.getState().loadFor(DEMO_PROJECT_ID);
    setSyncProject(DEMO_PROJECT_ID);
    stopAutoSync = startFolderAutoSync();
    stopAutoPersist = startAutoPersist();

    useScenarioStore.getState().updateScenario('SCN_001', {
      name: 'Survives Ctrl Shift R',
    });
    await vi.advanceTimersByTimeAsync(2500);
    await vi.waitFor(() =>
      expect(folder.files.has(mirrorFilename(DEMO_PROJECT_ID))).toBe(true),
    );

    const written = JSON.parse(folder.files.get(mirrorFilename(DEMO_PROJECT_ID))!);
    expect(written.data.scenarios[0].name).toBe('Survives Ctrl Shift R');
    expect(useSaveStatus.getState().pending).toBe(false);

    localStorage.clear();
    await useFolderStore.getState().hydrate();
    expect(loadScenarios(DEMO_PROJECT_ID)[0].name).toBe('Survives Ctrl Shift R');
  });

  it('stays quiet while no folder is connected', async () => {
    vi.useFakeTimers();
    await seedDemoProject();
    const folder = fakeFolder();
    // Deliberately not connected.
    useFolderStore.setState({ handle: folder, status: 'unbound' });
    setSyncProject(DEMO_PROJECT_ID);
    stopAutoSync = startFolderAutoSync();

    saveProject(loadProject(DEMO_PROJECT_ID)!);
    await vi.advanceTimersByTimeAsync(2000);

    expect(folder.files.size).toBe(0);
  });

  // An unsaved project has nothing on disk to read, so there is nothing to mirror.
  it('stays quiet while no project is selected', async () => {
    vi.useFakeTimers();
    await seedDemoProject();
    const folder = fakeFolder();
    connect(folder);
    setSyncProject(null);
    stopAutoSync = startFolderAutoSync();

    saveProject(loadProject(DEMO_PROJECT_ID)!);
    await vi.advanceTimersByTimeAsync(2000);

    expect(folder.files.size).toBe(0);
  });
});

describe('unbind', () => {
  it('drops the binding', async () => {
    await seedDemoProject();
    connect(fakeFolder());

    await useFolderStore.getState().unbind();

    expect(useFolderStore.getState().handle).toBeNull();
    expect(useFolderStore.getState().folderName).toBeNull();
    expect(useFolderStore.getState().hydrated).toBe(false);
  });

  // The cache only ever mirrored the folder. Keeping it would leave projects on
  // screen that the app has nowhere to write to, and the files on disk are
  // untouched, so nothing is actually lost.
  it('clears the cache, since the folder was the source of truth', async () => {
    await seedDemoProject();
    const folder = fakeFolder();
    connect(folder);
    await useFolderStore.getState().mirror(DEMO_PROJECT_ID);

    await useFolderStore.getState().unbind();

    expect(loadProject(DEMO_PROJECT_ID)).toBeNull();
    // The file on disk is left exactly as it was.
    expect(folder.files.has(mirrorFilename(DEMO_PROJECT_ID))).toBe(true);
  });
});
