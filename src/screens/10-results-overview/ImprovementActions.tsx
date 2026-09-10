/**
 * What is tight, and what Screen 08 says would loosen it — in one section.
 *
 * It replaces two. "Top Bottlenecks" listed the segments Screen 08 had ranked
 * and stopped there; "Engineering Action Summary" restated, in prose, numbers
 * already on the screen. Between them a reader learned that something was near
 * its limit and that a resistance was large, and had to leave to find out
 * whether those two facts were about the same part.
 *
 * So the part is the row. Every one at WARNING or FAIL, worst margin first —
 * the order a review works in — and under it, the parameters a SAVED Screen 08
 * study says could be changed to cool it, recomputed from that study rather
 * than copied, so they cannot drift from what Screen 08 shows.
 *
 * A part with no study says so and offers the trip to make one. That is the
 * honest state: this screen reports, it does not invent an improvement nobody
 * has worked out.
 */

import { useState } from 'react';
import { ArrowRight, ChevronDown, SquarePen } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import { focusHref } from '@/app/focusLink';
import type { MarginRank } from '@/thermal/analysis/marginRanking';
import type { SegmentLevers } from '@/thermal/analysis/tunableParameters';
import type { ImprovementStudy } from '@/thermal/analysis/analysisTypes';

import { num, signed } from './overviewViewModel';
import { T10 } from './tooltips';

export interface ImprovementRow {
  part: MarginRank;
  status: 'warn' | 'over';
  /** The saved study aimed at this part, if one exists. */
  study: ImprovementStudy | null;
  /** Its segments, with what each would take — recomputed, never stored. */
  levers: SegmentLevers[];
}

export function ImprovementActions({
  rows,
  projectId,
  onOpenBottleneck,
}: {
  rows: ImprovementRow[];
  projectId: string;
  onOpenBottleneck: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set<string>());

  if (rows.length === 0) {
    return (
      <p className="py-3 text-[12px] text-ink-500">
        Every monitored part is clear of the near-limit threshold.
        <span className="ml-1">所有受監控元件的餘裕都在門檻之上。</span>
      </p>
    );
  }

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => {
        const expanded = open.has(row.part.node_id);
        const tone = row.status === 'over' ? 'text-danger-600' : 'text-warn-600';

        return (
          <section
            key={row.part.node_id}
            className="rounded-md border border-line bg-surface-muted"
          >
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => toggle(row.part.node_id)}
                aria-expanded={expanded}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title={biTitle('What would loosen this part', '可以放鬆此元件的參數')}
              >
                <ChevronDown
                  size={13}
                  className={`shrink-0 text-ink-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
                />
                <span className="min-w-0 truncate text-[12px] font-bold text-ink-900">
                  {row.part.name}
                </span>
              </button>

              <span className="shrink-0 text-[11px] tabular text-ink-500">
                {num(row.part.temperature_C, 1)} / {num(row.part.limit_C, 0)} °C
                {row.part.limit_type && (
                  <span className="ml-1 text-[10px] text-ink-400">{row.part.limit_type}</span>
                )}
              </span>
              <span className={`shrink-0 text-[12px] font-bold tabular ${tone}`}>
                {signed(row.part.margin_C, 1)} °C
              </span>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                  row.status === 'over'
                    ? 'border-danger-500 bg-danger-100 text-danger-600'
                    : 'border-warn-500 bg-warn-100 text-warn-600'
                }`}
              >
                {row.status === 'over' ? 'FAIL' : 'WARNING'}
              </span>
            </header>

            {expanded && (
              <div className="border-t border-line px-2.5 py-2">
                {row.levers.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-[11px] text-ink-500">
                      沒有針對此元件儲存的調整分析，因此這裡不列出可改參數。
                      <span className="block text-[10px] text-ink-400">
                        No saved study targets this part, so nothing is asserted about how to
                        improve it.
                      </span>
                    </p>
                    <Button
                      className="!h-7 !px-2 !text-[11px]"
                      trailingIcon={<ArrowRight className="size-3.5" />}
                      onClick={() => onOpenBottleneck(row.part.node_id)}
                    >
                      在 08 建立
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {row.study && (
                      <p className="text-[10px] text-ink-400">
                        來自已儲存的調整分析：預估 {signed(row.study.projected.margin_C, 1)} °C 餘裕
                        （目前 {signed(row.study.baseline.margin_C, 1)}）
                      </p>
                    )}
                    {row.levers.map((segment) => (
                      <SegmentBlock key={segment.edge_id} segment={segment} projectId={projectId} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** One cut segment, and the alternatives that would reach it. */
function SegmentBlock({ segment, projectId }: { segment: SegmentLevers; projectId: string }) {
  return (
    <div className="rounded border border-line bg-surface px-2 py-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
        <span className="min-w-0 flex-1 truncate font-semibold text-ink-900" title={segment.label}>
          {segment.label}
        </span>
        <span className="shrink-0 font-bold tabular text-orange-700">
          −{segment.reduction_pct}%
        </span>
      </p>

      {segment.message ? (
        <p className="mt-0.5 text-[10px] text-ink-400">{segment.message}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {segment.levers.map((lever) => (
            <li key={lever.key} className="flex flex-wrap items-baseline gap-x-1.5 text-[10px]">
              <span className="font-semibold text-ink-700">{lever.zh}</span>
              <span className="tabular text-ink-500">
                {lever.value == null ? '—' : num(lever.value, 3)}
                {lever.target != null && (
                  <>
                    {' → '}
                    <span className="font-bold text-ok-700">{num(lever.target, 3)}</span>
                  </>
                )}
                {lever.unit && <span className="ml-0.5 text-ink-400">{lever.unit}</span>}
              </span>
              {lever.destination && (
                <Link
                  to={focusHref(projectId, lever.destination)}
                  className="inline-flex items-center gap-0.5 text-accent-700 hover:underline"
                  title={biTitle(`Open Screen ${lever.screen}`, `前往 ${lever.screen}`)}
                >
                  <SquarePen size={9} />
                  {lever.screen}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The section's own explanation, so the header can carry it. */
export function ImprovementActionsInfo() {
  return <EngineeringInfo zh={T10.improvementActions} label="Improvement Actions" />;
}
