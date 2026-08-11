/**
 * Shared scenario store — 01 §37, 00 §34.
 *
 * Scenarios override boundary conditions and selected edge values; they never
 * duplicate the graph. Screen 01 authors only the Baseline scenario; the full
 * scenario editor lives in Screen 06.
 */

import { create } from 'zustand';
import { createBaselineScenario, type Scenario } from '@/domain/project';
import { loadProject, loadScenarios, saveProject, saveScenarios } from './persistence';
import { useSolverStore } from './solverStore';

interface ScenarioStoreState {
  scenarios: Scenario[];
  activeScenarioId: string | null;

  loadFor: (projectId: string) => Scenario[];
  clear: () => void;

  createDefaultScenario: (projectId: string) => Scenario;
  updateScenario: (id: string, patch: Partial<Scenario>) => void;
  /** `projectId` persists the choice onto the project record (01 §35). */
  setActiveScenario: (id: string | null, projectId?: string) => void;
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
    // The scenario the engineer picked survives a screen change and a reload.
    // Reloading the list must not silently drag them back to Baseline: Screens
    // 06 and 07 are both per-scenario, so that would pair one screen's boundary
    // set with another screen's solution. In memory first, then the project
    // record, then the default; a scenario that no longer exists falls through.
    const current = get().activeScenarioId;
    const stored = loadProject(projectId)?.active_scenario_id ?? null;
    const active =
      scenarios.find((s) => s.id === current) ??
      scenarios.find((s) => s.id === stored) ??
      scenarios.find((s) => s.is_default) ??
      scenarios[0] ??
      null;
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

  setActiveScenario: (id, projectId) => {
    set({ activeScenarioId: id });
    // Merge-saved onto the project document so the choice outlives a reload.
    // `active_scenario_id` is a field this tool owns (01 §35); everything else
    // on the document is preserved by `saveProject`.
    if (projectId) {
      const project = loadProject(projectId);
      if (project && project.active_scenario_id !== id) {
        saveProject({ ...project, active_scenario_id: id });
      }
    }
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
