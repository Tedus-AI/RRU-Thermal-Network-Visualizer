/**
 * What it would take: the inputs behind each adjusted segment, and their targets.
 *
 * The slider above says "20 % off this TIM". This says what 20 % off a TIM is —
 * a bond line from 0.25 to 0.20 mm, or a pad from 3.0 to 3.75 W/m·K, or 25 %
 * more real contact area — and which screen owns each of those fields.
 *
 * Only one of the rows has to be taken; they are alternatives, not a list of
 * changes. That is why every row carries its own target rather than a share of
 * one, and why the header says "any one of".
 *
 * Two columns make a row actionable rather than merely informative. What the
 * part gets back in °C, so the reader can see which alternative is worth its
 * cost — and where to change it, as a link that lands on the field with the
 * object already selected, not as the name of a screen to go hunting through.
 */

import { ArrowDown, ArrowUp, SquarePen } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ColumnLabel, biTitle } from '@/ui/FieldLabel';
import { focusHref } from '@/app/focusLink';
import type { Lever, SegmentLevers } from '@/thermal/analysis/tunableParameters';

import { num, rth } from './analysisViewModel';

const SCREEN_NAME: Record<Lever['screen'], { label: string; zh: string }> = {
  '04': { label: '04 Component Manager', zh: '元件管理' },
  '05': { label: '05 Thermal Path Builder', zh: '熱路徑建立' },
  '06': { label: '06 Boundary Conditions', zh: '邊界條件' },
};

/** Enough digits to be actionable without pretending to a precision we lack. */
function value(entry: number | null, unit: string): string {
  if (entry == null) return '—';
  const digits = Math.abs(entry) >= 100 ? 0 : Math.abs(entry) >= 10 ? 1 : Math.abs(entry) >= 1 ? 2 : 3;
  return `${num(entry, digits)}${unit ? ` ${unit}` : ''}`;
}

export function LeverTable({
  segments,
  projectId,
  gainOf,
}: {
  segments: readonly SegmentLevers[];
  projectId: string;
  /** What the target part gets back, °C, if this one row is taken. */
  gainOf: (segment: SegmentLevers, lever: Lever) => number | null;
}) {
  if (segments.length === 0) {
    return (
      <p className="text-[11px] text-ink-400">
        Adjust a segment above to see the inputs behind it.
        <span className="ml-1">先在上方調整某一段，這裡就會列出可以動的參數。</span>
      </p>
    );
  }

  return (
    <div className="grid gap-2.5">
      {segments.map((segment) => (
        <section key={segment.edge_id} className="rounded-md border border-line bg-surface-muted">
          <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-ink-900" title={segment.label}>
              {segment.label}
            </span>
            <span className="shrink-0 text-[10px] text-ink-400">{segment.edge_type}</span>
            <span className="shrink-0 text-[11px] font-bold tabular text-orange-700">
              −{segment.reduction_pct}%
            </span>
            <span className="shrink-0 text-[10px] tabular text-ink-500">
              {rth(segment.rth_before_C_per_W ?? 0)} → {rth(segment.rth_after_C_per_W ?? 0)} °C/W
            </span>
          </header>

          {segment.message ? (
            <p className="px-2.5 py-2 text-[11px] text-ink-400">{segment.message}</p>
          ) : (
            <div className="min-w-0 overflow-x-auto px-2.5 py-1.5">
              <p className="pb-1 text-[10px] text-ink-400">
                Any ONE of these reaches it — they are alternatives, not a list of changes.
                <span className="ml-1">以下任一項達成即可，不是全部都要改。</span>
              </p>
              <table className="w-full min-w-[28rem] border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-line text-left align-bottom text-ink-700">
                    <th className="py-1 pr-2 font-semibold">
                      <ColumnLabel label="Parameter" zh="參數" />
                    </th>
                    <th className="py-1 pr-2 text-right font-semibold">
                      <ColumnLabel label="Now" zh="目前" />
                    </th>
                    <th className="py-1 pr-2 text-right font-semibold">
                      <ColumnLabel label="Needs to be" zh="需達到" />
                    </th>
                    <th
                      className="py-1 pr-2 text-right font-semibold"
                      title={biTitle(
                        "What this segment's cut buys the part; a row that cannot reach it shows what that input alone does",
                        '此區段達成後元件可降的溫度；無法單獨達成的項目顯示其單獨可達的效果',
                      )}
                    >
                      <ColumnLabel label="Part cools by" zh="元件降溫" unit="°C" />
                    </th>
                    <th className="py-1 font-semibold">
                      <ColumnLabel label="Edit in" zh="編輯位置" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {segment.levers.map((lever) => (
                    <tr key={lever.key} className="border-b border-line/60 align-top last:border-b-0">
                      <td className="py-1.5 pr-2">
                        <span className="flex items-baseline gap-1">
                          {lever.direction === 'up' ? (
                            <ArrowUp size={11} className="shrink-0 text-ok-600" />
                          ) : (
                            <ArrowDown size={11} className="shrink-0 text-ok-600" />
                          )}
                          <span className="font-semibold text-ink-900">{lever.label}</span>
                          <span className="text-ink-400">/ {lever.zh}</span>
                        </span>
                        {lever.note && (
                          <span className="mt-0.5 block text-[10px] text-ink-400">{lever.note}</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                        {value(lever.value, lever.unit)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular">
                        {lever.target != null ? (
                          <span className="font-bold text-ok-700">
                            {value(lever.target, lever.unit)}
                          </span>
                        ) : lever.limit ? (
                          /* It cannot get there alone. Saying how far it does
                             get is the useful half of that answer. */
                          <span
                            className="text-warn-600"
                            title={biTitle(
                              lever.limit.reason === 'optimum'
                                ? 'Past this value the segment gets worse again, not better'
                                : 'This input cannot go any higher',
                              lever.limit.reason === 'optimum'
                                ? '超過此值後熱阻反而回升'
                                : '此參數已達物理上限',
                            )}
                          >
                            <span className="block font-semibold">
                              not on its own / 單獨不足
                            </span>
                            <span className="block text-[10px] text-ink-400">
                              best {rth(lever.limit.best_rth_C_per_W)} @{' '}
                              {value(lever.limit.at_value, lever.unit)}
                              {lever.limit.reason === 'optimum' ? ' · 最佳點' : ' · 上限'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink-400">
                            {lever.direction === 'up' ? 'higher / 提高' : 'lower / 降低'}
                          </span>
                        )}
                      </td>
                      <Cooling gain={gainOf(segment, lever)} />
                      <td className="py-1.5">
                        {lever.destination ? (
                          <Link
                            to={focusHref(projectId, lever.destination)}
                            title={biTitle(
                              `Open ${SCREEN_NAME[lever.screen].label} with this selected`,
                              `前往${SCREEN_NAME[lever.screen].zh}並選取此項`,
                            )}
                            className="inline-flex items-start gap-1 text-accent-700 hover:underline"
                          >
                            <SquarePen size={11} className="mt-0.5 shrink-0" />
                            <span>
                              {SCREEN_NAME[lever.screen].label}
                              <span className="block text-[10px] text-accent-700/70">
                                {SCREEN_NAME[lever.screen].zh}
                              </span>
                            </span>
                          </Link>
                        ) : (
                          <span className="text-ink-500">
                            {SCREEN_NAME[lever.screen].label}
                            <span className="block text-[10px] text-ink-400">
                              {SCREEN_NAME[lever.screen].zh}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * What the part gets back if this one row is taken.
 *
 * Red, as asked for, and it reads as the temperature it removes: this is the
 * number that decides between two alternatives that cost differently. A row
 * that cannot reach its target still gets one — the gain at the best that input
 * can do on its own, which is smaller and is the honest figure for it.
 */
function Cooling({ gain }: { gain: number | null }) {
  return (
    <td className="py-1.5 pr-2 text-right tabular">
      {gain == null || Math.abs(gain) < 0.005 ? (
        <span className="text-ink-400">—</span>
      ) : (
        <span className="font-bold text-danger-600">−{num(gain, 2)} °C</span>
      )}
    </td>
  );
}
