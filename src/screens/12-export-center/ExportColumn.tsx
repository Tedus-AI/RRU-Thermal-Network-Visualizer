/**
 * The export column down the right of 10 報告與匯出 (12 §61).
 *
 * The four files a reader actually asks for, one button each, with the reason
 * written under any button that cannot run — so "why is the PDF greyed out" is
 * answered where the question is asked, not in a table further down a second
 * screen. Everything else 11 Export Center offered (the artifact table, the
 * snapshot matrix, naming, the queue and the history) is one click away in the
 * 匯出設定 drawer.
 *
 * While a run is going, its progress and a cancel button sit under the
 * buttons; when it ends, what it wrote stays there with 再次下載.
 */

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode2,
  FileText,
  Images,
  Loader2,
  Package,
  Settings2,
  XCircle,
} from 'lucide-react';

import { Button } from '@/ui/primitives';
import { artifactDefinition, isExportable, type ArtifactType } from '@/export/exportTypes';
import { snapshotCount } from '@/export/snapshotSelection';

import { bytes, shortTime } from './exportViewModel';
import type { ExportController } from './useExportController';

export type DrawerSection = 'items' | 'png' | 'naming' | 'results' | 'history';

function ReasonLine({ status, reason }: { status: string; reason: string }) {
  if (status === 'READY' || !reason) return null;
  const tone =
    status === 'WARNING' ? 'text-warn-600' : status === 'BLOCKED' ? 'text-danger-600' : 'text-ink-500';
  return (
    <p className={`mt-1 text-[10.5px] leading-snug ${tone}`}>
      {status === 'WARNING' ? `有警告，按下會先確認：${reason}` : reason}
    </p>
  );
}

function ArtifactAction({
  controller,
  type,
  icon,
  label,
  primary = false,
  extra,
  emptyReason,
  onRun,
}: {
  controller: ExportController;
  type: ArtifactType;
  icon: ReactNode;
  label: string;
  primary?: boolean;
  extra?: ReactNode;
  /** Set when the button would run with nothing in it — the ZIP's empty list. */
  emptyReason?: string;
  onRun: () => void;
}) {
  const entry = controller.readiness[type];
  const readyStatus = entry?.status ?? 'NOT_AVAILABLE';
  const status = emptyReason && isExportable(readyStatus) ? 'NOT_AVAILABLE' : readyStatus;
  const reason = emptyReason && isExportable(readyStatus) ? emptyReason : (entry?.reason_zh ?? '');
  const usable = isExportable(status);
  return (
    <div data-export-action={type}>
      <Button
        variant={primary ? 'primary' : 'secondary'}
        icon={icon}
        className="w-full !justify-start"
        disabled={!usable || controller.exporting}
        title={usable ? artifactDefinition(type).description_zh : reason}
        onClick={onRun}
      >
        {label}
      </Button>
      <ReasonLine status={status} reason={reason} />
      {extra}
    </div>
  );
}

const QUEUE_LABEL: Record<string, { text: string; tone: string }> = {
  READY: { text: '等待', tone: 'text-ink-500' },
  EXPORTING: { text: '產生中', tone: 'text-accent-700' },
  EXPORTED: { text: '完成', tone: 'text-ok-600' },
  FAILED: { text: '失敗', tone: 'text-danger-600' },
  SKIPPED: { text: '略過', tone: 'text-warn-600' },
};

export function ExportColumn({
  controller,
  onOpenDrawer,
}: {
  controller: ExportController;
  onOpenDrawer: (section: DrawerSection) => void;
}) {
  const pngCount = snapshotCount(controller.subjects, controller.snapshotSelection);
  const packed = controller.selected.filter(
    (type) =>
      type !== 'package_zip' && isExportable(controller.readiness[type]?.status ?? 'NOT_AVAILABLE'),
  );
  const last = controller.history[0] ?? null;
  const pdfName = controller.filenamePreview('pdf_report');
  const finished = !controller.exporting && controller.results.length > 0;
  const failed = controller.queue.filter((entry) => entry.status === 'FAILED').length;

  return (
    <section
      className="flex min-h-0 flex-col gap-3 overflow-auto rounded-lg border border-line bg-surface p-3"
      aria-labelledby="export-column-title"
      data-testid="export-column"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 id="export-column-title" className="text-[13px] font-bold text-ink-900">
          匯出
        </h2>
        <span className="text-[10.5px] text-ink-400" title="所有檔案都在這個瀏覽器產生，不會上傳專案資料。">
          在本機產生
        </span>
      </header>

      <div className="flex flex-col gap-2.5">
        <ArtifactAction
          controller={controller}
          type="pdf_report"
          primary
          icon={<FileText size={15} />}
          label="下載 PDF 報告"
          onRun={() => controller.start({ mode: 'selected', types: ['pdf_report'] })}
        />
        <ArtifactAction
          controller={controller}
          type="html_report"
          icon={<FileCode2 size={15} />}
          label="下載 HTML 報告"
          onRun={() => controller.start({ mode: 'selected', types: ['html_report'] })}
        />
        <ArtifactAction
          controller={controller}
          type="png_snapshots"
          icon={<Images size={15} />}
          label={`圖表 PNG（${pngCount} 張）`}
          onRun={() => controller.start({ mode: 'selected', types: ['png_snapshots'] })}
          extra={
            <button
              type="button"
              className="mt-1 text-[11px] font-semibold text-accent-700 hover:underline"
              onClick={() => onOpenDrawer('png')}
            >
              選擇圖表…
            </button>
          }
        />
        <ArtifactAction
          controller={controller}
          type="package_zip"
          icon={<Package size={15} />}
          label="工程封裝 ZIP"
          emptyReason={packed.length === 0 ? '還沒有選要放進 ZIP 的項目。' : undefined}
          onRun={() => controller.start({ mode: 'package', types: packed })}
          extra={
            <p className="mt-1 text-[10.5px] text-ink-500">
              內含 {packed.length} 項＋追溯清單・
              <button
                type="button"
                className="font-semibold text-accent-700 hover:underline"
                onClick={() => onOpenDrawer('items')}
              >
                選擇內容…
              </button>
            </p>
          }
        />
      </div>

      <div className="min-w-0 rounded-md bg-surface-muted px-2 py-1.5">
        <span className="block text-[10.5px] text-ink-400">檔名</span>
        <span className="block truncate font-mono text-[10.5px] text-ink-700" title={pdfName}>
          {pdfName || '—'}
        </span>
      </div>

      <Button icon={<Settings2 size={14} />} className="w-full" onClick={() => onOpenDrawer('naming')}>
        匯出設定…
      </Button>

      {controller.exporting && (
        <div className="flex flex-col gap-1.5 rounded-md border border-accent-500/40 bg-accent-50 px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-700">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {controller.progress
              ? `${controller.progress.index} / ${controller.progress.total} · ${controller.progress.label_zh}`
              : '準備匯出…'}
          </span>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-accent-100"
            role="progressbar"
            aria-label="匯出進度"
            aria-valuenow={
              controller.progress
                ? Math.round((controller.progress.index / Math.max(controller.progress.total, 1)) * 100)
                : 0
            }
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-accent-600 transition-all"
              style={{
                width: `${
                  controller.progress
                    ? Math.round((controller.progress.index / Math.max(controller.progress.total, 1)) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
          <Button className="!h-7 self-start !px-2 !text-[11px]" onClick={controller.cancel}>
            取消匯出
          </Button>
        </div>
      )}

      {finished && (
        <div className="flex flex-col gap-1 rounded-md border border-line px-2.5 py-2" data-testid="export-results">
          <span
            className={`flex items-center gap-1.5 text-[11.5px] font-bold ${
              failed > 0 ? 'text-warn-600' : 'text-ok-600'
            }`}
          >
            {failed > 0 ? (
              <AlertTriangle className="size-3.5" aria-hidden />
            ) : (
              <CheckCircle2 className="size-3.5" aria-hidden />
            )}
            {failed > 0 ? `部分完成・${failed} 項失敗` : '匯出完成'}
          </span>
          <ul className="flex flex-col gap-1">
            {controller.queue.map((entry, index) => {
              const label = QUEUE_LABEL[entry.status] ?? QUEUE_LABEL.READY;
              return (
                <li key={`${entry.type}-${entry.filename}-${index}`} className="text-[10.5px]">
                  <span className="flex items-center gap-1">
                    {entry.status === 'FAILED' && <XCircle className="size-3 text-danger-600" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate font-mono text-ink-700" title={entry.filename}>
                      {entry.filename || artifactDefinition(entry.type).zh}
                    </span>
                    <span className={`shrink-0 font-semibold ${label.tone}`}>{label.text}</span>
                  </span>
                  <span className="flex items-center gap-2 text-ink-400">
                    {entry.size_bytes != null && <span className="tabular">{bytes(entry.size_bytes)}</span>}
                    {entry.object_url && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 font-semibold text-accent-700 hover:underline"
                        onClick={() => controller.downloadAgain(entry)}
                      >
                        <Download className="size-3" aria-hidden />
                        再次下載
                      </button>
                    )}
                  </span>
                  {entry.error && <span className="block text-danger-600">{entry.error}</span>}
                </li>
              );
            })}
          </ul>
          {controller.lastManifest && (
            <button
              type="button"
              className="self-start text-[10.5px] font-semibold text-accent-700 hover:underline"
              onClick={() => controller.manifest.show(controller.lastManifest)}
            >
              看追溯清單
            </button>
          )}
        </div>
      )}

      <div className="mt-auto border-t border-line pt-2 text-[10.5px] text-ink-500">
        {last ? (
          <span className="block truncate" title={last.filename}>
            最近匯出：{shortTime(last.time)}・{last.label}・{bytes(last.size_bytes)}
          </span>
        ) : (
          <span className="block">這次還沒有匯出過</span>
        )}
        <button
          type="button"
          className="font-semibold text-accent-700 hover:underline"
          onClick={() => onOpenDrawer('history')}
        >
          匯出紀錄（{controller.history.length}）
        </button>
      </div>
    </section>
  );
}
