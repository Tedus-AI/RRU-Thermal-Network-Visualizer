/**
 * Screen 08 — Bottleneck Analysis.
 * Specification: 08_Bottleneck_Analysis.md (source of truth), laid out after
 * 08.png.
 *
 * The question this screen answers (08 §33): not "which resistance is largest",
 * but "which segment, when improved, makes the whole General Thermal Graph
 * redistribute its heat and actually come out cooler". Every candidate is
 * measured by re-solving the complete network with that one resistance reduced.
 *
 * What it never does (08 §30): temperature histogram, node temperature bar
 * chart, physical distribution map, scenario distribution chart, executive
 * pass/fail summary, report narrative, FloTHERM parser.
 *
 * The mockup's "Export Table" link is implemented as a CSV of the ranking table.
 * It is a copy of what is already on screen, not a new analysis and not the
 * report Screen 11 / 12 own.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FilePlus2,
  Maximize,
  Minus,
  Plus,
  Save,
  Target,
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
import { useAnalysisStore } from '@/data/analysisStore';

import { filterOptions } from '@/thermal/analysis/candidateSelector';
import { isAnalysisCurrent } from '@/thermal/analysis/analysisCache';
import {
  CLASSIFICATION_COLOR,
  TARGET_METRIC_LABELS,
} from '@/thermal/analysis/analysisTypes';

import { BottleneckKpiBar } from './BottleneckKpiBar';
import {
  AnalysisControlPanel,
  FilterPanel,
  SensitivitySetup,
} from './AnalysisControlPanel';
import { BottleneckRankingTable } from './BottleneckRankingTable';
import {
  BottleneckGraphOverlay,
  OVERLAY_LEGEND,
  type OverlayHandle,
} from './BottleneckGraphOverlay';
import { ImprovementPreview } from './ImprovementPreview';
import { BottleneckInspector, InspectorEmpty } from './BottleneckInspector';
import {
  AnalysisValidationPanel,
  type ReadinessCheck,
} from './AnalysisValidationPanel';
import { downloadCsv, rankingCsv, timeOf } from './analysisViewModel';
import { T08 } from './tooltips';

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
  active,
  onClick,
  children,
}: {
  label: string;
  zh: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={biTitle(label, zh)}
      aria-label={biTitle(label, zh)}
      aria-pressed={active}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded border text-ink-500 transition-colors ${
        active
          ? 'border-accent-600 bg-accent-100 text-accent-700'
          : 'border-line-strong hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  );
}

// --- screen -----------------------------------------------------------------

export function BottleneckAnalysisView() {
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

  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const solutionSignature = useSolutionStore((s) => s.signature);

  const analyses = useAnalysisStore((s) => s.analyses);
  const analysisKey = useAnalysisStore((s) => s.activeKey);
  const settings = useAnalysisStore((s) => s.settings);
  const running = useAnalysisStore((s) => s.running);
  const progress = useAnalysisStore((s) => s.progress);
  const analysisDirty = useAnalysisStore((s) => s.dirty);
  const proposals = useAnalysisStore((s) => s.proposals);
  const lastError = useAnalysisStore((s) => s.lastError);

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [focusPath, setFocusPath] = useState(true);
  const [showScores, setShowScores] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const overlayRef = useRef<OverlayHandle | null>(null);

  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const analysis = analysisKey ? (analyses[analysisKey] ?? null) : null;
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
    useAnalysisStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  // Each scenario keeps its own baseline solve AND its own analysis.
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
    setSelectedEdgeId(null);
  }, [projectId, activeScenarioId]);

  const solutionStale = useSolutionStore((s) => s.isStale());
  const analysisState = useAnalysisStore((s) => s.state());

  const analysisStale = useMemo(
    () => Boolean(analysis) && !isAnalysisCurrent(analysis, solutionSignature, settings),
    [analysis, solutionSignature, settings],
  );

  const results = analysis?.results ?? [];
  const selected = results.find((entry) => entry.edge_id === selectedEdgeId) ?? null;

  // Selecting the top candidate by default gives the inspector something to
  // show without pretending the engineer chose it.
  useEffect(() => {
    if (!selectedEdgeId && results.length > 0) setSelectedEdgeId(results[0].edge_id);
  }, [results, selectedEdgeId]);

  const options = useMemo(
    () => (network ? filterOptions(network) : { edgeTypes: [], components: [], zones: [], sources: [] }),
    [network],
  );

  const proposalExists = useMemo(
    () =>
      selected != null &&
      proposals.some(
        (entry) =>
          entry.edge_id === selected.edge_id &&
          entry.scenario_id === activeScenarioId &&
          entry.reduction_pct === selected.sensitivity.reduction_pct,
      ),
    [proposals, selected, activeScenarioId],
  );

  // --- actions -------------------------------------------------------------

  const handleSave = () => {
    if (!projectId || readOnly) return;
    if (!useAnalysisStore.getState().current()) {
      toast.warning('Nothing to save — run the analysis first / 尚無結果可儲存');
      return;
    }
    useAnalysisStore.getState().save(projectId);
    toast.success('Analysis saved / 分析結果已儲存');
  };

  const setSaveHandler = useShellActions((s) => s.setSaveHandler);
  useEffect(() => {
    setSaveHandler(handleSave);
    return () => setSaveHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, readOnly, analysisKey]);

  const runAnalysis = async () => {
    if (!projectId || readOnly) return;
    setSelectedEdgeId(null);
    const result = await useAnalysisStore.getState().run(projectId);
    if (!result) {
      const error = useAnalysisStore.getState().lastError;
      if (error) toast.error(error);
      else toast.warning('Analysis cancelled / 分析已中止');
      return;
    }
    useAnalysisStore.getState().save(projectId);

    if (result.state === 'FAILED') {
      toast.error('Analysis could not complete — see Validation / 分析未完成');
    } else if (result.state === 'WARNING') {
      toast.warning(
        `Analyzed ${result.summary.analyzed_edges} edge(s) with warnings / 完成但有警告`,
      );
    } else {
      toast.success(
        `Analyzed ${result.summary.analyzed_edges} edge(s) in ${(result.elapsed_ms / 1000).toFixed(1)} s / 分析完成`,
      );
    }
  };

  const createProposal = () => {
    if (!projectId || readOnly || !selected) return;
    const proposal = useAnalysisStore.getState().createProposal(projectId, selected);
    toast[proposal ? 'success' : 'warning'](
      proposal
        ? 'Improvement proposal saved — no resistance was changed / 已保存改善提案，未修改任何熱阻'
        : 'Could not create the proposal / 無法建立提案',
    );
  };

  const focusEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    overlayRef.current?.center(edgeId);
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
  const baselineValid =
    Boolean(solution) &&
    !solutionStale &&
    solution?.status !== 'FAILED' &&
    solution != null &&
    solution.energy_balance.error_pct <= (network?.solver_settings.energy_error_pct ?? 2);

  // 08 §7 — without a valid Screen 07 solution nothing can be analysed.
  if (!hasTopology || !network || !solution || solutionStale || solution.status === 'FAILED') {
    return (
      <ScreenWorkspace
        title="Bottleneck Analysis"
        titleZh="瓶頸分析"
        description="Rank the thermal paths worth improving by re-solving the whole network with each candidate resistance reduced."
        descriptionZh="逐一降低候選熱阻並重新求解整張網路，找出最值得改善的熱路徑。"
      >
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <Target size={24} className="mx-auto mb-3 text-ink-400" />
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
              {!hasTopology
                ? '找不到熱網路，請先完成 05。'
                : '瓶頸分析需要 07 有效且未失效的求解結果。'}
            </p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() =>
                guardedNavigate(projectPath(projectId, hasTopology ? 'network' : 'thermal-path'))
              }
            >
              {hasTopology ? 'Open 07 Thermal Network / 前往 07' : 'Open 05 Thermal Path Builder / 前往 05'}
            </Button>
          </div>
        </div>
      </ScreenWorkspace>
    );
  }

  const blockingIssues = analysis?.issues.filter((entry) => entry.severity === 'error').length ?? 0;

  const checks: ReadinessCheck[] = [
    {
      label: 'Baseline thermal solution valid.',
      zh: '基準熱解有效。',
      passed: baselineValid,
    },
    {
      label: `Energy balance acceptable (${solution.energy_balance.error_pct.toFixed(2)} %).`,
      zh: '能量平衡在容許範圍內。',
      passed: solution.energy_balance.error_pct <= (network.solver_settings.energy_error_pct ?? 2),
    },
    {
      label: analysis
        ? `${analysis.summary.analyzed_edges} candidate edge(s) found.`
        : 'Candidate edges not yet evaluated.',
      zh: analysis ? '已找到候選連線。' : '尚未評估候選連線。',
      passed: (analysis?.summary.analyzed_edges ?? 0) > 0,
      advisory: !analysis,
    },
    {
      label: analysisStale ? 'Analysis is stale — re-run required.' : 'Analysis matches the current inputs.',
      zh: analysisStale ? '分析已失效，需重新執行。' : '分析與目前輸入一致。',
      passed: Boolean(analysis) && !analysisStale,
      advisory: !analysis,
    },
    {
      label:
        (analysis?.summary.failed_candidates ?? 0) === 0
          ? 'No candidate solve failed.'
          : `${analysis?.summary.failed_candidates} candidate solve(s) failed.`,
      zh:
        (analysis?.summary.failed_candidates ?? 0) === 0
          ? '沒有候選求解失敗。'
          : '有候選求解失敗，該列標示為 FAILED。',
      passed: (analysis?.summary.failed_candidates ?? 0) === 0,
      advisory: true,
    },
  ];

  const continueBlocked = !analysis || analysisStale || analysis.state === 'FAILED';

  return (
    <ScreenWorkspace
      title="Bottleneck Analysis"
      titleZh="瓶頸分析"
      description="Rank the thermal paths worth improving. Each candidate is measured by reducing its resistance and re-solving the complete network, so shared and parallel branches redistribute their heat."
      descriptionZh="找出最值得改善的熱路徑。每個候選都會降低熱阻後重新求解整張網路，共用與並聯分支的熱流會依實際情況重新分配。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          {!readOnly && analysisDirty && <Badge tone="warn">● Unsaved / 未儲存</Badge>}
          <Badge
            tone={
              analysisState === 'COMPLETE'
                ? 'ok'
                : analysisState === 'FAILED'
                  ? 'danger'
                  : analysisState === 'RUNNING'
                    ? 'accent'
                    : 'warn'
            }
          >
            Analysis {analysisState}
          </Badge>
          <Badge tone={solverState === 'SOLVED' ? 'ok' : 'warn'}>Solver {solverState}</Badge>
          {scenario && <Badge tone="neutral">{scenario.name}</Badge>}
        </div>
      }
      metrics={
        <BottleneckKpiBar
          analysis={analysis}
          state={analysisState}
          reductionPct={settings.reduction_pct}
          stale={analysisStale}
        />
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            title={biTitle('Back to 07 Thermal Network', T08.action.back)}
            onClick={() => guardedNavigate(projectPath(projectId, 'network'))}
          >
            Back to Thermal Network
          </Button>

          {/* 08 §29 — the reduction and target metric belong on the status line. */}
          <span className="text-[11px] text-ink-400">
            Reduction {settings.reduction_pct}% · Target{' '}
            {TARGET_METRIC_LABELS[settings.target_metric].label} · Last analyzed{' '}
            {timeOf(analysis?.analyzed_at)}
          </span>

          {blockingIssues > 0 && (
            <span className="text-[12px] font-medium text-danger-600">
              {blockingIssues} blocking issue{blockingIssues > 1 ? 's' : ''} / 有阻擋問題
            </span>
          )}

          <div className="ml-auto flex gap-2">
            <Button
              icon={<Save size={15} />}
              disabled={readOnly || !analysis}
              title={biTitle('Save analysis', T08.action.save)}
              onClick={handleSave}
            >
              Save Analysis
            </Button>
            <Button
              icon={<FilePlus2 size={15} />}
              disabled={readOnly || !selected || selected.sensitivity.solve_status === 'FAILED'}
              title={biTitle('Create improvement proposal', T08.proposal)}
              onClick={createProposal}
            >
              Create Improvement Proposal
            </Button>
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              disabled={continueBlocked}
              title={biTitle('Continue to 09 Temperature Distribution', T08.action.continue)}
              onClick={() => navigate(projectPath(projectId, 'temperature'))}
            >
              Continue to Temperature Distribution
            </Button>
          </div>
        </div>
      }
    >
      {analysisStale && analysis && (
        <div className="flex items-start gap-2 rounded-lg border border-warn-500/40 bg-warn-100 px-3.5 py-2.5">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn-600" />
          <p className="text-[12px] leading-relaxed font-semibold text-warn-600">
            The analysis is stale. The Screen 07 solution or an analysis setting
            changed after the last run. Re-run required.
            <span className="block font-normal text-ink-500">
              分析已失效：07 的解或分析設定在上次執行後被修改，請重新執行分析。
            </span>
          </p>
        </div>
      )}

      {lastError && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-500/40 bg-danger-100 px-3.5 py-2.5">
          <XCircle size={16} className="mt-0.5 shrink-0 text-danger-600" />
          <p className="text-[12px] font-semibold text-danger-600">{lastError}</p>
        </div>
      )}

      {/* Row 1 — controls, ranking + overlay, inspector */}
      <div className="flex min-h-0 flex-col gap-3 lg:flex-row">
        {/* Left column — Analysis Controls / Filters / Sensitivity Setup / Validation */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[20rem]">
          <Section index={1} title="Analysis Controls" zh="分析控制" className="shrink-0">
            <AnalysisControlPanel
              scenario={scenario}
              settings={settings}
              state={analysisState}
              running={running}
              progress={progress}
              readOnly={readOnly}
              canRun={baselineValid}
              hasAnalysis={Boolean(analysis)}
              onSettings={(patch) => useAnalysisStore.getState().setSettings(patch)}
              onRun={runAnalysis}
              onCancel={() => useAnalysisStore.getState().cancel()}
              onReset={() => setConfirmReset(true)}
            />
          </Section>

          <Section index={2} title="Filters / Scope" zh="篩選 / 範圍" className="shrink-0">
            <FilterPanel
              filters={settings.filters}
              options={options}
              disabled={readOnly || running}
              onChange={(patch) =>
                useAnalysisStore
                  .getState()
                  .setSettings({ filters: { ...settings.filters, ...patch } })
              }
            />
          </Section>

          <Section index={3} title="Sensitivity Setup" zh="敏感度設定" className="shrink-0">
            <SensitivitySetup reductionPct={settings.reduction_pct} />
          </Section>

          <Section index={4} title="Analysis Validation" zh="分析驗證" className="shrink-0">
            <AnalysisValidationPanel checks={checks} analysis={analysis} onFocus={focusEdge} />
          </Section>
        </div>

        {/* Center column — ranking, overlay, improvement preview */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Section
            index={5}
            title="Ranked Candidate Table"
            zh="候選排名表"
            className="max-h-[15.5rem] shrink-0"
            bodyClassName="px-3 pb-3"
            actions={
              <>
                <span className="text-[11px] text-ink-400" title={T08.score}>
                  Ranked by composite score, not by Rth
                </span>
                <button
                  type="button"
                  disabled={!analysis || results.length === 0}
                  title={biTitle('Export table as CSV', T08.action.exportTable)}
                  onClick={() =>
                    analysis &&
                    downloadCsv(
                      `bottleneck-${analysis.scenario_id}-${settings.reduction_pct}pct.csv`,
                      rankingCsv(analysis),
                    )
                  }
                  className="flex items-center gap-1 text-[11px] font-bold text-accent-600 hover:underline disabled:text-ink-400 disabled:no-underline"
                >
                  <Download size={12} /> Export Table
                </button>
              </>
            }
          >
            <div className="min-w-0 overflow-x-auto">
              <BottleneckRankingTable
                results={results}
                selectedEdgeId={selectedEdgeId}
                onSelect={focusEdge}
              />
            </div>
            <p className="mt-2 text-[10px] text-ink-400">
              {analysis
                ? `Showing ${results.length} of ${results.length + analysis.rejected.length} edges considered · ${analysis.rejected.length} excluded`
                : 'No analysis has been run for this scenario yet.'}
              <span className="block">{T08.score}</span>
            </p>
          </Section>

          <section className="flex h-[17rem] min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white tabular">
                6
              </span>
              <h2 className="text-[13px] font-bold text-ink-900">
                Thermal Network Highlight{' '}
                <span className="font-semibold text-ink-400">/ 熱網路標示（路徑聚焦）</span>
              </h2>

              <ul className="ml-2 flex flex-wrap items-center gap-2">
                {OVERLAY_LEGEND.map((entry) => (
                  <li
                    key={entry.classification}
                    title={entry.zh}
                    className="flex items-center gap-1 text-[10px] text-ink-500"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: CLASSIFICATION_COLOR[entry.classification] }}
                    />
                    {entry.label}
                  </li>
                ))}
              </ul>

              <span className="ml-auto flex items-center gap-1.5">
                <label
                  title={biTitle('Show score labels', '顯示分數標籤')}
                  className="flex items-center gap-1 text-[11px] font-medium text-ink-500"
                >
                  <input
                    type="checkbox"
                    className="size-3.5 accent-accent-600"
                    checked={showScores}
                    onChange={(event) => setShowScores(event.target.checked)}
                  />
                  Scores
                </label>
                <IconButton
                  label="Focus selected path"
                  zh="聚焦所選路徑"
                  active={focusPath}
                  onClick={() => setFocusPath((value) => !value)}
                >
                  <Target size={13} />
                </IconButton>
                <IconButton label="Zoom out" zh="縮小" onClick={() => overlayRef.current?.zoomBy(-0.15)}>
                  <Minus size={13} />
                </IconButton>
                <IconButton label="Zoom in" zh="放大" onClick={() => overlayRef.current?.zoomBy(0.15)}>
                  <Plus size={13} />
                </IconButton>
                <IconButton label="Fit graph" zh="全覽" onClick={() => overlayRef.current?.fit()}>
                  <Maximize size={13} />
                </IconButton>
              </span>
            </header>

            <div className="relative min-h-0 flex-1">
              <BottleneckGraphOverlay
                ref={overlayRef}
                network={network}
                solution={solution}
                results={analysisStale ? [] : results}
                selectedEdgeId={selectedEdgeId}
                focusPath={focusPath}
                showScores={showScores}
                onSelectEdge={setSelectedEdgeId}
              />
              {results.length === 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <p className="rounded-md border border-line bg-surface/95 px-3 py-1.5 text-[11px] text-ink-500 shadow-sm">
                    Topology from Screen 07. Run the analysis to overlay bottleneck
                    scores. <span className="text-ink-400">/ 執行分析後才會疊加瓶頸分數。</span>
                  </p>
                </div>
              )}
            </div>
          </section>

          <Section
            index={7}
            title={`Improvement Preview (Reduce Selected Edge Rth by ${settings.reduction_pct}%)`}
            zh="改善預覽"
            className="max-h-[14rem] shrink-0"
          >
            <ImprovementPreview
              result={analysisStale ? null : selected}
              targetMetric={settings.target_metric}
              reductionPct={settings.reduction_pct}
              readOnly={readOnly}
              proposalExists={proposalExists}
              onCreateProposal={createProposal}
            />
          </Section>
        </div>

        {/* Right column — inspector */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[24rem]">
          <Section
            index={8}
            title="Selected Candidate Inspector"
            zh="候選檢視"
            className="h-[calc(100vh-21rem)] min-h-[26rem]"
            actions={
              selected && (
                <Badge tone="neutral">
                  #{selected.rank} · {selected.classification}
                </Badge>
              )
            }
          >
            {selected && !analysisStale ? (
              <BottleneckInspector
                result={selected}
                targetMetric={settings.target_metric}
                onFocusEdge={focusEdge}
              />
            ) : (
              <InspectorEmpty />
            )}
          </Section>
        </div>
      </div>

      {confirmReset && (
        <Modal
          title="Reset analysis? / 清除分析結果？"
          description="This clears the bottleneck analysis for the active scenario only. The Screen 07 solution, the topology, the boundary conditions and any saved improvement proposals are kept. / 只會清除目前情境的瓶頸分析，07 的解、拓樸、邊界條件與已儲存的改善提案都會保留。"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>Cancel / 取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmReset(false);
                  useAnalysisStore.getState().reset(projectId);
                  setSelectedEdgeId(null);
                  toast.success('Analysis cleared / 已清除分析結果');
                }}
              >
                Reset Analysis / 清除分析
              </Button>
            </>
          }
        />
      )}
    </ScreenWorkspace>
  );
}
