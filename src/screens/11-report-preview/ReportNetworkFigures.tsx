/**
 * The Thermal Network Summary's pictures.
 *
 * Each figure is Screen 07's graph, rendered offscreen at model scale by the
 * same `renderGraphImage` the PDF export uses, with the boards it is not about
 * put away. It is an image rather than a live canvas because this is a report
 * page: it has to survive being printed, and a Cytoscape instance per figure on
 * a six-page preview is a lot of WebGL for a picture nobody will drag.
 *
 * Under a part's figure comes what Screen 08 says could be done about it: the
 * segments a saved study cut, and the inputs that would have to move. Direction
 * only — ↑ and ↓ — because the number a parameter has to reach is a target this
 * report is not making, and printing "9.099 mm" would read as a decision.
 */

import { useEffect, useState } from 'react';

import { buildElements, resultScales } from '@/screens/07-thermal-network/SolvedGraphCanvas';
import { COMBINED_MODE } from '@/screens/07-thermal-network/resultViewModel';
import { renderGraphImage } from '@/export/exportNetworkGraph';
import type { NetworkFigure } from '@/report/networkFigures';
import type { SegmentLevers } from '@/thermal/analysis/tunableParameters';
import type { LanguageMode } from '@/report/reportTypes';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { num, reportLabel, signed } from './reportViewModel';

export interface NetworkFigureContext {
  network: ThermalNetwork;
  solution: ThermalSolution | null;
  scenarioId: string;
}

/** Labels, power and limits on; the boundary drawn, as Screen 10's window has it. */
const DISPLAY = { showLabels: true, showPower: true, showLimits: true, showBoundary: true };

/**
 * Node temperature AND edge ΔT, which is Screen 08's own mode.
 *
 * The figures were drawn in plain Temperature, whose edge labels are watts. A
 * reader looking at a heat path wants to know where the temperature is being
 * spent, and the wattage is the same all the way down a series chain — it says
 * nothing about which link is the expensive one.
 */
const FIGURE_MODE = COMBINED_MODE.id;

/**
 * Every figure ever drawn, by solve and figure key.
 *
 * Module scope rather than component state because the figures are now drawn
 * TWICE over: once in the page the reader is looking at, and once in the
 * offscreen pass that measures how tall each section really is. A cache per
 * component instance would have rendered every graph twice, and again on every
 * page flip — a Cytoscape layout per figure is the most expensive thing this
 * screen does. Keyed by the solve's own signature, so a re-solve draws afresh
 * rather than showing the previous run's pictures.
 */
const IMAGE_CACHE = new Map<string, string>();
/** Subscribers to wake when a figure finishes drawing. */
const CACHE_WATCHERS = new Set<() => void>();
/** Draws in flight, so two copies await one render rather than starting two. */
const IN_FLIGHT = new Map<string, Promise<void>>();
/** Tail of the draw queue; see `ensureFigure`. */
let QUEUE: Promise<unknown> = Promise.resolve();

/**
 * What a figure's picture depends on, beyond the solve.
 *
 * The key was the solve signature and the figure's own id, which meant a
 * figure drawn BEFORE a Screen 08 study was saved kept its cached picture
 * afterwards: the marks changed, the key did not, and the chain showed no
 * numbered segments until the next re-solve threw the cache away. The marks
 * decide what is drawn, so they belong in the key that remembers it.
 */
function figureCacheKey(signature: string, figure: NetworkFigure): string {
  const marks = [...(figure.tuned_edges ?? new Map())]
    .map(([edgeId, mark]) => `${edgeId}@${mark.rank}${mark.active ? '!' : ''}`)
    .sort()
    .join(',');
  return `${signature}:${figure.key}:${marks}`;
}

function publish(key: string, dataUrl: string): void {
  IMAGE_CACHE.set(key, dataUrl);
  for (const watcher of CACHE_WATCHERS) watcher();
}

/**
 * Draw a figure once, however many copies ask for it.
 *
 * Deliberately NOT abandoned when the component that started it unmounts. A
 * figure was previously claimed by whichever copy got there first and dropped
 * if that copy's effect was torn down mid-queue — the key stayed claimed, so no
 * one ever drew it and the figure sat on "Drawing…" for the life of the screen.
 * The cache is module-wide and the work is useful to whoever is still mounted,
 * so the render always runs to completion and only the re-render is conditional.
 */
function ensureFigure(key: string, draw: () => Promise<string>): Promise<void> {
  const existing = IN_FLIGHT.get(key);
  if (existing) return existing;

  // One at a time. Each draw stands up its own Cytoscape instance on a
  // 1600x1000 canvas and runs a dagre layout on it; half a dozen of those at
  // once is a lot of memory for pictures that are wanted in order anyway.
  const task = QUEUE.then(draw)
    .then((dataUrl) => {
      publish(key, dataUrl);
    })
    .catch(() => {
      // A figure that cannot be drawn says so on the page rather than throwing
      // the whole report away, and is allowed to be retried.
      IN_FLIGHT.delete(key);
    });

  IN_FLIGHT.set(key, task);
  QUEUE = task;
  return task;
}

export function ReportNetworkFigures({
  figures,
  context,
  mode,
  measuring = false,
}: {
  figures: readonly NetworkFigure[];
  context: NetworkFigureContext;
  mode: LanguageMode;
  /**
   * This copy is the offscreen one the paginator measures. It tags each figure
   * so the measurer can read a per-figure height, and it never claims a draw
   * it would then have to wait for — it consumes what the visible copy caches.
   */
  measuring?: boolean;
}) {
  const [, bump] = useState(0);
  const signature = context.solution?.metadata.input_signature ?? 'unsolved';

  // Re-render this copy whenever any figure finishes drawing, wherever it was
  // started from.
  useEffect(() => {
    const watcher = () => bump((n) => n + 1);
    CACHE_WATCHERS.add(watcher);
    return () => {
      CACHE_WATCHERS.delete(watcher);
    };
  }, []);

  useEffect(() => {
    const scales = resultScales(context.solution);

    for (const figure of figures) {
      const cacheKey = figureCacheKey(signature, figure);
      if (IMAGE_CACHE.has(cacheKey) || IN_FLIGHT.has(cacheKey)) continue;

      const elements = buildElements(
        context.network,
        context.solution,
        FIGURE_MODE,
        DISPLAY,
        context.scenarioId,
        'Auto',
        scales,
        figure.hidden_component_ids,
        figure.hidden_node_ids,
        undefined,
        // The segments a saved study cuts, numbered on the picture, so the
        // list underneath can say WHICH link each row is about.
        figure.tuned_edges,
      );
      if (elements.length === 0) continue;

      void ensureFigure(cacheKey, async () => {
        const image = await renderGraphImage(elements, 'Auto');
        return image.dataUrl;
      });
    }
  }, [figures, context.network, context.solution, context.scenarioId, signature]);

  if (figures.length === 0) {
    return (
      <p className="border border-[#d7dde5] bg-[#f7f9fc] px-3 py-2 text-[10px] text-[#425067]">
        {reportLabel(mode, 'No solved network to draw.', '沒有可繪製的求解熱網路。')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {figures.map((figure, index) => (
        <figure
          key={figure.key}
          data-measure-item={measuring ? index : undefined}
          className="flex flex-col gap-1"
        >
          <figcaption className="flex items-baseline gap-2">
            <span className="text-[11px] font-bold text-[#16202f]">
              {reportLabel(mode, figure.title, figure.title_zh)}
            </span>
            {figure.part && (
              <span
                className="text-[10px] font-bold tabular"
                style={{ color: figure.status === 'over' ? '#a3222c' : '#8a5a12' }}
              >
                {num(figure.part.temperature_C, 1, '°C')} /{' '}
                {num(figure.part.limit_C, 1, '°C')} · {signed(figure.part.margin_C, 1, '°C')}
              </span>
            )}
            <span className="ml-auto text-[8.5px] text-[#68748a]">
              {reportLabel(mode, figure.note, figure.note_zh)}
            </span>
          </figcaption>

          <div className="flex min-h-[4rem] items-center justify-center border border-[#d7dde5] bg-white p-1">
            {IMAGE_CACHE.get(figureCacheKey(signature, figure)) ? (
              <img
                src={IMAGE_CACHE.get(figureCacheKey(signature, figure))}
                alt={figure.title}
                className="max-h-[52mm] w-auto max-w-full object-contain"
              />
            ) : (
              <span className="py-6 text-[9px] text-[#68748a]">
                {reportLabel(mode, 'Drawing…', '繪製中…')}
              </span>
            )}
          </div>

          {figure.levers && figure.levers.length > 0 && (
            <LeverTable mode={mode} levers={figure.levers} />
          )}
          {figure.part && figure.levers === null && (
            <p className="text-[8.5px] text-[#68748a]">
              {reportLabel(
                mode,
                'No improvement study saved for this part in Screen 08.',
                '此元件在 08 尚未儲存調整分析。',
              )}
            </p>
          )}
          {figure.part && figure.levers?.length === 0 && (
            <p className="text-[8.5px] text-[#68748a]">
              {reportLabel(
                mode,
                'The saved study cuts no segment on this part.',
                '已儲存的調整分析未對此元件切出任何熱阻段。',
              )}
            </p>
          )}
        </figure>
      ))}
    </div>
  );
}

/**
 * The segment's number, drawn as SVG rather than a digit in a round `<span>`.
 *
 * The PDF is rasterized by html2canvas, which places a run of text at its own
 * measured baseline for the font rather than where the browser put it. In a
 * body paragraph a small error is invisible; inside a 14px circle it is the
 * whole design, and the digit came out resting on the bottom edge. Nudging it
 * with padding would only be right for the font this machine happens to
 * resolve `system-ui` to -- the same reason an engineer's PDF does not look
 * like ours.
 *
 * html2canvas draws an `<svg>` by rasterizing it as an image, so its contents
 * land exactly where the browser shows them, whatever the font. Measured in
 * the raster: the digit sits 3.5px from the top of the disc and 4.5px from the
 * bottom, against 7 and 1 for the `<span>` it replaces.
 */
function SegmentBadge({ n }: { n: number }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden
      className="block shrink-0 self-center"
    >
      <circle cx="7" cy="7" r="7" fill="#cb5410" />
      <text
        x="7"
        y="7"
        textAnchor="middle"
        dominantBaseline="central"
        // Named here rather than inherited: a rasterized SVG is drawn as its
        // own image and does not see the page's stylesheet.
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontSize="8"
        fontWeight="700"
        fill="#ffffff"
      >
        {n}
      </text>
    </svg>
  );
}

/** What Screen 08's study says would cool the part, by segment. */
function LeverTable({
  mode,
  levers,
}: {
  mode: LanguageMode;
  levers: SegmentLevers[];
}) {
  return (
    <div className="border border-[#d7dde5] bg-[#f7f9fc] px-2 py-1.5">
      <p className="mb-1 text-[8.5px] font-bold tracking-wide text-[#68748a] uppercase">
        {reportLabel(mode, 'Planned Improvement · from Screen 08', '預計改善段 · 來自 08')}
      </p>
      <ul className="flex flex-col gap-1">
        {levers.map((segment, index) => (
          <li key={segment.edge_id}>
            <p className="flex items-baseline gap-1.5 text-[9.5px] font-semibold text-[#16202f]">
              {/* The same number the chain above carries on this segment. */}
              <SegmentBadge n={index + 1} />
              {segment.label}
              <span className="font-normal text-[#68748a]">−{segment.reduction_pct}%</span>
            </p>
            {segment.levers.length === 0 ? (
              <p className="text-[8.5px] text-[#68748a]">
                {reportLabel(mode, 'No adjustable input on this segment.', '此段沒有可調整的輸入。')}
              </p>
            ) : (
              <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-[#425067]">
                {segment.levers.map((lever) => (
                  <span key={lever.key} className="whitespace-nowrap">
                    {/* Direction only: the target value is Screen 08's working
                        number, not a decision this report is making. */}
                    <span
                      aria-hidden
                      className="font-bold"
                      style={{ color: lever.direction === 'up' ? '#a3222c' : '#16603a' }}
                    >
                      {lever.direction === 'up' ? '↑' : '↓'}
                    </span>{' '}
                    {reportLabel(mode, lever.label, lever.zh)}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
