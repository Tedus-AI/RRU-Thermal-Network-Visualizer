import { describe, expect, it } from 'vitest';

import { createComponent, emptyGeometry, type Component } from '@/domain/component';
import { statusOf } from '@/domain/componentReadiness';
import {
  componentDataState,
  nextStepFor,
  summarizeComponentData,
  type ProjectHealth,
  type ProjectOverviewKpis,
} from './projectHealth';

function component(name: string, patch: Partial<Component> = {}): Component {
  return {
    ...createComponent({
      id: `CMP_${name}`,
      name,
      provenance: {
        source_type: 'CSV',
        source_project_id: null,
        source_project_name: null,
        source_file: 'bom.csv',
        imported_at: '2026-01-01T00:00:00.000Z',
      },
    }),
    ...patch,
  };
}

/** Everything the completeness checklist asks for (04 §23). */
function ready(name = 'Final PA'): Component {
  const subject = component(name, { power_W: { value: 45, source: 'Datasheet' } });
  subject.thermal_spec = {
    ...subject.thermal_spec,
    limit_type_confirmed: true,
    limit_C: { value: 150, source: 'Datasheet' },
    r_jc_C_per_W: { value: 0.22, source: 'Datasheet' },
    package_type: 'QFN',
    heat_path_confirmed: true,
    tim: { ...subject.thermal_spec.tim, tim_id: 'TIM_GREASE' },
    geometry: { ...emptyGeometry(), source_L_mm: 15, source_W_mm: 15 },
  };
  subject.architecture_prep.preferred_base_zone = 'HSK_BASE';
  return subject;
}

const kpis = (patch: Partial<ProjectOverviewKpis> = {}): ProjectOverviewKpis => ({
  componentCount: 0,
  heatSourceCount: 0,
  totalPowerW: 0,
  nodeCount: 0,
  edgeCount: 0,
  scenarioCount: 0,
  flothermMappingCount: 0,
  componentTypeCount: 0,
  componentsReady: 0,
  componentsWithErrors: 0,
  ...patch,
});

const health = (patch: Partial<ProjectHealth> = {}): ProjectHealth => ({
  projectIdentity: true,
  components: true,
  componentData: 'ready',
  thermalNetwork: true,
  baselineScenario: true,
  flotherm: false,
  solved: true,
  ...patch,
});

/**
 * Importing is not the same as being ready. A row arrives with a name, a qty
 * and a power and nothing else, and the panel that exists to say what is left
 * used to read "Hardware components imported ✓" over forty components that
 * could not be solved.
 */
describe('summarizeComponentData', () => {
  it('counts a fully answered component as ready', () => {
    expect(summarizeComponentData([ready()])).toEqual({
      componentsReady: 1,
      componentsWithErrors: 0,
    });
  });

  it('does not count a freshly imported component as ready', () => {
    const fresh = component('FPGA', { power_W: { value: 40, source: 'Imported' } });
    expect(statusOf(fresh)).toBe('WARNING');
    expect(summarizeComponentData([fresh])).toEqual({
      componentsReady: 0,
      componentsWithErrors: 0,
    });
  });

  it('counts errors separately, because those block the network build', () => {
    const broken = component('Bad', { qty: 0 });
    expect(summarizeComponentData([broken, ready()])).toEqual({
      componentsReady: 1,
      componentsWithErrors: 1,
    });
  });

  // A disabled component never reaches Screen 05, so its gaps are not a task.
  it('ignores disabled components entirely', () => {
    const off = component('Off', { enabled: false, qty: 0 });
    expect(summarizeComponentData([off])).toEqual({
      componentsReady: 0,
      componentsWithErrors: 0,
    });
  });
});

describe('componentDataState', () => {
  it('is none before anything is imported', () => {
    expect(componentDataState(kpis())).toBe('none');
  });

  it('is errors when any component blocks, whatever else is ready', () => {
    expect(
      componentDataState(kpis({ componentTypeCount: 5, componentsReady: 4, componentsWithErrors: 1 })),
    ).toBe('errors');
  });

  it('is incomplete when nothing errors but not everything is answered', () => {
    expect(componentDataState(kpis({ componentTypeCount: 5, componentsReady: 2 }))).toBe('incomplete');
  });

  it('is ready only when every enabled component is', () => {
    expect(componentDataState(kpis({ componentTypeCount: 5, componentsReady: 5 }))).toBe('ready');
  });
});

/**
 * The recommendation used to go from "components imported" straight to Screen
 * 05, so the step being suggested was building a network out of components that
 * had no Rjc, no confirmed heat path and no base zone.
 */
describe('nextStepFor', () => {
  it('sends a freshly imported project to Component Manager, not to the path builder', () => {
    const step = nextStepFor(health({ componentData: 'incomplete', thermalNetwork: false }));
    expect(step.screenCode).toBe('04');
    expect(step.screenPath).toBe('components');
  });

  it('says so plainly when components are blocking', () => {
    const step = nextStepFor(health({ componentData: 'errors' }));
    expect(step.screenCode).toBe('04');
    expect(step.description).toMatch(/errors/i);
  });

  // 04 §7 — a component missing Rjc is still worth carrying forward. Screen 01
  // must not become a second place that blocks on it.
  it('never blocks the user on this screen for component data', () => {
    for (const state of ['incomplete', 'errors'] as const) {
      expect(nextStepFor(health({ componentData: state })).blockedHere).toBe(false);
    }
  });

  it('still puts identity first — nothing else has a project to belong to', () => {
    const step = nextStepFor(health({ projectIdentity: false, componentData: 'errors' }));
    expect(step.screenCode).toBe('01');
    expect(step.blockedHere).toBe(true);
  });

  it('still asks for an import before asking for data to fill in', () => {
    expect(nextStepFor(health({ components: false, componentData: 'none' })).screenCode).toBe('02');
  });

  it('moves on to the network once the data is complete', () => {
    expect(nextStepFor(health({ thermalNetwork: false })).screenCode).toBe('05');
  });

  // AC-12 — FloTHERM is optional and must never gate the basic workflow.
  it('never recommends the FloTHERM import', () => {
    expect(nextStepFor(health({ flotherm: false })).screenCode).not.toBe('03');
  });
});
