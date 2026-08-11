/**
 * Presentation helpers for Screen 08.
 *
 * Formatting only. Nothing here recomputes a score or re-orders a ranking — the
 * order arrives from the analysis run and is displayed as given.
 */

import type { Confidence } from '@/thermal/types';
import type { Tone } from '@/ui/primitives';
import type {
  AnalysisState,
  BottleneckAnalysis,
  BottleneckResult,
  Classification,
} from '@/thermal/analysis/analysisTypes';

/** A missing value is N/A. It is never rendered as 0. */
export function num(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const text = Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(digits);
  return unit ? `${text} ${unit}` : text;
}

export function rth(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

export function signed(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const text = `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
  return unit ? `${text} ${unit}` : text;
}

export function percent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)} %`;
}

export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export const ANALYSIS_STATE_TONE: Record<AnalysisState, Tone> = {
  NOT_READY: 'neutral',
  READY: 'accent',
  RUNNING: 'accent',
  COMPLETE: 'ok',
  WARNING: 'warn',
  FAILED: 'danger',
  DIRTY: 'warn',
};

export const CONFIDENCE_TONE: Record<Confidence, Tone> = {
  high: 'ok',
  medium: 'warn',
  low: 'danger',
};

export const CONFIDENCE_ZH: Record<Confidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const CLASSIFICATION_ZH: Record<Classification, string> = {
  Critical: '關鍵',
  High: '高',
  Medium: '中',
  Low: '低',
};

/** 08 §5 — why an edge did not become a candidate, in words. */
export const REJECTION_LABELS: Record<string, { label: string; zh: string }> = {
  disabled: { label: 'Disabled edge', zh: '已停用的連線' },
  ideal_link: { label: 'Ideal link', zh: '理想連結（熱阻可忽略）' },
  no_solved_flow: { label: 'No solved heat flow', zh: '沒有已求解的熱流' },
  no_resistance: { label: 'No usable resistance', zh: '沒有可用熱阻' },
  filtered_out: { label: 'Filtered out', zh: '被篩選條件排除' },
  out_of_scope: { label: 'Outside the scope', zh: '不在分析範圍內' },
};

export function rejectionSummary(analysis: BottleneckAnalysis | null): Array<{
  reason: string;
  count: number;
}> {
  if (!analysis) return [];
  const counts = new Map<string, number>();
  for (const entry of analysis.rejected) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/** The ranking table as CSV — the mockup's "Export Table" link. */
export function rankingCsv(analysis: BottleneckAnalysis): string {
  const header = [
    'Rank',
    'Score',
    'Edge',
    'Path / Component',
    'Type',
    'Rth (C/W)',
    'Q (W)',
    'dT (C)',
    'Sensitivity dT (C)',
    'Margin Impact (C)',
    'Affected Components',
    'Confidence',
    'Source',
    'Classification',
    'Sensitivity Solve',
  ];

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const rows = analysis.results.map((result: BottleneckResult) =>
    [
      result.rank,
      result.score,
      escape(result.edge_label),
      escape(result.path_label),
      escape(result.edge_type),
      result.baseline.rth_C_per_W,
      result.baseline.heat_flow_W,
      result.baseline.delta_T_C,
      result.sensitivity.target_improvement_C,
      result.sensitivity.margin_improvement_C,
      result.sensitivity.affected_component_count,
      result.confidence,
      result.baseline.rth_source,
      result.classification,
      result.sensitivity.solve_status,
    ].join(','),
  );

  return [header.join(','), ...rows].join('\n');
}

export function downloadCsv(filename: string, contents: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
