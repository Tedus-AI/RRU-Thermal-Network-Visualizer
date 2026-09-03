import { describe, expect, it } from 'vitest';

import {
  LIBRARY_FILE_FORMAT,
  mergeLibraries,
  parseLibraryFile,
  serializeLibrary,
} from './componentLibraryFile';
import type { LibraryEntry } from './componentLibraryStore';
import { emptyThermalSpec } from '@/domain/component';

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

describe('the library as a file', () => {
  it('round trips', () => {
    const parsed = parseLibraryFile(serializeLibrary([entry()]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.format).toBe(LIBRARY_FILE_FORMAT);
    expect(parsed.file.entries).toHaveLength(1);
    expect(parsed.file.entries[0].name).toBe('Final PA');
  });

  // The library shares a folder with project files and whatever else is there.
  it('refuses anything that is not a library file', () => {
    expect(parseLibraryFile('nonsense').ok).toBe(false);
    expect(parseLibraryFile('[]').ok).toBe(false);
    expect(parseLibraryFile(JSON.stringify({ format: 'tnv.project' })).ok).toBe(false);
    expect(parseLibraryFile(JSON.stringify({ format: LIBRARY_FILE_FORMAT })).ok).toBe(false);
  });

  /**
   * One bad row must not cost the other forty. A catalogue is built over months
   * and a partial read is far better than an empty one.
   */
  it('drops a malformed entry rather than the whole file', () => {
    const text = JSON.stringify({
      format: LIBRARY_FILE_FORMAT,
      version: 1,
      entries: [entry(), { id: 'LIB_BROKEN' }, null, 'nope'],
    });
    const parsed = parseLibraryFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.entries.map((e) => e.id)).toEqual(['LIB_PA']);
  });
});

describe('mergeLibraries', () => {
  it('unions two catalogues by id', () => {
    const merged = mergeLibraries([entry()], [entry({ id: 'LIB_FPGA', name: 'FPGA' })]);
    expect(merged.map((e) => e.id).sort()).toEqual(['LIB_FPGA', 'LIB_PA']);
  });

  // What makes the file shareable: a colleague's newer version of a part wins.
  it('keeps the more recently saved version of a shared id', () => {
    const merged = mergeLibraries(
      [entry({ default_power_W: 45, saved_at: '2026-01-01T00:00:00.000Z' })],
      [entry({ default_power_W: 52, saved_at: '2026-06-01T00:00:00.000Z' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].default_power_W).toBe(52);
  });

  it('does not let an older copy overwrite a newer one', () => {
    const merged = mergeLibraries(
      [entry({ default_power_W: 52, saved_at: '2026-06-01T00:00:00.000Z' })],
      [entry({ default_power_W: 45, saved_at: '2026-01-01T00:00:00.000Z' })],
    );
    expect(merged[0].default_power_W).toBe(52);
  });

  it('sorts by name so the picker is stable', () => {
    const merged = mergeLibraries(
      [entry({ id: 'LIB_Z', name: 'Zener' }), entry({ id: 'LIB_A', name: 'Amp' })],
      [],
    );
    expect(merged.map((e) => e.name)).toEqual(['Amp', 'Zener']);
  });
});
