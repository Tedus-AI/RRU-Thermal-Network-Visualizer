/**
 * One row per solved node: its temperature, its limit, and the margin between.
 *
 * Assembled READ-ONLY from the Screen 07 solution, the Screen 05 topology and
 * the component records — the only place the three meet. Nothing here solves
 * and nothing writes back.
 *
 * It was written for Screen 09, which binned these rows into a histogram and
 * took statistics over them. That screen is gone: a node is a modelling choice
 * rather than a member of a physical population — one part in the STARKCORE
 * model contributes twenty nodes and another three — so an average or a P95
 * over them described how finely the network had been drawn, not how hot the
 * machine ran. What survived is the row itself, which the overview layer, the
 * report and the CSV export are all built on, and the scope, filter, group,
 * rank and CSV machinery that only ever served those five tabs is gone with
 * the screen.
 *
 * Naming note, as in 06–08: the specification sketches the row in camelCase and
 * the codebase settled on snake_case in Screen 02. The field semantics are
 * followed exactly.
 */

import type { Component } from '@/domain/component';
import type { ThermalNetwork, ThermalNode } from '../types';
import type { ThermalSolution } from '../solver/solverTypes';
import { projectComponentLimits } from '../graph/componentProjection';

export const RESULT_SOURCES = ['analytical', 'flotherm', 'measurement'] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];

export type LimitType = 'Tj' | 'Tc' | 'Tb' | 'Ts' | 'Custom';

/** 09 §31 — the display classification, not a product pass/fail (09 §32). */
export type LimitStatus = 'within_limit' | 'near_limit' | 'over_limit' | 'no_limit';

/** 09 §32 — V1 display rule. A project setting may override it in future. */
export const NEAR_LIMIT_MARGIN_C = 10;

/**
 * Default "runs hot" threshold for the Nodes Above Warning count (09 §5).
 *
 * Screen 09 lets the engineer move it; Screen 10 has no controls at all
 * (10 §24) and reads this default. Both take it from here so the two screens
 * cannot quietly disagree about which nodes are above warning.
 */
export const WARNING_TEMPERATURE_C = 90;

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

export function isBoundaryNode(node: ThermalNode): boolean {
  return (
    node.boundary_type === 'fixed_temperature' ||
    node.boundary_role === 'placeholder' ||
    node.type === 'ambient'
  );
}

export function statusFor(margin_C: number | undefined): LimitStatus {
  if (margin_C == null || !Number.isFinite(margin_C)) return 'no_limit';
  if (margin_C < 0) return 'over_limit';
  if (margin_C <= NEAR_LIMIT_MARGIN_C) return 'near_limit';
  return 'within_limit';
}

/** Every solved node as a row, before scope and filters. */
export function buildTemperatureDataset(input: {
  network: ThermalNetwork;
  solution: ThermalSolution;
  components: Component[];
}): TemperatureRow[] {
  const byId = new Map(input.components.map((component) => [component.id, component]));
  const network = projectComponentLimits(input.network, input.components);

  return Object.values(network.nodes)
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
