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
/** Stamped into the manifest so an exported package names the build it came from. */
export const APP_VERSION = '0.1.0';

// --- artifacts (12 §8) ------------------------------------------------------

export const ARTIFACT_TYPES = [
  'pdf_report',
  'html_report',
  'temperature_csv',
  'network_json',
  'network_csv',
  'bottleneck_csv',
  'scenario_json',
  'png_snapshots',
  'package_zip',
  'manifest',
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
 * `package_zip` and `manifest` are in the same list because §21 makes both
 * selectable in the package builder, but they are not ordinary sources: the ZIP
 * wraps the others and the manifest describes them.
 */
export const ARTIFACT_DEFINITIONS: ArtifactDefinition[] = [
  {
    type: 'pdf_report',
    label: 'PDF Report',
    zh: 'PDF 報告',
    format: 'PDF',
    description: 'Screen 11 report, rendered at its own page size and language',
    description_zh: '依 Screen 11 版面與語言輸出的完整報告',
    prerequisite: 'Report Snapshot · Readiness ≠ BLOCKED',
    prerequisite_zh: '報告快照，且 Report Readiness 非 BLOCKED',
    source_screen: '11 Report Preview',
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
    source_screen: '11 Report Preview',
    extension: 'html',
    mime_type: 'text/html;charset=utf-8',
    artifact_slug: 'Thermal_Report',
    package_path: 'report/thermal_report.html',
  },
  {
    type: 'temperature_csv',
    label: 'Temperature Results CSV',
    zh: '溫度結果 CSV',
    format: 'CSV',
    description: 'Per-node temperature, limit, margin and result source',
    description_zh: '各節點溫度、限制、餘裕與結果來源',
    prerequisite: 'Current Screen 07 solution',
    prerequisite_zh: '目前的 Screen 07 求解結果',
    source_screen: '07 Thermal Network / 09 Temperature Distribution',
    extension: 'csv',
    mime_type: 'text/csv;charset=utf-8',
    artifact_slug: 'Temperature_Results',
    package_path: 'data/temperatures.csv',
  },
  {
    type: 'network_json',
    label: 'Thermal Network JSON',
    zh: '熱網路 JSON',
    format: 'JSON',
    description: 'Canonical graph: nodes, edges, zones, Rth provenance, layout',
    description_zh: '正規圖形資料：節點、連線、區域、Rth 來源與版面',
    prerequisite: 'Valid thermal network',
    prerequisite_zh: '有效的熱網路',
    source_screen: '05 Thermal Path Builder / 07 Thermal Network',
    extension: 'json',
    mime_type: 'application/json',
    artifact_slug: 'Thermal_Network',
    package_path: 'data/thermal_network.json',
  },
  {
    type: 'network_csv',
    label: 'Thermal Network CSV',
    zh: '熱網路 CSV',
    format: 'CSV',
    description: 'Two tables — nodes.csv and edges.csv',
    description_zh: '兩張表：nodes.csv 與 edges.csv',
    prerequisite: 'Valid thermal network',
    prerequisite_zh: '有效的熱網路',
    source_screen: '05 Thermal Path Builder / 07 Thermal Network',
    extension: 'csv',
    mime_type: 'text/csv;charset=utf-8',
    artifact_slug: 'Thermal_Network',
    package_path: 'data/network_nodes.csv',
  },
  {
    type: 'bottleneck_csv',
    label: 'Bottleneck Analysis CSV',
    zh: '瓶頸分析 CSV',
    format: 'CSV',
    description: 'Ranked bottlenecks with sensitivity and margin impact',
    description_zh: '瓶頸排名，含敏感度與餘裕改善',
    prerequisite: 'Current Screen 08 analysis',
    prerequisite_zh: '目前的 Screen 08 分析結果',
    source_screen: '08 Bottleneck Analysis',
    extension: 'csv',
    mime_type: 'text/csv;charset=utf-8',
    artifact_slug: 'Bottleneck_Analysis',
    package_path: 'data/bottlenecks.csv',
  },
  {
    type: 'scenario_json',
    label: 'Scenario & Boundary JSON',
    zh: '情境與邊界 JSON',
    format: 'JSON',
    description: 'Scenario inputs plus the boundary models and their sources',
    description_zh: '情境輸入與邊界模型、來源',
    prerequisite: 'Scenario + boundary configuration',
    prerequisite_zh: '情境與邊界設定',
    source_screen: '06 Boundary Conditions',
    extension: 'json',
    mime_type: 'application/json',
    artifact_slug: 'Scenario_Boundary',
    package_path: 'data/scenario_boundary.json',
  },
  {
    type: 'png_snapshots',
    label: 'Charts / Snapshots PNG',
    zh: '圖表快照 PNG',
    format: 'PNG',
    description: 'Existing 07 / 08 / 09 views, re-rendered from stored results',
    description_zh: '由既有 07 / 08 / 09 視圖依儲存結果重繪',
    prerequisite: 'Current solution (analysis for the overlay)',
    prerequisite_zh: '目前求解結果（瓶頸疊圖另需 08 分析）',
    source_screen: '07 / 08 / 09',
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
    source_screen: '12 Export Center',
    extension: 'zip',
    mime_type: 'application/zip',
    artifact_slug: 'Engineering_Package',
    package_path: '',
  },
  {
    type: 'manifest',
    label: 'Traceability Manifest',
    zh: '追溯資訊清單',
    format: 'JSON',
    description: 'Project, scenario, solver, snapshot, artifact and warning record',
    description_zh: '記錄專案、情境、求解器、快照、產出與警告',
    prerequisite: 'Export session metadata',
    prerequisite_zh: '匯出工作階段的中繼資料',
    source_screen: '12 Export Center',
    extension: 'json',
    mime_type: 'application/json',
    artifact_slug: 'Manifest',
    package_path: 'traceability/manifest.json',
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

export const SOURCE_KEYS = [
  'report',
  'thermal_solution',
  'bottleneck_analysis',
  'temperature_distribution',
  'network_data',
  'scenario_boundary',
  'snapshots',
] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export const SOURCE_LABELS: Record<SourceKey, { label: string; zh: string; screen: string }> = {
  report: { label: 'Report', zh: '報告', screen: '11' },
  thermal_solution: { label: 'Thermal Solution', zh: '熱網路求解', screen: '07' },
  bottleneck_analysis: { label: 'Bottleneck Analysis', zh: '瓶頸分析', screen: '08' },
  temperature_distribution: { label: 'Temperature Distribution', zh: '溫度分佈', screen: '09' },
  network_data: { label: 'Network Data', zh: '熱網路資料', screen: '05' },
  scenario_boundary: { label: 'Scenario / Boundary', zh: '情境 / 邊界', screen: '06' },
  snapshots: { label: 'Snapshots', zh: '圖表快照', screen: '07/08/09' },
};

export type SourceReadiness = 'READY' | 'WARNING' | 'BLOCKED' | 'NOT_AVAILABLE';

export interface SourceReadinessEntry {
  key: SourceKey;
  state: SourceReadiness;
  detail: string;
  detail_zh: string;
}

// --- configuration (12 §24, §25, §26, §27) ----------------------------------

export const OVERWRITE_MODES = ['auto_rename', 'confirm'] as const;
export type OverwriteMode = (typeof OVERWRITE_MODES)[number];

export const OVERWRITE_LABELS: Record<OverwriteMode, { label: string; zh: string }> = {
  auto_rename: { label: 'Auto Rename', zh: '自動改名' },
  confirm: { label: 'Confirm', zh: '每次確認' },
};

export const CSV_ENCODINGS = ['utf8_bom', 'utf8'] as const;
export type CsvEncoding = (typeof CSV_ENCODINGS)[number];

export const CSV_ENCODING_LABELS: Record<CsvEncoding, { label: string; zh: string }> = {
  utf8_bom: { label: 'UTF-8 with BOM', zh: 'UTF-8（含 BOM）' },
  utf8: { label: 'UTF-8', zh: 'UTF-8' },
};

/** 12 §26 — serialization only; the stored precision never changes. */
export const DECIMAL_PRECISIONS = [2, 3, 4] as const;
export type DecimalPrecision = (typeof DECIMAL_PRECISIONS)[number];
export const DEFAULT_DECIMAL_PRECISION: DecimalPrecision = 3;

export const JSON_FORMATS = ['pretty', 'compact'] as const;
export type JsonFormat = (typeof JSON_FORMATS)[number];

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
  overwrite: OverwriteMode;
  zip_compression: boolean;

  csv_encoding: CsvEncoding;
  decimal_precision: DecimalPrecision;
  csv_include_units: boolean;
  json_format: JsonFormat;
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
    // 12 §24 — Browser Download cannot ask the filesystem anything, so the only
    // honest default there is Auto Rename.
    overwrite: 'auto_rename',
    zip_compression: true,
    csv_encoding: 'utf8_bom',
    decimal_precision: DEFAULT_DECIMAL_PRECISION,
    csv_include_units: true,
    json_format: 'pretty',
    png_scale: '2x',
    destination: 'browser_download',
    checksum: true,
  };
}

// --- presets (12 §23) -------------------------------------------------------

export const PRESETS = [
  'engineering_package',
  'report_only',
  'data_only',
  'images_only',
  'custom',
] as const;
export type ExportPreset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<ExportPreset, { label: string; zh: string; note: string }> = {
  engineering_package: {
    label: 'Engineering Package',
    zh: '工程封裝',
    note: 'All recommended READY/WARNING artifacts',
  },
  report_only: { label: 'Report Only', zh: '僅報告', note: 'PDF + manifest' },
  data_only: { label: 'Data Only', zh: '僅資料', note: 'CSV / JSON + manifest' },
  images_only: { label: 'Images Only', zh: '僅圖片', note: 'PNG snapshots + manifest' },
  custom: { label: 'Custom', zh: '自訂', note: 'Your own selection' },
};

/** 12 §23 — what each preset asks for, before readiness is applied. */
export const PRESET_ARTIFACTS: Record<Exclude<ExportPreset, 'custom'>, ArtifactType[]> = {
  engineering_package: [
    'pdf_report',
    'temperature_csv',
    'network_json',
    'network_csv',
    'bottleneck_csv',
    'scenario_json',
    'png_snapshots',
    'manifest',
  ],
  report_only: ['pdf_report', 'manifest'],
  data_only: ['temperature_csv', 'network_json', 'network_csv', 'bottleneck_csv', 'scenario_json', 'manifest'],
  images_only: ['png_snapshots', 'manifest'],
};

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

// --- what the PDF/HTML generator needs from Screen 11 -----------------------

export interface ReportRenderContract {
  page_size: PageSize;
  orientation: Orientation;
  language_mode: LanguageMode;
  estimated_page_count: number;
}
