/**
 * Right-rail status panels — 11 §28, §29, §36.
 *
 * Snapshot Status, Report Readiness and the seven-item Validation list, in the
 * order the PNG stacks them. Each validation entry carries its own reason, so a
 * WARNING can be acted on rather than merely noticed.
 */

import { AlertCircle, CheckCircle2, Circle, Clock } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import type { DataCompletenessSummary } from '@/thermal/overview/overviewTypes';
import {
  READINESS_ZH,
  SNAPSHOT_MESSAGES,
  SNAPSHOT_STATE_ZH,
  VALIDATION_ITEM_LABELS,
  type ReportReadiness,
  type ReportValidation,
  type SnapshotSummary,
  type ValidationState,
} from '@/report/reportTypes';

import { READINESS_TONE, SNAPSHOT_TONE, VALIDATION_TONE, timeOf } from './reportViewModel';
import { T11 } from './tooltips';

const ICONS: Record<ValidationState, typeof CheckCircle2> = {
  READY: CheckCircle2,
  WARNING: AlertCircle,
  MISSING: Circle,
  STALE: Clock,
};

const ICON_COLOR: Record<ValidationState, string> = {
  READY: 'text-ok-600',
  WARNING: 'text-warn-600',
  MISSING: 'text-danger-600',
  STALE: 'text-ink-400',
};

export function SnapshotStatusPanel({
  summary,
  completeness,
  onRefresh,
  onGoToOverview,
}: {
  summary: SnapshotSummary;
  /**
   * 11 §48 requires an engineering tooltip on `Analytical-only` and on
   * `External CFD Validation`. Both describe where the snapshot's numbers came
   * from, so they belong beside the snapshot state rather than inside a single
   * report section — the reader needs them whichever section is selected.
   */
  completeness: DataCompletenessSummary | null;
  onRefresh: () => void;
  onGoToOverview: () => void;
}) {
  const message = SNAPSHOT_MESSAGES[summary.state];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SNAPSHOT_TONE[summary.state]}>{summary.state}</Badge>
        <span className="text-[11px] font-semibold text-ink-700">
          Snapshot Status <span className="font-normal text-ink-400">/ 快照狀態</span>
        </span>
        <EngineeringInfo zh={T11.snapshotStatus} label="Snapshot Status" />
      </div>

      <p className="text-[10.5px] leading-relaxed text-ink-500">
        {message.en}
        <span className="block text-ink-400">{message.zh}</span>
      </p>

      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5 text-[10.5px]">
        <dt className="text-ink-500">Created / 建立</dt>
        <dd className="truncate font-semibold text-ink-900">{timeOf(summary.created_at)}</dd>
        <dt className="text-ink-500">Scenario / 情境</dt>
        <dd className="truncate font-semibold text-ink-900">{summary.scenario_name}</dd>
        <dt className="text-ink-500">Result Mode</dt>
        <dd className="truncate font-semibold text-ink-900">{summary.result_mode ?? 'N/A'}</dd>
        <dt className="text-ink-500">State / 狀態</dt>
        <dd className="truncate font-semibold text-ink-900">{SNAPSHOT_STATE_ZH[summary.state]}</dd>
      </dl>

      {completeness && (
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 rounded border border-line bg-surface-muted px-2 py-1.5 text-[10.5px]">
          <dt className="flex items-center gap-1 text-ink-500">
            Data Confidence <span className="text-ink-400">資料信心</span>
            <EngineeringInfo zh={T11.analyticalOnly} label="Analytical-only" align="left" />
          </dt>
          <dd className="justify-self-end">
            <Badge tone={completeness.data_confidence === 'Calibrated' ? 'ok' : 'warn'}>
              {completeness.data_confidence}
            </Badge>
          </dd>
          <dt className="flex items-center gap-1 text-ink-500">
            External CFD Validation <span className="text-ink-400">外部驗證</span>
            <EngineeringInfo
              zh={T11.externalCfdValidation}
              label="External CFD Validation"
              align="left"
            />
          </dt>
          <dd className="justify-self-end">
            {/* 11 §31 — `Deferred` is reported as-is; it never becomes a failure. */}
            <Badge tone={completeness.external_cfd_validation === 'Validated' ? 'ok' : 'neutral'}>
              {completeness.external_cfd_validation}
            </Badge>
          </dd>
        </dl>
      )}

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Button className="!h-7 !px-2 !text-[11px]" onClick={onRefresh}>
          Refresh Snapshot Status
        </Button>
        {(summary.state === 'STALE' || summary.state === 'MISSING') && (
          <Button variant="primary" className="!h-7 !px-2 !text-[11px]" onClick={onGoToOverview}>
            Go to Results Overview
          </Button>
        )}
      </div>
    </div>
  );
}

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
        <Badge tone={READINESS_TONE[readiness]}>{readiness}</Badge>
        <span className="text-[11px] font-semibold text-ink-700">
          Report Readiness <span className="font-normal text-ink-400">/ 報告準備狀態</span>
        </span>
        <EngineeringInfo zh={T11.reportReadiness} label="Report Readiness" />
      </div>
      <p className="text-[10.5px] text-ink-400">{READINESS_ZH[readiness]}</p>

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
          Nothing outstanding — the report can be prepared for export.
          <span className="block text-ink-400">沒有待處理項目，可準備匯出。</span>
        </p>
      )}
    </div>
  );
}

export function ReportValidationPanel({ validation }: { validation: ReportValidation }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {validation.entries.map((entry) => {
        const Icon = ICONS[entry.state];
        const meta = VALIDATION_ITEM_LABELS[entry.item];
        return (
          <li key={entry.item} className="flex gap-2">
            <Icon className={`mt-0.5 size-3.5 shrink-0 ${ICON_COLOR[entry.state]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-ink-900">
                  {meta.label}
                  <span className="font-normal text-ink-400">{meta.zh}</span>
                  {entry.item === 'export_payload' && (
                    <EngineeringInfo zh={T11.exportPayload} label="Export Payload" align="left" />
                  )}
                </span>
                <Badge tone={VALIDATION_TONE[entry.state]}>{entry.state}</Badge>
              </div>
              {/* 11.png keeps this list to one line per item. A READY item has
                  nothing to act on, so its detail lives on hover; anything not
                  READY spells out why, in both languages, without a hover. */}
              {entry.state === 'READY' ? (
                <p
                  className="truncate text-[10px] text-ink-400"
                  title={`${entry.detail} / ${entry.detail_zh}`}
                >
                  {entry.detail}
                </p>
              ) : (
                <p className="text-[10px] leading-relaxed text-ink-500">
                  {entry.detail}
                  <span className="block text-ink-400">{entry.detail_zh}</span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
