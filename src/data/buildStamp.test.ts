import { describe, expect, it } from 'vitest';

import {
  BUILD_STAMP_KEY,
  clearOwnedStorage,
  ownedKeys,
  syncBuildStamp,
  type StorageLike,
} from './buildStamp';

/**
 * The vitest environment is `node`, so there is no localStorage to borrow.
 * This stands in for one, including the live-index behaviour of `key(i)` that
 * makes deleting mid-walk unsafe.
 */
function fakeStorage(seed: Record<string, string> = {}): StorageLike & { snapshot(): string[] } {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    snapshot: () => [...map.keys()],
  };
}

const PROJECT_DATA = {
  'tnv.projects': '{"P1":{}}',
  'tnv.components': '{"P1":[]}',
  'tnv.thermal_solutions': '{"P1":[]}',
  'tnv.component_library': '[]',
};

describe('ownedKeys', () => {
  it('collects every tnv key except the stamp', () => {
    const storage = fakeStorage({ ...PROJECT_DATA, [BUILD_STAMP_KEY]: 'abc' });
    expect(ownedKeys(storage).sort()).toEqual(Object.keys(PROJECT_DATA).sort());
  });

  it('ignores keys belonging to other applications', () => {
    const storage = fakeStorage({ ...PROJECT_DATA, 'other.app': 'x', theme: 'dark' });
    expect(ownedKeys(storage)).not.toContain('other.app');
    expect(ownedKeys(storage)).not.toContain('theme');
  });
});

describe('clearOwnedStorage', () => {
  it('removes all owned keys in one pass despite the live index', () => {
    const storage = fakeStorage(PROJECT_DATA);
    const cleared = clearOwnedStorage(storage);
    expect(cleared).toHaveLength(4);
    expect(ownedKeys(storage)).toEqual([]);
  });

  it('leaves foreign keys untouched', () => {
    const storage = fakeStorage({ ...PROJECT_DATA, 'other.app': 'keep' });
    clearOwnedStorage(storage);
    expect(storage.getItem('other.app')).toBe('keep');
  });
});

describe('syncBuildStamp', () => {
  it('keeps data when the build is unchanged', () => {
    const storage = fakeStorage({ ...PROJECT_DATA, [BUILD_STAMP_KEY]: 'build-1' });
    const outcome = syncBuildStamp('build-1', storage);

    expect(outcome).toEqual({ action: 'kept', build_id: 'build-1' });
    expect(storage.getItem('tnv.projects')).toBe('{"P1":{}}');
  });

  it('clears data written by a different build', () => {
    const storage = fakeStorage({ ...PROJECT_DATA, [BUILD_STAMP_KEY]: 'build-1' });
    const outcome = syncBuildStamp('build-2', storage);

    expect(outcome.action).toBe('reset');
    if (outcome.action !== 'reset') throw new Error('unreachable');
    expect(outcome.previous_build_id).toBe('build-1');
    expect(outcome.cleared).toHaveLength(4);
    expect(storage.getItem('tnv.projects')).toBeNull();
  });

  // The case that matters for a browser carrying data from before this check.
  it('treats unstamped data as stale', () => {
    const storage = fakeStorage(PROJECT_DATA);
    const outcome = syncBuildStamp('build-2', storage);

    expect(outcome.action).toBe('reset');
    if (outcome.action !== 'reset') throw new Error('unreachable');
    expect(outcome.previous_build_id).toBeNull();
    expect(ownedKeys(storage)).toEqual([]);
  });

  // A first-time visitor must still reach Screen 01's empty state.
  it('stamps without resetting when storage is empty', () => {
    const storage = fakeStorage();
    const outcome = syncBuildStamp('build-2', storage);

    expect(outcome).toEqual({
      action: 'stamped',
      build_id: 'build-2',
      previous_build_id: null,
    });
  });

  it('records the stamp so the next visit is not treated as stale', () => {
    const storage = fakeStorage(PROJECT_DATA);
    syncBuildStamp('build-2', storage);

    expect(storage.getItem(BUILD_STAMP_KEY)).toBe('build-2');
    expect(syncBuildStamp('build-2', storage).action).toBe('kept');
  });

  it('survives repeated boots on the same build without touching data', () => {
    const storage = fakeStorage(PROJECT_DATA);
    syncBuildStamp('build-2', storage);
    storage.setItem('tnv.projects', '{"P9":{}}');

    expect(syncBuildStamp('build-2', storage).action).toBe('kept');
    expect(syncBuildStamp('build-2', storage).action).toBe('kept');
    expect(storage.getItem('tnv.projects')).toBe('{"P9":{}}');
  });

  it('never clears the stamp along with the data it guards', () => {
    const storage = fakeStorage({ ...PROJECT_DATA, [BUILD_STAMP_KEY]: 'build-1' });
    const outcome = syncBuildStamp('build-2', storage);

    if (outcome.action !== 'reset') throw new Error('unreachable');
    expect(outcome.cleared).not.toContain(BUILD_STAMP_KEY);
  });
});
