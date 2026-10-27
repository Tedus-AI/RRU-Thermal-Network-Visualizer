/**
 * Screen 05 — 熱網路與邊界 (Thermal Network & Boundary).
 * Specifications: 05_Thermal_Path_Builder.md, 06_Boundary_Conditions.md (§22:
 * the two pages became this one).
 *
 * From 04's thermal paths to a model 07 can solve, on one page:
 *   ① 熱網路   the network, generated from 04; hand tools under 「進階編修」
 *   ② 散熱表面 where the heat leaves: the heat sink's fins (shared by every
 *               scenario, linked to 5G-RRU) and any other surface's conditions
 *   ③ 環境     the scenarios as 01 states them, read-only
 *   ④ 檢查     one list for the network and the boundary
 * beside the graph. Nothing here solves, and no solved temperature or heat flow
 * is shown as an input (05 §22, 06 §3.3).
 *
 * The network half is `useThermalPathBuilder` (with its canvas, inspector and
 * dialogs), the boundary half `useBoundaryWorkspace`. Both run every hook
 * above the loading returns below.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleCheck, Save, XCircle } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { useShellActions } from '@/app/shellActions';
import { Badge, Button } from '@/ui/primitives';
import { ResizableSidebar } from '@/ui/ResizableSidebar';
import { toast } from '@/ui/toast';

import { useNetworkStore } from '@/data/networkStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useScenarioStore } from '@/data/scenarioStore';

import { powerWOf, type Component } from '@/domain/component';
import type { BoundaryPort } from '@/thermal/boundary/types';

import type { GraphSelection } from './ThermalGraphCanvas';
import { LoadingState } from './builderBlocks';
import { useThermalPathBuilder } from './useThermalPathBuilder';
import { useBoundaryWorkspace } from './useBoundaryWorkspace';
import { BuilderCanvasArea } from './BuilderCanvasArea';
import { BuilderInspectorPanel } from './BuilderInspectorPanel';
import { BuilderModals } from './BuilderModals';
import { NetworkCard } from './NetworkCard';
import { SurfaceCard } from './SurfaceCard';
import { EnvironmentCard } from './EnvironmentCard';
import { ChecksCard } from './ChecksCard';
import { buildChecks, type CheckIssue } from './checksModel';

type CardId = 'network' | 'surface' | 'environment' | 'checks';

const CARD_DOM_ID: Record<CardId, string> = {
  network: 'card-network',
  surface: 'card-surface',
  environment: 'card-environment',
  checks: 'card-checks',
};

export function ThermalPathBuilderView() {
  const builder = useThermalPathBuilder();
  const boundary = useBoundaryWorkspace();
  const {
    canvasRef,
    displayValidation,
    draft,
    editing,
    fullscreen,
    navigate,
    network,
    projectId,
    projectStatus,
    readOnly,
    requiresReview,
    scenarioBoundaryEdges,
    selection,
    setSelection,
    setWarningConfirm,
  } = builder;

  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const networkDirty = useNetworkStore((s) => s.dirty);

  const [cards, setCards] = useState<Record<CardId, boolean>>({
    network: true,
    surface: true,
    environment: false,
    checks: true,
  });
  const toggleCard = (id: CardId) => setCards((current) => ({ ...current, [id]: !current[id] }));
  /** Opens a card and brings it into view (after it renders). */
  const revealCard = (id: CardId) => {
    setCards((current) => (current[id] ? current : { ...current, [id]: true }));
    requestAnimationFrame(() =>
      document.getElementById(CARD_DOM_ID[id])?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const nodeCount = network ? Object.keys(network.nodes).length : 0;
  const checks = useMemo(
    () =>
      buildChecks({
        network: displayValidation,
        nodeCount,
        boundary: boundary.validation,
        summary: boundary.summary,
        ambient_C: boundary.set?.ambient.external_ambient_C,
      }),
    [displayValidation, nodeCount, boundary.validation, boundary.summary, boundary.set],
  );

  const surfaceByNode = useMemo(
    () => new Map(boundary.surfaces.map((port) => [port.connected_node_id, port])),
    [boundary.surfaces],
  );
  const ambientNodeIds = useMemo(
    () => new Set(boundary.ports.filter((port) => !port.dissipating).map((port) => port.connected_node_id)),
    [boundary.ports],
  );

  /** Saves the network and the open scenario's boundary set — one button for the page. */
  const saveAll = (quiet = false) => {
    if (!projectId || readOnly) return;
    builder.handleSave(true);
    boundary.save();
    if (!quiet) toast.success('熱網路與邊界已儲存');
  };
  const saveRef = useRef(saveAll);
  saveRef.current = saveAll;
  const setSaveHandler = useShellActions((s) => s.setSaveHandler);
  useEffect(() => {
    setSaveHandler(() => saveRef.current());
    return () => setSaveHandler(null);
  }, [setSaveHandler]);

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">無法載入熱網路。</h1>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => projectId && useNetworkStore.getState().loadFor(projectId)}
            >
              重試
            </Button>
            <Button onClick={() => navigate('/')}>回到首頁</Button>
          </div>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft || !network) return <LoadingState />;

  const isEmpty = nodeCount === 0;
  const blocking = isEmpty || checks.errors > 0;

  const showPort = (port: BoundaryPort) => {
    setSelection({ kind: 'node', id: port.connected_node_id });
    builder.explorer.showFull(() => canvasRef.current?.center(port.connected_node_id));
  };

  /** A boundary surface opens card ②, the ambient reference card ③; anything else the inspector. */
  const selectGraphObject = (next: GraphSelection) => {
    setSelection(next);
    if (next?.kind !== 'node') return;
    const port = surfaceByNode.get(next.id);
    if (port) {
      boundary.selectPort(port.id);
      revealCard('surface');
    } else if (ambientNodeIds.has(next.id)) {
      revealCard('environment');
    }
  };

  const focusIssue = (entry: CheckIssue) => {
    if (entry.source === 'network') {
      builder.explorer.showFull(() => builder.focusIssue(entry.issue));
      return;
    }
    const { boundary_port_id, profile_id } = entry.message;
    const portId =
      boundary_port_id ??
      boundary.set?.assignments.find((assignment) =>
        profile_id ? assignment.profile_ids.includes(profile_id) : false,
      )?.boundary_port_id;
    const port = boundary.ports.find((entry) => entry.id === portId);
    if (!port) return;
    if (!port.dissipating) {
      revealCard('environment');
      return;
    }
    boundary.selectPort(port.id, profile_id ?? null);
    revealCard('surface');
    showPort(port);
  };

  const selectScenario = (scenarioId: string) => {
    // The open scenario's edits go with it rather than being dropped on reload.
    if (useBoundaryStore.getState().dirty) boundary.save();
    useScenarioStore.getState().setActiveScenario(scenarioId, projectId);
  };

  const handleValidate = () => {
    useNetworkStore.getState().revalidate();
    useBoundaryStore.getState().revalidate();
    revealCard('checks');
  };

  const handleContinue = () => {
    if (blocking) return;
    saveAll(true);
    if (checks.warnings > 0) {
      setWarningConfirm(checks.warnings);
      return;
    }
    navigate(projectPath(projectId, 'network'));
  };

  const selectedNode = selection?.kind === 'node' ? (network.nodes[selection.id] ?? null) : null;
  const selectedEdge = selection?.kind === 'edge' ? (network.edges[selection.id] ?? null) : null;
  // A surface opens in card ②; its node's own inspector is a topology tool.
  const nodeIsBoundary =
    selectedNode != null && (surfaceByNode.has(selectedNode.id) || ambientNodeIds.has(selectedNode.id));
  const showInspector = selectedEdge != null || (selectedNode != null && (!nodeIsBoundary || editing));
  const canSave = !readOnly && (networkDirty || boundary.dirty || boundary.topologyStale);

  return (
    <ScreenWorkspace
      title="Thermal Network & Boundary"
      titleZh="熱網路與邊界"
      descriptionZh="依 04 的散熱路徑產生熱網路，設定散熱表面；環境跟著 01 的情境。完成後到 07 求解。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">唯讀</Badge>}
          {requiresReview && !isEmpty && (
            <span title="04 改了會影響熱網路的欄位。到 ① 按「依 04 重新產生」，或檢查後儲存，這個提醒就會消失。">
              <Badge tone="warn">04 有改過</Badge>
            </span>
          )}
          <Badge tone={blocking ? 'warn' : checks.warnings > 0 ? 'warn' : 'ok'}>
            {isEmpty
              ? '還沒有熱網路'
              : checks.errors > 0
                ? `${checks.errors} 個錯誤`
                : checks.warnings > 0
                  ? `可求解・${checks.warnings} 個警告`
                  : '可求解'}
          </Badge>
        </div>
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button icon={<ArrowLeft size={15} />} onClick={() => navigate(projectPath(projectId, 'components'))}>
            返回 04
          </Button>
          <Button icon={<CircleCheck size={15} />} onClick={handleValidate} title="重新檢查熱網路與邊界">
            重新檢查
          </Button>
          {checks.errors > 0 && (
            <button
              type="button"
              className="text-[12px] font-medium text-danger-600 hover:underline"
              onClick={() => revealCard('checks')}
            >
              {checks.errors} 個錯誤要先修正，才能求解
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              icon={<Save size={15} />}
              disabled={!canSave}
              title={
                boundary.topologyStale && !networkDirty && !boundary.dirty
                  ? '儲存 — 記錄目前的熱網路已經檢查過邊界'
                  : '儲存熱網路與邊界'
              }
              onClick={() => saveAll()}
            >
              儲存
            </Button>
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              disabled={blocking}
              onClick={handleContinue}
            >
              前往 07 求解
            </Button>
          </div>
        </div>
      }
    >
      <div
        className={`flex min-h-[30rem] flex-1 flex-col gap-3 lg:flex-row ${fullscreen ? 'fixed inset-0 z-30 min-h-0 bg-canvas p-3' : ''}`}
        data-testid="thermal-path-workspace"
      >
        {!fullscreen && (
          <ResizableSidebar
            id="05-network-boundary"
            defaultWidth={420}
            labelEn="network and boundary"
            labelZh="熱網路與邊界"
            shortEn="Setup"
            shortZh="設定"
          >
            <NetworkCard
              builder={builder}
              network={network}
              open={cards.network}
              onToggle={() => toggleCard('network')}
            />
            <SurfaceCard
              boundary={boundary}
              draft={draft}
              readOnly={readOnly}
              open={cards.surface}
              onToggle={() => toggleCard('surface')}
              onShowPort={showPort}
              onEditAmbient={boundary.editScenarios}
            />
            <EnvironmentCard
              scenarios={scenarios}
              activeScenarioId={activeScenarioId}
              open={cards.environment}
              onToggle={() => toggleCard('environment')}
              onSelectScenario={selectScenario}
              onEditScenarios={boundary.editScenarios}
            />
            <ChecksCard
              model={checks}
              boundary={boundary}
              readOnly={readOnly}
              open={cards.checks}
              onToggle={() => toggleCard('checks')}
              onFocusIssue={focusIssue}
            />
          </ResizableSidebar>
        )}

        <BuilderCanvasArea
          builder={builder}
          network={network}
          projectId={projectId}
          isEmpty={isEmpty}
          onValidate={handleValidate}
          onSelectObject={selectGraphObject}
        />
      </div>

      {/* Non-modal, like 04: the graph stays clickable behind it. */}
      {showInspector && (
        <BuilderInspectorPanel
          builder={builder}
          network={network}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          selectedScenarioBoundary={selectedEdge ? scenarioBoundaryEdges.get(selectedEdge.id) : undefined}
        />
      )}

      <BuilderModals builder={builder} network={network} projectId={projectId} />
    </ScreenWorkspace>
  );
}

/** Kept for the palette: total dissipation summary, never an edge heat flow. */
export function totalDissipation(components: Component[]): number {
  return components.reduce((sum, component) => sum + powerWOf(component) * (component.qty || 1), 0);
}
