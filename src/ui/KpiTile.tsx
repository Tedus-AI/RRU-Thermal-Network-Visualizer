/**
 * The KPI tile the screen headers share.
 *
 * One row of tiles sits under the title on 05, 06 and 08, and until this file
 * existed each screen carried its own copy of the markup. They drifted: 08's
 * copy stacked four lines with an 18px icon and a 15px value, which made its
 * row half again as tall as the same row on 05 and 06 and turned the top of
 * the screen into the loudest thing on it.
 *
 * Shape: `label … value` on the first line, `zh … status` on the second, so a
 * column of tiles aligns on both its numbers and its labels. `tone` is a text
 * colour class rather than a semantic name because a tile's value is coloured
 * by the screen's own rule — a margin, a state, a count — and the tile has no
 * way to know which.
 */

import type { ReactNode } from 'react';

export function KpiTile({
  icon,
  label,
  zh,
  value,
  status,
  tone = 'text-ink-900',
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  zh: string;
  value: string;
  /** Second-line note, right of the Chinese label. */
  status?: string;
  tone?: string;
  tooltip: string;
}) {
  return (
    <div
      className="min-w-0 rounded-lg border border-line bg-surface px-2 py-2"
      title={`${label} / ${zh} — ${tooltip}`}
    >
      <span className="flex min-w-0 items-baseline gap-1.5 text-[13px] font-semibold text-ink-900">
        <span className="shrink-0 text-ink-400">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={`shrink-0 pl-2 font-bold tabular ${tone}`}>{value}</span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-ink-400">
        <span className="min-w-0 flex-1 truncate">{zh}</span>
        {status && <span className="shrink-0 truncate text-[10px]">{status}</span>}
      </span>
    </div>
  );
}
