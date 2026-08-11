/**
 * Screen 07 — Thermal Network (Solver).
 * Specification: 07_Thermal_Network.md (source of truth), laid out after 07.png.
 *
 * What this screen does: takes the Screen 05 topology and the Screen 06
 * scenario boundary set, solves [G][T] = [P], back-calculates every edge's Q and
 * ΔT, checks the energy balance, and stores one solution per scenario.
 *
 * What it never does (07 §44–§46): rank bottlenecks, score sensitivity, draw a
 * temperature distribution, or write an executive summary. Those belong to
 * Screens 08, 09 and 10.
 *
 * Two deliberate departures from the mockup, both required by 07 §57 ("anything
 * in the PNG that the MD does not define must not be built"):
 *
 *   1. The mockup's Solver Settings panel and status card describe an ITERATIVE
 *      solver — convergence tolerance, max iterations, under-relaxation,
 *      "converged in 27 iterations". This engine solves the matrix directly, so
 *      those numbers do not exist and are not fabricated. See SolveControlPanel.
 *   2. The mockup's "Key Results" card (Tj Max across all sources, Tcase Max,
 *      Bottom Case Max) is not defined anywhere in the MD, and a maximum across
 *      all heat sources is the first step of the worst-component ranking that
 *      §44 reserves for Screen 08. Per-node temperature, limit and margin are
 *      shown instead — in the results table and in the inspector, where §16 and
 *      §31 put them.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Network,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { useGuardedNavigate } from '@/app/useGuardedNavigate';
import { useShellActions } from '@/app/shellActions';
import { Badge, Button, Modal, Skeleton } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';

import { DEFAULT_SOLVER_SETTINGS, type SolverSettings } from '@/thermal/types';
import type { SolverIssue } from '@/thermal/solver/solverTypes';

import { SolverKpiBar } from './SolverKpiBar';
import { SolveControlPanel } from './SolveControlPanel';
import { ScenarioSummary } from './ScenarioSummary';
import { ResultModeToolbar } from './ResultModeToolbar';
import {
  SolvedGraphCanvas,
  legendFor,
  type GraphDisplayOptions,
  type SolvedGraphHandle,
} from './SolvedGraphCanvas';
import { EnergyBalancePanel } from './EnergyBalancePanel';
import { NodeResultInspector } from './NodeResultInspector';
import { EdgeResultInspector, InspectorEmpty } from './EdgeResultInspector';
import { SolverValidationPanel } from './SolverValidationPanel';
import { HeatFlowTable, NodeTemperatureTable } from './ResultTables';
import {
  STATUS_ZH,
  allowedModes,
  edgeRows,
  nodeRows,
  percent,
  timeOf,
  type ResultMode,
} from './resultViewModel';
import { T07 } from './tooltips';

// --- building blocks --------------------------------------------------------

function Section({
  index,
  title,
  zh,
  actions,
  className = '',
  bodyClassName = 'p-3',
  children,
}: {
  index: number;
  title: string;
  zh: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-lg border border-line bg-surface ${className}`}>
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white tabular">
          {index}
        </span>
        <h2 className="min-w-0 truncate text-[13px] font-bold text-ink-900">
          {title} <span className="font-semibold text-ink-400">/ {zh}</span>
        </h2>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function StatusRow({ label, zh, value, tone = '' }: { label: string; zh: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0">
      <span className="min-w-0 text-[11px] font-semibold text-ink-700">
        {label}
        <span className="ml-1 font-normal text-ink-400">/ {zh}</span>
      </span>
      <span className={`shrink-0 text-[12px] font-bold tabular ${tone || 'text-ink-900'}`}>{value}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-16" />
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
  const guardedNavigate = useGuardedNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const network = useNetworkStore((s) => s.network);
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
  const solutionDirty = useSolutionStore((s) => s.dirty);

  const [mode, setMode] = useState<ResultMode>('node_type');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [display, setDisplay] = useState<GraphDisplayOptions>({
    showLabels: true,
    showPower: true,
    showLimits: false,
    showBoundary: true,
    focusSelection: false,
  });
  const canvasRef = useRef<SolvedGraphHandle | null>(null);

  const boundarySet = boundaryKey ? (boundarySets[boundaryKey] ?? null) : null;
  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
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
  // rather than showing an all-grey "temperature" picture (07 §20).
  useEffect(() => {
    if (!allowedModes(hasResult).includes(mode)) setMode('node_type');
    else if (hasResult && mode === 'node_type' && solution) setMode('temperature');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResult]);

  const settings: SolverSettings = network?.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const powerScale = scenario?.power_scale ?? 1;
  const ambient = boundarySet?.ambient.external_ambient_C ?? scenario?.ambient_C ?? null;

  const rows = useMemo(
    () => (network ? nodeRows(network, stale ? null : solution, { ambient_C: ambient, powerScale }) : []),
    [network, solution, stale, ambient, powerScale],
  );
  const flows = useMemo(
    () => (network ? edgeRows(network, stale ? null : solution) : []),
    [network, solution, stale],
  );

  const issues: SolverIssue[] = useMemo(() => {
    if (checks) return [...checks.errors, ...checks.warnings, ...checks.infos];
    return solution?.warnings ?? [];
  }, [checks, solution]);

  const blocking = checks ? checks.errors.length : 0;
  const canSolve = checks ? checks.can_solve : true;

  // --- actions -------------------------------------------------------------

  const handleSave = () => {
    if (!projectId || readOnly) return;
    const store = useSolutionStore.getState();
    if (!store.current()) {
      toast.warning('Nothing to save — solve the network first / 尚無結果可儲存');
      return;
    }
    store.save(projectId);
    toast.success('Solution saved / 求解結果已儲存');
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
      toast.warning('Select a scenario first / 請先選擇情境');
      return;
    }
    if (report.errors.length > 0) {
      toast.error(`${report.errors.length} blocking issue(s) / 有 ${report.errors.length} 項阻擋問題`);
    } else if (report.warnings.length > 0) {
      toast.warning(`Ready with ${report.warnings.length} warning(s) / 可求解，有警告`);
    } else {
      toast.success('Pre-solve checks passed / 求解前檢查通過');
    }
  };

  const runSolve = () => {
    if (readOnly) return;
    const result = useSolutionStore.getState().solve();
    if (!result) {
      toast.warning('Select a scenario first / 請先選擇情境');
      return;
    }
    if (result.status === 'FAILED') {
      toast.error('Solve failed — see Solver Messages / 求解失敗，請見求解訊息');
      return;
    }
    if (result.status === 'WARNING') {
      toast.warning('Solved with warnings / 求解完成，但有警告');
    } else {
      toast.success(
        `Solved in ${result.metadata.solve_time_ms.toFixed(1)} ms / 求解完成`,
      );
    }
    if (projectId) useSolutionStore.getState().save(projectId);
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

  // --- guards --------------------------------------------------------------

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">Unable to load the thermal network.</h1>
          <p className="mt-1 text-[13px] text-ink-500">無法載入熱網路。</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
            Return to Project Info
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
      <ScreenWorkspace
        title="Thermal Network Solver"
        titleZh="熱網路求解"
        description="Solve the thermal network to obtain node temperatures, heat flows and energy balance."
        descriptionZh="執行熱網路求解，以取得節點溫度、熱流與能量平衡。"
      >
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <Network size={24} className="mx-auto mb-3 text-ink-400" />
            <p className="text-[14px] font-semibold text-ink-700">No thermal network found.</p>
            <p className="mt-1 text-[12px] text-ink-400">找不到熱網路，請先完成 05。</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => guardedNavigate(projectPath(projectId, 'thermal-path'))}
            >
              Open 05 Thermal Path Builder / 前往 05
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

  const legend = legendFor(mode, stale ? null : solution);
  const selectedNode = selectedNodeId ? (network.nodes[selectedNodeId] ?? null) : null;
  const selectedEdge = selectedEdgeId ? (network.edges[selectedEdgeId] ?? null) : null;

  return (
    <ScreenWorkspace
      title="Thermal Network Solver"
      titleZh="熱網路求解"
      description="Solve the thermal network to obtain node temperatures, heat flows and energy balance. Topology comes from Screen 05 and boundary conditions from Screen 06; both stay read-only here."
      descriptionZh="執行熱網路求解，以取得節點溫度、熱流與能量平衡。拓樸來自 05、邊界條件來自 06，在此皆為唯讀。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          {!readOnly && solutionDirty && <Badge tone="warn">● Unsaved / 未儲存</Badge>}
          <Badge
            tone={
              stale
                ? 'warn'
                : solverState === 'SOLVED'
                  ? 'ok'
                  : solverState === 'FAILED'
                    ? 'danger'
                    : 'neutral'
            }
          >
            Solver {stale ? 'DIRTY' : solverState}
          </Badge>
          {scenario && <Badge tone="neutral">{scenario.name}</Badge>}
        </div>
      }
      metrics={
        <SolverKpiBar
          state={solverState}
          solution={solution}
          stale={stale}
          scenarioName={scenario?.name ?? ''}
        />
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            title={biTitle('Back to 06 Boundary Conditions', T07.action.backTo06)}
            onClick={() => guardedNavigate(projectPath(projectId, 'boundary'))}
          >
            Back to 06
          </Button>
          <Button
            icon={<ShieldCheck size={15} />}
            title={biTitle('Pre-Solve Check', T07.action.preSolveCheck)}
            onClick={runPreSolveCheck}
          >
            Pre-Solve Check
          </Button>
          <Button
            variant="primary"
            icon={solution ? <RefreshCw size={15} /> : <Play size={15} />}
            disabled={readOnly || solving}
            title={biTitle(solution ? 'Re-solve' : 'Run the solver', T07.action.solve)}
            onClick={runSolve}
          >
            {solving ? 'Solving…' : solution ? 'Re-Solve / 重新求解' : 'Run Solver / 執行求解'}
          </Button>

          {blocking > 0 && (
            <span className="text-[12px] font-medium text-danger-600">
              {blocking} blocking issue{blocking > 1 ? 's' : ''} / 有 {blocking} 項阻擋問題
            </span>
          )}

          <div className="ml-auto flex gap-2">
            <Button
              icon={<Save size={15} />}
              disabled={readOnly || !solution}
              title={biTitle('Save solution', T07.action.saveSolution)}
              onClick={handleSave}
            >
              Save Solution
            </Button>
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              disabled={continueBlocked}
              title={biTitle('Continue to 08 Bottleneck Analysis', T07.action.continue)}
              onClick={() => navigate(projectPath(projectId, 'bottleneck'))}
            >
              Continue to 08
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
            Results are stale. Network or scenario inputs changed after the last
            solve. Re-solve required.
            <span className="block font-normal text-ink-500">
              結果已失效：拓樸或情境輸入在上次求解後被修改，請重新求解。
              {T07.field.staleResults}
            </span>
          </p>
        </div>
      )}

      {/* 07 §49 — boundary conditions incomplete. */}
      {boundaryIncomplete && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-500/40 bg-danger-100 px-3.5 py-2.5">
          <XCircle size={16} className="mt-0.5 shrink-0 text-danger-600" />
          <p className="text-[12px] leading-relaxed font-semibold text-danger-600">
            Boundary conditions are incomplete. Complete Screen 06 first.
            <span className="block font-normal text-ink-500">邊界條件尚未完成，請先完成 06。</span>
          </p>
          <Button
            className="ml-auto h-7 shrink-0 !text-[12px]"
            onClick={() => guardedNavigate(projectPath(projectId, 'boundary'))}
          >
            Go to 06
          </Button>
        </div>
      )}

      {/* Row 1 — controls, solved graph, inspector */}
      <div className="flex h-[calc(100vh-31rem)] min-h-[26rem] flex-col gap-3 lg:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto pr-1 lg:h-full lg:w-[19rem]">
          <Section index={1} title="Solver Settings" zh="求解設定" className="shrink-0">
            <SolveControlPanel
              state={stale ? 'DIRTY' : solverState}
              settings={settings}
              matrixSize={solution && !stale ? solution.metadata.matrix_size : null}
              powerScale={powerScale}
              readOnly={readOnly}
              canSolve={canSolve}
              hasSolution={Boolean(solution)}
              solving={solving}
              onSettings={(patch) => {
                useNetworkStore.getState().updateSolverSettings(patch);
                useSolutionStore.getState().refresh();
              }}
              onPreSolveCheck={runPreSolveCheck}
              onSolve={runSolve}
              onReset={() => setConfirmReset(true)}
            />
          </Section>

          <Section index={2} title="Scenario Summary" zh="情境摘要" className="shrink-0">
            <ScenarioSummary
              scenario={scenario}
              set={boundarySet}
              boundaryCount={boundarySet?.assignments.filter((entry) => entry.enabled).length ?? 0}
              portCount={boundaryPortCount}
              solarLoadCount={boundarySet?.external_loads.length ?? 0}
              onEditBoundary={() => guardedNavigate(projectPath(projectId, 'boundary'))}
            />
          </Section>
        </div>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <header className="shrink-0 border-b border-line px-3.5 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[13px] font-bold text-ink-900">
                Solved Thermal Network{' '}
                <span className="font-semibold text-ink-400">/ 已求解熱網路</span>
              </h2>
              <Badge tone="neutral">
                <span title="拓樸來自 05、邊界條件來自 06，此畫面不修改任何一項。">
                  From 05 + 06
                </span>
              </Badge>
              {stale && <Badge tone="warn">Stale / 已失效</Badge>}
            </div>
            <ResultModeToolbar
              mode={mode}
              hasResult={hasResult}
              display={display}
              onMode={setMode}
              onDisplay={(patch) => setDisplay((current) => ({ ...current, ...patch }))}
              onFit={() => canvasRef.current?.fit()}
              onZoom={(delta) => canvasRef.current?.zoomBy(delta)}
              onRelayout={() => canvasRef.current?.relayout()}
            />
          </header>

          <div className={`relative min-h-0 flex-1 ${stale ? 'opacity-50' : ''}`}>
            <SolvedGraphCanvas
              ref={canvasRef}
              network={network}
              solution={stale ? null : solution}
              mode={mode}
              display={display}
              scenarioId={activeScenarioId ?? ''}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={setSelectedNodeId}
              onSelectEdge={setSelectedEdgeId}
            />

            {/* Legend — 07 §21 and §22 both require one. */}
            <div className="absolute top-3 left-3 z-10 max-w-[13rem] rounded-md border border-line bg-surface/95 p-2 shadow-sm">
              <p className="mb-1 text-[10px] font-bold text-ink-700">
                Legend <span className="font-normal text-ink-400">/ 圖例</span>
              </p>
              <ul className="flex flex-col gap-0.5">
                {legend.map((entry) => (
                  <li
                    key={`${entry.color}-${entry.label}`}
                    title={entry.zh}
                    className="flex items-center gap-1.5 text-[10px] text-ink-500"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="truncate">{entry.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {solving && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/70">
                <p className="text-[13px] font-semibold text-ink-700">Solving… / 求解中…</p>
              </div>
            )}
          </div>

          <EnergyBalancePanel
            balance={solution?.energy_balance ?? null}
            warnPct={settings.energy_warn_pct}
            errorPct={settings.energy_error_pct}
            stale={stale}
          />
        </section>

        <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto pr-1 lg:h-full lg:w-[21rem]">
          <Section index={3} title="Solver Status" zh="求解狀態" className="shrink-0">
            <StatusRow
              label="Status"
              zh="狀態"
              value={`${stale ? 'DIRTY' : solverState} · ${STATUS_ZH[stale ? 'DIRTY' : solverState] ?? ''}`}
              tone={
                stale || solverState === 'WARNING'
                  ? 'text-warn-600'
                  : solverState === 'SOLVED'
                    ? 'text-ok-600'
                    : solverState === 'FAILED'
                      ? 'text-danger-600'
                      : ''
              }
            />
            <StatusRow label="Last Run" zh="上次求解" value={timeOf(solution?.solved_at)} />
            <StatusRow
              label="Solve Time"
              zh="求解時間"
              value={solution ? `${solution.metadata.solve_time_ms.toFixed(1)} ms` : '—'}
            />
            <StatusRow
              label="Matrix"
              zh="矩陣"
              value={
                solution ? `${solution.metadata.matrix_size} × ${solution.metadata.matrix_size}` : '—'
              }
            />
            <StatusRow
              label="Max Node Residual"
              zh="最大節點失衡"
              value={
                solution ? `${solution.metadata.max_node_residual_W.toExponential(1)} W` : '—'
              }
            />
            <StatusRow
              label="Energy Residual"
              zh="能量殘差"
              value={solution ? percent(solution.energy_balance.error_pct) : '—'}
              tone={
                solution?.energy_balance.grade === 'green'
                  ? 'text-ok-600'
                  : solution?.energy_balance.grade === 'warning'
                    ? 'text-warn-600'
                    : solution
                      ? 'text-danger-600'
                      : ''
              }
            />
          </Section>

          <Section
            index={4}
            title={selectedEdge ? 'Edge Inspector' : 'Node Inspector'}
            zh={selectedEdge ? '連線檢視' : '節點檢視'}
            className="min-h-[14rem] flex-1"
          >
            {selectedEdge ? (
              <EdgeResultInspector
                edge={selectedEdge}
                network={network}
                solution={solution}
                stale={stale}
                scenarioId={activeScenarioId ?? ''}
                onSelectNode={(nodeId) => {
                  setSelectedEdgeId(null);
                  setSelectedNodeId(nodeId);
                }}
              />
            ) : selectedNode ? (
              <NodeResultInspector
                node={selectedNode}
                network={network}
                solution={solution}
                stale={stale}
                scenarioName={scenario?.name ?? ''}
                solverState={solverState}
                onSelectEdge={(edgeId) => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(edgeId);
                }}
              />
            ) : (
              <InspectorEmpty />
            )}
          </Section>
        </div>
      </div>

      {/* Row 2 — result tables and the solver message log */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Section
          index={5}
          title="Node Temperature Results"
          zh="節點溫度結果"
          className="max-h-[22rem]"
          bodyClassName="px-3 pb-3"
          actions={<span className="text-[11px] text-ink-400">{rows.length} nodes</span>}
        >
          <NodeTemperatureTable
            rows={rows}
            hasSolution={Boolean(solution) && !stale}
            selectedNodeId={selectedNodeId}
            onSelect={(nodeId) => {
              setSelectedEdgeId(null);
              setSelectedNodeId(nodeId);
              canvasRef.current?.center(nodeId);
            }}
          />
          <p className="mt-2 text-[10px] text-ink-400">
            Limits come from the component records. Rows follow node id order;
            prioritising them is Screen 08's job.
            <span className="block">限制值來自元件資料；本表依節點代號排列，排序與優先級屬於 08。</span>
          </p>
        </Section>

        <Section
          index={6}
          title="Heat Flow Results"
          zh="熱流結果"
          className="max-h-[22rem]"
          bodyClassName="px-3 pb-3"
          actions={<span className="text-[11px] text-ink-400">{flows.length} edges</span>}
        >
          <HeatFlowTable
            rows={flows}
            selectedEdgeId={selectedEdgeId}
            onSelect={(edgeId) => {
              setSelectedNodeId(null);
              setSelectedEdgeId(edgeId);
              canvasRef.current?.center(edgeId);
            }}
          />
          <p className="mt-2 text-[10px] text-ink-400">
            A negative Q means heat flows against the drawn arrow. That is a valid
            result, not an error.
            <span className="block">Q 為負代表實際流向與圖示相反，屬合法結果。</span>
          </p>
        </Section>

        <Section
          index={7}
          title="Solver Messages"
          zh="求解訊息"
          className="max-h-[22rem]"
          actions={
            <Badge
              tone={
                blocking > 0
                  ? 'danger'
                  : issues.some((entry) => entry.severity === 'warning')
                    ? 'warn'
                    : 'ok'
              }
            >
              {blocking > 0 ? 'Blocked' : issues.length > 0 ? 'Review' : 'Clear'}
            </Badge>
          }
        >
          <SolverValidationPanel
            issues={issues}
            hasRun={Boolean(checks || solution)}
            onFocus={focusIssue}
            onNavigate={(screen) =>
              guardedNavigate(projectPath(projectId, screen === '05' ? 'thermal-path' : 'boundary'))
            }
          />
        </Section>
      </div>

      {confirmReset && (
        <Modal
          title="Reset results? / 清除求解結果？"
          description="This clears the analytical solution for the active scenario only. Topology, boundary conditions, Rth definitions and measurement data are kept. / 只會清除目前情境的解析解，拓樸、邊界條件、熱阻定義與量測資料都會保留。"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>Cancel / 取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmReset(false);
                  useSolutionStore.getState().resetResults(projectId);
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  setMode('node_type');
                  toast.success('Results cleared / 已清除求解結果');
                }}
              >
                Reset Results / 清除結果
              </Button>
            </>
          }
        />
      )}
    </ScreenWorkspace>
  );
}
