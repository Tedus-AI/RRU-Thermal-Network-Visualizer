import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_PROJECT_ID } from '@/mock/demoProject';

import { BUILD_STAMP_KEY } from './buildStamp';

/**
 * Exercises the real boot path — `bootstrapStorage` -> `seedDemoProject` ->
 * `persistence` — against an in-memory localStorage, since the vitest
 * environment is `node`.
 *
 * The module runs its check as an import side effect, so each case re-imports
 * it after `vi.resetModules()` rather than calling the export directly. That is
 * the sequence `main.tsx` actually produces.
 */
class MemoryStorage {
  private map = new Map<string, string>();
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
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

let store: MemoryStorage;

/** Re-runs the module's boot-time side effect. */
async function boot() {
  vi.resetModules();
  return import('./bootstrapStorage');
}

beforeEach(() => {
  store = new MemoryStorage();
  vi.stubGlobal('localStorage', store as unknown as Storage);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bootstrapStorage', () => {
  // The reported symptom: a browser holding data from before this check existed.
  it('clears unstamped data and re-seeds the demo project', async () => {
    store.setItem('tnv.projects', JSON.stringify({ OLD_PROJECT: { project_id: 'OLD_PROJECT' } }));
    store.setItem('tnv.thermal_solutions', JSON.stringify({ OLD_PROJECT: [] }));

    await boot();

    const projects = JSON.parse(store.getItem('tnv.projects') ?? '{}');
    expect(projects.OLD_PROJECT).toBeUndefined();
    expect(projects[DEMO_PROJECT_ID]).toBeDefined();
    expect(store.getItem('tnv.thermal_solutions')).toBeNull();
  });

  it('records the running build id', async () => {
    store.setItem('tnv.projects', JSON.stringify({ OLD: {} }));

    const { BUILD_ID } = await boot();

    expect(store.getItem(BUILD_STAMP_KEY)).toBe(BUILD_ID);
  });

  it('leaves data alone on a second boot of the same build', async () => {
    store.setItem('tnv.projects', JSON.stringify({ OLD: {} }));
    await boot();

    // Stand in for work done after the reset.
    store.setItem('tnv.components', JSON.stringify({ [DEMO_PROJECT_ID]: ['edited'] }));
    await boot();

    expect(JSON.parse(store.getItem('tnv.components') ?? '{}')[DEMO_PROJECT_ID]).toEqual(['edited']);
  });

  // Screen 01's empty state is a specified UI state and must stay reachable.
  it('does not seed a project into an empty browser', async () => {
    await boot();

    expect(store.getItem('tnv.projects')).toBeNull();
    expect(store.getItem(BUILD_STAMP_KEY)).not.toBeNull();
  });

  it('never touches storage owned by another application', async () => {
    store.setItem('tnv.projects', JSON.stringify({ OLD: {} }));
    store.setItem('some.other.app', 'keep me');

    await boot();

    expect(store.getItem('some.other.app')).toBe('keep me');
  });

  it('resetProjectStorage clears and re-seeds on demand', async () => {
    const { resetProjectStorage } = await boot();
    store.setItem('tnv.components', JSON.stringify({ JUNK: [] }));

    vi.stubGlobal('location', { reload: vi.fn() });
    resetProjectStorage();

    const projects = JSON.parse(store.getItem('tnv.projects') ?? '{}');
    expect(projects[DEMO_PROJECT_ID]).toBeDefined();
    expect(JSON.parse(store.getItem('tnv.components') ?? '{}').JUNK).toBeUndefined();
  });
});
