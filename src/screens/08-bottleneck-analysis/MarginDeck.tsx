/**
 * Every part at WARNING or FAIL, stacked as one card.
 *
 * Separate cards would take a column each of a header that already has to fit
 * the margin, the projection and the study count. So they are a deck: the
 * chosen one is on top, the others show as offset edges behind it, and the
 * numbers select between them. The depth is what makes it read as several
 * records rather than as one card with a segmented control on it.
 *
 * It was a fixed top three, which was wrong in both directions — it hid a
 * fourth part over its limit, and on a healthy design it promoted two parts
 * with 30 °C of room into a list that read like a problem. See
 * `partsNeedingAttention`.
 *
 * Selecting here is the screen's only navigation: everything below — the graph
 * focus, the segments offered, the projection — follows this choice.
 */

import type { MarginRank } from '@/thermal/analysis/marginRanking';

import { num } from './analysisViewModel';

export function MarginDeck({
  ranked,
  index,
  onSelect,
}: {
  ranked: readonly MarginRank[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const active = ranked[index];

  return (
    <div className="relative min-w-0">
      {/* The cards behind. Purely depth — never interactive, so they cannot be
          clicked by mistake, and hidden from the reader of a screen reader,
          which gets the buttons instead. */}
      {ranked.length > 1 && (
        <span
          aria-hidden
          className="absolute inset-x-2 -top-1 h-full rounded-lg border border-line bg-surface-muted"
        />
      )}
      {ranked.length > 2 && (
        <span
          aria-hidden
          className="absolute inset-x-4 -top-2 h-full rounded-lg border border-line bg-canvas"
        />
      )}

      <div className="relative min-w-0 rounded-lg border border-line-strong bg-surface px-2 py-2 shadow-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">
            Tightest Margin
            <span className="ml-1 font-normal text-ink-400">/ 最小餘裕</span>
          </span>
          <span className="flex shrink-0 gap-0.5">
            {ranked.map((entry, position) => (
              <button
                key={entry.node_id}
                type="button"
                aria-pressed={position === index}
                title={`${entry.name} — ${num(entry.margin_C, 1, '°C')}`}
                onClick={() => onSelect(position)}
                className={`size-5 rounded text-[11px] font-bold transition-colors ${
                  position === index
                    ? 'bg-orange-600 text-white'
                    : 'bg-surface-muted text-ink-500 hover:text-ink-900'
                }`}
              >
                {position + 1}
              </button>
            ))}
          </span>
        </span>
        <span
          title={active?.name}
          className="mt-0.5 block truncate text-[11px] font-semibold text-ink-700"
        >
          {active?.name ?? 'No part carries a limit / 尚無限制值'}
        </span>
      </div>
    </div>
  );
}
