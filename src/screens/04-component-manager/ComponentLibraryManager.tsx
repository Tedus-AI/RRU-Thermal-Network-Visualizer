/**
 * Browse, rename and delete what is in the component library — 04 §26.
 *
 * The library could take a component in ("Save to Library") and hand one back
 * ("Add from Library"), but nothing could look at what was in it. A catalogue
 * you cannot open is one you stop trusting: a part saved under a typo, or saved
 * twice from two projects, had no way of being found, let alone fixed.
 *
 * It also says WHERE the catalogue lives. That question came up because the
 * answer used to be "localStorage", which the build stamp clears on every
 * deploy. It is a file now, and the header names it.
 */

import { useMemo, useRef, useState } from 'react';
import { Check, Download, FolderOpen, Pencil, Search, Trash2, Upload, X } from 'lucide-react';

import { Badge, Button, Modal, TextInput } from '@/ui/primitives';
import { toast } from '@/ui/toast';
import { LIBRARY_FILENAME } from '@/data/componentLibraryFile';
import { useComponentLibraryStore, type LibraryEntry } from '@/data/componentLibraryStore';
import { useFolderStore } from '@/data/folderStore';
import { triggerDownload, textBlob } from '@/export/download';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/domain/component';

function savedAgo(iso: string | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today / 今天';
  if (days === 1) return '1 day ago / 1 天前';
  return `${days} days ago / ${days} 天前`;
}

function EntryRow({
  entry,
  inProject,
  onRename,
  onDelete,
}: {
  entry: LibraryEntry;
  /** True when this project already has a component of the same name. */
  inProject: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const spec = entry.thermal_spec;

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== entry.name) onRename(trimmed);
    setEditing(false);
  };

  return (
    <li className="rounded-md border border-line bg-surface px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <TextInput
                autoFocus
                aria-label={`Rename ${entry.name}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commit();
                  if (event.key === 'Escape') {
                    setDraft(entry.name);
                    setEditing(false);
                  }
                }}
                className="h-7"
              />
              <Button
                className="h-7 px-2"
                aria-label="Save name"
                icon={<Check size={13} />}
                onClick={commit}
              />
              <Button
                className="h-7 px-2"
                aria-label="Cancel rename"
                icon={<X size={13} />}
                onClick={() => {
                  setDraft(entry.name);
                  setEditing(false);
                }}
              />
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[13px] font-semibold text-ink-900">{entry.name}</span>
              <span className="shrink-0 text-[11px] text-ink-400">{entry.category}</span>
              {inProject && <Badge tone="accent">in project / 專案內已有</Badge>}
            </div>
          )}

          <p className="tabular mt-0.5 text-[11px] text-ink-400">
            {entry.default_power_W == null ? '— W' : `${entry.default_power_W} W`} ·{' '}
            {spec.heat_path.type} ·{' '}
            {spec.limit_C?.value == null ? '— °C' : `${spec.limit_C.value} °C`} ·{' '}
            {spec.r_jc_C_per_W?.value == null ? 'Rjc —' : `Rjc ${spec.r_jc_C_per_W.value}`} ·{' '}
            {savedAgo(entry.saved_at)}
          </p>
          {entry.notes && (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{entry.notes}</p>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 gap-1">
            <Button
              className="h-7 px-2"
              aria-label={`Rename ${entry.name}`}
              icon={<Pencil size={13} />}
              onClick={() => setEditing(true)}
            />
            <Button
              className="h-7 px-2"
              variant={confirmingDelete ? 'danger' : undefined}
              aria-label={
                confirmingDelete ? `Confirm delete ${entry.name}` : `Delete ${entry.name}`
              }
              icon={<Trash2 size={13} />}
              onClick={() => {
                // Deleting a catalogue entry is not undoable, so the second
                // click is the confirmation rather than a dialog on top of a
                // dialog.
                if (confirmingDelete) onDelete();
                else setConfirmingDelete(true);
              }}
              onBlur={() => setConfirmingDelete(false)}
            />
          </div>
        )}
      </div>

      {confirmingDelete && (
        <p className="mt-1.5 text-[11px] text-danger-600">
          Click again to remove it from the library. Components already added to a project keep
          their data.
          <span className="block">再按一次即從元件庫移除。已加入專案的元件不受影響。</span>
        </p>
      )}
    </li>
  );
}

export function ComponentLibraryManager({
  existingNames,
  onClose,
}: {
  existingNames: string[];
  onClose: () => void;
}) {
  const entries = useComponentLibraryStore((s) => s.entries);
  const rename = useComponentLibraryStore((s) => s.rename);
  const remove = useComponentLibraryStore((s) => s.remove);
  const importFile = useComponentLibraryStore((s) => s.importFile);
  const exportText = useComponentLibraryStore((s) => s.exportText);
  const folderName = useFolderStore((s) => s.handle?.name ?? null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ComponentCategory | 'ALL'>('ALL');
  const fileInput = useRef<HTMLInputElement>(null);

  const inProject = useMemo(
    () => new Set(existingNames.map((name) => name.trim().toLowerCase())),
    [existingNames],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category !== 'ALL' && entry.category !== category) return false;
      if (!needle) return true;
      return `${entry.name} ${entry.category} ${entry.notes ?? ''}`.toLowerCase().includes(needle);
    });
  }, [entries, search, category]);

  const handleImport = async (file: File) => {
    const result = importFile(await file.text());
    if (!result.ok) {
      toast.error(`Not a component library file — ${result.error} / 不是元件庫檔案`);
      return;
    }
    toast.success(
      `Library merged — ${result.added} added, ${result.updated} updated, ${result.kept} already newer / 已合併元件庫`,
    );
  };

  return (
    <Modal
      title="Component Library / 元件庫管理"
      description="Saved thermal specs, reusable across projects. Base zone, FloTHERM mapping and solver results are never stored here — they describe where a part sat in one particular radio."
      width="max-w-3xl"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close / 關閉</Button>}
    >
      <div className="flex flex-col gap-3">
        {/* Where it lives — the question that produced the file format. */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-500">
          <FolderOpen size={13} aria-hidden className="text-ink-400" />
          <span className="tabular font-medium text-ink-700">{LIBRARY_FILENAME}</span>
          {folderName ? (
            <span>
              in <span className="font-medium text-ink-700">{folderName}</span> / 已寫入資料夾
            </span>
          ) : (
            <span className="text-warn-600">
              No folder bound — kept in this browser only, and a new build clears it. /
              未綁定資料夾，僅存於此瀏覽器，改版後會清空。
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 shrink-0">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400"
            />
            <TextInput
              aria-label="Search the component library"
              className="pl-8"
              placeholder="Search / 搜尋…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ComponentCategory | 'ALL')}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
          >
            <option value="ALL">All categories / 全部類別</option>
            {COMPONENT_CATEGORIES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>

          <div className="ml-auto flex gap-2">
            <Button icon={<Upload size={14} />} onClick={() => fileInput.current?.click()}>
              Merge File / 合併
            </Button>
            <Button
              icon={<Download size={14} />}
              disabled={entries.length === 0}
              onClick={() => {
                const url = URL.createObjectURL(textBlob(exportText(), 'application/json'));
                triggerDownload(url, LIBRARY_FILENAME);
                URL.revokeObjectURL(url);
              }}
            >
              Export / 匯出
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset first, so picking the same file twice fires again.
              event.target.value = '';
              if (file) void handleImport(file);
            }}
          />
        </div>

        {entries.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-500">
            The library is empty. Save a component from its Source tab, or merge a library file.
            <span className="mt-1 block text-[12px] text-ink-400">
              元件庫是空的。請於元件的「Source 來源」分頁按「存入元件庫」，或合併他人的元件庫檔案。
            </span>
          </p>
        ) : (
          <>
            <ul className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">
              {visible.length === 0 && (
                <li className="px-2 py-6 text-center text-[12px] text-ink-400">
                  No saved part matches. / 沒有符合的元件。
                </li>
              )}
              {visible.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  inProject={inProject.has(entry.name.trim().toLowerCase())}
                  onRename={(name) => rename(entry.id, name)}
                  onDelete={() => {
                    remove(entry.id);
                    toast.success(`Removed "${entry.name}" from the library / 已從元件庫移除`);
                  }}
                />
              ))}
            </ul>
            <p className="tabular text-right text-[11px] text-ink-400">
              {visible.length} of {entries.length} parts / 共 {entries.length} 筆
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
