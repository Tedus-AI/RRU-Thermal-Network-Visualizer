/**
 * Staging store for Screen 02 — 02 §8.
 *
 * Holds the entire import session in isolation. Nothing here writes to
 * componentStore until `applyImport()` is called, and Cancel drops it all.
 */

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
import { useComponentStore } from './componentStore';
import { useSolverStore } from './solverStore';
import { useNetworkStore } from './networkStore';

export type ImportStep = 'source' | 'mapping' | 'validate' | 'duplicates' | 'apply';
export type ImportPhase = 'idle' | 'loading' | 'ready' | 'error' | 'applied';

interface ImportState {
  step: ImportStep;
  phase: ImportPhase;
  error: string | null;
  loadingMessage: string | null;

  source: ImportSourceDescriptor | null;
  table: ParsedTable | null;
  mapping: MappingTarget[];
  rows: StagingRow[];
  sessionPolicy: DuplicatePolicy;
  applyResult: ApplyResult | null;

  // Review filters (02 §18)
  search: string;
  categoryFilter: ComponentCategory | 'ALL';
  statusFilter: StagingRow['status'] | 'ALL';
  includedOnly: boolean;

  loadTable: (table: ParsedTable, source: ImportSourceDescriptor) => void;
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
  table: null,
  mapping: [] as MappingTarget[],
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

export const useComponentImportStore = create<ImportState>((set, get) => ({
  ...EMPTY,

  setLoading: (message) =>
    set({ phase: 'loading', loadingMessage: message, error: null, table: null, rows: [] }),

  setError: (message) =>
    // Switching source must not leave the previous preview on screen (02 §26).
    set({ phase: 'error', error: message, loadingMessage: null, table: null, rows: [] }),

  setStep: (step) => set({ step }),

  loadTable: (table, source) => {
    const mapping = autoMapColumns(table.headers);
    const rows = buildStagingRows({ table, mapping, existingComponents: existingComponents() });
    set({
      table,
      source,
      mapping,
      rows,
      phase: 'ready',
      error: null,
      loadingMessage: null,
      applyResult: null,
      step: 'mapping',
    });
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
    const rebuilt = buildStagingRows({ table, mapping, existingComponents: existingComponents() });
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
        );
      }),
    });
  },

  editRow: (rowId, patch) => {
    const { rows, mapping } = get();
    set({
      rows: rows.map((row) =>
        row.row_id === rowId
          ? revalidateRow({ ...row, ...patch }, existingComponents(), mapping)
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
          : revalidateRow({ ...row, include: true }, existingComponents(), mapping),
      ),
    });
  },

  excludeErrors: () => {
    const { rows, mapping } = get();
    set({
      rows: rows.map((row) =>
        row.status === 'ERROR'
          ? revalidateRow({ ...row, include: false }, existingComponents(), mapping)
          : row,
      ),
    });
  },

  setCategoryForAll: (category) => {
    const { rows, mapping } = get();
    set({
      rows: rows.map((row) =>
        revalidateRow({ ...row, category }, existingComponents(), mapping),
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

    set({ applyResult: result, phase: 'applied', step: 'apply' });
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
