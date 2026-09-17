/**
 * The session's own record of what it exported — 12 §33, §35, §47.
 *
 * It is honest about its own lifetime: §33 permits a session-only history and
 * this is one, so the panel says the links live as long as the tab rather than
 * implying a persistence that was never built.
 *
 * The source-readiness and validation panels used to live here too. Both said
 * again, in the right-hand column, what the artifact table already says per
 * row, and what the pre-export confirmation says at the moment it matters --
 * three surfaces for one set of facts, which is how they drift apart.
 */

import { CheckCircle2, Copy, Download, FileText } from 'lucide-react';

import { Badge } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import type { ExportHistoryEntry } from '@/export/exportTypes';

import { bytes, timeOf } from './exportViewModel';
import { T12 } from './tooltips';

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
