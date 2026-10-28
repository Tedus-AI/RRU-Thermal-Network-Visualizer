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
import { EngineeringInfo } from '@/ui/FieldLabel';
import type { ExportHistoryEntry } from '@/export/exportTypes';

import { bytes, timeOf } from './exportViewModel';
import { T12 } from './tooltips';

const HISTORY_STATUS: Record<string, string> = {
  EXPORTED: '完成',
  PARTIAL: '部分完成',
  FAILED: '失敗',
  CANCELLED: '已取消',
};

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
        <p className="text-[11px] text-ink-400">這次還沒有匯出過。</p>
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
                {HISTORY_STATUS[entry.status] ?? entry.status}
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
              {entry.artifact_count} 個檔案・{bytes(entry.size_bytes)}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              <button
                type="button"
                disabled={!entry.object_url}
                className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-700 transition-colors hover:bg-surface-muted disabled:opacity-40"
                onClick={() => onDownloadAgain(entry)}
              >
                <Download className="size-3" aria-hidden />
                再次下載
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-700 transition-colors hover:bg-surface-muted"
                onClick={() => onCopyFilename(entry)}
              >
                <Copy className="size-3" aria-hidden />
                複製檔名
              </button>
              <button
                type="button"
                disabled={!entry.manifest}
                className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-700 transition-colors hover:bg-surface-muted disabled:opacity-40"
                title="只有 ZIP 封裝有追溯清單"
                onClick={() => onViewManifest(entry)}
              >
                <FileText className="size-3" aria-hidden />
                看追溯清單
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* 12 §33 — do not claim a persistence that was not implemented. */}
      <p className="text-[10px] leading-relaxed text-ink-400">
        只記這次工作階段；分頁開著時可以再次下載，重新整理後不會保留。
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
        <span className="font-semibold">在本機產生</span>
        <EngineeringInfo zh={T12.localExport} label="Local Export" align="left" />
        <span className="text-ink-600">所有檔案都在這個瀏覽器產生，不會上傳專案資料。</span>
      </span>
    </p>
  );
}
