/**
 * Header KPI cards — 12 §7, §59.
 *
 * The six §7 names, in §7's order: Export Status, Ready Artifacts, Warnings,
 * Blocked, Package Size Estimate, Last Export.
 *
 * As on Screens 10 and 11, six cards on one row leave about 200px each, so the
 * card header keeps the English name visible and moves the Chinese to the note
 * under the value and to the hover title — the project's rule for compact space.
 */

import { AlertTriangle, Ban, CheckCircle2, Clock, Package, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import type { Tone } from '@/ui/primitives';
import { GLOBAL_STATUS_ZH, type GlobalExportStatus } from '@/export/exportTypes';

import { GLOBAL_TONE, bytes, timeOf } from './exportViewModel';
import { T12 } from './tooltips';

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-600',
  warn: 'text-warn-600',
  danger: 'text-danger-600',
  accent: 'text-accent-700',
  neutral: 'text-ink-700',
};

function KpiCard({
  icon: Icon,
  label,
  zh,
  explanation,
  value,
  valueTone = 'neutral',
  note,
  compact,
}: {
  icon: LucideIcon;
  label: string;
  zh: string;
  explanation?: string;
  value: string;
  valueTone?: Tone;
  note?: string;
  compact?: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface px-3.5 py-3">
      <header className="flex items-center gap-1.5" title={biTitle(label, zh)}>
        <Icon className="size-3.5 shrink-0 text-ink-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-ink-700">{label}</span>
        {explanation && <EngineeringInfo zh={explanation} label={label} />}
      </header>
      <p
        className={`truncate font-bold tabular ${compact ? 'text-[15px]' : 'text-[21px]'} ${TONE_TEXT[valueTone]}`}
        title={value}
      >
        {value}
      </p>
      <p className="truncate text-[10px] text-ink-400" title={note}>
        {note ?? ' '}
      </p>
    </section>
  );
}

export function ExportKpiBar({
  status,
  ready,
  warnings,
  blocked,
  sizeEstimate,
  lastExport,
}: {
  status: GlobalExportStatus;
  ready: number;
  warnings: number;
  blocked: number;
  /** Bytes, or null while nothing has been generated to measure. */
  sizeEstimate: number | null;
  lastExport: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={ShieldCheck}
        label="Export Status"
        zh="匯出狀態"
        explanation={T12.exportStatus}
        value={status}
        valueTone={GLOBAL_TONE[status]}
        note={GLOBAL_STATUS_ZH[status]}
        compact={status.length > 7}
      />
      <KpiCard
        icon={CheckCircle2}
        label="Ready Artifacts"
        zh="可匯出項目"
        explanation={T12.artifact}
        value={`${ready}`}
        valueTone={ready > 0 ? 'ok' : 'neutral'}
        note="Pass their own prerequisites / 符合前置條件"
      />
      <KpiCard
        icon={AlertTriangle}
        label="Warnings"
        zh="警告"
        explanation={T12.packageWarning}
        value={`${warnings}`}
        valueTone={warnings > 0 ? 'warn' : 'neutral'}
        note="Exportable after confirmation / 確認後可匯出"
      />
      <KpiCard
        icon={Ban}
        label="Blocked"
        zh="受阻"
        value={`${blocked}`}
        valueTone={blocked > 0 ? 'danger' : 'neutral'}
        note="Stale or invalid source / 來源過期或無效"
      />
      <KpiCard
        icon={Package}
        label="Package Size Estimate"
        zh="封裝大小估計"
        // The estimate is only real once something has been generated; before
        // that it says N/A rather than guessing a number from row counts.
        value={sizeEstimate == null ? 'N/A' : bytes(sizeEstimate)}
        valueTone="neutral"
        note={sizeEstimate == null ? 'Measured after export / 匯出後量測' : 'Last run / 上次匯出'}
        compact
      />
      <KpiCard
        icon={Clock}
        label="Last Export"
        zh="上次匯出"
        explanation={T12.exportSession}
        value={lastExport ? timeOf(lastExport) : 'Never'}
        valueTone="neutral"
        note={lastExport ? '本機瀏覽器產生' : '尚未匯出'}
        compact
      />
    </div>
  );
}
