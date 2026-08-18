import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedDemoProject } from '@/mock/seed';
import { DEMO_PROJECT_ID } from '@/mock/demoProject';
import { loadComponents, loadProject, loadProjects, saveProject } from './persistence';
import { collectProject, serializeProjectFile } from './projectFile';
import { mirrorFilename, type DirectoryHandle } from './folderBinding';
import { isSyncSuspended } from './syncSuspend';
import { hydrateFromFolder } from './workspace';

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

/** A folder backed by a Map of filename → text. */
function fakeFolder(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed));
  const handle: DirectoryHandle & { files: Map<string, string> } = {
    name: 'Workspace',
    kind: 'directory',
    files,
    async queryPermission() {
      return 'granted';
    },
    async requestPermission() {
      return 'granted';
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name) && !options?.create) throw new Error('NotFoundError');
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
            async write(d: string | Blob) {
              buffer += String(d);
            },
            async close() {
              files.set(name, buffer);
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

/** Builds a real project file for the seeded demo, then empties storage. */
async function demoFileText(): Promise<string> {
  await seedDemoProject();
  const file = collectProject(DEMO_PROJECT_ID, 'test-build')!;
  const text = serializeProjectFile(file);
  localStorage.clear();
  return text;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hydrateFromFolder', () => {
  it('loads every project file into the cache', async () => {
    const text = await demoFileText();
    const folder = fakeFolder({ [mirrorFilename(DEMO_PROJECT_ID)]: text });

    const result = await hydrateFromFolder(folder);

    expect(result.projectIds).toEqual([DEMO_PROJECT_ID]);
    expect(result.skipped).toEqual([]);
    expect(loadProject(DEMO_PROJECT_ID)).not.toBeNull();
    expect(loadComponents(DEMO_PROJECT_ID).length).toBeGreaterThan(0);
  });

  // An empty folder is an empty project list — that is the whole contract.
  it('leaves the cache empty for an empty folder', async () => {
    await seedDemoProject();
    expect(loadProjects().length).toBeGreaterThan(0);

    const result = await hydrateFromFolder(fakeFolder());

    expect(result.projectIds).toEqual([]);
    expect(loadProjects()).toEqual([]);
  });

  // A file deleted outside the app must not be resurrected by a stale cache.
  it('drops cached projects whose file is gone', async () => {
    const text = await demoFileText();
    const folder = fakeFolder({ [mirrorFilename(DEMO_PROJECT_ID)]: text });
    await hydrateFromFolder(folder);
    expect(loadProject(DEMO_PROJECT_ID)).not.toBeNull();

    folder.files.delete(mirrorFilename(DEMO_PROJECT_ID));
    await hydrateFromFolder(folder);

    expect(loadProject(DEMO_PROJECT_ID)).toBeNull();
    expect(loadProjects()).toEqual([]);
  });

  // The folder wins: whatever is on disk replaces whatever was cached.
  it('overwrites a diverged cache with what is on disk', async () => {
    const text = await demoFileText();
    const folder = fakeFolder({ [mirrorFilename(DEMO_PROJECT_ID)]: text });
    await hydrateFromFolder(folder);

    const project = loadProject(DEMO_PROJECT_ID)!;
    saveProject({ ...project, project_name: 'Edited only in the cache' });

    await hydrateFromFolder(folder);

    expect(loadProject(DEMO_PROJECT_ID)?.project_name).not.toBe('Edited only in the cache');
  });

  it('skips foreign JSON without failing the whole read', async () => {
    const text = await demoFileText();
    const folder = fakeFolder({
      [mirrorFilename(DEMO_PROJECT_ID)]: text,
      'shopping-list.json': JSON.stringify({ milk: true }),
      'broken.json': '{not json',
    });

    const result = await hydrateFromFolder(folder);

    expect(result.projectIds).toEqual([DEMO_PROJECT_ID]);
    expect(result.skipped.map((s) => s.filename).sort()).toEqual([
      'broken.json',
      'shopping-list.json',
    ]);
  });

  // Replaying files goes through the normal save path, which is what triggers
  // mirroring — without suspension, opening a workspace would rewrite it all.
  it('suspends mirroring while replaying, and restores it after', async () => {
    const text = await demoFileText();
    const folder = fakeFolder({ [mirrorFilename(DEMO_PROJECT_ID)]: text });

    let suspendedDuringReplay = false;
    const original = MemoryStorage.prototype.setItem;
    MemoryStorage.prototype.setItem = function patched(k: string, v: string) {
      if (k.startsWith('tnv.') && isSyncSuspended()) suspendedDuringReplay = true;
      return original.call(this, k, v);
    };

    try {
      await hydrateFromFolder(folder);
    } finally {
      MemoryStorage.prototype.setItem = original;
    }

    expect(suspendedDuringReplay).toBe(true);
    expect(isSyncSuspended()).toBe(false);
  });

  it('restores mirroring even when a read throws', async () => {
    const folder = fakeFolder();
    folder.values = async function* () {
      throw new Error('Folder vanished');
    };

    await expect(hydrateFromFolder(folder)).rejects.toThrow('Folder vanished');
    expect(isSyncSuspended()).toBe(false);
  });
});
