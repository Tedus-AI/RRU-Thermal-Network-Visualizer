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

import { useEffect, useRef, useState } from 'react';

import { buildElements, resultScales } from '@/screens/07-thermal-network/SolvedGraphCanvas';
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
const NO_HIDDEN_NODES: ReadonlySet<string> = new Set<string>();

export function ReportNetworkFigures({
  figures,
  context,
  mode,
}: {
  figures: readonly NetworkFigure[];
  context: NetworkFigureContext;
  mode: LanguageMode;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  // Rendering N graphs offscreen is not free, so a figure is drawn once per
  // (figure, solve) and kept. The ref survives the state updates that arrive
  // one figure at a time.
  const done = useRef(new Set<string>());
  const signature = context.solution?.metadata.input_signature ?? 'unsolved';

  useEffect(() => {
    done.current = new Set();
    setImages({});
  }, [signature]);

  useEffect(() => {
    let cancelled = false;
    const scales = resultScales(context.solution);

    (async () => {
      for (const figure of figures) {
        const cacheKey = `${signature}:${figure.key}`;
        if (done.current.has(cacheKey)) continue;
        done.current.add(cacheKey);

        const elements = buildElements(
          context.network,
          context.solution,
          'temperature',
          DISPLAY,
          context.scenarioId,
          'Auto',
          scales,
          figure.hidden_component_ids,
          NO_HIDDEN_NODES,
        );
        if (elements.length === 0) continue;
        try {
          const image = await renderGraphImage(elements, 'Auto');
          if (cancelled) return;
          setImages((current) => ({ ...current, [figure.key]: image.dataUrl }));
        } catch {
          // A figure that cannot be drawn says so below rather than throwing
          // the whole report away.
          done.current.delete(cacheKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
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
      {figures.map((figure) => (
        <figure key={figure.key} className="flex flex-col gap-1">
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
            {images[figure.key] ? (
              <img
                src={images[figure.key]}
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
        {levers.map((segment) => (
          <li key={segment.edge_id}>
            <p className="text-[9.5px] font-semibold text-[#16202f]">
              {segment.label}
              <span className="ml-1 font-normal text-[#68748a]">−{segment.reduction_pct}%</span>
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
