/**
 * Center canvas — boundary mapping mode (06 §8.2).
 *
 * TOPOLOGY IS READ-ONLY here. Nodes cannot be added, deleted or dragged into a
 * new graph; the canvas exists so a boundary port can be found and selected.
 * Screen 06 never writes to `networkStore` (06 §2.4, §3.2).
 *
 * Nothing on this canvas is a result: no solved temperature, no heat-flow
 * arrow, no bottleneck colour scale (06 §8.2 "Forbidden center canvas
 * content").
 *
 * The Cytoscape mechanics repeat what Screen 05 learned the hard way: explicit
 * node sizes rather than `width: label`, positions read only after
 * `layoutstop`, and a fit that waits until the container really has a size.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import {
  GROUP_COLORS,
  cytoscapeStylesheet,
  edgeColor,
  edgeLineStyle,
  labelBox,
  nodeGroup,
} from '@/ui/graphStyles';
import type { ThermalNetwork } from '@/thermal/types';
import type { BoundaryPort } from '@/thermal/boundary/types';
import type { PortStatus } from './boundaryViewModel';

cytoscape.use(dagre);

/** 06 §8.2 — outline colour per boundary status. */
const STATUS_BORDER: Record<PortStatus, string> = {
  unassigned: '#94a3b8',
  ok: '#2563eb',
  warning: '#f59e0b',
  blocked: '#dc2626',
  adiabatic: '#64748b',
};

const STATUS_BADGE: Record<PortStatus, string> = {
  unassigned: 'No boundary',
  ok: 'Assigned',
  warning: 'Assumption',
  blocked: 'Incomplete',
  adiabatic: 'Adiabatic',
};

function buildElements(
  network: ThermalNetwork,
  ports: BoundaryPort[],
  statusOf: (port: BoundaryPort) => PortStatus,
  solarPorts: Set<string>,
  fixedPorts: Set<string>,
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const portByNode = new Map(ports.map((port) => [port.connected_node_id, port]));

  for (const node of Object.values(network.nodes)) {
    const group = nodeGroup(node);
    const colors = GROUP_COLORS[group];
    const port = portByNode.get(node.id);
    const status = port ? statusOf(port) : null;

    const badges: string[] = [];
    if (port && status) badges.push(STATUS_BADGE[status]);
    if (port && solarPorts.has(port.id)) badges.push('☀ Solar');
    if (port && fixedPorts.has(port.id)) badges.push('⚓ Fixed T');

    const label = `${node.name}${node.power_W > 0 ? ` · ${node.power_W.toFixed(1)} W` : ''}${
      badges.length > 0 ? `\n${badges.join(' · ')}` : ''
    }`;
    const box = labelBox(label);

    const classes = ['role-' + group];
    if (port) classes.push('boundary-port', `status-${status}`);

    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill: colors.fill,
        border: port && status ? STATUS_BORDER[status] : colors.border,
        text: colors.text,
      },
      classes: classes.join(' '),
    });
  }

  for (const edge of Object.values(network.edges)) {
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    const boundaryDerived = edge.method === 'convection_hA' || edge.method === 'radiation_hA';

    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        // No heat flow, no ΔT: the label names the interface, nothing solved.
        label: boundaryDerived ? 'Boundary' : '',
        color: edgeColor(edge),
        lineStyle: boundaryDerived ? 'dashed' : edgeLineStyle(edge),
      },
    });
  }

  return elements;
}

export interface BoundaryCanvasHandle {
  fit: () => void;
  zoomBy: (delta: number) => void;
  center: (nodeId: string) => void;
}

export const BoundaryMappingCanvas = forwardRef<
  BoundaryCanvasHandle,
  {
    network: ThermalNetwork;
    ports: BoundaryPort[];
    statusOf: (port: BoundaryPort) => PortStatus;
    solarPortIds: Set<string>;
    fixedPortIds: Set<string>;
    selectedPortId: string | null;
    onSelectPort: (portId: string | null) => void;
  }
>(function BoundaryMappingCanvas(
  {
    network,
    ports,
    statusOf,
    solarPortIds,
    fixedPortIds,
    selectedPortId,
    onSelectPort,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const fittedRef = useRef(false);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const signatureRef = useRef('');

  const portByNode = useMemo(
    () => new Map(ports.map((port) => [port.connected_node_id, port])),
    [ports],
  );

  const handlers = useRef({ onSelectPort, portByNode });
  handlers.current = { onSelectPort, portByNode };

  const elements = useMemo(
    () => buildElements(network, ports, statusOf, solarPortIds, fixedPortIds),
    [network, ports, statusOf, solarPortIds, fixedPortIds],
  );

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: cytoscapeStylesheet(),
      minZoom: 0.2,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
      // Topology is read-only: nodes may be inspected, never rearranged.
      autoungrabify: true,
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (event) => {
      const port = handlers.current.portByNode.get(event.target.id() as string);
      handlers.current.onSelectPort(port?.id ?? null);
    });

    cy.on('tap', (event) => {
      if (event.target === cy) handlers.current.onSelectPort(null);
    });

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      cy.resize();
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
  }, []);

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
    const structureChanged = signature !== signatureRef.current;
    signatureRef.current = signature;

    const missing: string[] = [];
    cy.nodes().forEach((node) => {
      const known = positionsRef.current[node.id() as string];
      if (known) node.position({ ...known });
      else missing.push(node.id() as string);
    });

    const snapshot = () => {
      positionsRef.current = {};
      cy.nodes().forEach((node) => {
        const position = node.position();
        positionsRef.current[node.id() as string] = { x: position.x, y: position.y };
      });
    };

    const refit = () => {
      cy.resize();
      const box = cy.container()?.getBoundingClientRect();
      const sized = Boolean(box && box.width > 0 && box.height > 0);
      if (sized) cy.fit(undefined, 40);
      fittedRef.current = sized && cy.nodes().length > 0;
    };

    if (missing.length > 0 && cy.nodes().length > 0) {
      // Layout applies positions asynchronously; reading them before
      // `layoutstop` yields zeros and stacks the whole graph on one point.
      const layout = cy.layout({
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 26,
        rankSep: 80,
        animate: false,
      } as unknown as cytoscape.LayoutOptions);
      layout.one('layoutstop', () => {
        snapshot();
        refit();
      });
      layout.run();
      return;
    }

    snapshot();
    if (hadElements && !structureChanged) cy.viewport({ zoom, pan });
    else refit();
  }, [elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().unselect();
    if (!selectedPortId) return;
    const port = ports.find((entry) => entry.id === selectedPortId);
    if (port) cy.getElementById(port.connected_node_id).select();
  }, [selectedPortId, ports, elements]);

  useImperativeHandle(
    ref,
    (): BoundaryCanvasHandle => ({
      fit: () => cyRef.current?.fit(undefined, 40),
      zoomBy: (delta) => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.zoom({ level: cy.zoom() + delta, renderedPosition: { x: 0, y: 0 } });
        cy.center();
      },
      center: (nodeId) => {
        const cy = cyRef.current;
        const node = cy?.getElementById(nodeId);
        if (cy && node && node.length > 0) {
          cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.9) }, { duration: 200 });
        }
      },
    }),
    [],
  );

  return <div ref={containerRef} className="size-full" data-testid="boundary-mapping-canvas" />;
});
