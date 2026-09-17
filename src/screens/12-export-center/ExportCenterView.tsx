/**
 * Screen 11 — Export Center.
 * Specification: 12_Export_Center.md (source of truth, per the delivery audit),
 * laid out after 12.png where the two agree.
 *
 * The question this screen answers (12 §60): take the results 07–11 already
 * produced and turn them into real files — PDF, CSV, JSON, PNG and a ZIP
 * engineering package — with a manifest that says exactly where each number came
 * from.
 *
 * What it never does (12 §38, §39, §40 of the acceptance list): solve, re-solve,
 * run a sensitivity, re-bin a temperature, edit a thermal input, or change the
 * report layout. Every file is generated locally in this browser and nothing is
 * uploaded (§35).
 *
 * On the mockup: 12.png is the product's generic master mockup rather than a
 * Screen 11 delivery — it shows report LAYOUT controls (paper size, orientation,
 * cover page, header/footer) which §25 and AC-12-38 explicitly forbid here. So
 * its SHAPE is followed — numbered sections, the artifact table with
 * Format/Description/Prerequisite/Status/Select, Select All / Clear All, the
 * export actions block and the history table — and it is filled with what the
 * specification actually requires. The forbidden layout controls stay in Screen
 * 11 where they belong, and the PDF row states that it uses the Screen 10 layout.
 *
 * What this screen has SHED, round by round, is every surface that said again
 * what another one already said: the package presets, the source-readiness
 * table, the standing validation panel and the filename preview list. A
 * filename is decided by the naming settings a few centimetres above it and
 * printed in the queue the moment it exists; a blocking reason belongs on the
 * row it blocks and in the toast that refuses the run. Three places for one
 * fact is how the three drift apart.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCheck,
  Download,
  FileCheck2,
  Flag,
  Package,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { Badge, Button, Modal, Skeleton } from '@/ui/primitives';
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
import { useExportStore, type QueueEntry } from '@/data/exportStore';
import { useDistributionResult } from '@/data/useDistributionResult';
import { currentSourceRevision } from '@/data/sourceRevision';

import { buildResultsOverview } from '@/thermal/overview/overviewAggregator';
import { evaluateSnapshot, withTranslatedActions } from '@/report/snapshotAdapter';
import { reportFigureSource } from '@/report/reportFigureSource';
import {
  reconcileSnapshotSelection,
  snapshotCount,
  snapshotSubjects,
} from '@/export/snapshotSelection';

import {
  ARTIFACT_DEFINITIONS,
  isExportable,
  type ExportHistoryEntry,
} from '@/export/exportTypes';
import {
  evaluateAllArtifacts,
  globalStatus,
  requiresConfirmation,
  validateExport,
  type ReadinessInput,
} from '@/export/exportValidator';
import { createExportSession } from '@/export/exportSession';
import { runExport } from '@/export/exportRunner';
import { buildPackage } from '@/export/packageBuilder';
import { filenameFor, defaultBaseFilename } from '@/export/filenameBuilder';
import { deliver, pickDirectory, supportsFolderPicker, triggerDownload } from '@/export/download';
import { sha256Hex } from '@/export/checksum';
import type { ReportRenderInput } from '@/export/reportRenderer';
import { resultRevisionMatches } from '@/domain/revision';

import { ArtifactSelectionPanel } from './ArtifactSelectionPanel';
import { SnapshotMatrixPanel } from './SnapshotMatrixPanel';
import { ExportConfigurationPanel } from './ExportConfigurationPanel';
import {
  ExportProgress,
  ExportQueue,
  ExportResultPanel,
} from './ExportQueue';
import { ExportHistoryPanel, LocalExportNotice } from './ExportHistoryPanel';
import { ExportKpiBar } from './ExportKpiBar';
import { T12 } from './tooltips';

// --- building blocks --------------------------------------------------------

function Panel({
  index,
  title,
  zh,
  explanation,
  className = '',
  bodyClassName = 'p-3',
  actions,
  children,
}: {
  /** 12.png numbers its sections; the numbering is kept so the two line up. */
  index?: number;
  title: string;
  zh: string;
  explanation?: string;
  className?: string;
  bodyClassName?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-lg border border-line bg-surface ${className}`}>
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-2.5">
        <h2 className="flex min-w-0 items-center gap-1 truncate text-[12.5px] font-bold text-ink-900">
          {index != null && <span className="text-accent-700 tabular">{index}.</span>}
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

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8" />
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-[1fr_20rem] gap-3">
        <Skeleton className="h-[28rem]" />
        <Skeleton className="h-[28rem]" />
      </div>
    </div>
  );
}

/** 12 §52 — the empty state, in the specification's own words. */
function NoArtifacts({
  onReport,
  onNetwork,
}: {
  onReport: () => void;
  onNetwork: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col items-start gap-3 rounded-lg border border-warn-500/40 bg-warn-100 px-5 py-4">
        <p className="flex items-center gap-2 text-[14px] font-bold text-warn-600">
          <TriangleAlert className="size-5" aria-hidden />
          No exportable artifacts are currently available.
        </p>
        <p className="text-[12px] text-ink-700">目前沒有可匯出的工程產物。</p>
        <p className="text-[11px] text-ink-500">
          Screen 11 exports what Screens 05–11 already produced. It never generates a thermal
          result of its own, so there is nothing to write until at least a network exists.
          <span className="block">
            12 只輸出 05–11 已產生的結果，本頁不會自行計算，因此在尚無網路資料前沒有可寫出的檔案。
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onReport}>
            Go to Report Preview / 前往 10 報告預覽
          </Button>
          <Button onClick={onNetwork}>Go to Thermal Network / 前往 07 熱網路圖</Button>
        </div>
      </div>
    </div>
  );
}

// --- screen -----------------------------------------------------------------

export function ExportCenterView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);

  const network = useNetworkStore((s) => s.network);
  const components = useComponentStore((s) => s.components);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const boundarySets = useBoundaryStore((s) => s.sets);
  const boundaryKey = useBoundaryStore((s) => s.activeKey);

  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const solutionStale = useSolutionStore((s) => s.isStale());
  // The two the report's figures are derived from; see `reportFigureSource`.
  const solveInput = useSolutionStore((s) => s.input);
  const studies = useAnalysisStore((s) => s.proposals);
  const boundaryPorts = useBoundaryStore((s) => s.ports);
  const solverState = useSolverStore((s) => s.state);
  const analyses = useAnalysisStore((s) => s.analyses);
  // Derived from the solution on screen rather than read back from a stored
  // snapshot Temperature Distribution used to refresh; see `useDistributionResult`.
  const { distribution, state: distributionState } = useDistributionResult();
  const snapshots = useOverviewStore((s) => s.snapshots);
  const payloads = useReportStore((s) => s.payloads);
  const reportConfigs = useReportStore((s) => s.configs);

  const config = useExportStore((s) => s.config);
  // From the store, not a ref: a ref is per mount, and this has to survive
  // walking to another screen and back.
  const directory = useExportStore((s) => s.directory);
  const directoryName = useExportStore((s) => s.directoryName);
  const selected = useExportStore((s) => s.selected);
  const storedSnapshotSelection = useExportStore((s) => s.snapshotSelection);
  const queue = useExportStore((s) => s.queue);
  const results = useExportStore((s) => s.results);
  const history = useExportStore((s) => s.history);
  const exporting = useExportStore((s) => s.exporting);
  const progress = useExportStore((s) => s.progress);
  const lastManifest = useExportStore((s) => s.lastManifest);
  const stamp = useExportStore((s) => s.stamp);

  const [manifestOpen, setManifestOpen] = useState(false);
  const [manifestText, setManifestText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<'selected' | 'package'>('selected');

  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;
  const analysis = solution
    ? (analyses[`${solution.network_id}::${solution.scenario_id}`] ?? null)
    : null;
  const snapshot = activeScenarioId ? (snapshots[activeScenarioId] ?? null) : null;
  // Screen 06's store materialises an EMPTY set for a scenario that has never
  // been configured, purely so its editor has something to bind to. That is not
  // a boundary configuration, and 12 §3 asks for one — so a set with no profiles
  // and no assignments reads as absent here rather than as a draft.
  const rawBoundary = boundaryKey ? (boundarySets[boundaryKey] ?? null) : null;
  const boundarySet =
    rawBoundary && (rawBoundary.profiles.length > 0 || rawBoundary.assignments.length > 0)
      ? rawBoundary
      : null;
  const payload = activeScenarioId ? (payloads[activeScenarioId] ?? null) : null;
  const reportConfig = activeScenarioId ? (reportConfigs[activeScenarioId] ?? null) : null;

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

  // 12 §52 — "no previous-project state retained" on a scenario switch.
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
    useOverviewStore.getState().loadFor(projectId, activeScenarioId);
    useReportStore.getState().loadFor(projectId, activeScenarioId);
  }, [projectId, activeScenarioId]);

  const scenarioName = scenario?.name ?? '';
  useEffect(() => {
    if (!projectId) return;
    useExportStore
      .getState()
      .loadFor(projectId, activeScenarioId, defaultBaseFilename(projectId, scenarioName));
  }, [projectId, activeScenarioId, scenarioName]);

  // --- freshness ------------------------------------------------------------
  const stale = solutionStale || solverState === 'DIRTY';
  const sourceRevision =
    projectId && network && scenario
      ? currentSourceRevision(projectId, network, scenario)
      : null;

  const liveOverview = useMemo(() => {
    if (!network || !solution || !scenario || !projectId) return null;
    return buildResultsOverview({
      project_id: projectId,
      scenario,
      network,
      solution,
      components,
      analysis,
      current_source_revision: sourceRevision ?? undefined,
      solution_stale: stale,
      solver_settings: network.solver_settings,
    }).overview;
  }, [
    network,
    solution,
    scenario,
    projectId,
    components,
    analysis,
    distribution,
    distributionState,
    sourceRevision,
    stale,
  ]);

  const snapshotEvaluation = useMemo(
    () => evaluateSnapshot(snapshot, liveOverview, scenarioName),
    [snapshot, liveOverview, scenarioName],
  );

  // 08 §14, §21 — the analysis is stale once the solve it was built on moved.
  const analysisStale = useMemo(() => {
    if (!analysis || !solution) return false;
    return (
      analysis.baseline_signature !== solution.metadata.input_signature ||
      !sourceRevision ||
      !resultRevisionMatches(analysis.source_revision, sourceRevision)
    );
  }, [analysis, solution, sourceRevision]);

  /**
   * The same figures Screen 10 previews.
   *
   * Screen 11 used to pass none, so `renderReport` received an empty list and a
   * null context: the exported PDF printed "Thermal Network Not Available" and
   * "Bottleneck Thermal Network Not Available" over two sections the preview
   * had drawn in full, and the paginator counted both as empty and broke the
   * pages somewhere else again. §9 forbids this screen changing the report's
   * layout, and dropping two of its seven sections is the largest change it
   * could make.
   */
  const figureSource = useMemo(
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

  /**
   * The snapshot matrix's rows, and the ticks that survived being reloaded.
   *
   * The rows come from the report's figures rather than from a list of their
   * own, so "which subjects are there" has one answer across Screens 11 and 12.
   * A stored selection is reconciled against them here: a board removed or a
   * bottleneck cleared since the file was written takes its ticks with it,
   * rather than sitting in the file as a row nothing can draw.
   */
  const subjects = useMemo(() => snapshotSubjects(figureSource.figures), [figureSource.figures]);

  const snapshotSelection = useMemo(
    () =>
      reconcileSnapshotSelection(storedSnapshotSelection, subjects) ?? {
        modes: {},
        instances: {},
      },
    [storedSnapshotSelection, subjects],
  );

  const readinessInput = useMemo<ReadinessInput>(
    () => ({
      network,
      solution,
      solution_stale: stale,
      analysis,
      analysis_stale: analysisStale,
      distribution,
      distribution_stale: distributionState !== 'CURRENT',
      boundary: boundarySet,
      snapshot,
      snapshot_stale: snapshotEvaluation.state === 'STALE',
      payload,
      components_without_limits: snapshot?.completeness.components_without_limits ?? 0,
      low_confidence_edges: snapshot?.completeness.low_confidence_critical_edges ?? 0,
      snapshot_count: snapshotCount(subjects, snapshotSelection),
    }),
    [
      network,
      solution,
      stale,
      analysis,
      analysisStale,
      distribution,
      distributionState,
      boundarySet,
      snapshot,
      snapshotEvaluation,
      payload,
      subjects,
      snapshotSelection,
    ],
  );

  const readiness = useMemo(() => evaluateAllArtifacts(readinessInput), [readinessInput]);

  const validation = useMemo(
    () =>
      validateExport({
        ...readinessInput,
        selected,
        base_filename: config.base_filename,
        readiness,
        analytical_only: snapshot?.completeness.data_confidence === 'Analytical-only',
      }),
    [readinessInput, selected, config.base_filename, readiness, snapshot],
  );

  const status = useMemo(
    () => globalStatus({ validation, selected, exporting, results }),
    [validation, selected, exporting, results],
  );

  // --- default selection ----------------------------------------------------
  const selectableTypes = useMemo(
    () =>
      ARTIFACT_DEFINITIONS.filter((definition) =>
        isExportable(readiness[definition.type]?.status ?? 'NOT_AVAILABLE'),
      ).map((definition) => definition.type),
    [readiness],
  );

  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!activeScenarioId || selectableTypes.length === 0) return;
    if (seeded.current === activeScenarioId) return;
    // A remembered selection is a decision; the preset is only a starting
    // point. This effect re-runs on every remount, so without this guard
    // coming back from another screen re-seeded it over whatever the engineer
    // had ticked -- which is what made the settings look like they were never
    // saved at all.
    if (useExportStore.getState().preferencesRestored) {
      seeded.current = activeScenarioId;
      return;
    }
    seeded.current = activeScenarioId;
    // A first visit starts with everything that currently passes its own
    // prerequisites ticked, which is what the Engineering Package preset used
    // to mean before the four rows made a dropdown over them redundant.
    useExportStore.getState().setSelected(selectableTypes);
  }, [activeScenarioId, selectableTypes]);

  const go = (path: string) => navigate(projectPath(projectId ?? '', path));

  const downloadAgain = useCallback((entry: QueueEntry | ExportHistoryEntry) => {
    if (!entry.object_url) {
      toast.error('This file is no longer held by the browser. Export it again.');
      return;
    }
    triggerDownload(entry.object_url, entry.filename);
  }, []);

  // --- the export -----------------------------------------------------------
  const reportRender = useMemo<ReportRenderInput | null>(() => {
    if (!reportConfig || !snapshot || !scenario) return null;
    return {
      config: reportConfig,
      // The same recovery Screen 10's preview does, so the exported document
      // and the preview of it do not disagree about which language the
      // Engineering Actions are in. See `withTranslatedActions`.
      snapshot: withTranslatedActions(snapshot),
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
      unavailable: snapshotEvaluation.unavailable_sections,
      stale: snapshotEvaluation.state === 'STALE',
      network_context: figureSource.context,
      network_figures: figureSource.figures,
      measured_heights: payload?.measured_heights,
    };
  }, [
    reportConfig,
    snapshot,
    liveOverview,
    scenario,
    draft,
    projectId,
    snapshotEvaluation,
    figureSource,
    payload,
  ]);

  const execute = useCallback(
    async (mode: 'selected' | 'package') => {
      if (!projectId || !scenario) return;
      const store = useExportStore.getState();
      const now = new Date();

      const types = selected.filter((type) => type !== 'package_zip');
      const requests = types.map((type) => ({
        type,
        filename: filenameFor(type, {
          config,
          project_id: projectId,
          scenario_name: scenario.name,
          now,
        }),
      }));

      // 12 §47 — freeze the sources BEFORE any file is written.
      const exportSession = createExportSession({
        project_id: projectId,
        project_revision: draft?.revision,
        scenario_id: scenario.id,
        solution,
        analysis,
        distribution,
        snapshot,
        payload,
        requests,
        now: now.toISOString(),
      });

      store.beginSession(
        exportSession,
        requests.map((request) => ({
          type: request.type,
          filename: request.filename,
          status: 'READY' as const,
        })),
      );

      const outcome = await runExport({
        session: exportSession,
        config,
        types,
        now,
        sources: {
          project_id: projectId,
          project_name: draft?.project_name ?? projectId,
          scenario,
          network,
          solution,
          solution_status: !solution ? 'NONE' : stale ? 'STALE' : 'SOLVED',
          report_render: reportRender,
          snapshot_subjects: subjects,
          snapshot_selection: snapshotSelection,
        },
        onProgress: (value) => useExportStore.getState().setProgress(value),
        isCancelled: () => useExportStore.getState().cancelRequested,
      });

      const nextQueue: QueueEntry[] = [];
      const warnings = validation.warnings;

      if (mode === 'package') {
        // 12 §16, §40 — one ZIP holding every artifact that made it.
        const built = await buildPackage({
          session: exportSession,
          artifacts: outcome.artifacts,
          results: outcome.results,
          warnings,
          compress: config.zip_compression,
          now: now.toISOString(),
        });

        const zipName = filenameFor('package_zip', {
          config,
          project_id: projectId,
          scenario_name: scenario.name,
          now,
        });
        const delivered = await deliver({
          blob: built.blob,
          filename: zipName,
          mode: config.destination,
          directory,
        });
        const checksum = config.checksum ? await sha256Hex(built.blob) : null;

        for (const result of outcome.results) {
          nextQueue.push({
            type: result.type,
            filename: result.filename,
            status: result.status === 'FAILED' ? 'FAILED' : result.status === 'SKIPPED' ? 'SKIPPED' : 'EXPORTED',
            size_bytes: result.size_bytes,
            error: result.error,
          });
        }
        nextQueue.push({
          type: 'package_zip',
          filename: zipName,
          status: 'EXPORTED',
          size_bytes: built.blob.size,
          object_url: delivered.object_url,
          mime_type: 'application/zip',
        });

        const failed = outcome.results.filter((result) => result.status === 'FAILED').length;
        const succeeded = outcome.results.length - failed;
        const sessionStatus =
          outcome.cancelled
            ? 'CANCELLED'
            : failed > 0 && succeeded > 0
              ? 'PARTIAL'
              : failed > 0
                ? 'FAILED'
                : 'COMPLETE';

        store.finishSession({
          project_id: projectId,
          results: outcome.results,
          queue: nextQueue,
          manifest: built.manifest,
          status: sessionStatus,
          history: {
            id: exportSession.id,
            time: now.toISOString(),
            label: 'Engineering Package',
            status: sessionStatus === 'COMPLETE' ? 'EXPORTED' : sessionStatus === 'PARTIAL' ? 'PARTIAL' : sessionStatus === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
            filename: zipName,
            size_bytes: built.blob.size,
            artifact_count: built.entry_count,
            warnings: built.manifest.warnings,
            manifest: built.manifest,
            object_url: delivered.object_url,
            mime_type: 'application/zip',
          },
        });

        if (delivered.fallback_reason) {
          toast.warning(`Folder write failed, downloaded instead: ${delivered.fallback_reason}`);
        }
        if (checksum) console.info('package sha256', checksum);
        toast.success(
          sessionStatus === 'PARTIAL'
            ? 'Package exported with failures — see the manifest / 已封裝，但有項目失敗'
            : 'Engineering package exported / 工程封裝已匯出',
        );
        return;
      }

      // --- Export Selected: one file per artifact ---------------------------
      for (const artifact of outcome.artifacts) {
        if (artifact.error) {
          nextQueue.push({
            type: artifact.type,
            filename: '',
            status: 'FAILED',
            error: artifact.error,
          });
          continue;
        }
        for (const file of artifact.files) {
          const delivered = await deliver({
            blob: file.blob,
            filename: file.filename,
            mode: config.destination,
            directory,
          });
          nextQueue.push({
            type: artifact.type,
            filename: file.filename,
            status: 'EXPORTED',
            size_bytes: file.blob.size,
            object_url: delivered.object_url,
            mime_type: file.mime_type,
          });
        }
      }


      const failed = outcome.results.filter((result) => result.status === 'FAILED').length;
      const succeeded = outcome.results.filter(
        (result) => result.status === 'EXPORTED' || result.status === 'WARNING',
      ).length;
      const sessionStatus = outcome.cancelled
        ? 'CANCELLED'
        : failed > 0 && succeeded > 0
          ? 'PARTIAL'
          : failed > 0
            ? 'FAILED'
            : 'COMPLETE';

      const totalSize = nextQueue.reduce((sum, entry) => sum + (entry.size_bytes ?? 0), 0);
      store.finishSession({
        project_id: projectId,
        results: outcome.results,
        queue: nextQueue,
        manifest: null,
        status: sessionStatus,
        history: {
          id: exportSession.id,
          time: now.toISOString(),
          label: `${nextQueue.filter((entry) => entry.status === 'EXPORTED').length} artifact(s)`,
          status:
            sessionStatus === 'COMPLETE'
              ? 'EXPORTED'
              : sessionStatus === 'PARTIAL'
                ? 'PARTIAL'
                : sessionStatus === 'CANCELLED'
                  ? 'CANCELLED'
                  : 'FAILED',
          filename: nextQueue.find((entry) => entry.status === 'EXPORTED')?.filename ?? '',
          size_bytes: totalSize,
          artifact_count: nextQueue.filter((entry) => entry.status === 'EXPORTED').length,
          // A loose export writes no manifest; only the ZIP carries one.
          warnings,
          object_url: nextQueue.find((entry) => entry.status === 'EXPORTED')?.object_url,
        },
      });

      toast.success(
        sessionStatus === 'PARTIAL'
          ? 'Exported with failures — the queue shows which / 部分項目失敗，請見佇列'
          : outcome.cancelled
            ? 'Export cancelled / 匯出已取消'
            : 'Export complete / 匯出完成',
      );
    },
    [
      projectId,
      scenario,
      selected,
      config,
      draft,
      solution,
      analysis,
      distribution,
      snapshot,
      payload,
      network,
      stale,
      boundarySet,
      components,
      reportConfig,
      reportRender,
      directory,
      validation.warnings,
    ],
  );

  const start = (mode: 'selected' | 'package') => {
    if (validation.blocking.length > 0) {
      toast.error('Export is blocked. Resolve the items in the Validation panel first.');
      return;
    }
    // 12 §42, §46 — a WARNING in the selection needs an explicit confirmation.
    if (requiresConfirmation(selected, readiness)) {
      setPendingMode(mode);
      setConfirmOpen(true);
      return;
    }
    void execute(mode);
  };

  // --- gates ----------------------------------------------------------------
  if (projectStatus === 'loading' || (projectId && !draft)) return <LoadingState />;

  // The ZIP is not a source: it wraps whatever else exists, so it does not
  // count towards "is there anything to export".
  const anythingExportable = ARTIFACT_DEFINITIONS.some(
    (definition) =>
      definition.type !== 'package_zip' &&
      isExportable(readiness[definition.type]?.status ?? 'NOT_AVAILABLE'),
  );

  if (!scenario || !anythingExportable) {
    return (
      <ScreenWorkspace
        title="Export Center"
        titleZh="匯出中心"
        descriptionZh="結果輸出成檔案；本頁不重新計算任何數值"
        badge={<Badge tone="warn">NOTHING TO EXPORT</Badge>}
      >
        <NoArtifacts onReport={() => go('report')} onNetwork={() => go('network')} />
      </ScreenWorkspace>
    );
  }

  const showManifest = (value: unknown) => {
    setManifestText(JSON.stringify(value, null, 2));
    setManifestOpen(true);
  };

  return (
    <ScreenWorkspace
      title="Export Center"
      titleZh="匯出中心"
      descriptionZh="結果輸出成 PDF／HTML 報告、PNG 圖表快照，與含追溯清單的 ZIP 工程封裝；本頁不重新計算，也不修改報告版面"
      badge={
        <span className="flex flex-wrap items-center gap-1.5">
          {/* The Export Status KPI card was removed for saying the same word
              twice; its explanation belongs to the badge that remains. */}
          <span title={T12.exportStatus}>
            <Badge tone={status === 'READY' || status === 'COMPLETE' ? 'ok' : status === 'FAILED' ? 'danger' : 'warn'}>
              {status}
            </Badge>
          </span>
          <Badge tone="accent">{scenario.name}</Badge>
          {payload && <Badge tone="neutral">Report {payload.readiness}</Badge>}
          {stale && <Badge tone="danger">Solution stale</Badge>}
        </span>
      }
      metrics={
        <ExportKpiBar readiness={readiness} lastExport={stamp?.lastExportAt ?? null} />
      }
      actionBar={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button icon={<ArrowLeft className="size-4" />} onClick={() => go('report')}>
            Back to Report Preview
          </Button>
          <Button
            icon={<FileCheck2 className="size-4" />}
            disabled={exporting}
            onClick={() =>
              validation.blocking.length === 0
                ? toast.success(
                    validation.warnings.length > 0
                      ? `Validated with ${validation.warnings.length} warning(s) / 驗證通過，有 ${validation.warnings.length} 項警告`
                      : 'Validated — the selection is ready to export / 驗證通過，可以匯出',
                  )
                : // The reasons themselves, not a pointer to a panel: the
                  // artifact table already carries each row's own status, and
                  // what blocks the run is the one thing worth reading here.
                  toast.error(
                    `Cannot export: ${validation.blocking.join(' · ')} / 無法匯出：${validation.blocking_zh.join(' · ')}`,
                  )
            }
          >
            Validate Selected
          </Button>
          <Button
            icon={<Download className="size-4" />}
            disabled={exporting || selected.length === 0}
            onClick={() => start('selected')}
          >
            Export Selected
          </Button>
          <Button
            variant="primary"
            icon={<Package className="size-4" />}
            disabled={exporting || selected.length === 0}
            onClick={() => start('package')}
          >
            Export Engineering Package
          </Button>
          <Button
            icon={<Trash2 className="size-4" />}
            disabled={exporting || queue.length === 0}
            onClick={() => {
              useExportStore.getState().clearQueue();
              toast.success('Queue cleared / 已清空佇列');
            }}
          >
            Clear Queue
          </Button>

          <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11px] text-ink-400 xl:flex">
            {selected.length} selected · {status}
          </span>

          <Button
            icon={<Flag className="size-4" />}
            // 12 §50, AC-12-45 — Finish returns to Results Overview.
            onClick={() => navigate(projectPath(projectId ?? '', 'results'))}
          >
            Finish
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-6 pb-6">
        <ExportProgress
          exporting={exporting}
          progress={progress}
          onCancel={() => {
            useExportStore.getState().requestCancel();
            toast.warning('Cancelling after the current artifact / 將於目前項目完成後取消');
          }}
        />

        <ExportResultPanel
          status={status}
          results={results}
          manifest={lastManifest}
          queue={queue}
          onViewManifest={() => showManifest(lastManifest)}
          onDownloadAgain={downloadAgain}
        />

        {/* One column, top to bottom, in the order the work is done: what to
            export, which pictures, how to name and where to put them, the run
            itself, and what this session has already produced. The history
            used to sit in a narrow right-hand column, which put the record of
            past exports level with the controls for the next one. */}
        <div className="flex min-h-0 flex-col gap-3">
          <Panel
            index={1}
            title="Export Options"
            zh="匯出項目"
            explanation={T12.artifact}
            actions={
              <span className="text-[10.5px] text-ink-400">
                {ARTIFACT_DEFINITIONS.length} artifacts in the V1 catalog
              </span>
            }
          >
            <ArtifactSelectionPanel
              readiness={readiness}
              selected={selected}
              disabled={exporting}
              onToggle={(type) => useExportStore.getState().toggle(type)}
              onSelectAll={() => useExportStore.getState().setSelected(selectableTypes)}
              onClearAll={() => useExportStore.getState().setSelected([])}
            />
          </Panel>

          <Panel
            index={2}
            title="Snapshot Matrix"
            zh="快照矩陣"
            explanation={T12.snapshotMatrix}
            actions={
              <span className="text-[10.5px] text-ink-400">
                feeds Charts / Snapshots PNG
              </span>
            }
          >
            <SnapshotMatrixPanel
              subjects={subjects}
              selection={snapshotSelection}
              disabled={exporting}
              onChange={(next) => useExportStore.getState().setSnapshotSelection(next)}
            />
          </Panel>

          <Panel
            index={3}
            title="Export Settings"
            zh="匯出設定"
            explanation={T12.decimalPrecision}
          >
            <ExportConfigurationPanel
              config={config}
              disabled={exporting}
              folderSupported={supportsFolderPicker()}
              folderName={directoryName}
              folderGranted={Boolean(directory)}
              onPickFolder={async () => {
                const handle = await pickDirectory();
                useExportStore.getState().setDirectory(handle);
                if (!handle) toast.warning('No folder chosen — Browser Download will be used.');
              }}
              onChange={(patch) => useExportStore.getState().setConfig(patch)}
            />
          </Panel>

          <Panel
            index={4}
            title="Export Queue"
            zh="匯出佇列"
            explanation={T12.exportQueue}
            actions={
              <span className="flex items-center gap-1.5 text-[10.5px] text-ink-400">
                {queue.length} entr{queue.length === 1 ? 'y' : 'ies'}
                {/* 12 §30 — what a mixed outcome is called, always explained. */}
                <span className="flex items-center gap-0.5">
                  Partial Export
                  <EngineeringInfo zh={T12.partialExport} label="Partial Export" align="left" />
                </span>
              </span>
            }
          >
            <ExportQueue queue={queue} onDownloadAgain={downloadAgain} />
          </Panel>

          <Panel
            index={5}
            title="Export History"
            zh="匯出紀錄"
            actions={<span className="text-[10px] text-ink-400">session only</span>}
          >
            <div className="flex flex-col gap-2">
              <LocalExportNotice />
              <ExportHistoryPanel
                history={history}
                onDownloadAgain={downloadAgain}
                onCopyFilename={(entry) => {
                  void navigator.clipboard?.writeText(entry.filename);
                  toast.success('Filename copied / 已複製檔名');
                }}
                onViewManifest={(entry) => showManifest(entry.manifest)}
              />
            </div>
          </Panel>
        </div>
      </div>

      {/* 12 §42, §46 — the WARNING confirmation. */}
      {confirmOpen && (
      <Modal
        title="Export with warnings?"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Cancel / 取消</Button>
            <Button
              variant="primary"
              icon={<CheckCheck className="size-4" />}
              onClick={() => {
                setConfirmOpen(false);
                void execute(pendingMode);
              }}
            >
              Export Anyway / 仍要匯出
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-ink-700">
            This report contains warnings or incomplete supporting analyses. Export anyway?
            <span className="block text-ink-500">
              此匯出內容含有警告或不完整的輔助分析，仍要匯出嗎？
            </span>
          </p>
          <ul className="flex flex-col gap-1">
            {validation.warnings.map((warning, index) => (
              <li key={warning} className="text-[11px] leading-relaxed text-ink-500">
                · {warning}
                <span className="block pl-2 text-ink-400">{validation.warnings_zh[index]}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] text-ink-400">
            The warnings are recorded in the traceability manifest.
            <span className="block">這些警告會記錄於追溯資訊清單中。</span>
          </p>
        </div>
      </Modal>
      )}

      {manifestOpen && (
      <Modal
        width="max-w-2xl"
        title="Traceability Manifest / 追溯資訊清單"
        onClose={() => setManifestOpen(false)}
        footer={<Button onClick={() => setManifestOpen(false)}>Close / 關閉</Button>}
      >
        <pre className="max-h-[24rem] overflow-auto rounded border border-line bg-surface-muted p-2 font-mono text-[10.5px] text-ink-900">
          {manifestText || '{}'}
        </pre>
      </Modal>
      )}
    </ScreenWorkspace>
  );
}
