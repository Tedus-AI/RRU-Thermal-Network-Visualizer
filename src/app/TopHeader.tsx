/**
 * Top header — part of the Master App Shell (00 §49, 01 §4.1).
 * Project selector, active scenario selector, and the global actions.
 */

import { useLocation } from 'react-router-dom';
import { Download, HelpCircle, Save, Settings, Upload } from 'lucide-react';
import { GROUP_LABELS_EN, SCREENS, projectPath } from './navigation';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useNavigationGuard } from './navigationGuard';
import { useGuardedNavigate } from './useGuardedNavigate';
import type { SolverState } from '@/thermal/types';

const SOLVER_TONE: Record<SolverState, { dot: string; text: string; label: string }> = {
  READY: { dot: 'bg-ok-500', text: 'text-ok-500', label: 'Ready' },
  DIRTY: { dot: 'bg-warn-500', text: 'text-warn-500', label: 'Stale results' },
  SOLVING: { dot: 'bg-accent-500', text: 'text-accent-500', label: 'Solving' },
  SOLVED: { dot: 'bg-ok-500', text: 'text-ok-500', label: 'Solved' },
  WARNING: { dot: 'bg-warn-500', text: 'text-warn-500', label: 'Warning' },
  FAILED: { dot: 'bg-danger-500', text: 'text-danger-500', label: 'Failed' },
};

function HeaderAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  badge,
}: {
  icon: typeof Save;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
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

export function TopHeader({ onSave }: { onSave?: () => void }) {
  const location = useLocation();
  const navigate = useGuardedNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projects = useProjectStore((s) => s.projects);
  const dirty = useProjectStore((s) => s.dirty);
  const isNew = useProjectStore((s) => s.isNew);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario);

  const solverState = useSolverStore((s) => s.state);
  const tone = SOLVER_TONE[solverState];

  const currentScreen =
    SCREENS.find((screen) => location.pathname.endsWith(`/${screen.path}`)) ?? SCREENS[0];

  const handleProjectChange = (value: string) => {
    if (value === '__new__') {
      if (dirty) {
        useNavigationGuard.getState().request({ kind: 'new-project' });
        return;
      }
      navigate('/project/new/info');
      return;
    }
    if (dirty) {
      useNavigationGuard.getState().request({ kind: 'switch-project', projectId: value });
      return;
    }
    navigate(projectPath(value, currentScreen.path));
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-5 border-b border-shell-line bg-shell-800 pr-4">
      <div className="flex h-full shrink-0 items-center gap-2.5 bg-shell-900 pr-6 pl-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-600 text-[13px] font-black text-white">
          5G
        </div>
        <div className="leading-tight whitespace-nowrap">
          <div className="text-[14px] font-bold text-white">5G Thermal Network Explorer</div>
          <div className="text-[11px] text-white/50">FR1 Base Station</div>
        </div>
      </div>

      <div className="w-56">
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

      <div className="w-48">
        <label htmlFor="hdr-scenario" className="mb-0.5 block text-[11px] text-white/50">
          Scenario <span className="text-accent-500">(Active)</span>
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

      <div className="ml-auto flex items-center gap-1">
        <HeaderAction
          icon={Save}
          label={dirty ? 'Unsaved' : 'Save'}
          badge={dirty}
          disabled={!onSave || readOnly}
          onClick={onSave}
        />
        <HeaderAction icon={Upload} label="Import" disabled />
        <HeaderAction icon={Download} label="Export" disabled />
        <HeaderAction icon={Settings} label="Settings" disabled />
        <HeaderAction icon={HelpCircle} label="Help" disabled />
      </div>

      <div className="ml-2 flex flex-col items-end gap-1 border-l border-shell-line pl-4">
        <div className="text-[13px] font-bold text-accent-500">
          {currentScreen.code} {currentScreen.labelEn}
          <span className="font-normal text-white/50">
            {' / '}
            {GROUP_LABELS_EN[currentScreen.group] ?? currentScreen.group}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-[12px] ${tone.text}`}>
          <span aria-hidden className={`size-2 rounded-full ${tone.dot}`} />
          {tone.label}
        </div>
      </div>
    </header>
  );
}
