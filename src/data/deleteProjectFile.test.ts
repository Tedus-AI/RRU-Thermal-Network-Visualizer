/**
 * Deleting a project has to reach the folder, not just the browser.
 *
 * `purgeProject` clears every per-project collection in local storage, and the
 * project vanished from the selector — but its JSON stayed in the bound folder.
 * The next hydrate reads the folder back into the cache, so the project simply
 * reappeared: the delete looked like it worked right up until the folder was
 * re-read, and in the meantime the file the engineer thought they had deleted
 * was still sitting in their own directory.
 *
 * Only the file that project was loaded from is touched. Everything else in the
 * folder belongs to the engineer, not to this app.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { deleteFile, type DirectoryHandle } from './folderBinding';
import { useFolderStore } from './folderStore';

/** A folder that records what was asked of it. */
function folder(options: { files?: string[]; canRemove?: boolean } = {}) {
  const files = new Set(options.files ?? []);
  const removed: string[] = [];
  const handle = {
    kind: 'directory' as const,
    name: 'RRU',
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!files.has(name) && !opts?.create) throw new Error('NotFoundError');
      files.add(name);
      return {
        kind: 'file' as const,
        name,
        async getFile() {
          return { text: async () => '{}', size: 2, lastModified: 0 };
        },
      };
    },
    async *values() {},
  } as unknown as DirectoryHandle & { removeEntry?: (name: string) => Promise<void> };

  if (options.canRemove !== false) {
    handle.removeEntry = async (name: string) => {
      if (!files.has(name)) throw new Error('NotFoundError');
      files.delete(name);
      removed.push(name);
    };
  }

  return { handle: handle as DirectoryHandle, files, removed };
}

describe('removing one file from the folder', () => {
  it('removes the file it was asked for, and nothing else', async () => {
    const { handle, files, removed } = folder({ files: ['a.tnv.json', 'b.tnv.json'] });

    expect(await deleteFile(handle, 'a.tnv.json')).toBe(true);
    expect(removed).toEqual(['a.tnv.json']);
    expect([...files]).toEqual(['b.tnv.json']);
  });

  /** Already gone is the outcome the caller wanted. */
  it('reports success for a file that is not there', async () => {
    const { handle } = folder({ files: [] });

    expect(await deleteFile(handle, 'gone.tnv.json')).toBe(true);
  });

  /**
   * `removeEntry` is optional in the File System Access API. Saying "removed"
   * on an engine that cannot remove would be a delete the user never got.
   */
  it('says so when the browser cannot remove entries at all', async () => {
    const { handle } = folder({ files: ['a.tnv.json'], canRemove: false });

    expect(await deleteFile(handle, 'a.tnv.json')).toBe(false);
  });
});

describe('the delete a project triggers', () => {
  beforeEach(() => {
    useFolderStore.setState({
      handle: null,
      status: 'connected',
      projectFilenames: {},
      lastError: null,
    });
  });

  it('removes the file the project was actually loaded from', async () => {
    const { handle, files } = folder({
      files: ['FR1_RRU_starkcore_20260903014628.tnv.json', 'other.tnv.json'],
    });
    useFolderStore.setState({
      handle,
      projectFilenames: { PRJ_STARK: 'FR1_RRU_starkcore_20260903014628.tnv.json' },
    });

    expect(await useFolderStore.getState().deleteProjectFile('PRJ_STARK')).toBe(true);
    expect([...files]).toEqual(['other.tnv.json']);
  });

  /** Nothing recorded means the mirror name, which is what a save would use. */
  it('falls back to the name a save would have written', async () => {
    const { handle, removed } = folder({ files: ['PRJ_NEW.tnv.json'] });
    useFolderStore.setState({ handle });

    await useFolderStore.getState().deleteProjectFile('PRJ_NEW');

    expect(removed).toEqual(['PRJ_NEW.tnv.json']);
  });

  /**
   * The name goes either way. The project is out of the cache, so a later save
   * must not resurrect it under the name it used to hold.
   */
  it('forgets the filename even when the file could not be removed', async () => {
    const { handle } = folder({ files: ['stuck.tnv.json'], canRemove: false });
    useFolderStore.setState({ handle, projectFilenames: { PRJ_A: 'stuck.tnv.json' } });

    expect(await useFolderStore.getState().deleteProjectFile('PRJ_A')).toBe(false);
    expect(useFolderStore.getState().projectFilenames).toEqual({});
    expect(useFolderStore.getState().lastError).toContain('stuck.tnv.json');
  });

  it('forgets the filename with no folder bound at all', async () => {
    useFolderStore.setState({ handle: null, projectFilenames: { PRJ_A: 'a.tnv.json' } });

    expect(await useFolderStore.getState().deleteProjectFile('PRJ_A')).toBe(false);
    expect(useFolderStore.getState().projectFilenames).toEqual({});
  });

  it('leaves other projects’ filenames alone', async () => {
    const { handle } = folder({ files: ['a.tnv.json', 'b.tnv.json'] });
    useFolderStore.setState({
      handle,
      projectFilenames: { PRJ_A: 'a.tnv.json', PRJ_B: 'b.tnv.json' },
    });

    await useFolderStore.getState().deleteProjectFile('PRJ_A');

    expect(useFolderStore.getState().projectFilenames).toEqual({ PRJ_B: 'b.tnv.json' });
  });
});
