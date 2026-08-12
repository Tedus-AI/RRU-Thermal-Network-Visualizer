/**
 * Thermal Network CSV — 12 §12, AC-12-14.
 *
 * Two logical tables, exactly as §12 lists them. `Q` and `Delta T` come from the
 * solver, so when there is no current solution they are BLANK — §12 says they
 * may be, and a blank is the only honest way to say "this configuration has not
 * been solved". They are never written as 0.
 */

import type { ThermalEdge, ThermalNetwork, ThermalNode } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { activeRth } from '@/thermal/rth';

import { buildCsv, type CsvColumn } from './csv';
import type { ExportConfiguration } from './exportTypes';

export interface NetworkCsvInput {
  network: ThermalNetwork;
  scenario_name: string;
  /** Omitted or null when the network has never been solved, or is stale. */
  solution: ThermalSolution | null;
  config: ExportConfiguration;
}

export interface NetworkCsvOutput {
  nodes: string;
  edges: string;
}

function nodeColumns(input: NetworkCsvInput): Array<CsvColumn<ThermalNode>> {
  const temperatures = input.solution?.node_temperatures_C ?? {};
  return [
    { header: 'Node ID', value: (node) => node.id },
    { header: 'Name', value: (node) => node.name },
    { header: 'Type', value: (node) => node.type },
    { header: 'Component', value: (node) => node.component_ref },
    { header: 'Zone', value: (node) => node.zone ?? node.zone_id },
    { header: 'Power', unit: 'W', value: (node) => node.power_W },
    { header: 'Limit Type', value: (node) => node.limit_type },
    { header: 'Limit', unit: '°C', value: (node) => node.limit_C },
    { header: 'Temperature', unit: '°C', value: (node) => temperatures[node.id] ?? null },
    { header: 'Scenario', value: () => input.scenario_name },
  ];
}

function edgeColumns(input: NetworkCsvInput): Array<CsvColumn<ThermalEdge>> {
  const results = input.solution?.edge_results ?? {};
  return [
    { header: 'Edge ID', value: (edge) => edge.id },
    { header: 'From', value: (edge) => input.network.nodes[edge.from]?.name ?? edge.from },
    { header: 'To', value: (edge) => input.network.nodes[edge.to]?.name ?? edge.to },
    { header: 'Type', value: (edge) => edge.type },
    { header: 'Method', value: (edge) => edge.method },
    // The resistance the SOLVER would read, not every slot: the per-source
    // values live in the JSON export, which can carry the whole RthValue.
    { header: 'Active Rth', unit: '°C/W', value: (edge) => activeRth(edge.rth) },
    { header: 'Rth Source', value: (edge) => edge.rth.active_source },
    { header: 'Q', unit: 'W', value: (edge) => results[edge.id]?.heat_flow_W ?? null },
    { header: 'Delta T', unit: '°C', value: (edge) => results[edge.id]?.delta_T_C ?? null },
    { header: 'Confidence', value: (edge) => edge.confidence },
    { header: 'Enabled', value: (edge) => (edge.enabled ? 'true' : 'false') },
  ];
}

export function exportNetworkCsv(input: NetworkCsvInput): NetworkCsvOutput {
  const nodes = Object.values(input.network.nodes).sort((a, b) => a.id.localeCompare(b.id));
  const edges = Object.values(input.network.edges).sort((a, b) => a.id.localeCompare(b.id));

  return {
    nodes: buildCsv(nodes, nodeColumns(input), input.config),
    edges: buildCsv(edges, edgeColumns(input), input.config),
  };
}
