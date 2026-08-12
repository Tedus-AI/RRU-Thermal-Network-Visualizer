/**
 * Results Overview store — 10 §18, §19, §30.
 *
 * Store contracts (10 §30):
 *   solverStore    [read]        — lifecycle state;
 *   solutionStore  [read]        — Screen 07's solve;
 *   analysisStore  [read]        — Screen 08's ranking;
 *   scenarioStore  [read]        — which scenario is active;
 *   componentStore [read]        — thermal limits;
 *   networkStore   [read]        — topology;
 *   overviewStore  [read/write]  — this, and only the report snapshot.
 *
 * "Do not write overview KPIs back into component master data" (10 §30) is the
 * rule this store exists to keep: the ONLY thing it persists is the frozen
 * snapshot. Everything else is derived on read and thrown away.
 */

import { create } from 'zustand';

import { deleteSnapshot, loadSnapshots, saveSnapshot } from './persistence';

import type { ResultsOverview, ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import { buildSnapshot, isSnapshotCurrent } from '@/thermal/overview/snapshotBuilder';

interface OverviewStoreState {
  /** Frozen snapshots, keyed by scenario id. */
  snapshots: Record<string, ResultsOverviewSnapshot>;
  activeScenarioId: string | null;
  loaded: boolean;

  loadFor: (projectId: string, scenarioId: string | null) => void;
  clear: () => void;

  current: () => ResultsOverviewSnapshot | null;
  /** 10 §19 — false once anything the snapshot froze has moved. */
  isCurrentFor: (overview: ResultsOverview | null) => boolean;

  prepare: (
    projectId: string,
    overview: ResultsOverview,
    createdBy?: string,
  ) => ResultsOverviewSnapshot;
  discard: (projectId: string, scenarioId: string) => void;
}

export const useOverviewStore = create<OverviewStoreState>((set, get) => ({
  snapshots: {},
  activeScenarioId: null,
  loaded: false,

  loadFor: (projectId, scenarioId) => {
    const stored = loadSnapshots(projectId);
    const snapshots: Record<string, ResultsOverviewSnapshot> = {};
    for (const snapshot of stored) snapshots[snapshot.scenario_id] = snapshot;
    set({ snapshots, activeScenarioId: scenarioId, loaded: true });
  },

  clear: () => set({ snapshots: {}, activeScenarioId: null, loaded: false }),

  current: () => {
    const { snapshots, activeScenarioId } = get();
    if (!activeScenarioId) return null;
    return snapshots[activeScenarioId] ?? null;
  },

  isCurrentFor: (overview) => isSnapshotCurrent(get().current(), overview),

  prepare: (projectId, overview, createdBy) => {
    const snapshot = buildSnapshot(overview, { created_by: createdBy });
    saveSnapshot(projectId, snapshot);
    set((state) => ({
      snapshots: { ...state.snapshots, [snapshot.scenario_id]: snapshot },
      activeScenarioId: snapshot.scenario_id,
    }));
    return snapshot;
  },

  discard: (projectId, scenarioId) => {
    deleteSnapshot(projectId, scenarioId);
    set((state) => {
      const snapshots = { ...state.snapshots };
      delete snapshots[scenarioId];
      return { snapshots };
    });
  },
}));
