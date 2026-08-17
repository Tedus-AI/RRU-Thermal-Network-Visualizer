import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadComponentRevisions,
  loadNetwork,
  loadProject,
  loadScenarios,
  loadSolutions,
  saveComponentRevisions,
  saveProject,
} from './persistence';
import { createComponentRevisionSet, createRevision } from '@/domain/revision';

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

const legacyProject = {
  project_id: 'P',
  project_name: 'Legacy Project',
  project_context: {},
  active_scenario_id: 'SCN_1',
  status: 'active',
  meta: {
    created_at: '2026-08-12T08:00:00.000Z',
    updated_at: '2026-08-12T09:00:00.000Z',
    schema_version: '1.0',
  },
  other_tool: { owner: 'shared-db' },
};

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  localStorage.setItem('tnv.projects', JSON.stringify({ P: legacyProject }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Phase 1 persistence hydration', () => {
  it('hydrates a stable project revision and preserves foreign fields on save', () => {
    const first = loadProject('P')!;
    const second = loadProject('P')!;

    expect(first.revision).toMatch(/^legacy:project:/);
    expect(second.revision).toBe(first.revision);

    const explicitRevision = createRevision('project');
    saveProject({ ...first, revision: explicitRevision, project_name: 'Updated' });
    const stored = JSON.parse(localStorage.getItem('tnv.projects')!) as Record<
      string,
      Record<string, unknown>
    >;
    expect(stored.P.revision).toBe(explicitRevision);
    expect(stored.P.other_tool).toEqual({ owner: 'shared-db' });
  });

  it('hydrates stable scenario, network and component revisions from legacy data', () => {
    localStorage.setItem(
      'tnv.scenarios',
      JSON.stringify({
        P: {
          SCN_1: {
            id: 'SCN_1',
            project_id: 'P',
            name: 'Baseline',
            ambient_C: 55,
            wind_mps: 0,
            solar_W_m2: 0,
            power_scale: 1,
            notes: '',
            is_default: true,
          },
        },
      }),
    );
    localStorage.setItem('tnv.components', JSON.stringify({ P: [] }));
    localStorage.setItem(
      'tnv.thermal_networks',
      JSON.stringify({
        P: {
          schema_version: '1.0',
          project_id: 'P',
          network_name: 'Main Thermal Network',
          mode: 'analytical',
          status: 'EMPTY',
          nodes: {},
          edges: {},
          templates: {},
          zones: {},
          layout: { mode: 'Auto', positions: {} },
          flotherm_mappings: {},
        },
      }),
    );

    const scenarioRevision = loadScenarios('P')[0].revision;
    const networkRevision = loadNetwork('P')!.revision;
    const componentRevisions = loadComponentRevisions('P');

    expect(scenarioRevision).toMatch(/^legacy:scenario:/);
    expect(loadScenarios('P')[0].revision).toBe(scenarioRevision);
    expect(networkRevision).toMatch(/^legacy:network:/);
    expect(loadNetwork('P')!.revision).toBe(networkRevision);
    expect(componentRevisions.component_revision).toMatch(/^legacy:component:/);
    expect(loadComponentRevisions('P')).toEqual(componentRevisions);
  });

  it('round-trips first-class component revision clocks in a separate collection', () => {
    const revisions = createComponentRevisionSet();
    saveComponentRevisions('P', revisions);

    expect(loadComponentRevisions('P', [])).toEqual(revisions);
    const stored = JSON.parse(localStorage.getItem('tnv.component_revisions')!) as Record<
      string,
      unknown
    >;
    expect(stored.P).toEqual(revisions);
  });

  it('hydrates complete source provenance onto a legacy solution', () => {
    localStorage.setItem(
      'tnv.thermal_solutions',
      JSON.stringify({
        P: {
          'Main Thermal Network::SCN_1': {
            schema_version: '1.0',
            project_id: 'P',
            network_id: 'Main Thermal Network',
            scenario_id: 'SCN_1',
            status: 'SOLVED',
            solver_version: 'v1.0',
            solver_engine: 'legacy',
            solved_at: '2026-08-12T10:00:00.000Z',
            node_temperatures_C: {},
            edge_results: {},
            energy_balance: {},
            warnings: [],
            metadata: { input_signature: 'legacy-signature' },
          },
        },
      }),
    );

    const source = loadSolutions('P')[0].metadata.source_revision!;
    expect(source.project_revision).toMatch(/^legacy:project:/);
    expect(source.component_revision).toMatch(/^legacy:component:/);
    expect(source.solver_input_revision).toMatch(/^legacy:solver_input:/);
    expect(source.limit_revision).toMatch(/^legacy:limit:/);
    expect(source.network_revision).toMatch(/^legacy:network:/);
    expect(source.scenario_revision).toMatch(/^legacy:scenario:/);
  });
});
