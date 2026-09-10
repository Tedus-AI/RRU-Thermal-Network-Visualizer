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
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Save,
  Send,
  Settings2,
  TriangleAlert,
} from 'lucide-react';

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
import { useReportStore } from '@/data/reportStore';
import { useDistributionResult } from '@/data/useDistributionResult';
import { currentSourceRevision } from '@/data/sourceRevision';

import { buildResultsOverview } from '@/thermal/overview/overviewAggregator';

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
import { blocksExport, blocksPreview, evaluateSnapshot } from '@/report/snapshotAdapter';
import { paginate, pageOfSection } from '@/report/pagination';
import { previewReadiness, validateReport } from '@/report/reportValidator';
import { buildExportPayload } from '@/report/exportPayloadBuilder';

import { ReportHeaderSummary } from './ReportHeaderSummary';
import { ReportOutlinePanel } from './ReportOutlinePanel';
import { PageSetupWindow } from './PageSetupWindow';
import { PageToolbar, ReportPageView } from './ReportPreviewCanvas';
import { SectionInspectorWindow } from './SectionInspectorWindow';
import { ReportReadinessPanel } from './ReportReadinessPanel';
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
  const storeDirty = useReportStore((s) => s.dirty);
  const lastSavedAt = useReportStore((s) => s.lastSavedAt);

  const [selectedId, setSelectedId] = useState<SectionId>('critical');
  /** Both are opened from something the reader clicked, never open by default. */
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
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
  // Derived from the solution on screen rather than read back from a stored
  // snapshot Screen 09 used to refresh; see `useDistributionResult`.
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

  const go = (path: string) => navigate(projectPath(projectId ?? '', path));

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
      descriptionZh="把 10 的目前快照組成可預覽的熱工程報告，包含章節選擇、順序、封面與版面；本頁不重新計算任何數值，也不產生任何檔案。"
      badge={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={evaluation.state === 'CURRENT' ? 'ok' : evaluation.state === 'WARNING' ? 'warn' : 'danger'}>
            Snapshot {evaluation.state}
          </Badge>
          <Badge tone="neutral">{config.template_name}</Badge>
          <Badge tone="accent">{scenario.name}</Badge>
        </span>
      }
      headerAside={
        <div className="flex justify-end">
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
          {/* --- LEFT: the outline, on a seam ------------------------------ */}
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
              className="h-[36rem] shrink-0"
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
                // 11 §9 — the Pages tab is what opens the inspector now: you
                // click the page you want to argue with, and the section that
                // fills it comes up over the preview.
                onPage={(page) => {
                  setCurrentPage(page);
                  const first = pages.find((entry) => entry.page_number === page)?.section_ids?.[0];
                  if (first) setSelectedId(first);
                  setInspectorOpen(true);
                }}
              />
            </Panel>
          </ResizableSidebar>

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
                onSelectSection={(id) => {
                  setSelectedId(id);
                  setInspectorOpen(true);
                }}
                stale={evaluation.state === 'STALE'}
              />
            </div>
            <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10px] text-ink-400">
              本頁僅為 HTML 預覽與推估分頁，不產生 PDF；實際匯出由 12 負責。
            </p>
          </section>

          {/* --- RIGHT: what is left of the rail --------------------------- */}
          <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[19rem]">
            <Panel title="Report Readiness" zh="報告就緒狀態" explanation={T11.reportReadiness}>
              <ReportReadinessPanel readiness={readiness} validation={validation} />
            </Panel>
          </div>
        </div>

        {/* The inspector floats and closes on Escape: it is opened from a page
            or a section in the preview, read, and dismissed — not a column held
            open beside a preview it is describing. */}
        {inspectorOpen && (
          <SectionInspectorWindow
            sections={sections}
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
      </div>
    </ScreenWorkspace>
  );
}
