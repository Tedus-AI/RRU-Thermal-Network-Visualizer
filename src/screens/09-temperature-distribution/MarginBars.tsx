/**
 * Margin bars — 09 §16.
 *
 * Thermal Margin = Limit − Temperature. Positive is safe headroom, negative is
 * over limit, and the zero line is drawn so the sign is unmistakable.
 *
 * 09 §16 is explicit that this is a DISTRIBUTION, not a product verdict: no
 * overall pass/fail is computed here. That is Screen 10's.
 */

import { forwardRef, useMemo } from 'react';

import { PlotlyChart, type PlotlyChartHandle, type PlotlyTrace } from '@/ui/PlotlyChart';
import { NEAR_LIMIT_MARGIN_C, type TemperatureRow } from '@/thermal/analysis/temperatureDataset';

import { EmptyChart } from './ComponentTemperatureBars';
import { rowLabel } from './distributionViewModel';

const OVER = '#dc2626';
const NEAR = '#f59e0b';
const SAFE = '#16a34a';

export const MarginBars = forwardRef<
  PlotlyChartHandle,
  { rows: TemperatureRow[]; onSelectRow?: (row: TemperatureRow) => void }
>(function MarginBars({ rows, onSelectRow }, ref) {
  // Only nodes that HAVE a limit have a margin. A node without one is omitted
  // rather than drawn at zero, which would read as "no headroom left".
  const withMargin = useMemo(
    () => rows.filter((row) => row.margin_C != null && Number.isFinite(row.margin_C)),
    [rows],
  );
  const plotted = useMemo(
    () => [...withMargin].sort((a, b) => (b.margin_C as number) - (a.margin_C as number)),
    [withMargin],
  );

  const data = useMemo<PlotlyTrace[]>(() => {
    if (plotted.length === 0) return [];
    return [
      {
        type: 'bar',
        orientation: 'h',
        x: plotted.map((row) => row.margin_C as number),
        y: plotted.map((row) => rowLabel(row)),
        marker: {
          color: plotted.map((row) => {
            const margin = row.margin_C as number;
            if (margin < 0) return OVER;
            if (margin <= NEAR_LIMIT_MARGIN_C) return NEAR;
            return SAFE;
          }),
        },
        text: plotted.map(
          (row) => `${(row.margin_C as number) > 0 ? '+' : ''}${(row.margin_C as number).toFixed(1)}`,
        ),
        textposition: 'auto',
        textfont: { size: 10 },
        customdata: plotted.map((row) => [
          row.limit_type ?? 'Limit',
          row.limit_C ?? 0,
          row.temperature_C,
        ]),
        hovertemplate:
          '%{y}<br>%{customdata[0]} %{customdata[1]:.0f} °C − %{customdata[2]:.1f} °C = %{x:.1f} °C<extra></extra>',
      },
    ];
  }, [plotted]);

  const layout = useMemo(
    () => ({
      xaxis: {
        title: { text: 'Thermal Margin (°C)', standoff: 8, font: { size: 11 } },
        gridcolor: '#e2e8f0',
        zerolinecolor: '#334155',
        zerolinewidth: 1.5,
        tickfont: { size: 10 },
      },
      yaxis: { automargin: true, tickfont: { size: 10 }, showgrid: false },
      // Top margin reserves room for the "Near limit" annotation above the plot.
      margin: { l: 8, r: 24, t: 26, b: 44 },
      bargap: 0.35,
      shapes: [
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: NEAR_LIMIT_MARGIN_C,
          x1: NEAR_LIMIT_MARGIN_C,
          y0: 0,
          y1: 1,
          line: { color: NEAR, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        {
          x: NEAR_LIMIT_MARGIN_C,
          y: 1.02,
          xref: 'x',
          yref: 'paper',
          text: `Near limit ${NEAR_LIMIT_MARGIN_C} °C`,
          showarrow: false,
          font: { size: 10, color: NEAR },
          yanchor: 'bottom',
        },
      ],
    }),
    [],
  );

  if (plotted.length === 0) {
    return rows.length === 0 ? (
      <EmptyChart />
    ) : (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-[12px] text-ink-400">
          None of the selected nodes has a thermal limit, so there is no margin to
          show.
          <span className="block">目前選取的節點都沒有限制值，因此沒有餘裕可顯示。</span>
        </p>
      </div>
    );
  }

  return (
    <PlotlyChart
      ref={ref}
      data={data}
      layout={layout}
      ariaLabel="Thermal margin bars: limit minus temperature per node"
      onPointClick={(index) => onSelectRow?.(plotted[index])}
    />
  );
});
