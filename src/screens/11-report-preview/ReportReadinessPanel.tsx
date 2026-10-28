/**
 * Report Readiness — 11 §29.
 *
 * All that is left of a rail that also carried a Snapshot Status panel and a
 * seven-item Validation list. The snapshot's state and its provenance are a
 * header tile now, and the validation rows said the same things this panel's
 * own reasons say, one panel lower.
 */

import { Badge } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import {
  READINESS_ZH,
  type ReportReadiness,
  type ReportValidation,
} from '@/report/reportTypes';

import { READINESS_TONE } from './reportViewModel';
import { T11 } from './tooltips';

export function ReportReadinessPanel({
  readiness,
  validation,
}: {
  readiness: ReportReadiness;
  validation: ReportValidation;
}) {
  const reasons = [...validation.blocking, ...validation.warnings];
  const reasonsZh = [...validation.blocking_zh, ...validation.warnings_zh];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={READINESS_TONE[readiness]}>{READINESS_ZH[readiness]}</Badge>
        <EngineeringInfo zh={T11.reportReadiness} label="Report Readiness" />
      </div>

      {reasons.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {reasons.map((reason, index) => (
            <li key={reason} className="text-[11px] leading-relaxed text-ink-600" title={reason}>
              ・{reasonsZh[index] || reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10.5px] text-ink-500">
          沒有待處理的項目，可以匯出。
        </p>
      )}
    </div>
  );
}
