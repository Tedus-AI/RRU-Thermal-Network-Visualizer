/**
 * Staging store for Screen 02 — 02 §8.
 *
 * Holds the entire import session in isolation. Nothing here writes to
 * componentStore until `applyImport()` is called, and Cancel drops it all.
 */

import { normalizeMaterials, type MaterialDefaults } from '@/domain/materials';
import { loadProject } from './persistence';
import { create } from 'zustand';
import type { Component, ComponentCategory } from '@/domain/component';
import { buildStagingRows, revalidateRow } from '@/importers/component/buildStagingRows';
import { autoMapColumns } from '@/importers/component/autoMapColumns';
import { applyImport } from '@/importers/component/applyImport';
import { projectImpact, summarizeImport } from '@/importers/component/summarize';
import {
  IGNORE_COLUMN,
  REQUIRED_FIELDS,
  type ApplyResult,
  type DuplicatePolicy,
  type ImportSourceDescriptor,
  type MappingTarget,
  type ParsedTable,
  type StagingRow,
} from '@/importers/component/types';
import type { AiThermalTimNeed } from '@/importers/component/parseAiThermal';
import { useComponentStore } from './componentStore';
import { useSolverStore } from './solverStore';
import { useNetworkStore } from './networkStore';
import { useProjectStore } from './projectStore';

/**
 * Three steps: pick a source, settle the columns, check and apply. Duplicate
 * handling lives on the check step (it only appears when there are duplicates),
 * and applying is an action rather than a step of its own.
 */
export type ImportStep = 'source' | 'mapping' | 'review';
export type ImportPhase = 'idle' | 'loading' | 'ready' | 'error' | 'applied';

/** Sources whose columns are this tool's own, so the mapping is always complete. */
const SELF_MAPPED_SOURCES = new Set<ImportSourceDescriptor['source_type']>(['AIThermal', 'ExistingProject']);

/**
 * What a source can do after it has been read, beyond the table itself.
 *
 * `reparse` rebuilds the table against the project's materials as they are now:
 * an AI-Thermal TIM is matched by name and its bond line is only stated where it
 * differs from the material's, so a material changed after loading (from the
 * 5G-RRU offer, or typed into the materials card) has to be read again — a part
 * that inherited 0.5 mm would otherwise silently inherit the new value.
 */
export interface ImportSourceContext {
  /** The AI-Thermal project document, for its 5G-RRU parameter console. */
  aiThermalProject?: Record<string, unknown>;
  reparse?: (materials: MaterialDefaults) => ParsedTable;
  /** AI-Thermal TIM models the rows use that these materials do not have (`missingAiThermalTims`). */
  missingTims?: (materials: MaterialDefaults) => AiThermalTimNeed[];
}

interface ImportState {
  step: ImportStep;
  phase: ImportPhase;
  error: string | null;
  loadingMessage: string | null;

  source: ImportSourceDescriptor | null;
  sourceContext: ImportSourceContext | null;
  table: ParsedTable | null;
  mapping: MappingTarget[];
  /** The mapping was complete on its own, so the mapping step was passed over. */
  mappingAuto: boolean;
  rows: StagingRow[];
  sessionPolicy: DuplicatePolicy;
  applyResult: ApplyResult | null;

  // Review filters (02 §18)
  search: string;
  categoryFilter: ComponentCategory | 'ALL';
  statusFilter: StagingRow['status'] | 'ALL';
  includedOnly: boolean;

  loadTable: (table: ParsedTable, source: ImportSourceDescriptor, context?: ImportSourceContext) => void;
  /** Re-read the source against the project's current materials (see ImportSourceContext). */
  reparse: (materials: MaterialDefaults) => void;
  setLoading: (message: string) => void;
  setError: (message: string) => void;
  setStep: (step: ImportStep) => void;

  setMappingFor: (columnIndex: number, target: MappingTarget) => void;
  autoMap: () => void;
  clearMapping: () => void;
  rebuildRows: () => void;

  editRow: (rowId: string, patch: Partial<StagingRow>) => void;
  toggleInclude: (rowId: string, include: boolean) => void;
  setRowDuplicateAction: (rowId: string, action: DuplicatePolicy | null) => void;
  setSessionPolicy: (policy: DuplicatePolicy) => void;

  includeAllValid: () => void;
  excludeErrors: () => void;
  setCategoryForAll: (category: ComponentCategory) => void;
  setCategoryFor: (rowIds: string[], category: ComponentCategory) => void;

  setSearch: (value: string) => void;
  setCategoryFilter: (value: ComponentCategory | 'ALL') => void;
  setStatusFilter: (value: StagingRow['status'] | 'ALL') => void;
  setIncludedOnly: (value: boolean) => void;
  resetFilters: () => void;

  apply: (projectId: string) => ApplyResult | null;
  cancel: () => void;

  visibleRows: () => StagingRow[];
  summary: () => ReturnType<typeof summarizeImport>;
  impact: () => ReturnType<typeof projectImpact>;
  unmappedRequired: () => string[];
  canApply: () => boolean;
}

const EMPTY = {
  step: 'source' as ImportStep,
  phase: 'idle' as ImportPhase,
  error: null,
  loadingMessage: null,
  source: null,
  sourceContext: null,
  table: null,
  mapping: [] as MappingTarget[],
  mappingAuto: false,
  rows: [] as StagingRow[],
  sessionPolicy: 'MERGE_NON_EMPTY' as DuplicatePolicy,
  applyResult: null,
  search: '',
  categoryFilter: 'ALL' as const,
  statusFilter: 'ALL' as const,
  includedOnly: false,
};

function existingComponents(): Component[] {
  return useComponentStore.getState().components;
}

/** The open project's TIM names, lower-cased — what a row's TIM is matched against at apply. */
function timNames(): ReadonlySet<string> {
  const materials = normalizeMaterials(useProjectStore.getState().draft?.materials);
  return new Set(materials.tim.map((material) => material.name.trim().toLowerCase()));
}

export const useComponentImportStore = create<ImportState>((set, get) => ({
  ...EMPTY,

  setLoading: (message) =>
    set({ phase: 'loading', loadingMessage: message, error: null, table: null, rows: [] }),

  setError: (message) =>
    // Switching source must not leave the previous preview on screen (02 §26).
    set({ phase: 'error', error: message, loadingMessage: null, table: null, rows: [] }),

  setStep: (step) => set({ step }),

  loadTable: (table, source, context) => {
    const mapping = autoMapColumns(table.headers);
    const rows = buildStagingRows({ table, mapping, existingComponents: existingComponents(), timNames: timNames() });
    const mappingAuto =
      SELF_MAPPED_SOURCES.has(source.source_type) && REQUIRED_FIELDS.every((field) => mapping.includes(field));
    set({
      table,
      source,
      sourceContext: context ?? null,
      mapping,
      mappingAuto,
      rows,
      phase: 'ready',
      error: null,
      loadingMessage: null,
      applyResult: null,
      step: mappingAuto ? 'review' : 'mapping',
    });
  },

  reparse: (materials) => {
    const { sourceContext, table, phase } = get();
    if (!table || phase !== 'ready') return;
    // Without a re-reader the cells stay, but whether each TIM is in 01 moved.
    if (!sourceContext?.reparse) {
      get().rebuildRows();
      return;
    }
    const next = sourceContext.reparse(materials);
    // Same source, same columns: the mapping and the row decisions carry over.
    if (next.headers.join('\u0000') !== table.headers.join('\u0000')) return;
    set({ table: next });
    get().rebuildRows();
  },

  setMappingFor: (columnIndex, target) => {
    const mapping = [...get().mapping];
    // A canonical field can only be claimed by one column.
    if (target !== IGNORE_COLUMN) {
      mapping.forEach((existing, index) => {
        if (existing === target && index !== columnIndex) mapping[index] = IGNORE_COLUMN;
      });
    }
    mapping[columnIndex] = target;
    set({ mapping });
    get().rebuildRows();
  },

  autoMap: () => {
    const table = get().table;
    if (!table) return;
    set({ mapping: autoMapColumns(table.headers) });
    get().rebuildRows();
  },

  clearMapping: () => {
    const table = get().table;
    if (!table) return;
    set({ mapping: table.headers.map(() => IGNORE_COLUMN) });
    get().rebuildRows();
  },

  rebuildRows: () => {
    const { table, mapping, rows: previous } = get();
    if (!table) return;
    const rebuilt = buildStagingRows({ table, mapping, existingComponents: existingComponents(), timNames: timNames() });
    // Preserve the user's include / duplicate choices across a remap.
    const decisions = new Map(previous.map((row) => [row.row_id, row]));
    set({
      rows: rebuilt.map((row) => {
        const prior = decisions.get(row.row_id);
        if (!prior) return row;
        return revalidateRow(
          { ...row, include: prior.include, duplicate_action: prior.duplicate_action },
          existingComponents(),
          mapping,
          timNames(),
        );
      }),
    });
  },

  editRow: (rowId, patch) => {
    const { rows, mapping } = get();
    set({
      rows: rows.map((row) =>
        row.row_id === rowId
          ? revalidateRow({ ...row, ...patch }, existingComponents(), mapping, timNames())
          : row,
      ),
    });
  },

  toggleInclude: (rowId, include) => get().editRow(rowId, { include }),

  setRowDuplicateAction: (rowId, action) => {
    set({
      rows: get().rows.map((row) =>
        row.row_id === rowId ? { ...row, duplicate_action: action } : row,
      ),
    });
  },

  setSessionPolicy: (sessionPolicy) => set({ sessionPolicy }),

  includeAllValid: () => {
    const { rows, mapping } = get();
    set({
      rows: rows.map((row) =>
        row.status === 'ERROR'
          ? row
          : revalidateRow({ ...row, include: true }, existingComponents(), mapping, timNames()),
      ),
    });
  },

  excludeErrors: () => {
    const { rows, mapping } = get();
    set({
      rows: rows.map((row) =>
        row.status === 'ERROR'
          ? revalidateRow({ ...row, include: false }, existingComponents(), mapping, timNames())
          : row,
      ),
    });
  },

  setCategoryForAll: (category) => {
    const { rows, mapping } = get();
    set({
      rows: rows.map((row) =>
        revalidateRow({ ...row, category }, existingComponents(), mapping, timNames()),
      ),
    });
  },

  setCategoryFor: (rowIds, category) => {
    const { rows, mapping } = get();
    const ids = new Set(rowIds);
    set({
      rows: rows.map((row) =>
        ids.has(row.row_id) ? revalidateRow({ ...row, category }, existingComponents(), mapping, timNames()) : row,
      ),
    });
  },

  setSearch: (search) => set({ search }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setIncludedOnly: (includedOnly) => set({ includedOnly }),
  resetFilters: () =>
    set({ search: '', categoryFilter: 'ALL', statusFilter: 'ALL', includedOnly: false }),

  apply: (projectId) => {
    const { rows, sessionPolicy, source } = get();
    if (!source) return null;

    const { components, result } = applyImport({
      existing: existingComponents(),
      rows,
      sessionPolicy,
      source,
      // An imported TIM name is matched against THIS project's library.
      materials: normalizeMaterials(loadProject(projectId)?.materials),
    });

    useComponentStore.getState().setComponents(projectId, components);

    // 02 §24 — imported data never builds topology, but it can invalidate a solve
    // and it always requires the network to be reviewed before solving again.
    if (result.invalidated_solver) {
      useSolverStore.getState().invalidate('component_power_changed');
    }
    if (result.requires_network_review) {
      useNetworkStore.getState().setRequiresReview(true, 'component_import_applied');
    }

    set({ applyResult: result, phase: 'applied' });
    return result;
  },

  cancel: () => set({ ...EMPTY }),

  visibleRows: () => {
    const { rows, search, categoryFilter, statusFilter, includedOnly } = get();
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (includedOnly && !row.include) return false;
      if (categoryFilter !== 'ALL' && (row.category ?? 'Other') !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  },

  summary: () => summarizeImport(get().rows),
  impact: () => projectImpact(get().rows, existingComponents(), get().sessionPolicy),

  unmappedRequired: () => {
    const mapping = get().mapping;
    return REQUIRED_FIELDS.filter((field) => !mapping.includes(field));
  },

  canApply: () => {
    const { rows, phase } = get();
    if (phase !== 'ready') return false;
    if (get().unmappedRequired().length > 0) return false;
    return rows.some((row) => row.include && row.status !== 'ERROR');
  },
}));
