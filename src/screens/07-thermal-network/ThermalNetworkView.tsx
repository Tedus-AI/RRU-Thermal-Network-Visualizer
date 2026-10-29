/**
 * Screen 07 — 求解與結果 (Solve & Results).
 * Specification: 07_Thermal_Network.md (source of truth), §59 for the merge.
 *
 * What this screen does: takes the Screen 05 topology and the scenario
 * boundary set, solves [G][T] = [P], back-calculates every edge's Q and ΔT,
 * checks the energy balance, stores one solution per scenario — and shows what
 * the solve found: every component's temperature at its limit, the limit and
 * the margin, tightest first, beside the solved graph.
 *
 * It used to stop at the graph and leave the verdict to Screen 09, which read
 * the same solution into the same table behind a second button. 09 is part of
 * this screen now (07 §59): the bar on top carries the four numbers 09 led
 * with, the list on the left is the table both screens opened, and a row opens
 * Screen 08 on that part. Still no bottleneck chain, no sensitivity and no
 * summary prose — those stay on 08 and in the report.
 *
 * Two deliberate departures from the mockup, both required by 07 §57 ("anything
 * in the PNG that the MD does not define must not be built"):
 *
 *   1. The mockup's Solver Settings panel and status card describe an ITERATIVE
 *      solver — convergence tolerance, max iterations, under-relaxation,
 *      "converged in 27 iterations". This engine solves the matrix directly, so
 *      those numbers do not exist and are not fabricated. See SolveBar.
 *   2. The mockup's "Key Results" card (Tj Max across all sources, Tcase Max,
 *      Bottom Case Max) is not defined anywhere in the MD. Per-component
 *      temperature, limit and margin are shown instead, in the component list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ComponentVisibilityPanel } from '@/ui/ComponentVisibilityPanel';
import { useRememberedFlag, useRememberedValue } from '@/ui/rememberedFlag';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Crosshair, Network, Save, TriangleAlert, XCircle } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath, screenByCode } from '@/app/navigation';
import { useShellActions } from '@/app/shellActions';
import { Badge, Button, Modal, Skeleton } from '@/ui/primitives';
import { ResizableSidebar } from '@/ui/ResizableSidebar';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';

import { projectComponentLimits } from '@/thermal/graph/componentProjection';
import { POWER_BASIS_LABEL, powerBasisOf } from '@/domain/powerBasis';
import { windRecordedOnly } from '@/thermal/boundary/wind';
import { powerByCategory } from '@/thermal/overview/powerByCategory';
import type { Scenario } from '@/domain/project';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import { triggerDownload } from '@/export/download';
import { exportFilename } from '@/export/exportNetworkGraph';
import { DEFAULT_SOLVER_SETTINGS, type SolverSettings } from '@/thermal/types';
import type { SolverIssue } from '@/thermal/solver/solverTypes';

import { SolveBar } from './SolveBar';
import { ComponentResultsPanel } from './ComponentResultsPanel';
import { ResultModeToolbar } from './ResultModeToolbar';
import { GraphExplorerControls, GraphGroupOverview, GraphToolbarBridge, useGraphExplorer } from '@/ui/GraphExplorer';
import {
  SolvedGraphCanvas,
  isDisplayOptions,
  legendFor,
  type GraphDisplayOptions,
  type SolvedCanvasTool,
  type SolvedGraphHandle,
} from './SolvedGraphCanvas';
import { isLayoutMode } from '@/screens/05-thermal-path-builder/GraphToolbar';
import { GraphLegend } from './GraphLegend';
import { useGraphExports } from './useGraphExports';
import { ResultInspectorWindow } from './ResultInspectorWindow';
import { SolverStatusOverlay } from './SolverStatusOverlay';
import { ResultsOverlay } from './ResultsOverlay';
import { ResultTree } from './ResultTree';
import {
  allowedModes,
  COMBINED_MODE,
  componentResultOrder,
  isResultMode,
  migrateResultMode,
  edgeRows,
  nodeRows,
  num,
  resultTree,
  type ResultMode,
  type ResultTreeGroupRow,
} from './resultViewModel';
import { ambientHeadroom } from '@/thermal/analysis/ambientHeadroom';
import { T07 } from './tooltips';

// --- building blocks --------------------------------------------------------

/**
 * The scenario in one line — 07 §10 — where a card of seven rows used to be.
 *
 * Every value here is set in 01 (the scenario table) or 05 (the surfaces), and
 * this screen changes none of them, so the line links to where they are set.
 */
export function scenarioLine(
  scenario: Scenario | null,
  set: ScenarioBoundaryConditionSet | null,
): string {
  if (!scenario) return '尚未選擇情境';
  const ambient = set?.ambient.external_ambient_C ?? scenario.ambient_C;
  const wind = set?.site.wind_speed_m_s ?? scenario.wind_mps;
  const solar = set?.site.solar_irradiance_W_m2 ?? scenario.solar_W_m2;
  const solarOn = set?.site.solar_enabled !== false && typeof solar === 'number' && solar > 0;
  return [
    `環溫 ${num(ambient, 1)} °C`,
    windRecordedOnly(wind) ? `風速 ${(wind as number).toFixed(1)} m/s（未套用）` : '無風',
    solarOn ? `日照 ${(solar as number).toFixed(0)} W/m²` : '無日照',
    `${POWER_BASIS_LABEL[powerBasisOf(scenario)]} × ${(scenario.power_scale ?? 1).toFixed(2)}`,
  ].join('・');
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

// --- screen -----------------------------------------------------------------

export function ThermalNetworkView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const network = useNetworkStore((s) => s.network);
  const components = useComponentStore((s) => s.components);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const solverState = useSolverStore((s) => s.state);

  // Subscribed so the screen re-renders when Screen 06's derived ports change.
  const boundaryPortCount = useBoundaryStore((s) => s.ports.length);
  const boundarySets = useBoundaryStore((s) => s.sets);
  const boundaryKey = useBoundaryStore((s) => s.activeKey);

  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const checks = useSolutionStore((s) => s.checks);
  const signature = useSolutionStore((s) => s.signature);
  const solving = useSolutionStore((s) => s.solving);
  const solveInput = useSolutionStore((s) => s.input);

  /*
     The toolbar's choices are REMEMBERED, not reset on every mount.

     Which result to colour the graph by, which labels to show and how to lay
     it out are how the engineer has decided to read this graph — and they all
     snapped back to their defaults the moment they stepped to Screen 08 to
     check something and came back. Checking one number against another screen
     meant re-choosing ΔT, re-ticking Limits and re-picking the layout, every
     single time.

     Under `tnvui.`, like the legend and the panel sizes: `syncBuildStamp`
     clears the `tnv.` namespace on a build change because project data written
     against an older schema cannot be trusted, and none of this is project
     data. Each one validates what comes back, so a mode written by an older
     build cannot drive the screen into a state it can no longer render.
  */
  const [mode, setMode] = useRememberedValue<ResultMode>(
    '07.mode',
    'node_type',
    isResultMode,
    // A reader who left this screen on Temperature or on ΔT comes back to the
    // view those two became, rather than being reset to the default.
    migrateResultMode,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tool, setTool] = useState<SolvedCanvasTool>('select');
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [layoutMode, setLayoutMode] = useRememberedValue('07.layout', 'Auto', isLayoutMode);
  // Collapsed until the reader says otherwise, and then remembered: it is an
  // overlay in the corner the graph starts in, so left open it sits on the
  // first two nodes — but re-collapsing it on every visit is its own annoyance.
  const [legendOpen, setLegendOpen] = useRememberedFlag('07.legend', false);
  const [componentVisibilityOpen, setComponentVisibilityOpen] = useState(false);
  // Not remembered, unlike the toolbar's reading choices: it covers the graph,
  // and a panel that reopened itself on every visit would hide the thing the
  // screen is for before the reader had asked for it.
  const [resultsOpen, setResultsOpen] = useState(false);
  /**
   * Components switched off in the visibility panel. Deliberately component
   * state and not persisted, as on Screen 05: it is a way of reading a crowded
   * graph, not a property of the project, and a filter that survived a reload
   * would eventually be mistaken for a missing component. Nothing here reaches
   * the solver, the KPIs or the result tree — the solution stays whole.
   */
  const [hiddenComponentIds, setHiddenComponentIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // Read here rather than below the explorer, which needs it: a focus follows
  // the solved heat directions, so it stops at the node feeding the part
  // instead of running on through the heatsink it never uses.
  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  // The group overview first (07 §59): one card a component reads at any
  // width, where 85 nodes at 17 % zoom read as nothing until zoomed.
  const explorer = useGraphExplorer(network, components, hiddenComponentIds, solution, 'groups');
  /** Where the graph was before a row focused it, so a second click goes back. */
  const viewBeforeFocus = useRef<'full' | 'groups'>('groups');
  const toggleComponentVisible = useCallback((componentId: string) => {
    setHiddenComponentIds((current) => {
      const next = new Set(current);
      if (!next.delete(componentId)) next.add(componentId);
      return next;
    });
  }, []);
  const [display, setDisplay] = useRememberedValue<GraphDisplayOptions>(
    '07.display',
    { showLabels: true, showPower: true, showLimits: false, showBoundary: true },
    isDisplayOptions,
  );
  const canvasRef = useRef<SolvedGraphHandle | null>(null);

  const boundarySet = boundaryKey ? (boundarySets[boundaryKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;

  // --- load ---------------------------------------------------------------
  useEffect(() => {
    if (!projectId) return;
    const projectStore = useProjectStore.getState();
    projectStore.refreshProjects();
    if (projectStore.draft?.project_id !== projectId) {
      projectStore.openProject(projectId);
      useSolverStore.getState().reset();
    }
    useScenarioStore.getState().loadFor(projectId);
    useComponentStore.getState().loadFor(projectId);
    useNetworkStore.getState().loadFor(projectId);
    const scenarioId = useScenarioStore.getState().activeScenarioId;
    useBoundaryStore.getState().loadFor(projectId, scenarioId);
    useSolutionStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  // Switching scenario loads that scenario's boundary set AND its own solution
  // (07 §41). Nothing from the previous scenario is left on screen (07 §50).
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [projectId, activeScenarioId]);

  const stale = useMemo(() => {
    if (!solution || !signature) return false;
    return solution.metadata.input_signature !== signature;
  }, [solution, signature]);

  const hasResult = Boolean(solution) && !stale && solution?.status !== 'FAILED';

  // The result modes need a solution; falling back keeps the canvas honest
  // rather than showing an all-grey result picture (07 §20).
  useEffect(() => {
    if (!allowedModes(hasResult).includes(mode)) setMode('node_type');
    else if (hasResult && mode === 'node_type' && solution) setMode(COMBINED_MODE.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResult]);

  // Only components this network actually models can be filtered — the panel
  // must not offer to hide something that was never drawn.
  const modeledIds = useMemo(
    () => new Set(Object.keys(network?.templates ?? {})),
    [network?.templates],
  );
  const modeledComponents = useMemo(
    () => components.filter((component) => modeledIds.has(component.id)),
    [components, modeledIds],
  );
  const hiddenModeledComponentIds = useMemo(
    () => new Set([...hiddenComponentIds].filter((id) => modeledIds.has(id))),
    [hiddenComponentIds, modeledIds],
  );

  const settings: SolverSettings = network?.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const powerScale = scenario?.power_scale ?? 1;
  const ambient = boundarySet?.ambient.external_ambient_C ?? scenario?.ambient_C ?? null;

  // Limits are read through the same projection Screens 08+ use, not off the
  // stored graph. Screen 04 owns the limit and its TYPE, and the type decides
  // WHICH node holds it — so a part re-typed from Tj to Tc has to have its
  // limit moved onto the case before any margin is computed from it. Reading
  // the stored graph judged it wherever Screen 05 last wrote it.
  const powerBasis = powerBasisOf(scenario);
  const limited = useMemo(
    () => (network ? projectComponentLimits(network, components, powerBasis) : null),
    [network, components, powerBasis],
  );

  const rows = useMemo(
    () =>
      limited
        ? nodeRows(limited, stale ? null : solution, { ambient_C: ambient, powerScale })
        : [],
    [limited, solution, stale, ambient, powerScale],
  );
  /*
     How much hotter the air can get before the worst part reaches its limit.

     Read off the SAME projected limits the table and the graph are judged by,
     so the card cannot name a part the rows disagree about; and off the stale
     guard, so it goes to N/A with everything else rather than reporting a
     headroom the current inputs no longer support.
  */
  const headroom = useMemo(
    () =>
      limited
        ? ambientHeadroom(limited, stale ? null : solution, ambient, {
            pinnedNodeIds: solveInput?.pinned_node_ids,
          })
        : null,
    [limited, solution, stale, ambient, solveInput],
  );

  const flows = useMemo(
    () => (network ? edgeRows(network, stale ? null : solution) : []),
    [network, solution, stale],
  );
  const tree = useMemo(
    () => (limited ? resultTree(limited, stale ? null : solution, rows, components) : []),
    [limited, solution, stale, rows, components],
  );

  /** The component list: tightest margin first (07 §59). */
  const ordered = useMemo(() => componentResultOrder(tree), [tree]);
  const tightest = ordered.find((group) => group.margin_C != null) ?? null;

  /** The heat by category, for the total on the bar. */
  const powerSplit = useMemo(
    () =>
      limited && hasResult
        ? powerByCategory({
            network: limited,
            components,
            powerScale,
            solar_W: solution?.energy_balance.solar_W ?? 0,
          }).slices
        : [],
    [limited, hasResult, components, powerScale, solution],
  );

  const issues: SolverIssue[] = useMemo(() => {
    if (checks) return [...checks.errors, ...checks.warnings, ...checks.infos];
    return solution?.warnings ?? [];
  }, [checks, solution]);

  const blocking = checks ? checks.errors.length : 0;
  const canSolve = checks ? checks.can_solve : true;

  // --- actions -------------------------------------------------------------

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  // The canvas measures itself off its container, which just changed size.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => canvasRef.current?.fit());
    return () => window.cancelAnimationFrame(frame);
  }, [fullscreen]);

  const handleSave = () => {
    if (!projectId || readOnly) return;
    const store = useSolutionStore.getState();
    if (!store.current()) {
      toast.warning('還沒有結果可以儲存，請先求解');
      return;
    }
    store.save(projectId);
    toast.success('求解結果已儲存');
  };

  const setSaveHandler = useShellActions((s) => s.setSaveHandler);
  useEffect(() => {
    setSaveHandler(handleSave);
    return () => setSaveHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, readOnly, solutionKey]);

  const runPreSolveCheck = () => {
    const report = useSolutionStore.getState().runPreSolveCheck();
    if (!report) {
      toast.warning('請先選擇情境');
      return;
    }
    if (report.errors.length > 0) {
      toast.error(`求解前檢查：有 ${report.errors.length} 項錯誤，要先修正`);
    } else if (report.warnings.length > 0) {
      toast.warning(`可以求解，有 ${report.warnings.length} 項警告`);
    } else {
      toast.success('求解前檢查通過');
    }
  };

  const runSolve = () => {
    if (readOnly) return;
    const result = useSolutionStore.getState().solve();
    if (!result) {
      toast.warning('請先選擇情境');
      return;
    }
    if (result.status === 'FAILED') {
      toast.error('求解失敗，原因在熱網路左下角的求解訊息');
      return;
    }
    if (result.status === 'WARNING') {
      toast.warning('求解完成，但有警告');
    } else {
      toast.success(`求解完成（${result.metadata.solve_time_ms.toFixed(1)} ms）`);
    }
    if (projectId) useSolutionStore.getState().save(projectId);
  };

  /**
   * A row of the component list: show that part's path on the graph — the
   * instance holding the tightest limit — or, clicked again, go back.
   */
  const focusedComponentId = explorer.view === 'focus' ? (explorer.focused?.componentId ?? null) : null;
  const selectComponent = (group: ResultTreeGroupRow) => {
    if (focusedComponentId === group.id) {
      explorer.setView(viewBeforeFocus.current);
      return;
    }
    const path =
      explorer.paths.find(
        (entry) => group.judged_node_id != null && entry.nodeIds.includes(group.judged_node_id),
      ) ?? explorer.paths.find((entry) => entry.componentId === group.id);
    if (!path) return;
    if (explorer.view !== 'focus') viewBeforeFocus.current = explorer.view;
    explorer.focus(path.key);
  };

  const openBottleneck = (nodeId: string | null) => {
    if (!projectId) return;
    const base = projectPath(projectId, 'bottleneck');
    navigate(nodeId ? `${base}?part=${encodeURIComponent(nodeId)}` : base);
  };

  const focusIssue = (issue: SolverIssue) => {
    if (issue.node_id) {
      setSelectedNodeId(issue.node_id);
      setSelectedEdgeId(null);
      canvasRef.current?.center(issue.node_id);
    } else if (issue.edge_id) {
      setSelectedEdgeId(issue.edge_id);
      setSelectedNodeId(null);
      canvasRef.current?.center(issue.edge_id);
    }
  };

  // --- exports -------------------------------------------------------------
  //
  // Above the guards below, not after them. These are hooks, and the guards
  // return early while the project is still loading — so on a direct load of
  // this screen React saw one hook count on the loading render and a longer
  // one when the project arrived, and threw. Reaching Screen 07 through the
  // nav hid it, because by then the project was already in the stores.

  const [exportingTable, setExportingTable] = useState(false);

  /**
   * The table as a PDF, fully expanded — see `exportResultTablePdf`. It mounts
   * the same `ResultTree` a second time rather than a print-only copy, so the
   * document and the panel can never disagree.
   */
  const handleExportTablePdf = useCallback(async () => {
    setExportingTable(true);
    try {
      const { exportResultTablePdf } = await import('@/export/exportResultTable');
      const blob = await exportResultTablePdf({
        table: (
          <ResultTree
            groups={tree}
            hasSolution={hasResult && !stale}
            selectedNodeId={null}
            selectedEdgeId={null}
            onSelectNode={() => {}}
            onSelectEdge={() => {}}
            forceExpanded
          />
        ),
        title: `${draft?.project_name || '熱網路'} — 求解結果`,
        subtitle: `${rows.length} 個節點・${flows.length} 條連線・${scenario?.name ?? ''}`,
      });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, exportFilename(draft?.project_name ?? '', 'pdf', { subject: 'results' }));
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success('已輸出求解結果 PDF');
    } catch (error) {
      toast.error(`輸出失敗：${error instanceof Error ? error.message : '未知的錯誤'}`);
    } finally {
      setExportingTable(false);
    }
  }, [draft?.project_name, flows.length, hasResult, rows.length, scenario?.name, stale, tree]);

  // --- graph export --------------------------------------------------------

  const graphNetwork = limited ?? network;
  const projectName = draft?.project_name ?? '';

  const { exporting, exportJpg, exportPdf } = useGraphExports({
    canvasRef,
    graphNetwork,
    components,
    solution,
    stale,
    mode,
    display,
    layoutMode,
    scenarioId: activeScenarioId ?? '',
    scenarioName: scenario?.name ?? '',
    projectName,
    nodeCount: rows.length,
    edgeCount: flows.length,
  });

  // --- guards --------------------------------------------------------------

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">無法載入熱網路</h1>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
            回到專案列表
          </Button>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft) return <LoadingState />;

  const hasTopology = Boolean(network && Object.keys(network.nodes).length > 0);

  // 07 §49 — no network at all.
  if (!hasTopology || !network) {
    return (
      <ScreenWorkspace title="Solve & Results" titleZh="求解與結果">
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <Network size={24} className="mx-auto mb-3 text-ink-400" />
            <p className="text-[14px] font-semibold text-ink-700">還沒有熱網路</p>
            <p className="mt-1 text-[12px] text-ink-400">到 04 依 03 的散熱路徑產生熱網路，再回來求解。</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => navigate(projectPath(projectId, 'thermal-path'))}
            >
              前往 04 熱網路與邊界
            </Button>
          </div>
        </div>
      </ScreenWorkspace>
    );
  }

  const boundaryIncomplete =
    !boundarySet || boundarySet.validation.errors.length > 0 || ambient == null;

  const continueBlocked =
    !solution ||
    stale ||
    solution.status === 'FAILED' ||
    solution.energy_balance.error_pct > settings.energy_error_pct;
  const continueWhy = !solution
    ? '先求解'
    : stale
      ? '結果已失效，請重新求解'
      : solution.status === 'FAILED'
        ? '求解失敗'
        : solution.energy_balance.error_pct > settings.energy_error_pct
          ? `能量平衡誤差 ${solution.energy_balance.error_pct.toFixed(2)} % 超過 ${settings.energy_error_pct} %`
          : '';

  const legend = legendFor(mode, stale ? null : solution);
  const report = screenByCode('10');

  // How many parts the verdict is about, for the chip beside the title.
  const over = hasResult ? ordered.filter((group) => group.status === 'over').length : 0;
  const near = hasResult ? ordered.filter((group) => group.status === 'warn').length : 0;
  const judged = hasResult ? ordered.filter((group) => group.status !== 'na').length : 0;

  const statusBadge = !solution
    ? { tone: 'neutral' as const, text: '尚未求解' }
    : stale
      ? { tone: 'warn' as const, text: '結果已失效' }
      : solution.status === 'FAILED'
        ? { tone: 'danger' as const, text: '求解失敗' }
        : solution.status === 'WARNING'
          ? { tone: 'warn' as const, text: '已求解・有警告' }
          : { tone: 'ok' as const, text: '已求解' };

  return (
    <ScreenWorkspace
      title="Solve & Results"
      titleZh="求解與結果"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">唯讀</Badge>}
          <span title={T07.kpi.solverStatus}>
            <Badge tone={statusBadge.tone}>{statusBadge.text}</Badge>
          </span>
          {over > 0 ? (
            <Badge tone="danger">{over} 種超限</Badge>
          ) : near > 0 ? (
            <Badge tone="warn">{near} 種餘裕 ≤ 5 °C</Badge>
          ) : judged > 0 ? (
            <Badge tone="ok">全部通過</Badge>
          ) : null}
          <span
            className="text-[12px] text-ink-500"
            title={`散熱表面條件 ${boundarySet?.assignments.filter((entry) => entry.enabled).length ?? 0} / ${boundaryPortCount}${
              boundarySet?.external_loads.length ? `・日照負載 ${boundarySet.external_loads.length} 個` : ''
            }`}
          >
            {scenarioLine(scenario, boundarySet)}
          </span>
          <button
            type="button"
            className="text-[12px] font-semibold text-accent-700 hover:underline"
            onClick={() => navigate(`${projectPath(projectId, 'info')}#scenario-settings`)}
            title="環溫、風速、日照、功耗與倍率在 01 的情境表設定"
          >
            到 01 修改
          </button>
        </div>
      }
      metrics={
        <SolveBar
          solution={solution}
          stale={stale}
          tightest={hasResult ? tightest : null}
          headroom={headroom}
          power={powerSplit}
          settings={settings}
          powerScale={powerScale}
          readOnly={readOnly}
          canSolve={canSolve}
          blocking={blocking}
          solving={solving}
          onSolve={runSolve}
          onPreSolveCheck={runPreSolveCheck}
          onReset={() => setConfirmReset(true)}
          onSettings={(patch) => {
            useNetworkStore.getState().updateSolverSettings(patch);
            useSolutionStore.getState().refresh();
          }}
        />
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            title={T07.action.backTo06}
            onClick={() => navigate(projectPath(projectId, 'thermal-path'))}
          >
            返回 04
          </Button>

          {blocking > 0 && (
            <span className="text-[12px] font-medium text-danger-600">
              求解前檢查有 {blocking} 項錯誤，修正後才能求解
            </span>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              icon={<Save size={15} />}
              disabled={readOnly || !solution}
              title={T07.action.saveSolution}
              onClick={handleSave}
            >
              儲存結果
            </Button>
            <Button
              icon={<Crosshair size={15} />}
              disabled={continueBlocked}
              title={
                continueBlocked
                  ? continueWhy
                  : tightest
                    ? `到 06 看最緊的元件 ${tightest.name} 的熱阻鏈`
                    : '到 06 瓶頸分析'
              }
              onClick={() => openBottleneck(tightest?.judged_node_id ?? null)}
            >
              瓶頸分析
            </Button>
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              disabled={continueBlocked}
              title={continueBlocked ? continueWhy : T07.action.continue}
              onClick={() => navigate(projectPath(projectId, report?.path ?? 'report'))}
            >
              前往 07 {report?.label ?? '報告'}
            </Button>
          </div>
        </div>
      }
    >
      {/* 07 §38 — a stale result is never presented as the current answer. */}
      {stale && (
        <div className="flex items-start gap-2 rounded-lg border border-warn-500/40 bg-warn-100 px-3.5 py-2.5">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn-600" />
          <p className="text-[12px] leading-relaxed font-semibold text-warn-600">
            結果已失效：熱網路或情境在上次求解後改過，請重新求解。
            <span className="block font-normal text-ink-500">{T07.field.staleResults}</span>
          </p>
        </div>
      )}

      {/* 07 §49 — boundary conditions incomplete. */}
      {boundaryIncomplete && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-500/40 bg-danger-100 px-3.5 py-2.5">
          <XCircle size={16} className="mt-0.5 shrink-0 text-danger-600" />
          <p className="text-[12px] leading-relaxed font-semibold text-danger-600">
            散熱表面條件還沒完成，請先到 04 完成。
          </p>
          <Button
            className="ml-auto h-7 shrink-0 !text-[12px]"
            onClick={() => navigate(projectPath(projectId, 'thermal-path'))}
          >
            前往 04
          </Button>
        </div>
      )}

      {/* The component list on the left, the solved graph on the right. */}
      <div
        className={`flex h-[calc(100vh-20rem)] min-h-[30rem] flex-col gap-3 lg:flex-row ${
          fullscreen ? 'fixed inset-0 z-30 h-auto min-h-0 bg-canvas p-3' : ''
        }`}
      >
        {!fullscreen && (
          <ResizableSidebar
            id="07.results"
            defaultWidth={460}
            labelEn="component results"
            labelZh="元件結果"
            shortEn="Parts"
            shortZh="元件"
          >
            <ComponentResultsPanel
              groups={ordered}
              hasSolution={hasResult}
              stale={stale}
              failed={solution?.status === 'FAILED'}
              selectedId={focusedComponentId}
              onSelect={selectComponent}
              onOpenBottleneck={(group) => openBottleneck(group.judged_node_id)}
              canOpenBottleneck={!continueBlocked}
              onOpenFullTable={() => setResultsOpen(true)}
            />
          </ResizableSidebar>
        )}

        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-line bg-surface ${
            fullscreen ? 'rounded-none' : 'rounded-lg'
          }`}
        >
          <header className="shrink-0 border-b border-line px-3.5 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[13px] font-bold text-ink-900">熱網路</h2>
              <span
                className="text-[11px] text-ink-400"
                title="熱網路與邊界條件都來自 04，這一頁不修改任何一項。"
              >
                來自 04・唯讀
              </span>
              {stale && <Badge tone="warn">已失效</Badge>}
            </div>
            <GraphToolbarBridge explorer={explorer}>
            <ResultModeToolbar
              mode={mode}
              hasResult={hasResult}
              display={display}
              tool={tool}
              zoom={zoom}
              layoutMode={layoutMode}
              fullscreen={fullscreen}
              componentVisibilityOpen={componentVisibilityOpen}
              hiddenComponentCount={hiddenModeledComponentIds.size}
              // The list is beside the graph; only fullscreen hides it, so only
              // fullscreen needs a way to the full table from here.
              showResultsButton={fullscreen}
              resultsSummary={`${rows.length} · ${flows.length}`}
              exporting={exporting}
              onOpenResults={() => setResultsOpen(true)}
              onExportJpg={exportJpg}
              onExportPdf={exportPdf}
              onToggleComponentVisibility={() => setComponentVisibilityOpen((value) => !value)}
              onMode={setMode}
              onDisplay={(patch) => setDisplay((current) => ({ ...current, ...patch }))}
              onTool={setTool}
              onZoom={(delta) => canvasRef.current?.zoomBy(delta)}
              onLayoutMode={(next) => {
                setLayoutMode(next);
                canvasRef.current?.relayout(next);
              }}
              onRelayout={() => canvasRef.current?.relayout(layoutMode)}
              onToggleFullscreen={() => setFullscreen((value) => !value)}
            />
            </GraphToolbarBridge>
          </header>
          <GraphExplorerControls explorer={explorer} components={components} hiddenIds={hiddenComponentIds} />
          <div className={`relative min-h-0 flex-1 ${stale ? 'opacity-50' : ''}`}>
            <GraphGroupOverview explorer={{ ...explorer, network: limited ?? network }} components={components} hiddenIds={hiddenComponentIds} solved={{ solution: stale ? null : solution, mode, display, scenarioId: activeScenarioId ?? '' }} />
            <SolvedGraphCanvas
              ref={canvasRef}
              focusKey={explorer.focused?.key}
              extraHiddenNodeIds={explorer.hiddenNodes}
              nodeLabelOverrides={explorer.labels}
              // The graph badges and colours by limit, so it reads the same
              // projected limits the table does — otherwise it would paint a
              // junction over-limit that the table reports as passing.
              network={limited ?? network}
              solution={stale ? null : solution}
              // A red border on a box among a hundred boxes is easy to miss.
              // The dot pulses, so an over-temperature part is visible without
              // being looked for.
              alertOverLimit

              mode={mode}
              display={display}
              scenarioId={activeScenarioId ?? ''}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              tool={tool}
              layoutMode={layoutMode}
              hiddenComponentIds={hiddenComponentIds}
              onSelectNode={setSelectedNodeId}
              onSelectEdge={setSelectedEdgeId}
              onZoomChange={setZoom}
            />

            {/* Bottom-left, because the legend already holds the top-left
                corner and the two must never stack on one another. */}
            {componentVisibilityOpen && (
              <ComponentVisibilityPanel
                components={modeledComponents}
                hiddenIds={hiddenModeledComponentIds}
                onToggleVisible={toggleComponentVisible}
                onShowAll={() => setHiddenComponentIds(new Set())}
                onHideAll={() => setHiddenComponentIds(new Set(modeledComponents.map((c) => c.id)))}
                onClose={() => setComponentVisibilityOpen(false)}
                placement="bottom-left"
              />
            )}

            <GraphLegend
              rows={legend}
              open={legendOpen}
              onToggle={() => setLegendOpen((value) => !value)}
              hidden={explorer.view === 'groups'}
            />

            <SolverStatusOverlay
              state={solverState}
              stale={stale}
              solution={solution}
              issues={issues}
              hasRun={Boolean(checks || solution)}
              onFocus={issue => explorer.showFull(() => focusIssue(issue))}
              onNavigate={() => navigate(projectPath(projectId, 'thermal-path'))}
            />

            {solving && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/70">
                <p className="text-[13px] font-semibold text-ink-700">求解中…</p>
              </div>
            )}
          </div>
        </section>

      </div>

      {resultsOpen && (
        <ResultsOverlay
          groups={tree}
          hasSolution={hasResult}
          nodeCount={rows.length}
          edgeCount={flows.length}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onSelectNode={(nodeId) => {
            setSelectedEdgeId(null);
            setSelectedNodeId(nodeId);
            // Centring happens behind the panel, so the node is already framed
            // when the reader closes it — which is what they opened the table
            // to find. On the whole graph, since a focus may have hidden it.
            explorer.showFull(() => canvasRef.current?.center(nodeId));
          }}
          onSelectEdge={(edgeId) => {
            setSelectedNodeId(null);
            setSelectedEdgeId(edgeId);
            explorer.showFull(() => canvasRef.current?.center(edgeId));
          }}
          onExportPdf={handleExportTablePdf}
          exporting={exportingTable}
          onClose={() => setResultsOpen(false)}
        />
      )}

      {/* A node or edge clicked on the graph — see `ResultInspectorWindow`. */}
      <ResultInspectorWindow
        storageKey="tnv.07.inspector"
        network={network}
        limitedNetwork={limited}
        solution={solution}
        stale={stale}
        scenarioId={activeScenarioId ?? ''}
        scenarioName={scenario?.name ?? ''}
        solverState={solverState}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onSelectNode={setSelectedNodeId}
        onSelectEdge={setSelectedEdgeId}
        onClose={() => {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }}
      />

      {confirmReset && (
        <Modal
          title="清除求解結果？"
          description="只會清除目前情境的求解結果，熱網路、邊界條件、熱阻定義與量測資料都會保留。"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmReset(false);
                  useSolutionStore.getState().resetResults(projectId);
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  setMode('node_type');
                  toast.success('已清除求解結果');
                }}
              >
                清除結果
              </Button>
            </>
          }
        />
      )}
    </ScreenWorkspace>
  );
}
