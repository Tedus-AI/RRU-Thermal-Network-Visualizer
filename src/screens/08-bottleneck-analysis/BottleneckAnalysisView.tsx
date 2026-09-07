/**
 * Screen 08 — Bottleneck Analysis.
 *
 * The question, in the order an engineer actually asks it:
 *
 *   1. Which parts are closest to their own spec?       → the margin deck
 *   2. Show me that one's heat path.                    → Screen 07's graph, focused
 *   3. Which segments of it are worth arguing about?    → the three biggest drops
 *   4. If I got N % out of them, what do I get back?    → live, full re-solve
 *   5. Record that.                                     → a saved study
 *
 * This replaces a screen that ranked all 85 edges by a composite score and left
 * the reader to work out what to do with the list. The ranking was not wrong,
 * it answered a question one step removed from the one being asked: an engineer
 * does not need the 41st best edge in the machine, they need the three segments
 * on the path of the part that is about to fail.
 *
 * What it still never does (08 §30): temperature histogram, node temperature
 * bar chart, physical distribution map, executive pass/fail summary, report
 * narrative, FloTHERM parser. Those are 09, 10 and 11.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Maximize, XCircle } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { Badge, Button, Select, Skeleton } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import { KpiTile } from '@/ui/KpiTile';
import { toast } from '@/ui/toast';
import { focusHiddenNodes, focusLabels, graphPaths } from '@/ui/graphExplorerModel';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { useAnalysisStore } from '@/data/analysisStore';

import { DEFAULT_SOLVER_SETTINGS } from '@/thermal/types';
import { solveNetwork } from '@/thermal/networkSolver';
import { projectComponentLimits } from '@/thermal/graph/componentProjection';
import { marginRanking } from '@/thermal/analysis/marginRanking';
import {
  chainSegments,
  solutionWithWhatIf,
  solveWithAdjustments,
  type Adjustment,
} from '@/thermal/analysis/whatIf';
import {
  ANALYSIS_SCHEMA_VERSION,
  type ImprovementStudy,
  type StudySegment,
} from '@/thermal/analysis/analysisTypes';
import {
  SolvedGraphCanvas,
  type SolvedGraphHandle,
} from '@/screens/07-thermal-network/SolvedGraphCanvas';
import { RESULT_MODES, type ResultMode } from '@/screens/07-thermal-network/resultViewModel';

import { MarginDeck } from './MarginDeck';
import { REDUCTION_MAX, SegmentTuner } from './SegmentTuner';
import { StudyTable } from './StudyTable';
import { num } from './analysisViewModel';

/** How many parts the deck offers, and how many segments the tuner offers. */
const DECK_SIZE = 3;
const TUNED_SEGMENTS = 3;

const EMPTY_SET: ReadonlySet<string> = new Set<string>();
const GRAPH_DISPLAY = {
  showLabels: true,
  showPower: true,
  showLimits: true,
  showBoundary: true,
};

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
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-line bg-surface ${className}`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white tabular">
          {index}
        </span>
        <h2 className="min-w-0 truncate text-[13px] font-bold text-ink-900">
          {title} <span className="font-semibold text-ink-400">/ {zh}</span>
        </h2>
        {actions && <span className="ml-auto flex shrink-0 items-center gap-2">{actions}</span>}
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-[26rem] w-full" />
    </div>
  );
}

export function BottleneckAnalysisView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const network = useNetworkStore((s) => s.network);
  const components = useComponentStore((s) => s.components);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const solverState = useSolverStore((s) => s.state);

  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const solveInput = useSolutionStore((s) => s.input);
  const studies = useAnalysisStore((s) => s.proposals);

  const [rankIndex, setRankIndex] = useState(0);
  const [reductions, setReductions] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<ResultMode>('temperature');
  /** 08 — the focused chain answers the question; the whole machine gives it context. */
  const [wholeMachine, setWholeMachine] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const graphRef = useRef<SolvedGraphHandle | null>(null);

  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;

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
    useAnalysisStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
    setRankIndex(0);
    setReductions({});
  }, [projectId, activeScenarioId]);

  const solutionStale = useSolutionStore((s) => s.isStale());
  const solverSettings = network?.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const scenarioId = activeScenarioId ?? '';

  /**
   * The network every number on this screen is computed from.
   *
   * It is Screen 07's SOLVE-READY network — the one carrying the scenario's
   * boundary resistances and the finite-Bi spreading refinement — with the
   * component limits projected onto it. Reading limits off the stored graph and
   * temperatures off the solve-ready one is how the two disagree.
   */
  const solveGraph = useMemo(() => {
    const base = solveInput?.network ?? network;
    if (!base) return null;
    return components.length > 0 ? projectComponentLimits(base, components) : base;
  }, [solveInput, network, components]);

  /**
   * The baseline IS Screen 07's result. Not a re-solve of it, not a variant of
   * it — the temperatures that screen is showing.
   *
   * That is the only defensible answer to "why do the two screens disagree",
   * and it now holds by construction: `checkScenario` applies the finite-Bi
   * refinement, so the solve input the store hands over is the network the
   * stored solution came from, whichever door the store came in by. The guard
   * below is the belt to that braces — cheap, and it fails loudly instead of
   * quietly producing different numbers than the screen before it.
   */
  const baselineTemperatures = solution?.node_temperatures_C ?? null;

  const drift = useMemo(() => {
    if (!solveGraph || !scenarioId || !baselineTemperatures) return null;
    const again = solveNetwork(solveGraph, {
      scenarioId,
      powerScale: 1,
      settings: solverSettings,
    });
    if (!again.ok) return null;
    let worst: { node_id: string; delta_C: number } | null = null;
    for (const [id, value] of Object.entries(baselineTemperatures)) {
      const other = again.temperatures[id];
      if (!Number.isFinite(value) || !Number.isFinite(other)) continue;
      const delta = Math.abs(value - other);
      if (!worst || delta > worst.delta_C) worst = { node_id: id, delta_C: delta };
    }
    return worst && worst.delta_C > 0.05 ? worst : null;
  }, [solveGraph, scenarioId, solverSettings, baselineTemperatures]);

  const ranked = useMemo(
    () =>
      solveGraph && baselineTemperatures
        ? marginRanking(solveGraph, baselineTemperatures, DECK_SIZE)
        : [],
    [solveGraph, baselineTemperatures],
  );
  const target = ranked[Math.min(rankIndex, Math.max(ranked.length - 1, 0))] ?? null;

  /** The focused part's own nodes, and everything its heat passes through. */
  const focus = useMemo(() => {
    if (!solveGraph || !target) return null;
    const path = graphPaths(solveGraph).find((entry) => entry.nodeIds.includes(target.node_id));
    if (!path) return null;
    const hidden = focusHiddenNodes(solveGraph, path);
    const visible = new Set(Object.keys(solveGraph.nodes).filter((id) => !hidden.has(id)));
    const componentName =
      components.find((entry) => entry.id === path.componentId)?.name ?? path.componentId;
    return {
      path,
      hidden,
      visible,
      own: new Set(path.nodeIds),
      labels: focusLabels(solveGraph, path, componentName),
    };
  }, [solveGraph, target, components]);

  const segments = useMemo(() => {
    if (!solveGraph || !solution || !focus) return [];
    return chainSegments(solveGraph, solution, focus.visible, focus.own).slice(0, TUNED_SEGMENTS);
  }, [solveGraph, solution, focus]);

  // A new part starts from its solved state, never from the last part's cuts.
  useEffect(() => {
    setReductions({});
  }, [target?.node_id]);

  const adjustments: Adjustment[] = useMemo(
    () =>
      segments
        .map((segment) => ({
          edge_id: segment.edge_id,
          reduction_pct: reductions[segment.edge_id] ?? 0,
        }))
        .filter((entry) => entry.reduction_pct > 0),
    [segments, reductions],
  );

  const whatIf = useMemo(() => {
    if (!solveGraph || !scenarioId || adjustments.length === 0) return null;
    return solveWithAdjustments(solveGraph, scenarioId, solverSettings, adjustments);
  }, [solveGraph, scenarioId, solverSettings, adjustments]);

  const projected = useMemo(() => {
    if (!target || !whatIf?.ok) return null;
    const temperature = whatIf.temperatures[target.node_id];
    if (!Number.isFinite(temperature)) return null;
    return { temperature_C: temperature, margin_C: target.limit_C - temperature };
  }, [target, whatIf]);

  /** What each segment would buy on its own — the "where do I spend effort" number. */
  const soloGains = useMemo(() => {
    const gains: Record<string, number> = {};
    if (!solveGraph || !scenarioId || !target || !baselineTemperatures) return gains;
    for (const segment of segments) {
      const pct = reductions[segment.edge_id] ?? 0;
      if (pct <= 0) {
        gains[segment.edge_id] = 0;
        continue;
      }
      const solo = solveWithAdjustments(solveGraph, scenarioId, solverSettings, [
        { edge_id: segment.edge_id, reduction_pct: pct },
      ]);
      gains[segment.edge_id] = solo.ok
        ? baselineTemperatures[target.node_id] - solo.temperatures[target.node_id]
        : 0;
    }
    return gains;
  }, [solveGraph, scenarioId, solverSettings, segments, reductions, target, baselineTemperatures]);

  /** The graph paints the what-if while one is live, and the baseline otherwise. */
  const graphSolution = useMemo(() => {
    if (!solution) return null;
    return whatIf?.ok ? solutionWithWhatIf(solution, whatIf) : solution;
  }, [solution, whatIf]);

  const dirty = adjustments.length > 0;

  const saveStudy = () => {
    if (!projectId || !target || !projected || !scenarioId) return;
    const studySegments: StudySegment[] = segments
      .filter((segment) => (reductions[segment.edge_id] ?? 0) > 0)
      .map((segment) => {
        const pct = reductions[segment.edge_id] ?? 0;
        return {
          edge_id: segment.edge_id,
          label: segment.label,
          edge_type: segment.edge_type,
          reduction_pct: pct,
          rth_before_C_per_W: segment.rth_C_per_W,
          rth_after_C_per_W: segment.rth_C_per_W * (1 - pct / 100),
          solo_gain_C: soloGains[segment.edge_id] ?? 0,
        };
      });

    const study: ImprovementStudy = {
      id: `STUDY_${scenarioId}_${target.node_id}_${Date.now()}`,
      schema_version: ANALYSIS_SCHEMA_VERSION,
      project_id: projectId,
      scenario_id: scenarioId,
      target_node_id: target.node_id,
      target_node_name: target.name,
      limit_C: target.limit_C,
      limit_type: target.limit_type,
      baseline: { temperature_C: target.temperature_C, margin_C: target.margin_C },
      projected,
      segments: studySegments,
      created_at: new Date().toISOString(),
      applied: false,
    };

    useAnalysisStore.getState().saveStudy(projectId, study);
    toast.success('Study saved — no resistance was changed / 已儲存，未修改任何熱阻');
  };

  const loadStudy = (study: ImprovementStudy) => {
    const position = ranked.findIndex((entry) => entry.node_id === study.target_node_id);
    if (position >= 0) setRankIndex(position);
    setReductions(
      Object.fromEntries(study.segments.map((entry) => [entry.edge_id, entry.reduction_pct])),
    );
  };

  // --- guards --------------------------------------------------------------

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">Unable to load the analysis.</h1>
          <p className="mt-1 text-[13px] text-ink-500">無法載入瓶頸分析。</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
            Return to Project Info
          </Button>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft) return <LoadingState />;

  const hasTopology = Boolean(network && Object.keys(network.nodes).length > 0);

  // 08 §7 — without a valid Screen 07 solution there is nothing to improve.
  if (
    !hasTopology ||
    !network ||
    !solution ||
    !solveGraph ||
    !baselineTemperatures ||
    solutionStale ||
    solution.status === 'FAILED'
  ) {
    return (
      <ScreenWorkspace
        title="Bottleneck Analysis"
        titleZh="瓶頸分析"
        descriptionZh="從離規格最近的元件出發，看它的熱路徑上哪一段最值得改善。"
      >
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <p className="text-[14px] font-semibold text-ink-700">
              {!hasTopology
                ? 'No thermal network found.'
                : !solution
                  ? 'This scenario has no Screen 07 solution yet.'
                  : solutionStale
                    ? 'The Screen 07 solution is stale. Re-solve before analysing it.'
                    : 'The Screen 07 solve failed. Fix it before analysing.'}
            </p>
            <p className="mt-1 text-[12px] text-ink-400">
              {!hasTopology ? '找不到熱網路，請先完成 05。' : '瓶頸分析需要 07 有效且未失效的解。'}
            </p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() =>
                navigate(projectPath(projectId, hasTopology ? 'network' : 'thermal-path'))
              }
            >
              {hasTopology ? 'Open 07 Thermal Network / 前往 07' : 'Open 05 / 前往 05'}
            </Button>
          </div>
        </div>
      </ScreenWorkspace>
    );
  }

  const gain = projected && target ? projected.margin_C - target.margin_C : 0;

  return (
    <ScreenWorkspace
      title="Bottleneck Analysis"
      titleZh="瓶頸分析"
      descriptionZh="從離規格最近的元件出發，在它的熱路徑上調整最值得改善的區段，即時看餘裕變化。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          <Badge tone={solverState === 'SOLVED' ? 'ok' : 'warn'}>Solver {solverState}</Badge>
          {scenario && <Badge tone="neutral">{scenario.name}</Badge>}
        </div>
      }
      metrics={
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <MarginDeck ranked={ranked} index={rankIndex} onSelect={setRankIndex} />
          <KpiTile
            icon={<span className="text-[10px] font-bold">°C</span>}
            label="Margin Now"
            zh="目前餘裕"
            tooltip="Limit − Temperature，來自 07 的解。"
            value={target ? num(target.margin_C, 1, '°C') : 'N/A'}
            status={
              target
                ? `${num(target.temperature_C, 1)} / ${target.limit_C} °C ${target.limit_type ?? ''}`
                : undefined
            }
            tone={
              !target
                ? 'text-ink-900'
                : target.margin_C < 0
                  ? 'text-danger-600'
                  : target.margin_C < 10
                    ? 'text-warn-600'
                    : 'text-ok-600'
            }
          />
          <KpiTile
            icon={<ArrowRight size={13} />}
            label="Margin If Adjusted"
            zh="調整後餘裕"
            tooltip="以目前的調整重新求解整張網路後，此元件剩下的餘裕。"
            value={projected ? num(projected.margin_C, 1, '°C') : '—'}
            status={
              projected
                ? `${gain >= 0 ? '+' : ''}${gain.toFixed(1)} °C gained / 改善`
                : 'move a segment / 調整區段後顯示'
            }
            tone={projected ? 'text-ok-600' : 'text-ink-400'}
          />
          <KpiTile
            icon={<span className="text-[10px] font-bold">#</span>}
            label="Saved Studies"
            zh="已儲存分析"
            tooltip="此情境已儲存的假設調整紀錄；不會修改任何熱阻。"
            value={String(studies.length)}
            status="assumptions only / 僅為假設"
          />
        </div>
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            title={biTitle('Back to 07 Thermal Network', '返回 07')}
            onClick={() => navigate(projectPath(projectId, 'network'))}
          >
            Back to Thermal Network
          </Button>
          <span className="text-[11px] text-ink-400">
            {ranked.length} part(s) ranked by margin · {segments.length} segment(s) offered ·
            adjustments are assumptions, never written to the model
          </span>
          <Button
            variant="primary"
            className="ml-auto"
            icon={<ArrowRight size={15} />}
            title={biTitle('Continue to 09', '前往 09')}
            onClick={() => navigate(projectPath(projectId, 'temperature'))}
          >
            Continue to Temperature Distribution
          </Button>
        </div>
      }
    >
      {drift && (
        <p className="mb-3 rounded-md border border-warn-500/40 bg-warn-100 px-3 py-2 text-[11px] leading-relaxed font-semibold text-warn-600">
          Screen 07's stored solution and a re-solve of its own inputs differ by{' '}
          {drift.delta_C.toFixed(1)} °C at {drift.node_id}. Re-solve Screen 07 so both screens
          show the same baseline.
          <span className="block font-normal text-ink-500">
            07 的既有解與「以其輸入重新求解」在 {drift.node_id} 相差 {drift.delta_C.toFixed(1)}{' '}
            °C，請回 07 重新求解，兩畫面才會一致。
          </span>
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Section
            index={1}
            title={
              wholeMachine
                ? 'Thermal Network — whole machine'
                : target
                  ? `Heat Path — ${target.name}`
                  : 'Heat Path'
            }
            zh={wholeMachine ? '整機熱網路' : '此元件的熱路徑'}
            className="min-h-[22rem] flex-1"
            bodyClassName="p-0"
            actions={
              <>
                <span className="flex overflow-hidden rounded-md border border-line-strong">
                  {[
                    { id: false, label: 'This part', zh: '此元件' },
                    { id: true, label: 'Whole machine', zh: '整機' },
                  ].map((entry) => (
                    <button
                      key={String(entry.id)}
                      type="button"
                      aria-pressed={wholeMachine === entry.id}
                      title={biTitle(entry.label, entry.zh)}
                      onClick={() => setWholeMachine(entry.id)}
                      className={`px-2 py-1 text-[11px] font-semibold transition-colors ${
                        wholeMachine === entry.id
                          ? 'bg-accent-600 text-white'
                          : 'bg-surface text-ink-500 hover:text-ink-900'
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </span>
                <Select
                  className="h-7 !text-[11px]"
                  value={mode}
                  items={RESULT_MODES.map((entry) => ({ value: entry.id, label: entry.label }))}
                  onChange={(event) => setMode(event.target.value as ResultMode)}
                />
                <button
                  type="button"
                  title={biTitle('Fit', '全覽')}
                  aria-label={biTitle('Fit', '全覽')}
                  onClick={() => graphRef.current?.fit()}
                  className="flex size-7 items-center justify-center rounded-md border border-line-strong text-ink-500 hover:bg-surface-muted"
                >
                  <Maximize size={13} />
                </button>
              </>
            }
          >
            <div className="relative h-full min-h-0">
              <SolvedGraphCanvas
                ref={graphRef}
                network={solveGraph}
                solution={graphSolution}
                mode={mode}
                display={GRAPH_DISPLAY}
                scenarioId={scenarioId}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                tool="select"
                layoutMode="Auto"
                hiddenComponentIds={EMPTY_SET}
                extraHiddenNodeIds={wholeMachine ? EMPTY_SET : (focus?.hidden ?? EMPTY_SET)}
                focusKey={wholeMachine ? undefined : focus?.path.key}
                nodeLabelOverrides={wholeMachine ? undefined : focus?.labels}
                onSelectNode={setSelectedNodeId}
                onSelectEdge={setSelectedEdgeId}
                onZoomChange={() => undefined}
              />
              {whatIf?.ok && (
                <p className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-md border border-orange-500/40 bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700 shadow-sm">
                  Showing the adjusted network — nothing is written to the model
                  <span className="ml-1 font-normal text-ink-500">
                    / 顯示調整後結果，未寫回模型
                  </span>
                </p>
              )}
            </div>
          </Section>

          <Section
            index={3}
            title="Saved Studies"
            zh="已儲存的調整分析"
            className="max-h-[14rem] shrink-0"
          >
            <StudyTable
              studies={studies}
              readOnly={readOnly}
              onSelect={loadStudy}
              onDelete={(id) => useAnalysisStore.getState().deleteStudy(projectId, id)}
            />
          </Section>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[23rem]">
          <Section
            index={2}
            title="Segments Worth Improving"
            zh="最值得改善的區段"
            className="min-h-[26rem] flex-1"
            actions={<span className="text-[10px] text-ink-400">step 0.1 %</span>}
          >
            {target ? (
              <SegmentTuner
                target={target}
                segments={segments}
                reductions={reductions}
                soloGains={soloGains}
                projected={projected}
                readOnly={readOnly}
                dirty={dirty}
                onReduction={(edgeId, pct) =>
                  setReductions((current) => ({
                    ...current,
                    [edgeId]: Math.min(
                      REDUCTION_MAX,
                      Math.max(0, Number.isFinite(pct) ? pct : 0),
                    ),
                  }))
                }
                onReset={() => setReductions({})}
                onSave={saveStudy}
              />
            ) : (
              <p className="py-6 text-center text-[11px] text-ink-400">
                No part in this network carries a temperature limit.
                <span className="block">此網路沒有任何元件設定溫度上限。</span>
              </p>
            )}
          </Section>
        </div>
      </div>
    </ScreenWorkspace>
  );
}
