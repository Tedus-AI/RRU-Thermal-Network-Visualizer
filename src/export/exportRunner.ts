/**
 * The export run — 12 §28, §29, §30, §31, §47, AC-12-28, AC-12-29, AC-12-30.
 *
 * One generator per artifact, run in sequence against a FROZEN session, each in
 * its own try/catch. §30 is the design constraint: "One artifact failure must
 * not crash the entire export." A generator that throws produces a FAILED result
 * and the run continues, so a broken PDF still leaves the engineer with the CSVs
 * they came for and a manifest that says what happened.
 *
 * Cancellation (§29) is cooperative and checked between artifacts, which is what
 * "stops remaining work safely" means here: no half-written file is delivered.
 */

import type { Scenario } from '@/domain/project';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { sha256Hex } from './checksum';
import { textBlob } from './download';
import { exportPngSnapshots } from './exportPngSnapshots';
import { exportHtmlReport, exportPdfReport } from './exportPdfReport';
import type { ReportRenderInput } from './reportRenderer';
import type { SnapshotSelection, SnapshotSubject } from './snapshotSelection';
import { filenameFor, uniqueFilename } from './filenameBuilder';
import {
  artifactDefinition,
  type ArtifactType,
  type SolutionStatus,
  type ExportArtifactResult,
  type ExportConfiguration,
  type ExportSession,
} from './exportTypes';
import type { GeneratedArtifact, GeneratedFile } from './packageBuilder';

/**
 * What a run is allowed to read.
 *
 * Shorter than it was. It carried the analysis, the distribution, the boundary
 * set, the component list and the Screen 10 snapshot for the CSV and JSON
 * artifacts this build no longer produces, and for a snapshot renderer that
 * drew its own bottleneck overlay. Both are gone; a field nothing reads is a
 * claim about where an artifact's numbers come from that is not true.
 */
export interface ExportSources {
  project_id: string;
  project_name: string;
  scenario: Scenario;
  network: ThermalNetwork | null;
  solution: ThermalSolution | null;
  solution_status: SolutionStatus;
  /** Everything the report says, already laid out by Screen 11. */
  report_render: ReportRenderInput | null;
  /** The rows of the snapshot matrix, and which of their cells are ticked. */
  snapshot_subjects: readonly SnapshotSubject[];
  snapshot_selection: SnapshotSelection;
}

export interface RunProgress {
  /** 1-based index of the artifact being produced. */
  index: number;
  total: number;
  /** 12 §29's wording: "Preparing 2 / 7", "Rendering PDF", … */
  label: string;
  label_zh: string;
}

export interface RunOptions {
  session: ExportSession;
  config: ExportConfiguration;
  sources: ExportSources;
  types: ArtifactType[];
  now: Date;
  onProgress?: (progress: RunProgress) => void;
  /** Checked between artifacts — 12 §29. */
  isCancelled?: () => boolean;
}

export interface RunOutcome {
  artifacts: GeneratedArtifact[];
  results: ExportArtifactResult[];
  cancelled: boolean;
}

const PROGRESS_LABELS: Partial<Record<ArtifactType, { en: string; zh: string }>> = {
  pdf_report: { en: 'Rendering PDF', zh: '產生 PDF' },
  html_report: { en: 'Rendering HTML report', zh: '產生 HTML 報告' },
  png_snapshots: { en: 'Rendering chart snapshots', zh: '產生圖表快照' },
  package_zip: { en: 'Generating ZIP', zh: '產生 ZIP' },
};

export async function runExport(options: RunOptions): Promise<RunOutcome> {
  const { config, session } = options;
  const artifacts: GeneratedArtifact[] = [];
  const results: ExportArtifactResult[] = [];
  const taken = new Set<string>();
  let cancelled = false;

  // The ZIP is produced by the packager, never by the per-artifact loop: it
  // wraps results that do not exist yet at this point. The manifest it carries
  // is built there too.
  const queue = options.types.filter((type) => type !== 'package_zip');

  for (const [index, type] of queue.entries()) {
    if (options.isCancelled?.()) {
      cancelled = true;
      break;
    }

    const definition = artifactDefinition(type);
    const label = PROGRESS_LABELS[type];
    options.onProgress?.({
      index: index + 1,
      total: queue.length,
      label: `Preparing ${index + 1} / ${queue.length} · ${label?.en ?? definition.label}`,
      label_zh: `準備中 ${index + 1} / ${queue.length} · ${label?.zh ?? definition.zh}`,
    });

    let artifact: GeneratedArtifact;
    try {
      artifact = await generate(type, options, taken);
    } catch (error) {
      // 12 §30 — isolated. The loop keeps going.
      artifact = {
        type,
        files: [],
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    artifacts.push(artifact);

    for (const file of artifact.files) taken.add(file.filename);

    if (artifact.error) {
      results.push({
        id: `${session.id}_${type}`,
        type,
        filename: '',
        status: 'FAILED',
        mime_type: definition.mime_type,
        warnings: artifact.warnings,
        error: artifact.error,
      });
      continue;
    }

    for (const file of artifact.files) {
      const checksum = config.checksum ? await sha256Hex(file.blob) : null;
      results.push({
        id: `${session.id}_${file.filename}`,
        type,
        filename: file.filename,
        status: artifact.warnings.length > 0 ? 'WARNING' : 'EXPORTED',
        mime_type: file.mime_type,
        size_bytes: file.blob.size,
        ...(checksum ? { checksum_sha256: checksum } : {}),
        warnings: artifact.warnings,
      });
    }
  }

  // Anything cancellation skipped is recorded, not silently dropped (§29).
  if (cancelled) {
    const produced = new Set(artifacts.map((artifact) => artifact.type));
    for (const type of queue) {
      if (produced.has(type)) continue;
      results.push({
        id: `${session.id}_${type}`,
        type,
        filename: '',
        status: 'SKIPPED',
        mime_type: artifactDefinition(type).mime_type,
        warnings: ['Export was cancelled before this artifact was generated.'],
      });
    }
  }

  return { artifacts, results, cancelled };
}


async function generate(
  type: ArtifactType,
  options: RunOptions,
  taken: Set<string>,
): Promise<GeneratedArtifact> {
  const { config, sources } = options;
  const definition = artifactDefinition(type);

  const nameFor = (slug?: string, extension?: string) =>
    uniqueFilename(
      filenameFor(type, {
        config,
        project_id: sources.project_id,
        scenario_name: sources.scenario.name,
        now: options.now,
        slug_override: slug,
        extension_override: extension,
      }),
      taken,
    );

  const file = (
    filename: string,
    package_path: string,
    blob: Blob,
    mime_type = definition.mime_type,
  ): GeneratedFile => ({ filename, package_path, blob, mime_type });

  switch (type) {
    case 'pdf_report': {
      if (!sources.report_render) throw new Error('No report payload to render.');
      const pdf = await exportPdfReport(sources.report_render);
      return {
        type,
        files: [file(nameFor(), definition.package_path, pdf.blob)],
        warnings: [],
      };
    }

    case 'html_report': {
      if (!sources.report_render) throw new Error('No report payload to render.');
      const html = exportHtmlReport(sources.report_render);
      return {
        type,
        files: [
          file(
            nameFor(),
            definition.package_path,
            textBlob(html.html, definition.mime_type),
          ),
        ],
        warnings: [],
      };
    }






    case 'png_snapshots': {
      if (!sources.network || !sources.solution) throw new Error('No solved result to render.');
      const snapshots = await exportPngSnapshots({
        network: sources.network,
        solution: sources.solution,
        scenario_id: sources.scenario.id,
        subjects: sources.snapshot_subjects,
        selection: sources.snapshot_selection,
        scale: config.png_scale,
      });
      const files = snapshots.images.map((image) =>
        file(
          nameFor(slugOf(image.name), 'png'),
          `images/${image.name}`,
          image.blob,
          'image/png',
        ),
      );
      if (files.length === 0) throw new Error('No snapshot could be rendered.');
      return { type, files, warnings: snapshots.warnings };
    }

    default:
      throw new Error(`Artifact ${type} is not produced by the run loop.`);
  }
}

/** `thermal_network.png` → `Thermal_Network`, for the stand-alone filename. */
function slugOf(name: string): string {
  return name
    .replace(/\.png$/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('_');
}
