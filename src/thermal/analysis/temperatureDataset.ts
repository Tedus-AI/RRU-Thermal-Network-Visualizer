/**
 * Temperature distribution dataset — 09 §7, §8, §9, §32, §36.
 *
 * One row per solved node, assembled READ-ONLY from the Screen 07 solution, the
 * Screen 05 topology and the component records. Screen 09 never solves and never
 * writes back (09 §44); this module is the only place the three sources meet.
 *
 * Naming note, as in 06–08: the specification sketches the row in camelCase and
 * the codebase settled on snake_case in Screen 02. The field semantics are
 * followed exactly.
 */

import type { Component } from '@/domain/component';
import type { ThermalNetwork, ThermalNode } from '../types';
import type { ThermalSolution } from '../solver/solverTypes';

export const RESULT_SOURCES = ['analytical', 'flotherm', 'measurement'] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];

export type LimitType = 'Tj' | 'Tc' | 'Ts' | 'Custom';

/** 09 §31 — the display classification, not a product pass/fail (09 §32). */
export type LimitStatus = 'within_limit' | 'near_limit' | 'over_limit' | 'no_limit';

/** 09 §32 — V1 display rule. A project setting may override it in future. */
export const NEAR_LIMIT_MARGIN_C = 10;

export interface TemperatureRow {
  node_id: string;
  node_name: string;
  component_id?: string;
  component_name?: string;
  category?: string;
  node_type: ThermalNode['type'];
  zone_id?: string;
  temperature_C: number;
  limit_type?: LimitType;
  limit_C?: number;
  /** Limit − Temperature. Undefined when the node has no limit — never 0. */
  margin_C?: number;
  status: LimitStatus;
  is_heat_source: boolean;
  is_boundary: boolean;
  result_source: ResultSource;
  scenario_id: string;
}

// --- scope (09 §7) ----------------------------------------------------------

export const SCOPES = [
  'all_solved_nodes',
  'heat_sources_only',
  'components_with_limits',
  'shared_structure',
  'boundary_nodes',
  'custom_selection',
] as const;
export type DistributionScope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<DistributionScope, { label: string; zh: string }> = {
  all_solved_nodes: { label: 'All Solved Nodes', zh: '所有已求解節點' },
  heat_sources_only: { label: 'Heat Sources Only', zh: '僅熱源' },
  components_with_limits: { label: 'Components With Limits', zh: '有限制值的元件' },
  shared_structure: { label: 'Shared Structure', zh: '共用結構' },
  boundary_nodes: { label: 'Boundary Nodes', zh: '邊界節點' },
  custom_selection: { label: 'Custom Selection', zh: '自訂選取' },
};

/** 09 §7 — the specification's default. */
export const DEFAULT_SCOPE: DistributionScope = 'components_with_limits';

// --- group by (09 §8) -------------------------------------------------------

export const GROUP_BYS = ['component', 'category', 'node_type', 'base_zone', 'limit_type'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export const GROUP_BY_LABELS: Record<GroupBy, { label: string; zh: string }> = {
  component: { label: 'Component', zh: '元件' },
  category: { label: 'Category', zh: '類別' },
  node_type: { label: 'Node Type', zh: '節點類型' },
  base_zone: { label: 'Base Zone', zh: '基座區域' },
  limit_type: { label: 'Thermal Limit Type', zh: '熱限制類型' },
};

// --- filters (09 §9) --------------------------------------------------------

export interface DistributionFilters {
  category: string;
  node_type: string;
  zone: string;
  limit_type: string;
  /** Inclusive bounds, °C. Null means "no bound". */
  temperature_min_C: number | null;
  temperature_max_C: number | null;
  margin_min_C: number | null;
  margin_max_C: number | null;
  source_kind: 'all' | 'heat_source' | 'passive';
  result_source: ResultSource;
}

export function emptyFilters(): DistributionFilters {
  return {
    category: 'All',
    node_type: 'All',
    zone: 'All',
    limit_type: 'All',
    temperature_min_C: null,
    temperature_max_C: null,
    margin_min_C: null,
    margin_max_C: null,
    source_kind: 'all',
    // V1 has exactly one solved source; 09 §46 forbids offering a FloTHERM
    // dataset that does not exist.
    result_source: 'analytical',
  };
}

const STRUCTURAL_TYPES: Array<ThermalNode['type']> = [
  'main_base',
  'small_base',
  'base_zone',
  'heat_sink_base',
  'fin_root',
  'fin_surface',
  'housing',
  'heat_pipe_evaporator',
  'heat_pipe_condenser',
];

export function isBoundaryNode(node: ThermalNode): boolean {
  return (
    node.boundary_type === 'fixed_temperature' ||
    node.boundary_role === 'placeholder' ||
    node.type === 'ambient' ||
    node.type === 'external_air'
  );
}

export function statusFor(margin_C: number | undefined): LimitStatus {
  if (margin_C == null || !Number.isFinite(margin_C)) return 'no_limit';
  if (margin_C < 0) return 'over_limit';
  if (margin_C <= NEAR_LIMIT_MARGIN_C) return 'near_limit';
  return 'within_limit';
}

export const STATUS_LABELS: Record<LimitStatus, { label: string; zh: string }> = {
  within_limit: { label: 'Within Limit', zh: '在限制內' },
  near_limit: { label: 'Near Limit', zh: '接近限制' },
  over_limit: { label: 'Over Limit', zh: '超出限制' },
  no_limit: { label: 'No Limit', zh: '無限制值' },
};

/** Every solved node as a row, before scope and filters. */
export function buildTemperatureDataset(input: {
  network: ThermalNetwork;
  solution: ThermalSolution;
  components: Component[];
}): TemperatureRow[] {
  const byId = new Map(input.components.map((component) => [component.id, component]));

  return Object.values(input.network.nodes)
    .filter((node) => !node.disabled)
    .flatMap((node) => {
      const temperature = input.solution.node_temperatures_C[node.id];
      // A node with no solved temperature has nothing to distribute. It is left
      // out rather than entered as 0.
      if (temperature == null || !Number.isFinite(temperature)) return [];

      const component = node.component_ref ? byId.get(node.component_ref) : undefined;
      const limit = node.limit_C ?? undefined;
      const margin = limit == null ? undefined : limit - temperature;

      return [
        {
          node_id: node.id,
          node_name: node.name,
          component_id: node.component_ref,
          component_name: component?.name ?? node.component_ref,
          category: component?.category,
          node_type: node.type,
          zone_id: node.zone ?? node.zone_id ?? undefined,
          temperature_C: temperature,
          limit_type: (node.limit_type ?? undefined) as LimitType | undefined,
          limit_C: limit,
          margin_C: margin,
          status: statusFor(margin),
          is_heat_source: node.power_W > 0,
          is_boundary: isBoundaryNode(node),
          // 09 §9, §46 — V1 solves analytically. FloTHERM and measurement keep
          // their slots but produce no rows while Screen 03 is deferred.
          result_source: 'analytical' as ResultSource,
          scenario_id: input.solution.scenario_id,
        } satisfies TemperatureRow,
      ];
    })
    .sort((a, b) => a.node_id.localeCompare(b.node_id));
}

export function applyScope(
  rows: TemperatureRow[],
  scope: DistributionScope,
  customNodeIds: string[],
): TemperatureRow[] {
  switch (scope) {
    case 'all_solved_nodes':
      return rows;
    case 'heat_sources_only':
      return rows.filter((row) => row.is_heat_source);
    case 'components_with_limits':
      return rows.filter((row) => row.limit_C != null);
    case 'shared_structure':
      return rows.filter((row) => STRUCTURAL_TYPES.includes(row.node_type));
    case 'boundary_nodes':
      return rows.filter((row) => row.is_boundary);
    case 'custom_selection':
      return rows.filter((row) => customNodeIds.includes(row.node_id));
    default:
      return rows;
  }
}

export function applyFilters(
  rows: TemperatureRow[],
  filters: DistributionFilters,
): TemperatureRow[] {
  return rows.filter((row) => {
    if (filters.category !== 'All' && row.category !== filters.category) return false;
    if (filters.node_type !== 'All' && row.node_type !== filters.node_type) return false;
    if (filters.zone !== 'All' && row.zone_id !== filters.zone) return false;
    if (filters.limit_type !== 'All' && row.limit_type !== filters.limit_type) return false;

    if (filters.temperature_min_C != null && row.temperature_C < filters.temperature_min_C) {
      return false;
    }
    if (filters.temperature_max_C != null && row.temperature_C > filters.temperature_max_C) {
      return false;
    }

    // A margin bound only excludes rows that HAVE a margin. A node without a
    // limit is not "below" the bound; it is outside the question.
    if (filters.margin_min_C != null) {
      if (row.margin_C == null || row.margin_C < filters.margin_min_C) return false;
    }
    if (filters.margin_max_C != null) {
      if (row.margin_C == null || row.margin_C > filters.margin_max_C) return false;
    }

    if (filters.source_kind === 'heat_source' && !row.is_heat_source) return false;
    if (filters.source_kind === 'passive' && row.is_heat_source) return false;
    if (row.result_source !== filters.result_source) return false;

    return true;
  });
}

/** The value a row is grouped under — 09 §8. */
export function groupKeyOf(row: TemperatureRow, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'component':
      return row.component_name ?? row.component_id ?? row.node_name;
    case 'category':
      return row.category ?? 'Uncategorised';
    case 'node_type':
      return row.node_type;
    case 'base_zone':
      return row.zone_id ?? 'Unzoned';
    case 'limit_type':
      return row.limit_type ?? 'No Limit';
    default:
      return row.node_name;
  }
}

export interface TemperatureGroup {
  key: string;
  rows: TemperatureRow[];
  max_C: number;
  mean_C: number;
  min_margin_C: number | null;
}

export function groupRows(rows: TemperatureRow[], groupBy: GroupBy): TemperatureGroup[] {
  const buckets = new Map<string, TemperatureRow[]>();
  for (const row of rows) {
    const key = groupKeyOf(row, groupBy);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)?.push(row);
  }

  return [...buckets.entries()]
    .map(([key, entries]) => {
      const margins = entries
        .map((entry) => entry.margin_C)
        .filter((value): value is number => value != null);
      return {
        key,
        rows: entries,
        max_C: Math.max(...entries.map((entry) => entry.temperature_C)),
        mean_C:
          entries.reduce((total, entry) => total + entry.temperature_C, 0) / entries.length,
        min_margin_C: margins.length > 0 ? Math.min(...margins) : null,
      };
    })
    .sort((a, b) => b.max_C - a.max_C);
}

/** Distinct filter values present in the dataset, for the filter selects. */
export function filterOptionsOf(rows: TemperatureRow[]): {
  categories: string[];
  nodeTypes: string[];
  zones: string[];
  limitTypes: string[];
} {
  const categories = new Set<string>();
  const nodeTypes = new Set<string>();
  const zones = new Set<string>();
  const limitTypes = new Set<string>();

  for (const row of rows) {
    if (row.category) categories.add(row.category);
    nodeTypes.add(row.node_type);
    if (row.zone_id) zones.add(row.zone_id);
    if (row.limit_type) limitTypes.add(row.limit_type);
  }

  const sorted = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b));
  return {
    categories: sorted(categories),
    nodeTypes: sorted(nodeTypes),
    zones: sorted(zones),
    limitTypes: sorted(limitTypes),
  };
}

// --- hot node ranking (09 §25, §26) -----------------------------------------

export type RankMode = 'temperature' | 'margin';

/**
 * 09 §26 — this is a TEMPERATURE rank (or a margin rank), not Screen 08's
 * bottleneck rank. Sorting by how hot something is says nothing about how much
 * improving it would help; that question belongs to 08 and is not answered here.
 */
export function rankRows(rows: TemperatureRow[], mode: RankMode): TemperatureRow[] {
  const copy = [...rows];
  if (mode === 'margin') {
    // Nodes without a limit have no margin to rank; they go last rather than
    // being treated as infinitely safe or infinitely at risk.
    copy.sort((a, b) => {
      if (a.margin_C == null && b.margin_C == null) return b.temperature_C - a.temperature_C;
      if (a.margin_C == null) return 1;
      if (b.margin_C == null) return -1;
      return a.margin_C - b.margin_C;
    });
    return copy;
  }
  copy.sort((a, b) => b.temperature_C - a.temperature_C);
  return copy;
}

// --- CSV export (09 §43) ----------------------------------------------------

export function temperatureCsv(rows: TemperatureRow[], scenarioName: string): string {
  const header = [
    'Scenario',
    'Node',
    'Component',
    'Category',
    'Node Type',
    'Temperature (C)',
    'Limit Type',
    'Limit (C)',
    'Margin (C)',
    'Zone',
    'Result Source',
  ];

  const escape = (value: string | undefined) => `"${(value ?? '').replace(/"/g, '""')}"`;

  const lines = rows.map((row) =>
    [
      escape(scenarioName),
      escape(row.node_name),
      escape(row.component_name),
      escape(row.category),
      escape(row.node_type),
      row.temperature_C.toFixed(2),
      escape(row.limit_type),
      row.limit_C == null ? '' : row.limit_C.toFixed(1),
      row.margin_C == null ? '' : row.margin_C.toFixed(2),
      escape(row.zone_id),
      escape(row.result_source),
    ].join(','),
  );

  return [header.join(','), ...lines].join('\n');
}
