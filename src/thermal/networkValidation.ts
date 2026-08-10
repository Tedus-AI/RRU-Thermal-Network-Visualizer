/**
 * Pre-solve network validation — 00 §40.
 * Errors block the solve; warnings and info do not.
 */

import { edgeResistance } from './rth';
import type { ThermalNetwork } from './types';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  node_id?: string;
  edge_id?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  canSolve: boolean;
}

export function validateNetwork(network: ThermalNetwork, scenarioId?: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const nodes = Object.values(network.nodes);
  const edges = Object.values(network.edges);

  const degree = new Map<string, number>();
  const seenPairs = new Map<string, string>();

  for (const edge of edges) {
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) {
      issues.push({
        severity: 'error',
        code: 'MISSING_NODE_REFERENCE',
        edge_id: edge.id,
        message: `Edge "${edge.id}" references a node that does not exist.`,
      });
      continue;
    }

    if (edge.from === edge.to) {
      issues.push({
        severity: 'error',
        code: 'SELF_LOOP',
        edge_id: edge.id,
        message: `Edge "${edge.id}" connects a node to itself.`,
      });
      continue;
    }

    const key = [edge.from, edge.to].sort().join('::');
    const existing = seenPairs.get(key);
    if (existing) {
      issues.push({
        severity: 'info',
        code: 'DUPLICATE_EDGE',
        edge_id: edge.id,
        message:
          `Edges "${existing}" and "${edge.id}" connect the same node pair. ` +
          'This is legal as a parallel path — confirm it is intentional.',
      });
    } else {
      seenPairs.set(key, edge.id);
    }

    const R = edgeResistance(edge, scenarioId);
    if (R != null) {
      if (R < 0) {
        issues.push({
          severity: 'error',
          code: 'NEGATIVE_RTH',
          edge_id: edge.id,
          message: `Edge "${edge.id}" has a negative thermal resistance.`,
        });
      } else if (R === 0) {
        issues.push({
          severity: 'error',
          code: 'ZERO_RTH',
          edge_id: edge.id,
          message: `Edge "${edge.id}" has zero thermal resistance, which short-circuits two nodes.`,
        });
      }
    } else if (edge.enabled) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_RTH',
        edge_id: edge.id,
        message: `Edge "${edge.id}" is enabled but its active source has no value.`,
      });
    }

    if (edge.resolution === 'unresolved') {
      issues.push({
        severity: 'warning',
        code: 'UNRESOLVED_EDGE',
        edge_id: edge.id,
        message:
          edge.resolution_note ??
          `Edge "${edge.id}" is unresolved: its segment heat flow is unknown.`,
      });
    }

    if (R != null && R > 0) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
  }

  const boundaries = nodes.filter(
    (n) => n.boundary_type === 'fixed_temperature' && n.fixed_temperature_C != null,
  );
  if (boundaries.length === 0) {
    issues.push({
      severity: 'error',
      code: 'MISSING_BOUNDARY',
      message: 'Network has no fixed-temperature boundary. Define at least one ambient node.',
    });
  }

  for (const node of nodes) {
    if (!Number.isFinite(node.power_W) || node.power_W < 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_POWER',
        node_id: node.id,
        message: `Node "${node.name}" has an invalid power value.`,
      });
    }
    if ((degree.get(node.id) ?? 0) === 0) {
      issues.push({
        severity: node.power_W > 0 ? 'error' : 'warning',
        code: node.power_W > 0 ? 'DISCONNECTED_HEAT_SOURCE' : 'ORPHAN_NODE',
        node_id: node.id,
        message:
          node.power_W > 0
            ? `Heat source "${node.name}" has no active thermal path.`
            : `Node "${node.name}" is not connected to any active edge.`,
      });
    }
  }

  if (scenarioId) {
    for (const edge of edges) {
      const overrides = edge.scenario_overrides ?? {};
      for (const [id, override] of Object.entries(overrides)) {
        if (override.R_C_per_W != null && override.R_C_per_W < 0) {
          issues.push({
            severity: 'error',
            code: 'INVALID_SCENARIO_OVERRIDE',
            edge_id: edge.id,
            message: `Scenario "${id}" overrides edge "${edge.id}" with a negative resistance.`,
          });
        }
      }
    }
  }

  return { issues, canSolve: !issues.some((i) => i.severity === 'error') };
}
