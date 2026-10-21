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
import {
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Badge, Button, Modal, TextInput } from '@/ui/primitives';
import { toast } from '@/ui/toast';
import { LIBRARY_FILENAME } from '@/data/componentLibraryFile';
import {
  libraryTree,
  useComponentLibraryStore,
  type LibraryEntry,
} from '@/data/componentLibraryStore';
import { useFolderStore } from '@/data/folderStore';
import { triggerDownload, textBlob } from '@/export/download';
import {
  COMPONENT_CATEGORIES,
  isBodySourced,
  type ComponentCategory,
} from '@/domain/component';

function savedAgo(iso: string | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return '今天';
  if (days === 1) return '1 天前';
  return `${days} 天前`;
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
                aria-label={`重新命名 ${entry.name}`}
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
                aria-label="儲存名稱"
                icon={<Check size={13} />}
                onClick={commit}
              />
              <Button
                className="h-7 px-2"
                aria-label="取消重新命名"
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
              {inProject && <Badge tone="accent">專案內已有</Badge>}
            </div>
          )}

          <p className="tabular mt-0.5 text-[11px] text-ink-400">
            {entry.default_power_W == null ? '— W' : `${entry.default_power_W} W`} ·{' '}
            {spec.heat_path.type} ·{' '}
            {spec.limit_C?.value == null ? '— °C' : `${spec.limit_C.value} °C`} ·{' '}
            {isBodySourced(spec)
              ? 'Rjc N/A'
              : spec.r_jc_C_per_W?.value == null
                ? 'Rjc —'
                : `Rjc ${spec.r_jc_C_per_W.value}`}{' '}
            ·{' '}
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
              aria-label={`重新命名 ${entry.name}`}
              icon={<Pencil size={13} />}
              onClick={() => setEditing(true)}
            />
            <Button
              className="h-7 px-2"
              variant={confirmingDelete ? 'danger' : undefined}
              aria-label={
                confirmingDelete ? `確認刪除 ${entry.name}` : `刪除 ${entry.name}`
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
          再按一次即從元件庫移除；已加入專案的元件不受影響。
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
  const folderName = useFolderStore((s) =>
    [s.sharepoint.enabled ? 'SharePoint' : null, s.handle?.name ?? null].filter(Boolean).join(' + ') ||
      null,
  );

  const [search, setSearch] = useState('');
  const [collapsedProjects, setCollapsedProjects] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
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

  // Grouped from the FILTERED list, so searching narrows the tree rather than
  // leaving empty branches standing.
  const tree = useMemo(() => libraryTree(visible), [visible]);

  const handleImport = async (file: File) => {
    const result = importFile(await file.text());
    if (!result.ok) {
      toast.error(`不是元件庫檔案：${result.error}`);
      return;
    }
    toast.success(
      `已合併元件庫：新增 ${result.added}、更新 ${result.updated}、${result.kept} 筆原本就較新`,
    );
  };

  return (
    <Modal
      title="元件庫管理"
      description="跨專案共用的元件熱規格。基座區域與求解結果屬於個別專案，不會存在這裡。"
      width="max-w-3xl"
      onClose={onClose}
      footer={<Button onClick={onClose}>關閉</Button>}
    >
      <div className="flex flex-col gap-3">
        {/* Where it lives — the question that produced the file format. */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-500">
          <FolderOpen size={13} aria-hidden className="text-ink-400" />
          <span className="tabular font-medium text-ink-700">{LIBRARY_FILENAME}</span>
          {folderName ? (
            <span>
              存在 <span className="font-medium text-ink-700">{folderName}</span>
            </span>
          ) : (
            <span className="text-warn-600">
              未設定資料夾：只存在這個瀏覽器，改版後會清空。
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
              aria-label="搜尋元件庫"
              className="pl-8"
              placeholder="搜尋…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            aria-label="依分類篩選"
            value={category}
            onChange={(event) => setCategory(event.target.value as ComponentCategory | 'ALL')}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
          >
            <option value="ALL">全部分類</option>
            {COMPONENT_CATEGORIES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>

          <div className="ml-auto flex gap-2">
            <Button icon={<Upload size={14} />} onClick={() => fileInput.current?.click()}>
              合併
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
              匯出
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
            元件庫是空的。請在元件的「來源」分頁按「存入元件庫」，或合併別人的元件庫檔案。
          </p>
        ) : (
          <>
            {/* Project → category → part. The project is the top level and not
                a column because the catalogue can now hold the same part more
                than once: two rows called XCZU67DR, one at 35 W and one at
                20 W, are indistinguishable without saying which project each
                answers for. */}
            <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto">
              {visible.length === 0 && (
                <p className="px-2 py-6 text-center text-[12px] text-ink-400">
                  沒有符合的元件。
                </p>
              )}
              {tree.map((project) => {
                const collapsed = collapsedProjects.has(project.projectId);
                return (
                  <section key={project.projectId} className="rounded-md border border-line">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedProjects((current) => {
                          const next = new Set(current);
                          if (!next.delete(project.projectId)) next.add(project.projectId);
                          return next;
                        })
                      }
                      aria-expanded={!collapsed}
                      className="flex w-full items-center gap-1.5 rounded-t-md bg-surface-muted px-2.5 py-1.5 text-left text-[12px] font-bold text-ink-800"
                    >
                      <ChevronDown
                        size={13}
                        className={`shrink-0 text-ink-400 ${collapsed ? '-rotate-90' : ''}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{project.projectName}</span>
                      <span className="tabular shrink-0 text-[11px] font-normal text-ink-400">
                        {project.count}
                      </span>
                    </button>
                    {!collapsed && (
                      <div className="flex flex-col gap-2 p-2">
                        {project.categories.map((group) => (
                          <div key={group.category}>
                            <p className="mb-1 text-[11px] font-semibold text-ink-500">
                              {group.category}
                              <span className="ml-1 font-normal text-ink-400">
                                ({group.entries.length})
                              </span>
                            </p>
                            <ul className="flex flex-col gap-1.5">
                              {group.entries.map((entry) => (
                                <EntryRow
                                  key={entry.id}
                                  entry={entry}
                                  inProject={inProject.has(entry.name.trim().toLowerCase())}
                                  onRename={(name) => rename(entry.id, name)}
                                  onDelete={() => {
                                    remove(entry.id);
                                    toast.success(
                                      `已從元件庫移除「${entry.name}」`,
                                    );
                                  }}
                                />
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <p className="tabular text-right text-[11px] text-ink-400">
              顯示 {visible.length} 筆，共 {entries.length} 筆
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
