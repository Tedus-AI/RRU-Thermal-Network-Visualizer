/**
 * Component temperature bars — 09 §14, §15, §41.
 *
 * A horizontal bar per node with its OWN limit marker beside it. Each node
 * carries its own Tj / Tc / Ts value, which is why the limits are drawn as
 * per-row markers rather than as the single global line 09 §12 forbids.
 *
 * Sorting is Temperature High → Low by default (09 §14).
 */

import { forwardRef, useMemo } from 'react';

import { PlotlyChart, type PlotlyChartHandle, type PlotlyTrace } from '@/ui/PlotlyChart';
import type { TemperatureRow } from '@/thermal/analysis/temperatureDataset';

import { buildScale, rowLabel } from './distributionViewModel';

export const BAR_SORTS = ['temperature_desc', 'margin_asc', 'name'] as const;
export type BarSort = (typeof BAR_SORTS)[number];

export const BAR_SORT_LABELS: Record<BarSort, { label: string; zh: string }> = {
  temperature_desc: { label: 'Temperature High → Low', zh: '溫度由高到低' },
  margin_asc: { label: 'Margin Low → High', zh: '餘裕由小到大' },
  name: { label: 'Name', zh: '名稱' },
};

export function sortRowsForBars(rows: TemperatureRow[], sort: BarSort): TemperatureRow[] {
  const copy = [...rows];
  switch (sort) {
    case 'margin_asc':
      copy.sort((a, b) => {
        if (a.margin_C == null && b.margin_C == null) return b.temperature_C - a.temperature_C;
        if (a.margin_C == null) return 1;
        if (b.margin_C == null) return -1;
        return a.margin_C - b.margin_C;
      });
      return copy;
    case 'name':
      copy.sort((a, b) => rowLabel(a).localeCompare(rowLabel(b)));
      return copy;
    case 'temperature_desc':
    default:
      copy.sort((a, b) => b.temperature_C - a.temperature_C);
      return copy;
  }
}

export const ComponentTemperatureBars = forwardRef<
  PlotlyChartHandle,
  {
    rows: TemperatureRow[];
    scale?: { min: number; max: number };
    onSelectRow?: (row: TemperatureRow) => void;
  }
>(function ComponentTemperatureBars({ rows, scale: fixedScale, onSelectRow }, ref) {
  // Plotly draws a horizontal bar chart bottom-up, so the array is reversed to
  // put the hottest row at the top where the sort says it belongs.
  const plotted = useMemo(() => [...rows].reverse(), [rows]);
  const colors = useMemo(
    () => buildScale(rows.map((row) => row.temperature_C), fixedScale),
    [rows, fixedScale],
  );

  const data = useMemo<PlotlyTrace[]>(() => {
    if (plotted.length === 0) return [];

    const withLimits = plotted.filter((row) => row.limit_C != null);

    const traces: PlotlyTrace[] = [
      {
        type: 'bar',
        orientation: 'h',
        x: plotted.map((row) => row.temperature_C),
        y: plotted.map((row) => rowLabel(row)),
        marker: { color: plotted.map((row) => colors.colorOf(row.temperature_C)) },
        text: plotted.map((row) => `${row.temperature_C.toFixed(1)} °C`),
        textposition: 'auto',
        textfont: { size: 10 },
        hovertemplate: '%{y}<br>%{x:.1f} °C<extra></extra>',
        name: 'Temperature',
      },
    ];

    if (withLimits.length > 0) {
      traces.push({
        type: 'scatter',
        mode: 'markers',
        orientation: 'h',
        x: withLimits.map((row) => row.limit_C as number),
        y: withLimits.map((row) => rowLabel(row)),
        marker: {
          symbol: 'line-ns-open',
          size: 14,
          line: { width: 2.5, color: '#dc2626' },
          color: '#dc2626',
        },
        // Each marker names the limit it belongs to, so a Tj 180 and a Tc 95
        // are never mistaken for one shared threshold.
        text: withLimits.map(
          (row) =>
            `${row.limit_type ?? 'Limit'} ${(row.limit_C as number).toFixed(0)} °C · margin ${
              row.margin_C == null ? 'N/A' : `${row.margin_C > 0 ? '+' : ''}${row.margin_C.toFixed(1)} °C`
            }`,
        ),
        hovertemplate: '%{text}<extra></extra>',
        name: 'Limit',
      });
    }

    return traces;
  }, [plotted, colors]);

  const layout = useMemo(
    () => ({
      xaxis: {
        title: { text: 'Temperature (°C)', standoff: 8, font: { size: 11 } },
        rangemode: 'tozero',
        gridcolor: '#e2e8f0',
        zerolinecolor: '#cbd5e1',
        tickfont: { size: 10 },
        ...(fixedScale ? { range: [fixedScale.min, fixedScale.max] } : {}),
      },
      yaxis: { automargin: true, tickfont: { size: 10 }, showgrid: false },
      margin: { l: 8, r: 24, t: 12, b: 44 },
      bargap: 0.35,
    }),
    [fixedScale],
  );

  if (rows.length === 0) {
    return <EmptyChart />;
  }

  return (
    <PlotlyChart
      ref={ref}
      data={data}
      layout={layout}
      ariaLabel="Component temperature bars with each node's own thermal limit marker"
      onPointClick={(index, trace) => {
        // Only the bar trace maps one-to-one onto the full row list.
        if (trace !== 0) return;
        onSelectRow?.(plotted[index]);
      }}
    />
  );
});

export function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center">
      <p className="text-[12px] text-ink-400">
        No temperature data matches the current filters.
        <span className="block">目前的篩選條件沒有符合的溫度資料。</span>
      </p>
    </div>
  );
}
