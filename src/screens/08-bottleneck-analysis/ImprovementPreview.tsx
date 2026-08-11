/**
 * Improvement Preview — 08 §17.
 *
 * A compact Baseline → Rth −N% comparison of exactly four rows: Target
 * Temperature, Worst Margin, Affected Components, Energy Balance.
 *
 * 08 §17 is explicit that this is NOT a distribution view: no histogram, no
 * per-node bar chart, no spatial map. Those are Screen 09's.
 */

import { FilePlus2 } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { ColumnLabel, biTitle } from '@/ui/FieldLabel';
import { TARGET_METRIC_LABELS, type BottleneckResult } from '@/thermal/analysis/analysisTypes';
import type { TargetMetric } from '@/thermal/analysis/analysisTypes';

import { num, percent, signed } from './analysisViewModel';
import { T08 } from './tooltips';

function Row({
  label,
  zh,
  baseline,
  modified,
  delta,
  tone = '',
}: {
  label: string;
  zh: string;
  baseline: string;
  modified: string;
  delta: string;
  tone?: string;
}) {
  return (
    <tr className="border-b border-line/60">
      <td className="py-1.5 pr-2">
        <span className="font-semibold text-ink-700">{label}</span>
        <span className="ml-1 text-ink-400">/ {zh}</span>
      </td>
      <td className="py-1.5 pr-2 text-right tabular text-ink-500">{baseline}</td>
      <td className="py-1.5 pr-1 text-center text-ink-400" aria-hidden>
        →
      </td>
      <td className="py-1.5 pr-2 text-right font-bold tabular text-ink-900">{modified}</td>
      <td className={`py-1.5 text-right font-bold tabular ${tone || 'text-ink-500'}`}>{delta}</td>
    </tr>
  );
}

export function ImprovementPreview({
  result,
  targetMetric,
  reductionPct,
  readOnly,
  proposalExists,
  onCreateProposal,
}: {
  result: BottleneckResult | null;
  targetMetric: TargetMetric;
  reductionPct: number;
  readOnly: boolean;
  proposalExists: boolean;
  onCreateProposal: () => void;
}) {
  if (!result) {
    return (
      <p className="py-6 text-center text-[11px] text-ink-400">
        Select a candidate in the ranking table to preview its improvement.
        <span className="block">請於排名表中選擇候選，以檢視改善預覽。</span>
      </p>
    );
  }

  const sensitivity = result.sensitivity;
  const failed = sensitivity.solve_status === 'FAILED';
  const metricLabel = TARGET_METRIC_LABELS[targetMetric];

  return (
    <div className="flex flex-col gap-2">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-line text-left align-bottom text-ink-700">
              <th className="py-1 pr-2 font-semibold">
                <ColumnLabel label="Metric" zh="指標" />
              </th>
              <th className="py-1 pr-2 text-right font-semibold">
                <ColumnLabel label="Baseline" zh="基準" />
              </th>
              <th aria-hidden />
              <th className="py-1 pr-2 text-right font-semibold">
                <ColumnLabel label={`Rth −${reductionPct}%`} zh="調整後" />
              </th>
              <th className="py-1 text-right font-semibold">
                <ColumnLabel label="Improvement" zh="改善" />
              </th>
            </tr>
          </thead>
          <tbody>
            <Row
              label={`Target (${metricLabel.label})`}
              zh={metricLabel.zh}
              baseline={num(sensitivity.baseline_target_C, 1, '°C')}
              modified={failed ? 'N/A' : num(sensitivity.modified_target_C, 1, '°C')}
              delta={failed ? 'N/A' : num(sensitivity.target_improvement_C, 1, '°C')}
              tone={sensitivity.target_improvement_C > 0 ? 'text-ok-600' : ''}
            />
            <Row
              label="Worst Margin"
              zh="最小熱餘裕"
              baseline={num(sensitivity.baseline_worst_margin_C, 1, '°C')}
              modified={failed ? 'N/A' : num(sensitivity.modified_worst_margin_C, 1, '°C')}
              delta={failed ? 'N/A' : signed(sensitivity.margin_improvement_C, 1, '°C')}
              tone={sensitivity.margin_improvement_C > 0 ? 'text-ok-600' : ''}
            />
            <Row
              label="Affected Components"
              zh="受影響元件"
              baseline="—"
              modified={failed ? 'N/A' : String(sensitivity.affected_component_count)}
              delta="—"
            />
            <Row
              label="Energy Balance"
              zh="能量平衡"
              baseline={percent(result.sensitivity.energy_error_pct == null ? null : 0)}
              modified={percent(sensitivity.energy_error_pct)}
              delta={sensitivity.solve_status}
              tone={sensitivity.solve_status === 'SOLVED' ? 'text-ok-600' : 'text-warn-600'}
            />
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          icon={<FilePlus2 size={14} />}
          className="h-8 !text-[12px]"
          disabled={readOnly || failed}
          title={biTitle('Create improvement proposal', T08.proposal)}
          onClick={onCreateProposal}
        >
          Create Improvement Proposal / 建立改善提案
        </Button>
        {proposalExists && (
          <span className="text-[11px] font-semibold text-ok-600">
            Saved / 已儲存
          </span>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-ink-400">
        A proposal records the assumption and the projected benefit. It does not
        change any resistance — make the real change in 04 / 05 / 06.
        <span className="block">提案只保存假設與預期效益，不會修改任何熱阻；實際變更請回 04 / 05 / 06。</span>
      </p>
    </div>
  );
}
