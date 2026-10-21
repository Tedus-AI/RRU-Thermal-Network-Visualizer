/**
 * Screen 02's staging store: the three steps, the re-read a material change
 * needs, and what applying leaves behind.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultMaterials } from '@/domain/materials';
import type { ImportSourceDescriptor, ParsedTable } from '@/importers/component/types';

import { useComponentImportStore } from './componentImportStore';
import { useComponentStore } from './componentStore';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  });
  useComponentImportStore.getState().cancel();
  useComponentStore.setState({ components: [], loaded_project_id: 'PRJ_T' });
});

const table = (power = '52.13'): ParsedTable => ({
  sourceName: 'test',
  headers: ['Component', 'Category', 'Qty', 'Power(W)', 'Limit(C)', 'R_jc'],
  rows: [
    ['Final PA', 'RF', '4', power, '200', '0.35'],
    ['DDR', 'Digital', '2', '0.5', '95', '1'],
  ],
});

const source = (source_type: ImportSourceDescriptor['source_type']): ImportSourceDescriptor => ({
  source_type,
  source_project_id: source_type === 'AIThermal' ? 'AIT_1' : null,
  source_project_name: null,
  source_file: null,
});

describe('the steps', () => {
  it('a source with its own columns goes straight to checking', () => {
    useComponentImportStore.getState().loadTable(table(), source('AIThermal'));
    const state = useComponentImportStore.getState();
    expect(state.mappingAuto).toBe(true);
    expect(state.step).toBe('review');
  });

  it('a file goes through the column mapping', () => {
    useComponentImportStore.getState().loadTable(table(), source('CSV'));
    const state = useComponentImportStore.getState();
    expect(state.mappingAuto).toBe(false);
    expect(state.step).toBe('mapping');
  });
});

describe('checking', () => {
  it('re-reads the source when the materials change, keeping the row decisions', () => {
    const reparse = vi.fn(() => table('60'));
    const store = useComponentImportStore.getState();
    store.loadTable(table(), source('AIThermal'), { reparse });
    const ddr = useComponentImportStore.getState().rows.find((row) => row.name === 'DDR')!;
    useComponentImportStore.getState().toggleInclude(ddr.row_id, false);

    useComponentImportStore.getState().reparse(defaultMaterials());
    const rows = useComponentImportStore.getState().rows;
    expect(reparse).toHaveBeenCalledOnce();
    expect(rows.find((row) => row.name === 'Final PA')!.power_W).toBe(60);
    expect(rows.find((row) => row.name === 'DDR')!.include).toBe(false);
  });

  it('sets the category of the rows shown', () => {
    useComponentImportStore.getState().loadTable(table(), source('CSV'));
    const ids = useComponentImportStore.getState().rows.map((row) => row.row_id);
    useComponentImportStore.getState().setCategoryFor([ids[1]], 'Power');
    const rows = useComponentImportStore.getState().rows;
    expect(rows.map((row) => row.category)).toEqual(['RF', 'Power']);
  });

  it('applying stays on the check step and links an AI-Thermal import', () => {
    useComponentImportStore.getState().loadTable(table(), source('AIThermal'));
    const result = useComponentImportStore.getState().apply('PRJ_T');
    const state = useComponentImportStore.getState();
    expect(result?.imported).toBe(2);
    expect(state.phase).toBe('applied');
    expect(state.step).toBe('review');
    const components = useComponentStore.getState().components;
    expect(components.map((c) => c.provenance.ai_link?.project_id)).toEqual(['AIT_1', 'AIT_1']);
  });
});
