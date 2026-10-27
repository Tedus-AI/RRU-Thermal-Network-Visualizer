/**
 * Screen 05 canvas column: the graph toolbar, the explorer controls, and the
 * canvas with its overlays — legend, validation panel, empty state, context
 * menu.
 */

import { projectPath } from '@/app/navigation';

import { useNetworkStore } from '@/data/networkStore';

import { manualId } from '@/thermal/graph/idFactory';
import type { ThermalNode, ThermalNetwork } from '@/thermal/types';
import type { GraphSelection } from './ThermalGraphCanvas';

import { GraphToolbar } from './GraphToolbar';
import { GraphExplorerControls, GraphGroupOverview, GraphToolbarBridge } from '@/ui/GraphExplorer';
import { ComponentVisibilityPanel } from '@/ui/ComponentVisibilityPanel';
import { ThermalGraphCanvas } from './ThermalGraphCanvas';
import { NetworkValidationPanel } from './NetworkValidationPanel';
import { EmptyNetworkState } from './GenerateNetworkPreview';
import { Legend } from './builderBlocks';
import type { ThermalPathBuilder } from './useThermalPathBuilder';

interface BuilderCanvasAreaProps {
  builder: ThermalPathBuilder;
  network: ThermalNetwork;
  projectId: string;
  isEmpty: boolean;
  onValidate: () => void;
  /** A click on the graph; the page routes a boundary surface to its own panel. */
  onSelectObject?: (selection: GraphSelection) => void;
}

export function BuilderCanvasArea({
  builder,
  network,
  projectId,
  isEmpty,
  onValidate: handleValidate,
  onSelectObject,
}: BuilderCanvasAreaProps) {
  const {
    autoConnectSuggested,
    canvasRef,
    componentVisibilityOpen,
    components,
    contextMenu,
    displayValidation,
    editing,
    enabledComponents,
    explorer,
    focusIssue,
    fullscreen,
    future,
    handleApplyPreset,
    handleConnect,
    hiddenComponentIds,
    hiddenModeledComponentIds,
    layoutMode,
    modeledComponents,
    navigate,
    past,
    pendingSourceRef,
    readOnly,
    scenarioBoundaryEdges,
    selection,
    setAddNodeDraft,
    setComponentVisibilityOpen,
    setContextMenu,
    setEditing,
    setFullscreen,
    setHiddenComponentIds,
    setLayoutMode,
    setSelection,
    setShowGenerate,
    setShowLabels,
    setShowPorts,
    setStep,
    setTool,
    setZoom,
    showLabels,
    showPorts,
    toggleComponentVisible,
    tool,
    zoom,
  } = builder;
  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-line bg-surface ${fullscreen ? 'rounded-none' : 'rounded-lg'}`}
    >
      <GraphToolbarBridge explorer={explorer}>
      <GraphToolbar
        tool={tool}
        layoutMode={layoutMode}
        zoom={zoom}
        showPorts={showPorts}
        showLabels={showLabels}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        readOnly={readOnly}
        structureLocked={!editing}
        onTool={(next) => {
          if (next === 'add-node' || next === 'add-edge' || next === 'connect') explorer.setView('full');
          setTool(next);
          if (next === 'add-node') setAddNodeDraft({ name: '', type: 'custom' });
        }}
        onLayoutMode={(mode) => {
          setLayoutMode(mode);
          canvasRef.current?.runLayout(mode);
        }}
        onAutoLayout={() => canvasRef.current?.runLayout(layoutMode)}
        onAutoConnect={autoConnectSuggested}
        onFit={() => explorer.showFull(() => canvasRef.current?.fit())}
        onZoom={(delta) => canvasRef.current?.zoomBy(delta)}
        onUndo={() => useNetworkStore.getState().undo()}
        onRedo={() => useNetworkStore.getState().redo()}
        onValidate={handleValidate}
        onTogglePorts={() => setShowPorts((value) => !value)}
        onToggleLabels={() => setShowLabels((value) => !value)}
        componentVisibilityOpen={componentVisibilityOpen}
        hiddenComponentCount={hiddenModeledComponentIds.size}
        onToggleComponentVisibility={() =>
          setComponentVisibilityOpen((value) => !value)
        }
        fullscreen={fullscreen}
        onToggleFullscreen={() => {
          if (fullscreen) setComponentVisibilityOpen(false);
          setFullscreen((value) => !value);
        }}
      />

      </GraphToolbarBridge>
      <GraphExplorerControls explorer={explorer} components={components} hiddenIds={hiddenComponentIds} />
      <div className="relative min-h-0 flex-1">
        <GraphGroupOverview explorer={explorer} components={components} hiddenIds={hiddenComponentIds} showLabels={showLabels} showPorts={showPorts} scenarioBoundaryEdges={scenarioBoundaryEdges} />
        {fullscreen && componentVisibilityOpen && (
          <ComponentVisibilityPanel
            components={modeledComponents}
            hiddenIds={hiddenModeledComponentIds}
            onToggleVisible={toggleComponentVisible}
            onShowAll={() => setHiddenComponentIds(new Set())}
            onHideAll={() => setHiddenComponentIds(new Set(modeledComponents.map((c) => c.id)))}
            onClose={() => setComponentVisibilityOpen(false)}
          />
        )}
        {isEmpty ? (
          <EmptyNetworkState
            hasComponents={enabledComponents.length > 0}
            readOnly={readOnly}
            onGenerate={() => setShowGenerate(true)}
            onStartBlank={() => {
              handleApplyPreset();
              setEditing(true);
              setStep('structure');
            }}
            onGoToComponents={() => navigate(projectPath(projectId, 'components'))}
          />
        ) : (
          <>
            <ThermalGraphCanvas
              ref={canvasRef}
              readOnly={readOnly || Boolean(explorer.focused)}
              focusKey={explorer.focused?.key}
              extraHiddenNodeIds={explorer.hiddenNodes}
              nodeLabelOverrides={explorer.labels}
              network={network}
              selection={selection}
              tool={tool}
              showPorts={showPorts}
              showLabels={showLabels}
              layoutMode={layoutMode}
              hiddenComponentIds={hiddenComponentIds}
              scenarioBoundaryEdges={scenarioBoundaryEdges}
              onSelect={onSelectObject ?? setSelection}
              onNodeMoved={(nodeId, position) =>
                useNetworkStore.getState().setNodePosition(nodeId, position)
              }
              onConnect={handleConnect}
              onContextMenu={(target, at) => setContextMenu({ ...target, x: at.x, y: at.y })}
              onZoomChange={setZoom}
              onLayout={(positions, { explicit }) => {
                const layout = useNetworkStore.getState().network?.layout;
                // Cheap exit when the canvas reproduced what is already
                // stored — which happens once the engineer has saved a
                // layout — so the whole network is not cloned for nothing.
                const stored = layout?.positions ?? {};
                const moved = Object.entries(positions).some(([id, at]) => {
                  const was = stored[id];
                  return !was || was.x !== at.x || was.y !== at.y;
                });
                // An explicit Auto Layout still has the flag to clear, even
                // when it happened to land on the same coordinates.
                if (!moved && !(explicit && layout?.hand_placed)) return;
                useNetworkStore.getState().mutate(
                  (net) => {
                    net.layout.positions = {
                      ...net.layout.positions,
                      ...positions,
                    };
                    // The engineer handed the arrangement back to the tool,
                    // which may re-space the graph again from here.
                    if (explicit) net.layout.hand_placed = false;
                  },
                  // `skipDirty`: the canvas re-runs its layout on every
                  // mount and usually lands somewhere else than the stored
                  // coordinates, so this fired on every visit to Screen 05
                  // — marking the project dirty and flashing "Writing
                  // JSON…" when the engineer had touched nothing.
                  //
                  // Dragging a node is a different path (`onNodeMoved` →
                  // `setNodePosition`) and still counts as an edit; this
                  // one is the tool arranging its own picture.
                  { skipHistory: true, skipInvalidate: true, skipDirty: true },
                );
              }}
              pendingSourceRef={pendingSourceRef}
            />
            {explorer.view !== 'groups' && <Legend />}
            {/* The page lists every check in its own column; fullscreen hides
                that column, so the graph carries the network's list instead. */}
            {fullscreen && (
              <NetworkValidationPanel validation={displayValidation} onFocus={issue => explorer.showFull(() => focusIssue(issue))} />
            )}
            {/* Beside the legend, not on top of it — and it names which of
                the two wiring tools is armed, since they ask for the same
                two clicks but do different things with them. */}
            {(tool === 'connect' || tool === 'add-edge') && (
              <p className="absolute top-3 left-[13rem] z-10 rounded-md border border-accent-500 bg-accent-100 px-2.5 py-1.5 text-[11px] font-semibold text-accent-700">
                {tool === 'connect'
                  ? 'Connect port: click a node with an open port, then its target. / 連接埠：先點有未連接埠的節點，再點目標。'
                  : 'Add edge: click the source node, then the target. / 新增連線：先點起點節點，再點終點。'}
              </p>
            )}
          </>
        )}

        {contextMenu && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setContextMenu(null)}
            />
            <ul
              className="absolute z-30 min-w-40 rounded-md border border-line bg-surface py-1 shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {(contextMenu.kind === 'node'
                ? [
                    { id: 'inspect', label: 'Inspect / 檢視' },
                    { id: 'center', label: 'Center / 置中' },
                    { id: 'duplicate', label: 'Duplicate / 複製' },
                    { id: 'disable', label: 'Disable / 停用' },
                    { id: 'delete', label: 'Delete / 刪除' },
                  ]
                : [
                    { id: 'inspect', label: 'Inspect / 檢視' },
                    { id: 'duplicate', label: 'Duplicate / 複製' },
                    { id: 'disable', label: 'Disable / 停用' },
                    {
                      id: 'reverse',
                      label: 'Reverse direction / 反轉方向',
                    },
                    { id: 'delete', label: 'Delete / 刪除' },
                  ]
              ).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-[12px] text-ink-700 hover:bg-surface-muted disabled:opacity-50"
                    disabled={
                      (readOnly || !editing) && item.id !== 'inspect' && item.id !== 'center'
                    }
                    title={
                      !readOnly && !editing && item.id !== 'inspect' && item.id !== 'center'
                        ? '請先打開「進階編修」'
                        : undefined
                    }
                    onClick={() => {
                      const store = useNetworkStore.getState();
                      const { kind, id } = contextMenu;
                      setContextMenu(null);

                      if (item.id === 'inspect') {
                        setSelection({ kind, id });
                        return;
                      }
                      if (item.id === 'center') {
                        canvasRef.current?.center(id);
                        return;
                      }
                      if (item.id === 'delete') {
                        if (kind === 'node') store.removeNode(id);
                        else store.removeEdge(id);
                        setSelection(null);
                        return;
                      }
                      if (item.id === 'disable') {
                        if (kind === 'edge') {
                          const edge = network.edges[id];
                          if (edge)
                            store.upsertEdge({
                              ...edge,
                              enabled: !edge.enabled,
                            });
                        } else {
                          const node = network.nodes[id];
                          if (node)
                            store.upsertNode({
                              ...node,
                              disabled: !node.disabled,
                            });
                        }
                        return;
                      }
                      if (item.id === 'duplicate') {
                        if (kind === 'node') {
                          const node = network.nodes[id];
                          if (!node) return;
                          const newId = manualId('NODE', new Set(Object.keys(network.nodes)));
                          const copy: ThermalNode = {
                            ...node,
                            id: newId,
                            name: `${node.name} (copy)`,
                            ports: (node.ports ?? []).map((port) => ({
                              ...port,
                              connected_to: null,
                            })),
                            origin: {
                              kind: 'manual',
                              component_id: node.component_ref,
                            },
                          };
                          store.upsertNode(copy);
                          setSelection({ kind: 'node', id: newId });
                        } else {
                          const edge = network.edges[id];
                          if (!edge) return;
                          const newId = manualId('EDGE', new Set(Object.keys(network.edges)));
                          store.upsertEdge({
                            ...edge,
                            id: newId,
                            origin: {
                              kind: 'manual',
                              component_id: edge.origin?.component_id,
                            },
                          });
                          setSelection({ kind: 'edge', id: newId });
                        }
                        return;
                      }
                      if (item.id === 'reverse' && kind === 'edge') {
                        const edge = network.edges[id];
                        if (!edge) return;
                        store.upsertEdge({
                          ...edge,
                          from: edge.to,
                          to: edge.from,
                          metadata: {
                            ...edge.metadata,
                            nominal_direction_reversed: true,
                          },
                        });
                      }
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
