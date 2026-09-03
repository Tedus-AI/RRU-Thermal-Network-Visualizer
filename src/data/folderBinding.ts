/**
 * Local folder binding — File System Access API mechanics.
 *
 * localStorage is the working store: fast, synchronous, and the thing every
 * screen already reads. It is also tied to one browser profile and is cleared
 * whenever a new build is deployed. Binding a folder adds a durable copy on
 * real disk that survives all of that.
 *
 * The folder is the durable source of truth. Screens use localStorage only as
 * a synchronous working cache; each successful save writes the project JSON,
 * and startup hydrates the cache from those files.
 *
 * `showDirectoryPicker` is Chromium-only. Firefox and Safari have no equivalent,
 * which is why the portable route stays the manual project file in
 * `projectFile.ts` rather than this.
 *
 * The directory handle itself is kept in IndexedDB rather than localStorage:
 * handles are structured-cloneable objects, not strings, so JSON storage cannot
 * hold them. A stored handle survives a reload, but the browser may still
 * downgrade its permission to `prompt`, and re-granting needs a user gesture —
 * hence `requestPermission` being separate from `queryPermission` below.
 */

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface DirectoryHandle {
  readonly name: string;
  readonly kind: 'directory';
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  removeEntry?(name: string): Promise<void>;
  values(): AsyncIterableIterator<DirectoryHandle | FileHandle>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export interface FileHandle {
  readonly name: string;
  readonly kind: 'file';
  getFile(): Promise<{ text(): Promise<string>; lastModified: number; size: number }>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
    id?: string;
  }) => Promise<DirectoryHandle>;
};

/** Whether this browser can bind a folder at all. */
export function supportsFolderBinding(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as PickerWindow).showDirectoryPicker === 'function' &&
    typeof indexedDB !== 'undefined'
  );
}

// --- Handle persistence (IndexedDB) ----------------------------------------

const DB_NAME = 'tnv.folder';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'project-folder';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

export async function storeHandle(handle: DirectoryHandle): Promise<void> {
  await tx('readwrite', (store) => store.put(handle, HANDLE_KEY));
}

export async function loadStoredHandle(): Promise<DirectoryHandle | null> {
  if (!supportsFolderBinding()) return null;
  try {
    return (await tx<DirectoryHandle | undefined>('readonly', (store) =>
      store.get(HANDLE_KEY),
    )) ?? null;
  } catch {
    return null;
  }
}

export async function clearStoredHandle(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await tx('readwrite', (store) => store.delete(HANDLE_KEY));
  } catch {
    // Nothing stored is the same outcome as clearing it.
  }
}

// --- Permissions -----------------------------------------------------------

/** What the browser currently allows, without prompting. */
export async function queryPermission(handle: DirectoryHandle): Promise<PermissionState> {
  if (!handle.queryPermission) return 'prompt';
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'prompt';
  }
}

/** Prompts. Must be called from a user gesture or the browser rejects it. */
export async function requestPermission(handle: DirectoryHandle): Promise<PermissionState> {
  if (!handle.requestPermission) return 'denied';
  try {
    return await handle.requestPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

// --- Picking ---------------------------------------------------------------

/** Opens the folder picker. Null when unsupported or dismissed. */
export async function pickFolder(): Promise<DirectoryHandle | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    // `id` makes the browser reopen at the last folder chosen for this purpose.
    return await picker({ mode: 'readwrite', id: 'tnv-project-folder' });
  } catch {
    // Dismissing the picker is a normal outcome, not an error.
    return null;
  }
}

// --- File I/O --------------------------------------------------------------

export async function writeTextFile(
  handle: DirectoryHandle,
  filename: string,
  text: string,
): Promise<void> {
  const file = await handle.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(text);
  } finally {
    // Closing is what actually commits the write; skipping it on the error
    // path would leave a truncated file behind.
    await writable.close();
  }
}

/**
 * Removes one file from the bound folder.
 *
 * Returns false when the browser's handle does not offer `removeEntry` — it is
 * optional in the File System Access API and older engines lack it — so the
 * caller can say the file is still there rather than claim a delete that never
 * happened. A file that is already gone counts as removed.
 */
export async function deleteFile(handle: DirectoryHandle, filename: string): Promise<boolean> {
  if (typeof handle.removeEntry !== 'function') return false;
  try {
    await handle.removeEntry(filename);
    return true;
  } catch {
    // Already gone is the outcome the caller wanted; anything else (a lock, a
    // revoked permission) is reported by re-reading the folder, not guessed at.
    return (await readTextFile(handle, filename)) == null;
  }
}

export interface FolderEntry {
  filename: string;
  size: number;
  modified_at: number;
}

/** Project files in the folder, newest first. */
export async function listProjectFiles(handle: DirectoryHandle): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
    try {
      const file = await (entry as FileHandle).getFile();
      entries.push({
        filename: entry.name,
        size: file.size,
        modified_at: file.lastModified,
      });
    } catch {
      // A file that cannot be read is simply not offered.
    }
  }
  return entries.sort((a, b) => b.modified_at - a.modified_at);
}

export async function readTextFile(
  handle: DirectoryHandle,
  filename: string,
): Promise<string | null> {
  try {
    const file = await handle.getFileHandle(filename);
    return await (await file.getFile()).text();
  } catch {
    return null;
  }
}

/**
 * One stable file per project, so repeated saves overwrite rather than piling
 * up timestamped copies the engineer would have to weed through.
 */
export function mirrorFilename(projectId: string): string {
  const safe = projectId.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'project';
  return `${safe}.tnv.json`;
}
