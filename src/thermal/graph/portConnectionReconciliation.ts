/**
 * Keeps the two persisted representations of a Screen 05 port connection in
 * sync: the visible EDGE_PORT_* edge and ThermalPort.connected_to.
 *
 * Older projects can contain the edge without the port reference after a
 * component subgraph rebuild. Cytoscape then draws a connection while graph
 * validation reports the port as unconnected. This repair is deliberately
 * conservative: it only infers a target when the edge identifies its port or
 * when one remaining port has exactly one remaining port edge.
 */

import { PORT_KINDS, type PortKind, type ThermalEdge, type ThermalNetwork } from '../types';

export type PortConnectionRepairReason = 'edge_present' | 'edge_missing';

export interface PortConnectionRepair {
  nodeId: string;
  portKind: PortKind;
  previousTarget: string | null;
  nextTarget: string | null;
  reason: PortConnectionRepairReason;
}

interface PortEdgeCandidate {
  edge: ThermalEdge;
  targetId: string;
  portKind: PortKind | null;
}

function isPortKind(value: unknown): value is PortKind {
  return typeof value === 'string' && PORT_KINDS.includes(value as PortKind);
}

function edgePortKind(edge: ThermalEdge): PortKind | null {
  const value = edge.metadata?.port_kind;
  if (isPortKind(value)) return value;
  // Golden Demo and other legacy writers encoded the port kind in the id.
  return PORT_KINDS.find((kind) => edge.id.endsWith(`_${kind}`)) ?? null;
}

function candidatesForNode(network: ThermalNetwork, nodeId: string): PortEdgeCandidate[] {
  const candidates: PortEdgeCandidate[] = [];
  for (const edge of Object.values(network.edges)) {
    if (!edge.enabled || !edge.id.startsWith('EDGE_PORT_')) continue;
    const targetId = edge.from === nodeId ? edge.to : edge.to === nodeId ? edge.from : null;
    if (!targetId || targetId === nodeId || !network.nodes[targetId]) continue;
    candidates.push({ edge, targetId, portKind: edgePortKind(edge) });
  }
  return candidates;
}

/**
 * Repairs port metadata in place and returns an audit trail of every change.
 * Edge direction is nominal, so reversed port edges remain valid connections.
 */
export function reconcilePortConnections(network: ThermalNetwork): PortConnectionRepair[] {
  const repairs: PortConnectionRepair[] = [];

  for (const node of Object.values(network.nodes)) {
    if (!node.ports?.length) continue;

    const candidates = candidatesForNode(network, node.id);
    const claimedEdgeIds = new Set<string>();
    const nextTargets = node.ports.map(() => null as string | null);

    // Preserve an existing reference when a matching visible edge still exists.
    node.ports.forEach((port, index) => {
      if (!port.connected_to) return;
      const match = candidates.find(
        (candidate) =>
          !claimedEdgeIds.has(candidate.edge.id) &&
          candidate.targetId === port.connected_to &&
          (candidate.portKind == null || candidate.portKind === port.kind),
      );
      if (!match) return;
      claimedEdgeIds.add(match.edge.id);
      nextTargets[index] = match.targetId;
    });

    // New edges carry port_kind, so multi-port nodes can be repaired exactly.
    node.ports.forEach((port, index) => {
      if (nextTargets[index]) return;
      const matches = candidates.filter(
        (candidate) =>
          !claimedEdgeIds.has(candidate.edge.id) && candidate.portKind === port.kind,
      );
      if (matches.length !== 1) return;
      claimedEdgeIds.add(matches[0].edge.id);
      nextTargets[index] = matches[0].targetId;
    });

    // Legacy edges have no port_kind. Infer only an unambiguous one-to-one pair.
    const unresolvedPortIndexes = node.ports
      .map((_, index) => index)
      .filter((index) => nextTargets[index] == null);
    const unclaimedCandidates = candidates.filter(
      (candidate) => !claimedEdgeIds.has(candidate.edge.id),
    );
    if (unresolvedPortIndexes.length === 1 && unclaimedCandidates.length === 1) {
      const index = unresolvedPortIndexes[0];
      nextTargets[index] = unclaimedCandidates[0].targetId;
    }

    node.ports = node.ports.map((port, index) => {
      const nextTarget = nextTargets[index];
      if (port.connected_to === nextTarget) return port;
      repairs.push({
        nodeId: node.id,
        portKind: port.kind,
        previousTarget: port.connected_to,
        nextTarget,
        reason: nextTarget ? 'edge_present' : 'edge_missing',
      });
      return { ...port, connected_to: nextTarget };
    });
  }

  return repairs;
}
