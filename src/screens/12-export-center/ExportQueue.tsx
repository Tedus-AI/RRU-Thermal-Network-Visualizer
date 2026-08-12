/**
 * Export queue, progress and result panel — 12 §28, §29, §30, §34, §46.
 *
 * The queue's columns are §28's: Artifact, Format, Status, Progress, Filename,
 * Size, Action. §29's progress line reads exactly as the specification writes it
 * ("Preparing 2 / 7 · Rendering PDF") and Cancel Export is next to it.
 *
 * §30's failure isolation is visible here rather than only in the runner: a
 * FAILED row sits beside EXPORTED ones with its own error text, and the run's
 * status reads PARTIAL instead of collapsing to a single global failure.
 */

import { AlertTriangle, Ban, CheckCircle2, Download, FileText, Loader2, XCircle } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { ColumnLabel, EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import { artifactDefinition, type ExportManifest, type GlobalExportStatus } from '@/export/exportTypes';
import type { QueueEntry } from '@/data/exportStore';

import { GLOBAL_TONE, bytes } from './exportViewModel';
import { T12 } from './tooltips';

const STATUS_TONE = {
  READY: 'neutral',
  EXPORTING: 'accent',
  EXPORTED: 'ok',
  FAILED: 'danger',
  SKIPPED: 'warn',
} as const;

export function ExportProgress({
  exporting,
  progress,
  onCancel,
}: {
  exporting: boolean;
  progress: { index: number; total: number; label: string; label_zh: string } | null;
  onCancel: () => void;
}) {
  if (!exporting) return null;
  const percent = progress ? Math.round((progress.index / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-accent-500/40 bg-accent-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Loader2 className="size-4 animate-spin text-accent-600" aria-hidden />
        <span className="text-[11.5px] font-semibold text-accent-700">
          {progress?.label ?? 'Preparing export…'}
        </span>
        <span className="text-[10.5px] text-ink-500">{progress?.label_zh ?? '準備匯出…'}</span>
        <Button className="ml-auto !h-7 !px-2 !text-[11px]" onClick={onCancel}>
          Cancel Export / 取消匯出
        </Button>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-accent-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-accent-600 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function ExportQueue({
  queue,
  onDownloadAgain,
}: {
  queue: QueueEntry[];
  onDownloadAgain: (entry: QueueEntry) => void;
}) {
  if (queue.length === 0) {
    return (
      <p className="py-3 text-[11px] text-ink-400">
        The queue is empty. Select artifacts and press Export Selected.
        <span className="block">匯出佇列為空，請選取項目後按 Export Selected。</span>
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left" data-testid="export-queue">
        <thead>
          <tr className="border-b border-line text-[10.5px] text-ink-500">
            <th className="py-1.5 pr-2 font-semibold">
              <ColumnLabel label="Artifact" zh="項目" />
            </th>
            <th className="py-1.5 pr-2 font-semibold">
              <ColumnLabel label="Format" zh="格式" />
            </th>
            <th className="py-1.5 pr-2 font-semibold">
              <ColumnLabel label="Status" zh="狀態" />
            </th>
            <th className="py-1.5 pr-2 font-semibold">
              <ColumnLabel label="Progress" zh="進度" />
            </th>
            <th className="py-1.5 pr-2 font-semibold">
              <ColumnLabel label="Filename" zh="檔名" />
            </th>
            <th className="py-1.5 pr-2 font-semibold">
              <ColumnLabel label="Size" zh="大小" />
            </th>
            <th className="py-1.5 text-right font-semibold">
              <ColumnLabel label="Action" zh="操作" />
            </th>
          </tr>
        </thead>
        <tbody>
          {queue.map((entry, index) => {
            const definition = artifactDefinition(entry.type);
            return (
              <tr key={`${entry.type}-${entry.filename}-${index}`} className="border-b border-line/60 text-[11px]">
                <td className="py-1.5 pr-2 font-semibold text-ink-900">
                  {definition.label}
                  <span className="block text-[10px] font-normal text-ink-400">{definition.zh}</span>
                </td>
                <td className="py-1.5 pr-2">
                  <Badge tone="neutral">{definition.format}</Badge>
                </td>
                <td className="py-1.5 pr-2">
                  <Badge tone={STATUS_TONE[entry.status]}>{entry.status}</Badge>
                  {entry.error && (
                    <span className="mt-0.5 block max-w-[16rem] text-[10px] leading-relaxed text-danger-600">
                      {entry.error}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-ink-500">
                  {entry.status === 'EXPORTED'
                    ? '100%'
                    : entry.status === 'EXPORTING'
                      ? '…'
                      : entry.status === 'FAILED'
                        ? '—'
                        : '0%'}
                </td>
                <td className="max-w-[18rem] py-1.5 pr-2">
                  <span className="block truncate font-mono text-[10.5px] text-ink-700" title={entry.filename}>
                    {entry.filename || '—'}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-ink-700 tabular">{bytes(entry.size_bytes)}</td>
                <td className="py-1.5 text-right">
                  {entry.object_url ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10.5px] text-ink-700 transition-colors hover:bg-surface-muted"
                      title={biTitle('Download again', '再次下載')}
                      onClick={() => onDownloadAgain(entry)}
                    >
                      <Download className="size-3" aria-hidden />
                      Again
                    </button>
                  ) : (
                    <span className="text-[10px] text-ink-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 12 §46 — the warning summary shown BEFORE the export runs. */
export function PackageWarningSummary({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return (
      <p className="text-[11px] text-ink-500">
        No warnings. The current selection can be exported as-is.
        <span className="block text-ink-400">目前沒有警告，可直接匯出。</span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-warn-600">
        <AlertTriangle className="size-3.5" aria-hidden />
        {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        <span className="font-normal text-ink-500">/ {warnings.length} 項警告</span>
        <EngineeringInfo zh={T12.packageWarning} label="Package Warning" align="left" />
      </p>
      <ul className="flex flex-col gap-0.5">
        {warnings.map((warning) => (
          <li key={warning} className="text-[10.5px] leading-relaxed text-ink-500">
            · {warning}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 12 §34 — the result panel shown after a run finishes. */
export function ExportResultPanel({
  status,
  results,
  manifest,
  onViewManifest,
  onDownloadAgain,
  queue,
}: {
  status: GlobalExportStatus;
  results: Array<{ status: string; size_bytes?: number; warnings: string[] }>;
  manifest: ExportManifest | null;
  onViewManifest: () => void;
  onDownloadAgain: (entry: QueueEntry) => void;
  queue: QueueEntry[];
}) {
  if (results.length === 0) return null;

  const exported = results.filter(
    (result) => result.status === 'EXPORTED' || result.status === 'WARNING',
  );
  const failed = results.filter((result) => result.status === 'FAILED');
  const total = exported.reduce((sum, result) => sum + (result.size_bytes ?? 0), 0);
  const warnings = Array.from(new Set(results.flatMap((result) => result.warnings)));
  const packaged = queue.find((entry) => entry.type === 'package_zip' && entry.object_url);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ok-500/40 bg-ok-100/60 px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-ink-900">
        {status === 'PARTIAL' ? (
          <AlertTriangle className="size-4 text-warn-600" aria-hidden />
        ) : status === 'FAILED' ? (
          <XCircle className="size-4 text-danger-600" aria-hidden />
        ) : (
          <CheckCircle2 className="size-4 text-ok-600" aria-hidden />
        )}
        {status === 'COMPLETE' ? 'Export Complete' : status === 'PARTIAL' ? 'Partial Export' : 'Export Failed'}
        <span className="font-normal text-ink-500">
          / {status === 'COMPLETE' ? '匯出完成' : status === 'PARTIAL' ? '部分匯出' : '匯出失敗'}
        </span>
        <Badge tone={GLOBAL_TONE[status]}>{status}</Badge>
        {status === 'PARTIAL' && (
          <EngineeringInfo zh={T12.partialExport} label="Partial Export" align="left" />
        )}
      </p>

      <dl className="grid grid-cols-[8rem_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-ink-500">Files / 檔案數</dt>
        <dd className="font-semibold text-ink-900 tabular">
          {exported.length}
          {failed.length > 0 && <span className="ml-1 text-danger-600">({failed.length} failed)</span>}
        </dd>
        <dt className="text-ink-500">Total Size / 總大小</dt>
        <dd className="font-semibold text-ink-900 tabular">{bytes(total)}</dd>
        {packaged && (
          <>
            <dt className="text-ink-500">Package / 封裝檔</dt>
            <dd className="truncate font-mono text-[10.5px] text-ink-900" title={packaged.filename}>
              {packaged.filename}
            </dd>
          </>
        )}
      </dl>

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {warnings.map((warning) => (
            <li key={warning} className="text-[10.5px] leading-relaxed text-warn-600">
              · {warning}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {packaged && (
          <Button
            className="!h-7 !px-2 !text-[11px]"
            icon={<Download className="size-3.5" />}
            onClick={() => onDownloadAgain(packaged)}
          >
            Download Package Again
          </Button>
        )}
        {manifest && (
          // The info button sits BESIDE the action: a button nested in a button
          // is invalid HTML and swallows the outer click.
          <span className="flex items-center gap-1">
            <Button
              className="!h-7 !px-2 !text-[11px]"
              icon={<FileText className="size-3.5" />}
              onClick={onViewManifest}
            >
              View Manifest
            </Button>
            <EngineeringInfo zh={T12.traceabilityManifest} label="Traceability Manifest" />
          </span>
        )}
        {failed.length > 0 && (
          <span className="flex items-center gap-1 text-[10.5px] text-ink-500">
            <Ban className="size-3 text-danger-600" aria-hidden />
            Failures are recorded in the manifest / 失敗項目已記錄於 manifest
          </span>
        )}
      </div>
    </div>
  );
}
