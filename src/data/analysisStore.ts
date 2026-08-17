/**
 * Bottleneck analysis store — 08 §14, §22, §23, §25.
 *
 * Store contracts (08 §25):
 *   networkStore   [read]        — the topology, never written;
 *   scenarioStore  [read]        — which scenario is active;
 *   solutionStore  [read]        — Screen 07's baseline solve and its input;
 *   componentStore [read]        — limits and identity for the affected table;
 *   analysisStore  [read/write]  — this.
 *
 * The sensitivity re-solves never touch the baseline: they run on a clone and
 * the Screen 07 solution is only ever read. A proposal records an assumption
 * and a projected benefit — it does not write an Rth anywhere (08 §23).
 */

import { create } from 'zustand';

import {
  deleteAnalysis,
  loadAnalyses,
  loadProposals,
  saveAnalysis,
  saveProposal,
} from './persistence';
import { useNetworkStore } from './networkStore';
import { useScenarioStore } from './scenarioStore';
import { useSolutionStore } from './solutionStore';
import { useComponentStore } from './componentStore';
import { currentSourceRevision } from './sourceRevision';

import { DEFAULT_SOLVER_SETTINGS } from '@/thermal/types';
import { AnalysisCancelled, runAnalysis } from '@/thermal/analysis/bottleneckScore';
import { isAnalysisCurrent } from '@/thermal/analysis/analysisCache';
import {
  ANALYSIS_SCHEMA_VERSION,
  defaultSettings,
  type AnalysisSettings,
  type AnalysisState,
  type BottleneckAnalysis,
  type BottleneckProposal,
  type BottleneckResult,
} from '@/thermal/analysis/analysisTypes';

const keyOf = (networkId: string, scenarioId: string) => `${networkId}::${scenarioId}`;

interface AnalysisStoreState {
  analyses: Record<string, BottleneckAnalysis>;
  proposals: BottleneckProposal[];
  activeKey: string | null;
  settings: AnalysisSettings;

  running: boolean;
  progress: { done: number; total: number };
  /** Set by `cancel()`; read by the run loop between candidates. */
  cancelRequested: boolean;
  /** An analysis exists in memory that has not been written to storage. */
  dirty: boolean;
  lastError: string | null;

  loadFor: (projectId: string, scenarioId: string | null) => void;
  clear: () => void;

  current: () => BottleneckAnalysis | null;
  /** 08 §14 — the state the screen displays. */
  state: () => AnalysisState;

  setSettings: (patch: Partial<AnalysisSettings>) => void;
  run: (projectId: string) => Promise<BottleneckAnalysis | null>;
  cancel: () => void;
  reset: (projectId: string) => void;
  save: (projectId: string) => void;
  createProposal: (projectId: string, result: BottleneckResult, note?: string) => BottleneckProposal | null;
}

/** Everything a run needs, gathered from the read-only stores. */
function gather() {
  const network = useNetworkStore.getState().network;
  const scenarioId = useScenarioStore.getState().activeScenarioId;
  const solutions = useSolutionStore.getState();
  const solution = solutions.current();
  const input = solutions.input;
  const scenario = useScenarioStore
    .getState()
    .scenarios.find((entry) => entry.id === scenarioId);

  if (!network || !scenarioId || !solution || !input) return null;

  return {
    network,
    scenarioId,
    solution,
    input,
    networkId: solution.network_id,
    stale: solutions.isStale(),
    solverSettings: network.solver_settings ?? DEFAULT_SOLVER_SETTINGS,
    components: useComponentStore.getState().components,
    sourceRevision: currentSourceRevision(network.project_id, network, scenario),
  };
}

export const useAnalysisStore = create<AnalysisStoreState>((set, get) => ({
  analyses: {},
  proposals: [],
  activeKey: null,
  settings: defaultSettings(),
  running: false,
  progress: { done: 0, total: 0 },
  cancelRequested: false,
  dirty: false,
  lastError: null,

  loadFor: (projectId, scenarioId) => {
    const stored = loadAnalyses(projectId);
    const analyses: Record<string, BottleneckAnalysis> = {};
    for (const analysis of stored) {
      analyses[keyOf(analysis.network_id, analysis.scenario_id)] = analysis;
    }

    const context = gather();
    const activeKey =
      context && scenarioId ? keyOf(context.networkId, scenarioId) : null;

    // Reopening a scenario restores the settings its analysis was run with, so
    // the controls agree with the numbers on screen.
    const existing = activeKey ? analyses[activeKey] : null;

    set({
      analyses,
      proposals: loadProposals(projectId),
      activeKey,
      settings: existing ? { ...defaultSettings(), ...existing.settings } : defaultSettings(),
      running: false,
      progress: { done: 0, total: 0 },
      cancelRequested: false,
      dirty: false,
      lastError: null,
    });
  },

  clear: () =>
    set({
      analyses: {},
      proposals: [],
      activeKey: null,
      settings: defaultSettings(),
      running: false,
      progress: { done: 0, total: 0 },
      cancelRequested: false,
      dirty: false,
      lastError: null,
    }),

  current: () => {
    const { analyses, activeKey } = get();
    return activeKey ? (analyses[activeKey] ?? null) : null;
  },

  state: () => {
    const { running } = get();
    if (running) return 'RUNNING';

    const context = gather();
    // 08 §7 — no valid Screen 07 solution means no analysis can be run at all.
    if (!context || context.stale || context.solution.status === 'FAILED') return 'NOT_READY';

    const analysis = get().current();
    if (!analysis) return 'READY';

    const fresh = isAnalysisCurrent(
      analysis,
      context.solution.metadata.input_signature,
      get().settings,
      context.sourceRevision,
    );
    if (!fresh) return 'DIRTY';
    return analysis.state;
  },

  /** Any setting that changes the answer makes the stored analysis DIRTY. */
  setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

  run: async (projectId) => {
    const context = gather();
    if (!context) {
      set({ lastError: 'No Screen 07 solution is available for this scenario.' });
      return null;
    }
    if (context.stale || context.solution.status === 'FAILED') {
      set({
        lastError:
          'The Screen 07 solution is stale or failed. Re-solve the network before analysing it.',
      });
      return null;
    }

    set({ running: true, cancelRequested: false, progress: { done: 0, total: 0 }, lastError: null });

    try {
      const analysis = await runAnalysis(
        {
          project_id: projectId,
          network_id: context.networkId,
          scenario_id: context.scenarioId,
          network: context.network,
          components: context.components,
          sourceRevision: context.sourceRevision,
          baselineInput: context.input,
          baselineSolution: context.solution,
          settings: get().settings,
          solverSettings: context.solverSettings,
        },
        {
          onProgress: (done, total) => set({ progress: { done, total } }),
          shouldCancel: () => get().cancelRequested,
        },
      );

      const key = keyOf(context.networkId, context.scenarioId);
      set((state) => ({
        analyses: { ...state.analyses, [key]: analysis },
        activeKey: key,
        running: false,
        dirty: true,
      }));
      return analysis;
    } catch (error) {
      if (error instanceof AnalysisCancelled) {
        // 08 §27 — cancelling leaves the baseline and any previous analysis alone.
        set({ running: false, cancelRequested: false, progress: { done: 0, total: 0 } });
        return null;
      }
      set({
        running: false,
        lastError: error instanceof Error ? error.message : 'The analysis failed.',
      });
      return null;
    }
  },

  cancel: () => set({ cancelRequested: true }),

  reset: (projectId) => {
    const { activeKey, analyses } = get();
    if (!activeKey) return;
    const current = analyses[activeKey];

    const next = { ...analyses };
    delete next[activeKey];
    set({ analyses: next, dirty: false, lastError: null, progress: { done: 0, total: 0 } });

    // Only the analysis is cleared. The Screen 07 baseline, the topology, the
    // boundary set and any saved proposals are untouched.
    if (current) deleteAnalysis(projectId, current.network_id, current.scenario_id);
  },

  save: (projectId) => {
    const current = get().current();
    if (!current) return;
    saveAnalysis(projectId, current);
    set({ dirty: false });
  },

  /**
   * 08 §23 — records the assumption and the projected benefit. It does not
   * change an Rth: the real engineering change goes back through 04 / 05 / 06,
   * which is why `applied` is a literal false rather than a mutable flag.
   */
  createProposal: (projectId, result, note) => {
    const context = gather();
    if (!context) return null;

    const proposal: BottleneckProposal = {
      id: `PROP_${context.scenarioId}_${result.edge_id}_${result.sensitivity.reduction_pct}`,
      schema_version: ANALYSIS_SCHEMA_VERSION,
      project_id: projectId,
      scenario_id: context.scenarioId,
      edge_id: result.edge_id,
      edge_label: result.edge_label,
      reduction_pct: result.sensitivity.reduction_pct,
      baseline: {
        rth_C_per_W: result.sensitivity.original_rth_C_per_W,
        target_temperature_C: result.sensitivity.baseline_target_C,
        worst_margin_C: result.sensitivity.baseline_worst_margin_C,
      },
      projected: {
        rth_C_per_W: result.sensitivity.modified_rth_C_per_W,
        target_temperature_C: result.sensitivity.modified_target_C,
        worst_margin_C: result.sensitivity.modified_worst_margin_C,
      },
      score: result.score,
      classification: result.classification,
      target_metric: get().settings.target_metric,
      recommendation: result.recommendation.points,
      note,
      created_at: new Date().toISOString(),
      applied: false,
    };

    saveProposal(projectId, proposal);
    set((state) => ({
      proposals: [...state.proposals.filter((entry) => entry.id !== proposal.id), proposal],
    }));
    return proposal;
  },
}));
