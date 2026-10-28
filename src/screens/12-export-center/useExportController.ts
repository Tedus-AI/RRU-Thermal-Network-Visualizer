/**
 * Everything 10 報告與匯出 needs to write files — what 11 Export Center was,
 * without its page (12 §61).
 *
 * 11 was its own screen: the same report, a second set of buttons, and a trip
 * back to 10 whenever the snapshot or the export payload moved. It is a column
 * and a drawer on 10 now, and this hook is the part of it that is not layout:
 * which artifacts can be written and why not, the selection and the snapshot
 * matrix, the naming settings, the run itself, its queue and the session's
 * history.
 *
 * The report's own inputs are handed in — the snapshot evaluation, the network
 * figures and the export payload 10 keeps current — so the files and the
 * preview beside them are drawn from one computation, not two.
 *
 * What it never does (12 §38–§40): solve, re-solve, edit a thermal input or
 * change the report layout. Every file is generated in this browser (§35).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { powerBasisOf } from '@/domain/powerBasis';
import type { Scenario } from '@/domain/project';
import { resultRevisionMatches } from '@/domain/revision';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useNetworkStore } from '@/data/networkStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { useAnalysisStore } from '@/data/analysisStore';
import { useReportStore } from '@/data/reportStore';
import { useExportStore, type QueueEntry } from '@/data/exportStore';
import { useDistributionResult } from '@/data/useDistributionResult';
import { currentSourceRevision } from '@/data/sourceRevision';

import { withTranslatedActions, type SnapshotEvaluation } from '@/report/snapshotAdapter';
import type { reportFigureSource } from '@/report/reportFigureSource';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import {
  mergeVisibleSelection,
  reconcileSnapshotSelection,
  snapshotCount,
  snapshotSubjects,
  type SnapshotSelection,
} from '@/export/snapshotSelection';
import {
  ARTIFACT_DEFINITIONS,
  isExportable,
  type ArtifactType,
  type ExportConfiguration,
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
import { defaultBaseFilename, filenameFor } from '@/export/filenameBuilder';
import { deliver, pickDirectory, triggerDownload } from '@/export/download';
import { sha256Hex } from '@/export/checksum';
import type { ReportRenderInput } from '@/export/reportRenderer';

export type ExportMode = 'selected' | 'package';

/** What one press of an export button asks for. */
export interface ExportRequest {
  mode: ExportMode;
  /** The artifacts to write; for a package, what goes inside it. */
  types: ArtifactType[];
}

export function useExportController({
  projectId,
  scenario,
  snapshot,
  evaluation,
  figureSource,
}: {
  projectId: string | undefined;
  scenario: Scenario | null;
  snapshot: ResultsOverviewSnapshot | null;
  /** 10's own evaluation of the snapshot against the live results. */
  evaluation: SnapshotEvaluation;
  /** The same figures 10 previews; see `reportFigureSource`. */
  figureSource: ReturnType<typeof reportFigureSource>;
}) {
  const draft = useProjectStore((s) => s.draft);
  const network = useNetworkStore((s) => s.network);
  const activeScenarioId = scenario?.id ?? null;
  const boundarySets = useBoundaryStore((s) => s.sets);
  const boundaryKey = useBoundaryStore((s) => s.activeKey);
  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const solutionStale = useSolutionStore((s) => s.isStale());
  const solverState = useSolverStore((s) => s.state);
  const analyses = useAnalysisStore((s) => s.analyses);
  const { distribution, state: distributionState } = useDistributionResult();
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

  const [confirm, setConfirm] = useState<{
    request: ExportRequest;
    warnings: string[];
    warnings_zh: string[];
  } | null>(null);
  const [manifestText, setManifestText] = useState<string | null>(null);

  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const analysis = solution
    ? (analyses[`${solution.network_id}::${solution.scenario_id}`] ?? null)
    : null;
  // The boundary store materialises an EMPTY set for a scenario that has never
  // been configured, purely so its editor has something to bind to. That is not
  // a boundary configuration, and 12 §3 asks for one.
  const rawBoundary = boundaryKey ? (boundarySets[boundaryKey] ?? null) : null;
  const boundarySet =
    rawBoundary && (rawBoundary.profiles.length > 0 || rawBoundary.assignments.length > 0)
      ? rawBoundary
      : null;
  const payload = activeScenarioId ? (payloads[activeScenarioId] ?? null) : null;
  const reportConfig = activeScenarioId ? (reportConfigs[activeScenarioId] ?? null) : null;

  const scenarioName = scenario?.name ?? '';
  useEffect(() => {
    if (!projectId) return;
    useExportStore
      .getState()
      .loadFor(projectId, activeScenarioId, defaultBaseFilename(projectId, scenarioName, activeScenarioId));
  }, [projectId, activeScenarioId, scenarioName]);

  const stale = solutionStale || solverState === 'DIRTY';
  const sourceRevision =
    projectId && network && scenario ? currentSourceRevision(projectId, network, scenario) : null;

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
   * The snapshot matrix's rows, and the ticks that survived being reloaded.
   *
   * The rows come from the report's figures, so "which subjects are there" has
   * one answer for the preview and the PNG export. A stored selection is
   * reconciled against them: a board removed since the file was written takes
   * its ticks with it.
   */
  const subjects = useMemo(() => snapshotSubjects(figureSource.figures), [figureSource.figures]);
  const snapshotSelection = useMemo(
    () => reconcileSnapshotSelection(storedSnapshotSelection, subjects) ?? { modes: {}, instances: {} },
    [storedSnapshotSelection, subjects],
  );
  // Without a usable solve there are no figures and the matrix would show the
  // whole-machine row alone; an edit never stores the rows it cannot see as
  // unticked.
  const subjectsComplete =
    figureSource.context?.solution != null && figureSource.context.solution.status !== 'FAILED';
  const editSnapshotSelection = useCallback(
    (edited: SnapshotSelection) => {
      const store = useExportStore.getState();
      store.setSnapshotSelection(
        mergeVisibleSelection(store.snapshotSelection, edited, subjects, subjectsComplete),
      );
    },
    [subjects, subjectsComplete],
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
      snapshot_stale: evaluation.state === 'STALE',
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
      evaluation,
      payload,
      subjects,
      snapshotSelection,
    ],
  );

  const readiness = useMemo(() => evaluateAllArtifacts(readinessInput), [readinessInput]);

  const validationFor = useCallback(
    (types: ArtifactType[]) =>
      validateExport({
        ...readinessInput,
        selected: types,
        base_filename: config.base_filename,
        readiness,
        analytical_only: snapshot?.completeness.data_confidence === 'Analytical-only',
      }),
    [readinessInput, config.base_filename, readiness, snapshot],
  );
  const validation = useMemo(() => validationFor(selected), [validationFor, selected]);

  const status = useMemo(
    () => globalStatus({ validation, selected, exporting, results }),
    [validation, selected, exporting, results],
  );

  const selectableTypes = useMemo(
    () =>
      ARTIFACT_DEFINITIONS.filter((definition) =>
        isExportable(readiness[definition.type]?.status ?? 'NOT_AVAILABLE'),
      ).map((definition) => definition.type),
    [readiness],
  );

  // A first visit starts with everything that currently passes its own
  // prerequisites ticked. A remembered selection is a decision and is kept.
  // Keyed by project as well as scenario: two projects that both open on
  // SCN_001 are still two first visits.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !activeScenarioId || selectableTypes.length === 0) return;
    const seedKey = `${projectId}:${activeScenarioId}`;
    if (seeded.current === seedKey) return;
    seeded.current = seedKey;
    if (useExportStore.getState().preferencesRestored) return;
    useExportStore.getState().setSelected(selectableTypes);
  }, [projectId, activeScenarioId, selectableTypes]);

  /** The name a file of this type would get if exported now. */
  const filenamePreview = useCallback(
    (type: ArtifactType) =>
      projectId && scenario
        ? filenameFor(type, {
            config,
            project_id: projectId,
            scenario_name: scenario.name,
            scenario_id: scenario.id,
            now: new Date(),
          })
        : '',
    [config, projectId, scenario],
  );

  const downloadAgain = useCallback((entry: QueueEntry | ExportHistoryEntry) => {
    if (!entry.object_url) {
      toast.error('瀏覽器已經沒有這個檔案，請重新匯出。');
      return;
    }
    triggerDownload(entry.object_url, entry.filename);
  }, []);

  // --- the export -----------------------------------------------------------
  const reportRender = useMemo<ReportRenderInput | null>(() => {
    if (!reportConfig || !snapshot || !scenario) return null;
    return {
      config: reportConfig,
      // The same recovery the preview does, so the exported document and the
      // preview of it agree on the language of the Engineering Actions.
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
        power_basis: powerBasisOf(scenario),
      },
      unavailable: evaluation.unavailable_sections,
      stale: evaluation.state === 'STALE',
      network_context: figureSource.context,
      network_figures: figureSource.figures,
      measured_heights: payload?.measured_heights,
    };
  }, [reportConfig, snapshot, scenario, draft, projectId, evaluation, figureSource, payload]);

  const execute = useCallback(
    async ({ mode, types: requested }: ExportRequest, warnings: string[], track: { sessionId: string | null }) => {
      if (!projectId || !scenario) return;
      const store = useExportStore.getState();
      const now = new Date();

      const types = requested.filter((type) => type !== 'package_zip');
      const requests = types.map((type) => ({
        type,
        filename: filenameFor(type, {
          config,
          project_id: projectId,
          scenario_name: scenario.name,
          scenario_id: scenario.id,
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

      track.sessionId = exportSession.id;
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
      const historyStatus = (session: string) =>
        session === 'COMPLETE'
          ? ('EXPORTED' as const)
          : session === 'PARTIAL'
            ? ('PARTIAL' as const)
            : session === 'CANCELLED'
              ? ('CANCELLED' as const)
              : ('FAILED' as const);

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
          scenario_id: scenario.id,
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
          filename: delivered.filename,
          status: 'EXPORTED',
          size_bytes: built.blob.size,
          object_url: delivered.object_url,
          mime_type: 'application/zip',
        });

        const failed = outcome.results.filter((result) => result.status === 'FAILED').length;
        const succeeded = outcome.results.length - failed;
        const sessionStatus = outcome.cancelled
          ? 'CANCELLED'
          : failed > 0 && succeeded > 0
            ? 'PARTIAL'
            : failed > 0
              ? 'FAILED'
              : 'COMPLETE';

        store.finishSession({
          session_id: exportSession.id,
          project_id: projectId,
          results: outcome.results,
          queue: nextQueue,
          manifest: built.manifest,
          status: sessionStatus,
          history: {
            id: exportSession.id,
            time: now.toISOString(),
            label: '工程封裝 ZIP',
            status: historyStatus(sessionStatus),
            filename: delivered.filename,
            size_bytes: built.blob.size,
            artifact_count: built.entry_count,
            warnings: built.manifest.warnings,
            manifest: built.manifest,
            object_url: delivered.object_url,
            mime_type: 'application/zip',
          },
        });

        if (delivered.fallback_reason) {
          toast.warning(`寫入資料夾失敗，改用瀏覽器下載：${delivered.fallback_reason}`);
        }
        if (checksum) console.info('package sha256', checksum);
        toast.success(sessionStatus === 'PARTIAL' ? '已封裝，但有項目失敗（見追溯清單）' : '工程封裝已匯出');
        return;
      }

      // --- one file per artifact -------------------------------------------
      for (const artifact of outcome.artifacts) {
        if (artifact.error) {
          nextQueue.push({ type: artifact.type, filename: '', status: 'FAILED', error: artifact.error });
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
            filename: delivered.filename,
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

      const exported = nextQueue.filter((entry) => entry.status === 'EXPORTED');
      const single = types.length === 1 ? ARTIFACT_DEFINITIONS.find((entry) => entry.type === types[0]) : null;
      store.finishSession({
        session_id: exportSession.id,
        project_id: projectId,
        results: outcome.results,
        queue: nextQueue,
        manifest: null,
        status: sessionStatus,
        history: {
          id: exportSession.id,
          time: now.toISOString(),
          label: single ? single.zh : `${exported.length} 個檔案`,
          status: historyStatus(sessionStatus),
          filename: exported[0]?.filename ?? '',
          size_bytes: nextQueue.reduce((sum, entry) => sum + (entry.size_bytes ?? 0), 0),
          artifact_count: exported.length,
          // A loose export writes no manifest; only the ZIP carries one.
          warnings,
          object_url: exported[0]?.object_url,
        },
      });

      toast.success(
        sessionStatus === 'PARTIAL'
          ? '部分項目失敗，失敗的列在匯出結果'
          : outcome.cancelled
            ? '匯出已取消'
            : '匯出完成',
      );
    },
    [
      projectId,
      scenario,
      config,
      draft,
      solution,
      analysis,
      distribution,
      snapshot,
      payload,
      network,
      stale,
      reportRender,
      directory,
      // Read into the run's sources: without them a tick changed in the matrix
      // reached the export only because something else happened to change too.
      subjects,
      snapshotSelection,
    ],
  );

  /**
   * Runs an export and makes sure it ends.
   *
   * What the exporter does not reach — the filename builder, the package, a
   * delivery — could throw out of `execute`, and a discarded promise left the
   * screen on "exporting" with every button disabled until a reload.
   */
  const run = useCallback(
    (request: ExportRequest, warnings: string[]) => {
      const track: { sessionId: string | null } = { sessionId: null };
      execute(request, warnings, track).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('export failed', error);
        if (track.sessionId) useExportStore.getState().abortSession(track.sessionId, message);
        toast.error(`匯出失敗：${message}`);
      });
    },
    [execute],
  );

  /**
   * One press of an export button: check what it asks for, confirm warnings,
   * run. The check is the old "Validate Selected", done where it matters.
   */
  const start = useCallback(
    (request: ExportRequest) => {
      if (exporting) return;
      const checked = validationFor(request.mode === 'package' ? [...request.types, 'package_zip'] : request.types);
      if (checked.blocking.length > 0) {
        toast.error(`不能匯出：${checked.blocking_zh.join('・')}`);
        return;
      }
      // 12 §42, §46 — a WARNING in what is being written needs a confirmation.
      if (requiresConfirmation(request.types, readiness)) {
        setConfirm({ request, warnings: checked.warnings, warnings_zh: checked.warnings_zh });
        return;
      }
      run(request, checked.warnings);
    },
    [exporting, validationFor, readiness, run],
  );

  return {
    config,
    directory,
    directoryName,
    selected,
    selectableTypes,
    queue,
    results,
    history,
    exporting,
    progress,
    lastManifest,
    readiness,
    validation,
    status,
    subjects,
    snapshotSelection,
    editSnapshotSelection,
    filenamePreview,
    downloadAgain,
    start,
    cancel: () => {
      useExportStore.getState().requestCancel();
      toast.warning('目前這一項完成後就會取消');
    },
    clearQueue: () => useExportStore.getState().clearQueue(),
    toggle: (type: ArtifactType) => useExportStore.getState().toggle(type),
    setSelected: (types: ArtifactType[]) => useExportStore.getState().setSelected(types),
    setConfig: (patch: Partial<ExportConfiguration>) => useExportStore.getState().setConfig(patch),
    pickFolder: async () => {
      const handle = await pickDirectory();
      useExportStore.getState().setDirectory(handle);
      if (!handle) toast.warning('沒有選資料夾，會改用瀏覽器下載。');
    },
    confirm: confirm && {
      warnings: confirm.warnings,
      warnings_zh: confirm.warnings_zh,
      accept: () => {
        const pending = confirm;
        setConfirm(null);
        run(pending.request, pending.warnings);
      },
      dismiss: () => setConfirm(null),
    },
    manifest: {
      text: manifestText,
      show: (value: unknown) => setManifestText(JSON.stringify(value ?? {}, null, 2)),
      close: () => setManifestText(null),
    },
  };
}

export type ExportController = ReturnType<typeof useExportController>;
