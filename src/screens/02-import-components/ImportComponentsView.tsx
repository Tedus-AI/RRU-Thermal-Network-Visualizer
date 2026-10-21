/**
 * Screen 02 — Import Hardware Components.
 * Specification: 02_Import_Components.md. Chrome comes from the App Shell, see
 * docs/APP_SHELL_CONTRACT.md.
 *
 * This screen builds a clean, traceable, validated component dataset.
 * It creates NO thermal nodes or edges (02 §1, §34).
 *
 * Three steps: 來源 → 對應欄位 → 檢查並套用. A source whose columns are this
 * tool's own (AI-Thermal, another project here) is always fully mapped, so it
 * goes straight to the check step; the mapping step stays reachable to look at.
 * Applying is the check step's action and, by default, carries on to 04.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Loader2, XCircle } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { Badge, Button } from '@/ui/primitives';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useComponentImportStore, type ImportStep } from '@/data/componentImportStore';
import type { ApplyResult } from '@/importers/component/types';

import { WorkflowStepper } from './WorkflowStepper';
import { ImportSourceCards } from './ImportSourceCards';
import { ColumnMappingPanel } from './ColumnMappingPanel';
import { ComponentPreviewTable } from './ComponentPreviewTable';
import { MaterialDefaultsForm } from '@/project/MaterialDefaultsForm';
import { BlockingIssuesPanel, DuplicateBar, ReviewStatsLine } from './ImportSummaryPanel';
import { RruMaterialsOffer, useRruMaterialsSummary } from './RruMaterialsOffer';

const STEP_ORDER: ImportStep[] = ['source', 'mapping', 'review'];

function resultText(result: ApplyResult): string {
  const parts = [`新增 ${result.imported}`];
  if (result.updated > 0) parts.push(`更新 ${result.updated}`);
  if (result.skipped > 0) parts.push(`略過 ${result.skipped}`);
  return `已匯入（${parts.join('・')}）`;
}

/** The primary apply action with the rarer "stay here" under a ▾ beside it. */
function ApplySplitButton({
  count,
  disabled,
  onApply,
}: {
  count: number;
  disabled: boolean;
  onApply: (thenContinue: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex">
      <Button
        variant="primary"
        className="rounded-r-none"
        trailingIcon={<ArrowRight size={15} />}
        disabled={disabled}
        onClick={() => onApply(true)}
      >
        套用 {count} 顆並前往 04
      </Button>
      <Button
        variant="primary"
        className="rounded-l-none border-l border-white/30 px-2"
        aria-label="其他套用方式"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full z-30 mb-1 min-w-[15rem] rounded-lg border border-line bg-surface p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-md px-2.5 py-2 text-left text-[13px] text-ink-700 hover:bg-surface-muted"
            onClick={() => {
              setOpen(false);
              onApply(false);
            }}
          >
            套用並留在 02
            <span className="block text-[11.5px] text-ink-400">要接著匯入另一個來源時用</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function ImportComponentsView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

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
  const mappingAuto = useComponentImportStore((s) => s.mappingAuto);
  const source = useComponentImportStore((s) => s.source);
  const sourceContext = useComponentImportStore((s) => s.sourceContext);
  const canApply = useComponentImportStore((s) => s.canApply()) && !readOnly;
  const existing = useComponentStore((s) => s.components);
  const materials = draft?.materials;
  const rruSummary = useRruMaterialsSummary(
    source?.source_type === 'AIThermal' ? (sourceContext?.aiThermalProject ?? null) : null,
  );

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

  // Duplicates are judged against the project's components: when those change,
  // the staged rows are checked again (this replaces the old 重新驗證 button).
  useEffect(() => {
    if (useComponentImportStore.getState().phase === 'ready') useComponentImportStore.getState().rebuildRows();
  }, [existing]);

  // A material changed after loading — re-read the source against it.
  useEffect(() => {
    if (materials) useComponentImportStore.getState().reparse(materials);
  }, [materials]);

  if (!projectId || projectStatus === 'error' || (!draft && projectStatus !== 'loading')) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">無法開啟專案。</h1>
          <Button className="mt-4" onClick={() => navigate('/')}>
            回到專案列表
          </Button>
        </div>
      </div>
    );
  }

  const applied = phase === 'applied' && applyResult != null;
  const importable = rows.filter((row) => row.include && row.status !== 'ERROR').length;

  const handleApply = (thenContinue: boolean) => {
    const result = store.apply(projectId);
    if (!result) return;
    toast.success(resultText(result));
    if (thenContinue) {
      // 02 §25 — applying carries on to Screen 04 Component Manager.
      navigate(projectPath(projectId, 'components'));
    }
  };

  const reachable: ImportStep[] = table ? STEP_ORDER : ['source'];
  const index = STEP_ORDER.indexOf(step);
  const previous = !applied && index > 0 ? STEP_ORDER[index - 1] : null;

  const actionBar = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
      {previous && (
        <Button icon={<ArrowLeft size={15} />} onClick={() => store.setStep(previous)}>
          上一步
        </Button>
      )}
      {table && !applied && (
        <Button
          variant="danger"
          onClick={() => {
            store.cancel();
            toast.warning('已取消匯入，載入的資料已清除');
          }}
        >
          取消匯入
        </Button>
      )}
      {readOnly && <Badge tone="accent">唯讀：複製專案後才能匯入</Badge>}

      <div className="ml-auto flex gap-2">
        {applied ? (
          <>
            <Button onClick={() => store.cancel()}>再匯入其他來源</Button>
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              onClick={() => navigate(projectPath(projectId, 'components'))}
            >
              前往 04 元件管理
            </Button>
          </>
        ) : step === 'mapping' && table ? (
          <Button variant="primary" trailingIcon={<ArrowRight size={15} />} onClick={() => store.setStep('review')}>
            下一步：檢查並套用
          </Button>
        ) : step === 'review' && table ? (
          <ApplySplitButton count={importable} disabled={!canApply} onApply={handleApply} />
        ) : null}
      </div>
    </div>
  );

  return (
    <ScreenWorkspace
      title="Import Components"
      titleZh="匯入硬體元件"
      badge={
        applied ? (
          <Badge tone="ok">已套用</Badge>
        ) : table ? (
          <Badge tone="accent">已載入 {rows.length} 種（未套用）</Badge>
        ) : undefined
      }
      stepper={
        <WorkflowStepper
          current={step}
          reachable={applied ? [] : reachable}
          mappingAuto={mappingAuto}
          applied={applied}
          onSelect={store.setStep}
        />
      }
      actionBar={actionBar}
    >
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
          目前專案為唯讀，請先複製專案後再匯入元件。
        </div>
      )}

      {applied && applyResult && (
        <div className="rounded-lg border border-ok-500/40 bg-surface px-4 py-3 text-[13px]">
          <p className="flex items-center gap-1.5 font-semibold text-ok-600">
            <CheckCircle2 size={15} aria-hidden />
            {resultText(applyResult)}
            {applyResult.errors > 0 && <span className="font-normal text-ink-500">・{applyResult.errors} 列有錯誤沒有匯入</span>}
          </p>
          {applyResult.requires_network_review && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-warn-600">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
              新元件還沒接上熱網路，求解前請到 05 熱路徑建立更新網路。
            </p>
          )}
        </div>
      )}

      {!applied && step === 'source' && <ImportSourceCards />}

      {!applied && table && step === 'mapping' && <ColumnMappingPanel />}

      {!applied && table && step === 'review' && (
        <>
          <ReviewStatsLine />
          <BlockingIssuesPanel />
          <DuplicateBar />
          <div id="staging-preview">
            <ComponentPreviewTable />
          </div>
          {/*
            The project materials Screen 01 owns. A TIM column is matched
            against this library by name on apply, so a name that matches
            nothing can still be fixed here; an AI-Thermal source also offers
            5G-RRU's parameter console for it.
          */}
          <MaterialDefaultsForm
            readOnly={readOnly}
            defaultOpen={false}
            summaryExtra={rruSummary}
            lead={
              source?.source_type === 'AIThermal' && sourceContext?.aiThermalProject && draft ? (
                <RruMaterialsOffer
                  project={sourceContext.aiThermalProject}
                  projectName={source.source_project_name ?? source.source_project_id ?? ''}
                  materials={draft.materials}
                />
              ) : undefined
            }
          />
        </>
      )}
    </ScreenWorkspace>
  );
}
