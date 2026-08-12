/**
 * Data Completeness — 10 §12, §20.
 *
 * Components with and without limits, the Rth source summary, low-confidence
 * critical edges and external CFD validation. FloTHERM stays at 0 / Deferred
 * while Screen 03 has no parser (AC-10-16) — and that is a statement about
 * coverage, not a failure: analytical-only is a legitimate V1 state (AC-10-31).
 */

import { Badge } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import {
  RTH_SOURCE_BUCKETS,
  type DataCompletenessSummary,
  type RthSourceBucket,
} from '@/thermal/overview/overviewTypes';

import { T10 } from './tooltips';

const BUCKET_ZH: Record<RthSourceBucket, string> = {
  Analytical: '解析計算',
  Manual: '手動輸入',
  Measurement: '量測',
  FloTHERM: 'FloTHERM',
  Other: '其他來源',
};

export function DataCompletenessPanel({
  completeness,
  onOpenComponents,
}: {
  completeness: DataCompletenessSummary;
  onOpenComponents: () => void;
}) {
  const totalEdges = RTH_SOURCE_BUCKETS.reduce(
    (sum, bucket) => sum + completeness.rth_source_counts[bucket],
    0,
  );

  return (
    <div className="flex flex-col gap-2.5">
      {/* --- limits coverage --------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-line bg-surface-muted px-2.5 py-2">
          <p className="text-[10.5px] font-semibold text-ink-500">Components With Limits</p>
          <p className="text-[10px] text-ink-400">有熱限制的元件</p>
          <p className="text-[16px] font-bold text-ok-600 tabular">
            {completeness.components_with_limits}
          </p>
        </div>
        <div className="rounded-md border border-line bg-surface-muted px-2.5 py-2">
          <p className="text-[10.5px] font-semibold text-ink-500">Components Without Limits</p>
          <p className="text-[10px] text-ink-400">缺少熱限制的元件</p>
          <p
            className={`text-[16px] font-bold tabular ${
              completeness.components_without_limits > 0 ? 'text-warn-600' : 'text-ink-700'
            }`}
          >
            {completeness.components_without_limits}
          </p>
        </div>
      </div>

      {completeness.components_without_limits > 0 && (
        <button
          type="button"
          onClick={onOpenComponents}
          className="self-start text-[10.5px] font-bold text-accent-600 hover:underline"
        >
          Complete missing limits in 04 / 於 04 補齊缺少的限制值
        </button>
      )}

      {/* --- Rth source summary (10 §12) ---------------------------------- */}
      <div>
        <p className="flex items-center gap-1 text-[11px] font-semibold text-ink-700">
          Rth Source Summary
          <span className="font-normal text-ink-400">/ 熱阻來源分佈</span>
          <EngineeringInfo zh={T10.rthSourceSummary} label="Rth Source Summary" align="left" />
        </p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {RTH_SOURCE_BUCKETS.map((bucket) => {
            const count = completeness.rth_source_counts[bucket];
            // `Other` only earns a line when something actually landed in it.
            if (bucket === 'Other' && count === 0) return null;
            const share = totalEdges > 0 ? (count / totalEdges) * 100 : 0;
            const deferred = bucket === 'FloTHERM' && count === 0;
            return (
              <li key={bucket} className="flex items-center gap-2 text-[10.5px]">
                <span className="w-[5.5rem] shrink-0 truncate text-ink-500">
                  {bucket}
                  <span className="ml-1 text-[9.5px] text-ink-400">{BUCKET_ZH[bucket]}</span>
                </span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className="block h-full rounded-full bg-accent-600"
                    style={{ width: `${share}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right font-semibold text-ink-700 tabular">
                  {/* AC-10-16 — the absent dataset is labelled, not printed as a result. */}
                  {deferred ? '0 · Deferred' : count}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* --- confidence and validation ------------------------------------ */}
      <div className="flex flex-col gap-1 border-t border-line pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[11px] text-ink-500">
            Low-confidence Critical Edges
            <EngineeringInfo zh={T10.lowConfidence} label="Low Confidence" align="left" />
          </span>
          <Badge tone={completeness.low_confidence_critical_edges > 0 ? 'warn' : 'ok'}>
            {completeness.low_confidence_critical_edges}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[11px] text-ink-500">
            External CFD Validation
            <EngineeringInfo
              zh={T10.externalCfdValidation}
              label="External CFD Validation"
              align="left"
            />
          </span>
          <Badge tone="neutral">{completeness.external_cfd_validation}</Badge>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[11px] text-ink-500">
            Data Confidence
            <EngineeringInfo zh={T10.analyticalOnly} label="Analytical-only" align="left" />
          </span>
          <Badge tone={completeness.data_confidence === 'Analytical-only' ? 'accent' : 'ok'}>
            {completeness.data_confidence}
          </Badge>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-ink-400">
        Screen 03 FloTHERM Import is deferred, so no external result exists to validate against.
        That is a coverage statement, not a failure.
        <span className="block">
          03 FloTHERM 匯入尚未上線，因此沒有可供比對的外部結果；這是涵蓋度說明，不代表失敗。
        </span>
      </p>
    </div>
  );
}
