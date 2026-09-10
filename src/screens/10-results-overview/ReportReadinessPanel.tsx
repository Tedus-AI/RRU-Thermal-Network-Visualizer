/**
 * Report Readiness — 10 §17, §18.
 *
 * The roll-up, and the snapshot button beside it because that is the decision
 * it gates: a BLOCKED report has nothing worth freezing. The per-item checklist
 * that used to sit above it is gone — it listed the state of every supporting
 * analysis, which is the same set of facts the verdict beside the page title
 * already reports, one screen-length further down.
 *
 * 10 §18 — `Prepare Report Snapshot` freezes metadata for Screen 11. It does not
 * generate a PDF, choose a layout, or pick an export format, and the panel says
 * so rather than leaving the reader to find out by pressing it.
 */

import { Camera } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import {
  type ReportReadiness,
  type ResultsOverviewSnapshot,
} from '@/thermal/overview/overviewTypes';

import { REPORT_TONE, timeOf } from './overviewViewModel';
import { T10 } from './tooltips';

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
