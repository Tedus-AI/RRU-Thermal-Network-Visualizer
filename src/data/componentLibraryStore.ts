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

interface LibraryState {
  entries: LibraryEntry[];
  load: () => void;
  saveComponent: (component: Component) => LibraryEntry;
  remove: (id: string) => void;
}

export const useComponentLibraryStore = create<LibraryState>((set, get) => ({
  entries: [],

  load: () => set({ entries: read() }),

  saveComponent: (component) => {
    const entry = toLibraryEntry(component);
    const entries = [...get().entries.filter((e) => e.id !== entry.id), entry];
    write(entries);
    set({ entries });
    return entry;
  },

  remove: (id) => {
    const entries = get().entries.filter((entry) => entry.id !== id);
    write(entries);
    set({ entries });
  },
}));
