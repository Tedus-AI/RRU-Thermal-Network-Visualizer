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
 */

import { ArrowDown, ArrowUp } from 'lucide-react';

import { ColumnLabel, biTitle } from '@/ui/FieldLabel';
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

export function LeverTable({ segments }: { segments: readonly SegmentLevers[] }) {
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
                        ) : (
                          <span
                            className="text-ink-400"
                            title={biTitle(
                              'Not a power law — this input moves the number, but not by a fixed exponent',
                              '此項與熱阻非冪次關係，方向確定但無法給出目標值',
                            )}
                          >
                            {lever.direction === 'up' ? 'higher' : 'lower'} / 無定值
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-ink-500">
                        {SCREEN_NAME[lever.screen].label}
                        <span className="block text-[10px] text-ink-400">
                          {SCREEN_NAME[lever.screen].zh}
                        </span>
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
