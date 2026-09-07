/**
 * KPI row — 08 §9.
 *
 * Four cards, down from the specification's six, and on the same tile the rest
 * of the app uses (`ui/KpiTile`) rather than a taller local copy.
 *
 * What went, and why:
 *   - Analysis Status repeated the `Analysis <STATE>` badge sitting two inches
 *     above it in the same header, in the same words.
 *   - Top Score was the score OF the top bottleneck, so it is now that card's
 *     own second line instead of a card competing with it.
 *
 * What stays is the question the screen answers: which path is worst, how much
 * margin there is to lose, what the best candidate would buy, and how much of
 * the network was actually measured to find out.
 */

import { Gauge, Network, TrendingUp, TriangleAlert } from 'lucide-react';

import { KpiTile } from '@/ui/KpiTile';
import type { BottleneckAnalysis } from '@/thermal/analysis/analysisTypes';

import { num } from './analysisViewModel';
import { T08 } from './tooltips';

export function BottleneckKpiBar({
  analysis,
  reductionPct,
  stale,
}: {
  analysis: BottleneckAnalysis | null;
  reductionPct: number;
  stale: boolean;
}) {
  // A stale analysis is not the current answer, so its numbers are not shown as
  // if they were (08 §14). The cards fall back to N/A until a re-run.
  const live = stale ? null : analysis;
  const summary = live?.summary ?? null;
  const top = live?.results[0];

  return (
    <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
      <KpiTile
        icon={<TriangleAlert size={13} />}
        label="Top Bottleneck"
        zh="首要瓶頸"
        tooltip={`${T08.kpi.topBottleneck} ${T08.kpi.topScore}`}
        value={summary?.top_bottleneck ?? 'N/A'}
        // The score and its classification belong to this row, so they read as
        // its detail rather than as two more numbers to place.
        status={
          summary?.top_score == null
            ? top?.path_label
            : `${summary.top_score}/100 · ${top?.classification ?? ''}`.trim()
        }
        tone={summary?.top_bottleneck ? 'text-danger-600' : 'text-ink-900'}
      />
      <KpiTile
        icon={<Gauge size={13} />}
        label="Worst Margin"
        zh="最小熱餘裕"
        tooltip={T08.kpi.worstMargin}
        value={num(summary?.worst_margin_C, 1, '°C')}
        status="baseline / 基準解"
        tone={
          summary?.worst_margin_C == null
            ? 'text-ink-900'
            : summary.worst_margin_C < 0
              ? 'text-danger-600'
              : summary.worst_margin_C < 10
                ? 'text-warn-600'
                : 'text-ok-600'
        }
      />
      <KpiTile
        icon={<TrendingUp size={13} />}
        label={`Best ${reductionPct}% Rth Improvement`}
        zh="最佳改善量"
        tooltip={T08.kpi.bestImprovement}
        value={num(summary?.best_improvement_C, 1, '°C')}
        status="target metric / 目標指標"
        tone={(summary?.best_improvement_C ?? 0) > 0 ? 'text-ok-600' : 'text-ink-900'}
      />
      <KpiTile
        icon={<Network size={13} />}
        label="Analyzed Edges"
        zh="已分析連線"
        tooltip={T08.kpi.analyzedEdges}
        value={summary == null ? 'N/A' : String(summary.analyzed_edges)}
        status={
          summary && summary.failed_candidates > 0
            ? `${summary.failed_candidates} failed / 失敗`
            : 'full re-solve each / 逐一完整求解'
        }
        tone={summary && summary.failed_candidates > 0 ? 'text-warn-600' : 'text-ink-900'}
      />
    </div>
  );
}
