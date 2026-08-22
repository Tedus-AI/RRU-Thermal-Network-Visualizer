/**
 * Project readiness — 01 §33, §34, AC-07, AC-08.
 *
 * Everything here is DERIVED from the shared stores on read. 01 §26 / §45
 * forbid persisting these KPIs as authoritative project data.
 */

import { useMemo } from 'react';

import { PROJECT_ID_PATTERN } from '@/domain/project';
import type { Component } from '@/domain/component';
import { completenessOf, completenessScore, statusOf } from '@/domain/componentReadiness';
import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { SCREENS } from '@/app/navigation';

export interface ProjectHealth {
  projectIdentity: boolean;
  components: boolean;
  /**
   * Whether the imported components carry the thermal data a solve needs.
   *
   * Importing is not the same as being ready: a row arrives with a name, a qty
   * and a power, and nothing else. Without this, forty components all missing
   * Rjc read here as "Hardware components imported ✓" and the panel that exists
   * to say what is left said nothing about the largest thing left.
   */
  componentData: 'ready' | 'incomplete' | 'errors' | 'none';
  thermalNetwork: boolean;
  baselineScenario: boolean;
  /** Optional — never blocking (01 §34, AC-12). */
  flotherm: boolean;
  solved: boolean;
}

export interface ProjectOverviewKpis {
  componentCount: number;
  heatSourceCount: number;
  totalPowerW: number;
  nodeCount: number;
  edgeCount: number;
  scenarioCount: number;
  flothermMappingCount: number;
  /**
   * Enabled component RECORDS, as against `componentCount`, which is units
   * (sum of qty). Readiness is a property of the record — four identical PAs
   * are one thing to fill in — so the ratio has to be counted against this or
   * it reads "5 of 11" over five components.
   */
  componentTypeCount: number;
  /** Enabled components whose nine facts are all answered (04 §23). */
  componentsReady: number;
  /** Enabled components with at least one blocking error (04 §22). */
  componentsWithErrors: number;
}

export function useProjectOverview(): ProjectOverviewKpis {
  const componentCount = useComponentStore((s) => s.componentCount());
  const heatSourceCount = useComponentStore((s) => s.heatSourceCount());
  const totalPowerW = useComponentStore((s) => s.totalPowerW());
  const componentTypeCount = useComponentStore((s) => s.typeCount());
  const components = useComponentStore((s) => s.components);
  const nodeCount = useNetworkStore((s) => s.nodeCount());
  const edgeCount = useNetworkStore((s) => s.edgeCount());
  const scenarioCount = useScenarioStore((s) => s.scenarioCount());
  const flothermMappingCount = useNetworkStore((s) => s.flothermMappingCount());

  const readiness = useMemo(() => summarizeComponentData(components), [components]);

  return {
    componentCount,
    heatSourceCount,
    totalPowerW,
    nodeCount,
    edgeCount,
    scenarioCount,
    flothermMappingCount,
    componentTypeCount,
    ...readiness,
  };
}

/**
 * Ready means the checklist is complete, not merely that nothing errored.
 * A component missing Rjc raises a warning and is deliberately not blocked
 * (04 §7), but it is also not finished, and Screen 01 is where that is owned up
 * to before the workflow moves on.
 */
export function summarizeComponentData(components: Component[]): {
  componentsReady: number;
  componentsWithErrors: number;
} {
  let componentsReady = 0;
  let componentsWithErrors = 0;
  for (const component of components) {
    if (!component.enabled) continue;
    const status = statusOf(component);
    if (status === 'ERROR') componentsWithErrors++;
    const score = completenessScore(completenessOf(component));
    if (status !== 'ERROR' && score.done === score.total) componentsReady++;
  }
  return { componentsReady, componentsWithErrors };
}

export function componentDataState(kpi: ProjectOverviewKpis): ProjectHealth['componentData'] {
  if (kpi.componentTypeCount === 0) return 'none';
  if (kpi.componentsWithErrors > 0) return 'errors';
  return kpi.componentsReady >= kpi.componentTypeCount ? 'ready' : 'incomplete';
}

export function useProjectHealth(): ProjectHealth {
  const draft = useProjectStore((s) => s.draft);
  const overview = useProjectOverview();
  const solverState = useSolverStore((s) => s.state);

  const nameValid = Boolean(draft?.project_name.trim());
  const idValid = Boolean(draft && PROJECT_ID_PATTERN.test(draft.project_id));

  return {
    projectIdentity: nameValid && idValid,
    components: overview.componentCount > 0,
    componentData: componentDataState(overview),
    thermalNetwork: overview.nodeCount > 0 && overview.edgeCount > 0,
    baselineScenario: overview.scenarioCount > 0,
    flotherm: overview.flothermMappingCount > 0,
    solved: solverState === 'SOLVED' || solverState === 'WARNING',
  };
}

export interface NextStep {
  label: string;
  description: string;
  screenCode: string;
  screenPath: string;
  cta: string;
  /** True when the user cannot leave this screen yet. */
  blockedHere: boolean;
}

/** 01 §34. FloTHERM is deliberately absent — it must not gate the basic workflow. */
export function nextStepFor(health: ProjectHealth): NextStep {
  const screen = (code: string) => SCREENS.find((s) => s.code === code)!;

  if (!health.projectIdentity) {
    return {
      label: 'Complete Project Information',
      description: 'Project Name and a valid Project ID are required before anything else.',
      screenCode: '01',
      screenPath: screen('01').path,
      cta: 'Complete Project Info',
      blockedHere: true,
    };
  }
  if (!health.components) {
    return {
      label: 'Import Hardware Components',
      description: 'Bring in the RF, digital and power components this thermal network describes.',
      screenCode: '02',
      screenPath: screen('02').path,
      cta: 'Continue to Import Components',
      blockedHere: false,
    };
  }
  /**
   * Screen 04 used to be skipped entirely: the recommendation went from
   * "components imported" straight to Screen 05. But an imported row arrives
   * with a name, a qty and a power and nothing else — no Rjc, no confirmed heat
   * path, no base zone — so the step being recommended was building a network
   * out of components that could not yet be solved.
   */
  if (health.componentData !== 'ready') {
    const blocking = health.componentData === 'errors';
    return {
      label: 'Complete Component Thermal Data',
      description: blocking
        ? 'Some components have errors that block the network build. Fix them in Component Manager.'
        : 'Imported components still need Rjc, thermal limits, heat paths and base zones before a solve means anything.',
      screenCode: '04',
      screenPath: screen('04').path,
      cta: 'Continue to Component Manager',
      // Not a gate: 04 §7 says a component missing Rjc is still worth carrying
      // forward, and this screen must not become a second place that blocks.
      blockedHere: false,
    };
  }
  if (!health.thermalNetwork) {
    return {
      label: 'Assign Thermal Architecture',
      description:
        'Define thermal architecture and start building thermal paths between components.',
      screenCode: '05',
      screenPath: screen('05').path,
      cta: 'Continue to Thermal Path Builder',
      blockedHere: false,
    };
  }
  if (!health.baselineScenario) {
    return {
      label: 'Define Boundary Conditions',
      description: 'A scenario with ambient conditions is required before solving.',
      screenCode: '06',
      screenPath: screen('06').path,
      cta: 'Continue to Boundary Conditions',
      blockedHere: false,
    };
  }
  if (!health.solved) {
    return {
      label: 'Solve Thermal Network',
      description: 'Run the nodal solver and review temperatures and heat flow.',
      screenCode: '07',
      screenPath: screen('07').path,
      cta: 'Continue to Thermal Network',
      blockedHere: false,
    };
  }
  return {
    label: 'Review Results',
    description: 'Inspect the worst component, the dominant path and the ranked bottlenecks.',
    screenCode: '10',
    screenPath: screen('10').path,
    cta: 'Continue to Results Overview',
    blockedHere: false,
  };
}
