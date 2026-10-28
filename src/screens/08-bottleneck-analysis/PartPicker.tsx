/**
 * Which part the screen is working on: every part with a limit, tightest first.
 *
 * It was a row of numbered buttons over the parts at WARNING or FAIL. That
 * answered "which ones are in trouble" but not "show me that one": a part with
 * room left could only be reached from 07's list, and the buttons said nothing
 * until hovered. A dropdown holds every limited part, says the margin in each
 * line, and still opens on the tightest one.
 *
 * The parts within `NEAR_LIMIT_MARGIN_C` lead under their own heading, so the
 * list reads as "these need talking about, then the rest". The number in front
 * of each line is its place by margin, the same number the whole-machine graph
 * puts on its badge.
 *
 * Selecting here is the screen's only navigation: everything below — the graph
 * focus, the segments offered, the projection — follows this choice.
 */

import { Select, type SelectItem } from '@/ui/primitives';
import type { MarginRank } from '@/thermal/analysis/marginRanking';
import { NEAR_LIMIT_MARGIN_C } from '@/thermal/analysis/temperatureDataset';

import { signed } from './analysisViewModel';

export function partOptions(ranked: readonly MarginRank[]): SelectItem[] {
  const flagged = ranked.filter((part) => part.margin_C <= NEAR_LIMIT_MARGIN_C).length;
  return ranked.map((part, index) => ({
    value: part.node_id,
    label: `${index + 1}. ${part.name}\u3000餘裕 ${signed(part.margin_C, 1, '°C')}`,
    group:
      flagged === 0
        ? undefined
        : index < flagged
          ? `需要注意（餘裕 ≤ ${NEAR_LIMIT_MARGIN_C} °C）`
          : '其他元件',
  }));
}

export function PartPicker({
  ranked,
  index,
  onSelect,
}: {
  ranked: readonly MarginRank[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const active = ranked[index] ?? null;

  const flagged = ranked.filter((part) => part.margin_C <= NEAR_LIMIT_MARGIN_C).length;

  return (
    <div className="min-w-0 rounded-lg border border-line-strong bg-surface px-2 py-1.5 shadow-sm">
      <span className="flex min-w-0 items-center gap-2">
        <label
          htmlFor="bottleneck-part"
          className="shrink-0 text-[13px] font-semibold text-ink-900"
        >
          分析元件
        </label>
        {ranked.length > 0 ? (
          <Select
            id="bottleneck-part"
            className="!h-6 min-w-0 flex-1 !pl-2 !text-[11.5px] font-semibold"
            title={active ? `${active.name}\u3000餘裕 ${signed(active.margin_C, 1, '°C')}` : undefined}
            value={active?.node_id ?? ''}
            items={partOptions(ranked)}
            onChange={(event) => {
              const position = ranked.findIndex((part) => part.node_id === event.target.value);
              if (position >= 0) onSelect(position);
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-400">沒有元件設定限溫</span>
        )}
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-ink-400">
        {ranked.length > 0
          ? `依餘裕排序・第 ${index + 1} / ${ranked.length}・${
              flagged > 0 ? `${flagged} 顆餘裕 ≤ ${NEAR_LIMIT_MARGIN_C} °C` : `都超過 ${NEAR_LIMIT_MARGIN_C} °C`
            }`
          : '到 04 元件管理填限溫'}
      </span>
    </div>
  );
}
