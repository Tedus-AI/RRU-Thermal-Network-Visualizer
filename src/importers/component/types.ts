/**
 * Import pipeline types — 02 §8.
 *
 * Raw Source → Parser → Column Mapping → Normalization → Staging Rows →
 * Validation → User Review → Apply → componentStore
 *
 * Nothing in this pipeline may touch componentStore before Apply (02 §8, §34).
 */

import type {
  ComponentCategory,
  HeatPathType,
  ImportSourceType,
  TimType,
} from '@/domain/component';

/** Target fields a source column can be mapped onto — 02 §11. */
export const CANONICAL_FIELDS = [
  'Component',
  'Qty',
  'Power(W)',
  'Category',
  'Limit(C)',
  'R_jc',
  'Heat_Path',
  'TIM_Type',
  'TIM_k',
  'TIM_BLT',
  'Source_L',
  'Source_W',
  'Spread_L',
  'Spread_W',
  'Thick(mm)',
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export const IGNORE_COLUMN = 'Ignore Column';
export type MappingTarget = CanonicalField | typeof IGNORE_COLUMN;

/** 02 §13. */
export const REQUIRED_FIELDS: CanonicalField[] = ['Component', 'Qty', 'Power(W)'];
export const RECOMMENDED_FIELDS: CanonicalField[] = [
  'Category',
  'Limit(C)',
  'R_jc',
  'Heat_Path',
  'Source_L',
  'Source_W',
];

/**
 * Fields that override a project-level default rather than stating a fact the
 * source owns. Blank is the normal case, so they never raise a warning.
 */
export const OVERRIDE_FIELDS: CanonicalField[] = ['Spread_L', 'Spread_W', 'TIM_k', 'TIM_BLT'];

/** Raw tabular data straight out of a parser, before any mapping. */
export interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** Sheets found in the workbook, when the source was an Excel file. */
  sheets?: string[];
  activeSheet?: string;
  sourceName: string;
}

export type RowStatus = 'VALID' | 'WARNING' | 'ERROR' | 'DUPLICATE' | 'EXCLUDED';

export interface RowIssue {
  severity: 'error' | 'warning';
  field: CanonicalField | 'Duplicate' | 'Row';
  message: string;
  /** Traditional Chinese copy shown alongside, per 02 §3. */
  message_zh?: string;
}

/** How a duplicate against an existing component is resolved — 02 §17. */
export const DUPLICATE_POLICIES = ['SKIP', 'REPLACE', 'MERGE_NON_EMPTY', 'NEW_VARIANT'] as const;
export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number];

/**
 * One row awaiting review. Values are already normalized; `raw` keeps the
 * original strings so a parse failure can be shown as-is rather than silently
 * becoming 0 (02 §14).
 */
export interface StagingRow {
  row_id: string;
  include: boolean;

  name: string;
  category: ComponentCategory | null;
  qty: number | null;
  power_W: number | null;

  r_jc_C_per_W: number | null;
  limit_C: number | null;
  heat_path: HeatPathType | null;
  tim_type: TimType | null;
  tim_k_W_mK: number | null;
  tim_thickness_mm: number | null;
  source_L_mm: number | null;
  source_W_mm: number | null;
  spread_L_mm: number | null;
  spread_W_mm: number | null;
  thickness_mm: number | null;

  /** Original cell text per canonical field, for error reporting. */
  raw: Partial<Record<CanonicalField, string>>;
  /** Source columns that were not mapped — preserved into component metadata. */
  extra: Record<string, string>;

  status: RowStatus;
  issues: RowIssue[];

  /** Existing component this row collides with, if any. */
  duplicate_of: string | null;
  /** null means "use the session-wide policy" (02 §17 per-row override). */
  duplicate_action: DuplicatePolicy | null;
}

export interface ImportSourceDescriptor {
  source_type: ImportSourceType;
  source_project_id: string | null;
  source_project_name: string | null;
  source_file: string | null;
}

export interface CategorySummary {
  category: ComponentCategory;
  types: number;
  power_W: number;
}

export interface ImportSummary {
  detected_rows: number;
  included_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  duplicate_rows: number;
  /** Σ Qty × Power over included, non-error rows. A summary only — never edge Q. */
  total_power_W: number;
  category_breakdown: CategorySummary[];
}

export interface ProjectImpact {
  current_components: number;
  new_components: number;
  replaced: number;
  skipped: number;
  projected_total: number;
  projected_power_W: number;
}

export interface ApplyResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  /** True when the import changed data a previous solve depended on (02 §24). */
  invalidated_solver: boolean;
  requires_network_review: boolean;
}
