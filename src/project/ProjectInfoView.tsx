/**
 * Screen 01 — Project Info.
 * Specification: 01_Project_Info.md. Mockup: 01/01.png.
 *
 * Establishes the shared project + thermal-design context every later screen
 * reads. It deliberately creates NO thermal nodes, edges or resistances (01 §45).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

import { ProjectIdentityForm } from './ProjectIdentityForm';
import { ProductThermalContextForm } from './ProductThermalContextForm';
import { BaselineScenarioForm } from './BaselineScenarioForm';
import { MaterialDefaultsForm } from './MaterialDefaultsForm';
import { ProjectNotes } from './ProjectNotes';
import { ProjectOverviewPanel } from './ProjectOverviewPanel';
import { ProjectHealthPanel } from './ProjectHealthPanel';
import { RecommendedNextStep } from './RecommendedNextStep';
import { ProjectActionBar } from './ProjectActionBar';
import { DuplicateProjectModal } from './modals/DuplicateProjectModal';
import { ArchiveProjectModal } from './modals/ArchiveProjectModal';
import { useProjectSave } from './useProjectSave';
import { nextStepFor, useProjectHealth } from './projectHealth';
import { useFormTouch } from './formTouch';
import { seedDemoProject } from '@/mock/seed';
import { useFolderStore } from '@/data/folderStore';

function PageHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-6 pt-5 pb-4">
      <h1 className="text-[21px] font-bold text-ink-900">
        Project Info <span className="font-semibold text-ink-500">/ 專案資訊</span>
      </h1>
      {subtitle && <span className="text-[13px] text-ink-400">{subtitle}</span>}
    </div>
  );
}

/** 01 §21 — form + KPI skeletons, Save disabled, no stale project data shown. */
function LoadingState() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader subtitle="Loading…" />
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
        <h1 className="text-[16px] font-bold text-ink-900">
          Unable to load project.
          <span className="mt-0.5 block text-[13px] font-normal text-ink-500">無法載入專案。</span>
        </h1>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry}>
            Retry / 重試
          </Button>
          <Button onClick={() => navigate('/')}>Return to Project List / 回專案清單</Button>
        </div>
        <button
          type="button"
          className="mt-4 text-[12px] text-ink-400 underline"
          onClick={() => setShowDetail((v) => !v)}
        >
          {showDetail ? 'Hide technical details / 隱藏技術細節' : 'Show technical details / 顯示技術細節'}
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
      toast.success('Golden Demo loaded with current analytical results.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to build the Golden Demo.');
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
        <h1 className="text-[18px] font-bold text-ink-900">
          Create your first thermal network project
          <span className="mt-1 block text-[14px] font-semibold text-ink-500">
            建立你的第一個熱網路專案
          </span>
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-500">
          A project holds the product context, scenarios and the thermal network for one
          5G FR1 radio.
          <span className="mt-1 block">
            一個專案包含單一 5G FR1 無線電的產品背景、情境設定與熱網路。
          </span>
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button
            variant="primary"
            icon={<FilePlus2 size={15} />}
            onClick={() => navigate('/project/new/info')}
          >
            + New Project / 新增專案
          </Button>
          <Button
            disabled={loadingDemo}
            onClick={handleLoadDemo}
          >
            {loadingDemo ? 'Building Golden Demo…' : 'Load Golden Demo Project'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProjectInfoView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);
  const draft = useProjectStore((s) => s.draft);
  const readOnly = useProjectStore((s) => s.isReadOnly());
  const isNew = useProjectStore((s) => s.isNew);

  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const scenarios = useScenarioStore((s) => s.scenarios);
  const health = useProjectHealth();
  const { save, canSave, errors, warnings, scenario } = useProjectSave();

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

  if (!projectId) return <EmptyProjectState />;
  if (status === 'loading' || (status === 'idle' && !draft)) return <LoadingState />;
  if (status === 'error') {
    return (
      <ErrorState
        message={error ?? 'Unknown error'}
        onRetry={() => useProjectStore.getState().openProject(projectId)}
      />
    );
  }
  if (!draft) return <EmptyProjectState />;

  return (
    <ScreenWorkspace
      title="Project Info"
      titleZh="專案資訊"
      badge={
        readOnly ? (
          <Badge tone="accent">READ ONLY / 唯讀</Badge>
        ) : isNew ? (
          <Badge tone="warn">New project — not yet saved / 尚未儲存</Badge>
        ) : undefined
      }
      rightPanel={
        <>
          <ProjectOverviewPanel />
          <ProjectHealthPanel />
          <RecommendedNextStep />
        </>
      }
      actionBar={
        <ProjectActionBar
          isNew={isNew}
          readOnly={readOnly}
          canSave={canSave}
          canContinue={canSave}
          archived={draft.status === 'archived'}
          warningCount={warnings.length}
          onDuplicate={() => setShowDuplicate(true)}
          onArchive={() => setShowArchive(true)}
          onCreate={handleCreate}
          onContinue={handleContinue}
        />
      }
    >
      <ProjectIdentityForm errors={errors} readOnly={readOnly} />
      <ProductThermalContextForm readOnly={readOnly} />
      <BaselineScenarioForm scenario={scenario} errors={errors} readOnly={readOnly} />
      {/* Collapsed by default: 11 fields, 10 of which already have a value. */}
      <MaterialDefaultsForm step={4} readOnly={readOnly} />
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
              toast.error('Save the project before archiving it.');
              setShowArchive(false);
              return;
            }
            useProjectStore.getState().setStatus(nextStatus);
            setShowArchive(false);
            toast.success(nextStatus === 'archived' ? 'Project archived' : 'Project restored');
          }}
        />
      )}
    </ScreenWorkspace>
  );
}
