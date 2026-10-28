/**
 * Screen 10 — 報告與匯出 (Report & Export).
 * Specification: 11_Report_Preview.md and 12_Export_Center.md (sources of
 * truth, per the delivery audit); 12 §61 for the merge.
 *
 * The question this screen answers (11 §52, 12 §60): what does the current
 * snapshot look like as a thermal engineering report — and give me the files.
 *
 * It was two screens. 10 previewed the report and wrote an export payload by
 * button; 11 Export Center, a page later, turned that payload into a PDF and
 * sent the reader back to 10 whenever it had moved. Now the outline is on the
 * left, the preview in the middle, the four downloads on the right, and the
 * rest of 11 (artifact list, snapshot matrix, naming, queue, history) is in
 * the 匯出設定 drawer. The payload follows the preview on its own.
 *
 * What it never does (11 §37–§39, 12 §38–§40): solve, re-solve, run a
 * sensitivity, change Overall Status, or edit any thermal input. Every number
 * on the page is read from the snapshot; every file is generated in this
 * browser.
 */

import { powerBasisOf } from '@/domain/powerBasis';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ListTree, RefreshCw, Save, Settings2, TriangleAlert } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { Badge, Button, Skeleton } from '@/ui/primitives';
import { ResizableSidebar } from '@/ui/ResizableSidebar';
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
import { loadSnapshots } from '@/data/persistence';
import { useReportStore } from '@/data/reportStore';
import { useDistributionResult } from '@/data/useDistributionResult';
import { currentSourceRevision } from '@/data/sourceRevision';

import { buildResultsOverview } from '@/thermal/overview/overviewAggregator';
import { reportFigureSource } from '@/report/reportFigureSource';

import {
  DEFAULT_ZOOM,
  LANGUAGE_MODE_LABELS,
  pageBoxMm,
  type SectionId,
  type ZoomMode,
} from '@/report/reportTypes';
import { createReportConfig } from '@/report/defaultTemplate';
import {
  includedSections,
  moveSection,
  orderedSections,
  patchConfig,
  patchContent,
  patchDisplay,
  reorderSection,
  resetSections,
  setSectionNote,
  toggleSection,
} from '@/report/reportConfig';
import {
  blocksPreview,
  evaluateSnapshot,
  snapshotToFreeze,
  withTranslatedActions,
} from '@/report/snapshotAdapter';
import { paginate, pageOfSection } from '@/report/pagination';
import { readMeasuredHeights, settledHeights, type MeasuredHeights } from '@/report/measuredHeights';
import { sectionDefinition } from '@/report/sectionRegistry';
import { previewReadiness, validateReport } from '@/report/reportValidator';
import { buildExportPayload } from '@/report/exportPayloadBuilder';

import { ReportHeaderSummary } from './ReportHeaderSummary';
import { ReportOutlinePanel } from './ReportOutlinePanel';
import { PageSetupWindow } from './PageSetupWindow';
import { PageToolbar, ReportPageView, ReportSection } from './ReportPreviewCanvas';
import { SectionInspectorWindow } from './SectionInspectorWindow';
import { ReportReadinessPanel } from './ReportReadinessPanel';
import type { SectionRenderInput } from './ReportSections';
import { T11 } from './tooltips';
import { useExportController } from '@/screens/12-export-center/useExportController';
import { ExportColumn, type DrawerSection } from '@/screens/12-export-center/ExportColumn';
import { ExportDialogs, ExportDrawer } from '@/screens/12-export-center/ExportDrawer';

// --- building blocks --------------------------------------------------------

function Panel({
  title,
  zh,
  explanation,
  className = '',
  bodyClassName = 'p-3',
  actions,
  children,
}: {
  title: string;
  zh: string;
  explanation?: string;
  className?: string;
  bodyClassName?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-line bg-surface ${className}`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-2.5">
        <h2 className="flex min-w-0 items-center gap-1 truncate text-[13px] font-bold text-ink-900" title={title}>
          {zh}
        </h2>
        {explanation && <EngineeringInfo zh={explanation} label={title} />}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** 11 §9 — the six header/footer switches, in the specification's order. */

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8" />
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-[17rem_1fr_20rem] gap-3">
        <Skeleton className="h-[32rem]" />
        <Skeleton className="h-[32rem]" />
        <Skeleton className="h-[32rem]" />
      </div>
    </div>
  );
}

/**
 * 11 §45 — nothing to report yet.
 *
 * 10 freezes the snapshot itself when the scenario has none (`snapshotToFreeze`),
 * so this is only reached when 07 has no usable result: not solved, solved
 * against inputs that have since changed, or failed.
 */
function NoSnapshot({ onSolve }: { onSolve: () => void }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col items-start gap-3 rounded-lg border border-warn-500/40 bg-warn-100 px-5 py-4">
        <p className="flex items-center gap-2 text-[14px] font-bold text-warn-600">
          <TriangleAlert className="size-5" aria-hidden />
          還沒有可以出報告的結果
        </p>
        <p className="text-[12px] text-ink-700">
          07 還沒有這個情境可用的求解結果（沒求解、求解後輸入又改過，或求解失敗）。到 07 求解後回來，
          報告會自動用目前的結果建立。
        </p>
        <p className="text-[11px] text-ink-500">
          報告只排版已經求出的結果，本身不重新計算，沒有結果時也不會用估算值代替。
        </p>
        <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={onSolve}>
          前往 07 求解與結果
        </Button>
      </div>
    </div>
  );
}

/** How far the report has got, in the words of the action bar. */
const READINESS_ZH: Record<string, string> = {
  EXPORT_READY: '可以匯出',
  PREVIEW_READY: '可以預覽',
  WARNING: '有警告',
  BLOCKED: '不能匯出',
};

// --- screen -----------------------------------------------------------------

export function ReportPreviewView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);

  const network = useNetworkStore((s) => s.network);
  const components = useComponentStore((s) => s.components);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);

  const solutions = useSolutionStore((s) => s.solutions);
  /** The solve input Screen 08 reasons about, so the levers match its numbers. */
  const solveInput = useSolutionStore((s) => s.input);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const analyses = useAnalysisStore((s) => s.analyses);
  /** Screen 08's saved studies and Screen 06's ports, for the network figures. */
  const studies = useAnalysisStore((s) => s.proposals);
  const boundarySet = useBoundaryStore((s) => s.current());
  const boundaryPorts = useBoundaryStore((s) => s.ports);
  const snapshots = useOverviewStore((s) => s.snapshots);

  const configs = useReportStore((s) => s.configs);
  const storeDirty = useReportStore((s) => s.dirty);
  const lastSavedAt = useReportStore((s) => s.lastSavedAt);

  const [selectedId, setSelectedId] = useState<SectionId>('critical');
  /**
   * The 匯出設定 drawer, and which section a link asked for. `/export` (the old
   * 11 Export Center) lands here with `?panel=export` and opens it on the
   * artifact list, which is where 11 started.
   */
  const [searchParams] = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerSection | null>(() =>
    searchParams.get('panel') === 'export' ? 'items' : null,
  );
  /** Both are opened from something the reader clicked, never open by default. */
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  // Escape leaves fullscreen. Captured, so it never also reaches a window that
  // happens to be open behind the preview — the reader pressed it to get their
  // screen back, not to lose the inspector they had set up.
  useEffect(() => {
    if (!previewFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setPreviewFullscreen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [previewFullscreen]);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState<ZoomMode>(DEFAULT_ZOOM);
  const [refreshToken, setRefreshToken] = useState(0);
  /**
   * Which project and scenario this screen has loaded its stores for. The
   * snapshot is frozen only after that: the first render still reads what the
   * previous screen left in the stores, and a snapshot frozen from it is stale
   * the moment the reload lands.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasBox, setCanvasBox] = useState({ width: 0, height: 0 });

  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;
  const analysis = solution
    ? (analyses[`${solution.network_id}::${solution.scenario_id}`] ?? null)
    : null;
  const snapshot = activeScenarioId ? (snapshots[activeScenarioId] ?? null) : null;
  // Derived from the solution on screen rather than read back from a stored
  // snapshot Temperature Distribution used to refresh; see `useDistributionResult`.
  const { distribution, state: distributionState } = useDistributionResult();

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
    useReportStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  // 11 §45 — never retain the previous scenario's report content.
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
    useOverviewStore.getState().loadFor(projectId, activeScenarioId);
    useReportStore.getState().loadFor(projectId, activeScenarioId);
    setCurrentPage(1);
    setSelectedId('critical');
    setLoadedKey(`${projectId}|${activeScenarioId ?? ''}`);
  }, [projectId, activeScenarioId]);

  const stale = useSolutionStore((s) => s.isStale());
  const solverState = useSolverStore((s) => s.state);

  // --- the live overview, for the freshness comparison only (11 §3) --------
  const liveOverview = useMemo(() => {
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
    }).overview;
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

  const evaluation = useMemo(
    () => evaluateSnapshot(snapshot, liveOverview, scenario?.name ?? ''),
    [snapshot, liveOverview, scenario],
  );

  /**
   * The snapshot is 10's to freeze now (07 §59). When this scenario has none,
   * the report opens on the current results; an existing one is only moved by
   * 更新為目前結果. What is on DISK decides "has none" — the overview store
   * loads in an effect, and reading it here could overwrite a frozen snapshot
   * that simply had not arrived yet.
   */
  const freezeSnapshot = (asked: boolean) => {
    if (!projectId || !activeScenarioId) return null;
    const stored = loadSnapshots(projectId).find((entry) => entry.scenario_id === activeScenarioId) ?? null;
    const toFreeze = snapshotToFreeze({ stored, live: liveOverview, asked });
    if (!toFreeze) {
      if (stored && !asked) useOverviewStore.getState().loadFor(projectId, activeScenarioId);
      return null;
    }
    return useOverviewStore.getState().prepare(projectId, toFreeze, draft?.project_context.owner || undefined);
  };
  const storesLoaded = loadedKey === `${projectId}|${activeScenarioId ?? ''}`;
  useEffect(() => {
    if (!storesLoaded || snapshot || !liveOverview) return;
    freezeSnapshot(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesLoaded, snapshot, liveOverview, projectId, activeScenarioId]);

  /**
   * The snapshot the report draws from, with the Chinese action lines restored
   * if it was frozen before it carried any. See `withTranslatedActions` — the
   * sentences are still the frozen ones; only their translation is recovered,
   * and only when the English text is identical.
   */
  const reportSnapshot = useMemo(
    () => (snapshot ? withTranslatedActions(snapshot) : null),
    [snapshot],
  );

  // --- the config -----------------------------------------------------------
  const config = activeScenarioId ? (configs[activeScenarioId] ?? null) : null;

  useEffect(() => {
    if (!projectId || !activeScenarioId || !scenario || !snapshot) return;
    if (configs[activeScenarioId]) return;
    // First visit for this scenario: start from the default template (11 §5).
    useReportStore.getState().setConfig(
      createReportConfig({
        project_id: projectId,
        project_name: draft?.project_name ?? projectId,
        scenario_id: activeScenarioId,
        scenario_name: scenario.name,
        snapshot_id: snapshot.id,
        prepared_by: draft?.project_context.owner || undefined,
      }),
    );
  }, [projectId, activeScenarioId, scenario, snapshot, configs, draft]);

  const sections = useMemo(() => (config ? orderedSections(config) : []), [config]);
  const included = useMemo(() => (config ? includedSections(config) : []), [config]);

  /**
   * The pictures the Thermal Network Summary carries, and what Screen 08 says
   * could be done about each part that needs attention.
   *
   * Derived by the shared helper rather than here, because the export
   * renders these same sections and has to arrive at the same answer — when it
   * had none of its own the PDF printed "Not Available" over two sections the
   * preview had just drawn in full.
   */
  const source = useMemo(
    () =>
      reportFigureSource({
        solve_network: solveInput?.network ?? null,
        stored_network: network,
        components,
        solution,
        stale,
        scenario_id: activeScenarioId,
        studies,
        boundary_ports: boundaryPorts,
        boundary_set: boundarySet,
      }),
    [
      solveInput,
      network,
      components,
      solution,
      stale,
      activeScenarioId,
      studies,
      boundaryPorts,
      boundarySet,
    ],
  );
  const networkContext = source.context;
  const figures = source.figures;

  const rowCounts = useMemo(
    () => ({
      critical: snapshot?.critical_components.length ?? 0,
      network_figures: figures.filter((figure) => !figure.part).length,
      bottleneck_figures: figures.filter((figure) => Boolean(figure.part)).length,
      actions: snapshot?.action_summary.length ?? 0,
    }),
    [snapshot, figures],
  );

  /**
   * What each section really occupies, read back off an offscreen copy.
   *
   * The registry's constants are guesses that have to be generous — the page
   * box clips, so an underestimate loses content — and a generous guess breaks
   * the page early and leaves its foot blank, which is exactly what the report
   * was doing on every page. See `measuredHeights`.
   */
  const [measured, setMeasured] = useState<MeasuredHeights>({});
  const measureRef = useRef<HTMLDivElement>(null);

  const pages = useMemo(
    () => paginate(sections, rowCounts, measured),
    [sections, rowCounts, measured],
  );

  /**
   * Re-measure whenever the offscreen copy changes shape.
   *
   * A figure arrives asynchronously — the graph is laid out and rasterized
   * before it has a height — so a one-shot measurement after the first paint
   * would record every figure as its placeholder. The observer catches each one
   * as it lands, and the equality check below stops the state update that
   * follows from measuring the same thing again.
   */
  useEffect(() => {
    const host = measureRef.current;
    if (!host) return;

    const measure = () => {
      // The live page's own body box, unscaled: `offsetHeight` ignores the
      // preview's zoom transform, which `getBoundingClientRect` would fold in
      // and make every measurement a function of the zoom level.
      const body = document.querySelector<HTMLElement>('[data-report-page] [data-report-body]');
      if (!body || body.offsetHeight <= 0) return;
      host.style.width = `${body.offsetWidth}px`;

      const gap = Number.parseFloat(getComputedStyle(body).rowGap) || 0;
      const next = readMeasuredHeights(host, body.offsetHeight, gap);
      setMeasured((current) => (sameHeights(current, next) ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    for (const child of host.querySelectorAll('[data-measure-section]')) observer.observe(child);
    return () => observer.disconnect();
    // Deliberately no dependency array: the offscreen copy changes shape for
    // more reasons than this component can list — a section ticked, a row
    // limit, a language, a figure finishing — and re-measuring is cheap next
    // to getting the page count wrong. `sameHeights` above is what stops it
    // looping: an unchanged measurement sets no state, so the render settles.
  });

  const validation = useMemo(() => {
    if (!config) return null;
    return validateReport({
      config,
      evaluation,
      project_name: draft?.project_name ?? '',
      project_id: projectId ?? '',
      scenario_name: scenario?.name ?? '',
    });
  }, [config, evaluation, draft, projectId, scenario]);

  const readiness = validation ? previewReadiness(validation, evaluation.state) : 'BLOCKED';

  /**
   * The export payload follows the preview (12 §61).
   *
   * It used to be written by "Prepare for Export (Metadata Only)", and the PDF
   * on 11 was drawn from whatever that button last froze — a layout change
   * made after it was pressed never reached the file. It is written now
   * whenever what it records changes: the layout, the snapshot, the readiness,
   * the page count and the measured section heights (less any section whose
   * figures are still loading; see `settledHeights`).
   */
  const payloadKey = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !config || !snapshot || !validation) return;
    const heights = measureRef.current ? settledHeights(measureRef.current, measured) : measured;
    const key = JSON.stringify([config, snapshot.id, validation.readiness, pages.length, heights]);
    if (payloadKey.current === key) return;
    payloadKey.current = key;
    useReportStore.getState().storePayload(
      projectId,
      buildExportPayload({
        config,
        snapshot_id: snapshot.id,
        readiness: validation.readiness,
        estimated_page_count: pages.length,
        measured_heights: heights,
      }),
    );
  }, [projectId, config, snapshot, validation, pages.length, measured]);

  /** The four downloads and the drawer behind them; see `useExportController`. */
  const exporter = useExportController({
    projectId,
    scenario,
    snapshot,
    evaluation,
    figureSource: source,
  });

  // --- zoom -----------------------------------------------------------------
  // The canvas element exists only once there is a config to render.
  const hasConfig = config != null;
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setCanvasBox({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasConfig]);

  const scale = useMemo(() => {
    if (!config) return 1;
    const box = pageBoxMm(config.page_size, config.orientation);
    // 1 mm ≈ 3.7795 px at 96 dpi; the page is laid out in millimetres so the
    // preview is proportionally what the export will render.
    const pxPerMm = 3.7795275591;
    const pageWidth = box.width * pxPerMm;
    const pageHeight = box.height * pxPerMm;

    if (zoom === 'fit_width') {
      if (canvasBox.width === 0) return 0.8;
      return Math.min((canvasBox.width - 48) / pageWidth, 1.4);
    }
    if (zoom === 'fit_page') {
      if (canvasBox.width === 0 || canvasBox.height === 0) return 0.6;
      return Math.min(
        (canvasBox.width - 48) / pageWidth,
        (canvasBox.height - 48) / pageHeight,
        1.4,
      );
    }
    return Number(zoom) / 100;
  }, [zoom, canvasBox, config]);

  const go = (path: string) => navigate(projectPath(projectId ?? '', path));

  // --- gates ----------------------------------------------------------------
  //
  // EVERY hook belongs above this line. A `useMemo` added below one of these
  // returns runs on some renders and not others, which React reports as
  // "rendered more hooks than during the previous render" and the screen shows
  // as a crash card.
  if (projectStatus === 'loading' || (projectId && !draft)) return <LoadingState />;

  // About to freeze one (the effect above): a frame of loading, not of
  // "nothing to report".
  if (!snapshot && (!storesLoaded || (liveOverview && liveOverview.report_readiness !== 'BLOCKED'))) {
    return <LoadingState />;
  }

  if (!snapshot || !scenario || blocksPreview(evaluation.state)) {
    return (
      <ScreenWorkspace
        title="Report & Export"
        titleZh="報告與匯出"
        descriptionZh="把求解結果組成熱工程報告，預覽後直接下載 PDF、HTML、圖表 PNG 或工程封裝 ZIP。"
        badge={<Badge tone="warn">還沒有結果</Badge>}
      >
        <NoSnapshot onSolve={() => go('network')} />
      </ScreenWorkspace>
    );
  }

  if (!config || !validation) return <LoadingState />;

  const page = pages.find((entry) => entry.page_number === currentPage) ?? pages[0] ?? null;

  /**
   * Every other screen in this tool writes as you work — the header says "Saved
   * to JSON" and means it. Screen 10 alone kept the layout in memory until
   * someone found the Save Report Layout button, so a session's worth of
   * section choices and page settings vanished on reload. It saves on change
   * now; the button stays for an explicit save and to show the timestamp.
   */
  const update = (next: typeof config) => {
    useReportStore.getState().setConfig(next);
    if (projectId) useReportStore.getState().save(projectId);
  };

  const renderInput = (section: (typeof sections)[number]): SectionRenderInput | null => {
    if (!reportSnapshot) return null;
    return {
      config,
      section,
      snapshot: reportSnapshot,
      project: {
        name: draft?.project_name ?? projectId ?? '',
        id: projectId ?? '',
        stage: draft?.project_context.project_stage,
        customer: draft?.project_context.customer,
      },
      scenario: {
        name: scenario.name,
        ambient_C: scenario.ambient_C,
        wind_mps: scenario.wind_mps,
        solar_W_m2: scenario.solar_W_m2,
        power_scale: scenario.power_scale,
        power_basis: powerBasisOf(scenario),
      },
      unavailable: evaluation.unavailable_sections.includes(section.id),
      network_context: networkContext,
      network_figures: figures,
      // Overridden per page by `ReportPageView`, which knows which slice of a
      // multi-page section the page it is drawing carries.
      from: 0,
      to: Number.POSITIVE_INFINITY,
      part: 0,
      parts: 1,
    };
  };

  return (
    <ScreenWorkspace
      title="Report & Export"
      titleZh="報告與匯出"
      badge={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={evaluation.state === 'CURRENT' ? 'ok' : 'warn'}>
            {evaluation.state === 'CURRENT'
              ? '報告是目前結果'
              : evaluation.state === 'WARNING'
                ? '報告就緒・有警告'
                : '報告用的是舊結果'}
          </Badge>
          <Badge tone="neutral">{config.template_name}</Badge>
          <Badge tone="accent">{scenario.name}</Badge>
        </span>
      }
      headerAside={
        <div className="flex flex-wrap justify-end gap-2">
          {/* Opened deliberately rather than by clicking a page. A window that
              appears because you looked at page 3 is a window you did not ask
              for, and it lands over the page you were looking at. */}
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-candy-green-line bg-candy-green-400 px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-candy-green-300"
          >
            <ListTree className="size-4 shrink-0 text-ink-900" aria-hidden />
            <span className="text-[13px] font-bold text-ink-900">章節檢視器</span>
            <span className="text-[11px] font-medium text-ink-700">
              {sectionDefinition(selectedId).zh}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPageSetupOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-candy-blue-line bg-candy-blue-400 px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-candy-blue-300"
          >
            <Settings2 className="size-4 shrink-0 text-ink-900" aria-hidden />
            <span className="text-[13px] font-bold text-ink-900">頁面設定</span>
            <span className="text-[11px] font-medium text-ink-700">
              A4 · {config.orientation === 'portrait' ? '直式' : '橫式'} ·{' '}
              {LANGUAGE_MODE_LABELS[config.language_mode].label}
            </span>
          </button>
        </div>
      }
      metrics={
        <ReportHeaderSummary
          snapshotState={evaluation.state}
          summary={evaluation}
          overallStatus={snapshot.overall_status}
          readiness={readiness}
          pageCount={pages.length}
        />
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button icon={<ArrowLeft className="size-4" />} onClick={() => go('network')}>
            返回 07 求解與結果
          </Button>
          <Button
            icon={<RefreshCw className="size-4" />}
            title="重新讀取求解結果與報告快照，檢查報告是不是目前的結果"
            onClick={() => {
              if (!projectId) return;
              useSolutionStore.getState().refresh();
              useOverviewStore.getState().loadFor(projectId, activeScenarioId);
              setRefreshToken((token) => token + 1);
              toast.success('已重新檢查報告快照');
            }}
          >
            重新檢查
          </Button>
          <Button
            icon={<Save className="size-4" />}
            disabled={!storeDirty}
            title="版面改了就會自動儲存；這顆是手動再存一次"
            onClick={() => {
              if (!projectId) return;
              useReportStore.getState().save(projectId);
              toast.success('已儲存報告版面');
            }}
          >
            儲存版面
          </Button>

          <span
            className="ml-auto shrink-0 text-[11px] text-ink-400"
            title={`${LANGUAGE_MODE_LABELS[config.language_mode].label} · ${
              lastSavedAt ? `版面儲存於 ${new Date(lastSavedAt).toLocaleTimeString()}` : '版面還沒儲存'
            }`}
          >
            {READINESS_ZH[readiness] ?? readiness}・{pages.length} 頁
          </span>

          <Button
            variant="primary"
            trailingIcon={<ArrowRight className="size-4" />}
            onClick={() => setDrawer('items')}
          >
            匯出設定
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-6 pb-6">
        {/* 11 §3, AC-11-03 — a stale snapshot is warned about, strongly. */}
        {/* Updated here rather than on another screen (07 §59): the report is
            what the snapshot says, and moving it is one button, not a trip. */}
        {evaluation.state === 'STALE' && (
          <p className="flex flex-wrap items-center gap-2 rounded-lg border border-warn-500/50 bg-warn-100 px-4 py-2 text-[12px] font-bold text-warn-600">
            <TriangleAlert className="size-4" aria-hidden />
            報告用的是舊結果：07 的結果在快照之後改過。
            <span className="font-normal text-ink-700">
              {liveOverview && liveOverview.report_readiness !== 'BLOCKED'
                ? '按右邊更新，報告就換成目前的結果。'
                : '目前的結果還不能用（已失效或求解失敗），請先到 07 重新求解。'}
            </span>
            {liveOverview && liveOverview.report_readiness !== 'BLOCKED' ? (
              <Button
                variant="primary"
                className="!h-7 !px-2 !text-[11px]"
                onClick={() => {
                  if (freezeSnapshot(true)) toast.success('報告已更新為目前的結果');
                }}
              >
                更新為目前結果
              </Button>
            ) : (
              <Button className="!h-7 !px-2 !text-[11px]" onClick={() => go('network')}>
                前往 07 重新求解
              </Button>
            )}
          </p>
        )}

        <div className="flex min-h-0 flex-col gap-3 xl:flex-row">
          {/* --- LEFT: the outline and the readiness, on one seam ---------- */}
          <ResizableSidebar
            id="tnv.11.outline"
            defaultWidth={296}
            side="left"
            labelEn="Report Layout"
            labelZh="報告版面"
            shortEn="LAY"
            shortZh="版面"
          >
            <Panel
              title="Report Layout"
              zh="報告版面"
              explanation={T11.sectionOrder}
              className="h-[32rem] shrink-0"
            >
              <ReportOutlinePanel
                sections={sections}
                pages={pages}
                selectedId={selectedId}
                currentPage={currentPage}
                unavailable={evaluation.unavailable_sections}
                readOnly={false}
                onSelect={(id) => {
                  setSelectedId(id);
                  const target = pageOfSection(pages, id);
                  if (target) setCurrentPage(target);
                }}
                onToggle={(id) => {
                  const result = toggleSection(config, id);
                  if (result.refused) {
                    toast.error(result.refused);
                    return;
                  }
                  update(result.config);
                }}
                onMove={(id, direction) => update(moveSection(config, id, direction))}
                onDrop={(id, index) => update(reorderSection(config, id, index))}
                onReset={() => {
                  update(resetSections(config));
                  toast.success('已重設為預設版面');
                }}
                // Selects, and turns the preview to that page. Opening the
                // inspector is the header button's job.
                onPage={(page) => {
                  setCurrentPage(page);
                  const first = pages.find((entry) => entry.page_number === page)?.section_ids?.[0];
                  if (first) setSelectedId(first);
                }}
              />
            </Panel>

            {/* Under the outline rather than in a rail of its own. It is a
                short verdict with a handful of reasons, and a column held open
                for it cost the preview 19 rem of the width the preview exists
                to use. Collapsing the seam now puts BOTH away. */}
            <Panel
              title="Report Readiness"
              zh="報告就緒狀態"
              explanation={T11.reportReadiness}
              className="shrink-0"
            >
              <ReportReadinessPanel readiness={readiness} validation={validation} />
            </Panel>
          </ResizableSidebar>

          {/* --- RIGHT: the preview, with the whole of the rest ------------ */}
          <section
            className={
              previewFullscreen
                ? 'fixed inset-0 z-40 flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface'
                : 'flex h-[36rem] min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface xl:h-auto'
            }
          >
            <PageToolbar
              page={currentPage}
              pageCount={pages.length}
              zoom={zoom}
              fullscreen={previewFullscreen}
              onPage={setCurrentPage}
              onZoom={setZoom}
              onToggleFullscreen={() => setPreviewFullscreen((open) => !open)}
            />
            <div ref={canvasRef} className="min-h-0 flex-1 overflow-auto bg-surface-muted">
              <ReportPageView
                config={config}
                page={page}
                sections={included}
                renderInput={renderInput}
                scale={scale}
                selectedId={selectedId}
                onSelectSection={setSelectedId}
                stale={evaluation.state === 'STALE'}
              />
            </div>
            <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10px] text-ink-400">
              匯出的 PDF 與這裡的分頁相同；下載在右邊。
            </p>
          </section>

          {/* --- the downloads, beside what they will contain (12 §61) ---- */}
          <div className="flex w-full shrink-0 flex-col xl:w-[15.5rem]">
            <ExportColumn controller={exporter} onOpenDrawer={setDrawer} />
          </div>
        </div>

        {drawer && (
          <ExportDrawer controller={exporter} focus={drawer} onClose={() => setDrawer(null)} />
        )}
        <ExportDialogs controller={exporter} />

        {/* The inspector floats, fits its content and closes on Escape: it is
            opened from the header, read, and dismissed — not a column held open
            beside a preview it is describing. */}
        {inspectorOpen && (
          <SectionInspectorWindow
            sections={sections}
            pages={pages}
            selectedId={selectedId}
            snapshot={evaluation}
            unavailable={evaluation.unavailable_sections}
            cover={{
              title: config.title,
              subtitle: config.subtitle,
              config: config.cover,
              project_name: draft?.project_name ?? projectId ?? '',
              project_id: projectId ?? '',
              scenario_name: scenario.name,
            }}
            onSelect={setSelectedId}
            onContent={(id, patch) => update(patchContent(config, id, patch))}
            onDisplay={(id, patch) => update(patchDisplay(config, id, patch))}
            onNote={(id, note) => update(setSectionNote(config, id, note))}
            onCover={(patch) =>
              update(
                patchConfig(config, {
                  ...(patch.title !== undefined ? { title: patch.title } : {}),
                  ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}),
                  ...(patch.cover ? { cover: { ...config.cover, ...patch.cover } } : {}),
                }),
              )
            }
            onClose={() => setInspectorOpen(false)}
          />
        )}

        {pageSetupOpen && (
          <PageSetupWindow
            config={config}
            onChange={(patch) => update(patchConfig(config, patch))}
            onSaveTemplate={() => {
              const name = window.prompt('Template name', `${config.template_name} (custom)`);
              if (!name) return;
              useReportStore.getState().saveAsTemplate(name);
              toast.success('已儲存模板（僅版面設定）');
            }}
            onClose={() => setPageSetupOpen(false)}
          />
        )}

        {/* --- the offscreen copy the paginator measures ------------------ *
         * Every included section, rendered whole at the page's own content
         * width, out of the flow and out of the accessibility tree. Its width
         * is set from the live page in the effect above, so a line wraps here
         * exactly where it wraps there. `visibility: hidden` rather than
         * `display: none`, which would give every element a height of zero. */}
        <div
          ref={measureRef}
          aria-hidden
          data-report-measure
          className="pointer-events-none invisible absolute top-0 left-[-200vw] flex flex-col gap-3"
        >
          {included.map((section, index) => {
            const base = renderInput(section);
            if (!base) return null;
            return (
              <div key={section.id} data-measure-section={section.id}>
                <ReportSection
                  section={section}
                  input={{ ...base, measuring: true }}
                  index={index + 1}
                  mode={config.language_mode}
                />
              </div>
            );
          })}
        </div>
      </div>
    </ScreenWorkspace>
  );
}

/**
 * Whether two measurements are the same to within a pixel or so of a page.
 *
 * Without a tolerance the ResizeObserver's own sub-pixel jitter would keep
 * producing a "new" measurement, which would re-paginate, which would re-render
 * the offscreen copy, which would measure again.
 */
const HEIGHT_EPSILON = 0.001;

function sameHeights(a: MeasuredHeights, b: MeasuredHeights): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const left = a[id as SectionId];
    const right = b[id as SectionId];
    if (!left || !right) return false;
    if (Math.abs(left.base - right.base) > HEIGHT_EPSILON) return false;
    if (left.items.length !== right.items.length) return false;
    for (let index = 0; index < left.items.length; index += 1) {
      if (Math.abs(left.items[index] - right.items[index]) > HEIGHT_EPSILON) return false;
    }
  }
  return true;
}
