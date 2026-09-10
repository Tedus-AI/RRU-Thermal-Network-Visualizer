/**
 * 全域熱網路 — Screen 07's solved network, over Screen 10.
 *
 * It began as a bare canvas locked to Temperature, which was too little: the
 * graph on 07 is not just a picture, it is four ways of colouring the same
 * topology, a click that opens any node's result, and the tools for getting
 * around it and out of it. A copy with one colouring and a click that does
 * nothing is a screenshot.
 *
 * So it carries all of that — the metric switch, the legend, the inspector,
 * layout, zoom, component visibility, both exports and fullscreen — using the
 * SAME components Screen 07 draws, never copies of them. What it does not
 * carry is 07's Results button: that opens the result table, and Screen 10
 * already has its own door to it, in candy yellow, beside the one that opened
 * this window.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/ui/primitives';
import { ComponentVisibilityPanel } from '@/ui/ComponentVisibilityPanel';
import { FloatingPanel } from '@/ui/FloatingPanel';
import { useRememberedFlag } from '@/ui/rememberedFlag';
import type { Component } from '@/domain/component';
import type { SolverState, ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { GraphLegend } from '@/screens/07-thermal-network/GraphLegend';
import { GraphToolStrip } from '@/screens/07-thermal-network/GraphToolStrip';
import { ResultInspectorWindow } from '@/screens/07-thermal-network/ResultInspectorWindow';
import { ResultModePills } from '@/screens/07-thermal-network/ResultModePills';
import { useGraphExports } from '@/screens/07-thermal-network/useGraphExports';
import {
  SolvedGraphCanvas,
  legendFor,
  type GraphDisplayOptions,
  type SolvedCanvasTool,
  type SolvedGraphHandle,
} from '@/screens/07-thermal-network/SolvedGraphCanvas';
import {
  OVERVIEW_RESULT_MODES,
  type ResultMode,
} from '@/screens/07-thermal-network/resultViewModel';

/**
 * Labels, power, limits and boundary nodes all on, which is what makes the
 * picture readable without the display toggles this window does not carry.
 */
const DISPLAY: GraphDisplayOptions = {
  showLabels: true,
  showPower: true,
  showLimits: true,
  showBoundary: true,
};

export function NetworkWindow({
  network,
  limitedNetwork,
  components,
  solution,
  stale,
  scenarioId,
  scenarioName,
  projectName,
  solverState,
  nodeCount,
  edgeCount,
  onClose,
}: {
  network: ThermalNetwork;
  /** The topology with Screen 04's limits projected onto it, when there is one. */
  limitedNetwork: ThermalNetwork | null;
  components: readonly Component[];
  solution: ThermalSolution | null;
  stale: boolean;
  scenarioId: string;
  scenarioName: string;
  projectName: string;
  solverState: SolverState;
  nodeCount: number;
  edgeCount: number;
  onClose: () => void;
}) {
  const canvasRef = useRef<SolvedGraphHandle | null>(null);

  const [mode, setMode] = useState<ResultMode>('temperature');
  const [legendOpen, setLegendOpen] = useRememberedFlag('10.network.legend', false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [tool, setTool] = useState<SolvedCanvasTool>('select');
  const [zoom, setZoom] = useState(1);
  const [layoutMode, setLayoutMode] = useState('Auto');
  const [fullscreen, setFullscreen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [hiddenComponentIds, setHiddenComponentIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const shown = limitedNetwork ?? network;
  const solved = stale ? null : solution;

  // Only components this network actually models can be filtered — the panel
  // must not offer to hide something that was never drawn. Same key Screen 07
  // reads.
  const modeledIds = useMemo(() => new Set(Object.keys(shown.templates ?? {})), [shown.templates]);
  const modeledComponents = useMemo(
    () => components.filter((component) => modeledIds.has(component.id)),
    [components, modeledIds],
  );

  const toggleComponentVisible = useCallback((componentId: string) => {
    setHiddenComponentIds((current) => {
      const next = new Set(current);
      if (!next.delete(componentId)) next.add(componentId);
      return next;
    });
  }, []);

  const { exporting, exportJpg, exportPdf } = useGraphExports({
    canvasRef,
    graphNetwork: shown,
    components,
    solution,
    stale,
    mode,
    display: DISPLAY,
    layoutMode,
    scenarioId,
    scenarioName,
    projectName,
    nodeCount,
    edgeCount,
  });

  // Escape leaves fullscreen before it reaches the panel and closes the whole
  // window — otherwise the only way out of fullscreen is finding the button
  // again on a toolbar that now spans the screen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setFullscreen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreen]);

  const graph = (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <ResultModePills
          modes={OVERVIEW_RESULT_MODES}
          mode={mode}
          hasResult={Boolean(solved)}
          onMode={setMode}
        />
        <div className="ml-auto">
          <GraphToolStrip
            tool={tool}
            zoom={zoom}
            layoutMode={layoutMode}
            fullscreen={fullscreen}
            componentVisibilityOpen={visibilityOpen}
            hiddenComponentCount={hiddenComponentIds.size}
            exporting={exporting}
            onExportJpg={exportJpg}
            onExportPdf={exportPdf}
            onToggleComponentVisibility={() => setVisibilityOpen((value) => !value)}
            onTool={setTool}
            onZoom={(delta) => canvasRef.current?.zoomBy(delta)}
            onLayoutMode={(next) => {
              setLayoutMode(next);
              canvasRef.current?.relayout(next);
            }}
            onRelayout={() => canvasRef.current?.relayout(layoutMode)}
            onToggleFullscreen={() => setFullscreen((value) => !value)}
          />
        </div>
      </div>

      {/* Pinned rather than flowed, for the same reason Screen 08 pins it:
          Cytoscape sizes its layers to the client box, and inside a scrollable
          parent that is a feedback loop at fractional heights. */}
      <div className="relative min-h-0 flex-1">
        <SolvedGraphCanvas
          ref={canvasRef}
          network={shown}
          solution={solved}
          mode={mode}
          display={DISPLAY}
          scenarioId={scenarioId}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          tool={tool}
          layoutMode={layoutMode}
          hiddenComponentIds={hiddenComponentIds}
          alertOverLimit
          // Plain setters, as on Screen 07: the canvas already clears the other
          // selection itself, so a wrapper that also cleared it would undo the
          // node it had just set.
          onSelectNode={setSelectedNodeId}
          onSelectEdge={setSelectedEdgeId}
          onZoomChange={setZoom}
        />
        <GraphLegend
          rows={legendFor(mode, solved)}
          open={legendOpen}
          onToggle={() => setLegendOpen((value) => !value)}
        />
        {visibilityOpen && (
          <ComponentVisibilityPanel
            components={modeledComponents}
            hiddenIds={hiddenComponentIds}
            onToggleVisible={toggleComponentVisible}
            onShowAll={() => setHiddenComponentIds(new Set())}
            onHideAll={() => setHiddenComponentIds(new Set(modeledComponents.map((c) => c.id)))}
            onClose={() => setVisibilityOpen(false)}
            placement="bottom-left"
          />
        )}
      </div>
    </>
  );

  return (
    <>
      {fullscreen ? (
        // The panel chrome would only shrink the thing fullscreen exists to
        // enlarge, so the graph takes the viewport directly — as on Screen 07.
        <div className="fixed inset-0 z-40 flex flex-col bg-surface">{graph}</div>
      ) : (
        <FloatingPanel
          title="全域熱網路"
          subtitle={`Whole thermal network · ${scenarioName} · ${nodeCount} nodes`}
          badge={<Badge tone={stale ? 'neutral' : 'ok'}>{stale ? 'STALE' : 'SOLVED'}</Badge>}
          storageKey="tnv.10.network"
          defaultWidth={1180}
          defaultHeight={820}
          bodyClassName="relative flex min-h-0 flex-col overflow-hidden p-0"
          onClose={onClose}
        >
          {graph}
        </FloatingPanel>
      )}

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
