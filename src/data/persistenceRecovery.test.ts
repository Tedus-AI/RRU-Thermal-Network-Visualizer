import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PersistenceCorruptionError,
  discardCorruptCollection,
  getPersistenceRecoveryIssues,
  loadProjects,
} from './persistence';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('persistence recovery mode', () => {
  it('preserves a corrupt blob and requires an explicit recovery action', () => {
    localStorage.setItem('tnv.projects', '{broken-json');

    expect(() => loadProjects()).toThrow(PersistenceCorruptionError);
    expect(localStorage.getItem('tnv.projects')).toBe('{broken-json');
    expect(getPersistenceRecoveryIssues()).toEqual([
      expect.objectContaining({ key: 'tnv.projects', raw: '{broken-json' }),
    ]);

    discardCorruptCollection('tnv.projects');
    expect(loadProjects()).toEqual([]);
    expect(getPersistenceRecoveryIssues()).toEqual([]);
  });
});
