/**
 * Report section registry — 11 §5, §6, §12, §13–§22.
 *
 * One entry per section the default template can contain, in the specification's
 * default order. Each entry records which screen the section's data comes from,
 * so the Inspector's Data tab can say where a number originated rather than
 * leaving the reader to guess (11 §26).
 *
 * Nothing here computes a thermal value. A section declares WHAT it shows and
 * roughly how much room it takes; the numbers arrive from the Screen 10
 * snapshot (11 §12, §37).
 */

import type {
  SectionContentOptions,
  SectionDisplayOptions,
  SectionId,
} from './reportTypes';

export interface SectionDefinition {
  id: SectionId;
  title: string;
  zh: string;
  /**
   * 11 §6 named these "required", and until now they could not be unticked.
   * A report the engineer cannot shape is not their report, so the flag now
   * only sets what the default template includes and what the validator
   * mentions when it is missing — never what the checkbox will allow.
   */
  recommended: boolean;
  /** 11 §26 — where this section's data originally came from. */
  source_screen: '01' | '05' | '07' | '08' | '09' | '10' | '11';
  source_zh: string;
  /** What the section needs from the snapshot; absence makes it unavailable. */
  requires?: 'distribution';
  defaultContent: SectionContentOptions;
  /**
   * Rough content height in page units, used only to estimate pagination
   * (11 §40). A "unit" is one page of body area; the estimate is deterministic
   * and is labelled as an estimate everywhere it is shown.
   */
  base_height: number;
  /** Extra height per data row, for sections whose length follows a row count. */
  row_height?: number;
}

export function defaultDisplay(pageBreakBefore = false): SectionDisplayOptions {
  return {
    page_break_before: pageBreakBefore,
    keep_table_together: true,
    compact_spacing: false,
  };
}

/** 11 §5 — the default section order, verbatim. */
export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: 'cover',
    title: 'Cover',
    zh: '封面',
    recommended: true,
    source_screen: '11',
    source_zh: '報告設定',
    defaultContent: {},
    // A cover always owns its page.
    base_height: 1,
  },
  {
    id: 'project',
    // The project half went to the cover, which already prints the name, the
    // id and the customer. What is left is the scenario the numbers were
    // solved at, which is what a reader checks this section for.
    title: 'Scenario Summary',
    zh: '情境摘要',
    recommended: true,
    source_screen: '01',
    source_zh: '06 邊界條件 / 情境設定',
    defaultContent: {},
    base_height: 0.26,
  },
  {
    id: 'overall',
    title: 'Overall Thermal Status',
    zh: '整體熱狀態',
    recommended: true,
    source_screen: '10',
    source_zh: '10 結果總覽',
    defaultContent: {},
    base_height: 0.3,
  },
  {
    id: 'critical',
    title: 'Critical Components',
    zh: '關鍵元件',
    recommended: false,
    source_screen: '10',
    source_zh: '10 結果總覽（來源 07 / 09）',
    defaultContent: {
      row_count: 5,
      sort_mode: 'lowest_margin',
      show_limit_type: true,
      show_margin: true,
      show_status: true,
    },
    base_height: 0.2,
    row_height: 0.035,
  },
  {
    id: 'network',
    title: 'Thermal Network Summary',
    zh: '熱網路摘要',
    recommended: false,
    source_screen: '07',
    source_zh: '07 熱網路求解',
    defaultContent: {},
    base_height: 0.55,
  },
  {
    id: 'distribution',
    title: 'Temperature Distribution Summary',
    zh: '溫度分佈摘要',
    recommended: false,
    source_screen: '07',
    source_zh: '07 熱網路圖',
    requires: 'distribution',
    defaultContent: {
      show_range_summary: true,
    },
    base_height: 0.32,
  },
  {
    id: 'quality',
    title: 'Solver & Energy Quality',
    zh: '求解與能量品質',
    recommended: true,
    source_screen: '07',
    source_zh: '07 熱網路求解',
    defaultContent: {},
    base_height: 0.36,
  },
  {
    id: 'confidence',
    title: 'Data Completeness & Confidence',
    zh: '資料完整度與可信度',
    recommended: false,
    source_screen: '10',
    source_zh: '10 結果總覽（來源 04 / 05）',
    defaultContent: {},
    base_height: 0.4,
  },
  {
    id: 'actions',
    title: 'Engineering Actions / Conclusions',
    zh: '工程行動與結論',
    recommended: false,
    source_screen: '10',
    source_zh: '10 結果總覽',
    defaultContent: {},
    base_height: 0.45,
  },
  {
    id: 'appendix',
    title: 'Appendix: Source & Traceability',
    zh: '附錄：來源與追溯',
    recommended: false,
    source_screen: '10',
    source_zh: '10 結果總覽 / 專案 metadata',
    defaultContent: {},
    base_height: 0.45,
  },
];

const BY_ID = new Map(SECTION_DEFINITIONS.map((entry) => [entry.id, entry]));

export function sectionDefinition(id: SectionId): SectionDefinition {
  const definition = BY_ID.get(id);
  if (!definition) throw new Error(`Unknown report section: ${id}`);
  return definition;
}

/** The sections the default template starts with ticked. */
export const RECOMMENDED_SECTION_IDS: SectionId[] = SECTION_DEFINITIONS.filter(
  (entry) => entry.recommended,
).map((entry) => entry.id);
