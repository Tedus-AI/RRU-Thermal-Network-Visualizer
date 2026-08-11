/**
 * Screen 09 — Temperature Distribution.
 * Specification: 09_Temperature_Distribution.md (source of truth), laid out
 * after 09.png.
 *
 * The question this screen answers (09 §60): what does the temperature
 * distribution of the whole system look like, which nodes run hot, and how do
 * groups and scenarios differ. Screen 08 answered "which segment is worth
 * improving"; that is a different question and is not re-answered here.
 *
 * What it never does (09 §0, §44): solve, re-solve, change an Rth, a power or a
 * boundary, rank bottlenecks, score sensitivity, or draw the executive pass/fail
 * summary Screen 10 owns. Every number is read from the Screen 07 solution.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Image,
  Maximize,
  Minus,
  Plus,
  RefreshCw,
  Thermometer,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { useGuardedNavigate } from '@/app/useGuardedNavigate';
import { Badge, Button, Select, Skeleton } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import { toast } from '@/ui/toast';
import type { PlotlyChartHandle } from '@/ui/PlotlyChart';

import { useProjectStore } from '@/data/projectStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { useComponentStore } from '@/data/componentStore';

import {
  DEFAULT_SCOPE,
  applyFilters,
  applyScope,
  buildTemperatureDataset,
  emptyFilters,
  filterOptionsOf,
  groupRows,
  rankRows,
  temperatureCsv,
  type DistributionFilters,
  type DistributionScope,
  type GroupBy,
  type RankMode,
} from '@/thermal/analysis/temperatureDataset';
import {
  buildHistogram,
  computeStatistics,
  resolveBinWidth,
  type BinMode,
} from '@/thermal/analysis/temperatureStatistics';
import { percentilePositionOf, sortedFinite } from '@/thermal/analysis/percentile';
import { compareScenarios } from '@/thermal/analysis/scenarioTemperatureCompare';

import { TemperatureKpiBar } from './TemperatureKpiBar';
import {
  DistributionFilterPanel,
  HistogramSettingsPanel,
  ScopePanel,
} from './DistributionFilterPanel';
import { TemperatureStatisticsPanel } from './TemperatureStatisticsPanel';
import { DistributionViewTabs, VIEW_LABELS, type DistributionView } from './DistributionViewTabs';
import { TemperatureHistogram, type HistogramReferenceLine } from './TemperatureHistogram';
import {
  BAR_SORTS,
  BAR_SORT_LABELS,
  ComponentTemperatureBars,
  sortRowsForBars,
  type BarSort,
} from './ComponentTemperatureBars';
import { MarginBars } from './MarginBars';
import {
  COMPARE_MODES,
  COMPARE_MODE_LABELS,
  ScenarioComparisonChart,
  type CompareMode,
} from './ScenarioComparisonChart';
import {
  NETWORK_FILTERS,
  NETWORK_FILTER_LABELS,
  TemperatureLegend,
  TemperatureNetworkView,
  type NetworkFilter,
  type NetworkViewHandle,
} from './TemperatureNetworkView';
import { HotNodeTable, RANK_MODE_LABELS, TOP_OPTIONS, showingLabel } from './HotNodeTable';
import { InspectorEmpty, TemperatureNodeInspector } from './TemperatureNodeInspector';
import { buildScale, downloadCsv, num } from './distributionViewModel';
import { T09 } from './tooltips';

// --- building blocks --------------------------------------------------------

function Section({
  title,
  zh,
  actions,
  className = '',
  bodyClassName = 'p-3',
  children,
}: {
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
        <h2 className="min-w-0 truncate text-[13px] font-bold text-ink-900">
          {title} <span className="font-semibold text-ink-400">/ {zh}</span>
        </h2>
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
          <Skeleton key={index} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function IconButton({
  label,
  zh,
  onClick,
  children,
}: {
  label: string;
  zh: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={biTitle(label, zh)}
      aria-label={biTitle(label, zh)}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded border border-line-strong text-ink-500 transition-colors hover:bg-surface-muted"
    >
      {children}
    </button>
  );
}

// --- screen -----------------------------------------------------------------

export function TemperatureDistributionView() {
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

  // --- view state ---------------------------------------------------------
  const [scope, setScope] = useState<DistributionScope>(DEFAULT_SCOPE);
  const [groupBy, setGroupBy] = useState<GroupBy>('component');
  const [filters, setFilters] = useState<DistributionFilters>(emptyFilters());
  const [view, setView] = useState<DistributionView>('histogram');
  const [binMode, setBinMode] = useState<BinMode>('5');
  const [customBin, setCustomBin] = useState(5);
  const [warningThreshold, setWarningThreshold] = useState(90);
  const [barSort, setBarSort] = useState<BarSort>('temperature_desc');
  const [rankMode, setRankMode] = useState<RankMode>('temperature');
  const [topN, setTopN] = useState<number>(10);
  const [comparisonScenarioId, setComparisonScenarioId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>('grouped');
  const [lockScale, setLockScale] = useState(true);
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const chartRef = useRef<PlotlyChartHandle | null>(null);
  const networkRef = useRef<NetworkViewHandle | null>(null);

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
    useComponentStore.getState().loadFor(projectId);
    useNetworkStore.getState().loadFor(projectId);
    const scenarioId = useScenarioStore.getState().activeScenarioId;
    useBoundaryStore.getState().loadFor(projectId, scenarioId);
    useSolutionStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  // 09 §50 — a scenario change must not leave the previous scenario's numbers
  // on screen while the new ones load.
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    setSelectedNodeId(null);
  }, [projectId, activeScenarioId]);

  const stale = useSolutionStore((s) => s.isStale());

  // --- dataset ------------------------------------------------------------
  const allRows = useMemo(() => {
    if (!network || !solution) return [];
    return buildTemperatureDataset({ network, solution, components });
  }, [network, solution, components]);

  const scopedRows = useMemo(
    () => applyScope(allRows, scope, selectedNodeId ? [selectedNodeId] : []),
    [allRows, scope, selectedNodeId],
  );
  const rows = useMemo(() => applyFilters(scopedRows, filters), [scopedRows, filters]);

  const options = useMemo(() => filterOptionsOf(allRows), [allRows]);
  const statistics = useMemo(
    () => computeStatistics(rows.map((row) => row.temperature_C)),
    [rows],
  );
  const sortedTemperatures = useMemo(
    () => sortedFinite(rows.map((row) => row.temperature_C)),
    [rows],
  );

  const minMargin = useMemo(() => {
    const margins = rows
      .map((row) => row.margin_C)
      .filter((value): value is number => value != null && Number.isFinite(value));
    return margins.length > 0 ? Math.min(...margins) : null;
  }, [rows]);

  const nodesAboveWarning = useMemo(
    () => rows.filter((row) => row.temperature_C > warningThreshold).length,
    [rows, warningThreshold],
  );

  const binWidth = useMemo(
    () => resolveBinWidth(binMode, customBin, rows.map((row) => row.temperature_C)),
    [binMode, customBin, rows],
  );
  const bins = useMemo(
    () =>
      buildHistogram(
        rows.map((row) => ({ node_id: row.node_id, temperature_C: row.temperature_C })),
        binWidth,
      ),
    [rows, binWidth],
  );

  // 09 §12 — Average, P95 and the warning threshold only. No global limit line:
  // the selected nodes carry different Tj / Tc / Ts values and collapsing them
  // into one would be a fiction.
  const references = useMemo<HistogramReferenceLine[]>(() => {
    const lines: HistogramReferenceLine[] = [];
    if (statistics.mean_C != null) {
      lines.push({
        value: statistics.mean_C,
        label: `Average (${statistics.mean_C.toFixed(1)} °C)`,
        color: '#16a34a',
        dash: 'dash',
      });
    }
    if (statistics.p95_C != null) {
      lines.push({
        value: statistics.p95_C,
        label: `P95 (${statistics.p95_C.toFixed(1)} °C)`,
        color: '#7c3aed',
        dash: 'dash',
      });
    }
    lines.push({
      value: warningThreshold,
      label: `Warning (${warningThreshold} °C)`,
      color: '#f59e0b',
      dash: 'dot',
    });
    return lines;
  }, [statistics, warningThreshold]);

  const rankedRows = useMemo(() => rankRows(rows, rankMode), [rows, rankMode]);
  const shownRows = topN === 0 ? rankedRows : rankedRows.slice(0, topN);
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);

  // --- scenario comparison (09 §17, §18) ----------------------------------
  const comparisonSolution = useMemo(() => {
    if (!comparisonScenarioId || !solution) return null;
    const key = `${solution.network_id}::${comparisonScenarioId}`;
    return solutions[key] ?? null;
  }, [comparisonScenarioId, solution, solutions]);

  const comparison = useMemo(() => {
    if (!comparisonSolution || !solution || !network) return null;
    return compareScenarios({
      baselineRows: rows,
      baselineScenarioId: solution.scenario_id,
      comparisonSolution,
      comparisonScenarioId: comparisonSolution.scenario_id,
      limitOf: (nodeId) => network.nodes[nodeId]?.limit_C ?? undefined,
    });
  }, [comparisonSolution, solution, network, rows]);

  /**
   * 09 §22 — with the lock on, both scenarios share one range so a cooler
   * scenario cannot be made to look identical to a hotter one by auto-scaling.
   */
  const lockedRange = useMemo(() => {
    if (!lockScale) return undefined;
    const values = [
      ...rows.map((row) => row.temperature_C),
      ...(comparisonSolution ? Object.values(comparisonSolution.node_temperatures_C) : []),
    ].filter((value) => Number.isFinite(value));
    if (values.length === 0) return undefined;
    return { min: Math.floor(Math.min(...values) / 5) * 5, max: Math.ceil(Math.max(...values) / 5) * 5 };
  }, [lockScale, rows, comparisonSolution]);

  const networkScale = useMemo(
    () => buildScale(rows.map((row) => row.temperature_C), lockedRange),
    [rows, lockedRange],
  );
  const inScopeIds = useMemo(() => new Set(rows.map((row) => row.node_id)), [rows]);

  // --- selection ----------------------------------------------------------
  const selectedRow = useMemo(
    () => allRows.find((row) => row.node_id === selectedNodeId) ?? null,
    [allRows, selectedNodeId],
  );
  const selectedRank = useMemo(() => {
    if (!selectedNodeId) return null;
    const index = rankedRows.findIndex((row) => row.node_id === selectedNodeId);
    return index >= 0 ? index + 1 : null;
  }, [rankedRows, selectedNodeId]);
  const selectedPercentile = useMemo(
    () =>
      selectedRow ? percentilePositionOf(sortedTemperatures, selectedRow.temperature_C) : null,
    [selectedRow, sortedTemperatures],
  );
  const selectedComparison = useMemo(
    () => comparison?.rows.find((row) => row.node_id === selectedNodeId) ?? null,
    [comparison, selectedNodeId],
  );

  // --- actions ------------------------------------------------------------
  const exportCsv = () => {
    if (rows.length === 0) {
      toast.warning('Nothing to export with the current filters / 目前篩選沒有可匯出的資料');
      return;
    }
    downloadCsv(
      `temperature-${solution?.scenario_id ?? 'scenario'}.csv`,
      temperatureCsv(rows, scenario?.name ?? ''),
    );
    toast.success(`${rows.length} row(s) exported / 已匯出 ${rows.length} 筆`);
  };

  const exportChartPng = async () => {
    if (!chartRef.current) {
      toast.warning('This view has no exportable chart / 此檢視沒有可匯出的圖表');
      return;
    }
    await chartRef.current.downloadPng(`temperature-${view}`);
  };

  const refreshFromSolution = () => {
    if (!projectId) return;
    useNetworkStore.getState().loadFor(projectId);
    useComponentStore.getState().loadFor(projectId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    toast.success('Reloaded from the Screen 07 solution / 已重新讀取 07 的解');
  };

  const resetFilters = () => {
    setFilters(emptyFilters());
    setScope(DEFAULT_SCOPE);
  };

  // --- guards --------------------------------------------------------------

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">
            Unable to load the temperature distribution.
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">無法載入溫度分佈。</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
            Return to Project Info
          </Button>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft) return <LoadingState />;

  // 09 §1 — a current solved network is the prerequisite.
  const solutionUsable = Boolean(solution) && solution?.status !== 'FAILED';
  if (!network || !solution || !solutionUsable) {
    return (
      <ScreenWorkspace
        title="Temperature Distribution"
        titleZh="溫度分佈"
        description="See how temperature is distributed across the system, which nodes run hot, and how groups and scenarios differ."
        descriptionZh="檢視整個系統的溫度分佈、哪些節點偏熱，以及不同群組與情境的差異。"
      >
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <Thermometer size={24} className="mx-auto mb-3 text-ink-400" />
            <p className="text-[14px] font-semibold text-ink-700">
              A current solved thermal network is required.
            </p>
            <p className="mt-1 text-[13px] text-ink-500">
              Return to Screen 07 and solve this scenario.
            </p>
            <p className="mt-1 text-[12px] text-ink-400">溫度分佈需要 07 有效的求解結果。</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() =>
                guardedNavigate(projectPath(projectId, network ? 'network' : 'thermal-path'))
              }
            >
              {network ? 'Open 07 Thermal Network / 前往 07' : 'Open 05 Thermal Path Builder / 前往 05'}
            </Button>
          </div>
        </div>
      </ScreenWorkspace>
    );
  }

  const comparisonScenario = scenarios.find((entry) => entry.id === comparisonScenarioId) ?? null;
  const solvedScenarioIds = new Set(
    Object.values(solutions).map((entry) => entry.scenario_id),
  );

  return (
    <ScreenWorkspace
      title="Temperature Distribution"
      titleZh="溫度分佈"
      description="See how temperature is distributed across the system, which nodes run hot, and how groups and scenarios differ. Everything here is read from the Screen 07 solution; nothing is solved or changed."
      descriptionZh="檢視整個系統的溫度分佈、偏熱節點，以及群組與情境差異。本畫面只讀取 07 的解，不求解也不修改任何輸入。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stale ? 'warn' : 'ok'}>{stale ? 'STALE' : 'READY'}</Badge>
          <Badge tone={solverState === 'SOLVED' ? 'ok' : 'warn'}>Solver {solverState}</Badge>
          <Badge tone="neutral">Result Source: Analytical</Badge>
          {scenario && <Badge tone="neutral">{scenario.name}</Badge>}
        </div>
      }
      metrics={
        <TemperatureKpiBar
          statistics={statistics}
          minMargin_C={minMargin}
          nodesAboveWarning={nodesAboveWarning}
          warningThreshold_C={warningThreshold}
          scenarioName={scenario?.name ?? ''}
          stale={stale}
        />
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            title={biTitle('Back to 08 Bottleneck Analysis', '回到 08 瓶頸分析')}
            onClick={() => guardedNavigate(projectPath(projectId, 'bottleneck'))}
          >
            Back to 08 Bottleneck Analysis
          </Button>
          <Button
            icon={<RefreshCw size={15} />}
            title={biTitle('Refresh from solution', T09.refreshFromSolution)}
            onClick={refreshFromSolution}
          >
            Refresh from Solution
          </Button>
          <Button
            icon={<Download size={15} />}
            title={biTitle('Export temperature CSV', T09.exportCsv)}
            onClick={exportCsv}
          >
            Export Temperature CSV
          </Button>

          <span className="text-[11px] text-ink-400">
            {rows.length} distribution row(s) · {VIEW_LABELS[view].label} · Result source
            Analytical
          </span>

          <div className="ml-auto">
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              title={biTitle('Continue to 10 Results Overview', '前往 10 結果總覽')}
              onClick={() => navigate(projectPath(projectId, 'results'))}
            >
              Continue to 10 Results Overview
            </Button>
          </div>
        </div>
      }
    >
      {/* 09 §45 — a stale solution is never presented as the current answer. */}
      {stale && (
        <div className="flex items-start gap-2 rounded-lg border border-warn-500/40 bg-warn-100 px-3.5 py-2.5">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn-600" />
          <p className="text-[12px] leading-relaxed font-semibold text-warn-600">
            Temperature results are stale. Re-solve the active scenario in Screen 07.
            <span className="block font-normal text-ink-500">{T09.stale}</span>
          </p>
          <Button
            className="ml-auto h-7 shrink-0 !text-[12px]"
            onClick={() => guardedNavigate(projectPath(projectId, 'network'))}
          >
            Go to 07
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-col gap-3 lg:flex-row">
        {/* Left column — Scope / Filters / Histogram Settings / Statistics */}
        {/* 18.5rem, not the PNG's narrower rail: the widest scope option the
            specification names ("Components With Limits") has to fit inside the
            select without clipping, and the option text is spec wording. */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[18.5rem]">
          <Section title="Scope" zh="範圍" className="shrink-0">
            <ScopePanel
              scope={scope}
              groupBy={groupBy}
              disabled={stale}
              onScope={setScope}
              onGroupBy={setGroupBy}
            />
          </Section>

          <Section
            title="Filters"
            zh="篩選"
            className="shrink-0"
            actions={
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] font-bold text-accent-600 hover:underline"
              >
                Reset / 重設
              </button>
            }
          >
            <DistributionFilterPanel
              filters={filters}
              options={options}
              disabled={stale}
              onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            />
          </Section>

          <Section title="Histogram Settings" zh="直方圖設定" className="shrink-0">
            <HistogramSettingsPanel
              binMode={binMode}
              customBin={customBin}
              warningThreshold={warningThreshold}
              disabled={stale}
              onBinMode={setBinMode}
              onCustomBin={setCustomBin}
              onWarningThreshold={setWarningThreshold}
            />
          </Section>

          <Section title="Temperature Statistics" zh="溫度統計" className="shrink-0">
            <TemperatureStatisticsPanel statistics={statistics} />
          </Section>
        </div>

        {/* Centre column — view tabs, chart, hot node table */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {/* The network view needs more height than the charts: a 21 node LR
              graph fitted into a 21rem card zooms out until the node labels are
              unreadable, which defeats the point of 09 §20's per-node colouring.
              The charts stay compact so the rank table keeps its place. */}
          <section
            className={`flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-surface ${
              view === 'network_temperature' ? 'h-[26rem]' : 'h-[21rem]'
            }`}
          >
            <DistributionViewTabs view={view} onView={setView} />

            {/* Header controls carry explicit widths: `Select` is `w-full` by
                design for the form grids, and left to itself here every select
                would claim a whole flex line and push the chart into a sliver. */}
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3.5 py-2">
              <h2 className="text-[13px] font-bold text-ink-900">
                {view === 'histogram'
                  ? 'Temperature Distribution Histogram'
                  : VIEW_LABELS[view].label}{' '}
                <span className="font-semibold text-ink-400">/ {VIEW_LABELS[view].zh}</span>
              </h2>

              {view === 'histogram' && (
                <span className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1 text-ok-600">
                    <span aria-hidden className="inline-block h-0 w-4 border-t-2 border-dashed border-ok-600" />
                    Average ({num(statistics.mean_C, 1)} °C)
                  </span>
                  <span className="flex items-center gap-1 text-[#7c3aed]">
                    <span
                      aria-hidden
                      className="inline-block h-0 w-4 border-t-2 border-dashed"
                      style={{ borderColor: '#7c3aed' }}
                    />
                    P95 ({num(statistics.p95_C, 1)} °C)
                  </span>
                  <span className="flex items-center gap-1 text-warn-600">
                    <span aria-hidden className="inline-block h-0 w-4 border-t-2 border-dotted border-warn-600" />
                    Warning ({warningThreshold} °C)
                  </span>
                </span>
              )}

              {(view === 'component_bars' || view === 'margin_bars') && (
                <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  Sort
                  <Select
                    className="h-7 !w-[12rem] !text-[11px]"
                    value={barSort}
                    items={BAR_SORTS.map((entry) => ({
                      value: entry,
                      label: BAR_SORT_LABELS[entry].label,
                    }))}
                    onChange={(event) => setBarSort(event.target.value as BarSort)}
                  />
                </label>
              )}

              {view === 'scenario_compare' && (
                <span className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
                    Compare with
                    <Select
                      className="h-7 !w-[10rem] !text-[11px]"
                      value={comparisonScenarioId ?? ''}
                      items={[
                        { value: '', label: 'Select scenario…' },
                        ...scenarios
                          .filter(
                            (entry) =>
                              entry.id !== activeScenarioId && solvedScenarioIds.has(entry.id),
                          )
                          .map((entry) => ({ value: entry.id, label: entry.name })),
                      ]}
                      onChange={(event) => setComparisonScenarioId(event.target.value || null)}
                    />
                  </label>
                  <Select
                    className="h-7 !w-[9.5rem] !text-[11px]"
                    aria-label="Comparison chart mode"
                    value={compareMode}
                    items={COMPARE_MODES.map((entry) => ({
                      value: entry,
                      label: COMPARE_MODE_LABELS[entry].label,
                    }))}
                    onChange={(event) => setCompareMode(event.target.value as CompareMode)}
                  />
                  <label className="flex items-center gap-1 text-[11px] font-medium text-ink-500">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-accent-600"
                      checked={lockScale}
                      onChange={(event) => setLockScale(event.target.checked)}
                    />
                    Lock Temperature Scale
                    <EngineeringInfo zh={T09.lockTemperatureScale} label="Lock Temperature Scale" />
                  </label>
                </span>
              )}

              {view === 'network_temperature' && (
                <span className="flex flex-wrap items-center gap-2">
                  <Select
                    className="h-7 !w-[9.5rem] !text-[11px]"
                    aria-label="Network node filter"
                    value={networkFilter}
                    items={NETWORK_FILTERS.map((entry) => ({
                      value: entry,
                      label: NETWORK_FILTER_LABELS[entry].label,
                    }))}
                    onChange={(event) => setNetworkFilter(event.target.value as NetworkFilter)}
                  />
                  <label className="flex items-center gap-1 text-[11px] font-medium text-ink-500">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-accent-600"
                      checked={lockScale}
                      onChange={(event) => setLockScale(event.target.checked)}
                    />
                    Lock Temperature Scale
                    <EngineeringInfo zh={T09.lockTemperatureScale} label="Lock Temperature Scale" />
                  </label>
                  <TemperatureLegend scale={networkScale} locked={lockScale} />
                </span>
              )}

              <span className="ml-auto flex items-center gap-1.5">
                {view === 'network_temperature' ? (
                  <>
                    <IconButton
                      label="Zoom out"
                      zh="縮小"
                      onClick={() => networkRef.current?.zoomBy(-0.15)}
                    >
                      <Minus size={13} />
                    </IconButton>
                    <IconButton
                      label="Zoom in"
                      zh="放大"
                      onClick={() => networkRef.current?.zoomBy(0.15)}
                    >
                      <Plus size={13} />
                    </IconButton>
                    <IconButton label="Fit graph" zh="全覽" onClick={() => networkRef.current?.fit()}>
                      <Maximize size={13} />
                    </IconButton>
                  </>
                ) : (
                  <button
                    type="button"
                    title={biTitle('Export chart PNG', T09.exportChartPng)}
                    onClick={exportChartPng}
                    className="flex items-center gap-1 text-[11px] font-bold text-accent-600 hover:underline"
                  >
                    <Image size={12} aria-hidden /> Export Chart PNG
                  </button>
                )}
              </span>
            </header>

            <div className={`relative min-h-0 flex-1 p-2 ${stale ? 'opacity-50' : ''}`}>
              {view === 'histogram' && (
                <TemperatureHistogram
                  ref={chartRef}
                  bins={bins}
                  references={references}
                  onSelectBin={(bin) => {
                    const first = bin.node_ids[0];
                    if (first) setSelectedNodeId(first);
                  }}
                />
              )}
              {view === 'component_bars' && (
                <ComponentTemperatureBars
                  ref={chartRef}
                  rows={sortRowsForBars(rows, barSort)}
                  scale={lockedRange}
                  onSelectRow={(row) => setSelectedNodeId(row.node_id)}
                />
              )}
              {view === 'margin_bars' && (
                <MarginBars
                  ref={chartRef}
                  rows={sortRowsForBars(rows, barSort)}
                  onSelectRow={(row) => setSelectedNodeId(row.node_id)}
                />
              )}
              {view === 'scenario_compare' &&
                (comparison ? (
                  <ScenarioComparisonChart
                    ref={chartRef}
                    rows={comparison.rows}
                    mode={compareMode}
                    baselineName={scenario?.name ?? 'Baseline'}
                    comparisonName={comparisonScenario?.name ?? 'Comparison'}
                    lockedRange={lockScale ? lockedRange : undefined}
                    onSelectNode={setSelectedNodeId}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center">
                    <p className="text-[12px] text-ink-400">
                      Pick a solved scenario to compare against.
                      <span className="block">請選擇另一個已求解的情境進行比較。</span>
                    </p>
                  </div>
                ))}
              {view === 'network_temperature' && (
                <TemperatureNetworkView
                  ref={networkRef}
                  network={network}
                  solution={solution}
                  scale={networkScale}
                  filter={networkFilter}
                  inScopeNodeIds={inScopeIds}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                />
              )}
            </div>

            {/* 09 §18 — a topology difference is stated, never papered over. */}
            {view === 'scenario_compare' && comparison?.partial_match && (
              <p className="flex shrink-0 items-center gap-1 border-t border-warn-500/40 bg-warn-100 px-3 py-1.5 text-[11px] font-semibold text-warn-600">
                Partial Match — {comparison.matched} node(s) compared,{' '}
                {comparison.missing_comparison + comparison.missing_baseline} unmatched.
                <EngineeringInfo zh={T09.partialMatch} label="Partial Match" />
              </p>
            )}
          </section>

          <Section
            // 09 §26 wants the heading itself to name the rank, so it can never be
            // mistaken for Screen 08's bottleneck rank. The spec's own panel name
            // ("Hot Node Table") rides along in the Chinese half rather than in the
            // English heading, which truncated once the two selects were beside it.
            title={RANK_MODE_LABELS[rankMode].label}
            zh={`${RANK_MODE_LABELS[rankMode].zh}（熱點節點表）`}
            className="max-h-[17rem] shrink-0"
            bodyClassName="px-3 pb-3"
            actions={
              <>
                <span className="text-[11px] text-ink-400">
                  {showingLabel(shownRows.length, rankedRows.length)}
                </span>
                <Select
                  className="h-7 !w-[9.5rem] !text-[11px]"
                  aria-label="Rank mode"
                  value={rankMode}
                  items={[
                    { value: 'temperature', label: 'Temperature Rank' },
                    { value: 'margin', label: 'Margin Rank' },
                  ]}
                  onChange={(event) => setRankMode(event.target.value as RankMode)}
                />
                <Select
                  className="h-7 !w-[5.5rem] !text-[11px]"
                  aria-label="Rows shown"
                  value={String(topN)}
                  items={TOP_OPTIONS.map((entry) => ({
                    value: String(entry),
                    label: entry === 0 ? 'All' : `Top ${entry}`,
                  }))}
                  onChange={(event) => setTopN(Number(event.target.value))}
                />
              </>
            }
          >
            <div className="min-w-0 overflow-x-auto">
              <HotNodeTable
                rows={shownRows}
                rankMode={rankMode}
                warningThreshold_C={warningThreshold}
                selectedNodeId={selectedNodeId}
                onSelect={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  if (view === 'network_temperature') networkRef.current?.center(nodeId);
                }}
              />
            </div>
            {rows.length === 0 && (
              <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-400">
                No temperature data matches the current filters.
                <button
                  type="button"
                  onClick={resetFilters}
                  className="font-bold text-accent-600 hover:underline"
                >
                  Reset Filters / 重設篩選
                </button>
              </p>
            )}
            <p className="mt-2 text-[10px] text-ink-400">
              Grouped by {groupBy.replace(/_/g, ' ')} · {groups.length} group(s) in scope.
              This is a temperature rank, not the bottleneck rank of Screen 08.
              <span className="block">此為溫度排名，與 08 的瓶頸排名不同。</span>
            </p>
          </Section>
        </div>

        {/* Right column — selected node inspector */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[25rem]">
          <Section
            title={selectedRow ? `Selected Node: ${selectedRow.node_name}` : 'Selected Node'}
            zh="所選節點"
            className="h-[calc(100vh-18rem)] min-h-[26rem]"
            actions={
              selectedRow && (
                <Badge tone="neutral">
                  {selectedRank == null ? 'Not in scope' : `Rank ${selectedRank}`}
                </Badge>
              )
            }
          >
            {selectedRow ? (
              <TemperatureNodeInspector
                row={selectedRow}
                network={network}
                solution={solution}
                scenarioName={scenario?.name ?? ''}
                rank={selectedRank}
                percentilePosition={selectedPercentile}
                mean_C={statistics.mean_C}
                comparison={selectedComparison}
                comparisonScenarioName={comparisonScenario?.name ?? null}
                onSelectNode={setSelectedNodeId}
              />
            ) : (
              <InspectorEmpty />
            )}
          </Section>
        </div>
      </div>
    </ScreenWorkspace>
  );
}
