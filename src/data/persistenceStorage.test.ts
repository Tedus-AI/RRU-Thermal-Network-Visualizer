/**
 * The storage engine underneath every loader and saver: per-project keys, the
 * old single-document layout, what happens when the browser refuses a write,
 * transactions, and ids that collide with Object.prototype.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyProject, type Project, type Scenario } from '@/domain/project';

import {
  PersistenceCorruptionError,
  clearProjectData,
  discardCorruptCollection,
  getPersistenceWriteFailure,
  loadComponents,
  loadProject,
  loadProjects,
  loadScenarios,
  loadUnsyncedMarkers,
  markProjectSynced,
  markProjectUnsynced,
  onPersistenceWriteFailure,
  onStorageWrite,
  projectIdExists,
  projectStorageKey,
  saveComponents,
  saveProject,
  saveScenarios,
  withPersistenceTransaction,
} from './persistence';
import type { Component } from '@/domain/component';

class TestStorage {
  map = new Map<string, string>();
  /** When set, every setItem is refused the way a full quota refuses it. */
  full = false;
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

let storage: TestStorage;

beforeEach(() => {
  storage = new TestStorage();
  vi.stubGlobal('localStorage', storage as unknown as Storage);
});

afterEach(() => {
  // Leave nothing held in the overlay for the next test.
  storage.full = false;
  saveProject(project('CLEANUP'));
  vi.unstubAllGlobals();
});

function project(id: string, name = id): Project {
  return { ...createEmptyProject(), project_id: id, project_name: name };
}

function scenario(id: string, projectId: string): Scenario {
  return {
    id,
    project_id: projectId,
    name: id,
    ambient_C: 45,
    wind_mps: 0,
    solar_W_m2: 0,
    power_scale: 1,
    notes: '',
    is_default: true,
  } as Scenario;
}

describe('per-project storage keys', () => {
  it('writes one project without touching another project’s keys', () => {
    saveScenarios('A', [scenario('S1', 'A')]);
    saveScenarios('B', [scenario('S1', 'B')]);
    const before = storage.getItem(projectStorageKey('tnv.scenarios', 'B'));

    saveScenarios('A', [scenario('S1', 'A'), scenario('S2', 'A')]);

    expect(storage.getItem(projectStorageKey('tnv.scenarios', 'B'))).toBe(before);
    expect(loadScenarios('A').map((entry) => entry.id).sort()).toEqual(['S1', 'S2']);
    expect(loadScenarios('B').map((entry) => entry.id)).toEqual(['S1']);
    // The old whole-collection key is not written any more.
    expect(storage.getItem('tnv.scenarios')).toBeNull();
  });

  it('reads the old one-document layout, and splits it on the first write', () => {
    storage.setItem(
      'tnv.components',
      JSON.stringify({ A: [{ id: 'C_A' }], B: [{ id: 'C_B' }] }),
    );
    expect(loadComponents('B').map((component) => component.id)).toEqual(['C_B']);
    // Reading never changes storage.
    expect(storage.getItem('tnv.components')).not.toBeNull();

    saveComponents('A', [{ id: 'C_A2' } as unknown as Component]);

    expect(storage.getItem('tnv.components')).toBeNull();
    expect(loadComponents('A').map((component) => component.id)).toEqual(['C_A2']);
    // B's data moved to its own key untouched.
    expect(loadComponents('B').map((component) => component.id)).toEqual(['C_B']);
  });

  it('clears a project’s data but keeps its index document', () => {
    saveProject(project('A'));
    saveScenarios('A', [scenario('S1', 'A')]);
    clearProjectData('A');

    expect(loadProject('A')).not.toBeNull();
    expect(loadScenarios('A')).toEqual([]);
    expect(storage.getItem(projectStorageKey('tnv.scenarios', 'A'))).toBeNull();
  });
});

describe('when the browser refuses a write', () => {
  it('keeps the value, announces the write, and reports the refusal', () => {
    saveProject(project('A', 'Before'));
    const writes: string[] = [];
    const stopWrites = onStorageWrite((key) => writes.push(key));
    const failures: Array<ReturnType<typeof getPersistenceWriteFailure>> = [];
    const stopFailures = onPersistenceWriteFailure((failure) => failures.push(failure));

    storage.full = true;
    expect(() => saveProject(project('A', 'After'))).not.toThrow();

    // Held in memory and read back as the current value…
    expect(loadProject('A')?.project_name).toBe('After');
    // …announced, so the folder mirror still writes it to disk…
    expect(writes).toContain('tnv.projects');
    // …and reported, so the UI can say the browser cache is full.
    expect(getPersistenceWriteFailure()).toMatchObject({ key: 'tnv.projects', quota: true });
    expect(failures.at(-1)).toMatchObject({ quota: true });

    // Room again: the next write lands, the held value is flushed, the
    // refusal clears.
    storage.full = false;
    saveScenarios('A', [scenario('S1', 'A')]);
    expect(getPersistenceWriteFailure()).toBeNull();
    expect(failures.at(-1)).toBeNull();
    expect(JSON.parse(storage.getItem('tnv.projects')!).A.project_name).toBe('After');

    stopWrites();
    stopFailures();
  });
});

describe('withPersistenceTransaction', () => {
  it('puts every touched key back when the body throws, and announces nothing', () => {
    saveProject(project('A', 'Original'));
    saveScenarios('A', [scenario('S1', 'A')]);
    const writes: string[] = [];
    const stop = onStorageWrite((key) => writes.push(key));

    expect(() =>
      withPersistenceTransaction(() => {
        saveProject(project('A', 'Half written'));
        saveScenarios('A', []);
        saveProject(project('NEW'));
        throw new Error('the import broke halfway');
      }),
    ).toThrow('the import broke halfway');

    expect(loadProject('A')?.project_name).toBe('Original');
    expect(loadScenarios('A').map((entry) => entry.id)).toEqual(['S1']);
    expect(loadProject('NEW')).toBeNull();
    expect(writes).toEqual([]);
    stop();
  });

  it('announces each changed collection once, after it commits', () => {
    const writes: Array<[string, string | undefined]> = [];
    const stop = onStorageWrite((key, projectId) => writes.push([key, projectId]));

    withPersistenceTransaction(() => {
      saveProject(project('A'));
      saveScenarios('A', [scenario('S1', 'A')]);
      saveScenarios('A', [scenario('S2', 'A')]);
      expect(writes).toEqual([]);
    });

    expect(writes).toEqual([
      ['tnv.projects', 'A'],
      ['tnv.scenarios', 'A'],
    ]);
    stop();
  });
});

describe('ids that collide with Object.prototype', () => {
  it('does not mistake inherited names for stored projects', () => {
    expect(projectIdExists('constructor')).toBe(false);
    expect(projectIdExists('toString')).toBe(false);
    expect(loadProject('constructor')).toBeNull();
  });

  it('stores a project and a scenario whose id is __proto__', () => {
    saveProject(project('__proto__', 'Prototype'));
    saveScenarios('__proto__', [scenario('__proto__', '__proto__')]);

    expect(projectIdExists('__proto__')).toBe(true);
    expect(loadProject('__proto__')?.project_name).toBe('Prototype');
    expect(loadProjects().map((entry) => entry.project_id)).toContain('__proto__');
    expect(loadScenarios('__proto__').map((entry) => entry.id)).toEqual(['__proto__']);
    // Nothing leaked onto the real prototype.
    expect(({} as Record<string, unknown>).project_name).toBeUndefined();
  });
});

describe('corrupt values', () => {
  it('refuses to overwrite a slice that read as corrupt until it is discarded', () => {
    const key = projectStorageKey('tnv.scenarios', 'A');
    storage.setItem(key, '{broken');

    expect(() => loadScenarios('A')).toThrow(PersistenceCorruptionError);
    expect(() => saveScenarios('A', [])).toThrow(PersistenceCorruptionError);
    expect(storage.getItem(key)).toBe('{broken');

    discardCorruptCollection(key);
    saveScenarios('A', [scenario('S1', 'A')]);
    expect(loadScenarios('A').map((entry) => entry.id)).toEqual(['S1']);
  });
});

describe('unsynced markers', () => {
  it('only clears when no newer edit arrived during the folder write', () => {
    const first = markProjectUnsynced('A');
    const second = markProjectUnsynced('A');
    expect(second).toBe(first + 1);

    // A mirror that started at `first` raced the second edit: keep the marker.
    markProjectSynced('A', first);
    expect(loadUnsyncedMarkers().A?.version).toBe(second);

    markProjectSynced('A', second);
    expect(loadUnsyncedMarkers().A).toBeUndefined();
  });
});
