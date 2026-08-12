/**
 * Source readiness, validation and session history — 12 §31, §32, §33, §35, §47.
 *
 * The readiness panel lists §32's seven sources with their own state and reason,
 * so "why can I not export the bottleneck CSV" is answered on the same screen
 * that refused it.
 *
 * The history is honest about its own lifetime: §33 permits a session-only
 * history and this is one, so the panel says the links live as long as the tab
 * rather than implying a persistence that was never built.
 */

import { AlertCircle, CheckCircle2, CircleSlash, Copy, Download, FileText, Ban } from 'lucide-react';

import { Badge } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import {
  SOURCE_LABELS,
  type ExportHistoryEntry,
  type ExportSession,
  type ExportValidation,
  type SourceReadiness,
  type SourceReadinessEntry,
} from '@/export/exportTypes';

import { SOURCE_TONE, bytes, timeOf } from './exportViewModel';
import { T12 } from './tooltips';

const ICONS: Record<SourceReadiness, typeof CheckCircle2> = {
  READY: CheckCircle2,
  WARNING: AlertCircle,
  BLOCKED: Ban,
  NOT_AVAILABLE: CircleSlash,
};

const ICON_COLOR: Record<SourceReadiness, string> = {
  READY: 'text-ok-600',
  WARNING: 'text-warn-600',
  BLOCKED: 'text-danger-600',
  NOT_AVAILABLE: 'text-ink-400',
};

export function SourceReadinessPanel({ entries }: { entries: SourceReadinessEntry[] }) {
  return (
    <ul className="flex flex-col gap-1.5" data-testid="source-readiness">
      {entries.map((entry) => {
        const Icon = ICONS[entry.state];
        const meta = SOURCE_LABELS[entry.key];
        return (
          <li key={entry.key} className="flex gap-2">
            <Icon className={`mt-0.5 size-3.5 shrink-0 ${ICON_COLOR[entry.state]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-ink-900">
                  {meta.label}
                  <span className="font-normal text-ink-400">{meta.zh}</span>
                  <span className="shrink-0 text-[9.5px] text-ink-400">({meta.screen})</span>
                  {entry.key === 'report' && (
                    <EngineeringInfo zh={T12.reportReadiness} label="Report Readiness" align="left" />
                  )}
                </span>
                <Badge tone={SOURCE_TONE[entry.state]}>{entry.state}</Badge>
              </div>
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

export function ExportValidationPanel({ validation }: { validation: ExportValidation }) {
  const empty = validation.blocking.length === 0 && validation.warnings.length === 0;

  if (empty) {
    return (
      <p className="text-[11px] text-ink-500">
        Nothing outstanding — the current selection can be exported.
        <span className="block text-ink-400">沒有待處理項目，目前選取內容可直接匯出。</span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {validation.blocking.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-danger-600">
            <Ban className="size-3.5" aria-hidden />
            Blocking / 阻擋項目
          </p>
          <ul className="flex flex-col gap-1">
            {validation.blocking.map((reason, index) => (
              <li key={reason} className="text-[10.5px] leading-relaxed text-ink-500">
                · {reason}
                <span className="block pl-2 text-ink-400">{validation.blocking_zh[index]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-warn-600">
            <AlertCircle className="size-3.5" aria-hidden />
            Warnings / 警告
            <EngineeringInfo zh={T12.packageWarning} label="Package Warning" align="left" />
          </p>
          <ul className="flex flex-col gap-1">
            {validation.warnings.map((reason, index) => (
              <li key={reason} className="text-[10.5px] leading-relaxed text-ink-500">
                · {reason}
                <span className="block pl-2 text-ink-400">{validation.warnings_zh[index]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 12 §47 — what the running (or last) export froze. */
export function ExportSessionPanel({ session }: { session: ExportSession | null }) {
  if (!session) {
    return (
      <p className="text-[11px] text-ink-400">
        No export session yet. One is frozen when an export starts.
        <span className="block">尚未建立匯出工作階段；匯出開始時才會凍結來源版本。</span>
      </p>
    );
  }

  const rows: Array<[string, string, string | undefined]> = [
    ['Session', '工作階段', session.id],
    ['Started', '開始時間', timeOf(session.started_at)],
    ['Scenario', '情境', session.scenario_id],
    ['Solver Result', '求解結果', session.solver_solution_id],
    ['Analysis', '瓶頸分析', session.analysis_id],
    ['Report Snapshot', '報告快照', session.report_snapshot_id],
    ['Report Config', '報告設定', session.report_config_id],
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-700">
        Export Session <span className="font-normal text-ink-400">/ 匯出工作階段</span>
        <EngineeringInfo zh={T12.exportSession} label="Export Session" align="left" />
        <Badge tone={session.status === 'COMPLETE' ? 'ok' : session.status === 'PARTIAL' ? 'warn' : 'neutral'}>
          {session.status}
        </Badge>
      </p>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 text-[10.5px]">
        {rows.map(([label, zh, value]) => (
          <div key={label} className="contents">
            <dt className="truncate text-ink-500">
              {label} <span className="text-ink-400">{zh}</span>
            </dt>
            <dd className="truncate font-mono text-ink-900" title={value ?? 'N/A'}>
              {/* An absent source is N/A, never a made-up id. */}
              {value ?? 'N/A'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ExportHistoryPanel({
  history,
  onDownloadAgain,
  onCopyFilename,
  onViewManifest,
}: {
  history: ExportHistoryEntry[];
  onDownloadAgain: (entry: ExportHistoryEntry) => void;
  onCopyFilename: (entry: ExportHistoryEntry) => void;
  onViewManifest: (entry: ExportHistoryEntry) => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="export-history">
      {history.length === 0 && (
        <p className="text-[11px] text-ink-400">
          No exports in this session yet.
          <span className="block">此工作階段尚無匯出紀錄。</span>
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {history.map((entry) => (
          <li key={entry.id} className="rounded border border-line px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                tone={
                  entry.status === 'EXPORTED' ? 'ok' : entry.status === 'PARTIAL' ? 'warn' : 'danger'
                }
              >
                {entry.status}
              </Badge>
              <span className="text-[11px] font-semibold text-ink-900">{entry.label}</span>
              <span className="ml-auto text-[10px] text-ink-400">{timeOf(entry.time)}</span>
            </div>
            <p
              className="mt-0.5 truncate font-mono text-[10px] text-ink-700"
              title={entry.filename}
            >
              {entry.filename}
            </p>
            <p className="text-[10px] text-ink-400">
              {entry.artifact_count} file(s) · {bytes(entry.size_bytes)}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              <button
                type="button"
                disabled={!entry.object_url}
                className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-700 transition-colors hover:bg-surface-muted disabled:opacity-40"
                title={biTitle('Download again', '再次下載')}
                onClick={() => onDownloadAgain(entry)}
              >
                <Download className="size-3" aria-hidden />
                Download Again
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-700 transition-colors hover:bg-surface-muted"
                title={biTitle('Copy filename', '複製檔名')}
                onClick={() => onCopyFilename(entry)}
              >
                <Copy className="size-3" aria-hidden />
                Copy Filename
              </button>
              <button
                type="button"
                disabled={!entry.manifest}
                className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-700 transition-colors hover:bg-surface-muted disabled:opacity-40"
                title={biTitle('View manifest', '檢視追溯清單')}
                onClick={() => onViewManifest(entry)}
              >
                <FileText className="size-3" aria-hidden />
                View Manifest
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* 12 §33 — do not claim a persistence that was not implemented. */}
      <p className="text-[10px] leading-relaxed text-ink-400">
        Session history only. Download links stay valid while this tab is open and are not
        restored after a browser refresh.
        <span className="block">
          僅保存於本次工作階段；下載連結在此分頁開啟期間有效，重新整理後不會保留。
        </span>
      </p>
    </div>
  );
}

/** 12 §35 — the local-export statement, with its engineering tooltip. */
export function LocalExportNotice() {
  return (
    <p className="flex items-start gap-1.5 rounded border border-accent-500/30 bg-accent-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-accent-700">
      <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
      <span className="flex flex-wrap items-center gap-1">
        <span className="font-semibold">Local Export</span>
        <EngineeringInfo zh={T12.localExport} label="Local Export" align="left" />
        <span className="text-ink-600">
          — every file is generated in this browser. No project data is uploaded.
        </span>
        <span className="block w-full text-ink-500">
          所有檔案皆在本機瀏覽器產生，不會將專案資料上傳到外部服務。
        </span>
      </span>
    </p>
  );
}
