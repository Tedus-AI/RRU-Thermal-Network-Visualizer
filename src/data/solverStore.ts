/**
 * Solver lifecycle store — 00 §13, Rule 6.
 *
 * Holds solver state and the last result. Any store that mutates power, Rth,
 * boundaries, scenarios, edge enablement or topology MUST call `invalidate()`.
 * Screens must read `state` before presenting numbers: a DIRTY result may be
 * displayed as stale, never as current (00 §53 forbidden item 3).
 */

import { create } from 'zustand';
import type { SolveResult } from '@/thermal/networkSolver';
import type { DirtyReason, SolverState } from '@/thermal/types';
import type { ValidationIssue } from '@/thermal/networkValidation';

interface SolverStoreState {
  state: SolverState;
  result: SolveResult | null;
  issues: ValidationIssue[];
  lastSolvedAt: string | null;
  dirtyReasons: DirtyReason[];

  invalidate: (reason: DirtyReason) => void;
  setSolving: () => void;
  setResult: (result: SolveResult, issues: ValidationIssue[]) => void;
  setFailed: (issues: ValidationIssue[]) => void;
  reset: () => void;
}

export const useSolverStore = create<SolverStoreState>((set, get) => ({
  state: 'READY',
  result: null,
  issues: [],
  lastSolvedAt: null,
  dirtyReasons: [],

  invalidate: (reason) => {
    const { state, dirtyReasons } = get();
    // Once results exist they become stale; a never-solved network stays READY.
    const nextState: SolverState = state === 'READY' ? 'READY' : 'DIRTY';
    set({
      state: nextState,
      dirtyReasons: dirtyReasons.includes(reason) ? dirtyReasons : [...dirtyReasons, reason],
    });
  },

  setSolving: () => set({ state: 'SOLVING' }),

  setResult: (result, issues) =>
    set({
      result,
      issues,
      state: !result.ok
        ? 'FAILED'
        : result.energy.status === 'ok' && !issues.some((i) => i.severity === 'warning')
          ? 'SOLVED'
          : 'WARNING',
      lastSolvedAt: new Date().toISOString(),
      dirtyReasons: [],
    }),

  setFailed: (issues) => set({ state: 'FAILED', issues, result: null }),

  reset: () =>
    set({ state: 'READY', result: null, issues: [], lastSolvedAt: null, dirtyReasons: [] }),
}));

/** Label used by the Project Overview "Last Solve" row (01 §10). */
export function lastSolveLabel(state: SolverState, lastSolvedAt: string | null): string {
  if (!lastSolvedAt) return 'Not Solved';
  switch (state) {
    case 'SOLVED':
      return 'Solved';
    case 'WARNING':
      return 'Solved with warnings';
    case 'DIRTY':
      return 'Stale (inputs changed)';
    case 'SOLVING':
      return 'Solving…';
    case 'FAILED':
      return 'Failed';
    default:
      return 'Not Solved';
  }
}
