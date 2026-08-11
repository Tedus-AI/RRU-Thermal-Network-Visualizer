/**
 * Plotly wrapper — 09 §39, §40.
 *
 * 09 §39 requires the engineering charts to be drawn by Plotly rather than
 * hand-rolled SVG. The library is imported DYNAMICALLY: it is by far the largest
 * dependency in the project and only Screen 09 needs it, so Screens 01–08 should
 * not pay for it on first load.
 *
 * Binning, ordering and reference lines are computed by the app and handed over
 * as explicit traces (09 §40) — Plotly is asked to draw, never to decide.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PlotlyConfig, PlotlyLayout, PlotlyTrace } from 'plotly.js-basic-dist-min';

export type { PlotlyLayout, PlotlyTrace };

export interface PlotlyChartHandle {
  /** 09 §43, AC-09-27 — Export Chart PNG. */
  downloadPng: (filename: string) => Promise<void>;
}

/** Shared axis / font styling so every chart on the screen reads as one system. */
export const CHART_BASE_LAYOUT: PlotlyLayout = {
  font: { family: 'inherit', size: 11, color: '#334155' },
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  margin: { l: 56, r: 20, t: 28, b: 44 },
  hoverlabel: { font: { size: 11 } },
  showlegend: false,
};

const CONFIG: PlotlyConfig = {
  displayModeBar: false,
  responsive: false,
  // The app owns the numbers; nobody should be able to edit a point in place.
  editable: false,
  staticPlot: false,
};

export const PlotlyChart = forwardRef<
  PlotlyChartHandle,
  {
    data: PlotlyTrace[];
    layout?: PlotlyLayout;
    /** Announced to assistive technology, since a canvas says nothing on its own. */
    ariaLabel: string;
    className?: string;
    onPointClick?: (pointIndex: number, traceIndex: number) => void;
  }
>(function PlotlyChart({ data, layout, ariaLabel, className = '', onPointClick }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotlyRef = useRef<typeof import('plotly.js-basic-dist-min').default | null>(null);
  const [failed, setFailed] = useState(false);
  const clickRef = useRef(onPointClick);
  clickRef.current = onPointClick;

  // Load once, then keep re-rendering into the same node.
  useEffect(() => {
    let cancelled = false;
    const element = containerRef.current;
    if (!element) return;

    (async () => {
      try {
        const module = await import('plotly.js-basic-dist-min');
        if (cancelled) return;
        plotlyRef.current = module.default;
        await module.default.react(element, data, { ...CHART_BASE_LAYOUT, ...layout }, CONFIG);

        // Plotly's typed event surface is not in the minimal declaration, so the
        // handler is attached through the DOM element it decorates.
        const plotted = element as HTMLElement & {
          on?: (event: string, handler: (event: unknown) => void) => void;
        };
        plotted.on?.('plotly_click', (event) => {
          const points = (event as { points?: Array<{ pointIndex: number; curveNumber: number }> })
            .points;
          const point = points?.[0];
          if (point) clickRef.current?.(point.pointIndex, point.curveNumber);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (plotlyRef.current && element) plotlyRef.current.purge(element);
      plotlyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-draw on data or layout change.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !plotlyRef.current) return;
    void plotlyRef.current.react(element, data, { ...CHART_BASE_LAYOUT, ...layout }, CONFIG);
  }, [data, layout]);

  // Plotly sizes to the container at draw time, so a later resize needs a nudge.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (!plotlyRef.current) return;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      plotlyRef.current.Plots.resize(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    (): PlotlyChartHandle => ({
      downloadPng: async (filename) => {
        const element = containerRef.current;
        if (!element || !plotlyRef.current) return;
        const box = element.getBoundingClientRect();
        await plotlyRef.current.downloadImage(element, {
          format: 'png',
          filename,
          width: Math.max(800, Math.round(box.width)),
          height: Math.max(400, Math.round(box.height)),
        });
      },
    }),
    [],
  );

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-[12px] text-ink-400">
          The chart library could not be loaded.
          <span className="block">圖表函式庫載入失敗。</span>
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      data-testid="plotly-chart"
      className={`size-full ${className}`}
    />
  );
});
