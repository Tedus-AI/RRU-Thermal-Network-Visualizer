/**
 * Screen 10 — Results Overview.
 * Specification: 10_Results_Overview.md (source of truth, as the delivery audit
 * states), laid out after 10.png.
 *
 * The question this screen answers (10 §36): for the CURRENT scenario, what is
 * the engineering conclusion — thermal status, margin, bottleneck, distribution,
 * quality and next step — assembled from what Screens 07, 08 and 09 already
 * computed.
 *
 * What it never does (10 §0, §22–§26): solve or re-solve, run a sensitivity,
 * bin a temperature, lay out a report, or choose an export format. There is no
 * Rth Reduction control, no Run Sensitivity, no Histogram Bin, no page-size
 * selector and no format picker anywhere on this screen, and nothing here writes
 * to the topology, the boundary set or the stored solution.
 *
 * Where the supplied 10.png and the Markdown disagree, the Markdown wins on
 * CONTENT and the PNG on PLACEMENT — `10_Results_Overview_UI_Audit.md` opens by
 * naming the Markdown as the source of truth, and the PNG is the product's
 * generic master mockup: it shows a Scenario Compare tab, Group By / Scope /
 * Limit-Type filters and a Histogram-style ranking panel, all of which §22 and
 * §24 explicitly forbid here, while omitting Top Bottlenecks, Energy Balance,
 * Total Power, Data Completeness, the Network Snapshot, the Engineering Action
 * Summary, Overall Readiness and Prepare Report Snapshot, all of which §35
 * requires. So this screen keeps the PNG's shape — six KPI cards across the top,
 * a numbered left rail, a wide centre column, a right-hand conclusions rail, and
 * a bottom action bar — and fills it with the sections the Markdown mandates.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Maximize,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { useGuardedNavigate } from '@/app/useGuardedNavigate';
import { Badge, Button, Skeleton } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { useComponentStore } from '@/data/componentStore';
import { useAnalysisStore } from '@/data/analysisStore';
import { useOverviewStore } from '@/data/overviewStore';
import { useDistributionStore } from '@/data/distributionStore';
import { currentSourceRevision } from '@/data/sourceRevision';

import { buildResultsOverview } from '@/thermal/overview/overviewAggregator';
import { CRITICAL_COMPONENT_TOP_N } from '@/thermal/overview/criticalComponents';

import { ResultsKpiBar } from './ResultsKpiBar';
import { OverallStatusCard } from './OverallStatusCard';
import { ScenarioSummaryPanel } from './ScenarioSummaryPanel';
import { SolverQualityPanel } from './SolverQualityPanel';
import { DataCompletenessPanel } from './DataCompletenessPanel';
import { CriticalComponentsTable } from './CriticalComponentsTable';
import { BottleneckSummaryPanel } from './BottleneckSummaryPanel';
import { DistributionSummary } from './DistributionSummary';
import {
  NetworkSnapshot,
  SnapshotLegend,
  type NetworkSnapshotHandle,
} from './NetworkSnapshot';
import {
  EngineeringActionSummary,
  RecommendedNextActionPanel,
} from './EngineeringActionSummary';
import { OverallReadinessPanel, ReportReadinessPanel } from './ReportReadinessPanel';
import { T10 } from './tooltips';

// --- building blocks --------------------------------------------------------

/**
 * Numbered section card, following the PNG's "1. View & Filter" convention.
 * English heading with the Chinese beside it — 10 §1's bilingual rule, in the
 * "space allows" form.
 */
function Section({
  index,
  title,
  zh,
  explanation,
  actions,
  className = '',
  bodyClassName = 'p-3',
  children,
}: {
  index: number;
  title: string;
  zh: string;
  explanation?: string;
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
        <h2 className="flex min-w-0 items-center gap-1 truncate text-[12.5px] font-bold text-ink-900">
          <span className="text-ink-400 tabular">{index}.</span> {title}
          <span className="font-semibold text-ink-400">/ {zh}</span>
        </h2>
        {explanation && <EngineeringInfo zh={explanation} label={title} />}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-16" />
      <div className="grid grid-cols-[18rem_1fr_20rem] gap-3">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

/** 10 §3, §29 — the blocking gate, in the specification's own words. */
function NotReady({
  reason,
  onSolve,
}: {
  reason: 'no_solution' | 'failed';
  onSolve: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col items-start gap-3 rounded-lg border border-warn-500/40 bg-warn-100 px-5 py-4">
        <p className="flex items-center gap-2 text-[14px] font-bold text-warn-600">
          <TriangleAlert className="size-5" aria-hidden />
          {reason === 'no_solution'
            ? 'No valid thermal results available. Solve the active scenario in Screen 07 first.'
            : 'Current thermal solution is not valid. Return to Screen 07 and solve the active scenario.'}
        </p>
        <p className="text-[12px] text-ink-700">
          {reason === 'no_solution'
            ? '目前沒有可用的熱分析結果，請先於 07 Thermal Network 求解目前情境。'
            : '目前的求解結果無效，請回到 07 Thermal Network 重新求解目前情境。'}
        </p>
        <p className="text-[11px] text-ink-500">
          Screen 10 summarises results; it never solves for them. Nothing is estimated in their
          absence.
          <span className="block">
            10 只彙整既有結果，本身不進行求解；沒有結果時也不會以估算值代替。
          </span>
        </p>
        <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={onSolve}>
          Go to 07 Thermal Network / 前往 07 熱網路求解
        </Button>
      </div>
    </div>
  );
}

// --- screen -----------------------------------------------------------------

export function ResultsOverviewView() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const guardedNavigate = useGuardedNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);

  const network = useNetworkStore((s) => s.network);
  const components = useComponentStore((s) => s.components);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const solverState = useSolverStore((s) => s.state);

  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const analyses = useAnalysisStore((s) => s.analyses);
  const snapshots = useOverviewStore((s) => s.snapshots);
  const distributionResults = useDistributionStore((s) => s.results);
  const distributionKey = useDistributionStore((s) => s.activeKey);
  const distributionState = useDistributionStore((s) => s.state());

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  /** Bumped by Refresh Overview so the aggregate is rebuilt on demand (10 §27). */
  const [refreshToken, setRefreshToken] = useState(0);

  const snapshotRef = useRef<NetworkSnapshotHandle | null>(null);

  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;
  const analysis = solution
    ? (analyses[`${solution.network_id}::${solution.scenario_id}`] ?? null)
    : null;
  const distribution = distributionKey ? (distributionResults[distributionKey] ?? null) : null;

  // --- load -----------------------------------------------------------------
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
    useDistributionStore.getState().loadFor(projectId, scenarioId);
    useOverviewStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  // 10 §29 — a scenario change must never leave the previous scenario's numbers
  // on screen while the new ones load.
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
    useDistributionStore.getState().loadFor(projectId, activeScenarioId);
    useOverviewStore.getState().loadFor(projectId, activeScenarioId);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [projectId, activeScenarioId]);

  const stale = useSolutionStore((s) => s.isStale());

  // --- the aggregate (10 §5) ------------------------------------------------
  const built = useMemo(() => {
    if (!network || !solution || !scenario || !projectId) return null;
    return buildResultsOverview({
      project_id: projectId,
      scenario,
      network,
      solution,
      components,
      analysis,
      distribution_result: distribution,
      distribution_stale: distributionState !== 'CURRENT',
      current_source_revision: currentSourceRevision(projectId, network, scenario),
      solution_stale: stale || solverState === 'DIRTY',
      solver_settings: network.solver_settings,
    });
    // `refreshToken` is a deliberate dependency: Refresh Overview re-reads the
    // stores and rebuilds even when nothing React can see has changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    network,
    solution,
    scenario,
    projectId,
    components,
    analysis,
    distribution,
    distributionState,
    stale,
    solverState,
    refreshToken,
  ]);

  const overview = built?.overview ?? null;
  const snapshot = activeScenarioId ? (snapshots[activeScenarioId] ?? null) : null;
  const snapshotCurrent = useMemo(() => {
    if (!snapshot || !overview) return false;
    return (
      snapshot.scenario_id === overview.scenario_id &&
      snapshot.source_signature === overview.source_signature
    );
  }, [snapshot, overview]);

  const go = (path: string) => guardedNavigate(projectPath(projectId ?? '', path));
  const SCREEN_PATHS: Record<string, string> = {
    '04': 'components',
    '05': 'thermal-path',
    '06': 'boundary',
    '07': 'network',
    '08': 'bottleneck',
    '09': 'temperature',
    '11': 'report',
  };

  // --- gates ----------------------------------------------------------------
  if (projectStatus === 'loading' || (projectId && !draft)) return <LoadingState />;

  if (!network || !solution || !scenario || !overview) {
    return (
      <ScreenWorkspace
        title="Results Overview"
        titleZh="結果總覽"
        description="A single engineering conclusion for the active scenario, assembled from the Screen 07, 08 and 09 results."
        descriptionZh="彙整 07、08、09 的既有結果，給出目前情境的工程結論；本頁不重新計算任何分析。"
        badge={<Badge tone="warn">NOT READY</Badge>}
      >
        <NotReady reason="no_solution" onSolve={() => go('network')} />
      </ScreenWorkspace>
    );
  }

  // 10 §3 — a FAILED solve is not a summary input.
  if (solution.status === 'FAILED') {
    return (
      <ScreenWorkspace
        title="Results Overview"
        titleZh="結果總覽"
        description="A single engineering conclusion for the active scenario, assembled from the Screen 07, 08 and 09 results."
        descriptionZh="彙整 07、08、09 的既有結果，給出目前情境的工程結論；本頁不重新計算任何分析。"
        badge={<Badge tone="danger">SOLVER FAILED</Badge>}
      >
        <NotReady reason="failed" onSolve={() => go('network')} />
      </ScreenWorkspace>
    );
  }

  const monitoredCount = built?.rows.filter((row) => row.margin_C != null).length ?? 0;
  const criticalRows = overview.critical_components.slice(0, CRITICAL_COMPONENT_TOP_N);

  const prepareSnapshot = () => {
    if (!projectId) return;
    if (overview.report_readiness === 'BLOCKED') {
      toast.error(
        'Report Readiness is BLOCKED — re-solve in Screen 07 before preparing a snapshot.',
      );
      return;
    }
    useOverviewStore.getState().prepare(projectId, overview, draft?.project_context.owner || undefined);
    toast.success('Report snapshot prepared for Screen 11 / 已為 11 準備報告快照');
  };

  const continueToReport = () => {
    // 10 §27 — Continue is allowed unless Report Readiness is BLOCKED, and a
    // WARNING asks for confirmation rather than being waved through silently.
    if (overview.report_readiness === 'BLOCKED') {
      toast.error('Report Readiness is BLOCKED. Re-solve the active scenario in Screen 07 first.');
      return;
    }
    if (overview.report_readiness === 'WARNING') {
      const proceed = window.confirm(
        `Report Readiness is WARNING:\n\n${overview.report_readiness_reasons.map((reason) => `· ${reason}`).join('\n')}\n\nContinue to Screen 11 Report Preview anyway?`,
      );
      if (!proceed) return;
    }
    navigate(projectPath(projectId ?? '', 'report'));
  };

  return (
    <ScreenWorkspace
      title="Results Overview"
      titleZh="結果總覽"
      description="A single engineering conclusion for the active scenario: thermal status, margins, bottlenecks, distribution and result quality, assembled from the Screen 07, 08 and 09 results. Nothing here is re-solved or re-analysed."
      descriptionZh="彙整 07、08、09 的既有結果，呈現目前情境的熱狀態、餘裕、瓶頸、分佈與結果品質；本頁不重新求解，也不重新分析。"
      badge={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={stale ? 'neutral' : 'ok'}>{stale ? 'STALE' : 'CURRENT'}</Badge>
          <Badge tone="neutral">Solver {solution.status}</Badge>
          <Badge tone="accent">
            <span className="flex items-center gap-1">
              Result Mode: {overview.result_mode}
              <EngineeringInfo zh={T10.resultMode} label="Result Mode" />
            </span>
          </Badge>
          <Badge tone="neutral">{scenario.name}</Badge>
        </span>
      }
      metrics={
        <ResultsKpiBar
          status={overview.overall_status}
          kpis={overview.kpis}
          energyGrade={overview.solver_quality.quality}
          bottleneckAvailable={overview.bottleneck_availability === 'current'}
          monitoredCount={monitoredCount}
        />
      }
      actionBar={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button icon={<ArrowLeft className="size-4" />} onClick={() => go('temperature')}>
            Back to 09 Temperature Distribution
          </Button>
          <Button
            icon={<RefreshCw className="size-4" />}
            onClick={() => {
              if (!projectId) return;
              useSolutionStore.getState().refresh();
              useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
              setRefreshToken((token) => token + 1);
              toast.success('Overview refreshed from the current results / 已依目前結果重新彙整');
            }}
          >
            Refresh Overview / 重新彙整
          </Button>
          <Button
            icon={<Camera className="size-4" />}
            disabled={overview.report_readiness === 'BLOCKED'}
            onClick={prepareSnapshot}
          >
            Prepare Report Snapshot / 準備報告快照
          </Button>

          <span className="ml-auto flex items-center gap-2 text-[11px] text-ink-400">
            {overview.overall_status} · Report {overview.report_readiness} ·{' '}
            {overview.result_mode} · {criticalRows.length} critical component(s)
          </span>

          <Button
            variant="primary"
            trailingIcon={<ArrowRight className="size-4" />}
            disabled={overview.report_readiness === 'BLOCKED'}
            onClick={continueToReport}
          >
            Continue to 11 Report Preview
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-6 pb-6">
        {/* 10 §4, §21 — status with its reasons, and the primary action when stale. */}
        <OverallStatusCard
          status={overview.overall_status}
          reasons={overview.status_reasons}
          resultMode={overview.result_mode}
          onResolve={
            overview.overall_status === 'STALE'
              ? { label: 'Go to Thermal Network', zh: '前往熱網路求解', onClick: () => go('network') }
              : undefined
          }
        />

        {stale && (
          <p className="flex items-center gap-2 rounded-md border border-line-strong bg-surface-muted px-3 py-1.5 text-[11px] font-semibold text-ink-500">
            <XCircle className="size-4" aria-hidden />
            Values below are retained from the last solve and are marked STALE. They are not the
            current answer.
            <span className="text-ink-400">
              以下數值保留自上次求解並標示為 STALE，不代表目前的正確結果。
            </span>
          </p>
        )}

        <div className="flex min-h-0 flex-col gap-3 xl:flex-row">
          {/* --- left rail: scenario, solver quality, completeness ---------- */}
          <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[19rem]">
            <Section index={1} title="Scenario Summary" zh="情境摘要" explanation={T10.scenarioSummary}>
              <ScenarioSummaryPanel
                scenario={scenario}
                solver={overview.solver_quality}
                stale={stale}
                onOpenBoundary={() => go('boundary')}
                onOpenNetwork={() => go('network')}
              />
            </Section>

            <Section
              index={2}
              title="Solver / Energy Quality"
              zh="求解與能量品質"
              explanation={T10.energyBalance}
            >
              <SolverQualityPanel solver={overview.solver_quality} />
            </Section>

            <Section
              index={3}
              title="Data Completeness"
              zh="資料完整度"
              explanation={T10.dataCompleteness}
            >
              <DataCompletenessPanel
                completeness={overview.completeness}
                onOpenComponents={() => go('components')}
              />
            </Section>
          </div>

          {/* --- centre: the result blocks ---------------------------------- */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <Section
              index={4}
              title="Critical Components"
              zh="關鍵元件"
              explanation={T10.criticalComponents}
              className="shrink-0"
              bodyClassName="px-3 pb-3"
              actions={
                <span className="text-[10.5px] text-ink-400">
                  Top {criticalRows.length} by lowest margin · 依最小餘裕排序
                </span>
              }
            >
              <div className="min-w-0 overflow-x-auto">
                <CriticalComponentsTable
                  rows={criticalRows}
                  selectedNodeId={selectedNodeId}
                  onSelect={(nodeId) => {
                    setSelectedNodeId(nodeId);
                    snapshotRef.current?.center(nodeId);
                  }}
                />
              </div>
            </Section>

            <Section
              index={5}
              title="Top Bottlenecks"
              zh="主要瓶頸"
              explanation={T10.topBottleneck}
              className="shrink-0"
              bodyClassName="px-3 pb-3"
              actions={
                <Button
                  className="!h-7 !px-2 !text-[11px]"
                  onClick={() => go('bottleneck')}
                >
                  Open Bottleneck Analysis
                </Button>
              }
            >
              <div className="min-w-0 overflow-x-auto">
                <BottleneckSummaryPanel
                  rows={overview.bottlenecks}
                  availability={overview.bottleneck_availability}
                  selectedEdgeId={selectedEdgeId}
                  onSelect={setSelectedEdgeId}
                  onOpenAnalysis={() => go('bottleneck')}
                />
              </div>
            </Section>

            <Section
              index={6}
              title="Temperature Distribution Summary"
              zh="溫度分佈總覽"
              explanation={T10.temperatureRangeBar}
              className="shrink-0"
            >
              <DistributionSummary
                summary={overview.distribution}
                onOpenDistribution={() => go('temperature')}
              />
            </Section>

            <Section
              index={7}
              title="Network Snapshot"
              zh="熱網路快照"
              explanation={T10.networkSnapshot}
              // The fit is width-bound for a 20-plus node LR graph, so height past
              // this point is dead space rather than a bigger picture. The full
              // graph lives in Screen 07.
              className="h-[20rem] shrink-0"
              bodyClassName="flex min-h-0 flex-col p-0"
              actions={
                <>
                  <button
                    type="button"
                    title={biTitle('Fit to view', '縮放至全圖')}
                    aria-label={biTitle('Fit to view', '縮放至全圖')}
                    onClick={() => snapshotRef.current?.fit()}
                    className="flex size-7 items-center justify-center rounded border border-line-strong text-ink-500 transition-colors hover:bg-surface-muted"
                  >
                    <Maximize className="size-3.5" />
                  </button>
                  <Button className="!h-7 !px-2 !text-[11px]" onClick={() => go('network')}>
                    Open Thermal Network
                  </Button>
                </>
              }
            >
              <div className="shrink-0 border-b border-line px-3 py-1.5">
                <SnapshotLegend path={built?.critical_path ?? { node_ids: [], edge_ids: [], origin: 'none', label: '' }} />
              </div>
              <div className="min-h-0 flex-1">
                <NetworkSnapshot
                  ref={snapshotRef}
                  network={network}
                  solution={solution}
                  path={built?.critical_path ?? { node_ids: [], edge_ids: [], origin: 'none', label: '' }}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                />
              </div>
              <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10px] text-ink-400">
                Read-only. Nodes cannot be moved and nothing here writes to the topology.
                <span className="ml-1">唯讀：無法拖曳節點，也不會寫回拓樸。</span>
              </p>
            </Section>
          </div>

          {/* --- right rail: the conclusions -------------------------------- */}
          <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[21rem]">
            <Section
              index={8}
              title="Engineering Action Summary"
              zh="工程行動摘要"
              explanation={T10.engineeringActionSummary}
            >
              <EngineeringActionSummary
                lines={overview.action_summary}
                linesZh={overview.action_summary_zh}
              />
            </Section>

            <Section
              index={9}
              title="Recommended Next Action"
              zh="建議下一步"
              explanation={T10.recommendedNextAction}
            >
              <RecommendedNextActionPanel
                recommended={overview.recommended}
                onGoto={(code) => go(SCREEN_PATHS[code] ?? 'network')}
              />
            </Section>

            <Section
              index={10}
              title="Overall Readiness"
              zh="整體就緒度"
              explanation={T10.overallReadiness}
            >
              <OverallReadinessPanel checks={overview.readiness} />
            </Section>

            <Section
              index={11}
              title="Report Readiness"
              zh="報告就緒狀態"
              explanation={T10.reportReadiness}
            >
              <ReportReadinessPanel
                readiness={overview.report_readiness}
                reasons={overview.report_readiness_reasons}
                reasonsZh={overview.report_readiness_reasons_zh}
                snapshot={snapshot}
                snapshotCurrent={snapshotCurrent}
                onPrepare={prepareSnapshot}
              />
            </Section>
          </div>
        </div>
      </div>
    </ScreenWorkspace>
  );
}
