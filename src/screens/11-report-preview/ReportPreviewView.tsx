/**
 * Screen 11 — Report Preview.
 * Specification: 11_Report_Preview.md (source of truth, per the delivery audit),
 * laid out after 11.png, whose placement this screen follows closely.
 *
 * The question this screen answers (11 §52): what does the current Screen 10
 * snapshot look like as a thermal engineering report, and is that report ready
 * to hand to Screen 12.
 *
 * What it never does (11 §37, §38, §39): solve, re-solve, run a sensitivity,
 * re-bin a temperature, change Overall Status, generate a PDF/CSV/JSON/PNG/ZIP,
 * choose an export destination, or edit any thermal input. Every number on the
 * page is read from the snapshot; `Prepare for Export` produces metadata only.
 *
 * On the mockup: 11.png and the Markdown agree, so the layout follows the PNG
 * directly — the snapshot strip and six KPI cards across the top, a left rail
 * carrying the template select and the Outline/Pages tabs, the paginated
 * preview with its page toolbar in the centre, the Section Inspector with its
 * Snapshot/Readiness/Validation stack on the right, and the five bottom actions.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, RefreshCw, Save, Send, TriangleAlert } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { useGuardedNavigate } from '@/app/useGuardedNavigate';
import { Badge, Button, Select, Skeleton, TextInput } from '@/ui/primitives';
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
import { useReportStore } from '@/data/reportStore';
import { useDistributionStore } from '@/data/distributionStore';
import { currentSourceRevision } from '@/data/sourceRevision';

import { buildResultsOverview } from '@/thermal/overview/overviewAggregator';

import {
  DEFAULT_ZOOM,
  LANGUAGE_MODES,
  LANGUAGE_MODE_LABELS,
  ORIENTATIONS,
  PAGE_SIZES,
  pageBoxMm,
  type HeaderFooterConfig,
  type LanguageMode,
  type Orientation,
  type PageSize,
  type SectionId,
  type ZoomMode,
} from '@/report/reportTypes';
import { createReportConfig, DEFAULT_TEMPLATE_NAME } from '@/report/defaultTemplate';
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
import { blocksExport, blocksPreview, evaluateSnapshot } from '@/report/snapshotAdapter';
import { paginate, pageOfSection } from '@/report/pagination';
import { previewReadiness, validateReport } from '@/report/reportValidator';
import { buildExportPayload } from '@/report/exportPayloadBuilder';

import { ReportHeaderSummary, SnapshotStrip } from './ReportHeaderSummary';
import { ReportOutlinePanel } from './ReportOutlinePanel';
import { PageToolbar, ReportPageView } from './ReportPreviewCanvas';
import { ReportSectionInspector, SectionNoteEditor } from './ReportSectionInspector';
import {
  ReportReadinessPanel,
  ReportValidationPanel,
  SnapshotStatusPanel,
} from './ReportReadinessPanel';
import type { SectionRenderInput } from './ReportSections';
import { T11 } from './tooltips';

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
        <h2 className="flex min-w-0 items-center gap-1 truncate text-[12.5px] font-bold text-ink-900">
          {title}
          <span className="font-semibold text-ink-400">/ {zh}</span>
        </h2>
        {explanation && <EngineeringInfo zh={explanation} label={title} />}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** 11 §9 — the six header/footer switches, in the specification's order. */
const HEADER_FOOTER_OPTIONS: Array<{
  key: keyof Omit<HeaderFooterConfig, 'footer_text'>;
  label: string;
  zh: string;
}> = [
  { key: 'show_project_name', label: 'Project Name', zh: '專案名稱' },
  { key: 'show_scenario', label: 'Scenario', zh: '情境' },
  { key: 'show_report_title', label: 'Report Title', zh: '報告標題' },
  { key: 'show_page_number', label: 'Page Number', zh: '頁碼' },
  { key: 'show_prepared_date', label: 'Prepared Date', zh: '製作日期' },
  { key: 'show_confidentiality', label: 'Confidentiality', zh: '機密等級' },
];

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

/** 11 §45 — the empty state, in the specification's own words. */
function NoSnapshot({ onGoToOverview }: { onGoToOverview: () => void }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col items-start gap-3 rounded-lg border border-warn-500/40 bg-warn-100 px-5 py-4">
        <p className="flex items-center gap-2 text-[14px] font-bold text-warn-600">
          <TriangleAlert className="size-5" aria-hidden />
          No report snapshot is available. Return to Screen 10 and prepare a report snapshot.
        </p>
        <p className="text-[12px] text-ink-700">
          目前沒有報告快照，請回到 10 Results Overview 準備一份。
        </p>
        <p className="text-[11px] text-ink-500">
          Screen 11 composes a report from the Screen 10 snapshot. It never recalculates a thermal
          result and never invents one in a snapshot's absence.
          <span className="block">
            11 只依 Screen 10 的快照排版報告，本身不重新計算，也不會在沒有快照時憑空產生數值。
          </span>
        </p>
        <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={onGoToOverview}>
          Go to Results Overview / 前往 10 結果總覽
        </Button>
      </div>
    </div>
  );
}

// --- screen -----------------------------------------------------------------

export function ReportPreviewView() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const guardedNavigate = useGuardedNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);

  const network = useNetworkStore((s) => s.network);
  const components = useComponentStore((s) => s.components);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);

  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const analyses = useAnalysisStore((s) => s.analyses);
  const snapshots = useOverviewStore((s) => s.snapshots);

  const configs = useReportStore((s) => s.configs);
  const templates = useReportStore((s) => s.templates);
  const storeDirty = useReportStore((s) => s.dirty);
  const lastSavedAt = useReportStore((s) => s.lastSavedAt);

  const [selectedId, setSelectedId] = useState<SectionId>('critical');
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState<ZoomMode>(DEFAULT_ZOOM);
  const [refreshToken, setRefreshToken] = useState(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasBox, setCanvasBox] = useState({ width: 0, height: 0 });

  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;
  const analysis = solution
    ? (analyses[`${solution.network_id}::${solution.scenario_id}`] ?? null)
    : null;
  const snapshot = activeScenarioId ? (snapshots[activeScenarioId] ?? null) : null;
  const distributionResults = useDistributionStore((s) => s.results);
  const distributionKey = useDistributionStore((s) => s.activeKey);
  const distributionState = useDistributionStore((s) => s.state());
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
    useReportStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  // 11 §45 — never retain the previous scenario's report content.
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
    useDistributionStore.getState().loadFor(projectId, activeScenarioId);
    useOverviewStore.getState().loadFor(projectId, activeScenarioId);
    useReportStore.getState().loadFor(projectId, activeScenarioId);
    setCurrentPage(1);
    setSelectedId('critical');
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
      distribution_result: distribution,
      distribution_stale: distributionState !== 'CURRENT',
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

  const rowCounts = useMemo(
    () => ({
      critical: snapshot?.critical_components.length ?? 0,
      bottleneck: snapshot?.bottlenecks.length ?? 0,
      hot_nodes: Math.min(snapshot?.distribution?.row_count ?? 0, 10),
    }),
    [snapshot],
  );

  const pages = useMemo(() => paginate(sections, rowCounts), [sections, rowCounts]);

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

  // --- zoom -----------------------------------------------------------------
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setCanvasBox({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [config != null]);

  const scale = useMemo(() => {
    if (!config) return 1;
    const box = pageBoxMm(config.page_size, config.orientation);
    // 1 mm ≈ 3.7795 px at 96 dpi; the page is laid out in millimetres so the
    // preview is proportionally what Screen 12 will render.
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

  const go = (path: string) => guardedNavigate(projectPath(projectId ?? '', path));

  // --- gates ----------------------------------------------------------------
  if (projectStatus === 'loading' || (projectId && !draft)) return <LoadingState />;

  if (!snapshot || !scenario || blocksPreview(evaluation.state)) {
    return (
      <ScreenWorkspace
        title="Report Preview"
        titleZh="報告預覽"
        description="Composes the current Screen 10 snapshot into a previewable thermal engineering report."
        descriptionZh="把目前 Screen 10 的快照組成可預覽的熱工程報告；本頁不重新分析，也不匯出檔案。"
        badge={<Badge tone="warn">NO SNAPSHOT</Badge>}
      >
        <NoSnapshot onGoToOverview={() => go('results')} />
      </ScreenWorkspace>
    );
  }

  if (!config || !validation) return <LoadingState />;

  const page = pages.find((entry) => entry.page_number === currentPage) ?? pages[0] ?? null;
  const exportBlocked = blocksExport(evaluation.state) || validation.readiness === 'BLOCKED';

  const update = (next: typeof config) => useReportStore.getState().setConfig(next);

  const renderInput = (section: (typeof sections)[number]): SectionRenderInput | null => {
    if (!snapshot) return null;
    return {
      config,
      section,
      snapshot,
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
      },
      unavailable: evaluation.unavailable_sections.includes(section.id),
    };
  };

  const prepareForExport = () => {
    if (!projectId) return;
    if (exportBlocked) {
      // 11 §3, AC-11-31 — a stale or missing snapshot blocks export preparation.
      toast.error(
        'Export preparation is blocked. Refresh the Screen 10 snapshot and resolve the blocking items first.',
      );
      return;
    }
    const payload = buildExportPayload({
      config,
      snapshot_id: snapshot.id,
      readiness: validation.readiness,
      estimated_page_count: pages.length,
    });
    useReportStore.getState().storePayload(projectId, payload);
    useReportStore.getState().save(projectId);
    toast.success(
      `Export payload prepared for Screen 12 — metadata only, no files generated / 已為 12 準備匯出資料包（僅 metadata）`,
    );
  };

  const continueToExport = () => {
    if (exportBlocked) {
      toast.error('Report Readiness is BLOCKED. Resolve the blocking items before continuing.');
      return;
    }
    if (validation.readiness === 'WARNING') {
      const proceed = window.confirm(
        `Report Readiness is WARNING:\n\n${validation.warnings.map((reason) => `· ${reason}`).join('\n')}\n\nContinue to Screen 12 Export Center anyway?`,
      );
      if (!proceed) return;
    }
    navigate(projectPath(projectId ?? '', 'export'));
  };

  return (
    <ScreenWorkspace
      title="Report Preview"
      titleZh="報告預覽"
      description="Composes the current Screen 10 snapshot into a previewable thermal engineering report: section selection, order, cover, page layout and validation. Nothing is recalculated and no file is generated here."
      descriptionZh="把 Screen 10 的目前快照組成可預覽的熱工程報告，包含章節選擇、順序、封面、版面與驗證；本頁不重新計算任何數值，也不產生任何檔案。"
      badge={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={evaluation.state === 'CURRENT' ? 'ok' : evaluation.state === 'WARNING' ? 'warn' : 'danger'}>
            Snapshot {evaluation.state}
          </Badge>
          <Badge tone="neutral">{config.template_name}</Badge>
          <Badge tone="accent">{scenario.name}</Badge>
          {storeDirty && <Badge tone="warn">Unsaved layout</Badge>}
        </span>
      }
      metrics={
        <div className="flex flex-col gap-2.5">
          <SnapshotStrip summary={evaluation} />
          <ReportHeaderSummary
            snapshotState={evaluation.state}
            overallStatus={snapshot.overall_status}
            readiness={readiness}
            pageCount={pages.length}
            languageMode={config.language_mode}
            pageSize={config.page_size}
            orientation={config.orientation}
          />
        </div>
      }
      actionBar={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button icon={<ArrowLeft className="size-4" />} onClick={() => go('results')}>
            Back to Results Overview
          </Button>
          <Button
            icon={<RefreshCw className="size-4" />}
            onClick={() => {
              if (!projectId) return;
              useSolutionStore.getState().refresh();
              useOverviewStore.getState().loadFor(projectId, activeScenarioId);
              setRefreshToken((token) => token + 1);
              toast.success('Snapshot status refreshed / 已重新檢查快照狀態');
            }}
          >
            Refresh Snapshot Status
          </Button>
          <Button
            icon={<Save className="size-4" />}
            disabled={!storeDirty}
            onClick={() => {
              if (!projectId) return;
              useReportStore.getState().save(projectId);
              toast.success('Report layout saved / 已儲存報告版面');
            }}
          >
            Save Report Layout
          </Button>
          {/* The info button sits BESIDE the action, never inside it: a button
              nested in a button is invalid HTML and swallows the outer click. */}
          <span className="flex items-center gap-1">
            <Button
              icon={<Send className="size-4" />}
              disabled={exportBlocked}
              onClick={prepareForExport}
            >
              Prepare for Export (Metadata Only)
            </Button>
            <EngineeringInfo zh={T11.prepareForExport} label="Prepare for Export" />
          </span>

          <span
            className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11px] text-ink-400 xl:flex"
            title={`${readiness} · ${pages.length} page(s) · ${LANGUAGE_MODE_LABELS[config.language_mode].label} · ${
              lastSavedAt ? `saved ${new Date(lastSavedAt).toLocaleTimeString()}` : 'not saved yet'
            }`}
          >
            {readiness} · {pages.length}p
          </span>

          <Button
            variant="primary"
            trailingIcon={<ArrowRight className="size-4" />}
            disabled={exportBlocked}
            onClick={continueToExport}
          >
            Continue to Export Center
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-6 pb-6">
        {/* 11 §3, AC-11-03 — a stale snapshot is warned about, strongly. */}
        {evaluation.state === 'STALE' && (
          <p className="flex flex-wrap items-center gap-2 rounded-lg border border-danger-500/50 bg-danger-100 px-4 py-2 text-[12px] font-bold text-danger-600">
            <TriangleAlert className="size-4" aria-hidden />
            Report snapshot is stale. Refresh the overview snapshot before final export.
            <span className="font-normal">報告快照已過期，請於正式匯出前重新準備快照。</span>
            <Button
              variant="primary"
              className="!h-7 !px-2 !text-[11px]"
              onClick={() => go('results')}
            >
              Go to Results Overview
            </Button>
          </p>
        )}

        <div className="flex min-h-0 flex-col gap-3 xl:flex-row">
          {/* --- LEFT: template, outline, pages ---------------------------- */}
          <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[18.5rem]">
            <Panel
              title="Report Layout"
              zh="報告版面"
              explanation={T11.sectionOrder}
              className="h-[36rem] shrink-0"
            >
              <ReportOutlinePanel
                templateName={config.template_name}
                templates={Array.from(
                  new Set([DEFAULT_TEMPLATE_NAME, ...templates.map((entry) => entry.name)]),
                )}
                sections={sections}
                pages={pages}
                selectedId={selectedId}
                currentPage={currentPage}
                unavailable={evaluation.unavailable_sections}
                readOnly={false}
                onTemplate={(name) => update(patchConfig(config, { template_name: name }))}
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
                  toast.success('Section layout reset to the default template / 已重設為預設版面');
                }}
                onPage={setCurrentPage}
              />
            </Panel>

            {/* --- page layout (11 §8) --------------------------------- */}
            <Panel title="Page Layout" zh="頁面設定" explanation={T11.pageSize} className="shrink-0">
              <div className="grid gap-2">
                <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                  <label htmlFor="rp-size" className="text-[11px] font-semibold text-ink-700">
                    Page Size
                  </label>
                  <Select
                    id="rp-size"
                    className="h-8 !text-[11px]"
                    value={config.page_size}
                    items={PAGE_SIZES.map((entry) => ({ value: entry, label: entry }))}
                    onChange={(event) =>
                      update(patchConfig(config, { page_size: event.target.value as PageSize }))
                    }
                  />
                </div>
                <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                  <label htmlFor="rp-orient" className="text-[11px] font-semibold text-ink-700">
                    Orientation
                  </label>
                  <Select
                    id="rp-orient"
                    className="h-8 !text-[11px]"
                    value={config.orientation}
                    items={ORIENTATIONS.map((entry) => ({
                      value: entry,
                      label: entry === 'portrait' ? 'Portrait' : 'Landscape',
                    }))}
                    onChange={(event) =>
                      update(
                        patchConfig(config, { orientation: event.target.value as Orientation }),
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                  <label
                    htmlFor="rp-language"
                    className="flex items-center gap-1 text-[11px] font-semibold text-ink-700"
                  >
                    Language
                    <EngineeringInfo zh={T11.languageMode} label="Language Mode" align="left" />
                  </label>
                  <Select
                    id="rp-language"
                    className="h-8 !text-[11px]"
                    value={config.language_mode}
                    items={LANGUAGE_MODES.map((entry) => ({
                      value: entry,
                      label: LANGUAGE_MODE_LABELS[entry].label,
                    }))}
                    onChange={(event) =>
                      update(
                        patchConfig(config, {
                          language_mode: event.target.value as LanguageMode,
                        }),
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                  <label htmlFor="rp-title" className="text-[11px] font-semibold text-ink-700">
                    Title
                  </label>
                  <TextInput
                    id="rp-title"
                    className="h-8 !text-[11px]"
                    value={config.title}
                    invalid={config.title.trim().length === 0}
                    onChange={(event) => update(patchConfig(config, { title: event.target.value }))}
                  />
                </div>
                {/* --- header / footer (11 §9) ------------------------ */}
                <div className="mt-1 flex flex-col gap-1 border-t border-line pt-2">
                  <p className="text-[11px] font-semibold text-ink-700">
                    Header / Footer <span className="font-normal text-ink-400">/ 頁首頁尾</span>
                  </p>
                  {HEADER_FOOTER_OPTIONS.map(({ key, label, zh }) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-2 text-[11px] text-ink-700"
                    >
                      <span className="min-w-0 truncate">
                        {label} <span className="text-[10px] text-ink-400">{zh}</span>
                      </span>
                      <input
                        type="checkbox"
                        className="size-3.5 shrink-0 accent-accent-600"
                        checked={config.header_footer[key]}
                        aria-label={`${label} in header or footer`}
                        onChange={(event) =>
                          update(
                            patchConfig(config, {
                              header_footer: {
                                ...config.header_footer,
                                [key]: event.target.checked,
                              },
                            }),
                          )
                        }
                      />
                    </label>
                  ))}
                  <TextInput
                    className="h-7 !text-[11px]"
                    aria-label="Footer text"
                    value={config.header_footer.footer_text}
                    placeholder="Confidential — Engineering Use Only"
                    onChange={(event) =>
                      update(
                        patchConfig(config, {
                          header_footer: {
                            ...config.header_footer,
                            footer_text: event.target.value,
                          },
                        }),
                      )
                    }
                  />
                </div>

                <span className="flex items-center gap-1">
                  <Button
                    className="!h-7 flex-1 !text-[11px]"
                    onClick={() => {
                      const name = window.prompt(
                        'Template name',
                        `${config.template_name} (custom)`,
                      );
                      if (!name) return;
                      useReportStore.getState().saveAsTemplate(name);
                      toast.success('Template saved — layout only, no project data / 僅保存版面設定');
                    }}
                  >
                    Save As Template
                  </Button>
                  <EngineeringInfo zh={T11.saveAsTemplate} label="Save As Template" />
                </span>
              </div>
            </Panel>
          </div>

          {/* --- CENTRE: paginated preview -------------------------------- */}
          <section className="flex h-[36rem] min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface xl:h-auto">
            <PageToolbar
              page={currentPage}
              pageCount={pages.length}
              zoom={zoom}
              onPage={setCurrentPage}
              onZoom={setZoom}
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
              Estimated pagination · HTML preview only — no PDF is generated on this screen. Actual
              export belongs to Screen 12 Export Center.
              <span className="ml-1">本頁僅為 HTML 預覽，不產生 PDF；實際匯出由 12 負責。</span>
            </p>
          </section>

          {/* --- RIGHT: inspector, snapshot, readiness, validation -------- */}
          <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[21rem]">
            <Panel
              title="Section Inspector"
              zh="章節檢視器"
              className="h-[22rem] shrink-0"
            >
              <ReportSectionInspector
                sections={sections}
                selectedId={selectedId}
                snapshot={evaluation}
                unavailable={evaluation.unavailable_sections}
                readOnly={false}
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
              />
            </Panel>

            <Panel title="Snapshot Status" zh="快照狀態" explanation={T11.snapshotStatus}>
              <SnapshotStatusPanel
                summary={evaluation}
                completeness={snapshot.completeness}
                onRefresh={() => {
                  if (!projectId) return;
                  useSolutionStore.getState().refresh();
                  useOverviewStore.getState().loadFor(projectId, activeScenarioId);
                  setRefreshToken((token) => token + 1);
                  toast.success('Snapshot status refreshed / 已重新檢查快照狀態');
                }}
                onGoToOverview={() => go('results')}
              />
            </Panel>

            <Panel title="Report Readiness" zh="報告就緒狀態" explanation={T11.reportReadiness}>
              <ReportReadinessPanel readiness={readiness} validation={validation} />
            </Panel>

            <Panel title="Validation" zh="驗證狀態">
              <ReportValidationPanel validation={validation} />
            </Panel>

            {/* 11.png pins the note editor to the foot of the right rail so a
                note can be written without leaving the Content tab. */}
            <Panel title="Section Note" zh="章節備註">
              <SectionNoteEditor
                inputId="rp-note-panel"
                section={sections.find((entry) => entry.id === selectedId) ?? sections[0]}
                readOnly={false}
                onNote={(id, note) => update(setSectionNote(config, id, note))}
              />
            </Panel>
          </div>
        </div>
      </div>
    </ScreenWorkspace>
  );
}
