/**
 * The scenario's 功耗 (01): stored only when it is the room-temperature Pd, and
 * a change to it makes the solve stale like any other physics input.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBaselineScenario, createScenario } from '@/domain/project';
import { powerBasisOf } from '@/domain/powerBasis';

import { loadScenarios, saveScenarios } from './persistence';
import { useScenarioStore } from './scenarioStore';
import { useSolverStore } from './solverStore';

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

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('the power basis on disk', () => {
  it('keeps a room-temperature basis, and reads anything else as the hot default', () => {
    const hot = createBaselineScenario('P');
    // Ids by hand: createScenario stamps the millisecond, the same for all three here.
    const rt = { ...createScenario('P', '常溫 25 °C', { ambient_C: 25, power_basis: 'rt' }), id: 'SCN_RT' };
    const odd = { ...createScenario('P', '舊資料'), id: 'SCN_ODD', power_basis: 'cold' } as unknown as typeof hot;
    saveScenarios('P', [hot, rt, odd]);

    const loaded = loadScenarios('P');
    expect(loaded.map((s) => powerBasisOf(s))).toEqual(['hot', 'rt', 'hot']);
    expect(loaded[0]).not.toHaveProperty('power_basis');
    expect(loaded[2]).not.toHaveProperty('power_basis');
  });

  it('a scenario created from a room-temperature one keeps its basis', () => {
    const rt = createScenario('P', '常溫 25 °C', { power_basis: 'rt' });
    expect(createScenario('P', '複本', rt).power_basis).toBe('rt');
    expect(createScenario('P', '複本', createBaselineScenario('P'))).not.toHaveProperty('power_basis');
  });
});

describe('changing the power basis', () => {
  it('makes a solved result stale, as a scenario change', () => {
    const base = createBaselineScenario('P');
    saveScenarios('P', [base]);
    useScenarioStore.getState().loadFor('P');
    useSolverStore.setState({ state: 'SOLVED', dirtyReasons: [] });

    useScenarioStore.getState().updateScenario(base.id, { power_basis: 'rt' });
    expect(useSolverStore.getState().state).toBe('DIRTY');
    expect(useSolverStore.getState().dirtyReasons).toContain('scenario_changed');
    expect(powerBasisOf(useScenarioStore.getState().scenarios[0])).toBe('rt');
  });
});
