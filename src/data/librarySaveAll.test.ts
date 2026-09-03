/**
 * Filing a whole table into the catalogue.
 *
 * The thing worth testing is the WARNING, not the write: an overwrite here
 * replaces a stored thermal spec — Rjc, geometry, heat path, mount, TIM — for
 * every future project that pulls that part, and there is no undo. So the parts
 * that would change have to be named before anything is written, and the rule
 * that decides "already in the catalogue" has to be the same one a single save
 * uses, or the warning and the write would disagree.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent, type Component } from '@/domain/component';
import { withValue } from '@/domain/sourcedValue';

import {
  libraryOverwrites,
  toLibraryEntry,
  useComponentLibraryStore,
  type LibraryEntry,
} from './componentLibraryStore';

const PROJECT = { id: 'PRJ_A', name: 'Project A' };

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

function component(name: string, powerW: number): Component {
  const base = createComponent({
    id: `CMP_${name.replace(/\W+/g, '_')}`,
    name,
    category: 'Digital',
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

describe('saving the whole table to the library', () => {
  it('names nothing when the catalogue is empty', () => {
    expect(libraryOverwrites([], [component('XCZU67DR', 35)], PROJECT)).toEqual([]);
  });

  it('names a part the catalogue already holds', () => {
    const held: LibraryEntry[] = [toLibraryEntry(component('XCZU67DR', 20), PROJECT)];

    expect(libraryOverwrites(held, [component('XCZU67DR', 35), component('Si5518', 2)], PROJECT)).toEqual([
      'XCZU67DR',
    ]);
  });

  /** The same rule `saveComponent` uses, so warning and write cannot disagree. */
  it('matches on the name however it was typed', () => {
    const held: LibraryEntry[] = [toLibraryEntry(component('XCZU67DR', 20), PROJECT)];

    expect(libraryOverwrites(held, [component('  xczu67dr  ', 35)], PROJECT)).toEqual(['XCZU67DR']);
  });

  it('files every part, and reports what it overwrote', () => {
    useComponentLibraryStore.getState().saveAll([component('XCZU67DR', 20)], PROJECT);

    const result = useComponentLibraryStore
      .getState()
      .saveAll([component('XCZU67DR', 35), component('Si5518', 2)], PROJECT);

    expect(result.saved).toBe(2);
    expect(result.overwritten).toEqual(['XCZU67DR']);
    expect(useComponentLibraryStore.getState().entries).toHaveLength(2);
    // The second save is the one that stuck.
    const fpga = useComponentLibraryStore
      .getState()
      .entries.find((entry) => entry.name === 'XCZU67DR');
    expect(fpga?.default_power_W).toBe(35);
  });

  it('counts one entry when the table lists the same name twice', () => {
    // Two rows, one catalogue entry — a count of 2 would be a lie about what
    // the catalogue now holds.
    const result = useComponentLibraryStore
      .getState()
      .saveAll([component('DDR', 1), component('DDR', 2)], PROJECT);

    expect(result.saved).toBe(1);
    expect(useComponentLibraryStore.getState().entries).toHaveLength(1);
  });
});
