/**
 * Overall Readiness checklist and Report Readiness — 10 §16, §17, §18.
 *
 * The checklist prints one line per supporting analysis with its state and the
 * reason for that state. Report Readiness rolls them up, and the snapshot button
 * lives beside it because that is the decision it gates: a BLOCKED report has
 * nothing worth freezing.
 *
 * 10 §18 — `Prepare Report Snapshot` freezes metadata for Screen 11. It does not
 * generate a PDF, choose a layout, or pick an export format, and the panel says
 * so rather than leaving the reader to find out by pressing it.
 */

import { AlertCircle, Camera, CheckCircle2, Circle, Clock } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import {
  READINESS_ITEM_LABELS,
  type ReadinessCheck,
  type ReadinessState,
  type ReportReadiness,
  type ResultsOverviewSnapshot,
} from '@/thermal/overview/overviewTypes';

import { READINESS_TONE, REPORT_TONE, timeOf } from './overviewViewModel';
import { T10 } from './tooltips';

const ICONS: Record<ReadinessState, typeof CheckCircle2> = {
  READY: CheckCircle2,
  WARNING: AlertCircle,
  MISSING: Circle,
  STALE: Clock,
};

const ICON_COLOR: Record<ReadinessState, string> = {
  READY: 'text-ok-600',
  WARNING: 'text-warn-600',
  MISSING: 'text-danger-600',
  STALE: 'text-ink-400',
};

export function OverallReadinessPanel({ checks }: { checks: ReadinessCheck[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {checks.map((check) => {
        const Icon = ICONS[check.state];
        const meta = READINESS_ITEM_LABELS[check.item];
        return (
          <li key={check.item} className="flex gap-2">
            <Icon className={`mt-0.5 size-3.5 shrink-0 ${ICON_COLOR[check.state]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-ink-900">
                  {meta.label}
                  <span className="ml-1 font-normal text-ink-400">{meta.zh}</span>
                </span>
                <Badge tone={READINESS_TONE[check.state]}>{check.state}</Badge>
              </div>
              <p className="text-[10.5px] leading-relaxed text-ink-500">
                {check.detail}
                <span className="block text-ink-400">{check.detail_zh}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ReportReadinessPanel({
  readiness,
  reasons,
  reasonsZh,
  snapshot,
  snapshotCurrent,
  onPrepare,
}: {
  readiness: ReportReadiness;
  reasons: string[];
  reasonsZh: string[];
  snapshot: ResultsOverviewSnapshot | null;
  snapshotCurrent: boolean;
  onPrepare: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={REPORT_TONE[readiness]}>{readiness}</Badge>
        <span className="text-[11px] font-semibold text-ink-700">
          Report Readiness <span className="font-normal text-ink-400">/ 報告就緒狀態</span>
        </span>
        <EngineeringInfo zh={T10.reportReadiness} label="Report Readiness" />
      </div>

      {reasons.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {reasons.map((reason, index) => (
            <li key={reason} className="text-[10.5px] leading-relaxed text-ink-500">
              · {reason}
              <span className="block pl-2 text-ink-400">{reasonsZh[index]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10.5px] text-ink-500">
          Everything a report needs is current.
          <span className="block text-ink-400">報告所需的內容皆為最新。</span>
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-line pt-2">
        <Button
          variant="primary"
          className="!h-8 !text-[12px]"
          icon={<Camera className="size-3.5" />}
          disabled={readiness === 'BLOCKED'}
          onClick={onPrepare}
        >
          Prepare Report Snapshot / 準備報告快照
        </Button>

        <span className="flex items-center gap-1 text-[10px] text-ink-400">
          Freezes the current summary for Screen 11. No PDF is generated here.
          <EngineeringInfo zh={T10.prepareReportSnapshot} label="Prepare Report Snapshot" />
        </span>

        {snapshot && (
          <p className="text-[10px] text-ink-500">
            {snapshotCurrent ? (
              <>
                Snapshot current · {timeOf(snapshot.created_at)}
                <span className="block text-ink-400">快照為最新</span>
              </>
            ) : (
              // 10 §19 — the world moved after the freeze, and the reader is told.
              <>
                <span className="font-bold text-warn-600">Snapshot STALE</span> · taken{' '}
                {timeOf(snapshot.created_at)}
                <span className="block text-ink-400">
                  結果已於快照後變更，請重新準備快照。
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
