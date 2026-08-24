/**
 * Graph validation before boundary conditions — 05 §33, §34, §35.
 *
 * The judgement call this file encodes: a CYCLE IS NOT AN ERROR. Zone-to-zone
 * coupling (RF_LEFT ↔ DIGITAL ↔ POWER) is real physics, and rejecting it would
 * force the tool into a tree, which 00 Rule 5 forbids. Only self-loops, broken
 * references and invalid numbers are structural errors here; solver singularity
 * is Screen 07's concern (05 §34).
 */

import { activeRth } from '../rth';
import type { ThermalNetwork, ThermalNode } from '../types';

export type Severity = 'error' | 'warning' | 'info';

export interface GraphIssue {
  severity: Severity;
  code: string;
  message: string;
  messageZh: string;
  nodeId?: string;
  edgeId?: string;
}

export interface GraphValidationResult {
  issues: GraphIssue[];
  errors: number;
  warnings: number;
  info: number;
  /** Blocking errors gate Save & Continue (05 §54, AC-05-44). */
  canContinue: boolean;
}

/** Nodes that can absorb heat once Screen 06 configures them. */
function isBoundarySide(node: ThermalNode): boolean {
  return (
    node.boundary_role === 'placeholder' ||
    node.boundary_type === 'fixed_temperature' ||
    node.type === 'ambient' ||
    node.type === 'fin_surface'
  );
}

/** Undirected reachability — heat conduction has no preferred direction. */
function reachesBoundary(network: ThermalNetwork, startId: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of Object.values(network.edges)) {
    if (!edge.enabled) continue;
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    (adjacency.get(edge.from) ?? adjacency.set(edge.from, []).get(edge.from)!).push(edge.to);
    (adjacency.get(edge.to) ?? adjacency.set(edge.to, []).get(edge.to)!).push(edge.from);
  }

  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = network.nodes[current];
    if (node && current !== startId && isBoundarySide(node)) return true;
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export function validateGraph(network: ThermalNetwork): GraphValidationResult {
  const issues: GraphIssue[] = [];
  const nodes = Object.values(network.nodes);
  const edges = Object.values(network.edges);

  const degree = new Map<string, number>();
  const signatures = new Map<string, string>();

  for (const edge of edges) {
    // --- Structural errors ---------------------------------------------
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) {
      issues.push({
        severity: 'error',
        code: 'MISSING_NODE_REFERENCE',
        edgeId: edge.id,
        message: `Edge "${edge.id}" references a node that does not exist.`,
        messageZh: `連線「${edge.id}」參照到不存在的節點。`,
      });
      continue;
    }

    if (edge.from === edge.to) {
      issues.push({
        severity: 'error',
        code: 'SELF_LOOP',
        edgeId: edge.id,
        message: `Edge "${edge.id}" connects a node to itself.`,
        messageZh: `連線「${edge.id}」的兩端是同一個節點。`,
      });
      continue;
    }

    const R = activeRth(edge.rth);
    if (R != null && R < 0) {
      issues.push({
        severity: 'error',
        code: 'NEGATIVE_RTH',
        edgeId: edge.id,
        message: `Edge "${edge.id}" has a negative thermal resistance.`,
        messageZh: `連線「${edge.id}」的熱阻為負值。`,
      });
    }

    for (const [key, value] of Object.entries(edge.parameters ?? {})) {
      if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_PARAMETER',
          edgeId: edge.id,
          message: `Edge "${edge.id}" parameter "${key}" is not a valid positive number.`,
          messageZh: `連線「${edge.id}」的參數「${key}」不是有效正數。`,
        });
      }
    }

    // --- Warnings --------------------------------------------------------
    if (edge.enabled && edge.resolution === 'unresolved') {
      const boundary = edge.method === 'convection_hA' || edge.method === 'radiation_hA';
      issues.push({
        severity: 'warning',
        code: boundary ? 'BOUNDARY_NOT_CONFIGURED' : 'UNRESOLVED_RTH',
        edgeId: edge.id,
        message: boundary
          ? `Boundary not configured: ${network.nodes[edge.from].name} → ${network.nodes[edge.to].name}.`
          : `Unresolved Rth: ${network.nodes[edge.from].name} → ${network.nodes[edge.to].name}.`,
        messageZh: boundary
          ? `邊界條件尚未設定：${network.nodes[edge.from].name} → ${network.nodes[edge.to].name}。`
          : `熱阻尚未解析：${network.nodes[edge.from].name} → ${network.nodes[edge.to].name}。`,
      });
    }

    if (edge.rth.active_source === 'Manual' && !edge.rth.provenance.Manual?.reference) {
      issues.push({
        severity: 'warning',
        code: 'MANUAL_WITHOUT_REFERENCE',
        edgeId: edge.id,
        message: `Manual Rth on "${edge.id}" has no source or reference.`,
        messageZh: `連線「${edge.id}」的手動熱阻缺少來源或依據。`,
      });
    }

    // 05 §35 — convection and radiation between the same pair is legitimate;
    // only an identical type AND method is suspicious.
    const signature = `${[edge.from, edge.to].sort().join('::')}::${edge.type}::${edge.method}`;
    const existing = signatures.get(signature);
    if (existing) {
      issues.push({
        severity: 'warning',
        code: 'POSSIBLE_DUPLICATE_EDGE',
        edgeId: edge.id,
        message: `Possible duplicate edge: "${existing}" and "${edge.id}" share type and method.`,
        messageZh: `可能重複的連線：「${existing}」與「${edge.id}」型別與方法相同。`,
      });
    } else {
      signatures.set(signature, edge.id);
    }

    if (edge.enabled) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
  }

  for (const node of nodes) {
    // A node the engineer switched off is deliberately outside the active
    // network; it must not raise orphan or port errors (05 §51).
    if (node.disabled) continue;

    const isSource = node.power_W > 0;

    if (isSource && (degree.get(node.id) ?? 0) === 0) {
      issues.push({
        severity: 'error',
        code: 'ORPHAN_HEAT_SOURCE',
        nodeId: node.id,
        message: `Heat source "${node.name}" has no thermal path.`,
        messageZh: `熱源「${node.name}」沒有任何熱路徑。`,
      });
    } else if (isSource && !reachesBoundary(network, node.id)) {
      issues.push({
        severity: 'error',
        code: 'NO_PATH_TO_BOUNDARY',
        nodeId: node.id,
        message: `Heat source "${node.name}" has no path toward the boundary-side structure.`,
        messageZh: `熱源「${node.name}」無法連通至邊界側結構。`,
      });
    }

    // A required port left dangling means the subgraph is not attached yet.
    for (const port of node.ports ?? []) {
      if (port.connected_to) continue;
      issues.push({
        severity: port.required ? 'error' : 'warning',
        code: 'UNCONNECTED_PORT',
        nodeId: node.id,
        message: `Port ${port.kind} on "${node.name}" is not connected.`,
        messageZh: `「${node.name}」的 ${port.kind} 連接埠尚未連線。`,
      });
    }

    if (node.boundary_role === 'placeholder') {
      issues.push({
        severity: 'warning',
        code: 'BOUNDARY_PLACEHOLDER',
        nodeId: node.id,
        message: `"${node.name}" is a boundary placeholder — configure it in Screen 06.`,
        messageZh: `「${node.name}」為邊界佔位節點，請於 Screen 06 設定。`,
      });
    }

    if (!isSource && (degree.get(node.id) ?? 0) === 0) {
      issues.push({
        severity: 'info',
        code: 'ISOLATED_NODE',
        nodeId: node.id,
        message: `"${node.name}" is not connected to anything.`,
        messageZh: `「${node.name}」尚未與任何節點連線。`,
      });
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const info = issues.filter((issue) => issue.severity === 'info').length;

  return { issues, errors, warnings, info, canContinue: errors === 0 };
}

/** Counts for the readiness KPI row (05 §36). */
export function networkKpis(network: ThermalNetwork, totalComponents: number) {
  const nodes = Object.values(network.nodes);
  const edges = Object.values(network.edges);
  const modeled = new Set(
    nodes.map((node) => node.component_ref).filter((ref): ref is string => Boolean(ref)),
  ).size;

  const unconnectedPorts = nodes.reduce(
    (sum, node) => sum + (node.ports ?? []).filter((port) => !port.connected_to).length,
    0,
  );
  const unresolved = edges.filter(
    (edge) => edge.enabled && edge.resolution === 'unresolved',
  ).length;

  return {
    componentsModeled: modeled,
    componentsTotal: totalComponents,
    nodes: nodes.length,
    edges: edges.length,
    unconnectedPorts,
    unresolvedRth: unresolved,
  };
}
