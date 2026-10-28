/**
 * 匯出設定 — everything 11 Export Center had that the column does not show,
 * in a drawer over the preview of 10 報告與匯出 (12 §61).
 *
 * Nothing was dropped in the merge. The five sections are 11's five, in the
 * order the work is done: what goes into a multi-file export, which pictures
 * the PNG export draws, how files are named and where they go, what the last
 * run wrote, and what this session has written so far. Each section opens and
 * closes on its own; the column's links open the drawer on the one they name.
 *
 * Non-modal, like the other windows on 10: the preview stays visible to its
 * left, and Escape or ✕ closes it.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, CircleSlash, Download, Package, Trash2, X } from 'lucide-react';

import { Button, Modal } from '@/ui/primitives';
import { toast } from '@/ui/toast';
import {
  ARTIFACT_DEFINITIONS,
  isSelectable,
  type ArtifactStatus,
} from '@/export/exportTypes';
import { snapshotCount } from '@/export/snapshotSelection';
import { supportsFolderPicker } from '@/export/download';

import { ExportConfigurationPanel } from './ExportConfigurationPanel';
import { ExportHistoryPanel, LocalExportNotice } from './ExportHistoryPanel';
import { SnapshotMatrixPanel } from './SnapshotMatrixPanel';
import { bytes } from './exportViewModel';
import type { DrawerSection } from './ExportColumn';
import type { ExportController } from './useExportController';

const STATUS: Record<ArtifactStatus, { text: string; tone: string; icon: typeof CheckCircle2 }> = {
  READY: { text: '可匯出', tone: 'text-ok-600', icon: CheckCircle2 },
  WARNING: { text: '有警告', tone: 'text-warn-600', icon: AlertTriangle },
  BLOCKED: { text: '不能匯出', tone: 'text-danger-600', icon: Ban },
  NOT_AVAILABLE: { text: '還沒有', tone: 'text-ink-400', icon: CircleSlash },
  EXPORTING: { text: '產生中', tone: 'text-accent-700', icon: CheckCircle2 },
  EXPORTED: { text: '已完成', tone: 'text-ok-600', icon: CheckCircle2 },
  FAILED: { text: '失敗', tone: 'text-danger-600', icon: Ban },
};

const QUEUE_STATUS: Record<string, { text: string; tone: string }> = {
  READY: { text: '等待', tone: 'text-ink-500' },
  EXPORTING: { text: '產生中', tone: 'text-accent-700' },
  EXPORTED: { text: '完成', tone: 'text-ok-600' },
  FAILED: { text: '失敗', tone: 'text-danger-600' },
  SKIPPED: { text: '略過', tone: 'text-warn-600' },
};

function Section({
  id,
  index,
  title,
  note,
  open,
  onToggle,
  children,
}: {
  id: DrawerSection;
  index: number;
  title: string;
  note?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section data-drawer-section={id} className="shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-muted"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white tabular">
          {index}
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-bold text-ink-900">{title}</span>
        {note != null && <span className="shrink-0 text-[11px] text-ink-500">{note}</span>}
        <ChevronDown size={14} aria-hidden className={`shrink-0 text-ink-400 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="border-t border-line p-3">{children}</div>}
    </section>
  );
}

export function ExportDrawer({
  controller,
  focus,
  onClose,
}: {
  controller: ExportController;
  /** The section a link asked for; it is opened and brought into view. */
  focus: DrawerSection;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<DrawerSection>>(() => new Set([focus]));
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen((current) => new Set([...current, focus]));
    const frame = requestAnimationFrame(() =>
      bodyRef.current
        ?.querySelector(`[data-drawer-section="${focus}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const toggle = (id: DrawerSection) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const { readiness, selected, exporting } = controller;
  const selectable = ARTIFACT_DEFINITIONS.filter((definition) =>
    isSelectable(readiness[definition.type]?.status ?? 'NOT_AVAILABLE'),
  );
  const files = selected.filter((type) => type !== 'package_zip');
  const pngCount = snapshotCount(controller.subjects, controller.snapshotSelection);

  return (
    <aside
      role="dialog"
      aria-label="匯出設定"
      className="fixed top-16 right-0 bottom-0 z-[45] flex w-[min(36rem,100vw)] flex-col border-l border-line-strong bg-canvas shadow-2xl"
      data-testid="export-drawer"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <h2 className="text-[15px] font-bold text-ink-900">匯出設定</h2>
        <span className="text-[11px] text-ink-400">原本 11 匯出中心的全部功能・Esc 關閉</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉匯出設定"
          className="ml-auto flex size-7 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-900"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        <Section
          id="items"
          index={1}
          title="要匯出的項目"
          note={`已選 ${selected.length} / ${selectable.length}`}
          open={open.has('items')}
          onToggle={() => toggle('items')}
        >
          <p className="mb-2 text-[11px] text-ink-500">
            下面的「匯出選取的」與 ZIP 封裝用這份清單；右邊欄的單一按鈕只匯出那一種。
          </p>
          <ul className="flex flex-col divide-y divide-line">
            {ARTIFACT_DEFINITIONS.map((definition) => {
              const entry = readiness[definition.type];
              const status = entry?.status ?? 'NOT_AVAILABLE';
              const look = STATUS[status];
              const Icon = look.icon;
              const canSelect = isSelectable(status);
              return (
                <li key={definition.type} data-artifact={definition.type} className="flex items-start gap-2 py-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-accent-600"
                    checked={selected.includes(definition.type)}
                    disabled={!canSelect || exporting}
                    aria-label={`選取 ${definition.zh}`}
                    onChange={() => controller.toggle(definition.type)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-ink-900">
                      {definition.zh}
                      <span className="rounded bg-surface-muted px-1 text-[10px] font-semibold text-ink-500">
                        {definition.format}
                      </span>
                      <span className={`ml-auto flex items-center gap-1 text-[11px] ${look.tone}`}>
                        <Icon className="size-3.5" aria-hidden />
                        {look.text}
                      </span>
                    </span>
                    <span className="block text-[10.5px] text-ink-500">{definition.description_zh}</span>
                    <span className="block text-[10.5px] text-ink-400">需要：{definition.prerequisite_zh}</span>
                    {entry?.reason_zh && status !== 'READY' && (
                      <span className={`block text-[10.5px] ${look.tone}`}>{entry.reason_zh}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              className="!h-7 !px-2 !text-[11px]"
              disabled={exporting}
              onClick={() => controller.setSelected(controller.selectableTypes)}
            >
              全選
            </Button>
            <Button className="!h-7 !px-2 !text-[11px]" disabled={exporting} onClick={() => controller.setSelected([])}>
              全不選
            </Button>
          </div>
        </Section>

        <Section
          id="png"
          index={2}
          title="圖表 PNG：選哪些圖"
          note={`${pngCount} 張`}
          open={open.has('png')}
          onToggle={() => toggle('png')}
        >
          <SnapshotMatrixPanel
            subjects={controller.subjects}
            selection={controller.snapshotSelection}
            disabled={exporting}
            onChange={controller.editSnapshotSelection}
          />
        </Section>

        <Section
          id="naming"
          index={3}
          title="檔名與選項"
          open={open.has('naming')}
          onToggle={() => toggle('naming')}
        >
          <ExportConfigurationPanel
            config={controller.config}
            disabled={exporting}
            folderSupported={supportsFolderPicker()}
            folderName={controller.directoryName}
            folderGranted={Boolean(controller.directory)}
            onPickFolder={controller.pickFolder}
            onChange={controller.setConfig}
          />
          <p className="mt-2 truncate rounded bg-surface-muted px-2 py-1 font-mono text-[10.5px] text-ink-700" title={controller.filenamePreview('pdf_report')}>
            {controller.filenamePreview('pdf_report') || '—'}
          </p>
        </Section>

        <Section
          id="results"
          index={4}
          title="匯出佇列"
          note={controller.queue.length > 0 ? `${controller.queue.length} 項` : '空'}
          open={open.has('results')}
          onToggle={() => toggle('results')}
        >
          {controller.queue.length === 0 ? (
            <p className="text-[11px] text-ink-400">還沒有匯出。按右邊欄的按鈕或下面的「匯出選取的」。</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line" data-testid="export-queue">
              {controller.queue.map((entry, index) => {
                const look = QUEUE_STATUS[entry.status] ?? QUEUE_STATUS.READY;
                const definition = ARTIFACT_DEFINITIONS.find((item) => item.type === entry.type);
                return (
                  <li key={`${entry.type}-${entry.filename}-${index}`} className="flex items-start gap-2 py-1.5 text-[11px]">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-ink-900">{definition?.zh ?? entry.type}</span>
                        <span className={`font-semibold ${look.tone}`}>{look.text}</span>
                        <span className="ml-auto text-ink-400 tabular">{bytes(entry.size_bytes)}</span>
                      </span>
                      <span className="block truncate font-mono text-[10.5px] text-ink-600" title={entry.filename}>
                        {entry.filename || '—'}
                      </span>
                      {entry.error && <span className="block text-[10.5px] text-danger-600">{entry.error}</span>}
                    </span>
                    {entry.object_url && (
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10.5px] text-ink-700 hover:bg-surface-muted"
                        onClick={() => controller.downloadAgain(entry)}
                      >
                        <Download className="size-3" aria-hidden />
                        再次下載
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {controller.lastManifest && (
            <button
              type="button"
              className="mt-2 text-[11px] font-semibold text-accent-700 hover:underline"
              onClick={() => controller.manifest.show(controller.lastManifest)}
            >
              看這次的追溯清單
            </button>
          )}
        </Section>

        <Section
          id="history"
          index={5}
          title="匯出紀錄"
          note={`本次 ${controller.history.length} 筆`}
          open={open.has('history')}
          onToggle={() => toggle('history')}
        >
          <div className="flex flex-col gap-2">
            <LocalExportNotice />
            <ExportHistoryPanel
              history={controller.history}
              onDownloadAgain={controller.downloadAgain}
              onCopyFilename={(entry) => {
                void navigator.clipboard?.writeText(entry.filename);
                toast.success('已複製檔名');
              }}
              onViewManifest={(entry) => controller.manifest.show(entry.manifest)}
            />
          </div>
        </Section>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3">
        <Button
          icon={<Download size={15} />}
          disabled={exporting || files.length === 0}
          onClick={() => controller.start({ mode: 'selected', types: files })}
        >
          匯出選取的 {files.length} 項
        </Button>
        <Button
          variant="primary"
          icon={<Package size={15} />}
          disabled={exporting || files.length === 0}
          onClick={() => controller.start({ mode: 'package', types: files })}
        >
          封裝成 ZIP
        </Button>
        <Button
          className="ml-auto"
          icon={<Trash2 size={14} />}
          disabled={exporting || controller.queue.length === 0}
          onClick={() => {
            controller.clearQueue();
            toast.success('已清空佇列');
          }}
        >
          清空佇列
        </Button>
      </footer>
    </aside>
  );
}

/** The warning confirmation and the manifest viewer, wherever the controller is. */
export function ExportDialogs({ controller }: { controller: ExportController }) {
  return (
    <>
      {controller.confirm && (
        <Modal
          title="有警告，仍要匯出？"
          onClose={controller.confirm.dismiss}
          footer={
            <>
              <Button onClick={controller.confirm.dismiss}>取消</Button>
              <Button variant="primary" onClick={controller.confirm.accept}>
                仍要匯出
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-ink-700">這次匯出的內容含有警告或不完整的輔助分析：</p>
            <ul className="flex flex-col gap-1">
              {controller.confirm.warnings_zh.map((warning) => (
                <li key={warning} className="text-[11.5px] leading-relaxed text-ink-600">
                  ・{warning}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-ink-400">這些警告會記錄在追溯清單裡。</p>
          </div>
        </Modal>
      )}

      {controller.manifest.text != null && (
        <Modal
          width="max-w-2xl"
          title="追溯清單"
          onClose={controller.manifest.close}
          footer={<Button onClick={controller.manifest.close}>關閉</Button>}
        >
          <pre className="max-h-[24rem] overflow-auto rounded border border-line bg-surface-muted p-2 font-mono text-[10.5px] text-ink-900">
            {controller.manifest.text}
          </pre>
        </Modal>
      )}
    </>
  );
}
