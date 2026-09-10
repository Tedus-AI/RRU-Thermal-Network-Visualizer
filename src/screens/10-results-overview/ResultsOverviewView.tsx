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

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Camera,
  RefreshCw,
  Network,
  Table2,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { Badge, Button, Skeleton } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
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
import { useDistributionResult } from '@/data/useDistributionResult';
import { currentSourceRevision } from '@/data/sourceRevision';

import { buildResultsOverview } from '@/thermal/overview/overviewAggregator';
import { ResultsOverlay } from '@/screens/07-thermal-network/ResultsOverlay';
import { ResultTree } from '@/screens/07-thermal-network/ResultTree';
import { edgeRows, nodeRows, resultTree } from '@/screens/07-thermal-network/resultViewModel';
import { marginRanking, partsNeedingAttention } from '@/thermal/analysis/marginRanking';
import { segmentLevers } from '@/thermal/analysis/tunableParameters';
import { exportFilename } from '@/export/exportNetworkGraph';
import { triggerDownload } from '@/export/download';
import { powerByCategory } from '@/thermal/overview/powerByCategory';
import { boundarySummary } from '@/thermal/overview/boundarySummary';
import { NEAR_LIMIT_MARGIN_C } from '@/thermal/analysis/temperatureDataset';
import { projectComponentLimits } from '@/thermal/graph/componentProjection';
import { CRITICAL_COMPONENT_TOP_N } from '@/thermal/overview/criticalComponents';

import { ResultsKpiBar } from './ResultsKpiBar';
import { OverallStatusCard } from './OverallStatusCard';
import { ScenarioSummaryPanel } from './ScenarioSummaryPanel';
import { ReportReadinessPanel } from './ReportReadinessPanel';
import { NetworkWindow } from './NetworkWindow';
import { ImprovementActions, type ImprovementRow } from './ImprovementActions';
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

/**
 * A big, obvious way into one of Screen 07's windows.
 *
 * Deliberately large: it replaces a panel that occupied this space, and a
 * link-sized control in its place would read as the panel having simply gone.
 *
 * Painted rather than outlined, and one colour each, because these two are the
 * only controls on Screen 10 that OPEN something — everything else on the
 * screen reports. Two surfaces of white among panels of white is exactly the
 * arrangement that hides a door. The colours are candy tokens rather than the
 * severity ramps: see `--color-candy-*`.
 */
const VIEW_BUTTON_TONES = {
  yellow:
    'border-candy-yellow-line bg-candy-yellow-400 hover:bg-candy-yellow-300',
  green: 'border-candy-green-line bg-candy-green-400 hover:bg-candy-green-300',
} as const;

function ViewButton({
  icon,
  label,
  sub,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  sub: string;
  tone: keyof typeof VIEW_BUTTON_TONES;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 items-center gap-3 rounded-lg border px-4 py-3 text-left shadow-sm transition-colors ${VIEW_BUTTON_TONES[tone]}`}
    >
      <span className="shrink-0 text-ink-900">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold text-ink-900">{label}</span>
        <span className="block truncate text-[11px] font-medium text-ink-700">{sub}</span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-ink-700" />
    </button>
  );
}

export function ResultsOverviewView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

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
  // Derived from the solution on screen rather than read back from a stored
  // snapshot Screen 09 used to refresh; see `useDistributionResult`.
  const { distribution, state: distributionState } = useDistributionResult();
  const boundarySet = useBoundaryStore((s) => s.current());
  const boundaryPorts = useBoundaryStore((s) => s.ports);
  /** The solve input Screen 08 reasons about, so the levers match its numbers. */
  const solveInput = useSolutionStore((s) => s.input);
  const studies = useAnalysisStore((s) => s.proposals);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  /** Bumped by Refresh Overview so the aggregate is rebuilt on demand (10 §27). */
  const [refreshToken, setRefreshToken] = useState(0);
  /**
   * The thermal network, over this screen rather than instead of it.
   *
   * "View Thermal Network" used to navigate to Screen 07, which costs the
   * conclusion you were reading to look at the picture behind it. It is the
   * same canvas Screen 07 draws, in a window this screen owns.
   */
  const [networkOpen, setNetworkOpen] = useState(false);
  /** The Screen 07 result table, over this screen. */
  const [resultsOpen, setResultsOpen] = useState(false);
  const [exportingTable, setExportingTable] = useState(false);


  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;
  const analysis = solution
    ? (analyses[`${solution.network_id}::${solution.scenario_id}`] ?? null)
    : null;

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
    useOverviewStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  // 10 §29 — a scenario change must never leave the previous scenario's numbers
  // on screen while the new ones load.
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
    useOverviewStore.getState().loadFor(projectId, activeScenarioId);
    setSelectedNodeId(null);
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

  /*
     The same projected limits Screen 07 paints by.

     Screen 04 owns a part's limit and its TYPE, and the type decides which node
     holds it — so a graph judged off the stored network would badge a junction
     over-limit that the tables here report as passing.
  */
  /**
   * The network the solver actually ran, with limits projected onto it.
   *
   * Boundary edges carry a resistance only on this clone, so a lever computed
   * off the stored graph would report the fin link as having no parameters.
   */
  const solveNetwork = useMemo(() => {
    const base = solveInput?.network ?? network;
    if (!base) return null;
    return components.length > 0 ? projectComponentLimits(base, components) : base;
  }, [solveInput, network, components]);

  const boundaryContext = useMemo(
    () => ({ ports: boundaryPorts, set: boundarySet }),
    [boundaryPorts, boundarySet],
  );

  const limitedNetwork = useMemo(
    () => (network ? projectComponentLimits(network, components) : null),
    [network, components],
  );

  /**
   * The boundary conditions the solve ran on, listed in the scenario panel.
   *
   * Read from Screen 06's stored set rather than recomputed, so the numbers
   * beside the conclusion are the ones the conclusion was computed from.
   */
  const boundaryConditions = useMemo(
    () =>
      boundarySummary(
        boundarySet,
        boundaryPorts,
        stale ? null : (solution?.node_temperatures_C ?? null),
      ),
    [boundarySet, boundaryPorts, solution, stale],
  );

  /*
     The Screen 07 result table, built exactly as Screen 07 builds it.

     Not a reduced copy: the same `nodeRows` / `edgeRows` / `resultTree` off the
     same projected limits, so the window this screen opens and the screen it
     came from cannot disagree about a margin.
  */
  const ambient =
    boundarySet?.ambient.external_ambient_C ?? scenario?.ambient_C ?? null;
  const rows = useMemo(
    () =>
      limitedNetwork
        ? nodeRows(limitedNetwork, stale ? null : solution, {
            ambient_C: ambient,
            powerScale: scenario?.power_scale ?? 1,
          })
        : [],
    [limitedNetwork, solution, stale, ambient, scenario?.power_scale],
  );
  const flows = useMemo(
    () => (network ? edgeRows(network, stale ? null : solution) : []),
    [network, solution, stale],
  );
  const tree = useMemo(
    () =>
      limitedNetwork
        ? resultTree(limitedNetwork, stale ? null : solution, rows, components)
        : [],
    [limitedNetwork, solution, stale, rows, components],
  );

  /**
   * Every part at WARNING or FAIL, worst first, with what Screen 08 saved.
   *
   * The levers are recomputed from the stored study rather than read out of it:
   * a study records WHICH segments were cut and by how much, and what that would
   * take depends on the parameters as they stand now. Copying a snapshot would
   * let this screen quote a target the model has since moved past.
   */
  const improvementRows = useMemo<ImprovementRow[]>(() => {
    if (!solveNetwork || !solution || stale) return [];
    const temperatures = solution.node_temperatures_C;
    // The same set Screen 08 opens on, from the same helper: a part cannot be
    // worth listing there and not here.
    const ranked = partsNeedingAttention(marginRanking(solveNetwork, temperatures, 0)).filter(
      (part) => part.margin_C <= NEAR_LIMIT_MARGIN_C,
    );
    const byTarget = new Map(studies.map((study) => [study.target_node_id, study]));

    return ranked.map((part) => {
      const study = byTarget.get(part.node_id) ?? null;
      return {
        part,
        status: part.margin_C < 0 ? ('over' as const) : ('warn' as const),
        study,
        levers:
          study && activeScenarioId
            ? study.segments.map((segment) =>
                segmentLevers(
                  solveNetwork,
                  activeScenarioId,
                  segment.edge_id,
                  segment.label,
                  segment.reduction_pct,
                  boundaryContext,
                ),
              )
            : [],
      };
    });
  }, [solveNetwork, solution, stale, studies, activeScenarioId, boundaryContext]);

  /** What the Total Power card opens into: the same heat, split by category. */
  const powerSplit = useMemo(
    () =>
      network
        ? powerByCategory({
            network,
            components,
            powerScale: scenario?.power_scale ?? 1,
            solar_W: solution?.energy_balance.solar_W ?? 0,
          }).slices
        : [],
    [network, components, scenario?.power_scale, solution],
  );

  const snapshot = activeScenarioId ? (snapshots[activeScenarioId] ?? null) : null;
  const snapshotCurrent = useMemo(() => {
    if (!snapshot || !overview) return false;
    return (
      snapshot.scenario_id === overview.scenario_id &&
      snapshot.source_signature === overview.source_signature
    );
  }, [snapshot, overview]);

  /** The same PDF Screen 07's window writes, from the same tree. */
  const exportTablePdf = useCallback(async () => {
    setExportingTable(true);
    try {
      const { exportResultTablePdf } = await import('@/export/exportResultTable');
      const blob = await exportResultTablePdf({
        table: (
          <ResultTree
            groups={tree}
            hasSolution={!stale}
            selectedNodeId={null}
            selectedEdgeId={null}
            onSelectNode={() => {}}
            onSelectEdge={() => {}}
            forceExpanded
          />
        ),
        title: `${draft?.project_name || 'Thermal network'} — solved results`,
        subtitle: `${rows.length} nodes · ${flows.length} edges · ${scenario?.name ?? ''}`.trim(),
      });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, exportFilename(draft?.project_name ?? '', 'pdf', { subject: 'results' }));
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success('Result table exported / 已輸出求解結果 PDF');
    } catch (error) {
      toast.error(
        `Export failed: ${error instanceof Error ? error.message : 'unknown error'} / 輸出失敗`,
      );
    } finally {
      setExportingTable(false);
    }
  }, [tree, stale, draft?.project_name, rows.length, flows.length, scenario?.name]);

  const go = (path: string) => navigate(projectPath(projectId ?? '', path));

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
      descriptionZh="彙整 07、08 的既有結果，呈現目前情境的熱狀態、餘裕、瓶頸與環溫餘裕；本頁不重新求解，也不重新分析。"
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
      headerAside={
        /* The verdict is the headline, so it sits with the title rather than
           under a row of cards that only make sense once you know it. */
        <OverallStatusCard
          status={overview.overall_status}
          reasons={overview.status_reasons}
          onResolve={
            overview.overall_status === 'STALE'
              ? { label: 'Go to Thermal Network', zh: '前往熱網路求解', onClick: () => go('network') }
              : undefined
          }
        />
      }
      metrics={
        <ResultsKpiBar
          status={overview.overall_status}
          kpis={overview.kpis}
          monitoredCount={monitoredCount}
          power={powerSplit}
        />
      }
      actionBar={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button icon={<ArrowLeft className="size-4" />} onClick={() => go('bottleneck')}>
            Back to 08 Bottleneck Analysis
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
                boundary={boundaryConditions}
              />
            </Section>

          </div>

          {/* --- centre: the two views, then what to do about them ---------- */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {/*
               Two buttons rather than two panels.

               Both used to be miniatures: a five-row Critical Components table
               and a 20 rem graph, each a reduced copy of something Screen 07
               draws properly. A reduction of a table is a table with rows
               missing, and a reduction of a 113-node graph is a picture of
               nothing. The real articles open over this screen instead.
            */}
            <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <ViewButton
                icon={<Table2 className="size-5" />}
                label="關鍵元件熱分析結果"
                sub={`Component results · ${rows.length} nodes`}
                tone="yellow"
                onClick={() => setResultsOpen(true)}
              />
              <ViewButton
                icon={<Network className="size-5" />}
                label="全域熱網路"
                sub={`Whole thermal network · ${Object.keys(network.nodes).length} nodes`}
                tone="green"
                onClick={() => setNetworkOpen(true)}
              />
            </div>

            <Section
              index={2}
              title="Improvement Actions"
              zh="改善行動"
              explanation={T10.improvementActions}
              className="shrink-0"
            >
              <ImprovementActions
                rows={improvementRows}
                projectId={projectId ?? ''}
                onOpenBottleneck={() => go('bottleneck')}
              />
            </Section>
          </div>

          {/* --- right rail: the conclusions -------------------------------- */}
          <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[21rem]">
            <Section
              index={3}
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

      {resultsOpen && (
        <ResultsOverlay
          groups={tree}
          hasSolution={!stale}
          nodeCount={rows.length}
          edgeCount={flows.length}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={null}
          onSelectNode={setSelectedNodeId}
          onSelectEdge={() => {}}
          onExportPdf={exportTablePdf}
          exporting={exportingTable}
          onClose={() => setResultsOpen(false)}
        />
      )}

      {networkOpen && (
        <NetworkWindow
          network={network}
          limitedNetwork={limitedNetwork}
          components={components}
          solution={solution}
          stale={stale}
          scenarioId={activeScenarioId ?? ''}
          scenarioName={scenario.name}
          projectName={draft?.project_name ?? ''}
          solverState={solverState}
          nodeCount={rows.length}
          edgeCount={flows.length}
          onClose={() => setNetworkOpen(false)}
        />
      )}
    </ScreenWorkspace>
  );
}
