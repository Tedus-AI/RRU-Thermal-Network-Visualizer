/**
 * A folder of many projects outgrows the browser's quota. Clearing the cache
 * did not help — the next load read every project back — so a refused write
 * now moves other projects' working copies out of localStorage (into memory)
 * and tries again. The header only says "full" when even that is not enough.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBaselineScenario, type Scenario } from '@/domain/project';

import {
  clearWorkingCache,
  getPersistenceWriteFailure,
  loadScenarios,
  markProjectUnsynced,
  parkedCacheEntries,
  projectStorageKey,
  saveScenarios,
  setPreferredCacheProject,
  withPersistenceTransaction,
} from './persistence';

/** A browser-like quota, in characters of key + value. */
class QuotaStorage {
  map = new Map<string, string>();
  constructor(public limit: number) {}
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
    let total = key.length + value.length;
    for (const [k, v] of this.map) if (k !== key) total += k.length + v.length;
    if (total > this.limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/** Text the compressor cannot shrink much, so sizes stay predictable. */
function noise(length: number, seed: number): string {
  let x = seed * 9301 + 49297;
  let out = '';
  for (let i = 0; i < length; i += 1) {
    x = (x * 9301 + 49297) % 233280;
    out += String.fromCharCode(0x4e00 + (x % 2000));
  }
  return out;
}

function bigScenario(projectId: string, seed: number, size = 6_000): Scenario {
  return { ...createBaselineScenario(projectId), notes: noise(size, seed) };
}

const key = (projectId: string) => projectStorageKey('tnv.scenarios', projectId);

let storage: QuotaStorage;

beforeEach(() => {
  storage = new QuotaStorage(20_000);
  vi.stubGlobal('localStorage', storage as unknown as Storage);
  clearWorkingCache();
  setPreferredCacheProject(null);
});

afterEach(() => {
  clearWorkingCache();
  setPreferredCacheProject(null);
  vi.unstubAllGlobals();
});

describe('a cache bigger than the quota', () => {
  it('moves other projects out instead of reporting the browser full', () => {
    saveScenarios('A', [bigScenario('A', 1)]);
    saveScenarios('B', [bigScenario('B', 2)]);
    saveScenarios('C', [bigScenario('C', 3)]);
    saveScenarios('D', [bigScenario('D', 4)]);

    expect(getPersistenceWriteFailure()).toBeNull();
    expect(parkedCacheEntries()).toBeGreaterThan(0);
    // The last one written is in the browser; every one is still readable.
    expect(storage.getItem(key('D'))).not.toBeNull();
    for (const [id, seed] of [['A', 1], ['B', 2], ['C', 3], ['D', 4]] as const) {
      expect(loadScenarios(id)[0].notes).toBe(noise(6_000, seed));
    }
  });

  it('never moves the open project out', () => {
    setPreferredCacheProject('A');
    saveScenarios('A', [bigScenario('A', 1)]);
    saveScenarios('B', [bigScenario('B', 2)]);
    saveScenarios('C', [bigScenario('C', 3)]);
    saveScenarios('D', [bigScenario('D', 4)]);

    expect(storage.getItem(key('A'))).not.toBeNull();
    expect(getPersistenceWriteFailure()).toBeNull();
  });

  it('never moves a project whose edits the folder has not received', () => {
    saveScenarios('A', [bigScenario('A', 1)]);
    markProjectUnsynced('A', 'local');
    saveScenarios('B', [bigScenario('B', 2)]);
    saveScenarios('C', [bigScenario('C', 3)]);
    saveScenarios('D', [bigScenario('D', 4)]);

    // A's cache is the only copy of its newest edits; a reload must find it.
    expect(storage.getItem(key('A'))).not.toBeNull();
  });

  it('still reports the browser full when one project alone does not fit', () => {
    saveScenarios('A', [bigScenario('A', 1)]);
    saveScenarios('B', [bigScenario('B', 2, 40_000)]);

    expect(getPersistenceWriteFailure()).toMatchObject({ quota: true });
    // Held in memory, so nothing is lost.
    expect(loadScenarios('B')[0].notes).toBe(noise(40_000, 2));
  });

  it('a write to a moved-out project puts it back, and a rolled-back one keeps the old value', () => {
    saveScenarios('A', [bigScenario('A', 1)]);
    saveScenarios('B', [bigScenario('B', 2)]);
    saveScenarios('C', [bigScenario('C', 3)]);
    saveScenarios('D', [bigScenario('D', 4)]);
    const moved = ['A', 'B', 'C'].find((id) => storage.getItem(key(id)) == null)!;
    expect(moved).toBeDefined();

    expect(() =>
      withPersistenceTransaction(() => {
        saveScenarios(moved, [bigScenario(moved, 99, 200)]);
        throw new Error('import failed half way');
      }),
    ).toThrow('import failed half way');
    expect(loadScenarios(moved)[0].notes).toBe(
      noise(6_000, { A: 1, B: 2, C: 3 }[moved as 'A' | 'B' | 'C']),
    );

    saveScenarios(moved, [bigScenario(moved, 99, 200)]);
    expect(loadScenarios(moved)[0].notes).toBe(noise(200, 99));
  });

  it('emptying the cache also forgets what was moved out', () => {
    saveScenarios('A', [bigScenario('A', 1)]);
    saveScenarios('B', [bigScenario('B', 2)]);
    saveScenarios('C', [bigScenario('C', 3)]);
    saveScenarios('D', [bigScenario('D', 4)]);
    clearWorkingCache();
    expect(parkedCacheEntries()).toBe(0);
    expect(loadScenarios('A')).toEqual([]);
  });
});
