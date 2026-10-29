/**
 * Screen registry — 00 §0 and §49.
 *
 * The sidebar is the same on every screen (00 §49). Every screen is declared
 * here so navigation, routing and the "recommended next step" logic are real
 * from Phase 0 onward.
 *
 * TWO NUMBERS, and they must not be confused:
 *
 *   `code` — the screen's stable id: the sidebar number it had before the
 *            2026-10 renumbering. It is what `fix_in`, `LeverScreen`,
 *            `source_screen` and the localStorage keys (`tnv.08.…`) store, and
 *            for 01–08 it is also the number of the specification document
 *            (folders 04/ 05/ 07/ 08/, `07 §59` citations in comments and
 *            docs). The report screen's id is '10' while its specification
 *            documents are 11/ (Report Preview) and 12/ (Export Center). It
 *            never changes and is never shown to a reader.
 *   `no`   — the screen's POSITION in the sidebar. This is what the reader sees
 *            in the sidebar, in the page title, and in every "到 04 …" hint.
 *            It closed up (2026-10) after 03 (FloTHERM import, deferred), 06
 *            (merged into 05), 09 and 11 (merged into 07 and 10) left holes:
 *
 *              code  04  05  07  08  10     (id)
 *              no    03  04  05  06  07     (sidebar)
 *
 * Text a reader sees uses `no` (or `displayNo(code)` when all it has is an id).
 * Text a developer reads — comments, docs, the `§` citations — keeps the old
 * numbers; docs/APP_SHELL_CONTRACT.md "Two numbers" has the table.
 * A merged-away screen has no number of its own: `displayNo('06')` answers
 * with the screen it became part of.
 */

import {
  Boxes,
  FileText,
  FolderInput,
  Info,
  Layers,
  Network,
  Share2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ScreenDef {
  /** Stable id (the pre-renumbering sidebar number). Never shown to a reader. */
  code: string;
  /** Position in the sidebar — the number a reader sees. Empty when not in the sidebar. */
  no: string;
  path: string;
  label: string;
  labelEn: string;
  icon: LucideIcon;
  group: string;
  implemented: boolean;
  /** 04 §0 — Screen 03 is deferred until the real FloTHERM schema is validated. */
  deferred?: boolean;
}

export interface ScreenGroup {
  label: string;
  labelEn: string;
  screens: ScreenDef[];
}

/** English name for each sidebar group — kept for exports and accessible names. */
export const GROUP_LABELS_EN: Record<string, string> = {
  專案與匯入: 'Project & Import',
  熱網路建立: 'Network Setup',
  求解與分析: 'Solve & Analysis',
  報告與匯出: 'Report & Export',
};

export const SCREENS: ScreenDef[] = [
  {
    code: '01',
    no: '01',
    path: 'info',
    label: '專案資訊',
    labelEn: 'Project Info',
    icon: Info,
    group: '專案與匯入',
    implemented: true,
  },
  {
    code: '02',
    no: '02',
    path: 'import-components',
    label: '匯入硬體元件',
    labelEn: 'Import Components',
    icon: FolderInput,
    group: '專案與匯入',
    implemented: true,
  },
  {
    code: '03',
    no: '',
    path: 'import-flotherm',
    label: 'FloTHERM 匯入',
    labelEn: 'FloTHERM Import',
    icon: Upload,
    group: '專案與匯入',
    implemented: false,
    deferred: true,
  },
  {
    code: '04',
    no: '03',
    path: 'components',
    label: '元件管理',
    labelEn: 'Component Manager',
    icon: Boxes,
    group: '熱網路建立',
    implemented: true,
  },
  {
    code: '05',
    no: '04',
    path: 'thermal-path',
    label: '熱網路與邊界',
    labelEn: 'Network & Boundary',
    icon: Share2,
    group: '熱網路建立',
    implemented: true,
  },
  // 06 Boundary Conditions became the surface half of 05 (sidebar 04);
  // `/boundary` redirects there.
  {
    code: '07',
    no: '05',
    path: 'network',
    label: '求解與結果',
    labelEn: 'Solve & Results',
    icon: Network,
    group: '求解與分析',
    implemented: true,
  },
  {
    code: '08',
    no: '06',
    path: 'bottleneck',
    label: '瓶頸分析',
    labelEn: 'Bottleneck Analysis',
    icon: TriangleAlert,
    group: '求解與分析',
    implemented: true,
  },
  // 09 Results Overview is part of 07 now (07 §59; sidebar 05); `/results`
  // redirects there.
  {
    code: '10',
    no: '07',
    path: 'report',
    label: '報告與匯出',
    labelEn: 'Report & Export',
    icon: FileText,
    group: '報告與匯出',
    implemented: true,
  },
  // 11 Export Center is part of 10 now (12 §61; sidebar 07); `/export` opens its
  // 匯出設定.
];

export const SCREEN_GROUPS: ScreenGroup[] = [
  '專案與匯入',
  '熱網路建立',
  '求解與分析',
  '報告與匯出',
].map((label) => ({
  label,
  labelEn: GROUP_LABELS_EN[label],
  screens: SCREENS.filter((s) => s.group === label),
}));

export const GROUP_ICONS: Record<string, LucideIcon> = {
  專案與匯入: FolderInput,
  熱網路建立: Layers,
  求解與分析: Network,
  報告與匯出: FileText,
};

export function screenByCode(code: string): ScreenDef | undefined {
  return SCREENS.find((s) => s.code === code);
}

/**
 * The sidebar number for a specification id — what a hint should say when all
 * it has is an id (`fix_in`, a lever's `screen`, a progress row).
 *
 * The ids of screens that were merged into another answer with the number of
 * the screen they became part of, which is where the reader finds them now.
 */
const MERGED_INTO: Record<string, string> = {
  '06': '05', // Boundary Conditions → the surface half of Network & Boundary
  '09': '07', // Results Overview → Solve & Results
  '11': '10', // Report Preview + Export Center → Report & Export
  '12': '10',
};

export function displayNo(code: string): string {
  const screen = screenByCode(MERGED_INTO[code] ?? code);
  return screen?.no ?? '';
}

export function projectPath(projectId: string, screenPath: string): string {
  return `/project/${encodeURIComponent(projectId)}/${screenPath}`;
}
