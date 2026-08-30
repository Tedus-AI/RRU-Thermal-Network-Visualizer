import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBoundaryStore } from './boundaryStore';
import { useComponentStore } from './componentStore';
import { useNetworkStore } from './networkStore';
import { useScenarioStore } from './scenarioStore';
import { useSolverStore } from './solverStore';
import { saveBoundarySet } from './persistence';
import { createComponent } from '@/domain/component';
import { createBaselineScenario } from '@/domain/project';
import { createComponentRevisionSet } from '@/domain/revision';
import { sourced } from '@/domain/sourcedValue';
import { createRth } from '@/thermal/rth';
import type { BoundaryConditionProfile, BoundaryPort } from '@/thermal/boundary/types';
import type { ThermalEdge, ThermalNode } from '@/thermal/types';

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

function component() {
  return createComponent({
    id: 'CMP_PA',
    name: 'Final PA',
    category: 'RF',
    qty: 1,
    power_W: 50,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-08-13T00:00:00.000Z',
    },
  });
}

function node(): ThermalNode {
  return {
    id: 'N_PA',
    name: 'PA Junction',
    type: 'junction',
    power_W: 50,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  useBoundaryStore.getState().clear();
  useComponentStore.getState().clear();
  useNetworkStore.getState().clear();
  useScenarioStore.getState().clear();
  useSolverStore.getState().reset();
});

afterEach(() => vi.unstubAllGlobals());

describe('Phase 1 revision propagation', () => {
  it('advances only master and limit clocks for a Limit edit', () => {
    const initial = createComponentRevisionSet();
    const pa = component();
    useComponentStore.setState({
      components: [pa],
      revisions: initial,
      loaded_project_id: 'P',
      dirty: false,
    });
    useNetworkStore.setState({ requiresReview: false });
    useSolverStore.getState().setSolutionState('SOLVED', '2026-08-13T01:00:00.000Z');

    useComponentStore.getState().patchComponent(
      pa.id,
      {
        thermal_spec: {
          ...pa.thermal_spec,
          limit_C: sourced(170, 'Manual'),
        },
      },
      ['limit_C'],
    );

    const next = useComponentStore.getState().revisions;
    expect(next.component_revision).not.toBe(initial.component_revision);
    expect(next.limit_revision).not.toBe(initial.limit_revision);
    expect(next.solver_input_revision).toBe(initial.solver_input_revision);
    expect(useSolverStore.getState().state).toBe('SOLVED');
    expect(useSolverStore.getState().dirtyReasons).toEqual([]);
    expect(useNetworkStore.getState().requiresReview).toBe(false);
  });

  it('treats a manufacturer reference-location edit as limit provenance only', () => {
    const initial = createComponentRevisionSet();
    const module = component();
    useComponentStore.setState({
      components: [module],
      revisions: initial,
      loaded_project_id: 'P',
      dirty: false,
    });
    useSolverStore.getState().setSolutionState('SOLVED', '2026-08-13T01:00:00.000Z');

    useComponentStore.getState().patchComponent(
      module.id,
      {
        thermal_spec: {
          ...module.thermal_spec,
          limit_reference_note: 'Center',
        },
      },
      ['limit_reference_note'],
    );

    const next = useComponentStore.getState().revisions;
    expect(next.component_revision).not.toBe(initial.component_revision);
    expect(next.limit_revision).not.toBe(initial.limit_revision);
    expect(next.solver_input_revision).toBe(initial.solver_input_revision);
    expect(useSolverStore.getState().state).toBe('SOLVED');
    expect(useSolverStore.getState().dirtyReasons).toEqual([]);
  });

  it('advances the solver-input clock and marks the solve DIRTY for a power edit', () => {
    const initial = createComponentRevisionSet();
    const pa = component();
    useComponentStore.setState({
      components: [pa],
      revisions: initial,
      loaded_project_id: 'P',
      dirty: false,
    });
    useSolverStore.getState().setSolutionState('SOLVED', '2026-08-13T01:00:00.000Z');

    useComponentStore
      .getState()
      .patchComponent(pa.id, { power_W: sourced(55, 'Manual') }, ['power_W']);

    const next = useComponentStore.getState().revisions;
    expect(next.component_revision).not.toBe(initial.component_revision);
    expect(next.solver_input_revision).not.toBe(initial.solver_input_revision);
    expect(next.limit_revision).toBe(initial.limit_revision);
    expect(useSolverStore.getState().state).toBe('DIRTY');
    expect(useSolverStore.getState().dirtyReasons).toContain('component_power_changed');
  });

  it('advances the network clock for engineering changes but not graph layout', () => {
    useNetworkStore.getState().loadFor('P');
    useNetworkStore.getState().upsertNode(node());
    const engineeringRevision = useNetworkStore.getState().network!.revision;
    useSolverStore.getState().reset();

    useNetworkStore.getState().setNodePosition('N_PA', { x: 10, y: 20 });
    expect(useNetworkStore.getState().network!.revision).toBe(engineeringRevision);
    expect(useSolverStore.getState().dirtyReasons).toEqual([]);

    useNetworkStore.getState().upsertNode({ ...node(), power_W: 55 });
    expect(useNetworkStore.getState().network!.revision).not.toBe(engineeringRevision);
    expect(useSolverStore.getState().dirtyReasons).toContain('topology_changed');
  });

  it('advances the scenario clock when a Screen 06-owned boundary input changes', () => {
    const scenario = createBaselineScenario('P');
    useScenarioStore.setState({ scenarios: [scenario], activeScenarioId: scenario.id });
    useNetworkStore.getState().loadFor('P');
    useBoundaryStore.getState().loadFor('P', scenario.id);
    useSolverStore.getState().setSolutionState('SOLVED', '2026-08-13T01:00:00.000Z');

    useBoundaryStore.getState().setSurfaceProperty({
      surface_group_id: 'SG_FIN',
      name: 'Fin surface',
      emissivity: 0.86,
      absorptivity: 0.7,
      source: 'manual',
    });

    const updated = useScenarioStore.getState().scenarios[0];
    expect(updated.revision).not.toBe(scenario.revision);
    expect(updated.ambient_C).toBe(scenario.ambient_C);
    expect(useSolverStore.getState().state).toBe('DIRTY');
    expect(useSolverStore.getState().dirtyReasons).toContain('boundary_changed');
  });

  it('synchronizes Screen 01 scenario defaults into the Screen 06 overlay', () => {
    const scenario = createBaselineScenario('P');
    useScenarioStore.setState({ scenarios: [scenario], activeScenarioId: scenario.id });
    useNetworkStore.getState().loadFor('P');
    useBoundaryStore.getState().loadFor('P', scenario.id);

    const synchronized = useBoundaryStore.getState().syncScenarioDefaults(scenario.id, {
      ambient_C: 60,
      wind_mps: 3,
      solar_W_m2: 700,
    });
    useScenarioStore.getState().updateScenario(
      scenario.id,
      { ambient_C: 60, wind_mps: 3, solar_W_m2: 700 },
      { skipRevision: true, skipInvalidate: true },
    );

    expect(synchronized).toBe(true);
    expect(useBoundaryStore.getState().current()?.ambient.external_ambient_C).toBe(60);
    expect(useBoundaryStore.getState().current()?.site.wind_speed_m_s).toBe(3);
    expect(useBoundaryStore.getState().current()?.site.solar_irradiance_W_m2).toBe(700);
    expect(useBoundaryStore.getState().current()?.site.solar_enabled).toBe(true);
    expect(useScenarioStore.getState().activeScenario()).toMatchObject({
      ambient_C: 60,
      wind_mps: 3,
      solar_W_m2: 700,
    });
  });

  it('repairs stale inherited profile copies when a persisted boundary set is loaded', () => {
    const projectId = 'P_LOAD_SYNC';
    const scenario = { ...createBaselineScenario(projectId), solar_W_m2: 800 };
    useScenarioStore.setState({ scenarios: [scenario], activeScenarioId: scenario.id });
    useNetworkStore.getState().loadFor(projectId);

    const fin: ThermalNode = {
      ...node(),
      id: 'NODE_FIN',
      name: 'Fin Surface',
      type: 'fin_surface',
      power_W: 0,
      metadata: { boundary_area_mm2: 420_000 },
    };
    const ambient: ThermalNode = {
      ...node(),
      id: 'NODE_AMBIENT',
      name: 'Ambient',
      type: 'ambient',
      power_W: 0,
      boundary_role: 'placeholder',
    };
    const boundaryEdge: ThermalEdge = {
      id: 'EDGE_FIN_AMBIENT',
      from: fin.id,
      to: ambient.id,
      type: 'convection',
      method: 'convection_hA',
      rth: createRth(0.2, 'Analytical', 'medium'),
      heat_flow_W: null,
      delta_T_C: null,
      resolution: 'resolved',
      enabled: true,
    };
    useNetworkStore.getState().upsertNode(fin);
    useNetworkStore.getState().upsertNode(ambient);
    useNetworkStore.getState().upsertEdge(boundaryEdge);
    useBoundaryStore.getState().loadFor(projectId, scenario.id);

    const stale = structuredClone(useBoundaryStore.getState().current()!);
    stale.surface_properties = [
      {
        surface_group_id: 'SG_FIN',
        name: 'Fin surface',
        emissivity: 0.91,
        absorptivity: 0.55,
        source: 'measurement',
      },
    ];
    stale.profiles = [
      {
        id: 'BCP_RAD_STALE',
        name: 'Fin radiation',
        type: 'radiation_to_surroundings',
        representation: 'parallel_boundary_edges',
        parameters: { emissivity: 0.1, viewFactor: 0.9, area_m2: 0.42 },
        source: 'manual',
        confidence: 'medium',
      },
      {
        id: 'BCP_SOLAR_STALE',
        name: 'Fin solar',
        type: 'solar_load',
        representation: 'external_load_only',
        parameters: {
          irradiance_W_m2: 100,
          absorptivity: 0.1,
          receivingArea_m2: 0.42,
          projectedAreaFactor: 1,
          shadingFactor: 1,
        },
        source: 'manual',
        confidence: 'medium',
      },
    ];
    stale.assignments = [
      {
        id: 'BCA_FIN',
        boundary_port_id: 'BP_FIN',
        boundary_edge_id: boundaryEdge.id,
        profile_ids: stale.profiles.map((profile) => profile.id),
        surface_group_id: 'SG_FIN',
        assignment_mode: 'manual',
        enabled: true,
      },
    ];
    saveBoundarySet(projectId, stale);

    useScenarioStore.setState({
      scenarios: [{ ...scenario, solar_W_m2: 0 }],
      activeScenarioId: scenario.id,
    });
    useBoundaryStore.getState().clear();
    useBoundaryStore.getState().loadFor(projectId, scenario.id);

    const repaired = useBoundaryStore.getState().current()!;
    expect(repaired.site).toMatchObject({
      solar_enabled: false,
      solar_irradiance_W_m2: 0,
    });
    expect(repaired.profiles.find((profile) => profile.id === 'BCP_RAD_STALE')?.parameters)
      .toMatchObject({ emissivity: 0.91 });
    expect(repaired.profiles.find((profile) => profile.id === 'BCP_SOLAR_STALE')?.parameters)
      .toMatchObject({ irradiance_W_m2: 0, absorptivity: 0.55 });
    expect(repaired.external_loads).toEqual([]);
    expect(useBoundaryStore.getState().dirty).toBe(true);
  });

  it('keeps assigned radiation and solar profiles synchronized with their authoritative inputs', () => {
    const scenario = { ...createBaselineScenario('P'), solar_W_m2: 800 };
    useScenarioStore.setState({ scenarios: [scenario], activeScenarioId: scenario.id });
    useNetworkStore.getState().loadFor('P');
    useBoundaryStore.getState().loadFor('P', scenario.id);

    const port: BoundaryPort = {
      id: 'BP_FIN',
      name: 'Fin Surface Boundary',
      connected_node_id: 'N_PA',
      surface_group_id: 'SG_FIN',
      area_m2: 0.42,
      orientation: 'vertical_fins',
      allowed_boundary_types: ['radiation_to_surroundings', 'solar_load'],
      dissipating: true,
      external_mappings: { import_status: 'deferred' },
    };
    useBoundaryStore.setState({ ports: [port] });
    useBoundaryStore.getState().setSurfaceProperty({
      surface_group_id: 'SG_FIN',
      name: 'Fin surface',
      emissivity: 0.86,
      absorptivity: 0.72,
      source: 'manual',
    });

    const profiles: BoundaryConditionProfile[] = [
      {
        id: 'BCP_RAD',
        name: 'Fin radiation',
        type: 'radiation_to_surroundings',
        representation: 'parallel_boundary_edges',
        parameters: {
          emissivity: 0.1,
          viewFactor: 0.9,
          area_m2: 0.42,
          surfaceReferenceTemperatureGuess_C: 90,
        },
        source: 'manual',
        confidence: 'medium',
      },
      {
        id: 'BCP_SOLAR',
        name: 'Fin solar',
        type: 'solar_load',
        representation: 'external_load_only',
        parameters: {
          irradiance_W_m2: 100,
          absorptivity: 0.1,
          receivingArea_m2: 0.42,
          projectedAreaFactor: 1,
          shadingFactor: 1,
        },
        source: 'manual',
        confidence: 'medium',
      },
    ];
    profiles.forEach((profile) => useBoundaryStore.getState().upsertProfile(profile));
    useBoundaryStore.getState().assignProfiles(port.id, profiles.map((profile) => profile.id));

    let current = useBoundaryStore.getState().current()!;
    expect(current.profiles.find((profile) => profile.id === 'BCP_RAD')?.parameters.emissivity)
      .toBe(0.86);
    expect(current.profiles.find((profile) => profile.id === 'BCP_SOLAR')?.parameters)
      .toMatchObject({ irradiance_W_m2: 800, absorptivity: 0.72 });
    expect(current.external_loads[0]?.q_W).toBeCloseTo(241.92, 2);

    useBoundaryStore.getState().setSurfaceProperty({
      surface_group_id: 'SG_FIN',
      name: 'Fin surface',
      emissivity: 0.91,
      absorptivity: 0.55,
      source: 'measurement',
    });
    current = useBoundaryStore.getState().current()!;
    expect(current.profiles.find((profile) => profile.id === 'BCP_RAD')?.parameters.emissivity)
      .toBe(0.91);
    expect(current.profiles.find((profile) => profile.id === 'BCP_SOLAR')?.parameters.absorptivity)
      .toBe(0.55);
    expect(current.external_loads[0]?.q_W).toBeCloseTo(184.8, 2);

    useBoundaryStore.getState().syncScenarioDefaults(scenario.id, { solar_W_m2: 0 });
    current = useBoundaryStore.getState().current()!;
    expect(current.profiles.find((profile) => profile.id === 'BCP_SOLAR')?.parameters.irradiance_W_m2)
      .toBe(0);
    expect(current.external_loads).toEqual([]);
    expect(current.validation.errors.some((error) => error.id.startsWith('PROFILE_SOLAR_')))
      .toBe(false);
    expect(current.validation.infos.map((info) => info.id)).toContain('SOLAR_PROFILES_INACTIVE');
  });

  it('creates incomplete boundary profile scaffolds without guessing h', () => {
    const scenario = createBaselineScenario('P');
    useScenarioStore.setState({ scenarios: [scenario], activeScenarioId: scenario.id });
    useNetworkStore.getState().loadFor('P');
    useNetworkStore.getState().upsertNode(node());
    useBoundaryStore.getState().loadFor('P', scenario.id);

    const port: BoundaryPort = {
      id: 'BP_FIN',
      name: 'Fin Surface Boundary',
      connected_node_id: 'N_PA',
      surface_group_id: 'SG_FIN',
      area_m2: 0.42,
      orientation: 'vertical_fins',
      allowed_boundary_types: ['combined_convection_radiation'],
      dissipating: true,
      external_mappings: { import_status: 'deferred' },
    };
    useBoundaryStore.setState({ ports: [port] });
    useBoundaryStore.getState().setSurfaceProperty({
      surface_group_id: 'SG_FIN',
      name: 'Fin surface',
      emissivity: 0.86,
      absorptivity: 0.7,
      source: 'manual',
    });

    expect(useBoundaryStore.getState().generateDefaults()).toEqual({
      created: 1,
      firstCreatedPortId: 'BP_FIN',
    });
    const generated = useBoundaryStore.getState().current()?.profiles[0];
    expect(generated).toMatchObject({
      type: 'combined_convection_radiation',
      representation: 'single_combined_edge',
      source: 'manual',
      confidence: 'medium',
      parameters: {
        h_W_m2K: null,
        area_m2: 0.42,
        emissivity: 0.86,
        viewFactor: null,
      },
    });
    expect(useBoundaryStore.getState().current()?.validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profile_id: generated?.id }),
      ]),
    );
    expect(useBoundaryStore.getState().generateDefaults()).toEqual({
      created: 0,
      firstCreatedPortId: null,
    });
  });
});
