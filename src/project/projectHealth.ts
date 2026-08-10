/**
 * Project readiness — 01 §33, §34, AC-07, AC-08.
 *
 * Everything here is DERIVED from the shared stores on read. 01 §26 / §45
 * forbid persisting these KPIs as authoritative project data.
 */

import { PROJECT_ID_PATTERN } from '@/domain/project';
import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { SCREENS } from '@/app/navigation';

export interface ProjectHealth {
  projectIdentity: boolean;
  components: boolean;
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
}

export function useProjectOverview(): ProjectOverviewKpis {
  const componentCount = useComponentStore((s) => s.componentCount());
  const heatSourceCount = useComponentStore((s) => s.heatSourceCount());
  const totalPowerW = useComponentStore((s) => s.totalPowerW());
  const nodeCount = useNetworkStore((s) => s.nodeCount());
  const edgeCount = useNetworkStore((s) => s.edgeCount());
  const scenarioCount = useScenarioStore((s) => s.scenarioCount());
  const flothermMappingCount = useNetworkStore((s) => s.flothermMappingCount());

  return {
    componentCount,
    heatSourceCount,
    totalPowerW,
    nodeCount,
    edgeCount,
    scenarioCount,
    flothermMappingCount,
  };
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
