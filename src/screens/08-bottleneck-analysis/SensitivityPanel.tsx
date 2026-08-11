/**
 * Sensitivity Details — 08 §16 "Sensitivity" tab, PNG right column.
 *
 * Every row the specification lists: reduction, original / modified Rth,
 * baseline / modified target temperature, temperature improvement, baseline /
 * modified worst margin, margin improvement, energy balance.
 */

import type { SensitivityOutcome } from '@/thermal/analysis/analysisTypes';
import { num, percent, rth, signed } from './analysisViewModel';
import { T08 } from './tooltips';

export function DetailRow({
  label,
  zh,
  value,
  tone = '',
  tooltip,
}: {
  label: string;
  zh: string;
  value: string;
  tone?: string;
  tooltip?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0"
      title={tooltip ? `${label} / ${zh} — ${tooltip}` : `${label} / ${zh}`}
    >
      <span className="min-w-0 text-[11px] font-semibold text-ink-700">
        {label}
        <span className="ml-1 font-normal text-ink-400">/ {zh}</span>
      </span>
      <span className={`shrink-0 text-[12px] font-bold tabular ${tone || 'text-ink-900'}`}>
        {value}
      </span>
    </div>
  );
}

export function SensitivityPanel({ sensitivity }: { sensitivity: SensitivityOutcome }) {
  const failed = sensitivity.solve_status === 'FAILED';

  return (
    <div className="grid grid-cols-2 gap-x-3">
      <div>
        <DetailRow
          label="Reduction"
          zh="降低比例"
          value={`${sensitivity.reduction_pct} %`}
          tooltip={T08.reduction}
        />
        <DetailRow
          label="Original Rth"
          zh="原始熱阻"
          value={`${rth(sensitivity.original_rth_C_per_W)} °C/W`}
        />
        <DetailRow
          label="Modified Rth"
          zh="調整後熱阻"
          value={`${rth(sensitivity.modified_rth_C_per_W)} °C/W`}
        />
        <DetailRow
          label="Baseline Target T"
          zh="基準目標值"
          value={num(sensitivity.baseline_target_C, 1, '°C')}
        />
        <DetailRow
          label="Modified Target T"
          zh="調整後目標值"
          value={failed ? 'N/A' : num(sensitivity.modified_target_C, 1, '°C')}
        />
      </div>
      <div>
        <DetailRow
          label="Baseline Worst Margin"
          zh="基準最小餘裕"
          value={num(sensitivity.baseline_worst_margin_C, 1, '°C')}
        />
        <DetailRow
          label="Modified Worst Margin"
          zh="調整後最小餘裕"
          value={failed ? 'N/A' : num(sensitivity.modified_worst_margin_C, 1, '°C')}
        />
        <DetailRow
          label="Margin Improvement"
          zh="餘裕改善"
          value={failed ? 'N/A' : signed(sensitivity.margin_improvement_C, 1, '°C')}
          tone={sensitivity.margin_improvement_C > 0 ? 'text-ok-600' : 'text-ink-500'}
          tooltip={T08.marginImpact}
        />
        <DetailRow
          label="Temperature Improvement"
          zh="溫度改善"
          value={failed ? 'N/A' : num(sensitivity.target_improvement_C, 1, '°C')}
          tone={sensitivity.target_improvement_C > 0 ? 'text-ok-600' : 'text-ink-500'}
          tooltip={T08.sensitivity}
        />
        <DetailRow
          label="Energy Balance"
          zh="能量平衡"
          value={percent(sensitivity.energy_error_pct)}
          tone={
            sensitivity.energy_error_pct == null
              ? 'text-ink-400'
              : sensitivity.energy_error_pct < 0.5
                ? 'text-ok-600'
                : 'text-warn-600'
          }
          tooltip={T08.field.energyBalance}
        />
      </div>

      {failed && (
        <p className="col-span-2 mt-2 rounded border border-danger-500/40 bg-danger-100 px-2 py-1.5 text-[11px] text-danger-600">
          {sensitivity.message ?? 'This candidate could not be re-solved.'}
          <span className="block text-ink-500">
            此候選的敏感度求解失敗，分數以 0 呈現，其餘候選不受影響。
          </span>
        </p>
      )}
    </div>
  );
}
