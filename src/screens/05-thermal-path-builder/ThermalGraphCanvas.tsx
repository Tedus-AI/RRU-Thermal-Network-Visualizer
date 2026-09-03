/**
 * Cytoscape canvas — 05 §29, §30, §31, §56.
 *
 * Cytoscape is a VIEW and interaction layer. It never holds authoritative graph
 * state: every change is reported upward and applied to `networkStore`, and this
 * component re-renders from the store afterwards (05 §46, §56, §61).
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import cytoscape, { type Core } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import type { ThermalNetwork } from '@/thermal/types';
import { cytoscapeStylesheet, edgeLabelFlowLength } from '@/ui/graphStyles';
import type { CanvasTool } from './GraphToolbar';
import { canvasInteractionPolicy } from './canvasInteraction';
import {
  marqueeRect,
  WHEEL_ZOOM_STEP,
  wheelNotches,
  zoomRegionViewport,
  type ViewportBox,
} from '@/ui/graphViewport';
import { buildElements } from './thermalGraphElements';
import { positionViewBuses } from './busLayout';
import type { ScenarioBoundaryEdgeView } from './scenarioBoundaryProjection';

cytoscape.use(dagre);

export type GraphSelection = { kind: 'node' | 'edge'; id: string } | null;

export interface CanvasHandle {
  fit: () => void;
  zoomBy: (delta: number) => void;
  runLayout: (mode: string) => void;
  center: (nodeId: string) => void;
  getZoom: () => number;
  /** Positions currently rendered, so the view can persist them (05 §30). */
  positions: () => Record<string, { x: number; y: number }>;
}

const EDGE_LABEL_FLOW_PADDING_PX = 28;
const MAX_LABEL_AWARE_RANK_SEP_PX = 260;

/** Rank spacing chosen from the labels that are actually visible in this graph. */
export function labelAwareRankSep(mode: string, labels: readonly string[]): number {
  const base = mode === 'TopBottom' ? 70 : 80;
  const longest = labels.reduce(
    (maximum, label) => Math.max(maximum, edgeLabelFlowLength(label)),
    0,
  );
  return Math.min(
    MAX_LABEL_AWARE_RANK_SEP_PX,
    Math.max(base, longest + EDGE_LABEL_FLOW_PADDING_PX),
  );
}

/**
 * Screen 07's solved canvas imports this so a layout mode means the same thing
 * on both. Two dagre configurations that drifted apart would make the same
 * graph read differently depending on which screen the engineer was on.
 */
export function layoutOptions(mode: string, labels: readonly string[] = []) {
  switch (mode) {
    case 'TopBottom':
      return {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 30,
        rankSep: labelAwareRankSep(mode, labels),
        animate: false,
      };
    case 'Free':
      return { name: 'cose', animate: false };
    case 'LeftRight':
    case 'Auto':
    default:
      return {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 26,
        rankSep: labelAwareRankSep(mode, labels),
        animate: false,
      };
  }
}

function layoutElements(cy: Core) {
  return cy.elements().filter((element) => {
    if (element.isNode()) return !element.hasClass('view-only');
    return element.hasClass('layout-only') ||
      (!element.hasClass('view-only') && !element.hasClass('routed-port-edge'));
  });
}

function layoutEdgeLabels(cy: Core): string[] {
  const labels: string[] = [];
  layoutElements(cy)
    .edges()
    .forEach((edge) => {
      const label = edge.data('label');
      if (typeof label === 'string' && label.trim()) labels.push(label);
    });
  return labels;
}

/** True when saved positions pre-date the current label-aware spacing rule. */
function edgeLabelsNeedRoom(cy: Core, mode: string): boolean {
  if (mode === 'Free') return false;
  const topBottom = mode === 'TopBottom';
  let needsRoom = false;
  layoutElements(cy)
    .edges()
    .forEach((edge) => {
      if (needsRoom) return;
      const label = edge.data('label');
      if (typeof label !== 'string' || !label.trim()) return;
      const source = edge.source();
      const target = edge.target();
      if (!source.isNode() || !target.isNode()) return;
      const sourceBox = source.boundingBox();
      const targetBox = target.boundingBox();
      const sourceFlow = source.position(topBottom ? 'y' : 'x');
      const targetFlow = target.position(topBottom ? 'y' : 'x');
      const forward = targetFlow >= sourceFlow;
      const gap = topBottom
        ? forward
          ? targetBox.y1 - sourceBox.y2
          : sourceBox.y1 - targetBox.y2
        : forward
          ? targetBox.x1 - sourceBox.x2
          : sourceBox.x1 - targetBox.x2;
      if (gap < edgeLabelFlowLength(label) + EDGE_LABEL_FLOW_PADDING_PX) needsRoom = true;
    });
  return needsRoom;
}

/**
 * Re-places the view-only bus elements against the positions Cytoscape actually
 * laid out, using the same `busGeometry` the element builder used against the
 * stored ones — so the bar does not jump between the two.
 *
 * The live pass can do better on one point: it knows each node's real bounding
 * box, so the bar is measured from the FACING EDGES of the boxes rather than
 * from their centres, and never ends up drawn inside a node.
 */
function renderedDomainPositions(cy: Core): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  cy.nodes()
    .filter((node) => !node.hasClass('view-only'))
    .forEach((node) => {
      const position = node.position();
      positions[node.id() as string] = { x: position.x, y: position.y };
    });
  return positions;
}

export const ThermalGraphCanvas = forwardRef<
  CanvasHandle,
  {
    network: ThermalNetwork;
    selection: GraphSelection;
    /**
     * 'connect' and 'add-edge' both ask for two clicks (the view decides what
     * to do with them); Select also pans when the background is dragged;
     * 'zoom-box' hands pointer input to the marquee overlay instead of to
     * Cytoscape.
     */
    tool: CanvasTool;
    showPorts: boolean;
    showLabels: boolean;
    layoutMode: string;
    /** Prevents topology edits while retaining selection, pan and zoom. */
    readOnly?: boolean;
    /** Components switched off in the palette. A view filter, never the model. */
    hiddenComponentIds: ReadonlySet<string>;
    /** Read-only values calculated by the active Screen 06 scenario. */
    scenarioBoundaryEdges?: ReadonlyMap<string, ScenarioBoundaryEdgeView>;
    onSelect: (selection: GraphSelection) => void;
    onNodeMoved: (nodeId: string, position: { x: number; y: number }) => void;
    onConnect: (sourceId: string, targetId: string) => void;
    onContextMenu: (
      target: { kind: 'node' | 'edge'; id: string },
      at: { x: number; y: number },
    ) => void;
    onZoomChange: (zoom: number) => void;
    /**
     * Positions produced by an automatic layout, for the store to remember.
     *
     * `explicit` marks a layout the engineer asked for — Auto Layout, a mode
     * change, Reset View — as opposed to one the canvas ran to place nodes it
     * had no coordinates for.
     */
    onLayout: (
      positions: Record<string, { x: number; y: number }>,
      options: { explicit: boolean },
    ) => void;
    /** Node the connect tool is waiting on a second click for. */
    pendingSourceRef: MutableRefObject<string | null>;
  }
>(function ThermalGraphCanvas(
  {
    network,
    selection,
    tool,
    showPorts,
    showLabels,
    layoutMode,
    readOnly = false,
    hiddenComponentIds,
    scenarioBoundaryEdges,
    onSelect,
    onNodeMoved,
    onConnect,
    onContextMenu,
    onZoomChange,
    onLayout,
    pendingSourceRef,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Marquee zoom, in container pixels. `null` while no drag is in progress.
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  // Read inside effects without making the layout re-run on every mode change.
  const layoutModeRef = useRef(layoutMode);
  layoutModeRef.current = layoutMode;
  /**
   * A layout run over a FILTERED graph must not be written back.
   *
   * `renderedDomainPositions` reports the nodes currently drawn, and the store
   * merges them over what it holds. With components hidden that is a SUBSET:
   * the visible parts get fresh, compact coordinates while the hidden ones keep
   * their old ones, so showing everything again lands two differently-scaled
   * arrangements on top of each other. That is the pile-up — and why Auto
   * Layout, which re-lays the whole graph, clears it.
   *
   * Screens 06 and 07 never had it because their canvases never persist
   * positions at all. The filter is a way of READING the graph, so the same
   * rule applies here: it may move what is drawn, never what is stored.
   */
  const filteredRef = useRef(false);
  filteredRef.current = hiddenComponentIds.size > 0;
  const fittedRef = useRef(false);
  // Signature of the last rendered element set, so a pure attribute change keeps
  // the engineer's viewport while an added or removed object brings it into view.
  const elementSignature = useRef('');
  // Prevents a saved layout that cannot quite meet a metric from relayouting on
  // every store write. A changed graph, label or mode produces a new key.
  const labelSpacingSignature = useRef('');
  const cyRef = useRef<Core | null>(null);
  // Handlers are read through a ref so the Cytoscape listeners are bound once.
  const handlers = useRef({
    onSelect,
    onNodeMoved,
    onConnect,
    onContextMenu,
    onZoomChange,
    onLayout,
    tool,
    readOnly,
  });
  handlers.current = {
    onSelect,
    onNodeMoved,
    onConnect,
    onContextMenu,
    onZoomChange,
    onLayout,
    tool,
    readOnly,
  };

  const elements = useMemo(
    () =>
      buildElements(network, {
        showPorts,
        showLabels,
        layoutMode,
        hiddenComponentIds,
        scenarioBoundaryEdges,
      }),
    [network, showPorts, showLabels, layoutMode, hiddenComponentIds, scenarioBoundaryEdges],
  );

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: cytoscapeStylesheet(),
      minZoom: 0.2,
      maxZoom: 2.5,
      // Cytoscape's own wheel zoom is off; the handler below replaces it. See
      // the `wheel` effect for why.
      userZoomingEnabled: false,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (event) => {
      if (event.target.hasClass('view-only')) return;
      const id = event.target.id() as string;
      const mode = handlers.current.tool;

      if (!handlers.current.readOnly && (mode === 'connect' || mode === 'add-edge')) {
        const pending = pendingSourceRef.current;
        if (!pending) {
          pendingSourceRef.current = id;
          cy.nodes().removeClass('connect-source');
          event.target.addClass('connect-source');
          return;
        }
        pendingSourceRef.current = null;
        cy.nodes().removeClass('connect-source');
        if (pending !== id) handlers.current.onConnect(pending, id);
        return;
      }

      handlers.current.onSelect({ kind: 'node', id });
    });

    cy.on('tap', 'edge', (event) => {
      if (event.target.hasClass('view-only') || event.target.hasClass('layout-only')) return;
      handlers.current.onSelect({ kind: 'edge', id: event.target.id() as string });
    });

    cy.on('tap', (event) => {
      if (event.target === cy) {
        pendingSourceRef.current = null;
        cy.nodes().removeClass('connect-source');
        handlers.current.onSelect(null);
      }
    });

    cy.on('dragfree', 'node', (event) => {
      if (handlers.current.readOnly || event.target.hasClass('view-only')) return;
      const position = event.target.position();
      handlers.current.onNodeMoved(event.target.id() as string, { x: position.x, y: position.y });
    });

    cy.on('cxttap', 'node', (event) => {
      if (handlers.current.readOnly || event.target.hasClass('view-only')) return;
      handlers.current.onContextMenu(
        { kind: 'node', id: event.target.id() as string },
        { x: event.renderedPosition.x, y: event.renderedPosition.y },
      );
    });

    cy.on('cxttap', 'edge', (event) => {
      if (
        handlers.current.readOnly ||
        event.target.hasClass('view-only') ||
        event.target.hasClass('layout-only')
      )
        return;
      handlers.current.onContextMenu(
        { kind: 'edge', id: event.target.id() as string },
        { x: event.renderedPosition.x, y: event.renderedPosition.y },
      );
    });

    cy.on('zoom', () => handlers.current.onZoomChange(cy.zoom()));

    // Cytoscape's `cxttap` reports the right-click but does not stop the
    // browser's own menu, so both opened and the native one covered ours.
    // Bound on the container rather than through Cytoscape because the event
    // has to be cancelled on the DOM node that receives it.
    const suppressNativeMenu = (event: MouseEvent) => event.preventDefault();
    const container = containerRef.current;
    container.addEventListener('contextmenu', suppressNativeMenu);

    /*
     * WHEEL ZOOM, IN EVERY TOOL.
     *
     * Cytoscape's own wheel handler is gated on `userPanningEnabled()` as well
     * as on zooming — zooming about the cursor moves the pan, so it treats the
     * two as one permission. Select and Zoom Region both turn user panning off,
     * so in those tools the wheel did nothing at all and the only way to zoom
     * was to switch to Pan first. The comment in the tool effect claiming the
     * wheel worked in both was simply wrong.
     *
     * `cy.zoom({ level, renderedPosition })` has no such gate: it checks
     * `zoomingEnabled` and `panningEnabled`, neither of which any tool touches.
     * So the handler is ours, it anchors on the pointer, and it is the same in
     * all five tools.
     */
    const onWheel = (event: WheelEvent) => {
      // Without this the page behind the canvas scrolls as well.
      event.preventDefault();
      const notches = wheelNotches(event);
      if (notches === 0) return;
      const bounds = container.getBoundingClientRect();
      cy.zoom({
        // Wheel down is a positive delta and means zoom out.
        level: cy.zoom() * WHEEL_ZOOM_STEP ** -notches,
        // The point under the cursor stays under the cursor.
        renderedPosition: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });

    // The container is often still 0×0 on the first paint; without this the
    // graph renders outside the visible viewport and the canvas looks empty.
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      cy.resize();
      // A fit computed against a 0x0 container is meaningless, so the first fit
      // that counts is the one taken once the container really has a size.
      if (!fittedRef.current && cy.nodes().length > 0) {
        cy.fit(undefined, 40);
        fittedRef.current = true;
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      container.removeEventListener('contextmenu', suppressNativeMenu);
      container.removeEventListener('wheel', onWheel);
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render from the store. Pan, zoom and known positions survive the rebuild.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const pan = { ...cy.pan() };
    const zoom = cy.zoom();
    const hadElements = cy.elements().length > 0;

    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    positionViewBuses(cy);

    const signature = elements
      .map((element) => element.data.id)
      .sort()
      .join('|');
    const structureChanged = signature !== elementSignature.current;
    elementSignature.current = signature;

    const refit = () => {
      cy.resize();
      const box = cy.container()?.getBoundingClientRect();
      const sized = Boolean(box && box.width > 0 && box.height > 0);
      if (sized) cy.fit(undefined, 40);
      // Leave the flag false while the container has no size; the ResizeObserver
      // performs the real fit as soon as it does.
      fittedRef.current = sized && cy.nodes().length > 0;
      handlers.current.onZoomChange(cy.zoom());
    };

    const unpositioned = cy
      .nodes()
      .filter((node) =>
        !node.hasClass('view-only') && !network.layout.positions[node.id() as string],
      );

    const labels = layoutEdgeLabels(cy);
    const labelSpacingKey = `${signature}|${layoutModeRef.current}|${labels.join('\u0000')}`;
    /**
     * Re-spacing a graph the engineer has arranged themselves is not the
     * canvas's call.
     *
     * This check re-lays the whole graph out when the stored positions are too
     * tight for their edge labels, and `onLayout` then writes the result over
     * whatever was stored. That is right for a layout the tool produced, and
     * the Golden Demo relies on it. It is wrong for one a person dragged into
     * shape: the labels grow a little whenever a scenario's boundary edges
     * arrive, which produced a fresh key, which re-arranged the graph and threw
     * their positions away — silently, since that write is deliberately not an
     * edit. A page reload made it certain, because the key lives in a ref that
     * starts empty on every mount.
     *
     * Auto Layout clears `hand_placed`, so the tool takes the arrangement back
     * the moment the engineer asks it to.
     */
    const needsLabelRoom =
      showLabels &&
      !network.layout.hand_placed &&
      labelSpacingSignature.current !== labelSpacingKey &&
      edgeLabelsNeedRoom(cy, layoutModeRef.current);
    if ((unpositioned.length > 0 || needsLabelRoom) && cy.nodes().length > 0) {
      labelSpacingSignature.current = labelSpacingKey;
      // The layout applies positions asynchronously; they are written back to
      // the store on `layoutstop` so the next rebuild reuses them instead of
      // laying the graph out again under a viewport that no longer matches.
      const layout = layoutElements(cy).layout(
        layoutOptions(layoutModeRef.current, labels),
      );
      layout.one('layoutstop', () => {
        positionViewBuses(cy, true);
        if (!filteredRef.current) {
          handlers.current.onLayout(renderedDomainPositions(cy), { explicit: false });
        }
        refit();
      });
      layout.run();
      return;
    }

    if (hadElements && !structureChanged) {
      cy.viewport({ zoom, pan });
      handlers.current.onZoomChange(cy.zoom());
    } else {
      refit();
    }
  }, [elements, network.layout.positions]);

  // Selection is owned by React; Cytoscape only reflects it.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().unselect();
    if (selection) cy.getElementById(selection.id).select();
  }, [selection, elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    /**
     * One pointer now owns both ordinary canvas actions: object gestures select
     * or move objects, and background drags pan the viewport. The old separate
     * Pan button made engineers switch modes for an action that has no conflict
     * with selecting an object.
     *
     * Turning user panning off also killed Cytoscape's wheel zoom, which is
     * gated on it — so the wheel is handled by hand in the init effect and is
     * unaffected by anything set here.
     */
    const policy = canvasInteractionPolicy(tool);
    cy.userPanningEnabled(policy.userPanning);
    cy.boxSelectionEnabled(policy.boxSelection);
    cy.autoungrabify(readOnly || !policy.nodesGrabbable);
    if (tool !== 'connect' && tool !== 'add-edge') {
      pendingSourceRef.current = null;
      cy.nodes().removeClass('connect-source');
    }
    if (tool !== 'zoom-box') {
      marqueeStart.current = null;
      setMarquee(null);
    }
  }, [tool, readOnly, pendingSourceRef]);

  /** Zoom the viewport onto a region the engineer drew, in container pixels. */
  const zoomToRegion = (box: ViewportBox) => {
    const cy = cyRef.current;
    if (!cy) return;
    const next = zoomRegionViewport({
      box,
      current: { zoom: cy.zoom(), pan: cy.pan() },
      viewWidth: cy.width(),
      viewHeight: cy.height(),
      minZoom: cy.minZoom(),
      maxZoom: cy.maxZoom(),
    });
    if (!next) return;
    cy.viewport(next);
    handlers.current.onZoomChange(cy.zoom());
  };

  useImperativeHandle(
    ref,
    (): CanvasHandle => ({
      // `resize` first: a caller fitting right after the container changed size
      // — the fullscreen toggle — would otherwise fit to the old dimensions,
      // because Cytoscape caches them until it is told to re-measure.
      fit: () => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.resize();
        cy.fit(undefined, 40);
        handlers.current.onZoomChange(cy.zoom());
      },
      zoomBy: (delta) => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.zoom({ level: cy.zoom() + delta, renderedPosition: { x: 0, y: 0 } });
        cy.center();
      },
      runLayout: (mode) => {
        const cy = cyRef.current;
        if (!cy || cy.nodes().length === 0) return;
        const layout = layoutElements(cy).layout(layoutOptions(mode, layoutEdgeLabels(cy)));
        layout.one('layoutstop', () => {
          positionViewBuses(cy, true);
          // Tidies the view either way; only an unfiltered run is the whole
          // graph, and only the whole graph is an arrangement worth keeping.
          if (!filteredRef.current) {
            handlers.current.onLayout(renderedDomainPositions(cy), { explicit: true });
          }
          cy.fit(undefined, 40);
        });
        layout.run();
      },
      center: (nodeId) => {
        const cy = cyRef.current;
        const node = cy?.getElementById(nodeId);
        if (cy && node && node.length > 0) {
          cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.9) }, { duration: 200 });
        }
      },
      getZoom: () => cyRef.current?.zoom() ?? 1,
      positions: () => {
        const cy = cyRef.current;
        if (!cy) return {};
        return renderedDomainPositions(cy);
      },
    }),
    [],
  );

  const rect = marqueeRect(marquee);

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" data-testid="thermal-graph-canvas" />
      {tool === 'zoom-box' && (
        <div
          data-testid="zoom-marquee-layer"
          className="absolute inset-0 z-10 cursor-crosshair"
          onPointerDown={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
            marqueeStart.current = point;
            setMarquee({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = marqueeStart.current;
            if (!start) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            setMarquee({
              x1: start.x,
              y1: start.y,
              x2: event.clientX - bounds.left,
              y2: event.clientY - bounds.top,
            });
          }}
          onPointerUp={(event) => {
            const start = marqueeStart.current;
            marqueeStart.current = null;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (start) {
              zoomToRegion({
                x1: start.x,
                y1: start.y,
                x2: event.clientX - bounds.left,
                y2: event.clientY - bounds.top,
              });
            }
            setMarquee(null);
          }}
          onPointerCancel={() => {
            marqueeStart.current = null;
            setMarquee(null);
          }}
        >
          {rect && (
            <div
              aria-hidden
              className="absolute border-2 border-accent-600 bg-accent-500/15"
              style={rect}
            />
          )}
        </div>
      )}
    </div>
  );
});
