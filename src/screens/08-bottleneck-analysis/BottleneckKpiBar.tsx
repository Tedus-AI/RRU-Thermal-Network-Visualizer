/**
 * KPI row — 08 §9, PNG top row.
 *
 * The six cards the specification requires, in its order: Top Bottleneck,
 * Top Score, Worst Margin, Best {reduction}% Rth Improvement, Analyzed Edges,
 * Analysis Status.
 */

import type { ReactNode } from 'react';
import { CircleCheck, Gauge, Network, TrendingUp, Trophy, TriangleAlert } from 'lucide-react';

import type { Tone } from '@/ui/primitives';
import type { AnalysisState, BottleneckAnalysis } from '@/thermal/analysis/analysisTypes';
import { ANALYSIS_STATE_ZH } from '@/thermal/analysis/analysisTypes';

import { ANALYSIS_STATE_TONE, num } from './analysisViewModel';
import { T08 } from './tooltips';

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-600',
  warn: 'text-warn-600',
  danger: 'text-danger-600',
  neutral: 'text-ink-900',
  accent: 'text-accent-600',
};

function KpiTile({
  icon,
  label,
  zh,
  value,
  status,
  tone = 'neutral',
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  zh: string;
  value: string;
  status?: string;
  tone?: Tone;
  tooltip: string;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5"
      title={`${label} / ${zh} — ${tooltip}`}
    >
      <span className="shrink-0 text-ink-400">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold text-ink-700">{label}</span>
        <span className="block truncate text-[10px] text-ink-400">{zh}</span>
        <span className={`block truncate text-[15px] leading-tight font-bold tabular ${TONE_TEXT[tone]}`}>
          {value}
        </span>
        {status && <span className="block truncate text-[10px] text-ink-400">{status}</span>}
      </span>
    </div>
  );
}

export function BottleneckKpiBar({
  analysis,
  state,
  reductionPct,
  stale,
}: {
  analysis: BottleneckAnalysis | null;
  state: AnalysisState;
  reductionPct: number;
  stale: boolean;
}) {
  // A stale analysis is not the current answer, so its numbers are not shown as
  // if they were (08 §14). The cards fall back to N/A until a re-run.
  const live = stale ? null : analysis;
  const summary = live?.summary ?? null;

  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        icon={<TriangleAlert size={18} />}
        label="Top Bottleneck"
        zh="首要瓶頸"
        tooltip={T08.kpi.topBottleneck}
        value={summary?.top_bottleneck ?? 'N/A'}
        status={live?.results[0]?.path_label}
        tone={summary?.top_bottleneck ? 'danger' : 'neutral'}
      />
      <KpiTile
        icon={<Trophy size={18} />}
        label="Top Score"
        zh="最高分數"
        tooltip={T08.kpi.topScore}
        value={summary?.top_score == null ? 'N/A' : `${summary.top_score} / 100`}
        status={live?.results[0]?.classification}
      />
      <KpiTile
        icon={<Gauge size={18} />}
        label="Worst Margin"
        zh="最小熱餘裕"
        tooltip={T08.kpi.worstMargin}
        value={num(summary?.worst_margin_C, 1, '°C')}
        status="baseline / 基準解"
        tone={
          summary?.worst_margin_C == null
            ? 'neutral'
            : summary.worst_margin_C < 0
              ? 'danger'
              : summary.worst_margin_C < 10
                ? 'warn'
                : 'ok'
        }
      />
      <KpiTile
        icon={<TrendingUp size={18} />}
        label={`Best ${reductionPct}% Rth Improvement`}
        zh="最佳改善量"
        tooltip={T08.kpi.bestImprovement}
        value={num(summary?.best_improvement_C, 1, '°C')}
        status="target metric / 目標指標"
        tone={(summary?.best_improvement_C ?? 0) > 0 ? 'ok' : 'neutral'}
      />
      <KpiTile
        icon={<Network size={18} />}
        label="Analyzed Edges"
        zh="已分析連線"
        tooltip={T08.kpi.analyzedEdges}
        value={summary == null ? 'N/A' : String(summary.analyzed_edges)}
        status={
          summary && summary.failed_candidates > 0
            ? `${summary.failed_candidates} failed / 失敗`
            : 'full re-solve each / 逐一完整求解'
        }
        tone={summary && summary.failed_candidates > 0 ? 'warn' : 'neutral'}
      />
      <KpiTile
        icon={<CircleCheck size={18} />}
        label="Analysis Status"
        zh="分析狀態"
        tooltip={T08.kpi.analysisStatus}
        value={state}
        status={ANALYSIS_STATE_ZH[state]}
        tone={ANALYSIS_STATE_TONE[state]}
      />
    </div>
  );
}
