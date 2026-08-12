/**
 * Report composition contracts — 11 §4, §8, §9, §29, §32.
 *
 * Screen 11 arranges the Screen 10 snapshot into a previewable report. It never
 * recalculates a thermal value (§37) and never writes a file (§38): the config
 * below describes LAYOUT and INCLUSION only, and the export payload carries
 * metadata for Screen 12 rather than bytes.
 *
 * Naming note, as in 06–10: the specification sketches these in camelCase and
 * the codebase settled on snake_case in Screen 02. Field semantics are followed
 * exactly and the casing stays consistent with everything else persisted.
 */

import type { OverallThermalStatus, ResultMode } from '@/thermal/overview/overviewTypes';

export const REPORT_SCHEMA_VERSION = '1.0';

// --- snapshot state (11 §3, §28) --------------------------------------------

export const SNAPSHOT_STATES = ['CURRENT', 'WARNING', 'STALE', 'MISSING'] as const;
export type SnapshotState = (typeof SNAPSHOT_STATES)[number];

export const SNAPSHOT_STATE_ZH: Record<SnapshotState, string> = {
  CURRENT: '最新',
  WARNING: '可用但有警告',
  STALE: '已過期',
  MISSING: '不存在',
};

/** 11 §3 — the specification's own wording for each blocking case. */
export const SNAPSHOT_MESSAGES: Record<SnapshotState, { en: string; zh: string }> = {
  CURRENT: {
    en: 'Snapshot matches the current scenario, solver result and supporting analyses.',
    zh: '快照與目前情境、求解結果與支援分析一致。',
  },
  WARNING: {
    en: 'Snapshot is current, but Screen 10 reported Report Readiness WARNING.',
    zh: '快照為最新，但 Screen 10 的 Report Readiness 為 WARNING。',
  },
  STALE: {
    en: 'Report snapshot is stale. Refresh the overview snapshot before final export.',
    zh: '報告快照已過期，請先於 Screen 10 重新準備快照再進行匯出。',
  },
  MISSING: {
    en: 'No report snapshot is available. Return to Screen 10 and prepare a report snapshot.',
    zh: '目前沒有報告快照，請回到 Screen 10 準備一份。',
  },
};

// --- page layout (11 §8) ----------------------------------------------------

export const PAGE_SIZES = ['A4', 'Letter'] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const LANGUAGE_MODES = ['english', 'bilingual'] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

export const LANGUAGE_MODE_LABELS: Record<LanguageMode, { label: string; zh: string }> = {
  english: { label: 'English', zh: '英文' },
  bilingual: { label: 'Bilingual', zh: '中英雙語' },
};

/** Page geometry in millimetres, used to size the preview page and to paginate. */
export const PAGE_DIMENSIONS_MM: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

export function pageBoxMm(size: PageSize, orientation: Orientation) {
  const base = PAGE_DIMENSIONS_MM[size];
  return orientation === 'portrait'
    ? { width: base.width, height: base.height }
    : { width: base.height, height: base.width };
}

// --- zoom (11 §40) ----------------------------------------------------------

export const ZOOM_MODES = ['50', '75', '100', '125', 'fit_width', 'fit_page'] as const;
export type ZoomMode = (typeof ZOOM_MODES)[number];

export const ZOOM_LABELS: Record<ZoomMode, string> = {
  '50': '50%',
  '75': '75%',
  '100': '100%',
  '125': '125%',
  fit_width: 'Fit Width',
  fit_page: 'Fit Page',
};

/** 11 §40 — the specification's default. */
export const DEFAULT_ZOOM: ZoomMode = 'fit_width';

export const PREVIEW_MODES = ['document', 'outline'] as const;
export type PreviewMode = (typeof PREVIEW_MODES)[number];

// --- sections (11 §5, §6, §23–§27) -----------------------------------------

export const SECTION_IDS = [
  'cover',
  'project',
  'overall',
  'critical',
  'network',
  'bottleneck',
  'distribution',
  'quality',
  'confidence',
  'actions',
  'appendix',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** 11 §24 — per-section content options. Absent keys simply do not apply. */
export interface SectionContentOptions {
  /** Critical Components — 5, 10, or 0 for all (11 §15). */
  row_count?: number;
  /** Critical Components sort (11 §15, §24). */
  sort_mode?: 'lowest_margin' | 'highest_temperature';
  show_limit_type?: boolean;
  show_margin?: boolean;
  show_status?: boolean;
  /** Bottleneck — 3, 5 or 10 (11 §17). */
  top_n?: number;
  show_score?: boolean;
  show_sensitivity?: boolean;
  show_confidence?: boolean;
  /** Temperature Distribution (11 §18, §24). */
  show_range_summary?: boolean;
  include_histogram_snapshot?: boolean;
  include_hot_node_table?: boolean;
}

/** 11 §25 — display options. Deliberately not a word processor. */
export interface SectionDisplayOptions {
  /** Overrides the registry title in the rendered report only. */
  title_override?: string;
  page_break_before: boolean;
  keep_table_together: boolean;
  compact_spacing: boolean;
}

export interface ReportSectionConfig {
  id: SectionId;
  included: boolean;
  order: number;
  content: SectionContentOptions;
  display: SectionDisplayOptions;
  /** 11 §27 — report-only text, stored in the config and nowhere else. */
  note?: string;
}

// --- cover and header/footer (11 §7, §9) ------------------------------------

export interface ReportCoverConfig {
  /** Report display overrides; they never modify project master data (11 §7). */
  project_name_override?: string;
  customer_program?: string;
  prepared_by: string;
  prepared_date: string;
  company_team: string;
  confidentiality: string;
  show_logo: boolean;
}

export interface HeaderFooterConfig {
  show_project_name: boolean;
  show_scenario: boolean;
  show_report_title: boolean;
  show_page_number: boolean;
  show_prepared_date: boolean;
  show_confidentiality: boolean;
  footer_text: string;
}

// --- the config (11 §4) -----------------------------------------------------

export interface ThermalReportConfig {
  schema_version: string;
  id: string;
  project_id: string;
  scenario_id: string;
  /** The Screen 10 snapshot this configuration was composed against. */
  snapshot_id: string;

  template_name: string;
  title: string;
  subtitle?: string;

  language_mode: LanguageMode;
  page_size: PageSize;
  orientation: Orientation;

  cover: ReportCoverConfig;
  sections: ReportSectionConfig[];
  header_footer: HeaderFooterConfig;

  notes?: string;
  conclusion_notes?: string;

  created_at: string;
  updated_at: string;
}

/**
 * 11 §33, AC-11-33 — a saved template carries LAYOUT ONLY.
 *
 * The type deliberately has no home for a temperature, a component id, a
 * bottleneck score or any scenario result: a template that captured those would
 * carry one project's numbers into another project's report.
 */
export interface ReportTemplate {
  schema_version: string;
  id: string;
  name: string;
  created_at: string;
  language_mode: LanguageMode;
  page_size: PageSize;
  orientation: Orientation;
  header_footer: HeaderFooterConfig;
  sections: Array<{
    id: SectionId;
    included: boolean;
    order: number;
    content: SectionContentOptions;
    display: SectionDisplayOptions;
  }>;
}

// --- readiness and validation (11 §29, §35, §36) ----------------------------

export const REPORT_READINESS_STATES = [
  'EXPORT_READY',
  'PREVIEW_READY',
  'WARNING',
  'BLOCKED',
] as const;
export type ReportReadiness = (typeof REPORT_READINESS_STATES)[number];

export const READINESS_ZH: Record<ReportReadiness, string> = {
  EXPORT_READY: '可匯出',
  PREVIEW_READY: '可預覽',
  WARNING: '可用但有警告',
  BLOCKED: '已阻擋',
};

export const VALIDATION_ITEMS = [
  'snapshot',
  'required_sections',
  'project_metadata',
  'scenario_metadata',
  'solver_summary',
  'report_notes',
  'export_payload',
] as const;
export type ValidationItem = (typeof VALIDATION_ITEMS)[number];

export const VALIDATION_ITEM_LABELS: Record<ValidationItem, { label: string; zh: string }> = {
  snapshot: { label: 'Snapshot', zh: '快照' },
  required_sections: { label: 'Required Sections', zh: '必要章節' },
  project_metadata: { label: 'Project Metadata', zh: '專案資訊' },
  scenario_metadata: { label: 'Scenario Metadata', zh: '情境資訊' },
  solver_summary: { label: 'Solver Summary', zh: '求解摘要' },
  report_notes: { label: 'Report Notes', zh: '報告備註' },
  export_payload: { label: 'Export Payload', zh: '匯出資料包' },
};

export const VALIDATION_STATES = ['READY', 'WARNING', 'MISSING', 'STALE'] as const;
export type ValidationState = (typeof VALIDATION_STATES)[number];

export interface ValidationEntry {
  item: ValidationItem;
  state: ValidationState;
  detail: string;
  detail_zh: string;
}

export interface ReportValidation {
  entries: ValidationEntry[];
  /** 11 §35 — anything here blocks export preparation. */
  blocking: string[];
  blocking_zh: string[];
  warnings: string[];
  warnings_zh: string[];
  readiness: ReportReadiness;
}

// --- export payload (11 §32) ------------------------------------------------

export interface ReportExportPayload {
  schema_version: string;
  report_config_id: string;
  snapshot_id: string;
  project_id: string;
  scenario_id: string;

  page_size: PageSize;
  orientation: Orientation;
  language_mode: LanguageMode;

  section_order: SectionId[];
  included_sections: SectionId[];

  readiness: Extract<ReportReadiness, 'EXPORT_READY' | 'WARNING' | 'BLOCKED'>;
  generated_at: string;
  /** Page count the preview estimated, so Screen 12 can sanity-check its render. */
  estimated_page_count: number;
  /**
   * 11 §32, §38, AC-11-34/35 — metadata only. No PDF, CSV, JSON, PNG or ZIP is
   * produced on this screen, and this literal keeps that promise in the type.
   */
  contains_file_bytes: false;
}

// --- rendered pagination (11 §10, §40) --------------------------------------

export interface ReportPage {
  page_number: number;
  title: string;
  title_zh: string;
  /** Sections that begin or continue on this page, in order. */
  section_ids: SectionId[];
}

export interface SnapshotSummary {
  state: SnapshotState;
  snapshot_id: string | null;
  created_at: string | null;
  scenario_name: string;
  result_mode: ResultMode | null;
  overall_status: OverallThermalStatus | null;
  source_readiness: string | null;
}
