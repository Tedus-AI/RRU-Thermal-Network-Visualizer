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
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import { activeRth } from '@/thermal/rth';
import type { ThermalNetwork } from '@/thermal/types';
import { GROUP_COLORS, cytoscapeStylesheet, edgeColor, edgeLineStyle, nodeGroup } from './graphStyles';

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

const EDGE_SHORT: Record<string, string> = {
  package_rjc: 'Rjc',
  package_rjb: 'Rjb',
  package_rja: 'Rja',
  conduction: 'Cond',
  tim: 'TIM',
  solder: 'Solder',
  thermal_via: 'Via',
  contact: 'Contact',
  spreading: 'Spreading',
  heat_pipe: 'Heat Pipe',
  convection: 'Conv',
  radiation: 'Rad',
  custom: 'Custom',
};

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

/** Deterministic node box, so nothing depends on asynchronous text measurement. */
function labelBox(label: string): { w: number; h: number } {
  const lines = label.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return {
    w: Math.min(180, Math.max(64, Math.round(longest * 5.6) + 18)),
    h: lines.length * 14 + 12,
  };
}

function buildElements(
  network: ThermalNetwork,
  options: { showPorts: boolean; showLabels: boolean },
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  for (const node of Object.values(network.nodes)) {
    const group = nodeGroup(node);
    const colors = GROUP_COLORS[group];
    const unconnected = (node.ports ?? []).filter((port) => !port.connected_to);

    const portLine =
      options.showPorts && (node.ports ?? []).length > 0
        ? `\n${(node.ports ?? [])
            .map((port) => (port.connected_to ? `${port.kind} ✓` : port.kind))
            .join(' · ')}`
        : '';

    const classes: string[] = [`role-${group}`];
    if (group === 'boundary') classes.push('boundary');
    if (unconnected.length > 0) classes.push('unconnected-port');
    if (node.disabled) classes.push('disabled');
    if (!options.showLabels) classes.push('hide-label');

    const label = `${node.name}${node.power_W > 0 ? ` · ${node.power_W.toFixed(1)} W` : ''}${portLine}`;
    const box = labelBox(label);

    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill: colors.fill,
        border: colors.border,
        text: colors.text,
      },
      classes: classes.join(' '),
      position: network.layout.positions[node.id]
        ? { ...network.layout.positions[node.id] }
        : undefined,
    });
  }

  for (const edge of Object.values(network.edges)) {
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    const R = activeRth(edge.rth);
    const short = EDGE_SHORT[edge.type] ?? edge.type;
    const label = options.showLabels
      ? `${short} ${R != null ? `${R.toFixed(3)} °C/W` : '—'}`
      : '';

    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label,
        color: edgeColor(edge),
        lineStyle: edgeLineStyle(edge),
      },
    });
  }

  return elements;
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
    () => buildElements(network, { showPorts, showLabels }),
    [network, showPorts, showLabels],
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
      const position = event.target.position();
      handlers.current.onNodeMoved(event.target.id() as string, { x: position.x, y: position.y });
    });

    cy.on('cxttap', 'node', (event) => {
      handlers.current.onContextMenu(
        { kind: 'node', id: event.target.id() as string },
        { x: event.renderedPosition.x, y: event.renderedPosition.y },
      );
    });

    cy.on('cxttap', 'edge', (event) => {
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
      .filter((node) => !network.layout.positions[node.id() as string]);

    if (unpositioned.length > 0 && cy.nodes().length > 0) {
      // The layout applies positions asynchronously; they are written back to
      // the store on `layoutstop` so the next rebuild reuses them instead of
      // laying the graph out again under a viewport that no longer matches.
      const layout = cy.layout(layoutOptions(layoutModeRef.current));
      layout.one('layoutstop', () => {
        const positions: Record<string, { x: number; y: number }> = {};
        cy.nodes().forEach((node) => {
          const position = node.position();
          positions[node.id() as string] = { x: position.x, y: position.y };
        });
        handlers.current.onLayout(positions);
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
        const layout = cy.layout(layoutOptions(mode));
        layout.one('layoutstop', () => {
          const positions: Record<string, { x: number; y: number }> = {};
          cy.nodes().forEach((node) => {
            const position = node.position();
            positions[node.id() as string] = { x: position.x, y: position.y };
          });
          handlers.current.onLayout(positions);
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
        const result: Record<string, { x: number; y: number }> = {};
        cy.nodes().forEach((node) => {
          const position = node.position();
          result[node.id() as string] = { x: position.x, y: position.y };
        });
        return result;
      },
    }),
    [],
  );

  return <div ref={containerRef} className="size-full" data-testid="thermal-graph-canvas" />;
});
