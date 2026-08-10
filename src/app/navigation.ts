/**
 * Screen registry — 00 §0 and §49.
 *
 * The sidebar is the same on every screen (00 §49). Screens 02–12 are declared
 * here from the start so navigation, routing and the "recommended next step"
 * logic are real from Phase 0 onward; their views land as they are specified.
 */

import {
  BarChart3,
  Boxes,
  CircleGauge,
  FileDown,
  FileText,
  FolderInput,
  Info,
  Layers,
  Network,
  Share2,
  Thermometer,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ScreenDef {
  /** Two-digit id matching the specification document. */
  code: string;
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

/** English name for each sidebar group — English primary per 02 §3. */
export const GROUP_LABELS_EN: Record<string, string> = {
  專案與匯入: 'Project & Import',
  熱網路建立: 'Network Setup',
  熱網路視覺化: 'Analysis',
  報告與匯出: 'Report & Export',
};

export const SCREENS: ScreenDef[] = [
  {
    code: '01',
    path: 'info',
    label: '專案資訊',
    labelEn: 'Project Info',
    icon: Info,
    group: '專案與匯入',
    implemented: true,
  },
  {
    code: '02',
    path: 'import-components',
    label: '匯入硬體元件',
    labelEn: 'Import Components',
    icon: FolderInput,
    group: '專案與匯入',
    implemented: true,
  },
  {
    code: '03',
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
    path: 'components',
    label: '元件管理',
    labelEn: 'Component Manager',
    icon: Boxes,
    group: '熱網路建立',
    implemented: true,
  },
  {
    code: '05',
    path: 'thermal-path',
    label: '熱路徑建立',
    labelEn: 'Thermal Path Builder',
    icon: Share2,
    group: '熱網路建立',
    implemented: false,
  },
  {
    code: '06',
    path: 'boundary',
    label: '邊界條件',
    labelEn: 'Boundary Conditions',
    icon: Thermometer,
    group: '熱網路建立',
    implemented: false,
  },
  {
    code: '07',
    path: 'network',
    label: '熱網路圖',
    labelEn: 'Thermal Network',
    icon: Network,
    group: '熱網路視覺化',
    implemented: false,
  },
  {
    code: '08',
    path: 'bottleneck',
    label: '瓶頸分析',
    labelEn: 'Bottleneck Analysis',
    icon: TriangleAlert,
    group: '熱網路視覺化',
    implemented: false,
  },
  {
    code: '09',
    path: 'temperature',
    label: '溫度分佈',
    labelEn: 'Temperature Distribution',
    icon: CircleGauge,
    group: '熱網路視覺化',
    implemented: false,
  },
  {
    code: '10',
    path: 'results',
    label: '結果總覽',
    labelEn: 'Results Overview',
    icon: BarChart3,
    group: '熱網路視覺化',
    implemented: false,
  },
  {
    code: '11',
    path: 'report',
    label: '報告預覽',
    labelEn: 'Report Preview',
    icon: FileText,
    group: '報告與匯出',
    implemented: false,
  },
  {
    code: '12',
    path: 'export',
    label: '匯出中心',
    labelEn: 'Export Center',
    icon: FileDown,
    group: '報告與匯出',
    implemented: false,
  },
];

export const SCREEN_GROUPS: ScreenGroup[] = [
  '專案與匯入',
  '熱網路建立',
  '熱網路視覺化',
  '報告與匯出',
].map((label) => ({
  label,
  labelEn: GROUP_LABELS_EN[label],
  screens: SCREENS.filter((s) => s.group === label),
}));

export const GROUP_ICONS: Record<string, LucideIcon> = {
  專案與匯入: FolderInput,
  熱網路建立: Layers,
  熱網路視覺化: Network,
  報告與匯出: FileText,
};

export function screenByCode(code: string): ScreenDef | undefined {
  return SCREENS.find((s) => s.code === code);
}

export function projectPath(projectId: string, screenPath: string): string {
  return `/project/${encodeURIComponent(projectId)}/${screenPath}`;
}
