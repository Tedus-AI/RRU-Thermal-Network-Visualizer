/**
 * Presentation helpers for Screen 07.
 *
 * Everything here reads a solution; nothing computes physics. The one rule it
 * enforces on the way out is 07 §44–§46: no ranking, no score, no distribution
 * statistic. Rows are ordered by node id or by the graph, never by "worst".
 */

import type { LimitType } from '@/domain/component';
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

/**
 * The mode as a filename fragment — `Temperature`, `HeatFlow`, `DeltaT`.
 *
 * Built from the label rather than the id so the file says what the toolbar
 * says, and ASCII-folded because `ΔT` is not something every filesystem, mail
 * client and archive tool agrees on.
 */
export function modeFilenamePart(mode: ResultMode): string {
  const entry = RESULT_MODES.find((candidate) => candidate.id === mode);
  if (!entry) return mode;
  return entry.label.replace(/\u0394/g, 'Delta').replace(/[^A-Za-z0-9]+/g, '');
}

/**
 * Whether a value read back from storage is still a mode this build has.
 *
 * The remembered toolbar reads what a PREVIOUS build wrote. A mode that has
 * since been renamed or removed would fall through every branch of the canvas's
 * switch and paint a graph with no colouring and no legend, from a toolbar
 * showing nothing selected.
 */
export function isResultMode(value: unknown): value is ResultMode {
  return RESULT_MODES.some((mode) => mode.id === value);
}

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
/**
 * A resistance, at three decimals.
 *
 * Four was one digit more than anyone reads and it cost the graph real width:
 * `0.1945 °C/W` beside a node is a wider label than `0.194 °C/W`, and on the
 * branches into the bus that difference is the gap between a label that fits
 * and one that crowds the bar.
 *
 * Below a milli-degree per watt, three decimals would print `0.000` — a number
 * that reads as "no resistance here" when the truth is "smaller than this shows".
 * Those say so instead.
 */
export function rth(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  if (value >= 100) return value.toFixed(1);
  if (value > 0 && value < 0.0005) return '<0.001';
  return value.toFixed(3);
}

/**
 * A temperature difference across an edge, named and unsigned.
 *
 * It has been three things. `+7.6 °C` invited exactly the wrong reading — that
 * 7.6 is added on the way downstream — when ΔT here is `T_source − T_target`,
 * so a positive value means the UPSTREAM end is the hotter one. `↓7.6 °C` said
 * "falls by" but put a second direction marker next to an arrow that already
 * carries the direction.
 *
 * So the number carries neither. Which end is hotter is the arrow's job, and
 * the arrow follows the solved direction in every result mode; the `ΔT` prefix
 * says only what the quantity IS, so a reader meeting `7.6 °C` on a graph full
 * of absolute temperatures cannot mistake it for one.
 */
export function deltaTLabel(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `\u0394T ${Math.abs(value).toFixed(digits)} \u00b0C`;
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

// --- result tree (one hierarchy in place of two flat tables) ----------------

/**
 * Node temperatures and edge heat flows as ONE tree, grouped by component.
 *
 * They were two tables, and that was the wrong cut. A node's temperature and
 * the drop across the edge feeding it are the same question — "why is it this
 * hot?" — and answering it meant reading a temperature in one table, copying
 * the node id, and hunting for the edges that mention it in another. The tree
 * puts the drop directly under the node it produced.
 *
 * Three levels: component → node → edge.
 *
 * An edge is listed exactly once, under the node whose temperature it actually
 * explains — its DOWNSTREAM end, with two exceptions where that end explains
 * nothing:
 *
 *   • the edge leaves the group, so the downstream node belongs to someone
 *     else; anchoring there would pile every component's outflow under the
 *     shared base and stop saying whose heat it was;
 *   • the downstream node is a reservoir — ambient, or anything pinned to a
 *     fixed temperature. Its temperature is an input, so no drop explains it,
 *     and hanging the boundary resistance under "Ambient 45 °C" hides the one
 *     row that says why the base is 35 K above it.
 *
 * In both cases it hangs under its upstream node and is marked `outgoing`.
 */
export const SHARED_STRUCTURE_GROUP_ID = '__shared__';
export const UNGROUPED_GROUP_ID = '__manual__';

export interface ResultTreeEdgeRow {
  kind: 'edge';
  id: string;
  name: string;
  /** True when the edge leaves the group — drawn as an outflow, not a drop. */
  outgoing: boolean;
  counterpart_name: string;
  rth_C_per_W: number | null;
  heat_flow_W: number | null;
  delta_T_C: number | null;
  /** `boundary_scenario` / `spreading_biot`, so a substituted Rth says so. */
  rth_origin: EdgeSolutionResult['rth_origin'] | null;
}

export interface ResultTreeNodeRow {
  kind: 'node';
  id: string;
  row: NodeResultRow;
  edges: ResultTreeEdgeRow[];
}

export interface ResultTreeGroupRow {
  kind: 'group';
  id: string;
  name: string;
  subtitle: string;
  /** Hottest node in the group — the number that decides whether to expand. */
  peak_C: number | null;
  power_W: number;
  /** The tightest limit and margin in the group, or null when none is set. */
  limit_C: number | null;
  /** Which temperature the limit is stated against — Tj, Tc, Tb or Ts. */
  limit_type: LimitType | null;
  margin_C: number | null;
  status: 'pass' | 'over' | 'na';
  nodes: ResultTreeNodeRow[];
}

/** A node whose temperature is an input, so no drop upstream of it explains it. */
function isReservoir(node: ThermalNode | undefined): boolean {
  if (!node) return false;
  return (
    node.type === 'ambient' ||
    node.boundary_role === 'placeholder' ||
    node.boundary_type === 'fixed_temperature'
  );
}

function groupIdOf(node: ThermalNode): string {
  if (node.origin?.kind === 'template' && node.origin.component_id) return node.origin.component_id;
  if (node.origin?.kind === 'shared_structure') return SHARED_STRUCTURE_GROUP_ID;
  return UNGROUPED_GROUP_ID;
}

export function resultTree(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  rows: NodeResultRow[],
  components: ReadonlyArray<{ id: string; name: string; category: string; qty: number }>,
): ResultTreeGroupRow[] {
  const componentById = new Map(components.map((component) => [component.id, component]));
  const groupOfNode = new Map<string, string>();
  for (const row of rows) groupOfNode.set(row.node.id, groupIdOf(row.node));

  // Edges first, so each node arrives with its own already attached.
  const edgesByNode = new Map<string, ResultTreeEdgeRow[]>();
  for (const edge of Object.values(network.edges)) {
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    const fromGroup = groupOfNode.get(edge.from);
    const toGroup = groupOfNode.get(edge.to);
    if (fromGroup == null && toGroup == null) continue;

    const outgoing = fromGroup !== toGroup || isReservoir(network.nodes[edge.to]);
    const anchor = outgoing ? edge.from : edge.to;
    if (!groupOfNode.has(anchor)) continue;
    const counterpart = anchor === edge.from ? edge.to : edge.from;
    const result = solution?.edge_results[edge.id] ?? null;

    (edgesByNode.get(anchor) ?? edgesByNode.set(anchor, []).get(anchor)!).push({
      kind: 'edge',
      id: edge.id,
      name: EDGE_TREE_LABELS[edge.type] ?? edge.type,
      outgoing,
      counterpart_name: network.nodes[counterpart]?.name ?? counterpart,
      rth_C_per_W: result?.active_rth_C_per_W ?? activeRthOf(edge),
      heat_flow_W: result?.heat_flow_W ?? null,
      delta_T_C: result?.delta_T_C ?? null,
      rth_origin: result?.rth_origin ?? null,
    });
  }

  const groups = new Map<string, ResultTreeGroupRow>();
  for (const row of rows) {
    const groupId = groupIdOf(row.node);
    let group = groups.get(groupId);
    if (!group) {
      const component = componentById.get(groupId);
      group = {
        kind: 'group',
        id: groupId,
        name:
          component?.name ??
          (groupId === SHARED_STRUCTURE_GROUP_ID
            ? 'Shared Structure / 共用結構'
            : 'Manual Nodes / 手動節點'),
        subtitle: component ? `${component.category} · ×${component.qty}` : '',
        peak_C: null,
        power_W: 0,
        limit_C: null,
        limit_type: null,
        margin_C: null,
        status: 'na',
        nodes: [],
      };
      groups.set(groupId, group);
    }

    group.nodes.push({
      kind: 'node',
      id: row.node.id,
      row,
      edges: (edgesByNode.get(row.node.id) ?? []).sort((a, b) => a.id.localeCompare(b.id)),
    });
    group.power_W += row.power_W;
    if (row.temperature_C != null && (group.peak_C == null || row.temperature_C > group.peak_C)) {
      group.peak_C = row.temperature_C;
    }
    // The group carries the TIGHTEST margin under it, not an average: a
    // component is over limit if any node inside it is, and averaging would
    // hide exactly the node worth opening the group for.
    if (row.margin_C != null && (group.margin_C == null || row.margin_C < group.margin_C)) {
      group.margin_C = row.margin_C;
      group.limit_C = row.limit_C;
      group.limit_type = row.node.limit_type ?? null;
      group.status = row.status;
    }
  }

  // Components in the order Screen 04 lists them, then the structural groups.
  const order = new Map(components.map((component, index) => [component.id, index]));
  return [...groups.values()].sort((a, b) => {
    const rankA = order.get(a.id) ?? (a.id === SHARED_STRUCTURE_GROUP_ID ? 1e6 : 1e6 + 1);
    const rankB = order.get(b.id) ?? (b.id === SHARED_STRUCTURE_GROUP_ID ? 1e6 : 1e6 + 1);
    return rankA - rankB || a.name.localeCompare(b.name);
  });
}

/**
 * Every value of `EdgeType`, so a row never falls back to the raw id.
 *
 * The first draft listed made-up keys ('interface', 'conduction') and the tree
 * printed `package_rjc` at the reader. These are the same names Screen 05 puts
 * on the graph, so an edge reads identically whichever screen you found it on.
 */
const EDGE_TREE_LABELS: Record<string, string> = {
  package_rjc: 'Rjc / 接面至外殼',
  package_rjb: 'Rjb / 接面至板',
  package_rja: 'Rja / 接面至環境',
  conduction: 'Conduction / 熱傳導',
  tim: 'TIM / 介面材料',
  solder: 'Solder / 焊料',
  thermal_via: 'Thermal Via / 導熱孔',
  contact: 'Contact / 接觸',
  spreading: 'Spreading / 擴散',
  heat_pipe: 'Heat Pipe / 熱管',
  convection: 'Convection / 對流',
  radiation: 'Radiation / 輻射',
  custom: 'Link / 連結',
};

/** The edge's own stored resistance, for the pre-solve view. */
function activeRthOf(edge: { rth: { active_source: string; analytical?: number | null; manual?: number | null } }): number | null {
  const value = edge.rth.active_source === 'Manual' ? edge.rth.manual : edge.rth.analytical;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
