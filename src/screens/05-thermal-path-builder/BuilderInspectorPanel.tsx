/**
 * Screen 05 inspector: the floating window for the selected node or edge.
 */

import { Badge } from '@/ui/primitives';
import { FloatingPanel } from '@/ui/FloatingPanel';

import { useNetworkStore } from '@/data/networkStore';

import type { ThermalEdge, ThermalNode, ThermalNetwork } from '@/thermal/types';

import { NodeInspector } from './NodeInspector';
import { EdgeInspector } from './EdgeInspector';
import type { ScenarioBoundaryEdgeView } from './scenarioBoundaryProjection';
import type { ThermalPathBuilder } from './useThermalPathBuilder';

interface BuilderInspectorPanelProps {
  builder: ThermalPathBuilder;
  network: ThermalNetwork;
  selectedNode: ThermalNode | null;
  selectedEdge: ThermalEdge | null;
  selectedScenarioBoundary: ScenarioBoundaryEdgeView | undefined;
}

export function BuilderInspectorPanel({
  builder,
  network,
  selectedNode,
  selectedEdge,
  selectedScenarioBoundary,
}: BuilderInspectorPanelProps) {
  const {
    canvasRef,
    displayValidation,
    focusField,
    readOnly,
    setFocusField,
    setSelection,
  } = builder;
  return (
    <FloatingPanel
      storageKey="tnv.05.inspector"
      defaultWidth={720}
      defaultHeight={960}
      title={selectedNode ? `Node: ${selectedNode.id}` : `Edge: ${selectedEdge!.id}`}
      subtitle={
        selectedNode
          ? selectedNode.name
          : `${network.nodes[selectedEdge!.from]?.name ?? selectedEdge!.from} → ${network.nodes[selectedEdge!.to]?.name ?? selectedEdge!.to}`
      }
      badge={
        selectedNode ? (
          <Badge
            tone={
              selectedNode.disabled
                ? 'neutral'
                : selectedNode.boundary_role === 'placeholder'
                  ? 'warn'
                  : 'ok'
            }
          >
            {selectedNode.disabled
              ? 'DISABLED'
              : selectedNode.boundary_role === 'placeholder'
                ? 'BOUNDARY'
                : 'ACTIVE'}
          </Badge>
        ) : (
          <Badge
            tone={
              !selectedEdge!.enabled
                ? 'neutral'
                : selectedScenarioBoundary?.resolved || selectedEdge!.resolution === 'resolved'
                  ? 'ok'
                  : 'warn'
            }
          >
            {!selectedEdge!.enabled
              ? 'DISABLED'
              : selectedScenarioBoundary?.resolved
                ? 'SCENARIO RESOLVED'
                : selectedEdge!.resolution === 'resolved'
                  ? 'RESOLVED'
                : 'UNRESOLVED'}
          </Badge>
        )
      }
      onClose={() => setSelection(null)}
    >
      {selectedNode ? (
        <NodeInspector
          embedded
          node={selectedNode}
          network={network}
          readOnly={readOnly}
          onPatch={(patch) =>
            useNetworkStore.getState().upsertNode({
              ...selectedNode,
              ...patch,
              origin: selectedNode.origin
                ? { ...selectedNode.origin, modified: true }
                : { kind: 'manual' },
            })
          }
          onFocus={(nodeId) => canvasRef.current?.center(nodeId)}
          onSelectEdge={(edgeId) => setSelection({ kind: 'edge', id: edgeId })}
          onToggleEdge={(edgeId) => {
            const edge = network.edges[edgeId];
            if (edge)
              useNetworkStore.getState().upsertEdge({ ...edge, enabled: !edge.enabled });
          }}
          onDeleteEdge={(edgeId) => useNetworkStore.getState().removeEdge(edgeId)}
          onToggleNode={() => {
            const disabled = !selectedNode.disabled;
            useNetworkStore.getState().mutate((net) => {
              net.nodes[selectedNode.id] = { ...selectedNode, disabled };
              for (const [id, edge] of Object.entries(net.edges)) {
                if (edge.from === selectedNode.id || edge.to === selectedNode.id) {
                  net.edges[id] = { ...edge, enabled: !disabled };
                }
              }
            });
          }}
          onDeleteNode={() => {
            useNetworkStore.getState().removeNode(selectedNode.id);
            setSelection(null);
          }}
        />
      ) : (
        <EdgeInspector
          embedded
          focusField={focusField}
          onFocusFieldConsumed={() => setFocusField(null)}
          edge={selectedEdge!}
          network={network}
          readOnly={readOnly}
          readiness={{
            errors: displayValidation?.errors ?? 0,
            warnings: displayValidation?.warnings ?? 0,
            info: displayValidation?.info ?? 0,
          }}
          scenarioBoundary={selectedScenarioBoundary}
          onPatch={(patch) =>
            useNetworkStore.getState().upsertEdge({ ...selectedEdge!, ...patch })
          }
          onDelete={() => {
            useNetworkStore.getState().removeEdge(selectedEdge!.id);
            setSelection(null);
          }}
          onReverse={() =>
            useNetworkStore.getState().mutate((net) => {
              const edge = net.edges[selectedEdge!.id];
              if (!edge) return;
              net.edges[selectedEdge!.id] = {
                ...edge,
                from: edge.to,
                to: edge.from,
                metadata: {
                  ...edge.metadata,
                  nominal_direction_reversed: true,
                },
              };
            })
          }
        />
      )}
    </FloatingPanel>
  );
}
