/**
 * Temperature histogram — 09 §11, §12, §13, §40.
 *
 * X = temperature (°C), Y = node count, over the CURRENT scope and filters only.
 * The bins are computed by the app and handed to Plotly as bars, so the same
 * data always produces the same picture (09 §40).
 *
 * 09 §12 allows Average, P95 and the warning threshold as reference lines, and
 * explicitly forbids collapsing different components' Tj/Tc limits into one
 * global limit line — so no limit line is drawn here at all. Per-component
 * limits belong on the Component Bars view, where each bar has its own.
 */

import { forwardRef, useMemo } from 'react';

import { PlotlyChart, type PlotlyChartHandle, type PlotlyTrace } from '@/ui/PlotlyChart';
import type { HistogramBin } from '@/thermal/analysis/temperatureStatistics';

import { buildScale } from './distributionViewModel';

export interface HistogramReferenceLine {
  value: number;
  label: string;
  color: string;
  dash: 'dash' | 'dot';
}

export const TemperatureHistogram = forwardRef<
  PlotlyChartHandle,
  {
    bins: HistogramBin[];
    references: HistogramReferenceLine[];
    onSelectBin?: (bin: HistogramBin) => void;
  }
>(function TemperatureHistogram({ bins, references, onSelectBin }, ref) {
  const scale = useMemo(
    () => buildScale(bins.flatMap((bin) => [bin.from_C, bin.to_C])),
    [bins],
  );

  const data = useMemo<PlotlyTrace[]>(() => {
    if (bins.length === 0) return [];
    return [
      {
        type: 'bar',
        x: bins.map((bin) => bin.label),
        y: bins.map((bin) => bin.count),
        marker: {
          color: bins.map((bin) => scale.colorOf((bin.from_C + bin.to_C) / 2)),
          line: { color: '#ffffff', width: 1 },
        },
        text: bins.map((bin) => (bin.count > 0 ? String(bin.count) : '')),
        textposition: 'outside',
        textfont: { size: 10 },
        hovertemplate: '%{x} °C<br>%{y} node(s)<extra></extra>',
        cliponaxis: false,
      },
    ];
  }, [bins, scale]);

  const layout = useMemo(() => {
    const maxCount = bins.reduce((best, bin) => Math.max(best, bin.count), 0);
    return {
      xaxis: {
        title: { text: 'Temperature (°C)', standoff: 12, font: { size: 11 } },
        type: 'category',
        tickfont: { size: 10 },
        showgrid: false,
        linecolor: '#cbd5e1',
        // Bin labels are wide ("290–295") and Plotly rotates them once there are
        // more than a handful, which pushes them straight through a fixed bottom
        // margin and over the axis title. automargin lets the plot area shrink
        // instead, so the title stays readable at any bin width.
        automargin: true,
      },
      yaxis: {
        title: { text: 'Node Count', standoff: 8, font: { size: 11 } },
        rangemode: 'tozero',
        dtick: maxCount <= 5 ? 1 : undefined,
        gridcolor: '#e2e8f0',
        zerolinecolor: '#cbd5e1',
        tickfont: { size: 10 },
        automargin: true,
      },
      bargap: 0.18,
      // Reference lines are drawn against the temperature the bins represent,
      // positioned by interpolating into the category axis so they land between
      // bars rather than snapping to one.
      shapes: references.flatMap((reference) => {
        const position = categoryPosition(bins, reference.value);
        if (position == null) return [];
        return [
          {
            type: 'line',
            xref: 'x',
            yref: 'paper',
            x0: position,
            x1: position,
            y0: 0,
            y1: 1,
            line: { color: reference.color, width: 1.5, dash: reference.dash },
          },
        ];
      }),
      annotations: references.flatMap((reference) => {
        const position = categoryPosition(bins, reference.value);
        if (position == null) return [];
        return [
          {
            x: position,
            y: 1.02,
            xref: 'x',
            yref: 'paper',
            text: reference.label,
            showarrow: false,
            font: { size: 10, color: reference.color },
            yanchor: 'bottom',
          },
        ];
      }),
      margin: { l: 52, r: 16, t: 34, b: 48 },
    };
  }, [bins, references]);

  if (bins.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-[12px] text-ink-400">
          No temperature data matches the current filters.
          <span className="block">目前的篩選條件沒有符合的溫度資料。</span>
        </p>
      </div>
    );
  }

  return (
    <PlotlyChart
      ref={ref}
      data={data}
      layout={layout}
      ariaLabel="Temperature distribution histogram — node count per temperature bin"
      onPointClick={(index) => onSelectBin?.(bins[index])}
    />
  );
});

/**
 * Where a temperature falls on the category axis, in bar-index units.
 * Returns null when the value is outside the plotted range, so a reference line
 * is omitted rather than clamped onto the edge where it would read as data.
 */
function categoryPosition(bins: HistogramBin[], value: number): number | null {
  if (bins.length === 0 || !Number.isFinite(value)) return null;
  const first = bins[0].from_C;
  const width = bins[0].to_C - bins[0].from_C;
  if (!(width > 0)) return null;
  const position = (value - first) / width - 0.5;
  if (position < -0.5 || position > bins.length - 0.5) return null;
  return position;
}
