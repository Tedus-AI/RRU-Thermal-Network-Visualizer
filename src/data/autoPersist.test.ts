import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedDemoProject } from '@/mock/seed';
import { DEMO_PROJECT_ID } from '@/mock/demoProject';
import { loadProject, loadScenarios } from './persistence';
import { useProjectStore } from './projectStore';
import { useComponentStore } from './componentStore';
import { useScenarioStore } from './scenarioStore';
import { useSolverStore } from './solverStore';
import { startAutoPersist } from './autoPersist';
import { useSaveStatus } from './saveStatus';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

let stop: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
});

afterEach(() => {
  stop?.();
  stop = null;
  useProjectStore.getState().clear();
  useScenarioStore.getState().clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * "Writing JSON…" is a claim that a write is on its way to disk. The only
 * `markSaveSettled` in the codebase lives inside the folder write, so every
 * path that decides NOT to write used to leave that claim standing forever —
 * which is what a real session hit: the badge went green after a reload, then
 * stuck as soon as a screen change marked a store dirty and the flush found
 * nothing to do.
 */
describe('the save indicator never claims a write that is not coming', () => {
  it('clears when the flush finds the store already written by another path', async () => {
    await seedDemoProject();
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);
    useComponentStore.getState().loadFor(DEMO_PROJECT_ID);

    vi.useFakeTimers();
    stop = startAutoPersist();

    useComponentStore.setState({ dirty: true });
    expect(useSaveStatus.getState().pending).toBe(true);

    // Something else flushed it before the debounce elapsed.
    useComponentStore.setState({ dirty: false });
    await vi.advanceTimersByTimeAsync(600);

    expect(useSaveStatus.getState().pending).toBe(false);
  });

  it('clears when there is no project file to write into', async () => {
    await seedDemoProject();
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);
    useComponentStore.getState().loadFor(DEMO_PROJECT_ID);

    vi.useFakeTimers();
    stop = startAutoPersist();

    useComponentStore.setState({ dirty: true });
    // A project that has never been created has nowhere to write.
    useProjectStore.setState({ isNew: true });
    await vi.advanceTimersByTimeAsync(600);

    expect(useSaveStatus.getState().pending).toBe(false);
  });
});

describe('startAutoPersist', () => {
  it('flushes a dirty store to storage without any Save', async () => {
    await seedDemoProject();
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);
    useComponentStore.getState().loadFor(DEMO_PROJECT_ID);

    vi.useFakeTimers();
    stop = startAutoPersist();

    const save = vi.spyOn(useComponentStore.getState(), 'save');
    useComponentStore.setState({ dirty: true });
    await vi.advanceTimersByTimeAsync(600);

    expect(save).toHaveBeenCalledWith(DEMO_PROJECT_ID);
  });

  it('coalesces a burst of edits into one flush', async () => {
    await seedDemoProject();
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);
    useComponentStore.getState().loadFor(DEMO_PROJECT_ID);

    vi.useFakeTimers();
    stop = startAutoPersist();

    const save = vi.spyOn(useComponentStore.getState(), 'save');
    for (let i = 0; i < 5; i += 1) {
      useComponentStore.setState({ dirty: true, loaded_project_id: DEMO_PROJECT_ID });
    }
    await vi.advanceTimersByTimeAsync(600);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('persists a Screen 01 scenario edit before the screen is reopened', async () => {
    await seedDemoProject();
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);
    useScenarioStore.getState().loadFor(DEMO_PROJECT_ID);

    vi.useFakeTimers();
    stop = startAutoPersist();

    useScenarioStore.getState().updateScenario('SCN_001', { name: '55C 3m/s' });
    await vi.advanceTimersByTimeAsync(600);

    expect(loadScenarios(DEMO_PROJECT_ID).find((scenario) => scenario.id === 'SCN_001')?.name).toBe(
      '55C 3m/s',
    );
  });

  it('flushes a scenario edit when navigation reloads the store before the debounce', async () => {
    await seedDemoProject();
    useScenarioStore.getState().loadFor(DEMO_PROJECT_ID);

    useScenarioStore.getState().updateScenario('SCN_001', { name: 'Immediate navigation' });
    useScenarioStore.getState().loadFor(DEMO_PROJECT_ID);

    expect(useScenarioStore.getState().activeScenario()?.name).toBe('Immediate navigation');
    expect(loadScenarios(DEMO_PROJECT_ID).find((scenario) => scenario.id === 'SCN_001')?.name).toBe(
      'Immediate navigation',
    );
  });

  // A project that was never created has no file to write into.
  it('stays quiet while the project is new', async () => {
    await seedDemoProject();
    useProjectStore.getState().startNewProject();

    vi.useFakeTimers();
    stop = startAutoPersist();

    const save = vi.spyOn(useComponentStore.getState(), 'save');
    useComponentStore.setState({ dirty: true });
    await vi.advanceTimersByTimeAsync(600);

    expect(save).not.toHaveBeenCalled();
  });

  /**
   * The important one. `solverStore`'s DIRTY means a result is stale, not that
   * something needs writing — re-solving is an engineering decision the tool
   * must never take on the user's behalf.
   */
  it('never re-solves in response to solver staleness', async () => {
    await seedDemoProject();
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);

    vi.useFakeTimers();
    stop = startAutoPersist();

    useSolverStore.setState({ state: 'SOLVED' });
    useSolverStore.getState().invalidate('component_power_changed');
    await vi.advanceTimersByTimeAsync(600);

    // Still stale, and still the user's call to re-run.
    expect(useSolverStore.getState().state).toBe('DIRTY');
    expect(useSolverStore.getState().dirtyReasons).toContain('component_power_changed');
  });
});

describe('project auto-commit', () => {
  it('persists an edit to an existing project with no Save', async () => {
    await seedDemoProject();
    useProjectStore.getState().openProject(DEMO_PROJECT_ID);

    useProjectStore.getState().patchProject({ project_name: 'Renamed In Place' });
    await vi.waitFor(
      () => expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Renamed In Place'),
      { timeout: 2000 },
    );
  });

  // Committing per keystroke would leave F.tnv.json, FR.tnv.json … in the folder.
  it('does not persist a project that has never been created', async () => {
    await seedDemoProject();
    useProjectStore.getState().startNewProject();
    useProjectStore.getState().patchProject({ project_id: 'HALF_TY', project_name: 'x' });

    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(loadProject('HALF_TY')).toBeNull();
  });
});
