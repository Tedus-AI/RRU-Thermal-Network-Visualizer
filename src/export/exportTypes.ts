/**
 * Export contracts — 12 §4, §5, §8, §17, §24, §25, §48, §49.
 *
 * Naming note, as in 06–11: the specification sketches its schemas in camelCase
 * and the codebase settled on snake_case in Screen 02. Internal state here stays
 * snake_case. The ONE deliberate exception is `ExportManifest` (§17): the
 * manifest is a file handed to downstream tooling, not internal state, so it is
 * written exactly as §17 spells it out. A consumer parsing `manifest.json`
 * should not have to guess which casing the tool happened to prefer.
 */

import type { LanguageMode, Orientation, PageSize } from '@/report/reportTypes';

export const EXPORT_SCHEMA_VERSION = '1.0';

/** How current the solve behind an export is; see `ExportSources`. */
export type SolutionStatus = 'SOLVED' | 'STALE' | 'NONE';
/** Stamped into the manifest so an exported package names the build it came from. */
export const APP_VERSION = '0.1.0';

// --- artifacts (12 §8) ------------------------------------------------------

export const ARTIFACT_TYPES = [
  'pdf_report',
  'html_report',
  'png_snapshots',
  'package_zip',
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface ArtifactDefinition {
  type: ArtifactType;
  label: string;
  zh: string;
  format: 'PDF' | 'HTML' | 'CSV' | 'JSON' | 'PNG' | 'ZIP';
  /** What the row's Description column says (12.png section 2). */
  description: string;
  description_zh: string;
  /** What the row's Prerequisite column says (12 §3). */
  prerequisite: string;
  prerequisite_zh: string;
  /** Which screens the data came from, for the manifest's `sourceScreen`. */
  source_screen: string;
  /** File extension used by the filename builder (12 §18). */
  extension: string;
  mime_type: string;
  /** Slug used in the default filename, e.g. `Temperature_Results`. */
  artifact_slug: string;
  /** Where the file lands inside the Engineering Package (12 §16). */
  package_path: string;
}

/**
 * 12 §8 — the V1 catalog.
 *
 * The five data files this list used to carry -- the temperature CSV, the two
 * thermal network exports, the bottleneck CSV and the scenario/boundary JSON --
 * were removed along with the stand-alone traceability manifest. What an
 * engineer takes away from this tool is the report and the pictures in it; the
 * raw tables restated numbers that are already on the screens that computed
 * them, in files nothing downstream reads.
 *
 * `package_zip` is in the same list because §21 makes it selectable in the
 * package builder, but it is not an ordinary source: it wraps the others. The
 * manifest is still WRITTEN into that ZIP -- a package without its provenance
 * record is not traceable -- it simply is not something to export on its own.
 */
export const ARTIFACT_DEFINITIONS: ArtifactDefinition[] = [
  {
    type: 'pdf_report',
    label: 'PDF Report',
    zh: 'PDF 報告',
    format: 'PDF',
    description: 'Screen 10 report, rendered at its own page size and language',
    description_zh: '依 Screen 10 版面與語言輸出的完整報告',
    prerequisite: 'Report Snapshot · Readiness ≠ BLOCKED',
    prerequisite_zh: '報告快照，且 Report Readiness 非 BLOCKED',
    source_screen: '10 Report Preview',
    extension: 'pdf',
    mime_type: 'application/pdf',
    artifact_slug: 'Thermal_Report',
    package_path: 'report/thermal_report.pdf',
  },
  {
    type: 'html_report',
    label: 'HTML Report',
    zh: 'HTML 報告',
    format: 'HTML',
    description: 'The same report as a single self-contained HTML file',
    description_zh: '與 PDF 相同內容的單檔 HTML 報告',
    prerequisite: 'Report Snapshot · Readiness ≠ BLOCKED',
    prerequisite_zh: '報告快照，且 Report Readiness 非 BLOCKED',
    source_screen: '10 Report Preview',
    extension: 'html',
    mime_type: 'text/html;charset=utf-8',
    artifact_slug: 'Thermal_Report',
    package_path: 'report/thermal_report.html',
  },
  {
    type: 'png_snapshots',
    label: 'Charts / Snapshots PNG',
    zh: '圖表快照 PNG',
    format: 'PNG',
    description: "Screen 07's views, one PNG per cell ticked in the matrix",
    description_zh: '07 視圖，快照矩陣每勾選一格輸出一張 PNG',
    prerequisite: 'Current solution, and at least one cell ticked',
    prerequisite_zh: '目前求解結果，且至少勾選一格',
    source_screen: '07',
    extension: 'png',
    mime_type: 'image/png',
    artifact_slug: 'Snapshots',
    package_path: 'images/',
  },
  {
    type: 'package_zip',
    label: 'Engineering Package ZIP',
    zh: '工程封裝 ZIP',
    format: 'ZIP',
    description: 'Selected artifacts plus the traceability manifest',
    description_zh: '所選產出加上追溯資訊清單',
    prerequisite: 'At least one exportable artifact',
    prerequisite_zh: '至少一項可匯出的產出',
    source_screen: '11 Export Center',
    extension: 'zip',
    mime_type: 'application/zip',
    artifact_slug: 'Engineering_Package',
    package_path: '',
  },
];

export function artifactDefinition(type: ArtifactType): ArtifactDefinition {
  const definition = ARTIFACT_DEFINITIONS.find((entry) => entry.type === type);
  if (!definition) throw new Error(`Unknown export artifact: ${type}`);
  return definition;
}

// --- readiness (12 §4, §5) --------------------------------------------------

export const ARTIFACT_STATUSES = [
  'READY',
  'WARNING',
  'BLOCKED',
  'NOT_AVAILABLE',
  'EXPORTING',
  'EXPORTED',
  'FAILED',
] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const ARTIFACT_STATUS_ZH: Record<ArtifactStatus, string> = {
  READY: '可匯出',
  WARNING: '可匯出但有警告',
  BLOCKED: '來源無效或已過期',
  NOT_AVAILABLE: '來源不存在',
  EXPORTING: '產生中',
  EXPORTED: '已完成',
  FAILED: '產生失敗',
};

export const GLOBAL_STATUSES = [
  'READY',
  'WARNING',
  'PARTIAL',
  'EXPORTING',
  'COMPLETE',
  'FAILED',
] as const;
export type GlobalExportStatus = (typeof GLOBAL_STATUSES)[number];

export const GLOBAL_STATUS_ZH: Record<GlobalExportStatus, string> = {
  READY: '可匯出',
  WARNING: '可匯出但有警告',
  PARTIAL: '部分成功',
  EXPORTING: '匯出中',
  COMPLETE: '已完成',
  FAILED: '匯出失敗',
};

/** 12 §4 — only these two may be sent to the generator. */
export function isExportable(status: ArtifactStatus): boolean {
  return status === 'READY' || status === 'WARNING';
}

/** 12 §22 — BLOCKED and NOT_AVAILABLE disable the checkbox instead of hiding it. */
export function isSelectable(status: ArtifactStatus): boolean {
  return isExportable(status);
}

// --- source readiness panel (12 §32) ----------------------------------------

// --- configuration (12 §24, §25) --------------------------------------------
//
// §26 and §27 governed the CSV tables and the JSON documents: a decimal
// precision, a unit row, a UTF-8 BOM, a pretty/compact switch. All four left
// with the five data files they formatted. The manifest inside the package is
// the only JSON still written and it is always written pretty, because it is
// read by eye.

export const PNG_SCALES = ['1x', '2x'] as const;
export type PngScale = (typeof PNG_SCALES)[number];

export const DESTINATIONS = ['browser_download', 'folder'] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const DESTINATION_LABELS: Record<Destination, { label: string; zh: string }> = {
  browser_download: { label: 'Browser Download', zh: '瀏覽器下載' },
  folder: { label: 'Choose Folder', zh: '選擇資料夾' },
};

export interface ExportConfiguration {
  base_filename: string;
  include_project_id: boolean;
  include_scenario_id: boolean;
  timestamp: boolean;
  zip_compression: boolean;

  png_scale: PngScale;

  destination: Destination;
  /** 12 §41 — optional. Omitted rather than faked when it is switched off. */
  checksum: boolean;
}

export function defaultConfiguration(base: string): ExportConfiguration {
  return {
    base_filename: base,
    include_project_id: true,
    include_scenario_id: true,
    timestamp: true,
    zip_compression: true,
    png_scale: '2x',
    destination: 'browser_download',
    checksum: true,
  };
}


// --- session and results
// --- session and results (12 §48, §49) --------------------------------------

export interface ExportArtifactRequest {
  type: ArtifactType;
  filename: string;
}

export const SESSION_STATUSES = [
  'READY',
  'EXPORTING',
  'COMPLETE',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * 12 §47, §48 — the frozen source set.
 *
 * Every artifact in one export must come from the same solve, the same analysis
 * and the same report snapshot. The ids are captured when the export starts and
 * are what the manifest reports, so a package can never quietly mix versions
 * because the user changed a scenario halfway through a long ZIP build.
 */
export interface ExportSession {
  id: string;
  started_at: string;

  project_id: string;
  scenario_id: string;

  project_revision?: string;
  solver_solution_id?: string;
  analysis_id?: string;
  distribution_id?: string;
  report_snapshot_id?: string;
  report_config_id?: string;

  selected_artifacts: ExportArtifactRequest[];
  status: SessionStatus;
}

export type ArtifactResultStatus = 'EXPORTED' | 'WARNING' | 'FAILED' | 'SKIPPED';

export interface ExportArtifactResult {
  id: string;
  type: ArtifactType;
  filename: string;
  status: ArtifactResultStatus;
  mime_type: string;
  size_bytes?: number;
  checksum_sha256?: string;
  warnings: string[];
  error?: string;
  /** Object URL kept for "Download Again" while the tab lives (12 §33). */
  object_url?: string;
}

// --- manifest (12 §17) ------------------------------------------------------

/**
 * 12 §17, verbatim.
 *
 * This one type keeps the specification's camelCase because it is serialized
 * into `manifest.json` and read by whatever consumes the package — it is a wire
 * format, not internal state.
 */
export interface ExportManifest {
  packageId: string;
  projectId: string;
  scenarioId: string;
  createdAt: string;
  appVersion: string;
  schemaVersion: string;

  reportSnapshotId?: string;
  reportConfigId?: string;
  solverVersion?: string;

  artifacts: Array<{
    type: string;
    filename: string;
    status: 'included' | 'warning';
    sourceScreen: string;
    sourceVersion?: string;
    checksum?: string;
  }>;

  warnings: string[];
}

// --- history (12 §33) -------------------------------------------------------

export interface ExportHistoryEntry {
  id: string;
  time: string;
  label: string;
  status: 'EXPORTED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  filename: string;
  size_bytes: number;
  artifact_count: number;
  warnings: string[];
  manifest?: ExportManifest;
  object_url?: string;
  mime_type?: string;
}

// --- validation (12 §31) ----------------------------------------------------

export interface ExportValidation {
  blocking: string[];
  blocking_zh: string[];
  warnings: string[];
  warnings_zh: string[];
}

// --- what the PDF/HTML generator needs from Screen 10 -----------------------

export interface ReportRenderContract {
  page_size: PageSize;
  orientation: Orientation;
  language_mode: LanguageMode;
  estimated_page_count: number;
}
