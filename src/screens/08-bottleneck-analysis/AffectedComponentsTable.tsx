/**
 * Affected Components — 08 §16.
 *
 * Columns exactly as specified: Component, Baseline T, Modified T, Improvement,
 * Limit, Baseline Margin, Modified Margin.
 *
 * A component that got WARMER is listed too. Reducing one resistance pulls heat
 * down a different branch, and hiding the components that pay for the
 * improvement would misrepresent the redistribution the re-solve just measured.
 */

import { ColumnLabel } from '@/ui/FieldLabel';
import type { AffectedComponent } from '@/thermal/analysis/analysisTypes';
import { num, signed } from './analysisViewModel';
import { T08 } from './tooltips';

export function AffectedComponentsTable({
  components,
  reductionPct,
}: {
  components: AffectedComponent[];
  reductionPct: number;
}) {
  if (components.length === 0) {
    return (
      <p className="py-3 text-center text-[11px] text-ink-400">
        No component changes by 0.5 °C or more.
        <span className="block">沒有元件的溫度變化達 0.5 °C。</span>
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="border-b border-line text-left align-bottom text-ink-700">
          <th className="py-1 pr-1.5 font-semibold">
            <ColumnLabel label="Component" zh="元件" />
          </th>
          <th className="py-1 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Baseline" zh="基準" unit="°C" />
          </th>
          <th className="py-1 pr-1.5 text-right font-semibold">
            <ColumnLabel label={`Rth −${reductionPct}%`} zh="調整後" unit="°C" />
          </th>
          <th className="py-1 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Improve" zh="改善" unit="°C" tooltip={T08.affected} />
          </th>
          <th className="py-1 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Limit" zh="限制" unit="°C" />
          </th>
          <th className="py-1 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Margin" zh="基準餘裕" unit="°C" />
          </th>
          <th className="py-1 text-right font-semibold">
            <ColumnLabel label="New Margin" zh="調整後餘裕" unit="°C" />
          </th>
        </tr>
      </thead>
      <tbody>
        {components.map((component) => (
          <tr key={component.node_id} className="border-b border-line/60">
            <td className="py-1 pr-1.5">
              <span className="block max-w-[8rem] truncate font-semibold text-ink-900">
                {component.name}
              </span>
            </td>
            <td className="py-1 pr-1.5 text-right tabular text-ink-500">
              {num(component.baseline_C, 1)}
            </td>
            <td className="py-1 pr-1.5 text-right tabular text-ink-900">
              {num(component.modified_C, 1)}
            </td>
            <td
              className={`py-1 pr-1.5 text-right font-bold tabular ${
                component.improvement_C > 0 ? 'text-ok-600' : 'text-danger-600'
              }`}
            >
              {signed(component.improvement_C, 1)}
            </td>
            <td className="py-1 pr-1.5 text-right tabular text-ink-500">
              {component.limit_C == null ? '—' : component.limit_C.toFixed(0)}
            </td>
            <td className="py-1 pr-1.5 text-right tabular text-ink-500">
              {component.baseline_margin_C == null ? '—' : component.baseline_margin_C.toFixed(1)}
            </td>
            <td className="py-1 text-right tabular text-ink-900">
              {component.modified_margin_C == null ? '—' : component.modified_margin_C.toFixed(1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
