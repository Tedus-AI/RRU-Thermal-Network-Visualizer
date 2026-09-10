/**
 * Three header tiles, down from six, and no strip above them.
 *
 * What went, and why:
 *
 *   Language  — one of four settings in 頁面設定, and the only one that was
 *               also a header card. A setting is not a reading.
 *   Page Size — fixed at A4; a card that can only ever say one thing is a
 *               label.
 *   The strip — snapshot state, created, scenario, result mode and ID across
 *               the full width, directly above a card that already said the
 *               state. It is provenance: worth having, not worth a band. It
 *               now opens out of the Snapshot Status tile.
 *
 * Overall Status and Report Readiness are one tile because they are one
 * question asked twice: whether this report can be believed. The thermal
 * verdict leads, because a READY report of a FAIL design is still a FAIL
 * design; the readiness rides behind it as the note.
 *
 * The tile is `ResultKpiTile`, which is Screens 06, 07 and 10's — label and
 * value on one line, Chinese and a note beneath.
 */

import { useState } from 'react';
import { ChevronDown, Layers, ShieldCheck, CircleAlert } from 'lucide-react';

import { ResultKpiTile } from '@/ui/ResultKpiTile';
import type { Tone } from '@/ui/primitives';
import type { OverallThermalStatus } from '@/thermal/overview/overviewTypes';
import { OVERALL_STATUS_LABELS } from '@/thermal/overview/overviewTypes';
import {
  READINESS_ZH,
  SNAPSHOT_STATE_ZH,
  type ReportReadiness,
  type SnapshotState,
  type SnapshotSummary,
} from '@/report/reportTypes';

import { OVERALL_TONE, READINESS_TONE, SNAPSHOT_TONE, timeOf } from './reportViewModel';
import { T11 } from './tooltips';

/**
 * The worse of the two verdicts decides the colour.
 *
 * A green number over a report that cannot be exported would be a lie by
 * typography, and so would an amber one over a design that passes.
 */
function combinedTone(overall: Tone, readiness: Tone): Tone {
  const rank: Record<string, number> = { danger: 3, warn: 2, accent: 1, ok: 1, neutral: 0 };
  return (rank[readiness] ?? 0) > (rank[overall] ?? 0) ? readiness : overall;
}

export function ReportHeaderSummary({
  snapshotState,
  summary,
  overallStatus,
  readiness,
  pageCount,
}: {
  snapshotState: SnapshotState;
  /** Everything the old strip carried, now behind the first tile's disclosure. */
  summary: SnapshotSummary;
  overallStatus: OverallThermalStatus | null;
  readiness: ReportReadiness;
  pageCount: number;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  const overallTone = overallStatus ? OVERALL_TONE[overallStatus] : 'neutral';

  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
      <ResultKpiTile
        icon={ShieldCheck}
        label="Snapshot Status"
        zh="快照狀態"
        explanation={T11.snapshotStatus}
        value={snapshotState}
        valueTone={SNAPSHOT_TONE[snapshotState]}
        note={SNAPSHOT_STATE_ZH[snapshotState]}
        action={
          <button
            type="button"
            aria-expanded={detailOpen}
            title="快照來源明細"
            onClick={() => setDetailOpen((open) => !open)}
            className="flex size-4 shrink-0 items-center justify-center rounded text-ink-400 transition-colors hover:bg-surface-muted hover:text-ink-900"
          >
            <ChevronDown size={12} className={detailOpen ? '' : '-rotate-90'} />
          </button>
        }
      >
        {detailOpen && (
          <dl className="mt-1.5 flex flex-col gap-0.5 border-t border-line pt-1.5 text-[10px]">
            {[
              ['凍結時間', timeOf(summary.created_at)],
              ['情境', summary.scenario_name],
              ['結果模式', summary.result_mode ?? 'N/A'],
              ['ID', summary.snapshot_id ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex min-w-0 items-baseline gap-2">
                <dt className="shrink-0 text-ink-400">{label}</dt>
                <dd className="min-w-0 flex-1 truncate text-right text-ink-700" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </ResultKpiTile>

      <ResultKpiTile
        icon={CircleAlert}
        label="Overall Status"
        zh="整體熱狀態 · 報告就緒"
        explanation={T11.overallStatus}
        // 11 §14 — read from the snapshot, never recomputed here.
        value={overallStatus ?? 'N/A'}
        valueTone={combinedTone(overallTone, READINESS_TONE[readiness])}
        note={`${overallStatus ? OVERALL_STATUS_LABELS[overallStatus].zh : '無快照'} · 就緒 ${READINESS_ZH[readiness]}`}
      />

      <ResultKpiTile
        icon={Layers}
        label="Page Count"
        zh="頁數"
        explanation={T11.pageCount}
        value={`${pageCount}`}
        note="依版面推估"
      />
    </div>
  );
}
