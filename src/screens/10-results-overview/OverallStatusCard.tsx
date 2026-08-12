/**
 * Overall Thermal Status banner — 10 §4, §20, §21.
 *
 * The status badge is never shown alone: the reasons that produced it are
 * printed beside it, so a reader can check the verdict instead of trusting it.
 * A STALE result keeps its old numbers on screen (10 §21 permits it) but every
 * one of them is watermarked, and the primary action becomes "go and re-solve".
 */

import { AlertTriangle, CheckCircle2, CircleSlash, Clock, XCircle } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import {
  OVERALL_STATUS_LABELS,
  type OverallThermalStatus,
  type ResultMode,
  type StatusReason,
} from '@/thermal/overview/overviewTypes';

import { OVERALL_TONE } from './overviewViewModel';
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

export function OverallStatusCard({
  status,
  reasons,
  resultMode,
  onResolve,
}: {
  status: OverallThermalStatus;
  reasons: StatusReason[];
  resultMode: ResultMode;
  /** Primary action for a status that needs one — 10 §21. */
  onResolve?: { label: string; zh: string; onClick: () => void };
}) {
  const Icon = ICONS[status];

  return (
    <section
      className={`flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 ${RING[status]}`}
    >
      <Icon className={`mt-0.5 size-6 shrink-0 ${TEXT[status]}`} aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[17px] font-bold ${TEXT[status]}`}>{status}</span>
          <span className="text-[12px] font-semibold text-ink-500">
            / {OVERALL_STATUS_LABELS[status].zh}
          </span>
          <EngineeringInfo zh={T10.overallStatus} label="Overall Status" />
          <Badge tone="neutral">
            <span className="flex items-center gap-1">
              Result Mode: {resultMode}
              <EngineeringInfo zh={T10.resultMode} label="Result Mode" />
            </span>
          </Badge>
        </div>

        <ul className="mt-1.5 flex flex-col gap-1">
          {reasons.map((reason) => (
            <li key={reason.code} className="text-[12px] leading-relaxed text-ink-700">
              {reason.text}
              <span className="block text-[11px] text-ink-500">{reason.zh}</span>
            </li>
          ))}
        </ul>
      </div>

      {onResolve && (
        <Button variant="primary" onClick={onResolve.onClick}>
          {onResolve.label} / {onResolve.zh}
        </Button>
      )}
    </section>
  );
}

export { OVERALL_TONE };
