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
  emptyArchitecturePrep,
  emptyExternalMappings,
  type Component,
  type ComponentCategory,
  type ThermalSpec,
} from '@/domain/component';

const LIBRARY_KEY = 'tnv.component_library';

export interface LibraryEntry {
  id: string;
  name: string;
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
    return Array.isArray(parsed) ? (parsed as LibraryEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: LibraryEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
}

/** Strips everything project-specific — the core of AC-04-11. */
export function toLibraryEntry(component: Component): LibraryEntry {
  return {
    id: `LIB_${component.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
    name: component.name,
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

interface LibraryState {
  entries: LibraryEntry[];
  load: () => void;
  /**
   * Reads localStorage AND the folder file, merging the two. The build stamp
   * clears the `tnv.` namespace on every deploy, so without this the catalogue
   * would silently start over each time a new version shipped.
   */
  loadWithFolder: () => Promise<void>;
  saveComponent: (component: Component) => LibraryEntry;
  remove: (id: string) => void;
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

  saveComponent: (component) => {
    const entry = toLibraryEntry(component);
    const entries = mergeLibraries(
      get().entries.filter((e) => e.id !== entry.id),
      [entry],
    );
    write(entries);
    set({ entries });
    void mirrorToFolder(entries);
    return entry;
  },

  remove: (id) => {
    const entries = get().entries.filter((entry) => entry.id !== id);
    write(entries);
    set({ entries });
    void mirrorToFolder(entries);
  },
}));
