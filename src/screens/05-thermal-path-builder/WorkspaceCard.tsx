/**
 * One of the four numbered cards down the left of Screen 05 (熱網路與邊界):
 * a header that says what the card is for and where it stands, and a body
 * that opens and closes.
 */

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export type CardTone = 'ok' | 'warn' | 'danger' | 'neutral';

const CHIP: Record<CardTone, string> = {
  ok: 'border-ok-500/40 bg-ok-100 text-ok-600',
  warn: 'border-warn-500/40 bg-warn-100 text-warn-600',
  danger: 'border-danger-500/40 bg-danger-100 text-danger-600',
  neutral: 'border-line bg-surface-muted text-ink-500',
};

export function WorkspaceCard({
  id,
  index,
  title,
  subtitle,
  status,
  tone = 'neutral',
  open,
  onToggle,
  children,
}: {
  id: string;
  index: number;
  title: string;
  subtitle?: string;
  /** A few words on where the card stands — the reason to open it or not. */
  status?: ReactNode;
  tone?: CardTone;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = `${id}-body`;
  return (
    <section
      id={id}
      data-card={id}
      className="shrink-0 scroll-mt-2 overflow-hidden rounded-lg border border-line bg-surface"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-muted/60"
      >
        <span className="tabular flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white">
          {index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-ink-900">{title}</span>
          {subtitle && <span className="block truncate text-[10.5px] text-ink-400">{subtitle}</span>}
        </span>
        {status != null && (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${CHIP[tone]}`}
          >
            {status}
          </span>
        )}
        <ChevronDown
          size={14}
          aria-hidden
          className={`shrink-0 text-ink-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div id={bodyId} className="border-t border-line p-3">
          {children}
        </div>
      )}
    </section>
  );
}

/** A section inside a card that stays out of the way until asked for. */
export function CardDisclosure({
  name,
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  /** `data-disclosure`, for tests and focus links. */
  name: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      data-disclosure={name}
      className="rounded-md border border-line bg-surface [&[open]>summary_svg]:rotate-0"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 select-none [&::-webkit-details-marker]:hidden">
        <ChevronDown size={13} aria-hidden className="-rotate-90 text-ink-400 transition-transform" />
        <span>{title}</span>
        {hint && <span className="ml-auto truncate text-[10.5px] font-normal text-ink-400">{hint}</span>}
      </summary>
      <div className="border-t border-line p-2.5">{children}</div>
    </details>
  );
}
