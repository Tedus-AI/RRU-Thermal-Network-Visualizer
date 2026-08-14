import type { Component } from '@/domain/component';
import { resultRevisionMatches, type SourceRevision } from '@/domain/revision';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { buildTemperatureDataset, type TemperatureRow } from './temperatureDataset';

export const DISTRIBUTION_SCHEMA_VERSION = '1.0';

export type DistributionState = 'NOT_READY' | 'READY' | 'CURRENT' | 'DIRTY' | 'STALE';

/** Persisted engineering result. UI filters, zoom and selection never enter it. */
export interface TemperatureDistributionResult {
  schema_version: string;
  id: string;
  project_id: string;
  network_id: string;
  scenario_id: string;
  solution_signature: string;
  source_revision: SourceRevision;
  created_at: string;
  rows: TemperatureRow[];
}

export function buildDistributionResult(input: {
  projectId: string;
  network: ThermalNetwork;
  solution: ThermalSolution;
  components: Component[];
  sourceRevision: SourceRevision;
  now?: string;
  id?: string;
}): TemperatureDistributionResult {
  const createdAt = input.now ?? new Date().toISOString();
  return {
    schema_version: DISTRIBUTION_SCHEMA_VERSION,
    id:
      input.id ??
      `DST_${input.solution.scenario_id}_${input.solution.metadata.input_signature}_${createdAt}`,
    project_id: input.projectId,
    network_id: input.solution.network_id,
    scenario_id: input.solution.scenario_id,
    solution_signature: input.solution.metadata.input_signature,
    source_revision: input.sourceRevision,
    created_at: createdAt,
    rows: buildTemperatureDataset({
      network: input.network,
      solution: input.solution,
      components: input.components,
    }),
  };
}

export function isDistributionCurrent(
  result: TemperatureDistributionResult | null,
  solution: ThermalSolution | null,
  sourceRevision: SourceRevision | null,
): boolean {
  if (!result || !solution || !sourceRevision) return false;
  return (
    result.network_id === solution.network_id &&
    result.scenario_id === solution.scenario_id &&
    result.solution_signature === solution.metadata.input_signature &&
    resultRevisionMatches(result.source_revision, sourceRevision)
  );
}
