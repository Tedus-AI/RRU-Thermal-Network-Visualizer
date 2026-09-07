/**
 * Selected Candidate Inspector — 08 §16, PNG right column.
 *
 * Six sections behind a six-tab strip became three sections and no strip. The
 * tabs never hid anything — they scrolled a single column — so with three
 * sections they were a control that only moved the scrollbar.
 *
 * What went, and where it went:
 *
 *   External Mapping   — two rows reading "Reserved / Deferred" and "Not
 *                        Available", plus a paragraph explaining that Screen 08
 *                        does not import FloTHERM. A placeholder for a deferred
 *                        screen is not a finding about this candidate.
 *   Sensitivity Details — ten rows the Improvement Preview already shows, in a
 *                        before/after table, on the same screen, driven by the
 *                        same selection. The one fact only it carried, the
 *                        original and modified Rth, moved there.
 *   Score Weights and normalised terms — the weights are three constants,
 *                        identical on every candidate, so they were a legend
 *                        rendered once per row; the normalised values are how
 *                        the score is computed, not what it says.
 *
 * What stays is what the candidate IS (Overview), what it is doing now
 * (Baseline), who it helps (Affected Components) and what to do about it
 * (Recommendation).
 */

import { useEffect, useRef } from 'react';

import { Badge } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import { CLASSIFICATION_COLOR, CLASSIFICATION_TONE } from '@/thermal/analysis/analysisTypes';
import type { BottleneckResult } from '@/thermal/analysis/analysisTypes';

import { AffectedComponentsTable } from './AffectedComponentsTable';
import { DetailRow } from './DetailRow';
import {
  CLASSIFICATION_ZH,
  CONFIDENCE_TONE,
  CONFIDENCE_ZH,
  num,
  rth as formatRth,
} from './analysisViewModel';
import { T08 } from './tooltips';

function SectionHeading({ title, zh }: { title: string; zh: string }) {
  return (
    <h3 className="mb-1 text-[12px] font-bold text-ink-900">
      {title} <span className="font-semibold text-ink-400">/ {zh}</span>
    </h3>
  );
}

export function BottleneckInspector({
  result,
  onFocusEdge,
}: {
  result: BottleneckResult;
  onFocusEdge: (edgeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // A new candidate starts the reader at the top rather than wherever the last
  // one happened to be scrolled to.
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, [result.edge_id]);

  return (
    <div ref={containerRef} className="h-full min-h-0 overflow-auto pr-0.5">
      {/* --- Overview (08 §16) ------------------------------------------ */}
      <section>
        <DetailRow label="Edge Name" zh="連線名稱" value={result.edge_label} />
        <DetailRow label="Type" zh="類型" value={result.edge_type} />
        <DetailRow label="Component / Zone" zh="元件 / 區域" value={result.path_label} />
        <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
          <span className="text-[11px] font-semibold text-ink-700">
            Score <span className="font-normal text-ink-400">/ 分數</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              title={T08.score}
              className="rounded px-1.5 py-0.5 text-[12px] font-bold text-white tabular"
              style={{ backgroundColor: CLASSIFICATION_COLOR[result.classification] }}
            >
              {result.score}
            </span>
            <Badge tone={CLASSIFICATION_TONE[result.classification]}>
              <span title={T08.field.classification}>
                {result.classification} · {CLASSIFICATION_ZH[result.classification]}
              </span>
            </Badge>
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 py-1.5">
          <span className="text-[11px] font-semibold text-ink-700">
            Confidence <span className="font-normal text-ink-400">/ 信心度</span>
          </span>
          <Badge tone={CONFIDENCE_TONE[result.confidence]}>
            <span title={T08.field.confidence}>
              {result.confidence} · {CONFIDENCE_ZH[result.confidence]}
            </span>
          </Badge>
        </div>
      </section>

      {/* --- Baseline (08 §16) ------------------------------------------ */}
      <section className="mt-3">
        <SectionHeading title="Baseline" zh="目前狀態" />
        <div className="grid grid-cols-2 gap-x-3">
          <div>
            <DetailRow
              label="Rth"
              zh="熱阻"
              value={`${formatRth(result.baseline.rth_C_per_W)} °C/W`}
              tooltip={T08.rth}
            />
            <DetailRow
              label="Q"
              zh="熱流"
              value={num(result.baseline.heat_flow_W, 2, 'W')}
              tooltip={T08.field.heatFlow}
            />
            <DetailRow
              label="ΔT"
              zh="溫差"
              value={num(result.baseline.delta_T_C, 2, '°C')}
              tooltip={T08.field.deltaT}
            />
          </div>
          <div>
            <DetailRow label="T from" zh="起點溫度" value={num(result.baseline.T_from_C, 1, '°C')} />
            <DetailRow label="T to" zh="終點溫度" value={num(result.baseline.T_to_C, 1, '°C')} />
            <DetailRow
              label="Rth Source"
              zh="熱阻來源"
              value={result.baseline.rth_source}
              tooltip={T08.field.source}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onFocusEdge(result.edge_id)}
          title={biTitle('Focus this edge on the graph', '在圖上聚焦此連線')}
          className="mt-1 text-[10px] font-bold text-accent-600 hover:underline"
        >
          Focus on graph / 在圖上定位
        </button>
      </section>

      {/* --- Affected Components (08 §16) ------------------------------- */}
      <section className="mt-3">
        <SectionHeading title="Affected Components" zh="受影響元件" />
        <AffectedComponentsTable
          components={result.sensitivity.affected_components}
          reductionPct={result.sensitivity.reduction_pct}
        />
      </section>

      {/* --- Recommendation (08 §18) — deterministic rules, not a model. -- */}
      <section className="mt-3">
        <div className="rounded-md border border-accent-500/30 bg-accent-100 p-2">
          <p className="text-[11px] font-bold text-accent-700">
            {result.recommendation.title}
            <span className="ml-1 font-semibold text-ink-500">/ {result.recommendation.zh}</span>
          </p>
          <ul className="mt-1 grid list-disc gap-0.5 pl-4">
            {result.recommendation.points.map((point) => (
              <li key={point} className="text-[10px] leading-relaxed text-ink-600">
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

export function InspectorEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
      <p className="text-[12px] font-semibold text-ink-700">Select a candidate to inspect it.</p>
      <p className="text-[11px] text-ink-400">請於排名表或圖面選擇候選連線。</p>
    </div>
  );
}
