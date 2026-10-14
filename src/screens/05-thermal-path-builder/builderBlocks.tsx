/**
 * Screen 05: the small building blocks the builder is laid out with — KPI
 * cards, collapsible sidebar sections, the canvas legend and the loading
 * skeleton.
 */

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { Skeleton } from '@/ui/primitives';

import { useRememberedFlag } from '@/ui/rememberedFlag';
import { LEGEND, type LegendEntry } from '@/ui/graphStyles';

export function KpiCard({
  icon,
  value,
  label,
  zh,
  tone = 'text-ink-900',
  iconTone = 'text-ink-400',
}: {
  icon: ReactNode;
  value: number | string;
  label: string;
  zh: string;
  tone?: string;
  iconTone?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface px-2 py-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink-900">
        <span className={`shrink-0 ${iconTone}`}>{icon}</span>
        <span className="truncate">{label}</span>
        <span className={`ml-auto shrink-0 pl-2 font-bold tabular ${tone}`}>{value}</span>
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-ink-400">{zh}</span>
    </div>
  );
}

export function Collapsible({
  title,
  zh,
  open,
  onToggle,
  children,
}: {
  title: string;
  zh: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-line px-3.5 py-2.5 text-left"
      >
        <h3 className="text-[13px] font-bold text-ink-700">
          {title} <span className="font-semibold text-ink-400">/ {zh}</span>
        </h3>
        <ChevronDown
          size={15}
          className={`ml-auto text-ink-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && <div className="p-3">{children}</div>}
    </section>
  );
}

function LegendSwatch({ entry }: { entry: LegendEntry }) {
  if (entry.kind === 'line') {
    return (
      <span
        aria-hidden
        className="h-0 w-5 shrink-0 border-t-2"
        style={{
          borderTopStyle: entry.style as 'solid',
          // Grey unless the entry names a real line colour on the canvas.
          borderTopColor: entry.color ?? '#64748b',
        }}
      />
    );
  }
  if (entry.kind === 'state') {
    // A ring, not a filled chip: these are painted ON a node of some other
    // colour, so showing them as a fill would imply a node group of their own.
    return (
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-sm"
        style={{ boxShadow: `inset 0 0 0 2.5px ${entry.style}` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-sm border"
      style={{ borderColor: entry.style, background: `${entry.style}33` }}
    />
  );
}

/**
 * Top-left and collapsed by default: the canvas is the work surface, and a
 * permanently open key over one of its corners costs more room than it earns
 * once the vocabulary is familiar.
 */
export function Legend() {
  const [open, setOpen] = useRememberedFlag('05.legend', false);

  return (
    <div className="absolute top-3 left-3 z-10 w-[11.5rem] rounded-md border border-line bg-surface/95 px-3 py-2.5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-[12px] font-bold text-ink-700"
      >
        Legend / 圖例
        <ChevronDown size={13} className={`ml-auto ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <ul className="mt-2 grid grid-cols-1 gap-1">
          {LEGEND.map((entry) => (
            <li key={entry.label}>
              {entry.section && (
                <p className="mt-1.5 mb-1 text-[10px] font-bold text-ink-400 first:mt-0">
                  {entry.section} / {entry.sectionZh}
                </p>
              )}
              <span className="flex items-center gap-2 whitespace-nowrap text-[11px] text-ink-500">
                <LegendSwatch entry={entry} />
                {entry.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12" />
        ))}
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-96 w-80" />
        <Skeleton className="h-96 flex-1" />
      </div>
    </div>
  );
}
