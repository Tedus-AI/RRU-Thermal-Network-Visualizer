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
  type MutableRefObject,
} from 'react';
import cytoscape, { type Core, type NodeSingular } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import type { ThermalNetwork } from '@/thermal/types';
import { cytoscapeStylesheet } from '@/ui/graphStyles';
import { buildElements } from './thermalGraphElements';

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

function layoutOptions(mode: string) {
  switch (mode) {
    case 'TopBottom':
      return { name: 'dagre', rankDir: 'TB', nodeSep: 30, rankSep: 70, animate: false };
    case 'Hierarchical':
      return { name: 'breadthfirst', directed: true, spacingFactor: 1.2, animate: false };
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

function positionViewBuses(cy: Core) {
  cy.nodes('.hsk-bus').forEach((bus) => {
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

    const sharedBox = shared.boundingBox();
    const averageSourceX =
      sourceEntries.reduce((sum, entry) => sum + entry.source.position('x'), 0) /
      sourceEntries.length;
    const targetOnRight = shared.position('x') >= averageSourceX;
    const sourceFront = targetOnRight
      ? Math.max(...sourceEntries.map((entry) => entry.source.boundingBox().x2))
      : Math.min(...sourceEntries.map((entry) => entry.source.boundingBox().x1));
    const targetFront = targetOnRight ? sharedBox.x1 : sharedBox.x2;
    const busX = sourceFront + (targetFront - sourceFront) * 0.72;
    const sourceYs = sourceEntries.map((entry) => entry.source.position('y'));
    const allYs = [...sourceYs, shared.position('y')];
    const minY = Math.min(...allYs);
    const maxY = Math.max(...allYs);

    bus.data('h', Math.max(2, maxY - minY));
    bus.position({ x: busX, y: (minY + maxY) / 2 });
    outlet.position({ x: busX, y: shared.position('y') });
    sourceEntries.forEach(({ junction, source }) => {
      junction.position({ x: busX, y: source.position('y') });
    });
  });
}

function renderedDomainPositions(cy: Core): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  cy.nodes(':not(.view-only)').forEach((node) => {
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
    /** 'connect' and 'add-edge' both wire two nodes; 'pan' disables box select. */
    tool: 'select' | 'pan' | 'connect' | 'add-node' | 'add-edge';
    showPorts: boolean;
    showLabels: boolean;
    layoutMode: string;
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
  });
  handlers.current = {
    onSelect,
    onNodeMoved,
    onConnect,
    onContextMenu,
    onZoomChange,
    onLayout,
    tool,
  };

  const elements = useMemo(
    () => buildElements(network, { showPorts, showLabels, layoutMode }),
    [network, showPorts, showLabels, layoutMode],
  );

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: cytoscapeStylesheet(),
      minZoom: 0.2,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (event) => {
      if (event.target.hasClass('view-only')) return;
      const id = event.target.id() as string;
      const mode = handlers.current.tool;

      if (mode === 'connect' || mode === 'add-edge') {
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
      if (event.target.hasClass('view-only')) return;
      const position = event.target.position();
      handlers.current.onNodeMoved(event.target.id() as string, { x: position.x, y: position.y });
    });

    cy.on('cxttap', 'node', (event) => {
      if (event.target.hasClass('view-only')) return;
      handlers.current.onContextMenu(
        { kind: 'node', id: event.target.id() as string },
        { x: event.renderedPosition.x, y: event.renderedPosition.y },
      );
    });

    cy.on('cxttap', 'edge', (event) => {
      if (event.target.hasClass('view-only') || event.target.hasClass('layout-only')) return;
      handlers.current.onContextMenu(
        { kind: 'edge', id: event.target.id() as string },
        { x: event.renderedPosition.x, y: event.renderedPosition.y },
      );
    });

    cy.on('zoom', () => handlers.current.onZoomChange(cy.zoom()));

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
        positionViewBuses(cy);
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
    cy.userPanningEnabled(true);
    cy.boxSelectionEnabled(tool === 'select');
    cy.autoungrabify(tool === 'pan');
    if (tool !== 'connect' && tool !== 'add-edge') {
      pendingSourceRef.current = null;
      cy.nodes().removeClass('connect-source');
    }
  }, [tool, pendingSourceRef]);

  useImperativeHandle(
    ref,
    (): CanvasHandle => ({
      fit: () => cyRef.current?.fit(undefined, 40),
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
          positionViewBuses(cy);
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

  return <div ref={containerRef} className="size-full" data-testid="thermal-graph-canvas" />;
});
