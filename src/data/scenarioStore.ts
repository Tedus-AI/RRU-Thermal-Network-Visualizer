/**
 * Shared scenario store — 01 §37, 00 §34.
 *
 * Scenarios override boundary conditions and selected edge values; they never
 * duplicate the graph. Screen 01 authors only the Baseline scenario; the full
 * scenario editor lives in Screen 06.
 */

import { create } from 'zustand';
import { createBaselineScenario, type Scenario } from '@/domain/project';
import { loadScenarios, saveScenarios } from './persistence';
import { useSolverStore } from './solverStore';

interface ScenarioStoreState {
  scenarios: Scenario[];
  activeScenarioId: string | null;

  loadFor: (projectId: string) => Scenario[];
  clear: () => void;

  createDefaultScenario: (projectId: string) => Scenario;
  updateScenario: (id: string, patch: Partial<Scenario>) => void;
  setActiveScenario: (id: string | null) => void;
  persist: (projectId: string) => void;
  replaceAll: (scenarios: Scenario[]) => void;

  activeScenario: () => Scenario | null;
  scenarioCount: () => number;
}

export const useScenarioStore = create<ScenarioStoreState>((set, get) => ({
  scenarios: [],
  activeScenarioId: null,

  loadFor: (projectId) => {
    const scenarios = loadScenarios(projectId);
    const active = scenarios.find((s) => s.is_default) ?? scenarios[0] ?? null;
    set({ scenarios, activeScenarioId: active?.id ?? null });
    return scenarios;
  },

  clear: () => set({ scenarios: [], activeScenarioId: null }),

  createDefaultScenario: (projectId) => {
    const existing = get().scenarios;
    const baseline = existing.find((s) => s.is_default);
    if (baseline) return baseline;

    const scenario = createBaselineScenario(projectId);
    set({ scenarios: [...existing, scenario], activeScenarioId: scenario.id });
    return scenario;
  },

  updateScenario: (id, patch) => {
    set({
      scenarios: get().scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
    // Ambient / wind / solar / power scale all change the boundary problem.
    useSolverStore.getState().invalidate('boundary_changed');
  },

  setActiveScenario: (id) => {
    set({ activeScenarioId: id });
    useSolverStore.getState().invalidate('scenario_changed');
  },

  persist: (projectId) => saveScenarios(projectId, get().scenarios),

  replaceAll: (scenarios) => set({ scenarios }),

  activeScenario: () => {
    const { scenarios, activeScenarioId } = get();
    return scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0] ?? null;
  },

  scenarioCount: () => get().scenarios.length,
}));
