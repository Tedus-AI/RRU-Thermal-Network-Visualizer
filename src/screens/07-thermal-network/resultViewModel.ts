/**
 * Presentation helpers for Screen 07.
 *
 * Everything here reads a solution; nothing computes physics. The one rule it
 * enforces on the way out is 07 §44–§46: no ranking, no score, no distribution
 * statistic. Rows are ordered by node id or by the graph, never by "worst".
 */

import type { ThermalNetwork, ThermalNode } from '@/thermal/types';
import type {
  EdgeSolutionResult,
  SolverIssue,
  ThermalSolution,
} from '@/thermal/solver/solverTypes';

// --- result modes (07 §20) --------------------------------------------------

export const RESULT_MODES = [
  { id: 'temperature', label: 'Temperature', zh: '溫度', needsSolution: true },
  { id: 'heat_flow', label: 'Heat Flow', zh: '熱流', needsSolution: true },
  { id: 'delta_t', label: 'ΔT', zh: '溫差', needsSolution: true },
  { id: 'rth', label: 'Rth', zh: '熱阻', needsSolution: false },
  { id: 'node_type', label: 'Node Type', zh: '節點類型', needsSolution: false },
  { id: 'rth_source', label: 'Rth Source', zh: '熱阻來源', needsSolution: false },
] as const;

export type ResultMode = (typeof RESULT_MODES)[number]['id'];

/** 07 §20 — before a solve only the three input-only modes are selectable. */
export function allowedModes(hasResult: boolean): ResultMode[] {
  return RESULT_MODES.filter((mode) => hasResult || !mode.needsSolution).map((mode) => mode.id);
}

// --- temperature colour scale ----------------------------------------------

/**
 * Cool → hot ramp for the Temperature mode (07 §21). Six stops, so the legend
 * can be read as bands rather than as a continuous gradient nobody can match to
 * a number.
 */
export const TEMPERATURE_RAMP = [
  '#2563eb',
  '#0ea5e9',
  '#10b981',
  '#facc15',
  '#f97316',
  '#dc2626',
] as const;

export interface Scale {
  min: number;
  max: number;
  colorOf: (value: number | null | undefined) => string;
  /** Band edges for the legend, low → high. */
  stops: Array<{ color: string; from: number; to: number }>;
}

const NEUTRAL = '#cbd5e1';

export function buildScale(values: number[], ramp: readonly string[] = TEMPERATURE_RAMP): Scale {
  const finite = values.filter((value) => Number.isFinite(value));
  const min = finite.length > 0 ? Math.min(...finite) : 0;
  const max = finite.length > 0 ? Math.max(...finite) : 0;
  const span = max - min;

  const stops = ramp.map((color, index) => ({
    color,
    from: min + (span * index) / ramp.length,
    to: min + (span * (index + 1)) / ramp.length,
  }));

  return {
    min,
    max,
    stops,
    colorOf: (value) => {
      if (value == null || !Number.isFinite(value)) return NEUTRAL;
      if (span <= 0) return ramp[Math.floor(ramp.length / 2)];
      const ratio = (value - min) / span;
      const index = Math.min(ramp.length - 1, Math.max(0, Math.floor(ratio * ramp.length)));
      return ramp[index];
    },
  };
}

// --- formatting -------------------------------------------------------------

/** A missing value is N/A. It is never rendered as 0 (00 Rule 2). */
export function num(
  value: number | null | undefined,
  digits = 1,
  unit = '',
): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const text = Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(digits);
  return unit ? `${text} ${unit}` : text;
}

/** Resistances span four decades, so the precision follows the magnitude. */
export function rth(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

export function signed(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const text = `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
  return unit ? `${text} ${unit}` : text;
}

export function percent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)} %`;
}

export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

// --- node rows (07 §16, §31) ------------------------------------------------

export const NODE_ROLE_LABELS: Record<string, { label: string; zh: string }> = {
  source: { label: 'Source', zh: '熱源' },
  interface: { label: 'Interface', zh: '介面' },
  spreader: { label: 'Spreader', zh: '擴散' },
  zone: { label: 'Structure', zh: '結構' },
  heatsink: { label: 'Heat Sink', zh: '散熱器' },
  boundary: { label: 'Boundary', zh: '邊界' },
  custom: { label: 'Node', zh: '節點' },
};

export interface NodeResultRow {
  node: ThermalNode;
  temperature_C: number | null;
  /** Node temperature minus the ambient reference. Null when either is unknown. */
  delta_to_ambient_C: number | null;
  power_W: number;
  limit_C: number | null;
  /** 07 §16 — Limit − Temperature for this node only. Not a ranking. */
  margin_C: number | null;
  status: 'pass' | 'over' | 'na';
  fixed: boolean;
}

export function nodeRows(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  options: { ambient_C: number | null; powerScale: number },
): NodeResultRow[] {
  return Object.values(network.nodes)
    .filter((node) => !node.disabled)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => {
      const temperature = solution?.node_temperatures_C[node.id] ?? null;
      const limit = node.limit_C ?? null;
      const margin =
        limit != null && temperature != null && Number.isFinite(temperature)
          ? limit - temperature
          : null;

      return {
        node,
        temperature_C: temperature,
        delta_to_ambient_C:
          temperature != null && options.ambient_C != null
            ? temperature - options.ambient_C
            : null,
        power_W: (node.power_W || 0) * options.powerScale,
        limit_C: limit,
        margin_C: margin,
        status: margin == null ? 'na' : margin >= 0 ? 'pass' : 'over',
        fixed: node.boundary_type === 'fixed_temperature' || node.boundary_role === 'placeholder',
      };
    });
}

// --- edge rows (07 §17, §34) ------------------------------------------------

export interface EdgeResultRow {
  result: EdgeSolutionResult;
  from_name: string;
  to_name: string;
  edge_type: string;
  /** Share of the total generated heat this edge carries, %. */
  share_pct: number | null;
}

export function edgeRows(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
): EdgeResultRow[] {
  if (!solution) return [];
  const total = solution.energy_balance.generated_W;

  return Object.values(solution.edge_results)
    .sort((a, b) => a.edge_id.localeCompare(b.edge_id))
    .map((result) => ({
      result,
      from_name: network.nodes[result.from]?.name ?? result.from,
      to_name: network.nodes[result.to]?.name ?? result.to,
      edge_type: network.edges[result.edge_id]?.type ?? 'custom',
      share_pct: total > 0 ? (Math.abs(result.heat_flow_W) / total) * 100 : null,
    }));
}

// --- Rth source badges (07 §24, §26) ---------------------------------------

export const RTH_SOURCE_BADGE: Record<string, { short: string; label: string; zh: string }> = {
  Analytical: { short: 'A', label: 'Analytical', zh: '解析計算' },
  Datasheet: { short: 'A', label: 'Datasheet', zh: '規格書' },
  Vendor: { short: 'A', label: 'Vendor', zh: '供應商' },
  Assumed: { short: 'A', label: 'Assumed', zh: '假設值' },
  Library: { short: 'A', label: 'Library', zh: '元件庫' },
  Imported: { short: 'A', label: 'Imported', zh: '匯入' },
  FloTHERM: { short: 'F', label: 'FloTHERM', zh: 'FloTHERM' },
  Measurement: { short: 'M', label: 'Measurement', zh: '量測' },
  Manual: { short: 'U', label: 'Manual', zh: '手動' },
};

export const RTH_SOURCE_COLORS: Record<string, string> = {
  A: '#0d9488',
  F: '#7c3aed',
  M: '#d97706',
  U: '#2563eb',
};

// --- direction (07 §15, §22) ------------------------------------------------

export const DIRECTION_LABELS = {
  forward: { label: 'Forward', zh: '順向（與圖示方向相同）' },
  reverse: { label: 'Reverse', zh: '逆向（與圖示方向相反）' },
  zero: { label: 'No flow', zh: '無熱流' },
} as const;

// --- validation grouping (07 §36) -------------------------------------------

export const ISSUE_GROUPS = [
  { id: 'pre_solve', label: 'Pre-Solve', zh: '求解前檢查' },
  { id: 'matrix', label: 'Matrix', zh: '矩陣' },
  { id: 'boundary', label: 'Boundary', zh: '邊界條件' },
  { id: 'energy_balance', label: 'Energy Balance', zh: '能量平衡' },
  { id: 'result_integrity', label: 'Result Integrity', zh: '結果完整性' },
] as const;

export function groupIssues(issues: SolverIssue[]): Record<string, SolverIssue[]> {
  const grouped: Record<string, SolverIssue[]> = {};
  for (const group of ISSUE_GROUPS) grouped[group.id] = [];
  for (const entry of issues) (grouped[entry.group] ??= []).push(entry);
  return grouped;
}

export const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  READY: 'neutral',
  DIRTY: 'warn',
  SOLVING: 'accent',
  SOLVED: 'ok',
  WARNING: 'warn',
  FAILED: 'danger',
};

export const STATUS_ZH: Record<string, string> = {
  READY: '就緒',
  DIRTY: '已失效',
  SOLVING: '求解中',
  SOLVED: '已求解',
  WARNING: '有警告',
  FAILED: '求解失敗',
};
