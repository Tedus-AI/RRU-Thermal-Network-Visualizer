/**
 * Screen 01 — Project Info.
 * Specification: 01_Project_Info.md. Mockup: 01/01.png.
 *
 * Establishes the shared project + thermal-design context every later screen
 * reads. It deliberately creates NO thermal nodes, edges or resistances (01 §45).
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, FilePlus2, RefreshCw } from 'lucide-react';

import { Badge, Button, Skeleton } from '@/ui/primitives';
import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { projectPath } from '@/app/navigation';
import { toast } from '@/ui/toast';

import { ProjectBasicsForm } from './ProjectBasicsForm';
import { ProjectScenarios } from './ProjectScenarios';
import { MaterialDefaultsForm } from './MaterialDefaultsForm';
import { ProjectNotes } from './ProjectNotes';
import { ProjectProgressPanel } from './ProjectProgressPanel';
import { ProjectActionBar } from './ProjectActionBar';
import { DuplicateProjectModal } from './modals/DuplicateProjectModal';
import { ArchiveProjectModal } from './modals/ArchiveProjectModal';
import { useProjectSave } from './useProjectSave';
import { nextStepFor, useProjectHealth } from './projectHealth';
import { useFormTouch } from './formTouch';
import { seedDemoProject } from '@/mock/seed';
import { useFolderStore } from '@/data/folderStore';
import { createScenario } from '@/domain/project';

function PageHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-6 pt-5 pb-4">
      <h1 className="text-[21px] font-bold text-ink-900">
        <span className="tabular mr-2 font-semibold text-ink-400">01</span>專案資訊
      </h1>
      {subtitle && <span className="text-[13px] text-ink-400">{subtitle}</span>}
    </div>
  );
}

/** 01 §21 — form + KPI skeletons, Save disabled, no stale project data shown. */
function LoadingState() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader subtitle="載入中…" />
      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
        <div className="flex flex-1 flex-col gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
        <div className="flex w-80 flex-col gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      </div>
    </div>
  );
}

/** 01 §22 */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const [showDetail, setShowDetail] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg bg-danger-100 text-danger-600">
          <AlertTriangle size={20} />
        </div>
        <h1 className="text-[16px] font-bold text-ink-900">無法載入專案</h1>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry}>
            重試
          </Button>
          <Button onClick={() => navigate('/')}>回專案清單</Button>
        </div>
        <button
          type="button"
          className="mt-4 text-[12px] text-ink-400 underline"
          onClick={() => setShowDetail((v) => !v)}
        >
          {showDetail ? '隱藏技術細節' : '技術細節'}
        </button>
        {showDetail && (
          <pre className="mt-2 overflow-x-auto rounded bg-surface-muted p-3 text-left font-mono text-[11px] text-ink-700">
            {message}
          </pre>
        )}
      </div>
    </div>
  );
}

/** 01 §20 */
export function EmptyProjectState() {
  const navigate = useNavigate();
  const [loadingDemo, setLoadingDemo] = useState(false);

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    try {
      const id = await seedDemoProject();
      useProjectStore.getState().refreshProjects();
      // Seeding makes two projects; the write listener only follows the active
      // one, so write them both out before the folder is read again.
      await useFolderStore.getState().mirrorAll();
      navigate(projectPath(id, 'info'));
      toast.success('已載入示範專案。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '無法建立示範專案。');
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg border border-line bg-surface text-accent-600">
          <FilePlus2 size={22} />
        </div>
        <h1 className="text-[18px] font-bold text-ink-900">建立第一個專案</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-500">
          一個專案＝一台產品的元件、熱路徑與情境。
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button
            variant="primary"
            icon={<FilePlus2 size={15} />}
            onClick={() => navigate('/project/new/info')}
          >
            新增專案
          </Button>
          <Button disabled={loadingDemo} onClick={handleLoadDemo}>
            {loadingDemo ? '示範專案建立中…' : '載入示範專案'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProjectInfoView() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);
  const draft = useProjectStore((s) => s.draft);
  const readOnly = useProjectStore((s) => s.isReadOnly());
  const isNew = useProjectStore((s) => s.isNew);

  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const health = useProjectHealth();
  const { save, canSave, errors, scenario } = useProjectSave();

  useEffect(() => {
    if (location.hash !== '#scenario-settings' || !draft) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById('scenario-settings')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, draft, scenario?.id]);

  // Load the project (or start a new one) whenever the route target changes.
  useEffect(() => {
    if (!projectId) return;

    const projectStore = useProjectStore.getState();
    const scenarioStore = useScenarioStore.getState();

    projectStore.refreshProjects();
    useFormTouch.getState().reset();
    useSolverStore.getState().reset();
    useComponentStore.getState().loadFor(projectId);
    useNetworkStore.getState().loadFor(projectId);

    if (projectId === 'new') {
      projectStore.startNewProject();
      scenarioStore.clear();
      useBoundaryStore.getState().clear();
      useSolutionStore.getState().clear();
      // 01 §8: a new project starts with an editable Baseline; it is persisted on
      // the first save (AC-03).
      scenarioStore.createDefaultScenario('');
      return;
    }

    projectStore.openProject(projectId);
    const loaded = scenarioStore.loadFor(projectId);
    if (loaded.length === 0) scenarioStore.createDefaultScenario(projectId);
    const activeScenarioId = useScenarioStore.getState().activeScenarioId;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
  }, [projectId]);

  /**
   * Creates the project. Only reachable while it is new — an existing project
   * persists on its own, so there is nothing here to trigger.
   */
  const handleCreate = (): boolean => {
    useFormTouch.getState().markSubmitAttempted();
    const savedId = useProjectStore.getState().draft?.project_id.trim();
    if (!save()) return false;
    // A new project moves from /project/new/info onto its real key.
    if (isNew && savedId && savedId !== projectId) {
      navigate(projectPath(savedId, 'info'), { replace: true });
    }
    return true;
  };

  const handleContinue = () => {
    const savedId = useProjectStore.getState().draft?.project_id.trim();
    const wasNew = isNew;
    // A project that does not exist yet has to be created before moving on.
    if (wasNew && !handleCreate()) return;
    const step = nextStepFor(health);
    const target = savedId ?? projectId!;
    // 01 §15: new projects go to Import Components; existing ones follow readiness.
    navigate(projectPath(target, wasNew ? 'import-components' : step.screenPath));
  };

  const selectScenario = (scenarioId: string) => {
    const storageProjectId = draft?.project_id.trim() || (projectId === 'new' ? '' : projectId!);
    useScenarioStore.getState().setActiveScenario(scenarioId, storageProjectId || undefined);
    useProjectStore.getState().setActiveScenarioId(scenarioId);
    if (storageProjectId) {
      useBoundaryStore.getState().loadFor(storageProjectId, scenarioId);
      useSolutionStore.getState().loadFor(storageProjectId, scenarioId);
    }
  };

  const createProjectScenario = () => {
    const storageProjectId = draft?.project_id.trim() || (projectId === 'new' ? '' : projectId!);
    const source = scenarios.find((entry) => entry.id === activeScenarioId) ?? scenarios[0];
    const scenario = createScenario(storageProjectId, `情境 ${scenarios.length + 1}`, source);
    useScenarioStore.getState().replaceAll([...scenarios, scenario]);
    if (storageProjectId) useScenarioStore.getState().persist(storageProjectId);
    selectScenario(scenario.id);
    toast.success('已新增情境');
  };

  if (!projectId) return <EmptyProjectState />;
  if (status === 'loading' || (status === 'idle' && !draft)) return <LoadingState />;
  if (status === 'error') {
    return (
      <ErrorState
        message={error ?? '未知錯誤'}
        onRetry={() => useProjectStore.getState().openProject(projectId)}
      />
    );
  }
  if (!draft) return <EmptyProjectState />;

  // Where Continue goes: a new project to Import Components (01 §15), an
  // existing one to the next step its progress points at.
  const next = nextStepFor(health);
  const continueTo = isNew || next.screenCode === '01' ? '' : next.cta;

  return (
    <ScreenWorkspace
      title="Project Info"
      titleZh="專案資訊"
      badge={
        readOnly ? (
          <Badge tone="accent">唯讀</Badge>
        ) : isNew ? (
          <Badge tone="warn">尚未建立</Badge>
        ) : undefined
      }
      rightPanel={<ProjectProgressPanel />}
      actionBar={
        <ProjectActionBar
          isNew={isNew}
          canSave={canSave}
          canContinue={canSave}
          archived={draft.status === 'archived'}
          continueTo={continueTo}
          onDuplicate={() => setShowDuplicate(true)}
          onArchive={() => setShowArchive(true)}
          onCreate={handleCreate}
          onContinue={handleContinue}
        />
      }
    >
      <ProjectBasicsForm errors={errors} readOnly={readOnly} />
      <ProjectScenarios
        scenarios={scenarios}
        scenario={scenario}
        errors={errors}
        readOnly={readOnly}
        onSelect={selectScenario}
        onCreate={createProjectScenario}
        onCopyFrom={(scenarioId) => {
          const copied = useBoundaryStore.getState().copyFromScenario(scenarioId);
          toast[copied ? 'success' : 'warning'](
            copied ? '已複製邊界條件，請檢查' : '該情境還沒有邊界條件',
          );
        }}
        onDelete={(scenarioId) => {
          const next = scenarios.filter((entry) => entry.id !== scenarioId);
          useScenarioStore.getState().replaceAll(next);
          const storageProjectId = draft.project_id.trim();
          if (storageProjectId) useScenarioStore.getState().persist(storageProjectId);
          toast.success('已刪除情境');
        }}
      />
      <MaterialDefaultsForm readOnly={readOnly} />
      <ProjectNotes readOnly={readOnly} />

      {showDuplicate && (
        <DuplicateProjectModal
          source={draft}
          scenarios={scenarios}
          onClose={() => setShowDuplicate(false)}
          onDuplicated={(newId) => {
            setShowDuplicate(false);
            useProjectStore.getState().refreshProjects();
            navigate(projectPath(newId, 'info'));
          }}
        />
      )}

      {showArchive && (
        <ArchiveProjectModal
          archived={draft.status === 'archived'}
          onClose={() => setShowArchive(false)}
          onConfirm={() => {
            const nextStatus = draft.status === 'archived' ? 'active' : 'archived';
            if (isNew) {
              toast.error('請先建立專案再封存。');
              setShowArchive(false);
              return;
            }
            useProjectStore.getState().setStatus(nextStatus);
            setShowArchive(false);
            toast.success(nextStatus === 'archived' ? '專案已封存' : '專案已還原');
          }}
        />
      )}
    </ScreenWorkspace>
  );
}
