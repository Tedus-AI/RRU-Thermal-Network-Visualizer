/**
 * Energy-balance strip under the graph — 07 §7 (row E), §18, §19.
 *
 * Generated, rejected, residual and residual %, graded <0.5 % green /
 * 0.5–2 % warning / >2 % error. Rejected heat counts only the net flow into a
 * fixed-temperature or boundary sink, so no internal edge is double-counted
 * (07 §19).
 */

import { CircleCheck, TriangleAlert, XCircle } from 'lucide-react';

import type { SolutionEnergyBalance } from '@/thermal/solver/solverTypes';
import { num, percent } from './resultViewModel';
import { T07 } from './tooltips';

const GRADE = {
  green: {
    icon: <CircleCheck size={15} />,
    text: 'text-ok-600',
    bar: 'bg-ok-500',
    label: 'Energy balance OK',
    zh: '能量平衡良好',
  },
  warning: {
    icon: <TriangleAlert size={15} />,
    text: 'text-warn-600',
    bar: 'bg-warn-500',
    label: 'Energy balance warning',
    zh: '能量平衡警告',
  },
  error: {
    icon: <XCircle size={15} />,
    text: 'text-danger-600',
    bar: 'bg-danger-500',
    label: 'Energy balance error',
    zh: '能量平衡誤差過大',
  },
} as const;

export function EnergyBalancePanel({
  balance,
  warnPct,
  errorPct,
  stale,
}: {
  balance: SolutionEnergyBalance | null;
  warnPct: number;
  errorPct: number;
  stale: boolean;
}) {
  if (!balance || stale) {
    return (
      <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[11px] text-ink-400">
        <span className="font-semibold text-ink-500">
          Energy Balance <span className="font-normal">/ 能量平衡</span>
        </span>
        <span>{stale ? 'Stale — re-solve required / 已失效，請重新求解' : 'Not solved yet / 尚未求解'}</span>
      </div>
    );
  }

  const grade = GRADE[balance.grade];
  // The bar shows |residual| against the error threshold, capped at full.
  const fill = Math.min(100, (balance.error_pct / Math.max(errorPct, 0.001)) * 100);

  return (
    <div className="border-t border-line px-3 py-2" title={T07.field.energyBalance}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className={`flex items-center gap-1.5 font-bold ${grade.text}`}>
          {grade.icon}
          {grade.label} <span className="font-semibold text-ink-400">/ {grade.zh}</span>
        </span>

        <span className="text-ink-500">
          Generated <span className="font-bold text-ink-900 tabular">{num(balance.generated_W, 1, 'W')}</span>
          {balance.solar_W > 0 && (
            <span className="text-ink-400">
              {' '}
              (component {balance.component_W.toFixed(1)} + solar {balance.solar_W.toFixed(1)})
            </span>
          )}
        </span>
        <span className="text-ink-500">
          Rejected <span className="font-bold text-ink-900 tabular">{num(balance.rejected_W, 1, 'W')}</span>
        </span>
        <span className="text-ink-500">
          Residual <span className="font-bold text-ink-900 tabular">{num(balance.residual_W, 2, 'W')}</span>
        </span>
        <span className={`font-bold tabular ${grade.text}`}>{percent(balance.error_pct)}</span>

        <span className="ml-auto text-[10px] text-ink-400">
          &lt; {warnPct}% green · {warnPct}–{errorPct}% warning · &gt; {errorPct}% error
        </span>
      </div>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
        <div className={`h-full ${grade.bar}`} style={{ width: `${Math.max(fill, 2)}%` }} />
      </div>
    </div>
  );
}
