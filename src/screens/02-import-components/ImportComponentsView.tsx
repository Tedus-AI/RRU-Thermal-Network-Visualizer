/**
 * Screen 02 — Import Hardware Components.
 * Specification: 02_Import_Components.md. Mockup: 02/02.png (workflow only —
 * chrome comes from the App Shell, see docs/APP_SHELL_CONTRACT.md).
 *
 * This screen builds a clean, traceable, validated component dataset.
 * It creates NO thermal nodes or edges (02 §1, §34).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { Badge, Button, PanelCard } from '@/ui/primitives';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useComponentImportStore } from '@/data/componentImportStore';

import { WorkflowStepper } from './WorkflowStepper';
import { ImportSourceCards } from './ImportSourceCards';
import { ColumnMappingPanel } from './ColumnMappingPanel';
import { ComponentPreviewTable } from './ComponentPreviewTable';
import { DuplicatePolicyPanel } from './DuplicatePolicyPanel';
import { MaterialDefaultsForm } from '@/project/MaterialDefaultsForm';
import { ImportSummaryPanel, ProjectImpactPanel, ValidationPanel } from './ImportSummaryPanel';

function ActionBar({
  onBack,
  onCancel,
  onRevalidate,
  onApply,
  onApplyAndContinue,
  canApply,
  readOnly,
  hasSession,
}: {
  onBack: () => void;
  onCancel: () => void;
  onRevalidate: () => void;
  onApply: () => void;
  onApplyAndContinue: () => void;
  canApply: boolean;
  readOnly: boolean;
  hasSession: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
      <Button icon={<ArrowLeft size={15} />} onClick={onBack}>
        Back / 返回
      </Button>
      <Button variant="danger" disabled={!hasSession} onClick={onCancel}>
        Cancel Import / 取消匯入
      </Button>
      <Button icon={<RefreshCw size={15} />} disabled={!hasSession} onClick={onRevalidate}>
        Re-validate / 重新驗證
      </Button>

      {readOnly && (
        <Badge tone="accent">READ ONLY — duplicate the project to import / 唯讀</Badge>
      )}

      <div className="ml-auto flex gap-2">
        <Button icon={<Download size={15} />} disabled={!canApply} onClick={onApply}>
          Apply Import / 套用匯入
        </Button>
        <Button
          variant="primary"
          trailingIcon={<ArrowRight size={15} />}
          disabled={!canApply}
          onClick={onApplyAndContinue}
        >
          Apply &amp; Continue / 套用並繼續
        </Button>
      </div>
    </div>
  );
}

export function ImportComponentsView() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [applyThenContinue, setApplyThenContinue] = useState(false);

  const projectStatus = useProjectStore((s) => s.status);
  const draft = useProjectStore((s) => s.draft);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const store = useComponentImportStore();
  const phase = useComponentImportStore((s) => s.phase);
  const step = useComponentImportStore((s) => s.step);
  const table = useComponentImportStore((s) => s.table);
  const rows = useComponentImportStore((s) => s.rows);
  const error = useComponentImportStore((s) => s.error);
  const loadingMessage = useComponentImportStore((s) => s.loadingMessage);
  const applyResult = useComponentImportStore((s) => s.applyResult);
  const canApply = useComponentImportStore((s) => s.canApply()) && !readOnly;

  // Load the project context this screen imports into.
  useEffect(() => {
    if (!projectId) return;
    const projectStore = useProjectStore.getState();
    projectStore.refreshProjects();
    if (projectStore.draft?.project_id !== projectId) {
      projectStore.openProject(projectId);
      useScenarioStore.getState().loadFor(projectId);
      useSolverStore.getState().reset();
    }
    useComponentStore.getState().loadFor(projectId);
    useNetworkStore.getState().loadFor(projectId);
    return () => useComponentImportStore.getState().cancel();
  }, [projectId]);

  if (!projectId || projectStatus === 'error' || (!draft && projectStatus !== 'loading')) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">Unable to load project.</h1>
          <Button className="mt-4" onClick={() => navigate('/')}>
            Return to Project List
          </Button>
        </div>
      </div>
    );
  }

  const handleApply = (thenContinue: boolean) => {
    const result = store.apply(projectId);
    if (!result) return;
    setApplyThenContinue(thenContinue);
    toast.success(
      `Import completed — ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`,
    );
    if (thenContinue) {
      // 02 §25 — Apply & Continue goes to Screen 04 Component Manager.
      navigate(projectPath(projectId, 'components'));
    }
  };

  const reachable = table ? (['source', 'mapping', 'validate', 'duplicates'] as const) : (['source'] as const);

  const successPanel = applyResult && (
    <PanelCard title="Import Result / 匯入結果" icon={<CheckCircle2 size={15} />}>
      <p className="mb-2 text-[13px] font-semibold text-ok-600">
        Import completed successfully / 匯入完成
      </p>
      <dl className="tabular flex flex-col gap-1 text-[12px]">
        <div className="flex justify-between">
          <dt className="text-ink-500">Components imported / 新增</dt>
          <dd className="font-semibold">{applyResult.imported}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Existing updated / 更新</dt>
          <dd className="font-semibold">{applyResult.updated}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Rows skipped / 略過</dt>
          <dd className="font-semibold">{applyResult.skipped}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Errors / 錯誤</dt>
          <dd className="font-semibold">{applyResult.errors}</dd>
        </div>
      </dl>

      {applyResult.requires_network_review && (
        <p className="mt-3 rounded-md border border-warn-500/30 bg-warn-100/60 p-2.5 text-[11px] leading-relaxed text-warn-600">
          <AlertTriangle size={12} className="mr-1 inline" aria-hidden />
          New components were imported. They are not yet connected to the thermal network.
          Assign thermal architecture before solving.
          <span className="mt-0.5 block">
            新匯入的元件尚未連接至熱網路，請先於「熱路徑建立」指定熱架構再進行計算。
          </span>
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <Button
          variant="primary"
          trailingIcon={<ArrowRight size={14} />}
          onClick={() => navigate(projectPath(projectId, 'components'))}
        >
          Review Components / 檢視元件
        </Button>
        <Button onClick={() => store.cancel()}>Import More / 繼續匯入</Button>
      </div>
    </PanelCard>
  );

  return (
    <ScreenWorkspace
      title="Import Components"
      titleZh="匯入硬體元件"
      description="Import component data only. No thermal nodes or edges are created in this step."
      descriptionZh="本步驟僅匯入元件資料，不會建立任何熱網路節點 (Node) 或邊 (Edge)。"
      badge={
        applyResult ? (
          <Badge tone="ok">Applied / 已套用</Badge>
        ) : table ? (
          <Badge tone="accent">{rows.length} rows staged / 已暫存</Badge>
        ) : undefined
      }
      stepper={
        <WorkflowStepper
          current={step}
          reachable={applyResult ? [...reachable, 'apply'] : [...reachable]}
          onSelect={store.setStep}
        />
      }
      rightPanel={
        table ? (
          <>
            {successPanel}
            <ImportSummaryPanel />
            <ValidationPanel />
            <ProjectImpactPanel />
          </>
        ) : (
          successPanel || (
            <PanelCard title="Import Summary / 匯入摘要">
              <p className="text-[12px] leading-relaxed text-ink-400">
                Choose an import source to begin.
                <span className="block">請先選擇匯入來源。</span>
              </p>
            </PanelCard>
          )
        )
      }
      actionBar={
        <ActionBar
          canApply={canApply}
          readOnly={readOnly}
          hasSession={Boolean(table)}
          onBack={() => navigate(projectPath(projectId, 'info'))}
          onCancel={() => {
            store.cancel();
            toast.warning('Import cancelled — staged data cleared / 已取消匯入');
          }}
          onRevalidate={() => {
            store.rebuildRows();
            toast.success('Re-validated / 已重新驗證');
          }}
          onApply={() => handleApply(false)}
          onApplyAndContinue={() => handleApply(true)}
        />
      }
    >
      <ImportSourceCards />

      {phase === 'loading' && (
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-500">
          <Loader2 size={16} className="animate-spin text-accent-600" />
          {loadingMessage}
        </div>
      )}

      {phase === 'error' && error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger-500/40 bg-surface px-4 py-3 text-[13px] text-danger-600">
          <XCircle size={16} className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {readOnly && (
        <div className="rounded-lg border border-warn-500/40 bg-warn-100/50 px-4 py-3 text-[13px] text-warn-600">
          Current project is read-only. Duplicate the project to import components.
          <span className="block text-[12px]">目前專案為唯讀，請先複製專案後再匯入元件。</span>
        </div>
      )}

      {table && (
        <>
          <ColumnMappingPanel />
          <div id="staging-preview">
            <ComponentPreviewTable />
          </div>
          <DuplicatePolicyPanel />
          {/*
            The same project-level form Screen 01 owns. Importing is the first
            moment these numbers matter — an imported TIM inherits from them —
            so they are editable here rather than one screen back.
          */}
          {/* Folded here: the import is what this screen is for, and these
              numbers only need a glance unless the coin size is missing —
              which the collapsed header says. */}
          <MaterialDefaultsForm readOnly={false} defaultOpen={false} />
        </>
      )}

      {!table && phase !== 'loading' && phase !== 'error' && !applyThenContinue && (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-ink-700">Choose an import source to begin.</p>
          <p className="mt-1 text-[13px] text-ink-400">請先選擇上方的匯入來源。</p>
        </div>
      )}
    </ScreenWorkspace>
  );
}
