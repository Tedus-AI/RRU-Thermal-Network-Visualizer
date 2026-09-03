/**
 * One catalogue row per part PER PROJECT.
 *
 * Entries used to be keyed by part NAME alone, so the catalogue held one row
 * per name across every project that had ever existed. Saving an XCZU67DR from
 * a project that runs it at 35 W silently replaced the 20 W record from an
 * earlier project — and not just the wattage: the whole thermal spec, Rjc,
 * geometry, heat path, mount and TIM, for every future project that pulled the
 * part. Two projects genuinely disagree about a part, and the catalogue has to
 * hold both answers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent, type Component } from '@/domain/component';
import { withValue } from '@/domain/sourcedValue';

import {
  libraryOverwrites,
  libraryTree,
  migrateEntries,
  toLibraryEntry,
  UNASSIGNED_LIBRARY_PROJECT,
  UNASSIGNED_LIBRARY_PROJECT_LABEL,
  useComponentLibraryStore,
  type LibraryEntry,
} from './componentLibraryStore';

const ALPHA = { id: 'PRJ_ALPHA', name: 'FR1 RRU starkcore 12L' };
const BETA = { id: 'PRJ_BETA', name: 'FR1 RRU nextgen 8L' };

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  useComponentLibraryStore.setState({ entries: [] });
});

function component(name: string, powerW: number, category = 'Digital' as const): Component {
  const base = createComponent({
    id: `CMP_${name.replace(/\W+/g, '_')}`,
    name,
    category,
    qty: 1,
    power_W: powerW,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-09-03T00:00:00.000Z',
    },
  });
  return { ...base, power_W: withValue(base.power_W, powerW) };
}

describe('the same part in two projects', () => {
  it('keeps both answers instead of overwriting one', () => {
    const library = useComponentLibraryStore.getState();
    library.saveComponent(component('XCZU67DR', 20), ALPHA);
    library.saveComponent(component('XCZU67DR', 35), BETA);

    const entries = useComponentLibraryStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(
      entries.find((e) => e.source_project_id === ALPHA.id)?.default_power_W,
    ).toBe(20);
    expect(entries.find((e) => e.source_project_id === BETA.id)?.default_power_W).toBe(35);
  });

  it('does not warn about a name another project happens to use', () => {
    useComponentLibraryStore.getState().saveComponent(component('XCZU67DR', 20), ALPHA);

    const entries = useComponentLibraryStore.getState().entries;
    expect(libraryOverwrites(entries, [component('XCZU67DR', 35)], BETA)).toEqual([]);
    // …but does warn within the project that already holds it.
    expect(libraryOverwrites(entries, [component('XCZU67DR', 35)], ALPHA)).toEqual([
      'XCZU67DR',
    ]);
  });

  it('still replaces the project’s own earlier answer', () => {
    const library = useComponentLibraryStore.getState();
    library.saveComponent(component('XCZU67DR', 20), ALPHA);
    library.saveComponent(component('XCZU67DR', 35), ALPHA);

    const entries = useComponentLibraryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].default_power_W).toBe(35);
  });
});

describe('entries written before the project was recorded', () => {
  it('are gathered under Unassigned rather than guessed at', () => {
    const legacy = {
      id: 'LIB_XCZU67DR',
      name: 'XCZU67DR',
      category: 'Digital',
      default_power_W: 20,
      saved_at: '2026-08-01T00:00:00.000Z',
    } as unknown as LibraryEntry;

    const [migrated] = migrateEntries([legacy]);

    expect(migrated.source_project_id).toBe(UNASSIGNED_LIBRARY_PROJECT);
    expect(migrated.source_project_name).toBe(UNASSIGNED_LIBRARY_PROJECT_LABEL);
    // Nothing else about the part is touched.
    expect(migrated.default_power_W).toBe(20);
    expect(migrated.id).toBe('LIB_XCZU67DR');
  });

  it('leaves an entry that already names its project alone', () => {
    const entry = toLibraryEntry(component('XCZU67DR', 35), BETA);

    expect(migrateEntries([entry])[0]).toEqual(entry);
  });
});

describe('the catalogue as a tree', () => {
  it('groups project → category → part', () => {
    const library = useComponentLibraryStore.getState();
    library.saveComponent(component('XCZU67DR', 35), BETA);
    library.saveComponent(component('Si5518', 2), BETA);
    library.saveComponent(component('Final PA', 45, 'RF'), BETA);
    library.saveComponent(component('XCZU67DR', 20), ALPHA);

    const tree = libraryTree(useComponentLibraryStore.getState().entries);

    expect(tree.map((p) => p.projectName)).toEqual([BETA.name, ALPHA.name]);
    const beta = tree[0];
    expect(beta.count).toBe(3);
    // Screen 04's tab order, so the catalogue reads like the table.
    expect(beta.categories.map((c) => c.category)).toEqual(['RF', 'Digital']);
    expect(beta.categories[1].entries.map((e) => e.name)).toEqual(['Si5518', 'XCZU67DR']);
  });

  /** It is the node to empty, not to browse, so it never sits at the top. */
  it('sorts Unassigned last', () => {
    const entries = migrateEntries([
      { id: 'LIB_OLD', name: 'Old Part', category: 'RF' } as unknown as LibraryEntry,
      toLibraryEntry(component('XCZU67DR', 35), BETA),
    ]);

    expect(libraryTree(entries).map((p) => p.projectId)).toEqual([
      BETA.id,
      UNASSIGNED_LIBRARY_PROJECT,
    ]);
  });
});
