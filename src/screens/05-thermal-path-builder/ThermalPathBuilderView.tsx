/**
 * Screen 05 — Thermal Path Builder.
 * Specification: 05_Thermal_Path_Builder.md.
 *
 * This screen describes HOW HEAT CAN TRAVEL. It does not pretend to know how
 * many watts take each route or what any node ends up at: no solve, no boundary
 * conditions, no invented edge heat flow (05 §22, §45, §64).
 *
 * `networkStore` is the single source of truth; Cytoscape is only a view (05 §46).
 *
 * The screen's state, effects and actions live in `useThermalPathBuilder`; the
 * action bar, tool column, canvas, inspector and dialogs are components of
 * their own (`Builder*.tsx`) that read from it. This file keeps the loading and
 * error states and the layout that puts them together.
 */

import { Boxes, CircleSlash, Link2, Octagon, Share2, TriangleAlert, XCircle } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { Badge, Button } from '@/ui/primitives';
import { toast } from '@/ui/toast';

import { useNetworkStore } from '@/data/networkStore';
import { useBoundaryStore } from '@/data/boundaryStore';

import { powerWOf, type Component } from '@/domain/component';

import { BuilderStepper, type BuilderStep } from './BuilderStepper';
import { applyBoundaryValidationOverlay } from './boundaryValidationOverlay';
import { KpiCard, LoadingState } from './builderBlocks';
import { useThermalPathBuilder } from './useThermalPathBuilder';
import { BuilderActionBar } from './BuilderActionBar';
import { BuilderSidebar } from './BuilderSidebar';
import { BuilderCanvasArea } from './BuilderCanvasArea';
import { BuilderInspectorPanel } from './BuilderInspectorPanel';
import { BuilderModals } from './BuilderModals';

// --- Screen ----------------------------------------------------------------

export function ThermalPathBuilderView() {
  const builder = useThermalPathBuilder();
  const {
    components,
    displayValidation,
    draft,
    fullscreen,
    handleSave,
    kpis,
    modeledIds,
    navigate,
    network,
    projectId,
    projectStatus,
    readOnly,
    requiresReview,
    scenarioBoundaryEdges,
    selection,
    setStep,
    setWarningConfirm,
    solverState,
    step,
  } = builder;

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">Unable to load thermal network.</h1>
          <p className="mt-1 text-[13px] text-ink-500">無法載入熱網路。</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => projectId && useNetworkStore.getState().loadFor(projectId)}
            >
              Retry / 重試
            </Button>
            <Button onClick={() => navigate('/')}>Return to Component Manager</Button>
          </div>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft || !network) return <LoadingState />;

  const blockingErrors = displayValidation?.errors ?? 0;
  const warnings = displayValidation?.warnings ?? 0;
  const isEmpty = Object.keys(network.nodes).length === 0;

  const handleSaveAndContinue = () => {
    if (blockingErrors > 0) return;
    handleSave();
    if (warnings > 0) {
      setWarningConfirm(warnings);
      return;
    }
    navigate(projectPath(projectId, 'boundary'));
  };

  /** Both Validate buttons must report the same active-scenario view as the panel. */
  const handleValidate = () => {
    const rawResult = useNetworkStore.getState().revalidate();
    const boundaryState = useBoundaryStore.getState();
    const result = applyBoundaryValidationOverlay(
      rawResult,
      useNetworkStore.getState().network,
      boundaryState.ports,
      boundaryState.current(),
    );
    setStep('validate');
    if (!result) {
      toast.warning('Nothing to validate yet / 尚無可驗證的網路');
    } else if (result.errors > 0) {
      toast.error(
        `${result.errors} error(s), ${result.warnings} warning(s) / ${result.errors} 個錯誤、${result.warnings} 個警告`,
      );
    } else if (result.warnings > 0) {
      toast.warning(
        `No errors, ${result.warnings} warning(s) / 無錯誤，${result.warnings} 個警告`,
      );
    } else {
      toast.success('Network is valid / 熱網路驗證通過');
    }
  };

  const selectedNode = selection?.kind === 'node' ? network.nodes[selection.id] : null;
  const selectedEdge = selection?.kind === 'edge' ? network.edges[selection.id] : null;
  const selectedScenarioBoundary = selectedEdge
    ? scenarioBoundaryEdges.get(selectedEdge.id)
    : undefined;

  const completedSteps: BuilderStep[] = [];
  if (components.length > 0) completedSteps.push('components');
  if (modeledIds.size > 0) completedSteps.push('templates');
  if (Object.keys(network.zones).length > 0) completedSteps.push('structure');
  if (kpis.unconnectedPorts === 0 && kpis.nodes > 0) completedSteps.push('connections');
  if (displayValidation && displayValidation.errors === 0 && kpis.nodes > 0) {
    completedSteps.push('validate');
  }

  return (
    <ScreenWorkspace
      title="Thermal Path Builder"
      titleZh="熱路徑設定"
      descriptionZh="定義熱可以怎麼走：元件子圖、共用結構與彼此的連接。本畫面不設定邊界條件，也不進行求解。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          <Badge tone={network.status === 'NEEDS_REVIEW' ? 'warn' : 'neutral'}>
            {network.status}
          </Badge>
          <Badge tone={solverState === 'DIRTY' ? 'warn' : 'neutral'}>Solver {solverState}</Badge>
          {requiresReview && (
            <span title="04 改了會影響熱路徑的欄位（數量、TIM、熱路徑、幾何、啟用、新增或刪除元件）。到 05 按「依偏好產生」重建，或檢查後按「儲存並繼續」，這個提醒就會消失。">
              <Badge tone="warn">Linked parameters changed / 連動參數已變更</Badge>
            </span>
          )}
        </div>
      }
      metrics={
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={<Boxes size={13} />}
            value={`${kpis.componentsModeled} / ${kpis.componentsTotal}`}
            label="Components Modeled"
            zh="建模元件"
          />
          <KpiCard icon={<Share2 size={13} />} value={kpis.nodes} label="Nodes" zh="節點" />
          <KpiCard icon={<Link2 size={13} />} value={kpis.edges} label="Edges" zh="連線" />
          <KpiCard
            icon={<CircleSlash size={13} />}
            iconTone={kpis.unconnectedPorts > 0 ? 'text-warn-600' : 'text-ink-400'}
            value={kpis.unconnectedPorts}
            label="Unconnected Ports"
            zh="未連接埠"
            tone={kpis.unconnectedPorts > 0 ? 'text-warn-600' : 'text-ink-900'}
          />
          <KpiCard
            icon={<TriangleAlert size={13} />}
            iconTone={kpis.unresolvedRth > 0 ? 'text-warn-600' : 'text-ink-400'}
            value={kpis.unresolvedRth}
            label="Unresolved Rth"
            zh="未解析熱阻"
            tone={kpis.unresolvedRth > 0 ? 'text-warn-600' : 'text-ink-900'}
          />
          <KpiCard
            icon={<Octagon size={13} />}
            iconTone={blockingErrors > 0 ? 'text-danger-600' : 'text-ok-600'}
            value={blockingErrors}
            label="Blocking Errors"
            zh="阻擋錯誤"
            tone={blockingErrors > 0 ? 'text-danger-600' : 'text-ok-600'}
          />
        </div>
      }
      stepper={<BuilderStepper current={step} onSelect={setStep} completed={completedSteps} />}
      actionBar={
        <BuilderActionBar
          builder={builder}
          projectId={projectId}
          blockingErrors={blockingErrors}
          isEmpty={isEmpty}
          onSaveAndContinue={handleSaveAndContinue}
          onValidate={handleValidate}
        />
      }
    >
      {/* The editor fills every pixel left by the shell. Fullscreen promotes this
          workspace above the shell while keeping the same editing controls. */}
      <div
        className={`flex min-h-[22rem] flex-1 flex-col gap-3 lg:flex-row ${fullscreen ? 'fixed inset-0 z-30 min-h-0 bg-canvas p-3' : ''}`}
        data-testid="thermal-path-workspace"
      >
        {/* The palettes scroll inside their own column so the canvas keeps a
            stable viewport — a graph editor cannot live in a page that scrolls. */}
        {!fullscreen && <BuilderSidebar builder={builder} network={network} />}

        <BuilderCanvasArea
          builder={builder}
          network={network}
          projectId={projectId}
          isEmpty={isEmpty}
          onValidate={handleValidate}
        />
      </div>

      {/* Like Screen 04, inspection is non-modal: the graph keeps its full
          width and remains clickable behind the movable, resizable window. */}
      {(selectedNode || selectedEdge) && (
        <BuilderInspectorPanel
          builder={builder}
          network={network}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          selectedScenarioBoundary={selectedScenarioBoundary}
        />
      )}

      {/* --- Modals --- */}
      <BuilderModals builder={builder} network={network} projectId={projectId} />
    </ScreenWorkspace>
  );
}

/** Kept for the palette: total dissipation summary, never an edge heat flow. */
export function totalDissipation(components: Component[]): number {
  return components.reduce((sum, component) => sum + powerWOf(component) * (component.qty || 1), 0);
}
