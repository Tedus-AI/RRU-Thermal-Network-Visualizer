import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIBRARY_FILE_FORMAT, serializeLibrary } from './componentLibraryFile';
import { useComponentLibraryStore, toLibraryEntry, type LibraryEntry } from './componentLibraryStore';
import { createComponent, emptyThermalSpec, type Component } from '@/domain/component';

const LIB_PROJECT = { id: 'PRJ_A', name: 'Project A' };

const PROJECT = { id: 'PRJ_A', name: 'Project A' };

function component(name: string, patch: Partial<Component> = {}): Component {
  return {
    ...createComponent({
      id: `CMP_${name.toUpperCase().replace(/\W+/g, '_')}`,
      name,
      provenance: {
        source_type: 'Manual',
        source_project_id: null,
        source_project_name: null,
        source_file: null,
        imported_at: '2026-01-01T00:00:00.000Z',
      },
    }),
    ...patch,
  };
}

function entry(patch: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'LIB_PA',
    name: 'Final PA',
    source_project_id: 'PRJ_A',
    source_project_name: 'Project A',
    category: 'RF',
    default_power_W: 45,
    thermal_spec: emptyThermalSpec(),
    template_preference: 'BOTTOM_COOL_COIN',
    saved_at: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

const store = () => useComponentLibraryStore.getState();

/** The vitest environment is `node`, so there is no localStorage to borrow. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  useComponentLibraryStore.setState({ entries: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The library could take a component in and hand one back, but nothing could
 * look at what was in it — so a part saved under a typo, or saved twice from two
 * projects, had no way of being found, let alone fixed.
 */
describe('renaming a library entry', () => {
  it('changes the label', () => {
    store().saveComponent(component('Final PA'), PROJECT);
    const [saved] = store().entries;
    store().rename(saved.id, 'Final PA (Rev B)');
    expect(store().entries[0].name).toBe('Final PA (Rev B)');
  });

  /**
   * The id is what `mergeLibraries` matches on. Re-deriving it from the new name
   * would make a rename look like a brand new part to every other copy of the
   * library, and the old one — still in a colleague's file — would come back the
   * next time the two merged.
   */
  it('keeps the id, which is what merging matches on', () => {
    store().saveComponent(component('Final PA'), PROJECT);
    const before = store().entries[0].id;
    store().rename(before, 'Final PA (Rev B)');
    expect(store().entries[0].id).toBe(before);
  });

  it('refuses to blank a name', () => {
    store().saveComponent(component('Final PA'), PROJECT);
    const { id } = store().entries[0];
    store().rename(id, '   ');
    expect(store().entries[0].name).toBe('Final PA');
  });

  // The derived id no longer matches the name, so a re-save has to find the
  // entry some other way or the catalogue forks into two copies of one part.
  it('does not fork the entry when the renamed part is saved again', () => {
    store().saveComponent(component('Final PA'), PROJECT);
    const { id } = store().entries[0];
    store().rename(id, 'Final PA Rev B');

    store().saveComponent(component('Final PA Rev B', { power_W: { value: 52, source: 'Manual' } }), PROJECT);
    expect(store().entries).toHaveLength(1);
    expect(store().entries[0].id).toBe(id);
    expect(store().entries[0].default_power_W).toBe(52);
  });
});

describe('removing an entry', () => {
  it('takes it out of the catalogue', () => {
    store().saveComponent(component('Final PA'), PROJECT);
    store().saveComponent(component('FPGA'), PROJECT);
    store().remove(store().entries.find((e) => e.name === 'FPGA')!.id);
    expect(store().entries.map((e) => e.name)).toEqual(['Final PA']);
  });

  it('survives a reload, because the write is what persists', () => {
    store().saveComponent(component('Final PA'), PROJECT);
    store().remove(store().entries[0].id);
    store().load();
    expect(store().entries).toEqual([]);
  });
});

describe('merging another engineer\'s library file', () => {
  it('reports what it added, replaced and left alone', () => {
    useComponentLibraryStore.setState({
      entries: [
        entry({ id: 'LIB_MINE', name: 'Mine', saved_at: '2026-06-01T00:00:00.000Z' }),
        entry({ id: 'LIB_OLD', name: 'Old', saved_at: '2026-01-01T00:00:00.000Z' }),
      ],
    });

    const result = store().importFile(
      serializeLibrary([
        entry({ id: 'LIB_NEW', name: 'New' }),
        // Older than the copy already held — must not overwrite it.
        entry({ id: 'LIB_MINE', name: 'Mine', default_power_W: 1, saved_at: '2026-02-01T00:00:00.000Z' }),
        entry({ id: 'LIB_OLD', name: 'Old', default_power_W: 99, saved_at: '2026-09-01T00:00:00.000Z' }),
      ]),
    );

    expect(result).toMatchObject({ ok: true, added: 1, updated: 1, kept: 1 });
    const byId = new Map(store().entries.map((e) => [e.id, e]));
    expect(byId.get('LIB_MINE')!.default_power_W).toBe(45);
    expect(byId.get('LIB_OLD')!.default_power_W).toBe(99);
    expect(byId.has('LIB_NEW')).toBe(true);
  });

  // The library shares a folder with project files and whatever else is there,
  // so picking the wrong one has to say so rather than empty the catalogue.
  it('leaves the catalogue alone when the file is not a library', () => {
    useComponentLibraryStore.setState({ entries: [entry()] });
    const result = store().importFile(JSON.stringify({ format: 'tnv.project' }));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(store().entries).toHaveLength(1);
  });
});

describe('exporting', () => {
  it('writes the same file the merge reads', () => {
    useComponentLibraryStore.setState({ entries: [entry()] });
    const text = store().exportText();
    expect(JSON.parse(text).format).toBe(LIBRARY_FILE_FORMAT);

    useComponentLibraryStore.setState({ entries: [] });
    expect(store().importFile(text)).toMatchObject({ ok: true, added: 1 });
    expect(store().entries[0].name).toBe('Final PA');
  });
});

describe('toLibraryEntry', () => {
  // 04 §26 / AC-04-11 — these describe where a part sat in one radio.
  it('carries the thermal spec and nothing project-specific', () => {
    const subject = component('Final PA');
    subject.architecture_prep.preferred_base_zone = 'RF_LEFT';
    subject.architecture_prep.template_preference = 'BOTTOM_COOL_COIN';

    const saved = toLibraryEntry(subject, LIB_PROJECT);
    expect(saved.template_preference).toBe('BOTTOM_COOL_COIN');
    expect(saved).not.toHaveProperty('preferred_base_zone');
    expect(JSON.stringify(saved)).not.toContain('RF_LEFT');
  });
});
