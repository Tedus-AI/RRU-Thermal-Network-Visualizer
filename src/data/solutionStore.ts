/**
 * Thermal solution store — 07 §38, §39, §40, §41, §53.
 *
 * Store contracts (07 §53):
 *   networkStore   [read]        — topology comes from Screen 05, untouched;
 *   scenarioStore  [read]        — ambient / wind / solar / power scale;
 *   boundaryStore  [read]        — the current scenario's boundary set;
 *   componentStore [read]        — limits and identity for the result tables;
 *   solverStore    [read/write]  — lifecycle state only.
 *
 * A solver result is never written back into component master data or into the
 * graph. Each scenario keeps its own solution (07 §41), and a solution whose
 * input signature no longer matches the current inputs is STALE: it may be
 * shown greyed out, never as the current answer (07 §38).
 */

import { normalizeMaterials } from '@/domain/materials';
import { create } from 'zustand';

import {
  deleteSolution,
  loadComponentRevisions,
  loadComponents,
  loadProject,
  loadSolutions,
  saveSolution,
} from './persistence';
import { useBoundaryStore } from './boundaryStore';
import { useComponentStore } from './componentStore';
import { useNetworkStore } from './networkStore';
import { useScenarioStore } from './scenarioStore';
import { useSolverStore } from './solverStore';

import { checkScenario, solveScenario } from '@/thermal/solver/solveScenario';
import type { SolveInput } from '@/thermal/solver/buildSolveInput';
import type { PreSolveReport } from '@/thermal/solver/preSolveChecks';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { hydrateSourceRevision, physicsRevisionMatches } from '@/domain/revision';

const keyOf = (networkId: string, scenarioId: string) => `${networkId}::${scenarioId}`;

interface SolutionStoreState {
  solutions: Record<string, ThermalSolution>;
  activeKey: string | null;
  /** Result of the last explicit pre-solve check, or of the last solve. */
  checks: PreSolveReport | null;
  /** Signature of the CURRENT inputs, recomputed on demand. */
  signature: string | null;
  /** Solve input of the last check/solve — the inspector reads Rth from it. */
  input: SolveInput | null;
  solving: boolean;
  /** A solution exists in memory that has not been written to storage. */
  dirty: boolean;

  loadFor: (projectId: string, scenarioId: string | null) => void;
  clear: () => void;

  current: () => ThermalSolution | null;
  /** 07 §38 — true when the stored solution predates a change to the inputs. */
  isStale: () => boolean;

  refresh: () => void;
  runPreSolveCheck: () => PreSolveReport | null;
  solve: () => ThermalSolution | null;
  resetResults: (projectId: string) => void;
  save: (projectId: string) => void;
}

/** Everything the solver needs, gathered from the other stores. */
function gather(scenarioId: string | null) {
  const network = useNetworkStore.getState().network;
  const boundary = useBoundaryStore.getState();
  const scenario = useScenarioStore
    .getState()
    .scenarios.find((entry) => entry.id === scenarioId);

  if (!network || !scenarioId) return null;
  const componentState = useComponentStore.getState();
  // Screen 07 can be opened directly, before any component-consuming screen.
  // In that case read the persisted clocks instead of attaching the unrelated
  // empty-store revision created at application startup.
  const componentRevisions =
    componentState.loaded_project_id === network.project_id
      ? componentState.revisions
      : loadComponentRevisions(network.project_id);

  return {
    network,
    components:
      componentState.loaded_project_id === network.project_id
        ? componentState.components
        : loadComponents(network.project_id),
    // The edges resolve against the project's own constants, so a solve must
    // carry them rather than fall back to the shipped ones.
    materials: normalizeMaterials(loadProject(network.project_id)?.materials),
    boundarySet: boundary.current(),
    ports: boundary.ports,
    scenarioId,
    powerScale: scenario?.power_scale ?? 1,
    networkId: boundary.current()?.network_id ?? network.network_name,
    sourceRevision: hydrateSourceRevision(
      {
        project_revision: loadProject(network.project_id)?.revision,
        ...componentRevisions,
        network_revision: network.revision,
        scenario_revision: scenario?.revision,
      },
      `${network.project_id}:${network.network_name}:${scenarioId}`,
    ),
  };
}

export const useSolutionStore = create<SolutionStoreState>((set, get) => ({
  solutions: {},
  activeKey: null,
  checks: null,
  signature: null,
  input: null,
  solving: false,
  dirty: false,

  loadFor: (projectId, scenarioId) => {
    const stored = loadSolutions(projectId);
    const solutions: Record<string, ThermalSolution> = {};
    for (const solution of stored) {
      solutions[keyOf(solution.network_id, solution.scenario_id)] = solution;
    }

    const context = gather(scenarioId);
    const activeKey = context ? keyOf(context.networkId, context.scenarioId) : null;

    set({ solutions, activeKey, checks: null, input: null, dirty: false, solving: false });
    get().refresh();

    // A scenario that already carries a valid solution should not present as
    // unsolved when the screen opens (07 §41).
    const current = activeKey ? solutions[activeKey] : null;
    const solver = useSolverStore.getState();
    if (!current) {
      solver.reset();
    } else if (get().isStale()) {
      solver.setSolutionState(current.status, current.solved_at);
      solver.invalidate('source_revision_changed');
    } else {
      solver.setSolutionState(current.status, current.solved_at);
    }
  },

  clear: () =>
    set({
      solutions: {},
      activeKey: null,
      checks: null,
      signature: null,
      input: null,
      dirty: false,
      solving: false,
    }),

  current: () => {
    const { solutions, activeKey } = get();
    return activeKey ? (solutions[activeKey] ?? null) : null;
  },

  isStale: () => {
    const current = get().current();
    const signature = get().signature;
    if (!current || !signature) return false;
    const context = gather(useScenarioStore.getState().activeScenarioId);
    return (
      current.metadata.input_signature !== signature ||
      !context ||
      !physicsRevisionMatches(current.metadata.source_revision, context.sourceRevision)
    );
  },

  /** Recomputes the input signature from the current stores, without solving. */
  refresh: () => {
    const context = gather(useScenarioStore.getState().activeScenarioId);
    if (!context) {
      set({ signature: null });
      return;
    }
    const { signature, input } = checkScenario(context);
    set({ signature, input, activeKey: keyOf(context.networkId, context.scenarioId) });
  },

  runPreSolveCheck: () => {
    const context = gather(useScenarioStore.getState().activeScenarioId);
    if (!context) return null;
    const { checks, input, signature } = checkScenario(context);
    set({ checks, input, signature });
    return checks;
  },

  solve: () => {
    const context = gather(useScenarioStore.getState().activeScenarioId);
    if (!context) return null;

    set({ solving: true });
    useSolverStore.getState().setSolving();

    const { solution, checks, input, signature } = solveScenario(context);
    const key = keyOf(context.networkId, context.scenarioId);

    set((state) => ({
      solutions: { ...state.solutions, [key]: solution },
      activeKey: key,
      checks,
      input,
      signature,
      solving: false,
      dirty: true,
    }));

    useSolverStore.getState().setSolutionState(solution.status, solution.solved_at);
    return solution;
  },

  /**
   * 07 §39 — clears the CURRENT scenario's analytical solution only. Topology,
   * boundary conditions, Rth definitions, future FloTHERM results and
   * measurement data are all left exactly as they are.
   */
  resetResults: (projectId) => {
    const { activeKey, solutions } = get();
    if (!activeKey) return;
    const current = solutions[activeKey];

    const next = { ...solutions };
    delete next[activeKey];
    set({ solutions: next, checks: null, dirty: false });

    if (current) deleteSolution(projectId, current.network_id, current.scenario_id);
    useSolverStore.getState().reset();
    get().refresh();
  },

  save: (projectId) => {
    const current = get().current();
    if (!current) return;
    saveSolution(projectId, current);
    set({ dirty: false });
  },
}));
