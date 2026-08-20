import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedDemoProject } from '@/mock/seed';
import { DEMO_PROJECT_ID } from '@/mock/demoProject';
import {
  loadComponents,
  loadProject,
  loadScenarios,
  loadSolutions,
  saveProject,
} from './persistence';
import { createEmptyProject } from '@/domain/project';
import { coinAreaMm2 } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';
import {
  PROJECT_FILE_FORMAT,
  PROJECT_FILE_VERSION,
  applyProjectFile,
  availableProjectId,
  collectProject,
  parseProjectFile,
  projectFilename,
  serializeProjectFile,
} from './projectFile';

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

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('collectProject', () => {
  it('returns null for a project that is not in storage', () => {
    expect(collectProject('NOPE', 'test')).toBeNull();
  });

  it('captures the Golden Demo in full', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test-build');

    expect(file).not.toBeNull();
    expect(file?.format).toBe(PROJECT_FILE_FORMAT);
    expect(file?.format_version).toBe(PROJECT_FILE_VERSION);
    expect(file?.app_build).toBe('test-build');
    expect(file?.data.components.length).toBeGreaterThan(0);
    expect(file?.data.scenarios.length).toBeGreaterThan(0);
    expect(file?.data.network).not.toBeNull();
    expect(file?.data.solutions.length).toBeGreaterThan(0);
  });
});

describe('parseProjectFile', () => {
  it('rejects text that is not JSON', () => {
    const result = parseProjectFile('{not json');
    expect(result.ok).toBe(false);
  });

  it('rejects JSON that is not a project file', () => {
    const result = parseProjectFile(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toContain('Not a Thermal Network Visualizer project file');
  });

  it('rejects a format version newer than this build reads', () => {
    const result = parseProjectFile(
      JSON.stringify({
        format: PROJECT_FILE_FORMAT,
        format_version: PROJECT_FILE_VERSION + 1,
        project_id: 'X',
        data: { project: {} },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toContain('newer format');
  });

  it('rejects a file with no project record', () => {
    const result = parseProjectFile(
      JSON.stringify({
        format: PROJECT_FILE_FORMAT,
        format_version: PROJECT_FILE_VERSION,
        project_id: 'X',
        data: {},
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('summarises a real file and reports the id collision', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test-build')!;
    const result = parseProjectFile(serializeProjectFile(file));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.summary.project_id).toBe(DEMO_PROJECT_ID);
    expect(result.summary.components).toBeGreaterThan(0);
    expect(result.summary.nodes).toBeGreaterThan(0);
    // The demo is still in storage, so importing it back would collide.
    expect(result.summary.collides).toBe(true);
  });
});

describe('applyProjectFile', () => {
  it('round-trips a project into an empty store', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test-build')!;
    const componentsBefore = loadComponents(DEMO_PROJECT_ID).length;
    const solutionsBefore = loadSolutions(DEMO_PROJECT_ID).length;

    localStorage.clear();
    expect(loadProject(DEMO_PROJECT_ID)).toBeNull();

    const outcome = applyProjectFile(file, 'overwrite');

    expect(outcome.project_id).toBe(DEMO_PROJECT_ID);
    expect(loadProject(DEMO_PROJECT_ID)).not.toBeNull();
    expect(loadComponents(DEMO_PROJECT_ID)).toHaveLength(componentsBefore);
    expect(loadSolutions(DEMO_PROJECT_ID)).toHaveLength(solutionsBefore);
  });

  it('imports as a copy under a free id, leaving the original alone', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test-build')!;
    const originalName = loadProject(DEMO_PROJECT_ID)?.project_name;

    const outcome = applyProjectFile(file, 'copy');

    expect(outcome.project_id).not.toBe(DEMO_PROJECT_ID);
    expect(outcome.project_id).toContain('_copy');
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe(originalName);
    expect(loadProject(outcome.project_id)).not.toBeNull();
  });

  // Rows carry the project id too, so rewriting only the project record would
  // leave scenarios pointing at the project they were copied from.
  it('re-points scenarios at the new id when copying', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test-build')!;

    const outcome = applyProjectFile(file, 'copy');

    const copied = loadScenarios(outcome.project_id);
    expect(copied.length).toBeGreaterThan(0);
    for (const scenario of copied) {
      expect(scenario.project_id).toBe(outcome.project_id);
    }
  });

  it('reports which collections carried data', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test-build')!;

    const outcome = applyProjectFile(file, 'copy');

    expect(outcome.written.some((entry) => entry.startsWith('components'))).toBe(true);
    expect(outcome.written.some((entry) => entry.startsWith('scenarios'))).toBe(true);
  });
});

describe('availableProjectId', () => {
  it('returns the base id when nothing uses it', () => {
    expect(availableProjectId('FREE_ID')).toBe('FREE_ID');
  });

  it('steps past ids that are taken', async () => {
    await seedDemoProject();
    const first = availableProjectId(DEMO_PROJECT_ID);
    expect(first).toBe(`${DEMO_PROJECT_ID}_copy`);

    applyProjectFile(collectProject(DEMO_PROJECT_ID, 'b')!, 'copy');
    expect(availableProjectId(DEMO_PROJECT_ID)).toBe(`${DEMO_PROJECT_ID}_copy2`);
  });
});

describe('projectFilename', () => {
  it('builds a sortable, filesystem-safe name', () => {
    const name = projectFilename('RRU_A', new Date('2026-08-17T02:30:45Z'));
    expect(name).toBe('RRU_A_20260817023045.tnv.json');
  });

  it('strips characters a filesystem would reject', () => {
    expect(projectFilename('a/b:c*d', new Date('2026-01-02T03:04:05Z'))).toBe(
      'a_b_c_d_20260102030405.tnv.json',
    );
  });
});


describe('material defaults survive the folder round trip', () => {
  it('carries a stated coin size and a changed constant back out of a file', () => {
    const project = { ...createEmptyProject(), project_id: 'MAT_A', project_name: 'Materials' };
    project.materials = {
      ...project.materials,
      copper_k_W_mK: sourced(400, 'Vendor'),
      coin_L_mm: sourced(55, 'Manual'),
      coin_W_mm: sourced(35, 'Manual'),
    };
    saveProject(project);

    const file = collectProject('MAT_A', 'test')!;
    const parsed = parseProjectFile(serializeProjectFile(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const materials = parsed.file.data.project.materials;
    expect(materials.copper_k_W_mK.value).toBe(400);
    expect(coinAreaMm2(materials)).toBe(1925);
    // Untouched entries still read as shipped rather than as decisions.
    expect(materials.via_efficiency.source).toBe('Assumed');
  });

  // Opening an older project must not fail, and must not invent a coin size.
  it('opens a project file written before the section existed', () => {
    const project = { ...createEmptyProject(), project_id: 'MAT_B', project_name: 'Legacy' };
    saveProject(project);
    const raw = JSON.parse(localStorage.getItem('tnv.projects')!);
    delete raw.MAT_B.materials;
    localStorage.setItem('tnv.projects', JSON.stringify(raw));

    const reopened = loadProject('MAT_B')!;
    expect(reopened.materials.tim[0].k_W_mK.value).toBe(3.0);
    expect(reopened.materials.coin_L_mm).toBeNull();
  });
});
