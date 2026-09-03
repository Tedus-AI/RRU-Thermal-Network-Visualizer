/**
 * Component Library — 04 §26, AC-04-11.
 *
 * A reusable catalogue of thermal specs that survives across projects.
 *
 * What it deliberately does NOT store: preferred base zone, FloTHERM mapping,
 * graph node ids, solver results and scenario temperatures. All of those are
 * project-specific and would be actively misleading if carried into another
 * radio.
 */

import { create } from 'zustand';
import {
  LIBRARY_FILENAME,
  mergeLibraries,
  parseLibraryFile,
  serializeLibrary,
} from './componentLibraryFile';
import { readTextFile, writeTextFile } from './folderBinding';
import {
  COMPONENT_CATEGORIES,
  emptyArchitecturePrep,
  emptyExternalMappings,
  type Component,
  type ComponentCategory,
  type ThermalSpec,
} from '@/domain/component';

const LIBRARY_KEY = 'tnv.component_library';

/**
 * The project a catalogue entry came from.
 *
 * Entries used to be keyed by part NAME alone, which made the catalogue one
 * row per name across every project that ever existed. Saving an XCZU67DR at
 * 35 W into a project that runs it at 20 W silently replaced the 20 W record —
 * and with it the whole thermal spec, for every future project that pulled the
 * part. Two projects genuinely disagree about a part, and the catalogue has to
 * be able to hold both answers.
 *
 * Entries written before the project was recorded belong to no project, and
 * are gathered under this sentinel rather than being guessed at.
 */
export const UNASSIGNED_LIBRARY_PROJECT = '__unassigned__';
export const UNASSIGNED_LIBRARY_PROJECT_LABEL = 'Unassigned / 未分類';

export interface LibraryEntry {
  id: string;
  name: string;
  /** Which project's answer this is. See `UNASSIGNED_LIBRARY_PROJECT`. */
  source_project_id: string;
  /** Shown as the tree's top level; the id is what identity is built on. */
  source_project_name: string;
  category: ComponentCategory;
  /** Default per-unit power for a new use of this part. */
  default_power_W: number | null;
  thermal_spec: ThermalSpec;
  /** Template preference is a modelling default; base zone is not (04 §26). */
  template_preference: Component['architecture_prep']['template_preference'];
  saved_at: string;
  notes?: string;
}

function read(): LibraryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? migrateEntries(parsed as LibraryEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: LibraryEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
}

/** The catalogue's key: one row per part PER PROJECT. */
export function libraryEntryId(projectId: string, name: string): string {
  const slug = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `LIB_${slug(projectId)}__${slug(name)}`;
}

/**
 * Strips everything that is a project's USE of a part rather than the part —
 * quantity, base zone, FloTHERM mapping (AC-04-11) — while recording which
 * project's answer this is.
 */
export function toLibraryEntry(
  component: Component,
  project: { id: string; name: string },
): LibraryEntry {
  return {
    id: libraryEntryId(project.id, component.name),
    name: component.name,
    source_project_id: project.id,
    source_project_name: project.name,
    category: component.category,
    default_power_W: component.power_W.value,
    thermal_spec: component.thermal_spec,
    template_preference: component.architecture_prep.template_preference,
    saved_at: new Date().toISOString(),
    notes: component.notes,
  };
}

/** Rehydrates a library entry into a project component. */
export function fromLibraryEntry(
  entry: LibraryEntry,
  options: { id: string; qty: number },
): Component {
  return {
    id: options.id,
    name: entry.name,
    category: entry.category,
    enabled: true,
    qty: options.qty,
    power_W: {
      value: entry.default_power_W,
      source: 'Library',
      updated_at: new Date().toISOString(),
    },
    thermal_spec: entry.thermal_spec,
    // Base zone, FloTHERM mapping and profile status are project-specific.
    architecture_prep: {
      ...emptyArchitecturePrep(),
      template_preference: entry.template_preference,
    },
    provenance: {
      source_type: 'Library',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: new Date().toISOString(),
      last_modified_at: new Date().toISOString(),
    },
    external_mappings: emptyExternalMappings(),
  };
}

/**
 * Writes the library to the bound folder, if there is one.
 *
 * Best effort by design: the folder is a mirror, and a browser with no folder
 * bound — or a write that fails — must leave the app working exactly as before.
 * The import is dynamic to keep this module out of the folder store's cycle.
 */
async function mirrorToFolder(entries: LibraryEntry[]): Promise<void> {
  try {
    const { useFolderStore } = await import('./folderStore');
    const handle = useFolderStore.getState().handle;
    if (!handle) return;
    await writeTextFile(handle, LIBRARY_FILENAME, serializeLibrary(entries));
  } catch {
    // localStorage already has the entry; the mirror is a bonus, not the store.
  }
}

/** Reads the folder's library file, if one is there. */
export async function readLibraryFromFolder(): Promise<LibraryEntry[]> {
  try {
    const { useFolderStore } = await import('./folderStore');
    const handle = useFolderStore.getState().handle;
    if (!handle) return [];
    const text = await readTextFile(handle, LIBRARY_FILENAME);
    if (text == null) return [];
    const parsed = parseLibraryFile(text);
    return parsed.ok ? parsed.file.entries : [];
  } catch {
    return [];
  }
}

export interface ImportLibraryResult {
  ok: boolean;
  /** Entries the file had that this library did not. */
  added: number;
  /** Entries that existed here and were replaced by a newer saved copy. */
  updated: number;
  /** Entries the file had that were older than the copy already held. */
  kept: number;
  error?: string;
}

/** Whose answer a save is recording. */
export interface LibraryProject {
  id: string;
  name: string;
}

interface LibraryState {
  entries: LibraryEntry[];
  load: () => void;
  /**
   * Reads localStorage AND the folder file, merging the two. The build stamp
   * clears the `tnv.` namespace on every deploy, so without this the catalogue
   * would silently start over each time a new version shipped.
   */
  loadWithFolder: () => Promise<void>;
  saveComponent: (component: Component, project: LibraryProject) => LibraryEntry;
  /**
   * Files a whole table into the catalogue at once.
   *
   * Returns what it did rather than what it was asked to do, so the caller can
   * report it honestly — the same part twice under one name is one entry, not
   * two, and the count has to say so.
   */
  saveAll: (
    components: Component[],
    project: LibraryProject,
  ) => { saved: number; overwritten: string[] };
  rename: (id: string, name: string) => void;
  setNotes: (id: string, notes: string) => void;
  remove: (id: string) => void;
  /** Merges another library file in, newest saved copy of each part winning. */
  importFile: (text: string) => ImportLibraryResult;
  /** The whole catalogue as the portable file, for handing to someone else. */
  exportText: () => string;
}

/** Same identity rule `saveComponent` uses, so a rename cannot fork an entry. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Brings pre-project entries forward.
 *
 * A catalogue written before entries knew their project cannot be split by
 * guesswork — one row named "XCZU67DR" could have come from any of five
 * projects, and inventing an owner would be a fabrication dressed as data. They
 * are gathered under the Unassigned node instead, where they still work exactly
 * as before and the engineer can see they came from an earlier scheme.
 */
export function migrateEntries(entries: LibraryEntry[]): LibraryEntry[] {
  return entries.map((entry) =>
    entry && typeof entry.source_project_id === 'string' && entry.source_project_id
      ? entry
      : {
          ...entry,
          source_project_id: UNASSIGNED_LIBRARY_PROJECT,
          source_project_name: UNASSIGNED_LIBRARY_PROJECT_LABEL,
        },
  );
}

/** The entry this part would replace, if the catalogue already holds one. */
function existingEntry(
  entries: LibraryEntry[],
  derived: LibraryEntry,
): LibraryEntry | undefined {
  // Scoped to the project: the same name under a DIFFERENT project is a
  // different answer and must not be overwritten. Matching on the name too
  // (within the project) keeps a rename from forking the catalogue, which is
  // why `rename` never re-derives the id.
  return entries.find(
    (e) =>
      e.id === derived.id ||
      (e.source_project_id === derived.source_project_id && sameName(e.name, derived.name)),
  );
}

/**
 * Which of these parts the catalogue already holds.
 *
 * Names them rather than counting them: "3 will be overwritten" tells an
 * engineer nothing about whether the three are the ones they meant. Exported so
 * the confirmation can be shown BEFORE anything is written — an overwrite here
 * replaces a whole thermal spec, and there is no undo.
 */
export function libraryOverwrites(
  entries: LibraryEntry[],
  components: Component[],
  project: { id: string; name: string },
): string[] {
  const names: string[] = [];
  for (const component of components) {
    const hit = existingEntry(entries, toLibraryEntry(component, project));
    if (hit && !names.includes(hit.name)) names.push(hit.name);
  }
  return names;
}

export const useComponentLibraryStore = create<LibraryState>((set, get) => ({
  entries: [],

  load: () => set({ entries: read() }),

  loadWithFolder: async () => {
    const local = read();
    const fromFolder = await readLibraryFromFolder();
    const entries = mergeLibraries(local, fromFolder);
    // Anything the folder knew and this browser did not is now cached locally,
    // so the rest of the app reads one list whether or not a folder is bound.
    if (entries.length !== local.length) write(entries);
    set({ entries });
  },

  saveComponent: (component, project) => {
    const derived = toLibraryEntry(component, project);
    const existing = existingEntry(get().entries, derived);
    const entry = existing ? { ...derived, id: existing.id } : derived;
    const entries = mergeLibraries(
      get().entries.filter((e) => e.id !== entry.id),
      [entry],
    );
    write(entries);
    set({ entries });
    void mirrorToFolder(entries);
    return entry;
  },

  saveAll: (components, project) => {
    const overwritten = libraryOverwrites(get().entries, components, project);
    let entries = get().entries;
    const seen = new Set<string>();
    for (const component of components) {
      const derived = toLibraryEntry(component, project);
      const existing = existingEntry(entries, derived);
      const entry = existing ? { ...derived, id: existing.id } : derived;
      // Two rows of the same part name file as one entry, and the LAST one
      // wins — the same answer `saveComponent` would give run twice.
      seen.add(entry.id);
      entries = mergeLibraries(
        entries.filter((e) => e.id !== entry.id),
        [entry],
      );
    }
    write(entries);
    set({ entries });
    void mirrorToFolder(entries);
    return { saved: seen.size, overwritten };
  },

  /**
   * Renames the label, never the id.
   *
   * The id is what `mergeLibraries` matches on, so re-deriving it from the new
   * name would make a rename look like a brand new part to every other copy of
   * the library — and the old one, still sitting in a colleague's file, would
   * come back the next time the two merged.
   */
  rename: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const entries = get()
      .entries.map((entry) =>
        entry.id === id ? { ...entry, name: trimmed, saved_at: new Date().toISOString() } : entry,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    write(entries);
    set({ entries });
    void mirrorToFolder(entries);
  },

  setNotes: (id, notes) => {
    const entries = get().entries.map((entry) =>
      entry.id === id
        ? { ...entry, notes: notes.trim() || undefined, saved_at: new Date().toISOString() }
        : entry,
    );
    write(entries);
    set({ entries });
    void mirrorToFolder(entries);
  },

  remove: (id) => {
    const entries = get().entries.filter((entry) => entry.id !== id);
    write(entries);
    set({ entries });
    void mirrorToFolder(entries);
  },

  importFile: (text) => {
    const parsed = parseLibraryFile(text);
    if (!parsed.ok) return { ok: false, added: 0, updated: 0, kept: 0, error: parsed.error };

    const before = new Map(get().entries.map((entry) => [entry.id, entry]));
    let added = 0;
    let updated = 0;
    let kept = 0;
    for (const incoming of parsed.file.entries) {
      const existing = before.get(incoming.id);
      if (!existing) added++;
      else if ((incoming.saved_at ?? '') > (existing.saved_at ?? '')) updated++;
      else kept++;
    }

    const entries = mergeLibraries(get().entries, parsed.file.entries);
    write(entries);
    set({ entries });
    void mirrorToFolder(entries);
    return { ok: true, added, updated, kept };
  },

  exportText: () => serializeLibrary(get().entries),
}));

// --- the catalogue as a tree -----------------------------------------------

export interface LibraryTreeCategory {
  category: ComponentCategory;
  entries: LibraryEntry[];
}

export interface LibraryTreeProject {
  projectId: string;
  projectName: string;
  categories: LibraryTreeCategory[];
  count: number;
}

/**
 * Project → category → part.
 *
 * A flat list stopped being readable the moment the catalogue could hold the
 * same part more than once: two rows called XCZU67DR, one at 35 W and one at
 * 20 W, are indistinguishable without saying which project each answers for.
 * The project is therefore the top level, not a column.
 *
 * Unassigned sorts last however it is named — it is where entries written
 * before the project was recorded ended up, and it is the one node the reader
 * is meant to empty rather than browse.
 */
export function libraryTree(entries: LibraryEntry[]): LibraryTreeProject[] {
  const byProject = new Map<string, LibraryEntry[]>();
  for (const entry of entries) {
    const id = entry.source_project_id || UNASSIGNED_LIBRARY_PROJECT;
    const list = byProject.get(id) ?? [];
    list.push(entry);
    byProject.set(id, list);
  }

  const projects: LibraryTreeProject[] = [];
  for (const [projectId, list] of byProject) {
    const byCategory = new Map<ComponentCategory, LibraryEntry[]>();
    for (const entry of list) {
      const bucket = byCategory.get(entry.category) ?? [];
      bucket.push(entry);
      byCategory.set(entry.category, bucket);
    }
    projects.push({
      projectId,
      projectName:
        projectId === UNASSIGNED_LIBRARY_PROJECT
          ? UNASSIGNED_LIBRARY_PROJECT_LABEL
          : (list[0]?.source_project_name || projectId),
      count: list.length,
      // The Screen 04 tab order, so the catalogue reads like the table does.
      categories: COMPONENT_CATEGORIES.filter((category) => byCategory.has(category)).map(
        (category) => ({
          category,
          entries: [...byCategory.get(category)!].sort((a, b) => a.name.localeCompare(b.name)),
        }),
      ),
    });
  }

  return projects.sort((a, b) => {
    if (a.projectId === UNASSIGNED_LIBRARY_PROJECT) return 1;
    if (b.projectId === UNASSIGNED_LIBRARY_PROJECT) return -1;
    return a.projectName.localeCompare(b.projectName);
  });
}
