/**
 * The Export Center's store across project and scenario switches.
 *
 * Settings are per project and survive a visit; a run's results do not survive
 * a scenario switch; nothing at all survives a project switch except what the
 * new project itself remembers. The project switch used to be detected only
 * through the scenario id, so two projects that both open on SCN_001 looked
 * like the same one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileSystemDirectoryHandleLike } from '@/export/download';
import { saveExportPreferences, type ExportPreferences } from '@/data/persistence';

import { useExportStore, type QueueEntry } from './exportStore';

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
    this.data.set(key, value);
  }
}

const folder = (name: string) => ({ name }) as unknown as FileSystemDirectoryHandleLike;

const queued = (filename: string): QueueEntry => ({
  type: 'pdf_report',
  filename,
  status: 'EXPORTED',
  object_url: `blob:${filename}`,
});

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  useExportStore.getState().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Project A, set up the way an engineer leaves it after one export. */
function leaveProjectA() {
  const store = useExportStore.getState();
  store.loadFor('PRJ_A', 'SCN_001', 'A_base');
  store.setConfig({ base_filename: 'A_custom' });
  store.setSelected(['pdf_report', 'png_snapshots']);
  store.setDirectory(folder('A-Reports'));
  store.setSnapshotSelection({ modes: { whole: ['rth'] }, instances: {} });
  useExportStore.setState({
    queue: [queued('A_report.pdf')],
    history: [
      {
        ...queued('A_report.pdf'),
      } as unknown as ReturnType<typeof useExportStore.getState>['history'][number],
    ],
  });
}

describe('switching to another project that opens on the same scenario id', () => {
  it('does not export into the previous project\'s folder', () => {
    leaveProjectA();
    saveExportPreferences('PRJ_B', {
      config: { base_filename: 'B_custom' },
      selected: ['pdf_report'],
      output_folder_name: 'B-Reports',
    });

    useExportStore.getState().loadFor('PRJ_B', 'SCN_001', 'B_base');
    const state = useExportStore.getState();

    // The panel names B's folder and the handle must agree with it: B's folder
    // has to be granted again, A's is not silently reused under B's name.
    expect(state.directoryName).toBe('B-Reports');
    expect(state.directory).toBeNull();
  });

  it('starts B without A\'s queue, history or file names', () => {
    leaveProjectA();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    useExportStore.getState().loadFor('PRJ_B', 'SCN_001', 'B_base');
    const state = useExportStore.getState();

    expect(state.queue).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.config.base_filename).toBe('B_base');
    expect(state.selected).toEqual([]);
    expect(state.directoryName).toBeNull();
    expect(state.snapshotSelection).toEqual({ modes: { whole: ['temperature_delta'] }, instances: {} });
    expect(state.preferencesRestored).toBe(false);
    // A's blobs are released rather than held by nothing.
    expect(revoke).toHaveBeenCalledWith('blob:A_report.pdf');
  });

  it('gives A its own settings back on return, folder name included', () => {
    leaveProjectA();
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    useExportStore.getState().loadFor('PRJ_B', 'SCN_001', 'B_base');
    useExportStore.getState().loadFor('PRJ_A', 'SCN_001', 'A_base');
    const state = useExportStore.getState();

    expect(state.config.base_filename).toBe('A_custom');
    expect(state.selected).toEqual(['pdf_report', 'png_snapshots']);
    expect(state.directoryName).toBe('A-Reports');
    expect(state.directory).toBeNull();
    expect(state.snapshotSelection).toEqual({ modes: { whole: ['rth'] }, instances: {} });
  });
});

describe('staying in one project', () => {
  it('keeps the granted folder across a scenario switch and a revisit', () => {
    leaveProjectA();
    useExportStore.getState().loadFor('PRJ_A', 'SCN_002', 'A_base');
    expect(useExportStore.getState().directory?.name).toBe('A-Reports');
    // The run is per scenario; the log of what this tab did is not.
    expect(useExportStore.getState().queue).toEqual([]);
    expect(useExportStore.getState().history).toHaveLength(1);

    useExportStore.getState().loadFor('PRJ_A', 'SCN_002', 'A_base');
    expect(useExportStore.getState().directory?.name).toBe('A-Reports');
  });
});

describe('remembered preferences that a person could have edited', () => {
  const load = (prefs: unknown) => {
    saveExportPreferences('PRJ_X', prefs as ExportPreferences);
    useExportStore.getState().loadFor('PRJ_X', 'SCN_001', 'X_base');
    return useExportStore.getState();
  };

  it('drops artifact ids this build no longer produces, and repeats', () => {
    // `temperature_csv` was one of the five data files removed in an earlier
    // round; `artifactDefinition` throws on it.
    const state = load({
      config: {},
      selected: ['temperature_csv', 'pdf_report', 'pdf_report', 'package_zip'],
    });
    expect(state.selected).toEqual(['pdf_report', 'package_zip']);
  });

  it('survives a selection that is not a list', () => {
    expect(load({ config: {}, selected: 'pdf_report' }).selected).toEqual([]);
  });

  it('takes each setting only when it is a value the setting can hold', () => {
    const state = load({
      config: {
        base_filename: 42,
        png_scale: '8x',
        destination: 'ftp',
        checksum: false,
        timestamp: 'yes',
        precision: 3,
      },
      selected: [],
    });
    expect(state.config).toEqual({
      base_filename: 'X_base',
      include_project_id: true,
      include_scenario_id: true,
      timestamp: true,
      zip_compression: true,
      png_scale: '2x',
      destination: 'browser_download',
      checksum: false,
    });
  });

  it('ignores a preference block that is not one', () => {
    for (const bad of [[], 'x', { config: [] }, { config: 'x' }]) {
      useExportStore.getState().clear();
      expect(load(bad).preferencesRestored, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('a run that does not end where it started', () => {
  const session = (id: string) =>
    ({ id, status: 'RUNNING' }) as unknown as Parameters<
      ReturnType<typeof useExportStore.getState>['beginSession']
    >[0];

  it('does not land its results in another project\'s queue', () => {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const store = useExportStore.getState();
    store.loadFor('PRJ_A', 'SCN_001', 'A_base');
    store.beginSession(session('run-A'), [{ type: 'pdf_report', filename: 'A.pdf', status: 'READY' }]);

    // The engineer moves to B while A's run is still going.
    useExportStore.getState().loadFor('PRJ_B', 'SCN_001', 'B_base');
    useExportStore.getState().finishSession({
      session_id: 'run-A',
      project_id: 'PRJ_A',
      results: [],
      queue: [queued('A.pdf')],
      status: 'COMPLETE',
    });

    expect(useExportStore.getState().queue).toEqual([]);
    expect(useExportStore.getState().history).toEqual([]);
  });

  it('ends a run that threw, instead of leaving the screen on "exporting"', () => {
    const store = useExportStore.getState();
    store.loadFor('PRJ_A', 'SCN_001', 'A_base');
    store.beginSession(session('run-A'), [
      { type: 'pdf_report', filename: 'A.pdf', status: 'READY' },
      { type: 'png_snapshots', filename: 'A.png', status: 'EXPORTED' },
    ]);
    expect(useExportStore.getState().exporting).toBe(true);

    useExportStore.getState().abortSession('run-A', 'boom');
    const state = useExportStore.getState();
    expect(state.exporting).toBe(false);
    expect(state.session?.status).toBe('FAILED');
    expect(state.queue.map((entry) => [entry.status, entry.error])).toEqual([
      ['FAILED', 'boom'],
      ['EXPORTED', undefined],
    ]);
  });

  it('leaves a different run alone', () => {
    const store = useExportStore.getState();
    store.loadFor('PRJ_A', 'SCN_001', 'A_base');
    store.beginSession(session('run-2'), []);
    useExportStore.getState().abortSession('run-1', 'late');
    expect(useExportStore.getState().exporting).toBe(true);
  });
});
