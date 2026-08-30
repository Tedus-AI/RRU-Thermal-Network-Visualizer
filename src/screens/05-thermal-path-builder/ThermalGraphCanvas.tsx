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
import cytoscape, { type Core, type NodeSingular } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import type { ThermalNetwork } from '@/thermal/types';
import { cytoscapeStylesheet } from '@/ui/graphStyles';
import type { CanvasTool } from './GraphToolbar';
import { canvasInteractionPolicy } from './canvasInteraction';
import {
  buildElements,
  busGeometry,
  parallelBusRankShift,
} from './thermalGraphElements';
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

/** Anything smaller than this is a click that slipped, not a chosen region. */
const MIN_MARQUEE_PX = 12;

/**
 * Zoom per wheel notch, as a multiplier. 1.03 is 3% a notch.
 *
 * This is the one number to change if the wheel feels too slow or too abrupt;
 * a browser's own zoom steps are nearer 1.10.
 */
const WHEEL_ZOOM_STEP = 1.03;

/**
 * One wheel notch, in notches, whatever the device reports.
 *
 * `deltaMode` is pixels on most mice, lines on some, pages on a few, and a
 * trackpad sends a stream of small pixel deltas rather than one notch — so the
 * delta is normalised to pixels first and a notch defined as 100 of them. A
 * trackpad flick then zooms smoothly instead of in jumps, and a mouse notch is
 * exactly one step.
 */
function wheelNotches(event: WheelEvent): number {
  const perLine = 16;
  const perPage = 400;
  const pixels =
    event.deltaMode === 1
      ? event.deltaY * perLine
      : event.deltaMode === 2
        ? event.deltaY * perPage
        : event.deltaY;
  return pixels / 100;
}

function layoutOptions(mode: string) {
  switch (mode) {
    case 'TopBottom':
      return { name: 'dagre', rankDir: 'TB', nodeSep: 30, rankSep: 70, animate: false };
    case 'Free':
      return { name: 'cose', animate: false };
    case 'LeftRight':
    case 'Auto':
    default:
      return { name: 'dagre', rankDir: 'LR', nodeSep: 26, rankSep: 80, animate: false };
  }
}

function layoutElements(cy: Core) {
  return cy.elements().filter((element) => {
    if (element.isNode()) return !element.hasClass('view-only');
    return element.hasClass('layout-only') ||
      (!element.hasClass('view-only') && !element.hasClass('routed-port-edge'));
  });
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
/**
 * Dagre knows nothing about the view-only bus labels, so its normal rank gap
 * can be shorter than a two-line Spreading / Heat Pipe annotation. On an
 * explicit Auto Layout only, move the HSK base rank and everything after it
 * just far enough to give the longest parallel label its requested room.
 */
function ensureParallelBusLabelRoom(cy: Core) {
  cy.nodes('.hsk-bus').forEach((bus) => {
    const labels = cy.nodes('.hsk-bus-parallel-label').filter(
      (label) => label.data('busId') === bus.id(),
    );
    if (labels.length === 0) return;

    const axis = (bus.data('axis') as 'vertical' | 'horizontal' | null) ?? 'vertical';
    const vertical = axis === 'vertical';
    const flow = vertical ? 'x' : 'y';
    const shared = cy.getElementById(bus.data('sharedId') as string);
    if (!shared.isNode()) return;

    const sources: NodeSingular[] = [];
    cy.nodes('.hsk-bus-branch-junction')
      .filter((junction) => junction.data('busId') === bus.id())
      .forEach((junction) => {
        const source = cy.getElementById(junction.data('sourceId') as string);
        if (source.isNode() && !sources.some((found) => found.id() === source.id())) {
          sources.push(source);
        }
      });
    if (sources.length === 0) return;

    const mean = sources.reduce((sum, source) => sum + source.position(flow), 0) / sources.length;
    const targetAfter = shared.position(flow) >= mean;
    const sourceFront = targetAfter
      ? Math.max(
          ...sources.map((source) =>
            vertical ? source.boundingBox().x2 : source.boundingBox().y2,
          ),
        )
      : Math.min(
          ...sources.map((source) =>
            vertical ? source.boundingBox().x1 : source.boundingBox().y1,
          ),
        );
    const sharedBox = shared.boundingBox();
    const targetFront = targetAfter
      ? vertical
        ? sharedBox.x1
        : sharedBox.y1
      : vertical
        ? sharedBox.x2
        : sharedBox.y2;
    let requiredBranchRoom = 0;
    labels.forEach((label) => {
      requiredBranchRoom = Math.max(
        requiredBranchRoom,
        (label.data('requiredFlowRoom') as number | undefined) ?? 0,
      );
    });
    const shift = parallelBusRankShift(sourceFront, targetFront, requiredBranchRoom);
    if (shift < 0.5) return;

    const sharedFlow = shared.position(flow);
    const signedShift = targetAfter ? shift : -shift;
    cy.nodes()
      .filter((node) => {
        if (node.hasClass('view-only')) return false;
        const value = node.position(flow);
        return targetAfter ? value >= sharedFlow - 0.5 : value <= sharedFlow + 0.5;
      })
      .forEach((node) => {
        node.position(flow, node.position(flow) + signedShift);
      });
  });
}

function positionViewBuses(cy: Core, ensureParallelRoom = false) {
  if (ensureParallelRoom) ensureParallelBusLabelRoom(cy);
  cy.nodes('.hsk-bus').forEach((bus) => {
    const axis = (bus.data('axis') as 'vertical' | 'horizontal' | null) ?? 'vertical';
    const shared = cy.getElementById(bus.data('sharedId') as string);
    if (shared.length === 0) return;
    const junctions = cy.nodes('.hsk-bus-branch-junction').filter(
      (junction) => junction.data('busId') === bus.id(),
    );
    if (junctions.length === 0) return;

    const sourceEntries: Array<{ junction: NodeSingular; source: NodeSingular }> = [];
    junctions.forEach((junction) => {
      const source = cy.getElementById(junction.data('sourceId') as string);
      if (source.isNode()) sourceEntries.push({ junction, source });
    });
    if (sourceEntries.length === 0) return;
    const outlet = cy.getElementById(bus.data('outletId') as string);
    if (!outlet.isNode()) return;

    const vertical = axis === 'vertical';
    const flow = vertical ? 'x' : 'y';
    const sharedBox = shared.boundingBox();
    const mean =
      sourceEntries.reduce((sum, entry) => sum + entry.source.position(flow), 0) /
      sourceEntries.length;
    const targetAfter = shared.position(flow) >= mean;

    const boxFar = (entry: { source: NodeSingular }) =>
      vertical ? entry.source.boundingBox().x2 : entry.source.boundingBox().y2;
    const boxNear = (entry: { source: NodeSingular }) =>
      vertical ? entry.source.boundingBox().x1 : entry.source.boundingBox().y1;

    const sourceFront = targetAfter
      ? Math.max(...sourceEntries.map(boxFar))
      : Math.min(...sourceEntries.map(boxNear));
    const targetFront = targetAfter
      ? vertical
        ? sharedBox.x1
        : sharedBox.y1
      : vertical
        ? sharedBox.x2
        : sharedBox.y2;

    const geometry = busGeometry(
      axis,
      { x: shared.position('x'), y: shared.position('y') },
      sourceEntries.map((entry) => ({
        x: entry.source.position('x'),
        y: entry.source.position('y'),
      })),
      sourceEntries.length,
      { sourceFront, targetFront },
    );
    if (geometry.along == null || !geometry.position || !geometry.outletPosition) return;

    bus.data('w', geometry.w);
    bus.data('h', geometry.h);
    bus.position(geometry.position);
    outlet.position(geometry.outletPosition);
    sourceEntries.forEach(({ junction, source }) => {
      // The fan the element builder computed has to survive this pass, or two
      // branches from one terminal snap back on top of each other the moment a
      // layout runs.
      const offset = (junction.data('crossOffset') as number | undefined) ?? 0;
      junction.position(
        vertical
          ? { x: geometry.along!, y: source.position('y') + offset }
          : { x: source.position('x') + offset, y: geometry.along! },
      );
    });

    // Parallel branches keep the original straight fan. Put each label at the
    // midpoint of the VISIBLE segment (source box edge to bus), not midway from
    // the node centre; after Auto Layout adds room this keeps the full label
    // clear of both the terminal and the junction bar.
    cy.nodes('.hsk-bus-parallel-label')
      .filter((label) => label.data('busId') === bus.id())
      .forEach((label) => {
        const source = cy.getElementById(label.data('sourceId') as string);
        if (!source.isNode()) return;
        const offset = (label.data('crossOffset') as number | undefined) ?? 0;
        const sourceBox = source.boundingBox();
        const sourceFront = targetAfter
          ? vertical
            ? sourceBox.x2
            : sourceBox.y2
          : vertical
            ? sourceBox.x1
            : sourceBox.y1;
        const labelFlow = (sourceFront + geometry.along!) / 2;
        const sourceCentre = source.position(flow);
        const denominator = geometry.along! - sourceCentre;
        const fraction = denominator === 0 ? 0.5 : (labelFlow - sourceCentre) / denominator;
        label.position(
          vertical
            ? {
                x: labelFlow,
                y: source.position('y') + offset * fraction,
              }
            : {
                x: source.position('x') + offset * fraction,
                y: labelFlow,
              },
        );
      });

    // The parallel note rides on the bar at its terminal's own level — between
    // the fanned branches, which is what makes it read as their combination.
    // It is placed separately from the junctions above because it is not a
    // branch: counting it as one would skew the bar's span and centre.
    cy.nodes('.hsk-bus-parallel-note')
      .filter((note) => note.data('busId') === bus.id())
      .forEach((note) => {
        const source = cy.getElementById(note.data('sourceId') as string);
        if (!source.isNode()) return;
        note.position(
          vertical
            ? { x: geometry.along!, y: source.position('y') }
            : { x: source.position('x'), y: geometry.along! },
        );
      });
  });
}

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
    /** Positions produced by an automatic layout, for the store to remember. */
    onLayout: (positions: Record<string, { x: number; y: number }>) => void;
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
  const fittedRef = useRef(false);
  // Signature of the last rendered element set, so a pure attribute change keeps
  // the engineer's viewport while an added or removed object brings it into view.
  const elementSignature = useRef('');
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

    if (unpositioned.length > 0 && cy.nodes().length > 0) {
      // The layout applies positions asynchronously; they are written back to
      // the store on `layoutstop` so the next rebuild reuses them instead of
      // laying the graph out again under a viewport that no longer matches.
      const layout = layoutElements(cy).layout(layoutOptions(layoutModeRef.current));
      layout.one('layoutstop', () => {
        positionViewBuses(cy, true);
        handlers.current.onLayout(renderedDomainPositions(cy));
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

  /**
   * Zoom the viewport onto a region the engineer drew, in container pixels.
   *
   * Rendered pixels map to model space as `model = (rendered - pan) / zoom`, so
   * the level that makes the region fill the viewport is whichever of the two
   * axes runs out of room first, and the pan is then whatever puts the region's
   * centre in the middle of the canvas.
   */
  const zoomToRegion = (box: { x1: number; y1: number; x2: number; y2: number }) => {
    const cy = cyRef.current;
    if (!cy) return;
    const width = Math.abs(box.x2 - box.x1);
    const height = Math.abs(box.y2 - box.y1);
    if (width < MIN_MARQUEE_PX || height < MIN_MARQUEE_PX) return;

    const pan = cy.pan();
    const zoom = cy.zoom();
    const modelWidth = width / zoom;
    const modelHeight = height / zoom;
    const centerModel = {
      x: (Math.min(box.x1, box.x2) + width / 2 - pan.x) / zoom,
      y: (Math.min(box.y1, box.y2) + height / 2 - pan.y) / zoom,
    };

    const viewWidth = cy.width();
    const viewHeight = cy.height();
    if (viewWidth === 0 || viewHeight === 0) return;

    const wanted = Math.min(viewWidth / modelWidth, viewHeight / modelHeight);
    const next = Math.min(Math.max(wanted, cy.minZoom()), cy.maxZoom());
    cy.viewport({
      zoom: next,
      pan: {
        x: viewWidth / 2 - centerModel.x * next,
        y: viewHeight / 2 - centerModel.y * next,
      },
    });
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
        const layout = layoutElements(cy).layout(layoutOptions(mode));
        layout.one('layoutstop', () => {
          positionViewBuses(cy, true);
          handlers.current.onLayout(renderedDomainPositions(cy));
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

  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.x1, marquee.x2),
        top: Math.min(marquee.y1, marquee.y2),
        width: Math.abs(marquee.x2 - marquee.x1),
        height: Math.abs(marquee.y2 - marquee.y1),
      }
    : null;

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
          {marqueeRect && (
            <div
              aria-hidden
              className="absolute border-2 border-accent-600 bg-accent-500/15"
              style={marqueeRect}
            />
          )}
        </div>
      )}
    </div>
  );
});
