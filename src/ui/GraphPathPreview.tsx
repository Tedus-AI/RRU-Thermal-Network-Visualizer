import { useMemo, useRef } from 'react';
import type { ThermalNetwork } from '@/thermal/types';
import type { GraphPath } from './graphExplorerModel';
import { ThermalGraphCanvas } from '@/screens/05-thermal-path-builder/ThermalGraphCanvas';
import type { ScenarioBoundaryEdgeView } from '@/screens/05-thermal-path-builder/scenarioBoundaryProjection';
import { SolvedGraphCanvas } from '@/screens/07-thermal-network/SolvedGraphCanvas';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { ResultMode } from '@/screens/07-thermal-network/resultViewModel';
import type { GraphDisplayOptions } from '@/screens/07-thermal-network/SolvedGraphCanvas';

const EMPTY = new Set<string>();
const noop = () => undefined;
export interface GraphPreviewOptions {
  scenarioBoundaryEdges?: ReadonlyMap<string, ScenarioBoundaryEdgeView>;
  solved?: {
    solution: ThermalSolution | null;
    mode: ResultMode;
    display: GraphDisplayOptions;
    scenarioId: string;
  };
  showLabels?: boolean;
  showPorts?: boolean;
}

/** Actual component-local graph, not a synthetic series chain or averaged model. */
export function GraphPathPreview({
  network,
  path,
  scenarioBoundaryEdges,
  solved,
  showLabels = true,
  showPorts = true,
}: GraphPreviewOptions & { network: ThermalNetwork; path: GraphPath }) {
  const pending = useRef<string | null>(null);
  const hidden = useMemo(() => {
    const owned = new Set(path.nodeIds);
    return new Set(Object.keys(network.nodes).filter((id) => !owned.has(id)));
  }, [network, path]);
  return (
    <div
      className="pointer-events-none relative h-36 min-w-0 overflow-hidden border-t border-slate-100 bg-white"
      aria-hidden="true"
    >
      {solved ? (
        <SolvedGraphCanvas
          network={network}
          {...solved}
          selectedNodeId={null}
          selectedEdgeId={null}
          tool="select"
          layoutMode="Auto"
          hiddenComponentIds={EMPTY}
          extraHiddenNodeIds={hidden}
          focusKey={path.key}
          onSelectNode={noop}
          onSelectEdge={noop}
          onZoomChange={noop}
        />
      ) : (
        <ThermalGraphCanvas
          network={network}
          selection={null}
          tool="select"
          showPorts={showPorts}
          showLabels={showLabels}
          layoutMode="Auto"
          readOnly
          hiddenComponentIds={EMPTY}
          extraHiddenNodeIds={hidden}
          focusKey={path.key}
          scenarioBoundaryEdges={scenarioBoundaryEdges}
          onSelect={noop}
          onNodeMoved={noop}
          onConnect={noop}
          onContextMenu={noop}
          onZoomChange={noop}
          onLayout={noop}
          pendingSourceRef={pending}
        />
      )}
    </div>
  );
}
