/**
 * The verdict, in one line until you ask for more.
 *
 * It began as a full-width banner with every reason printed as a two-line
 * bilingual paragraph. In the header band beside the title that is four or five
 * lines of prose for a WARNING, which pushed the card to twice the height of
 * anything beside it and left the column under the title empty to match.
 *
 * So: the state and the leading reason on one line, the rest behind a
 * disclosure. Chinese only in the reasons — the reader of this screen works in
 * it, and the English half was the same sentence twice at a size nobody reads
 * twice.
 *
 * A reason about parts NAMES them. "3 monitored components are within 5 °C of
 * their limit" is a sentence that sends the reader somewhere else to find out
 * which three; the names make it the answer. Past four they collapse behind a
 * count, because the point is to be readable at a glance, not exhaustive.
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleSlash, Clock, XCircle } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import {
  OVERALL_STATUS_LABELS,
  type OverallThermalStatus,
  type StatusReason,
} from '@/thermal/overview/overviewTypes';

import { T10 } from './tooltips';

const ICONS = {
  PASS: CheckCircle2,
  WARNING: AlertTriangle,
  FAIL: XCircle,
  STALE: Clock,
  INCOMPLETE: CircleSlash,
} as const;

const RING: Record<OverallThermalStatus, string> = {
  PASS: 'border-ok-500/50 bg-ok-100',
  WARNING: 'border-warn-500/50 bg-warn-100',
  FAIL: 'border-danger-500/50 bg-danger-100',
  STALE: 'border-line-strong bg-surface-muted',
  INCOMPLETE: 'border-warn-500/50 bg-warn-100',
};

const TEXT: Record<OverallThermalStatus, string> = {
  PASS: 'text-ok-600',
  WARNING: 'text-warn-600',
  FAIL: 'text-danger-600',
  STALE: 'text-ink-500',
  INCOMPLETE: 'text-warn-600',
};

/** Enough names to be useful at a glance; the rest are a count. */
const NAMES_SHOWN = 4;

export function OverallStatusCard({
  status,
  reasons,
  onResolve,
}: {
  status: OverallThermalStatus;
  reasons: StatusReason[];
  /** Primary action for a status that needs one — 10 §21. */
  onResolve?: { label: string; zh: string; onClick: () => void };
}) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[status];
  const [lead, ...rest] = reasons;

  return (
    <section className={`rounded-lg border px-3 py-2 ${RING[status]}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className={`size-4 shrink-0 ${TEXT[status]}`} aria-hidden />
        <span className={`text-[14px] font-bold ${TEXT[status]}`}>{status}</span>
        <span className="text-[11px] font-semibold text-ink-500">
          / {OVERALL_STATUS_LABELS[status].zh}
        </span>
        <EngineeringInfo zh={T10.overallStatus} label="Overall Status" />

        {lead && (
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-700" title={lead.zh}>
            {lead.zh}
          </span>
        )}

        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            title={biTitle(
              open ? 'Hide the other reasons' : 'Show the other reasons',
              open ? '收合其他原因' : '顯示其他原因',
            )}
            className="flex shrink-0 items-center gap-0.5 rounded border border-line-strong bg-surface/70 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500 hover:text-ink-900"
          >
            +{rest.length}
            <ChevronDown size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        )}

        {onResolve && (
          <Button variant="primary" className="!h-7 !px-2 !text-[11px]" onClick={onResolve.onClick}>
            {onResolve.zh}
          </Button>
        )}
      </div>

      {lead?.components && lead.components.length > 0 && <Names names={lead.components} />}

      {open && rest.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1 border-t border-line/60 pt-1.5">
          {rest.map((reason) => (
            <li key={reason.code} className="text-[11px] leading-relaxed text-ink-700">
              {reason.zh}
              {reason.components && reason.components.length > 0 && (
                <Names names={reason.components} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The parts a reason is about, as chips. */
function Names({ names }: { names: string[] }) {
  const shown = names.slice(0, NAMES_SHOWN);
  const hidden = names.length - shown.length;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {shown.map((name) => (
        <span
          key={name}
          className="max-w-[14rem] truncate rounded border border-line-strong bg-surface/80 px-1.5 py-0.5 text-[10px] font-semibold text-ink-700"
          title={name}
        >
          {name}
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-[10px] text-ink-500" title={names.slice(NAMES_SHOWN).join('、')}>
          +{hidden}
        </span>
      )}
    </span>
  );
}

export { OVERALL_TONE } from './overviewViewModel';
