import { beforeEach, describe, expect, it } from 'vitest';

import { useBoundaryStore } from './boundaryStore';
import { useComponentStore } from './componentStore';
import { useNetworkStore } from './networkStore';
import { useScenarioStore } from './scenarioStore';
import { useSolverStore } from './solverStore';
import { createComponent } from '@/domain/component';
import { createBaselineScenario } from '@/domain/project';
import { createComponentRevisionSet } from '@/domain/revision';
import { sourced } from '@/domain/sourcedValue';
import type { ThermalNode } from '@/thermal/types';

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
  useBoundaryStore.getState().clear();
  useComponentStore.getState().clear();
  useNetworkStore.getState().clear();
  useScenarioStore.getState().clear();
  useSolverStore.getState().reset();
});

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

  it('advances the scenario clock when the separate boundary store changes', () => {
    const scenario = createBaselineScenario('P');
    useScenarioStore.setState({ scenarios: [scenario], activeScenarioId: scenario.id });
    useNetworkStore.getState().loadFor('P');
    useBoundaryStore.getState().loadFor('P', scenario.id);
    useSolverStore.getState().setSolutionState('SOLVED', '2026-08-13T01:00:00.000Z');

    useBoundaryStore.getState().setAmbient({ external_ambient_C: 60 });

    const updated = useScenarioStore.getState().scenarios[0];
    expect(updated.revision).not.toBe(scenario.revision);
    expect(updated.ambient_C).toBe(60);
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
    expect(useScenarioStore.getState().activeScenario()).toMatchObject({
      ambient_C: 60,
      wind_mps: 3,
      solar_W_m2: 700,
    });
  });
});
