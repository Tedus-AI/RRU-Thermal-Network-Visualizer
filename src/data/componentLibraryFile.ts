/**
 * The component library as a portable file.
 *
 * The library used to live only in `localStorage`, which made it the least
 * durable thing in the app: the build stamp clears the whole `tnv.` namespace
 * on every deploy, and binding or re-reading a folder clears it too. A
 * catalogue an engineer spends months building cannot be the one document that
 * disappears when a new version ships.
 *
 * So it gets a file of its own, beside the project files. Deliberately its own
 * file and not part of any project's: exporting one project must not drag a
 * colleague's whole catalogue along with it (see the note in `projectFile.ts`).
 *
 * Merging is by entry id, newest `saved_at` winning. That is what makes the
 * file shareable — drop a colleague's library into the folder and their parts
 * appear next to yours, with the more recently saved version of any part they
 * both have.
 */

import type { LibraryEntry } from './componentLibraryStore';

export const LIBRARY_FILE_FORMAT = 'tnv.component_library';
export const LIBRARY_FILE_VERSION = 1;
export const LIBRARY_FILENAME = 'component-library.tnv.json';

export interface LibraryFile {
  format: typeof LIBRARY_FILE_FORMAT;
  version: number;
  exported_at: string;
  entries: LibraryEntry[];
}

export function serializeLibrary(entries: LibraryEntry[]): string {
  const file: LibraryFile = {
    format: LIBRARY_FILE_FORMAT,
    version: LIBRARY_FILE_VERSION,
    exported_at: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(file, null, 2);
}

export type ParseResult =
  | { ok: true; file: LibraryFile }
  | { ok: false; error: string };

export function parseLibraryFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'not an object' };

  const candidate = raw as Partial<LibraryFile>;
  if (candidate.format !== LIBRARY_FILE_FORMAT) {
    return { ok: false, error: 'not a component library file' };
  }
  if (!Array.isArray(candidate.entries)) return { ok: false, error: 'no entries' };

  // A malformed entry is dropped rather than taking the file down with it: a
  // catalogue that loads 40 of its 41 parts is far better than none.
  const entries = candidate.entries.filter(
    (entry): entry is LibraryEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as LibraryEntry).id === 'string' &&
      typeof (entry as LibraryEntry).name === 'string' &&
      typeof (entry as LibraryEntry).thermal_spec === 'object' &&
      (entry as LibraryEntry).thermal_spec !== null,
  );

  return {
    ok: true,
    file: {
      format: LIBRARY_FILE_FORMAT,
      version: typeof candidate.version === 'number' ? candidate.version : LIBRARY_FILE_VERSION,
      exported_at:
        typeof candidate.exported_at === 'string' ? candidate.exported_at : new Date().toISOString(),
      entries,
    },
  };
}

/** Union by id; for an id in both, the more recently saved entry wins. */
export function mergeLibraries(a: LibraryEntry[], b: LibraryEntry[]): LibraryEntry[] {
  const byId = new Map<string, LibraryEntry>();
  for (const entry of [...a, ...b]) {
    const existing = byId.get(entry.id);
    if (!existing || (entry.saved_at ?? '') > (existing.saved_at ?? '')) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()].sort((x, y) => x.name.localeCompare(y.name));
}
