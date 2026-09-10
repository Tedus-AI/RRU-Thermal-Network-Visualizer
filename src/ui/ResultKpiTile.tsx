/**
 * The richer KPI tile — the one with an explanation button and room to open.
 *
 * `KpiTile` next door is the plain one Screens 05, 06 and 08 share: label,
 * value, Chinese, a note. This is that shape plus the two things a results
 * screen needs — an `EngineeringInfo` button explaining how the value is
 * judged, and somewhere for the tile to open into so detail can hang off a
 * number without becoming a panel of its own.
 *
 * Screen 10 had it first (the power split expands inside its tile); Screen 11
 * uses it so the snapshot's provenance can sit behind a disclosure instead of
 * a full-width strip above the cards.
 */

import { EngineeringInfo } from '@/ui/FieldLabel';
import type { Tone } from '@/ui/primitives';
import type { LucideIcon } from 'lucide-react';

export const TILE_TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-600',
  warn: 'text-warn-600',
  danger: 'text-danger-600',
  accent: 'text-accent-700',
  neutral: 'text-ink-900',
};

export function ResultKpiTile({
  icon: Icon,
  label,
  zh,
  explanation,
  value,
  valueTone = 'neutral',
  note,
  action,
  children,
}: {
  icon: LucideIcon;
  label: string;
  zh: string;
  explanation: string;
  value: string;
  valueTone?: Tone;
  note?: string;
  /** A control on the header row — a disclosure, an expander. */
  action?: React.ReactNode;
  /** Anything the tile opens into, rendered under the note. */
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface px-2 py-2">
      <span className="flex min-w-0 items-baseline gap-1.5 text-[13px] font-semibold text-ink-900">
        <Icon className="size-3.5 shrink-0 self-center text-ink-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <EngineeringInfo zh={explanation} label={label} />
        {action}
        <span className={`shrink-0 pl-2 font-bold tabular ${TILE_TONE_TEXT[valueTone]}`}>
          {value}
        </span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-ink-400">
        <span className="min-w-0 flex-1 truncate">{zh}</span>
        {note && (
          <span className="min-w-0 shrink truncate text-[10px]" title={note}>
            {note}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}
