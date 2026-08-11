/**
 * Top 3 Bottlenecks — 10 §9.
 *
 * READ-ONLY, and read from Screen 08 alone. This panel never re-runs a
 * sensitivity, never ranks an edge itself, and shows nothing at all when 08's
 * stored analysis does not match the current solve — a ranking built against a
 * different baseline is not a stale opinion about this design, it is an opinion
 * about a different one (AC-10-08, AC-10-09).
 */

import { ArrowRight, Ban } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { ColumnLabel, EngineeringInfo } from '@/ui/FieldLabel';
import { CLASSIFICATION_TONE } from '@/thermal/analysis/analysisTypes';
import type {
  BottleneckAvailability,
  BottleneckSummary,
} from '@/thermal/overview/overviewTypes';

import { CONFIDENCE_LABEL, CONFIDENCE_TONE, num } from './overviewViewModel';
import { T10 } from './tooltips';

const UNAVAILABLE: Record<Exclude<BottleneckAvailability, 'current'>, { en: string; zh: string }> = {
  not_run: {
    en: 'Bottleneck analysis has not been run for this scenario.',
    zh: '此情境尚未執行 bottleneck 分析。',
  },
  // 10 §9's exact wording for a result that exists but no longer applies.
  stale: {
    en: 'Bottleneck analysis is not current.',
    zh: 'Bottleneck 分析不是最新的。',
  },
  failed: {
    en: 'The last bottleneck analysis failed.',
    zh: '上次 bottleneck 分析失敗。',
  },
};

export function BottleneckSummaryPanel({
  rows,
  availability,
  selectedEdgeId,
  onSelect,
  onOpenAnalysis,
}: {
  rows: BottleneckSummary[];
  availability: BottleneckAvailability;
  selectedEdgeId: string | null;
  onSelect: (edgeId: string) => void;
  onOpenAnalysis: () => void;
}) {
  if (availability !== 'current' || rows.length === 0) {
    const message = UNAVAILABLE[availability === 'current' ? 'not_run' : availability];
    return (
      <div className="flex flex-col items-start gap-2 py-4">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-ink-700">
          <Ban className="size-4 text-ink-400" aria-hidden />
          {message.en}
        </p>
        <p className="text-[11px] text-ink-500">{message.zh}</p>
        {/* 10 §9, AC-10-19 — no ranking is shown and none is invented. */}
        <p className="text-[11px] text-ink-400">
          No ranking is shown here rather than an estimated one.
          <span className="block">此處不以估算值取代實際排名。</span>
        </p>
        <Button icon={<ArrowRight className="size-4" />} onClick={onOpenAnalysis}>
          Open Bottleneck Analysis / 開啟瓶頸分析
        </Button>
      </div>
    );
  }

  return (
    <table className="w-full min-w-[40rem] border-collapse text-[11px]">
      <thead>
        <tr className="border-b border-line text-left align-bottom text-ink-700">
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Rank" zh="排名" />
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Edge" zh="連線" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <span className="flex items-center justify-end gap-1">
              <ColumnLabel label="Score" zh="分數" />
              <EngineeringInfo zh={T10.topBottleneck} label="Top Bottleneck" />
            </span>
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Classification" zh="分級" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <span className="flex items-center justify-end gap-1">
              <ColumnLabel label="Sensitivity Improvement" zh="敏感度改善" unit="°C" />
              <EngineeringInfo
                zh={T10.sensitivityImprovement}
                label="Sensitivity Improvement"
              />
            </span>
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <span className="flex items-center justify-end gap-1">
              <ColumnLabel label="Affected Components" zh="受影響元件" />
              <EngineeringInfo zh={T10.affectedComponents} label="Affected Components" />
            </span>
          </th>
          <th className="py-1.5 font-semibold">
            <span className="flex items-center gap-1">
              <ColumnLabel label="Confidence" zh="可信度" />
              <EngineeringInfo zh={T10.confidence} label="Confidence" align="left" />
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.edge_id}
            onClick={() => onSelect(row.edge_id)}
            className={`cursor-pointer border-b border-line/60 transition-colors ${
              selectedEdgeId === row.edge_id ? 'bg-accent-100' : 'hover:bg-surface-muted'
            }`}
          >
            <td className="py-1.5 pr-2 font-bold tabular text-ink-900">{row.rank}</td>
            <td className="py-1.5 pr-2">
              <span className="block max-w-[14rem] truncate font-semibold text-ink-900">
                {row.edge_label}
              </span>
            </td>
            <td className="py-1.5 pr-2 text-right font-bold tabular text-ink-900">
              {row.score.toFixed(0)}
            </td>
            <td className="py-1.5 pr-2">
              <Badge tone={CLASSIFICATION_TONE[row.classification]}>{row.classification}</Badge>
            </td>
            <td className="py-1.5 pr-2 text-right tabular">
              {row.sensitivity_improvement_C == null ? (
                // 08 could not measure one; 0 °C would read as "no benefit".
                <span className="text-ink-400">Not measured</span>
              ) : (
                <span className="font-semibold text-ok-600">
                  {num(row.sensitivity_improvement_C, 1)}
                  <span className="ml-1 text-[10px] font-normal text-ink-400">
                    @ −{row.reduction_pct}% Rth
                  </span>
                </span>
              )}
            </td>
            <td className="py-1.5 pr-2 text-right tabular text-ink-700">
              {row.affected_components}
            </td>
            <td className="py-1.5">
              <Badge tone={CONFIDENCE_TONE[row.confidence]}>
                {CONFIDENCE_LABEL[row.confidence].label}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
