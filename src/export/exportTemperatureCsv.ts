/**
 * Temperature Results CSV — 12 §10, AC-12-12.
 *
 * The column list is §10's, in §10's order. It is deliberately NOT Screen 09's
 * on-screen CSV: that one serves a filtered table view, this one is the
 * traceable export and therefore carries Project, Node ID and Solved At so a
 * row can be tied back to the exact solve it came from.
 */

import type { Component } from '@/domain/component';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { buildTemperatureDataset, type TemperatureRow } from '@/thermal/analysis/temperatureDataset';

import { buildCsv, type CsvColumn } from './csv';
import type { ExportConfiguration } from './exportTypes';

export interface TemperatureCsvInput {
  project_id: string;
  project_name: string;
  scenario_name: string;
  network: ThermalNetwork;
  solution: ThermalSolution;
  components: Component[];
  rows?: TemperatureRow[];
  config: ExportConfiguration;
}

export function temperatureCsvColumns(
  input: Pick<TemperatureCsvInput, 'project_name' | 'scenario_name' | 'solution'>,
): Array<CsvColumn<TemperatureRow>> {
  return [
    { header: 'Project', value: () => input.project_name },
    { header: 'Scenario', value: () => input.scenario_name },
    { header: 'Node ID', value: (row) => row.node_id },
    { header: 'Node Name', value: (row) => row.node_name },
    { header: 'Component', value: (row) => row.component_name },
    { header: 'Category', value: (row) => row.category },
    { header: 'Node Type', value: (row) => row.node_type },
    { header: 'Zone', value: (row) => row.zone_id },
    { header: 'Temperature', unit: '°C', value: (row) => row.temperature_C },
    { header: 'Limit Type', value: (row) => row.limit_type },
    { header: 'Limit', unit: '°C', value: (row) => row.limit_C },
    // A node without a limit has no margin. It stays blank — 0 would read as
    // "exactly at the limit", which is the opposite of "unknown".
    { header: 'Margin', unit: '°C', value: (row) => row.margin_C },
    { header: 'Result Source', value: (row) => row.result_source },
    { header: 'Solved At', value: () => input.solution.solved_at },
  ];
}

export function exportTemperatureCsv(input: TemperatureCsvInput): string {
  const rows =
    input.rows ??
    buildTemperatureDataset({
      network: input.network,
      solution: input.solution,
      components: input.components,
    });
  return buildCsv(rows, temperatureCsvColumns(input), input.config);
}
