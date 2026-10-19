/**
 * Top header — part of the Master App Shell (00 §49, 01 §4.1).
 * Project selector, active scenario selector, and the global actions.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, HelpCircle, Library, Lock, Settings, Trash2, Upload } from 'lucide-react';
import { SCREENS, projectPath } from './navigation';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { toast } from '@/ui/toast';
import { Button, Modal } from '@/ui/primitives';
import { SaveIndicator } from './SaveIndicator';
import { triggerDownload } from '@/export/download';
import { BUILD_ID } from '@/data/bootstrapStorage';
import {
  collectProject,
  parseProjectFile,
  projectFilename,
  serializeProjectFile,
  type ProjectFile,
  type ProjectFileSummary,
} from '@/data/projectFile';
import {
  HelpDialog,
  ImportProjectDialog,
  SettingsDialog,
  useProjectFilePicker,
} from './ShellDialogs';
import type { SolverState } from '@/thermal/types';
import { loadComponents, purgeProject } from '@/data/persistence';
import { useComponentLibraryStore } from '@/data/componentLibraryStore';
import { useFolderStore } from '@/data/folderStore';
import { ComponentLibraryManager } from '@/screens/04-component-manager/ComponentLibraryManager';

/**
 * Solver state as the engineer reads it.
 *
 * `READY` means "never solved" — see `solverStore.invalidate`, where a
 * never-solved network deliberately stays READY. It is therefore shown as
 * 尚未求解 in neutral grey: a green "Ready" reads as "all good" when it
 * actually means there are no results at all, and it made the state
 * indistinguishable from a genuine `SOLVED`.
 */
const SOLVER_TONE: Record<
  SolverState,
  { dot: string; text: string; label: string; detail: string }
> = {
  READY: {
    dot: 'bg-white/30',
    text: 'text-white/60',
    label: '尚未求解',
    detail: '此網路與情境還沒有任何結果。',
  },
  SOLVING: {
    dot: 'bg-accent-500',
    text: 'text-accent-500',
    label: '求解中…',
    detail: '求解中。',
  },
  SOLVED: {
    dot: 'bg-ok-500',
    text: 'text-ok-500',
    label: '已求解',
    detail: '結果為最新且無警告。',
  },
  WARNING: {
    dot: 'bg-warn-500',
    text: 'text-warn-500',
    label: '求解有警告',
    detail: '已求解，但能量平衡或驗證有警告，採用前請確認。',
  },
  DIRTY: {
    dot: 'bg-warn-500',
    text: 'text-warn-500',
    label: '結果需更新',
    detail: '求解後輸入被修改，請重新求解再讀取數值。',
  },
  FAILED: {
    dot: 'bg-danger-500',
    text: 'text-danger-500',
    label: '求解失敗',
    detail: '沒有可用結果。',
  },
};

function HeaderAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  badge,
  title,
}: {
  icon: typeof Upload;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className="relative flex h-12 w-16 flex-col items-center justify-center gap-1 rounded-md text-white/75 transition-colors hover:bg-shell-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={17} />
      <span className="text-[11px] font-medium">{label}</span>
      {badge && (
        <span
          aria-hidden
          className="absolute top-1.5 right-3 size-2 rounded-full bg-warn-500 ring-2 ring-shell-800"
        />
      )}
    </button>
  );
}

const HEADER_SELECT_CLASS =
  "h-9 w-full appearance-none rounded-md border border-shell-600 bg-shell-700 bg-[url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 12 12\"><path d=\"M2 4.5L6 8.5L10 4.5\" stroke=\"white\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/></svg>')] bg-[right_0.6rem_center] bg-no-repeat px-2.5 pr-7 text-[13px] font-medium text-white focus:border-accent-500 focus:outline-none disabled:opacity-50";

export function TopHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projects = useProjectStore((s) => s.projects);
  const isNew = useProjectStore((s) => s.isNew);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario);

  const solverState = useSolverStore((s) => s.state);
  const tone = SOLVER_TONE[solverState];

  const currentScreen =
    SCREENS.find((screen) => location.pathname.endsWith(`/${screen.path}`)) ?? SCREENS[0];

  const [dialog, setDialog] = useState<'library' | 'settings' | 'help' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState<{
    file: ProjectFile;
    summary: ProjectFileSummary;
  } | null>(null);

  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null;
  // A project only exists on disk once created, and that is what a file is built from.
  const canExport = Boolean(draft && !isNew);

  const handleExport = () => {
    if (!draft || isNew) {
      toast.error('請先建立專案，再匯出專案檔。');
      return;
    }
    const file = collectProject(draft.project_id, BUILD_ID);
    if (!file) {
      toast.error('無法從儲存位置讀取此專案。');
      return;
    }
    const blob = new Blob([serializeProjectFile(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, projectFilename(draft.project_id));
    // The anchor click is synchronous; the URL can go on the next tick.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success(`已匯出 ${file.project_name || file.project_id}。`);
  };

  /** Shared by the file picker and by loading from the bound folder. */
  const openImport = (text: string) => {
    const parsed = parseProjectFile(text);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setPending({ file: parsed.file, summary: parsed.summary });
  };

  const picker = useProjectFilePicker(openImport);

  const onSharePoint = useFolderStore((s) => s.sharepoint.enabled);
  const hasLocal = useFolderStore((s) => s.handle != null);

  // Edits are already on disk, so switching away can never lose anything.
  const handleProjectChange = async (value: string) => {
    if (value === '__new__') {
      navigate('/project/new/info');
      return;
    }
    // On SharePoint a colleague may have saved this project since it was
    // read. Its newer version is read in first when it arrives quickly;
    // otherwise the cached copy opens, and a save still cannot overwrite theirs.
    const wait = 2500;
    await Promise.race([
      useFolderStore.getState().refreshProject(value, Date.now() + wait),
      new Promise((resolve) => setTimeout(resolve, wait)),
    ]);
    navigate(projectPath(value, currentScreen.path));
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-shell-line bg-shell-800 pr-4 2xl:gap-5">
      <div className="flex h-full shrink-0 items-center gap-2.5 bg-shell-900 pr-6 pl-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-600 text-[13px] font-black text-white">
          5G
        </div>
        <div className="text-[14px] font-bold whitespace-nowrap text-white">5G 熱網路分析</div>
      </div>

      <div className="w-48 shrink xl:w-72">
        <label htmlFor="hdr-project" className="mb-0.5 block text-[11px] text-white/50">
          專案
        </label>
        <div className="flex items-center gap-1">
          <select
            id="hdr-project"
            className={HEADER_SELECT_CLASS}
            value={isNew ? '__new__' : (draft?.project_id ?? '')}
            onChange={(event) => void handleProjectChange(event.target.value)}
          >
            {isNew && <option value="__new__">新專案（尚未建立）</option>}
            {projects.map((project) => (
              <option key={project.project_id} value={project.project_id}>
                {project.project_name || project.project_id}
                {project.status === 'archived' ? '（已封存）' : ''}
              </option>
            ))}
            {!isNew && <option value="__new__">＋ 新增專案…</option>}
          </select>
          {/*
            Deletes the project the selector is showing. Beside the selector
            rather than inside it, because a delete that lives among the options
            is one mis-click away from happening — and a `<select>` cannot warn.
          */}
          <button
            type="button"
            disabled={!draft || isNew}
            onClick={() => {
              if (!draft) return;
              // A place that is set up but out of reach would keep the file,
              // and the next read would bring the project straight back.
              const blocker = useFolderStore.getState().deleteBlocker();
              if (blocker) {
                toast.error(blocker);
                return;
              }
              setConfirmDelete({
                id: draft.project_id,
                name: draft.project_name || draft.project_id,
              });
            }}
            title="刪除目前專案及其所有資料"
            aria-label="刪除目前專案"
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-shell-600 bg-shell-700 text-white/60 transition-colors hover:border-danger-600 hover:bg-danger-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-shell-600 disabled:hover:bg-shell-700 disabled:hover:text-white/60"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="w-40 shrink xl:w-56">
        {/*
          This selector sets the scenario every downstream screen computes
          against, so the label says which one is driving them rather than
          carrying a decorative "(Active)" tag that never changed.
        */}
        <label
          htmlFor="hdr-scenario"
          className="mb-0.5 flex items-center gap-1.5 text-[11px] text-white/50"
          title="06 之後各頁都依這個情境計算；切換後結果會依新情境重新判定。"
        >
          <span className="truncate">情境</span>
          {activeScenario?.is_default && (
            <span className="shrink-0 rounded bg-accent-600/30 px-1 text-[10px] font-bold text-accent-500">
              預設
            </span>
          )}
        </label>
        <select
          id="hdr-scenario"
          className={HEADER_SELECT_CLASS}
          value={activeScenarioId ?? ''}
          disabled={scenarios.length === 0}
          onChange={(event) => setActiveScenario(event.target.value)}
        >
          {scenarios.length === 0 && <option value="">— 無 —</option>}
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </div>

      {/* An archived project accepts no edits, and nothing else in the header
          says so. */}
      {readOnly && (
        <span
          className="flex items-center gap-1.5 rounded border border-accent-500/40 bg-accent-600/20 px-2 py-1 text-[11px] font-bold text-accent-500"
          title="此專案已封存，無法編輯。請到 01 專案資訊還原後再修改。"
        >
          <Lock size={12} aria-hidden />
          唯讀
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center">
        <SaveIndicator onOpenSettings={() => setDialog('settings')} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <HeaderAction
          icon={Upload}
          label="匯入"
          onClick={picker.open}
          title="開啟專案檔（.tnv.json），可覆寫或匯入為副本"
        />
        <HeaderAction
          icon={Download}
          label="匯出"
          disabled={!canExport}
          onClick={handleExport}
          title="把目前專案存成專案檔（.tnv.json），含元件、熱網路、邊界、求解結果與報告設定"
        />
        <HeaderAction
          icon={Library}
          label="元件庫"
          onClick={() => {
            setDialog('library');
            void useComponentLibraryStore.getState().loadWithFolder();
          }}
          title="管理元件庫"
        />
        <HeaderAction
          icon={Settings}
          label="設定"
          onClick={() => setDialog('settings')}
          title="儲存位置與資料設定"
        />
        <HeaderAction
          icon={HelpCircle}
          label="說明"
          onClick={() => setDialog('help')}
          title="畫面導覽與狀態說明"
        />
      </div>
      {picker.input}

      {/*
        Only the solver state lives here. The screen name used to sit above it,
        a third copy of what the sidebar and the page title already say.
      */}
      <div
        className={`ml-2 flex shrink-0 items-center gap-1.5 border-l border-shell-line pl-4 text-[12.5px] font-semibold whitespace-nowrap ${tone.text}`}
        title={tone.detail}
      >
        <span aria-hidden className={`size-2 rounded-full ${tone.dot}`} />
        {tone.label}
      </div>

      {dialog === 'settings' && (
        <SettingsDialog
          onClose={() => setDialog(null)}
          canExport={canExport}
          onExportProject={() => {
            setDialog(null);
            handleExport();
          }}
          onImportProject={() => {
            setDialog(null);
            picker.open();
          }}
          onFileText={(text) => {
            setDialog(null);
            openImport(text);
          }}
        />
      )}
      {dialog === 'library' && (
        <ComponentLibraryManager
          existingNames={
            draft ? loadComponents(draft.project_id).map((component) => component.name) : []
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}

      {/*
        The warning names the project, because the selector may have been
        changed since the button was reached for, and it names what goes with
        it — the components, the network and the results are the work, not the
        project record. There is no undo, and the file on disk is the only copy
        that survives, so the export is offered right here rather than as
        advice the reader has to act on somewhere else.
      */}
      {confirmDelete && (
        <Modal
          title="刪除此專案？"
          description={`「${confirmDelete.name}」及其所有資料（元件、熱網路、邊界條件、求解結果、分析與報告設定）都會刪除，無法復原。`}
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(null)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const { id, name } = confirmDelete;
                  setConfirmDelete(null);
                  purgeProject(id);
                  const remaining = useProjectStore.getState().refreshProjects();
                  const next = remaining.find((project) => project.project_id !== id);
                  navigate(next ? projectPath(next.project_id, 'info') : '/project/new/info');
                  // The folder is the other half of the delete. Clearing only
                  // the browser cache left the JSON on disk, so the next
                  // hydrate read the project straight back in: the delete
                  // looked like it worked right up until the folder was
                  // re-read. Awaited after navigating, because the file write
                  // is slow and the engineer should not sit on a modal for it.
                  void useFolderStore
                    .getState()
                    .deleteProjectFile(id)
                    .then((removed) => {
                      if (removed) toast.success(`已刪除 ${name}。`);
                      else
                        toast.error(
                          `已刪除 ${name}，但儲存位置中仍有它的檔案，請查看上方儲存狀態。`,
                        );
                    });
                }}
              >
                刪除
              </Button>
            </>
          }
        >
          <p className="text-[12px] text-ink-500">
            {onSharePoint && hasLocal
              ? '專案檔會從 SharePoint（所有人）與本機資料夾刪除；網站資源回收筒清空前，可由網站管理者還原。'
              : onSharePoint
                ? '專案檔會從 SharePoint 刪除（所有人）；網站資源回收筒清空前，可由網站管理者還原。'
                : '專案檔會從本機資料夾刪除；日後可能還需要的話，請先匯出專案檔。'}
          </p>
        </Modal>
      )}
      {pending && (
        <ImportProjectDialog
          file={pending.file}
          summary={pending.summary}
          onCancel={() => setPending(null)}
          onImported={(projectId) => {
            setPending(null);
            useProjectStore.getState().refreshProjects();
            navigate(projectPath(projectId, 'info'));
            toast.success(`已匯入 ${projectId}。`);
          }}
        />
      )}
    </header>
  );
}
