/**
 * Top header — part of the Master App Shell (00 §49, 01 §4.1).
 * Project selector, active scenario selector, and the global actions.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, HelpCircle, Library, Lock, Settings, Upload } from 'lucide-react';
import { GROUP_LABELS_EN, SCREENS, projectPath } from './navigation';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { toast } from '@/ui/toast';
import { biTitle } from '@/ui/FieldLabel';
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
import { useShellActions } from './shellActions';

/**
 * Solver state as the engineer reads it.
 *
 * `READY` means "never solved" — see `solverStore.invalidate`, where a
 * never-solved network deliberately stays READY. It is therefore shown as
 * `Not Solved` in neutral grey: a green "Ready" reads as "all good" when it
 * actually means there are no results at all, and it made the state
 * indistinguishable from a genuine `SOLVED`.
 */
const SOLVER_TONE: Record<
  SolverState,
  { dot: string; text: string; label: string; zh: string }
> = {
  READY: {
    dot: 'bg-white/30',
    text: 'text-white/60',
    label: 'Not Solved',
    zh: '尚未求解：此網路與情境還沒有任何結果。',
  },
  SOLVING: {
    dot: 'bg-accent-500',
    text: 'text-accent-500',
    label: 'Solving…',
    zh: '求解中。',
  },
  SOLVED: {
    dot: 'bg-ok-500',
    text: 'text-ok-500',
    label: 'Solved',
    zh: '已求解：結果為最新且無警告。',
  },
  WARNING: {
    dot: 'bg-warn-500',
    text: 'text-warn-500',
    label: 'Warning',
    zh: '已求解，但能量平衡或驗證有警告，採用前請確認。',
  },
  DIRTY: {
    dot: 'bg-warn-500',
    text: 'text-warn-500',
    label: 'Stale Results',
    zh: '結果已過期：求解後輸入被修改，請重新求解再讀取數值。',
  },
  FAILED: {
    dot: 'bg-danger-500',
    text: 'text-danger-500',
    label: 'Solve Failed',
    zh: '求解失敗：沒有可用結果。',
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
  const componentLibraryHandler = useShellActions((s) => s.componentLibraryHandler);

  const currentScreen =
    SCREENS.find((screen) => location.pathname.endsWith(`/${screen.path}`)) ?? SCREENS[0];

  const [dialog, setDialog] = useState<'settings' | 'help' | null>(null);
  const [pending, setPending] = useState<{
    file: ProjectFile;
    summary: ProjectFileSummary;
  } | null>(null);

  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null;
  // A project only exists on disk once created, and that is what a file is built from.
  const canExport = Boolean(draft && !isNew);

  const handleExport = () => {
    if (!draft || isNew) {
      toast.error('Create the project before exporting a project file.');
      return;
    }
    const file = collectProject(draft.project_id, BUILD_ID);
    if (!file) {
      toast.error('This project could not be read from storage.');
      return;
    }
    const blob = new Blob([serializeProjectFile(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, projectFilename(draft.project_id));
    // The anchor click is synchronous; the URL can go on the next tick.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success(`Exported ${file.project_name || file.project_id}.`);
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

  // Edits are already on disk, so switching away can never lose anything.
  const handleProjectChange = (value: string) => {
    if (value === '__new__') {
      navigate('/project/new/info');
      return;
    }
    navigate(projectPath(value, currentScreen.path));
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-shell-line bg-shell-800 pr-4 2xl:gap-5">
      <div className="flex h-full shrink-0 items-center gap-2.5 bg-shell-900 pr-6 pl-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-600 text-[13px] font-black text-white">
          5G
        </div>
        <div className="leading-tight whitespace-nowrap">
          <div className="text-[14px] font-bold text-white">5G Thermal Network Explorer</div>
          <div className="text-[11px] text-white/50">FR1 Base Station</div>
        </div>
      </div>

      <div className="w-40 shrink xl:w-56">
        <label htmlFor="hdr-project" className="mb-0.5 block text-[11px] text-white/50">
          Project
        </label>
        <select
          id="hdr-project"
          className={HEADER_SELECT_CLASS}
          value={isNew ? '__new__' : (draft?.project_id ?? '')}
          onChange={(event) => handleProjectChange(event.target.value)}
        >
          {isNew && <option value="__new__">New Project</option>}
          {projects.map((project) => (
            <option key={project.project_id} value={project.project_id}>
              {project.project_name || project.project_id}
              {project.status === 'archived' ? ' (archived)' : ''}
            </option>
          ))}
          {!isNew && <option value="__new__">+ New Project…</option>}
        </select>
      </div>

      <div className="w-36 shrink xl:w-48">
        {/*
          This selector sets the scenario every downstream screen computes
          against, so the label says which one is driving them rather than
          carrying a decorative "(Active)" tag that never changed.
        */}
        <label
          htmlFor="hdr-scenario"
          className="mb-0.5 flex items-center gap-1.5 text-[11px] text-white/50"
          title={biTitle(
            'Sets the scenario used by Screens 06–12.',
            '設定 06–12 各畫面所使用的情境；切換後下游結果會依該情境重新判定。',
          )}
        >
          <span className="truncate">Scenario / 情境</span>
          {activeScenario && (
            <span
              className={`shrink-0 rounded px-1 text-[9.5px] font-bold ${
                activeScenario.is_default
                  ? 'bg-accent-600/30 text-accent-500'
                  : 'bg-white/10 text-white/60'
              }`}
            >
              {activeScenario.is_default ? 'DEFAULT' : 'VARIANT'}
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
          {scenarios.length === 0 && <option value="">— None —</option>}
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
          title={biTitle(
            'This project is archived and cannot be edited. Restore it on Screen 01 to make changes.',
            '此專案已封存，無法編輯。請至 Screen 01 還原後才能修改。',
          )}
        >
          <Lock size={12} aria-hidden />
          READ-ONLY / 唯讀
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SaveIndicator />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <HeaderAction
          icon={Upload}
          label="Import"
          onClick={picker.open}
          title={biTitle(
            'Open a project file from disk',
            '從磁碟開啟專案檔（.tnv.json），可選擇覆寫或匯入為副本。',
          )}
        />
        <HeaderAction
          icon={Download}
          label="Export"
          disabled={!canExport}
          onClick={handleExport}
          title={biTitle(
            'Save this project to disk as a project file',
            '將目前專案存成專案檔（.tnv.json），包含元件、網路、邊界、求解結果與報告設定。',
          )}
        />
        {componentLibraryHandler && (
          <HeaderAction
            icon={Library}
            label="Library"
            onClick={componentLibraryHandler}
            title={biTitle('Manage the component library', '管理元件庫')}
          />
        )}
        <HeaderAction
          icon={Settings}
          label="Settings"
          onClick={() => setDialog('settings')}
          title={biTitle('Application and data settings', '應用程式與資料設定')}
        />
        <HeaderAction
          icon={HelpCircle}
          label="Help"
          onClick={() => setDialog('help')}
          title={biTitle('What the screens and status words mean', '畫面導覽與狀態說明')}
        />
      </div>
      {picker.input}

      <div className="ml-2 flex shrink-0 flex-col items-end gap-1 border-l border-shell-line pl-4 whitespace-nowrap">
        <div className="text-[13px] font-bold text-accent-500">
          {currentScreen.code} {currentScreen.labelEn}
          <span className="hidden font-normal text-white/50 2xl:inline">
            {' / '}
            {GROUP_LABELS_EN[currentScreen.group] ?? currentScreen.group}
          </span>
        </div>
        <div
          className={`flex items-center gap-1.5 text-[12px] ${tone.text}`}
          title={biTitle(`Solver: ${tone.label}`, tone.zh)}
        >
          <span aria-hidden className={`size-2 rounded-full ${tone.dot}`} />
          {tone.label}
        </div>
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
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {pending && (
        <ImportProjectDialog
          file={pending.file}
          summary={pending.summary}
          onCancel={() => setPending(null)}
          onImported={(projectId) => {
            setPending(null);
            useProjectStore.getState().refreshProjects();
            navigate(projectPath(projectId, 'info'));
            toast.success(`Imported ${projectId}.`);
          }}
        />
      )}
    </header>
  );
}
