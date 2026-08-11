/**
 * Scenario comparison chart — 09 §17, §19, §42.
 *
 * Grouped bars (baseline beside comparison) or delta bars (comparison minus
 * baseline). Both are horizontal, one row per node, matched by stable node id.
 *
 * A node that only one scenario solved is drawn in neither mode: 09 §17 says it
 * reads N/A. It is counted in the Partial Match warning instead of being given a
 * bar that implies a comparison nobody made.
 *
 * This compares two SOLVED scenarios. It is not a sensitivity study — 09 §19
 * reserves that for Screen 08.
 */

import { forwardRef, useMemo } from 'react';

import { PlotlyChart, type PlotlyChartHandle, type PlotlyTrace } from '@/ui/PlotlyChart';
import type { ScenarioTemperatureComparison } from '@/thermal/analysis/scenarioTemperatureCompare';

import { EmptyChart } from './ComponentTemperatureBars';

export const COMPARE_MODES = ['grouped', 'delta'] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export const COMPARE_MODE_LABELS: Record<CompareMode, { label: string; zh: string }> = {
  grouped: { label: 'Grouped Bars', zh: '並列長條' },
  delta: { label: 'Delta Bars', zh: '差值長條' },
};

const BASELINE_COLOR = '#64748b';
const COMPARISON_COLOR = '#2563eb';
const WARMER = '#dc2626';
const COOLER = '#16a34a';

export const ScenarioComparisonChart = forwardRef<
  PlotlyChartHandle,
  {
    rows: ScenarioTemperatureComparison[];
    mode: CompareMode;
    baselineName: string;
    comparisonName: string;
    /** 09 §22 — a locked scale keeps both scenarios on one axis range. */
    lockedRange?: { min: number; max: number };
    onSelectNode?: (nodeId: string) => void;
  }
>(function ScenarioComparisonChart(
  { rows, mode, baselineName, comparisonName, lockedRange, onSelectNode },
  ref,
) {
  const matched = useMemo(
    () => rows.filter((row) => row.match_status === 'matched'),
    [rows],
  );

  // Reversed for Plotly's bottom-up horizontal axis.
  const plotted = useMemo(() => [...matched].reverse(), [matched]);

  const data = useMemo<PlotlyTrace[]>(() => {
    if (plotted.length === 0) return [];
    const labels = plotted.map((row) => row.node_name);

    if (mode === 'delta') {
      return [
        {
          type: 'bar',
          orientation: 'h',
          x: plotted.map((row) => row.delta_temperature_C as number),
          y: labels,
          marker: {
            color: plotted.map((row) =>
              (row.delta_temperature_C as number) > 0 ? WARMER : COOLER,
            ),
          },
          text: plotted.map((row) => {
            const delta = row.delta_temperature_C as number;
            return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
          }),
          textposition: 'auto',
          textfont: { size: 10 },
          hovertemplate: `%{y}<br>Δ %{x:.2f} °C<extra></extra>`,
          name: 'ΔT',
        },
      ];
    }

    return [
      {
        type: 'bar',
        orientation: 'h',
        x: plotted.map((row) => row.baseline_temperature_C as number),
        y: labels,
        marker: { color: BASELINE_COLOR },
        hovertemplate: `%{y}<br>${baselineName}: %{x:.1f} °C<extra></extra>`,
        name: baselineName,
      },
      {
        type: 'bar',
        orientation: 'h',
        x: plotted.map((row) => row.comparison_temperature_C as number),
        y: labels,
        marker: { color: COMPARISON_COLOR },
        hovertemplate: `%{y}<br>${comparisonName}: %{x:.1f} °C<extra></extra>`,
        name: comparisonName,
      },
    ];
  }, [plotted, mode, baselineName, comparisonName]);

  const layout = useMemo(
    () => ({
      barmode: mode === 'grouped' ? 'group' : 'relative',
      showlegend: mode === 'grouped',
      // Anchored by its bottom edge just above the plot area, with the top
      // margin reserved for it: a fractional paper offset alone put the legend
      // on top of the first bar whenever the card was short.
      legend: { orientation: 'h', y: 1.02, yanchor: 'bottom', x: 0, font: { size: 10 } },
      xaxis: {
        title: {
          text: mode === 'delta' ? 'Δ Temperature (°C)' : 'Temperature (°C)',
          standoff: 8,
          font: { size: 11 },
        },
        gridcolor: '#e2e8f0',
        zerolinecolor: '#334155',
        zerolinewidth: mode === 'delta' ? 1.5 : 1,
        tickfont: { size: 10 },
        automargin: true,
        ...(mode === 'grouped' && lockedRange
          ? { range: [lockedRange.min, lockedRange.max] }
          : {}),
      },
      yaxis: { automargin: true, tickfont: { size: 10 }, showgrid: false },
      margin: { l: 8, r: 24, t: mode === 'grouped' ? 44 : 12, b: 44 },
      bargap: 0.3,
    }),
    [mode, lockedRange],
  );

  if (plotted.length === 0) {
    return rows.length === 0 ? (
      <EmptyChart />
    ) : (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-[12px] text-ink-400">
          No node is present in both scenarios, so there is nothing to compare.
          <span className="block">兩個情境沒有共同的節點，無法比較。</span>
        </p>
      </div>
    );
  }

  return (
    <PlotlyChart
      ref={ref}
      data={data}
      layout={layout}
      ariaLabel={`Scenario comparison: ${baselineName} against ${comparisonName}`}
      onPointClick={(index) => onSelectNode?.(plotted[index].node_id)}
    />
  );
});
