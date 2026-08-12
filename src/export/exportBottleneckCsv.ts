/**
 * Bottleneck Analysis CSV — 12 §13, AC-12-15.
 *
 * Only the CURRENT Screen 08 analysis is exported. A stale analysis is blocked
 * upstream by the validator rather than exported with a caveat, because a
 * ranking computed against a superseded solve is not a weaker answer — it is an
 * answer to a different question (08 §1: ranking comes from a full re-solve).
 *
 * `Reduction %` and `Target Metric` are analysis SETTINGS, identical on every
 * row. They are repeated per row anyway so a spreadsheet filtered down to three
 * lines still says what assumption produced them.
 */

import type { BottleneckAnalysis, BottleneckResult } from '@/thermal/analysis/analysisTypes';
import { TARGET_METRIC_LABELS } from '@/thermal/analysis/analysisTypes';

import { buildCsv, type CsvColumn } from './csv';
import type { ExportConfiguration } from './exportTypes';

export interface BottleneckCsvInput {
  analysis: BottleneckAnalysis;
  config: ExportConfiguration;
}

function columns(analysis: BottleneckAnalysis): Array<CsvColumn<BottleneckResult>> {
  return [
    { header: 'Rank', value: (row) => row.rank, raw: true },
    { header: 'Edge ID', value: (row) => row.edge_id },
    { header: 'Edge', value: (row) => row.edge_label },
    { header: 'Path', value: (row) => row.path_label },
    { header: 'Type', value: (row) => row.edge_type },
    { header: 'Rth', unit: '°C/W', value: (row) => row.baseline.rth_C_per_W },
    { header: 'Q', unit: 'W', value: (row) => row.baseline.heat_flow_W },
    { header: 'Delta T', unit: '°C', value: (row) => row.baseline.delta_T_C },
    {
      header: 'Sensitivity Improvement',
      unit: '°C',
      value: (row) => row.sensitivity.target_improvement_C,
    },
    { header: 'Margin Impact', unit: '°C', value: (row) => row.sensitivity.margin_improvement_C },
    {
      header: 'Affected Components',
      value: (row) => row.sensitivity.affected_component_count,
      raw: true,
    },
    { header: 'Score', value: (row) => row.score },
    { header: 'Classification', value: (row) => row.classification },
    { header: 'Confidence', value: (row) => row.confidence },
    { header: 'Source', value: (row) => row.baseline.rth_source },
    { header: 'Reduction %', value: () => analysis.settings.reduction_pct, raw: true },
    {
      header: 'Target Metric',
      value: () => TARGET_METRIC_LABELS[analysis.settings.target_metric].label,
    },
  ];
}

export function exportBottleneckCsv(input: BottleneckCsvInput): string {
  const rows = [...input.analysis.results].sort((a, b) => a.rank - b.rank);
  return buildCsv(rows, columns(input.analysis), input.config);
}
