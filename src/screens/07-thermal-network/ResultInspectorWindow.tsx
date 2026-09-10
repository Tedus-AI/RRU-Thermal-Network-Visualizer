/**
 * The node / edge inspector, as a window.
 *
 * Lifted out of `ThermalNetworkView` so Screen 10's network window can offer
 * the same thing. A graph you cannot interrogate is a picture: clicking a node
 * on Screen 07 opens its temperature, its margin, its links and where its
 * numbers came from, and a copy of that graph on another screen that answers a
 * click with nothing reads as broken rather than as read-only.
 *
 * It floats for the reason it floated on 07: it is a detail view, so it should
 * appear where the reader asked for it and be pushable out of the way, not hold
 * a permanent column the graph could have had.
 */

import { Badge } from '@/ui/primitives';
import { FloatingPanel } from '@/ui/FloatingPanel';
import type { SolverState, ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { EdgeResultInspector } from './EdgeResultInspector';
import { NodeResultInspector } from './NodeResultInspector';

export function ResultInspectorWindow({
  storageKey,
  network,
  limitedNetwork,
  solution,
  stale,
  scenarioId,
  scenarioName,
  solverState,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onClose,
}: {
  storageKey: string;
  network: ThermalNetwork;
  /**
   * The same topology with Screen 04's limits projected onto it, when the
   * caller has one. The node is looked up here so the Limit tab reports the
   * projected limit the graph and the table are already colouring by; the
   * `network` prop stays the raw topology the inspector walks for links.
   */
  limitedNetwork?: ThermalNetwork | null;
  solution: ThermalSolution | null;
  stale: boolean;
  scenarioId: string;
  scenarioName: string;
  solverState: SolverState;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onClose: () => void;
}) {
  const selectedNode = selectedNodeId
    ? ((limitedNetwork ?? network).nodes[selectedNodeId] ?? null)
    : null;
  const selectedEdge = selectedEdgeId ? (network.edges[selectedEdgeId] ?? null) : null;
  if (!selectedNode && !selectedEdge) return null;

  return (
    <FloatingPanel
      storageKey={storageKey}
      defaultWidth={460}
      defaultHeight={640}
      title={selectedEdge ? selectedEdge.id : (selectedNode?.name ?? '')}
      subtitle={
        selectedEdge
          ? `${network.nodes[selectedEdge.from]?.name ?? selectedEdge.from} → ${network.nodes[selectedEdge.to]?.name ?? selectedEdge.to}`
          : (selectedNode?.id ?? '')
      }
      badge={<Badge tone="neutral">{selectedEdge ? 'Edge / 連線' : 'Node / 節點'}</Badge>}
      onClose={onClose}
    >
      <div className="p-3">
        {selectedEdge ? (
          <EdgeResultInspector
            edge={selectedEdge}
            network={network}
            solution={solution}
            stale={stale}
            scenarioId={scenarioId}
            onSelectNode={(nodeId) => {
              onSelectEdge(null);
              onSelectNode(nodeId);
            }}
          />
        ) : selectedNode ? (
          <NodeResultInspector
            node={selectedNode}
            network={network}
            solution={solution}
            stale={stale}
            scenarioName={scenarioName}
            solverState={solverState}
            onSelectEdge={(edgeId) => {
              onSelectNode(null);
              onSelectEdge(edgeId);
            }}
          />
        ) : null}
      </div>
    </FloatingPanel>
  );
}
