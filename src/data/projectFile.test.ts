import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedDemoProject } from '@/mock/seed';
import { DEMO_PROJECT_ID } from '@/mock/demoProject';
import {
  loadAnalyses,
  loadBoundarySets,
  loadComponents,
  loadExportPreferences,
  loadNetwork,
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
  duplicateProject,
  parseProjectFile,
  resolveDuplicateOptions,
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

describe('a file that is not what it claims', () => {
  // Shape is checked BEFORE anything is written; a malformed section used to
  // be found by a TypeError halfway through the import.
  it('rejects a section of the wrong shape and writes nothing', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test')!;
    const broken = JSON.parse(serializeProjectFile(file));
    broken.project_id = 'BROKEN';
    broken.data.project.project_id = 'BROKEN';
    broken.data.scenarios = { not: 'a list' };

    const result = parseProjectFile(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('scenarios');
    expect(loadProject('BROKEN')).toBeNull();
  });

  it('rejects a list holding something that is not a record', async () => {
    await seedDemoProject();
    const file = JSON.parse(serializeProjectFile(collectProject(DEMO_PROJECT_ID, 'test')!));
    file.data.solutions = [null];
    expect(parseProjectFile(JSON.stringify(file)).ok).toBe(false);
  });

  // Something can still fail part-way through a write. Then nothing of the
  // import may remain — least of all a project record with no data under it,
  // which the folder mirror would copy over a good file.
  it('leaves storage exactly as it was when the import fails part-way', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test')!;
    const before = loadProject(DEMO_PROJECT_ID)!;
    const scenariosBefore = loadScenarios(DEMO_PROJECT_ID);

    const poisoned = {
      ...file,
      project_id: 'HALF',
      data: {
        ...file.data,
        project: { ...file.data.project, project_id: 'HALF' },
        boundary_sets: [
          {
            get ambient(): never {
              throw new Error('unreadable boundary set');
            },
          },
        ],
      },
    } as unknown as typeof file;

    expect(() => applyProjectFile(poisoned, 'overwrite')).toThrow('unreadable boundary set');
    expect(loadProject('HALF')).toBeNull();
    expect(loadScenarios('HALF')).toEqual([]);
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe(before.project_name);
    expect(loadScenarios(DEMO_PROJECT_ID)).toEqual(scenariosBefore);
  });

  // Overwrite has to mean replace: a solution for a scenario the file does not
  // have must not survive and stay attached to a network it was not solved on.
  it('replaces the project’s data on overwrite instead of merging into it', async () => {
    await seedDemoProject();
    expect(loadSolutions(DEMO_PROJECT_ID).length).toBeGreaterThan(0);
    const file = collectProject(DEMO_PROJECT_ID, 'test')!;
    const withoutResults = { ...file, data: { ...file.data, solutions: [] } };

    applyProjectFile(withoutResults, 'overwrite');

    expect(loadSolutions(DEMO_PROJECT_ID)).toEqual([]);
    expect(loadComponents(DEMO_PROJECT_ID).length).toBe(file.data.components.length);
  });
});

describe('export preferences carried by a file', () => {
  it('stores a well-formed block, and leaves out one that is not', async () => {
    await seedDemoProject();
    const file = collectProject(DEMO_PROJECT_ID, 'test-build')!;

    file.data.export_preferences = {
      config: { base_filename: 'From_File' },
      selected: ['pdf_report', 7 as unknown as string],
      output_folder_name: 'Reports',
    };
    applyProjectFile(file, 'overwrite');
    expect(loadExportPreferences(DEMO_PROJECT_ID)).toEqual({
      config: { base_filename: 'From_File' },
      selected: ['pdf_report'],
      output_folder_name: 'Reports',
      snapshot_selection: null,
    });

    localStorage.clear();
    file.data.export_preferences = { config: [] } as unknown as typeof file.data.export_preferences;
    applyProjectFile(file, 'overwrite');
    expect(loadExportPreferences(DEMO_PROJECT_ID)).toBeNull();
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

/**
 * Screen 01's Duplicate Project. Its dialog used to offer Components, Thermal
 * Network, FloTHERM and Solver Results boxes that changed nothing: only the
 * project record and the scenarios were ever written, so every duplicate came
 * out empty whatever was ticked.
 */
describe('duplicateProject', () => {
  const ALL = { components: true, network: true, scenarios: true, results: true };
  const NONE = { components: false, network: false, scenarios: false, results: false };

  it('copies everything that is ticked, under the id and name given', async () => {
    await seedDemoProject();
    const outcome = duplicateProject(DEMO_PROJECT_ID, { id: 'DUP_ALL', name: 'Dup all' }, ALL, 'test');

    expect(outcome?.project_id).toBe('DUP_ALL');
    expect(loadProject('DUP_ALL')?.project_name).toBe('Dup all');
    expect(loadComponents('DUP_ALL')).toHaveLength(loadComponents(DEMO_PROJECT_ID).length);
    expect(Object.keys(loadNetwork('DUP_ALL')?.nodes ?? {})).toHaveLength(
      Object.keys(loadNetwork(DEMO_PROJECT_ID)?.nodes ?? {}).length,
    );
    expect(loadScenarios('DUP_ALL')).toHaveLength(loadScenarios(DEMO_PROJECT_ID).length);
    expect(loadSolutions(DEMO_PROJECT_ID).length).toBeGreaterThan(0);
    expect(loadSolutions('DUP_ALL')).toHaveLength(loadSolutions(DEMO_PROJECT_ID).length);
    expect(loadBoundarySets('DUP_ALL')).toHaveLength(loadBoundarySets(DEMO_PROJECT_ID).length);
  });

  it('keeps revisions, so copied results are still valid against the copy', async () => {
    await seedDemoProject();
    duplicateProject(DEMO_PROJECT_ID, { id: 'DUP_REV', name: 'Dup rev' }, ALL, 'test');

    expect(loadProject('DUP_REV')?.revision).toEqual(loadProject(DEMO_PROJECT_ID)?.revision);
    expect(loadNetwork('DUP_REV')?.revision).toEqual(loadNetwork(DEMO_PROJECT_ID)?.revision);
  });

  it('re-points every copied row at the new project', async () => {
    await seedDemoProject();
    duplicateProject(DEMO_PROJECT_ID, { id: 'DUP_IDS', name: 'Dup ids' }, ALL, 'test');

    expect(loadNetwork('DUP_IDS')?.project_id).toBe('DUP_IDS');
    for (const scenario of loadScenarios('DUP_IDS')) expect(scenario.project_id).toBe('DUP_IDS');
    for (const set of loadBoundarySets('DUP_IDS')) expect(set.project_id).toBe('DUP_IDS');
    for (const solution of loadSolutions('DUP_IDS')) expect(solution.project_id).toBe('DUP_IDS');
  });

  it('leaves results out by default and copies the rest', async () => {
    await seedDemoProject();
    duplicateProject(
      DEMO_PROJECT_ID,
      { id: 'DUP_DEFAULT', name: 'Dup default' },
      { components: true, network: true, scenarios: true, results: false },
      'test',
    );

    expect(loadComponents('DUP_DEFAULT').length).toBeGreaterThan(0);
    expect(loadNetwork('DUP_DEFAULT')).not.toBeNull();
    expect(loadSolutions('DUP_DEFAULT')).toHaveLength(0);
    expect(loadAnalyses('DUP_DEFAULT')).toHaveLength(0);
  });

  it('with nothing ticked, is the project record and a Baseline', async () => {
    await seedDemoProject();
    duplicateProject(DEMO_PROJECT_ID, { id: 'DUP_NONE', name: 'Dup none' }, NONE, 'test');

    const copy = loadProject('DUP_NONE')!;
    const scenarios = loadScenarios('DUP_NONE');
    expect(loadComponents('DUP_NONE')).toHaveLength(0);
    expect(loadNetwork('DUP_NONE')).toBeNull();
    expect(loadBoundarySets('DUP_NONE')).toHaveLength(0);
    expect(scenarios).toHaveLength(1);
    expect(copy.active_scenario_id).toBe(scenarios[0].id);
    // The materials are part of the project record and always come along.
    expect(copy.materials).toEqual(loadProject(DEMO_PROJECT_ID)?.materials);
  });

  it('never leaves the source changed', async () => {
    await seedDemoProject();
    const before = collectProject(DEMO_PROJECT_ID, 'test')!.data;
    duplicateProject(DEMO_PROJECT_ID, { id: 'DUP_SRC', name: 'Dup src' }, ALL, 'test');
    const after = collectProject(DEMO_PROJECT_ID, 'test')!.data;

    expect(after.project.project_name).toBe(before.project.project_name);
    expect(after.components).toHaveLength(before.components.length);
    expect(after.solutions).toHaveLength(before.solutions.length);
  });

  it('returns null for a source that is not in storage', () => {
    expect(duplicateProject('NOPE', { id: 'X_COPY', name: 'x' }, ALL, 'test')).toBeNull();
    expect(loadProject('X_COPY')).toBeNull();
  });
});

describe('resolveDuplicateOptions', () => {
  it('brings a network and scenarios with results, and components with a network', () => {
    expect(
      resolveDuplicateOptions({ components: false, network: false, scenarios: false, results: true }),
    ).toEqual({ components: true, network: true, scenarios: true, results: true });
    expect(
      resolveDuplicateOptions({ components: false, network: true, scenarios: false, results: false }),
    ).toEqual({ components: true, network: true, scenarios: false, results: false });
  });
});
