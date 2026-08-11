/**
 * Temperature Statistics — 09 §23, PNG left column bottom card.
 *
 * Every figure describes the ACTIVE FILTERED dataset and nothing else, so it
 * moves when the scope or a filter moves. P90, P95, the median and the standard
 * deviation each carry an engineering explanation rather than a translation,
 * per 09 §3.2 and §56.
 */

import { EngineeringInfo } from '@/ui/FieldLabel';
import type { TemperatureStatistics } from '@/thermal/analysis/temperatureStatistics';

import { num } from './distributionViewModel';
import { T09 } from './tooltips';

export function TemperatureStatisticsPanel({
  statistics,
}: {
  statistics: TemperatureStatistics;
}) {
  const rows: Array<{ label: string; zh: string; value: string; explanation?: string }> = [
    { label: 'Count', zh: '節點數', value: String(statistics.count) },
    { label: 'Min', zh: '最低', value: num(statistics.min_C, 1, '°C') },
    { label: 'Max', zh: '最高', value: num(statistics.max_C, 1, '°C') },
    { label: 'Mean', zh: '平均', value: num(statistics.mean_C, 1, '°C') },
    {
      label: 'Median',
      zh: '中位數',
      value: num(statistics.median_C, 1, '°C'),
      explanation: T09.median,
    },
    { label: 'P90', zh: '第 90 百分位', value: num(statistics.p90_C, 1, '°C'), explanation: T09.p90 },
    { label: 'P95', zh: '第 95 百分位', value: num(statistics.p95_C, 1, '°C'), explanation: T09.p95 },
    {
      label: 'Std Dev',
      zh: '標準差',
      value: num(statistics.std_dev_C, 1, '°C'),
      explanation: T09.standardDeviation,
    },
  ];

  return (
    <dl className="grid gap-0">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0"
        >
          <dt className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-ink-700">
            <span className="truncate">{row.label}</span>
            <EngineeringInfo zh={row.explanation ?? row.zh} label={row.label} align="left" />
          </dt>
          <dd className="shrink-0 text-[12px] font-bold text-ink-900 tabular">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
