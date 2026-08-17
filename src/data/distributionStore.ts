/** Authoritative Screen 09 engineering result store; UI transients stay local. */

import { create } from 'zustand';

import {
  buildDistributionResult,
  isDistributionCurrent,
  type DistributionState,
  type TemperatureDistributionResult,
} from '@/thermal/analysis/distributionResult';

import { loadDistributions, saveDistribution } from './persistence';
import { useComponentStore } from './componentStore';
import { useNetworkStore } from './networkStore';
import { useScenarioStore } from './scenarioStore';
import { useSolutionStore } from './solutionStore';
import { currentSourceRevision } from './sourceRevision';

const keyOf = (networkId: string, scenarioId: string) => `${networkId}::${scenarioId}`;

function context() {
  const network = useNetworkStore.getState().network;
  const scenarioState = useScenarioStore.getState();
  const scenario = scenarioState.activeScenario();
  const solutionState = useSolutionStore.getState();
  const solution = solutionState.current();
  if (!network || !scenario || !solution) return null;
  return {
    network,
    scenario,
    solution,
    components: useComponentStore.getState().components,
    sourceRevision: currentSourceRevision(network.project_id, network, scenario),
    solutionStale: solutionState.isStale(),
  };
}

interface DistributionStoreState {
  results: Record<string, TemperatureDistributionResult>;
  activeKey: string | null;
  loadedProjectId: string | null;
  loadFor: (projectId: string, scenarioId: string | null) => void;
  clear: () => void;
  current: () => TemperatureDistributionResult | null;
  state: () => DistributionState;
  refresh: (projectId: string) => TemperatureDistributionResult | null;
}

export const useDistributionStore = create<DistributionStoreState>((set, get) => ({
  results: {},
  activeKey: null,
  loadedProjectId: null,

  loadFor: (projectId, scenarioId) => {
    const results: Record<string, TemperatureDistributionResult> = {};
    for (const result of loadDistributions(projectId)) {
      results[keyOf(result.network_id, result.scenario_id)] = result;
    }
    const current = context();
    const activeKey = current && scenarioId ? keyOf(current.solution.network_id, scenarioId) : null;
    set({ results, activeKey, loadedProjectId: projectId });

    // First visit materialises Screen 09's formal result. Existing stale output
    // is retained until the engineer explicitly presses Refresh.
    if (activeKey && !results[activeKey] && current && !current.solutionStale) {
      get().refresh(projectId);
    }
  },

  clear: () => set({ results: {}, activeKey: null, loadedProjectId: null }),

  current: () => {
    const { activeKey, results } = get();
    return activeKey ? (results[activeKey] ?? null) : null;
  },

  state: () => {
    const current = context();
    const result = get().current();
    if (!current) return 'NOT_READY';
    if (current.solutionStale) return result ? 'STALE' : 'NOT_READY';
    if (!result) return 'READY';
    return isDistributionCurrent(result, current.solution, current.sourceRevision)
      ? 'CURRENT'
      : 'DIRTY';
  },

  refresh: (projectId) => {
    const current = context();
    if (!current || current.solutionStale) return null;
    const result = buildDistributionResult({
      projectId,
      network: current.network,
      solution: current.solution,
      components: current.components,
      sourceRevision: current.sourceRevision,
    });
    const key = keyOf(result.network_id, result.scenario_id);
    saveDistribution(projectId, result);
    set((state) => ({
      results: { ...state.results, [key]: result },
      activeKey: key,
      loadedProjectId: projectId,
    }));
    return result;
  },
}));
