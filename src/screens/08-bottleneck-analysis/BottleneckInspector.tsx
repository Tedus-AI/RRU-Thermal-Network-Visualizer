/**
 * Selected Candidate Inspector — 08 §16, PNG right column.
 *
 * Two things had to be reconciled here. The Markdown specifies six TABS
 * (Overview, Baseline, Sensitivity, Affected Components, Source, External
 * Mapping); the mockup draws all of those sections stacked and visible at once
 * with the tab strip above them.
 *
 * Both are honoured: every section is rendered in one scrolling column, exactly
 * as the mockup places them, and the tab strip selects and scrolls to a section
 * rather than hiding the other five. Nothing in the specification is left
 * off-screen behind a tab the engineer has to discover.
 */

import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import {
  CLASSIFICATION_COLOR,
  CLASSIFICATION_TONE,
  SCORE_WEIGHTS,
  type BottleneckResult,
} from '@/thermal/analysis/analysisTypes';
import type { TargetMetric } from '@/thermal/analysis/analysisTypes';

import { AffectedComponentsTable } from './AffectedComponentsTable';
import { DetailRow, SensitivityPanel } from './SensitivityPanel';
import {
  CLASSIFICATION_ZH,
  CONFIDENCE_TONE,
  CONFIDENCE_ZH,
  num,
  rth as formatRth,
} from './analysisViewModel';
import { T08 } from './tooltips';

const TABS = [
  { id: 'overview', label: 'Overview', full: 'Overview', zh: '總覽' },
  { id: 'baseline', label: 'Baseline', full: 'Baseline', zh: '基準值' },
  { id: 'sensitivity', label: 'Sensitivity', full: 'Sensitivity', zh: '敏感度' },
  { id: 'affected', label: 'Affected', full: 'Affected Components', zh: '受影響元件' },
  { id: 'source', label: 'Source', full: 'Source & Scoring', zh: '來源與計分' },
  { id: 'mapping', label: 'Mapping', full: 'External Mapping', zh: '外部對應' },
] as const;

type Tab = (typeof TABS)[number]['id'];

function SectionHeading({ title, zh }: { title: string; zh: string }) {
  return (
    <h3 className="mb-1 text-[12px] font-bold text-ink-900">
      {title} <span className="font-semibold text-ink-400">/ {zh}</span>
    </h3>
  );
}

function WeightBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-24 shrink-0 text-[11px] font-semibold text-ink-700">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <span className="block h-full bg-accent-600" style={{ width: `${value * 100}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right text-[11px] font-bold text-ink-900 tabular">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

export function BottleneckInspector({
  result,
  targetMetric,
  onFocusEdge,
}: {
  result: BottleneckResult;
  targetMetric: TargetMetric;
  onFocusEdge: (edgeId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<Tab, HTMLElement | null>>>({});

  // A new candidate starts the reader at the top rather than wherever the last
  // one happened to be scrolled to.
  useEffect(() => {
    setTab('overview');
    containerRef.current?.scrollTo({ top: 0 });
  }, [result.edge_id]);

  const goTo = (next: Tab) => {
    setTab(next);
    sectionRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const register = (id: Tab) => (element: HTMLElement | null) => {
    sectionRefs.current[id] = element;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap gap-0.5 rounded-md border border-line-strong p-0.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={biTitle(entry.full, entry.zh)}
            aria-pressed={tab === entry.id}
            onClick={() => goTo(entry.id)}
            className={`rounded px-1.5 py-1 text-[11px] font-semibold transition-colors ${
              tab === entry.id
                ? 'bg-accent-600 text-white'
                : 'text-ink-500 hover:bg-surface-muted hover:text-ink-900'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto pr-0.5">
        {/* --- Overview (08 §16) --------------------------------------- */}
        <section ref={register('overview')} className="scroll-mt-2">
          <DetailRow label="Edge Name" zh="連線名稱" value={result.edge_label} />
          <DetailRow label="Type" zh="類型" value={result.edge_type} />
          <DetailRow label="Component / Zone" zh="元件 / 區域" value={result.path_label} />
          <DetailRow label="Rank" zh="排名" value={String(result.rank)} />
          <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
            <span className="text-[11px] font-semibold text-ink-700">
              Score <span className="font-normal text-ink-400">/ 分數</span>
            </span>
            <span
              title={T08.score}
              className="rounded px-1.5 py-0.5 text-[12px] font-bold text-white tabular"
              style={{ backgroundColor: CLASSIFICATION_COLOR[result.classification] }}
            >
              {result.score}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 py-1.5">
            <span className="text-[11px] font-semibold text-ink-700">
              Classification <span className="font-normal text-ink-400">/ 分類</span>
            </span>
            <Badge tone={CLASSIFICATION_TONE[result.classification]}>
              <span title={T08.field.classification}>
                {result.classification} · {CLASSIFICATION_ZH[result.classification]}
              </span>
            </Badge>
          </div>
        </section>

        {/* --- Baseline (08 §16) --------------------------------------- */}
        <section ref={register('baseline')} className="mt-3 scroll-mt-2">
          <SectionHeading title="Baseline" zh="基準值" />
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

        {/* --- Sensitivity (08 §16) ------------------------------------ */}
        <section ref={register('sensitivity')} className="mt-3 scroll-mt-2">
          <SectionHeading title="Sensitivity Details" zh="敏感度細節" />
          <SensitivityPanel sensitivity={result.sensitivity} />
        </section>

        {/* --- Affected Components (08 §16) ---------------------------- */}
        <section ref={register('affected')} className="mt-3 scroll-mt-2">
          <SectionHeading title="Affected Components" zh="受影響元件" />
          <AffectedComponentsTable
            components={result.sensitivity.affected_components}
            reductionPct={result.sensitivity.reduction_pct}
          />
        </section>

        {/* --- Source & Scoring (08 §4, §19) --------------------------- */}
        <section ref={register('source')} className="mt-3 scroll-mt-2">
          <SectionHeading title="Source & Scoring" zh="來源與計分" />
          <div className="rounded-md border border-line bg-surface-muted p-2">
            <p className="mb-1 text-[10px] font-bold text-ink-700">
              Score Weights <span className="font-normal text-ink-400">/ 計分權重</span>
            </p>
            <WeightBar label="ΔT" value={SCORE_WEIGHTS.delta_t} />
            <WeightBar label="Sensitivity" value={SCORE_WEIGHTS.sensitivity} />
            <WeightBar label="Margin Impact" value={SCORE_WEIGHTS.margin_impact} />
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400" title={T08.rth}>
              Rth is engineering context only. It carries no ranking weight.
              <span className="block">熱阻僅作為工程參考，不佔任何排名權重。</span>
            </p>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-3">
            <DetailRow
              label="Normalized ΔT"
              zh="正規化溫差"
              value={result.normalized.delta_t.toFixed(2)}
            />
            <DetailRow
              label="Normalized Sens."
              zh="正規化敏感度"
              value={result.normalized.sensitivity.toFixed(2)}
            />
            <DetailRow
              label="Normalized Margin"
              zh="正規化餘裕"
              value={result.normalized.margin_impact.toFixed(2)}
            />
            <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
              <span className="text-[11px] font-semibold text-ink-700">
                Confidence <span className="font-normal text-ink-400">/ 信心度</span>
              </span>
              <Badge tone={CONFIDENCE_TONE[result.confidence]}>
                <span title={T08.field.confidence}>
                  {result.confidence} · {CONFIDENCE_ZH[result.confidence]}
                </span>
              </Badge>
            </div>
          </div>

          {/* 08 §18 — deterministic rules, not a language model. */}
          <div className="mt-2 rounded-md border border-accent-500/30 bg-accent-100 p-2">
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

        {/* --- External Mapping (08 §20) ------------------------------- */}
        <section ref={register('mapping')} className="mt-3 scroll-mt-2">
          <SectionHeading title="External Mapping" zh="外部對應" />
          <DetailRow label="FloTHERM" zh="FloTHERM" value="Reserved / Deferred" tone="text-ink-400" />
          <DetailRow label="Measurement" zh="量測" value="Not Available" tone="text-ink-400" />
          <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
            Screen 08 reads the active solved source only. It never imports a
            file and never produces a FloTHERM number.
            <span className="block">08 只讀取目前作用中的求解來源，不匯入檔案也不產生假數值。</span>
          </p>
        </section>

        <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
          Target metric: {targetMetric.replace(/_/g, ' ')}.
        </p>
      </div>
    </div>
  );
}

export function InspectorEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
      <p className="text-[12px] font-semibold text-ink-700">
        Select a candidate to inspect it.
      </p>
      <p className="text-[11px] text-ink-400">請於排名表或圖面選擇候選連線。</p>
    </div>
  );
}
