/**
 * The heat sink's fins are the project's, the same in every scenario
 * (`thermal/boundary/finSpec.ts`): the boundary store copies them into the fin
 * surface's profile when a scenario loads and whenever the project changes,
 * seeds them once from what an older project typed into 06, and clears a
 * cleared field everywhere so it does not come back.
 *
 * On the built-in demo: one die-cast heat sink (base 300 × 220, ADC12 k 96),
 * still solving from the h = 12 W/m²K and 2 m² it was set up with.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createScenario } from '@/domain/project';
import { sourced } from '@/domain/sourcedValue';
import type { MaterialDefaults } from '@/domain/materials';
import { deriveBoundaryPorts } from '@/thermal/boundary/boundaryPorts';
import { FIN_GEOMETRY_KEYS, PLATE_GEOMETRY_KEYS, finArrayOf, usesFinGeometry } from '@/thermal/boundary/calculations';
import { PLATE_HEIGHT_SOURCE_KEY } from '@/thermal/boundary/plateHeight';
import { singleFinSurfacePort } from '@/thermal/boundary/finSpec';
import type { BoundaryConditionProfile, ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';

import { DEMO_PROJECT_ID, DEMO_SCENARIO_ID } from '@/mock/demoProject';
import { seedDemoProject } from '@/mock/seed';

import { useBoundaryStore } from './boundaryStore';
import { useNetworkStore } from './networkStore';
import { useProjectStore } from './projectStore';
import { useScenarioStore } from './scenarioStore';
import { loadBoundarySets, saveBoundarySet } from './persistence';

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

const K = FIN_GEOMETRY_KEYS;
const HOT = 'SCN_HOT';

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  useBoundaryStore.getState().clear();
  useNetworkStore.getState().clear();
  useScenarioStore.getState().clear();
  useProjectStore.getState().clear();
});

afterEach(() => vi.unstubAllGlobals());

async function openDemo() {
  await seedDemoProject();
  useProjectStore.getState().openProject(DEMO_PROJECT_ID);
  useScenarioStore.getState().loadFor(DEMO_PROJECT_ID);
  useNetworkStore.getState().loadFor(DEMO_PROJECT_ID);
}

function finPortId(): string {
  const network = useNetworkStore.getState().network;
  const port = singleFinSurfacePort(deriveBoundaryPorts(network), network);
  expect(port).not.toBeNull();
  return port!.id;
}

function finProfileOf(set: ScenarioBoundaryConditionSet | null | undefined): BoundaryConditionProfile {
  const portId = finPortId();
  const ids = new Set(
    set!.assignments.filter((a) => a.boundary_port_id === portId).flatMap((a) => a.profile_ids),
  );
  const profile = set!.profiles.find((p) => ids.has(p.id) && p.type !== 'solar_load' && p.type !== 'radiation_to_surroundings');
  expect(profile).toBeDefined();
  return profile!;
}

const activeFinProfile = () => finProfileOf(useBoundaryStore.getState().current());
const portOf = () => {
  const network = useNetworkStore.getState().network;
  return deriveBoundaryPorts(network).find((p) => p.id === finPortId());
};

/** A second scenario with the demo's boundary set copied, as 01's copy does. */
function addHotScenario() {
  const base = useScenarioStore.getState().scenarios[0];
  const hot = { ...createScenario(DEMO_PROJECT_ID, 'Hot 55°C', base), id: HOT, is_default: false, ambient_C: 55 };
  useScenarioStore.setState({ scenarios: [...useScenarioStore.getState().scenarios, hot] });
  const stored = loadBoundarySets(DEMO_PROJECT_ID).find((s) => s.scenario_id === DEMO_SCENARIO_ID)!;
  saveBoundarySet(DEMO_PROJECT_ID, { ...structuredClone(stored), scenario_id: HOT });
}

const fins = (patch: Record<string, number>) =>
  useProjectStore.getState().patchMaterials(
    Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, sourced(v, 'Manual')])) as Partial<MaterialDefaults>,
  );

describe('the heat sink fins as a project fact', () => {
  it('leaves a surface still solving from its stored h alone while the project has no fins', async () => {
    await openDemo();
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    const profile = activeFinProfile();
    expect(profile.parameters.h_W_m2K).toBe(12);
    expect(usesFinGeometry(profile, portOf())).toBe(false);
    expect(profile.parameters[K.height] ?? null).toBeNull();
  });

  it('a whole fin array on the project replaces the stored h, in every scenario', async () => {
    await openDemo();
    addHotScenario();
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);

    // Only the gap: not a whole array, the stored h stays.
    fins({ hsk_fin_gap_mm: 11.6 });
    expect(usesFinGeometry(activeFinProfile(), portOf())).toBe(false);

    fins({ hsk_fin_height_mm: 59.6, hsk_fin_thickness_mm: 1.2 });
    const profile = activeFinProfile();
    expect(profile.parameters).toMatchObject({
      [K.baseLength]: 300,
      [K.baseWidth]: 220,
      [K.height]: 59.6,
      [K.gap]: 11.6,
      [K.thickness]: 1.2,
      // 01's cooling elements name Die-casting Fin; no fin k → the base casting's.
      [K.technology]: 'DieCasting',
      [K.conductivity]: 96,
    });
    expect(usesFinGeometry(profile, portOf())).toBe(true);
    expect(finArrayOf(profile, portOf())).not.toBeNull();
    expect(useBoundaryStore.getState().dirty).toBe(true);

    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, HOT);
    expect(activeFinProfile().parameters).toMatchObject({ [K.height]: 59.6, [K.gap]: 11.6, [K.thickness]: 1.2 });
  });

  it('follows a k typed on the project and goes back to the process default when it is cleared', async () => {
    await openDemo();
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    fins({ hsk_fin_height_mm: 50, hsk_fin_gap_mm: 10, hsk_fin_thickness_mm: 1.5, hsk_fin_k_W_mK: 150 });
    expect(activeFinProfile().parameters[K.conductivity]).toBe(150);

    useProjectStore.getState().patchMaterials({ hsk_fin_k_W_mK: null });
    expect(activeFinProfile().parameters[K.conductivity]).toBe(96);
  });

  it('does nothing — no unsaved mark — when the profile already agrees', async () => {
    await openDemo();
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    fins({ hsk_fin_height_mm: 50, hsk_fin_gap_mm: 10, hsk_fin_thickness_mm: 1.5 });
    useBoundaryStore.getState().save(DEMO_PROJECT_ID);
    expect(useBoundaryStore.getState().dirty).toBe(false);

    // An unrelated project edit.
    useProjectStore.getState().patchMaterials({ coin_thickness_mm: sourced(2.5, 'Manual') });
    expect(useBoundaryStore.getState().dirty).toBe(false);
  });

  it('seeds the project from the fins an older project typed into 06, without overwriting what it states', async () => {
    await openDemo();
    const stored = loadBoundarySets(DEMO_PROJECT_ID).find((s) => s.scenario_id === DEMO_SCENARIO_ID)!;
    const profile = finProfileOf(stored);
    profile.parameters = {
      ...profile.parameters,
      [K.enabled]: true,
      [K.technology]: 'DieCasting',
      [K.height]: 70,
      [K.gap]: 9,
      [K.thickness]: 2,
      [K.draftAngle]: 1.5,
      // The k turning geometry on seeded: the process default, not a measurement.
      [K.conductivity]: 96,
    };
    saveBoundarySet(DEMO_PROJECT_ID, stored);
    fins({ hsk_fin_gap_mm: 11.6 });

    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    const materials = useProjectStore.getState().draft!.materials;
    expect(materials.hsk_fin_height_mm?.value).toBe(70);
    expect(materials.hsk_fin_thickness_mm?.value).toBe(2);
    expect(materials.hsk_fin_draft_deg?.value).toBe(1.5);
    expect(materials.hsk_fin_height_mm?.reference).toContain('06');
    // Stated already: the project's value wins, and the profile follows it.
    expect(materials.hsk_fin_gap_mm?.value).toBe(11.6);
    expect(activeFinProfile().parameters[K.gap]).toBe(11.6);
    expect(materials.hsk_fin_k_W_mK ?? null).toBeNull();
  });

  it('clearing a field clears it in every scenario, so the next one to load does not seed it back', async () => {
    await openDemo();
    addHotScenario();
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    fins({ hsk_fin_height_mm: 50, hsk_fin_gap_mm: 10, hsk_fin_thickness_mm: 1.5, hsk_fin_count: 18 });
    useBoundaryStore.getState().save(DEMO_PROJECT_ID);
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, HOT);
    useBoundaryStore.getState().save(DEMO_PROJECT_ID);
    expect(activeFinProfile().parameters[K.countOverride]).toBe(18);

    useProjectStore.getState().patchMaterials({ hsk_fin_count: null });
    useBoundaryStore.getState().clearProjectFin(DEMO_PROJECT_ID, [K.countOverride]);
    expect(activeFinProfile().parameters[K.countOverride]).toBeNull();

    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    expect(activeFinProfile().parameters[K.countOverride]).toBeNull();
    expect(useProjectStore.getState().draft!.materials.hsk_fin_count ?? null).toBeNull();
  });

  it('two heat sinks keep their own fins per scenario', async () => {
    await openDemo();
    // A second fin surface on the network: two independent heat sinks.
    const network = useNetworkStore.getState().network!;
    const fin = Object.values(network.nodes).find((n) => n.type === 'fin_surface')!;
    const edge = network.edges[portOf()!.boundary_edge_id!];
    const id2 = `${fin.id}_2`;
    useNetworkStore.getState().upsertNode({ ...fin, id: id2, name: `${fin.name} 2` });
    useNetworkStore.getState().upsertEdge({
      ...edge,
      id: `${edge.id}_2`,
      from: edge.from === fin.id ? id2 : edge.from,
      to: edge.to === fin.id ? id2 : edge.to,
    });
    expect(singleFinSurfacePort(deriveBoundaryPorts(useNetworkStore.getState().network), useNetworkStore.getState().network)).toBeNull();

    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    const before = structuredClone(useBoundaryStore.getState().current()!.profiles);
    fins({ hsk_fin_height_mm: 50, hsk_fin_gap_mm: 10, hsk_fin_thickness_mm: 1.5 });
    expect(useBoundaryStore.getState().current()!.profiles).toEqual(before);
  });
});

describe('a vertical plate takes the machine height from 01', () => {
  const P = PLATE_GEOMETRY_KEYS;
  const plate = (patch: Record<string, number | string | boolean | null>) => {
    const profile = activeFinProfile();
    useBoundaryStore.getState().upsertProfile({ ...profile, parameters: { ...profile.parameters, ...patch } });
  };

  it('follows 01’s heat sink base length, and keeps following it', async () => {
    await openDemo();
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    plate({ [P.enabled]: true, [P.orientation]: 'Vertical' });
    expect(activeFinProfile().parameters[P.height]).toBe(300);
    expect(activeFinProfile().parameters[PLATE_HEIGHT_SOURCE_KEY]).toBe('project');

    fins({ hsk_base_L_mm: 339 });
    expect(activeFinProfile().parameters[P.height]).toBe(339);
  });

  it('✂ keeps the engineer’s height through a change in 01, and ↺ goes back', async () => {
    await openDemo();
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    plate({ [P.enabled]: true, [P.orientation]: 'Vertical' });
    plate({ [PLATE_HEIGHT_SOURCE_KEY]: 'manual', [P.height]: 200 });
    fins({ hsk_base_L_mm: 350 });
    expect(activeFinProfile().parameters[P.height]).toBe(200);

    plate({ [PLATE_HEIGHT_SOURCE_KEY]: 'project' });
    expect(activeFinProfile().parameters[P.height]).toBe(350);
  });

  it('never overwrites a height typed before the link', async () => {
    await openDemo();
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    plate({ [P.enabled]: true, [P.orientation]: 'Vertical', [P.height]: 120 });
    expect(activeFinProfile().parameters[P.height]).toBe(120);
    expect(activeFinProfile().parameters[PLATE_HEIGHT_SOURCE_KEY] ?? null).toBeNull();
  });
});
