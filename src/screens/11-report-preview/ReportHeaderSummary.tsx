/**
 * Snapshot strip and the six header KPI cards — 11 §28, §42.
 *
 * The strip repeats what the PNG puts directly under the title: snapshot state,
 * creation time, scenario and result mode. The cards are exactly the six §42
 * names, in its order: Snapshot Status, Overall Status, Report Readiness, Page
 * Count, Language, Page Size.
 */

import { CircleAlert, Clock, FileText, Globe, Layers, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import type { Tone } from '@/ui/primitives';
import type { OverallThermalStatus } from '@/thermal/overview/overviewTypes';
import { OVERALL_STATUS_LABELS } from '@/thermal/overview/overviewTypes';
import {
  LANGUAGE_MODE_LABELS,
  READINESS_ZH,
  SNAPSHOT_STATE_ZH,
  type LanguageMode,
  type Orientation,
  type PageSize,
  type ReportReadiness,
  type SnapshotState,
  type SnapshotSummary,
} from '@/report/reportTypes';

import { OVERALL_TONE, READINESS_TONE, SNAPSHOT_TONE, timeOf } from './reportViewModel';
import { T11 } from './tooltips';

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
  explanation: string;
  value: string;
  valueTone?: Tone;
  note?: string;
  compact?: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface px-3.5 py-3">
      {/* Six cards on one row leaves ~200px each, which is not enough for
          "Snapshot Status / 快照狀態" side by side — the English name was the
          half being truncated. Project rule: English stays visible, the Chinese
          moves to hover. It is still on-screen in the note under the value. */}
      <header className="flex items-center gap-1.5" title={biTitle(label, zh)}>
        <Icon className="size-3.5 shrink-0 text-ink-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-ink-700">{label}</span>
        <EngineeringInfo zh={explanation} label={label} />
      </header>
      <p
        className={`truncate font-bold tabular ${compact ? 'text-[16px]' : 'text-[21px]'} ${TONE_TEXT[valueTone]}`}
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

/** 11 §28 — the strip above the cards, with strong styling when stale. */
export function SnapshotStrip({ summary }: { summary: SnapshotSummary }) {
  const stale = summary.state === 'STALE' || summary.state === 'MISSING';
  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border px-4 py-2 text-[11.5px] ${
        stale
          ? 'border-danger-500/50 bg-danger-100 font-semibold text-danger-600'
          : summary.state === 'WARNING'
            ? 'border-warn-500/40 bg-warn-100 text-warn-600'
            : 'border-accent-500/30 bg-accent-100 text-accent-700'
      }`}
    >
      <span className="flex items-center gap-1.5 font-bold">
        <ShieldCheck className="size-4" aria-hidden />
        Snapshot: {summary.state}
        <EngineeringInfo zh={T11.snapshotStatus} label="Snapshot Status" />
      </span>
      <span>Created: {timeOf(summary.created_at)}</span>
      <span>Scenario: {summary.scenario_name}</span>
      <span>Result Mode: {summary.result_mode ?? 'N/A'}</span>
      {summary.snapshot_id && <span className="text-ink-400">ID: {summary.snapshot_id}</span>}
    </div>
  );
}

export function ReportHeaderSummary({
  snapshotState,
  overallStatus,
  readiness,
  pageCount,
  languageMode,
  pageSize,
  orientation,
}: {
  snapshotState: SnapshotState;
  overallStatus: OverallThermalStatus | null;
  readiness: ReportReadiness;
  pageCount: number;
  languageMode: LanguageMode;
  pageSize: PageSize;
  orientation: Orientation;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={ShieldCheck}
        label="Snapshot Status"
        zh="快照狀態"
        explanation={T11.snapshotStatus}
        value={snapshotState}
        valueTone={SNAPSHOT_TONE[snapshotState]}
        note={SNAPSHOT_STATE_ZH[snapshotState]}
        compact={snapshotState.length > 7}
      />
      <KpiCard
        icon={CircleAlert}
        label="Overall Status"
        zh="整體狀態"
        explanation={T11.overallStatus}
        // 11 §14 — read from the snapshot, never recomputed here.
        value={overallStatus ?? 'N/A'}
        valueTone={overallStatus ? OVERALL_TONE[overallStatus] : 'neutral'}
        note={overallStatus ? OVERALL_STATUS_LABELS[overallStatus].zh : 'From Screen 10 snapshot'}
        compact={(overallStatus ?? '').length > 7}
      />
      <KpiCard
        icon={FileText}
        label="Report Readiness"
        zh="報告準備狀態"
        explanation={T11.reportReadiness}
        value={readiness}
        valueTone={READINESS_TONE[readiness]}
        note={READINESS_ZH[readiness]}
        compact
      />
      <KpiCard
        icon={Layers}
        label="Page Count"
        zh="頁數"
        explanation={T11.pageCount}
        value={`${pageCount}`}
        valueTone="neutral"
        note="Estimated from layout / 依版面推估"
      />
      <KpiCard
        icon={Globe}
        label="Language"
        zh="語言"
        explanation={T11.languageMode}
        value={LANGUAGE_MODE_LABELS[languageMode].label}
        valueTone="neutral"
        note={LANGUAGE_MODE_LABELS[languageMode].zh}
        compact
      />
      <KpiCard
        icon={Clock}
        label="Page Size"
        zh="頁面尺寸"
        explanation={T11.pageSize}
        value={`${pageSize} ${orientation === 'portrait' ? 'Portrait' : 'Landscape'}`}
        valueTone="neutral"
        note={orientation === 'portrait' ? '直式' : '橫式'}
        compact
      />
    </div>
  );
}
