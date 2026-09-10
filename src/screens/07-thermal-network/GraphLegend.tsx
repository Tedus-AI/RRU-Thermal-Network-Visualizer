/**
 * The colour scale, as an overlay in the graph's top-left corner.
 *
 * Collapsible and collapsed by default, as on Screen 05: it sits in the corner
 * the graph starts in, so left open it covers the first two nodes. A scale you
 * have read once does not need to keep covering the picture it describes.
 *
 * Shared with Screen 10's network window: the legend must say what THAT graph
 * is coloured by, and a second hand-written copy would go stale the first time
 * a ramp changes.
 */

import { ChevronDown } from 'lucide-react';

export function GraphLegend({
  rows,
  open,
  onToggle,
  hidden,
}: {
  rows: ReadonlyArray<{ color: string; label: string; zh: string }>;
  open: boolean;
  onToggle: () => void;
  hidden?: boolean;
}) {
  return (
    <div
      hidden={hidden}
      className="absolute top-3 left-3 z-10 w-[13rem] rounded-md border border-line bg-surface/95 p-2 shadow-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title="Legend / 圖例"
        className="flex w-full items-center gap-1.5 text-[10px] font-bold text-ink-700"
      >
        Legend <span className="font-normal text-ink-400">/ 圖例</span>
        <ChevronDown size={12} className={`ml-auto text-ink-400 ${open ? '' : '-rotate-90'}`} />
      </button>
      <ul className={`mt-1 flex-col gap-0.5 ${open ? 'flex' : 'hidden'}`}>
        {rows.map((entry) => (
          <li
            key={`${entry.color}-${entry.label}`}
            title={entry.zh}
            className="flex items-center gap-1.5 text-[10px] text-ink-500"
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">{entry.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
