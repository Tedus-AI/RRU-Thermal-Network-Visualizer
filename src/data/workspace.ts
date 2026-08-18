/**
 * Workspace — the bound folder is where projects actually live.
 *
 * The browser holds a cache, not the database. On opening a workspace the
 * folder is read and replayed into local storage; from then on the screens read
 * that cache synchronously exactly as before, and every change is written back
 * out. Nothing survives in the browser that is not also on disk, so clearing
 * site data or deploying a new build costs nothing.
 *
 * That inversion is the whole point: the project list is the folder listing. An
 * empty folder is an empty list, and a project only exists once its file does.
 *
 * Why a cache at all, rather than reading the folder directly: 21 modules call
 * `persistence` synchronously, and the File System Access API is async. Keeping
 * the sync cache means the storage layer changes and no screen has to.
 */

import { clearOwnedStorage } from './buildStamp';
import { listProjectFiles, readTextFile, type DirectoryHandle } from './folderBinding';
import { withSyncSuspended } from './syncSuspend';
import { applyProjectFile, parseProjectFile } from './projectFile';

export interface HydrateResult {
  /** Project ids now in the cache, in the order their files were read. */
  projectIds: string[];
  /** Files that were present but could not be used, with the reason. */
  skipped: Array<{ filename: string; reason: string }>;
}

/**
 * Replaces the local cache with what the folder holds.
 *
 * The cache is cleared first: a project whose file was deleted outside the app
 * must disappear here too, and merging would quietly resurrect it.
 *
 * Mirroring is suspended throughout. Replaying a file goes through the same
 * save path that normally triggers a write, so without that the act of opening
 * a workspace would rewrite every file in it.
 */
export async function hydrateFromFolder(handle: DirectoryHandle): Promise<HydrateResult> {
  const entries = await listProjectFiles(handle);
  const projectIds: string[] = [];
  const skipped: Array<{ filename: string; reason: string }> = [];

  await withSyncSuspended(async () => {
    if (typeof localStorage !== 'undefined') clearOwnedStorage(localStorage);

    for (const entry of entries) {
      const text = await readTextFile(handle, entry.filename);
      if (text == null) {
        skipped.push({ filename: entry.filename, reason: 'unreadable' });
        continue;
      }

      const parsed = parseProjectFile(text);
      if (!parsed.ok) {
        // Someone else's JSON in the same folder is not an error worth
        // shouting about — it is simply not one of ours.
        skipped.push({ filename: entry.filename, reason: parsed.error });
        continue;
      }

      applyProjectFile(parsed.file, 'overwrite');
      projectIds.push(parsed.file.project_id);
    }
  });

  return { projectIds, skipped };
}
