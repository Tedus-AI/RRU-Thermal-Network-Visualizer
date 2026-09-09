/**
 * The temperature dataset, derived from the solution on screen.
 *
 * It used to be a stored artefact: Screen 09 pressed Refresh, the rows were
 * written to storage, and Screens 10, 11 and 12 read them back and had to
 * reason about whether what they had read still matched the solve — hence a
 * five-state `DistributionState` with DIRTY and READY in it, and an export
 * that could be blocked on "refresh Screen 09 first".
 *
 * With Screen 09 gone there is nobody to press Refresh, and there never needed
 * to be: the rows are a projection of the solution — one per node, with its
 * limit and margin attached — and building them is a loop over the nodes.
 * Deriving them from the solution the screen is already showing removes the
 * whole class of "these two disagree" without removing anything a reader saw.
 *
 * So three states remain and all three are real: nothing solved, solved but
 * stale, and current.
 */

import { useMemo } from 'react';

import {
  buildDistributionResult,
  type TemperatureDistributionResult,
} from '@/thermal/analysis/distributionResult';

import { useComponentStore } from './componentStore';
import { useNetworkStore } from './networkStore';
import { useScenarioStore } from './scenarioStore';
import { useSolutionStore } from './solutionStore';
import { currentSourceRevision } from './sourceRevision';

export type DerivedDistributionState = 'NOT_READY' | 'STALE' | 'CURRENT';

export function useDistributionResult(): {
  distribution: TemperatureDistributionResult | null;
  state: DerivedDistributionState;
} {
  const network = useNetworkStore((s) => s.network);
  const components = useComponentStore((s) => s.components);
  const solutions = useSolutionStore((s) => s.solutions);
  const activeKey = useSolutionStore((s) => s.activeKey);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const stale = useSolutionStore((s) => s.isStale());

  const solution = activeKey ? (solutions[activeKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;

  return useMemo(() => {
    if (!network || !scenario || !solution) {
      return { distribution: null, state: 'NOT_READY' as const };
    }
    return {
      distribution: buildDistributionResult({
        projectId: network.project_id,
        network,
        solution,
        components,
        sourceRevision: currentSourceRevision(network.project_id, network, scenario),
        // Identity comes from the SOLVE, not from the moment this memo ran.
        // Left to default, a recompute would mint a new id and timestamp for
        // the same rows, and an export stamped with it would look like a
        // different result every time the screen re-rendered.
        id: `DST_${solution.scenario_id}_${solution.metadata.input_signature}`,
        now: solution.solved_at,
      }),
      state: stale ? ('STALE' as const) : ('CURRENT' as const),
    };
  }, [network, components, solution, scenario, stale]);
}
