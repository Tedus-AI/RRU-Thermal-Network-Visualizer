/**
 * 全域熱網路 — Screen 07's solved network, over Screen 10.
 *
 * It began as a bare canvas locked to Temperature, which was too little: the
 * graph on 07 is not just a picture, it is the four ways of colouring the same
 * topology plus a click that opens any node's result. A copy with one colouring
 * and a click that does nothing is a screenshot.
 *
 * So it carries the metric switch, the legend that says what the current
 * colouring means, and the inspector — all the SAME components Screen 07 draws,
 * never copies of them. What it deliberately does not carry is the rest of 07's
 * toolbar: exports, layout choice, component visibility, fullscreen, the
 * Results button. Those are the tools you use while BUILDING a reading of the
 * network; this window is opened from a conclusion, to look at the thing the
 * conclusion is about.
 */

import { useState } from 'react';

import { Badge } from '@/ui/primitives';
import { FloatingPanel } from '@/ui/FloatingPanel';
import { useRememberedFlag } from '@/ui/rememberedFlag';
import type { SolverState, ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { GraphLegend } from '@/screens/07-thermal-network/GraphLegend';
import { ResultInspectorWindow } from '@/screens/07-thermal-network/ResultInspectorWindow';
import { ResultModePills } from '@/screens/07-thermal-network/ResultModePills';
import {
  SolvedGraphCanvas,
  legendFor,
  type GraphDisplayOptions,
} from '@/screens/07-thermal-network/SolvedGraphCanvas';
import { OVERVIEW_RESULT_MODES, type ResultMode } from '@/screens/07-thermal-network/resultViewModel';

/**
 * Labels, power, limits and boundary nodes all on, which is what makes the
 * picture readable without the toggles this window does not carry.
 */
const DISPLAY: GraphDisplayOptions = {
  showLabels: true,
  showPower: true,
  showLimits: true,
  showBoundary: true,
};
const NO_HIDDEN: ReadonlySet<string> = new Set<string>();

export function NetworkWindow({
  network,
  limitedNetwork,
  solution,
  stale,
  scenarioId,
  scenarioName,
  solverState,
  onClose,
}: {
  network: ThermalNetwork;
  /** The topology with Screen 04's limits projected onto it, when there is one. */
  limitedNetwork: ThermalNetwork | null;
  solution: ThermalSolution | null;
  stale: boolean;
  scenarioId: string;
  scenarioName: string;
  solverState: SolverState;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ResultMode>('temperature');
  const [legendOpen, setLegendOpen] = useRememberedFlag('10.network.legend', false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const shown = limitedNetwork ?? network;
  const solved = stale ? null : solution;

  return (
    <>
      <FloatingPanel
        title="全域熱網路"
        subtitle={`Whole thermal network · ${scenarioName} · ${Object.keys(network.nodes).length} nodes`}
        badge={<Badge tone={stale ? 'neutral' : 'ok'}>{stale ? 'STALE' : 'SOLVED'}</Badge>}
        storageKey="tnv.10.network"
        defaultWidth={1180}
        defaultHeight={820}
        bodyClassName="relative flex min-h-0 flex-col overflow-hidden p-0"
        onClose={onClose}
      >
        <div className="shrink-0 border-b border-line px-3 py-2">
          <ResultModePills
            modes={OVERVIEW_RESULT_MODES}
            mode={mode}
            hasResult={Boolean(solved)}
            onMode={setMode}
          />
        </div>

        {/* Pinned rather than flowed, for the same reason Screen 08 pins it:
            Cytoscape sizes its layers to the client box, and inside a
            scrollable parent that is a feedback loop at fractional heights. */}
        <div className="relative min-h-0 flex-1">
          <SolvedGraphCanvas
            network={shown}
            solution={solved}
            mode={mode}
            display={DISPLAY}
            scenarioId={scenarioId}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            tool="select"
            layoutMode="Auto"
            hiddenComponentIds={NO_HIDDEN}
            alertOverLimit
            // Plain setters, as on Screen 07: the canvas already clears the
            // other selection itself, so a wrapper that also cleared it would
            // undo the node it had just set.
            onSelectNode={setSelectedNodeId}
            onSelectEdge={setSelectedEdgeId}
            onZoomChange={() => {}}
          />
          <GraphLegend
            rows={legendFor(mode, solved)}
            open={legendOpen}
            onToggle={() => setLegendOpen((value) => !value)}
          />
        </div>
      </FloatingPanel>

      {/* Outside the panel, not inside it: it is its own window on 07 too, and
          a detail view nested in the graph it describes cannot be pushed off
          the node it is describing. */}
      <ResultInspectorWindow
        storageKey="tnv.10.inspector"
        network={network}
        limitedNetwork={limitedNetwork}
        solution={solved}
        stale={stale}
        scenarioId={scenarioId}
        scenarioName={scenarioName}
        solverState={solverState}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onSelectNode={setSelectedNodeId}
        onSelectEdge={setSelectedEdgeId}
        onClose={() => {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }}
      />
    </>
  );
}
