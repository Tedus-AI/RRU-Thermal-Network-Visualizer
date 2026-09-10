/**
 * Three KPI cards, down from six.
 *
 * What went, and why:
 *
 *   Max Temperature — on an RRU it is the PA, every time. A card that always
 *                     names the same part is a label, not a reading.
 *   Top Bottleneck  — said what Worst Thermal Margin already says, one screen
 *                     later and only when Screen 08 happened to be current.
 *   Energy Balance  — Screen 07 carries it beside the solve it judges, which
 *                     is where a reader checking whether to believe a number
 *                     is already standing.
 *
 * What is left is the verdict, the number the verdict rests on, and how much
 * heat the machine is being asked to move. The tile is Screen 06's and 07's —
 * label and value on one line, Chinese and a note beneath — so the three
 * screens read as one product rather than three.
 */

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Minus, Plus, Shield, Zap } from 'lucide-react';

import { biTitle } from '@/ui/FieldLabel';
import { ResultKpiTile } from '@/ui/ResultKpiTile';
import type { OverallThermalStatus, ResultsOverviewKpis } from '@/thermal/overview/overviewTypes';
import { OVERALL_STATUS_LABELS } from '@/thermal/overview/overviewTypes';
import type { PowerSlice } from '@/thermal/overview/powerByCategory';

import { OVERALL_TONE, num, signed } from './overviewViewModel';
import { T10 } from './tooltips';

export function ResultsKpiBar({
  status,
  kpis,
  monitoredCount,
  power,
}: {
  status: OverallThermalStatus;
  kpis: ResultsOverviewKpis;
  monitoredCount: number;
  /** The Total Power card's breakdown, largest slice first. */
  power: PowerSlice[];
}) {
  const [open, setOpen] = useState(false);
  const powerRef = useRef<HTMLDivElement | null>(null);

  // A breakdown left open behind a click elsewhere is a panel the reader has
  // to dismiss twice; closing on an outside click is the behaviour they expect
  // from something opened with a `+`.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!powerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    /* `items-start` so opening the power breakdown grows ONE card. A stretched
       grid would pull the other two to the same height and leave them mostly
       empty, which reads as three cards with something missing from two. */
    <div className="grid grid-cols-1 items-start gap-1.5 sm:grid-cols-3">
      <ResultKpiTile
        icon={BadgeCheck}
        label="Overall Status"
        zh="整體熱狀態"
        explanation={T10.overallStatus}
        value={status}
        valueTone={OVERALL_TONE[status]}
        note={OVERALL_STATUS_LABELS[status].zh}
      />
      <ResultKpiTile
        icon={Shield}
        label="Worst Thermal Margin"
        zh="最小熱餘裕"
        explanation={T10.worstThermalMargin}
        value={signed(kpis.worst_margin_C, 1, '°C')}
        valueTone={
          kpis.worst_margin_C == null
            ? 'neutral'
            : kpis.worst_margin_C < 0
              ? 'danger'
              : kpis.worst_margin_C <= 10
                ? 'warn'
                : 'ok'
        }
        note={
          kpis.worst_margin_C == null
            ? `No monitored node · ${monitoredCount} with limits`
            : (kpis.worst_margin_node ?? undefined)
        }
      />
      <div ref={powerRef}>
        <ResultKpiTile
          icon={Zap}
          label="Total Power"
          zh="總熱功率"
          explanation={T10.totalPower}
          value={num(kpis.total_power_W, 1, 'W')}
          note={open ? undefined : 'Injected into the solve / 注入求解的總熱量'}
          action={
            power.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
                title={biTitle(
                  open ? 'Hide the split by category' : 'Split by component category',
                  open ? '收合分類明細' : '依元件分類展開',
                )}
                className="flex size-4 shrink-0 items-center justify-center rounded border border-line-strong text-ink-500 hover:border-ink-400 hover:text-ink-900"
              >
                {open ? <Minus size={10} /> : <Plus size={10} />}
              </button>
            )
          }
        >
          {open && <PowerSplit slices={power} />}
        </ResultKpiTile>
      </div>
    </div>
  );
}

/** The categories, largest first, with a bar so the split reads at a glance. */
function PowerSplit({ slices }: { slices: PowerSlice[] }) {
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 border-t border-line pt-1.5">
      {slices.map((slice) => (
        <div key={slice.label} className="flex items-center gap-1.5 text-[10px]">
          <span className="w-12 shrink-0 truncate font-semibold text-ink-700">{slice.label}</span>
          <span className="w-8 shrink-0 truncate text-ink-400">{slice.zh}</span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <span
              className="block h-full rounded-full bg-accent-600"
              style={{ width: `${Math.max(slice.share_pct, 1)}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right font-semibold tabular text-ink-900">
            {num(slice.watts, 1, 'W')}
          </span>
          <span className="w-9 shrink-0 text-right tabular text-ink-400">
            {slice.share_pct.toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}
