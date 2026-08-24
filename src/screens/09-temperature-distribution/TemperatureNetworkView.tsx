/**
 * Network temperature view — 09 §20, §21, §22.
 *
 * The Screen 07 solved graph with nodes coloured by TEMPERATURE. 09 §20 is
 * explicit that edges are NOT coloured by bottleneck score here — that overlay
 * belongs to Screen 08 — so edges stay neutral and carry only the node
 * temperatures' context.
 *
 * With the scale locked (09 §22) the same colour means the same temperature in
 * both scenarios, which is the whole point of the lock.
 *
 * The Cytoscape mechanics repeat what Screens 05–08 learned: explicit node
 * sizes rather than `width: label`, positions read only after `layoutstop`, a
 * fit that waits until the container really has a size, and a re-fit when the
 * container itself changes materially.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import cytoscape, { type Core, type ElementDefinition, type StylesheetCSS } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import { labelBox } from '@/ui/graphStyles';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { isBoundaryNode } from '@/thermal/analysis/temperatureDataset';

import type { TemperatureScale } from './distributionViewModel';

cytoscape.use(dagre);

export const NETWORK_FILTERS = ['all', 'heat_sources', 'shared_structure'] as const;
export type NetworkFilter = (typeof NETWORK_FILTERS)[number];

export const NETWORK_FILTER_LABELS: Record<NetworkFilter, { label: string; zh: string }> = {
  all: { label: 'All', zh: '全部' },
  heat_sources: { label: 'Heat Sources', zh: '熱源' },
  shared_structure: { label: 'Shared Structure', zh: '共用結構' },
};

const STRUCTURAL = new Set([
  'small_base',
  'base_zone',
  'heat_sink_base',
  'fin_surface',
  'housing',
  'heat_pipe_evaporator',
  'heat_pipe_condenser',
]);

export interface NetworkViewHandle {
  fit: () => void;
  zoomBy: (delta: number) => void;
  center: (nodeId: string) => void;
}

function stylesheet(): StylesheetCSS[] {
  return [
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        width: 'data(w)',
        height: 'data(h)',
        'background-color': 'data(fill)',
        'border-color': 'data(border)',
        'border-width': 1.5,
        label: 'data(label)',
        color: 'data(text)',
        'text-wrap': 'wrap',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 10,
        'font-weight': 600,
        'text-max-width': '140px',
      },
    },
    { selector: 'node.boundary', style: { 'border-style': 'dashed', 'border-width': 2.5 } },
    { selector: 'node.out-of-scope', style: { opacity: 0.35 } },
    { selector: 'node:selected', style: { 'border-color': '#1d4ed8', 'border-width': 3.5 } },
    {
      selector: 'edge',
      style: {
        // 09 §20 — edges are never coloured by bottleneck score on this screen.
        width: 1.5,
        'line-color': '#cbd5e1',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#cbd5e1',
        'arrow-scale': 0.8,
      },
    },
  ] as unknown as StylesheetCSS[];
}

/** Readable text on a coloured node: dark ramp stops need light type. */
function textColorFor(fill: string): string {
  return ['#2563eb', '#dc2626', '#f97316'].includes(fill) ? '#ffffff' : '#0f172a';
}

function buildElements(
  network: ThermalNetwork,
  solution: ThermalSolution,
  scale: TemperatureScale,
  filter: NetworkFilter,
  inScope: Set<string>,
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  for (const node of Object.values(network.nodes)) {
    if (node.disabled) continue;
    const temperature = solution.node_temperatures_C[node.id];
    if (temperature == null || !Number.isFinite(temperature)) continue;

    if (filter === 'heat_sources' && node.power_W <= 0) continue;
    if (filter === 'shared_structure' && !STRUCTURAL.has(node.type)) continue;

    const fill = scale.colorOf(temperature);
    const label = `${node.name}\n${temperature.toFixed(1)} °C`;
    const box = labelBox(label);
    const boundary = isBoundaryNode(node);

    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill,
        border: boundary ? '#475569' : fill,
        text: textColorFor(fill),
      },
      classes: [boundary ? 'boundary' : '', inScope.has(node.id) ? '' : 'out-of-scope']
        .filter(Boolean)
        .join(' '),
    });
  }

  const present = new Set(elements.map((element) => element.data.id as string));
  for (const edge of Object.values(network.edges)) {
    if (!present.has(edge.from) || !present.has(edge.to)) continue;
    elements.push({
      group: 'edges',
      data: { id: edge.id, source: edge.from, target: edge.to },
    });
  }

  return elements;
}

export const TemperatureNetworkView = forwardRef<
  NetworkViewHandle,
  {
    network: ThermalNetwork;
    solution: ThermalSolution;
    scale: TemperatureScale;
    filter: NetworkFilter;
    /** Nodes inside the current scope / filters; the rest are dimmed. */
    inScopeNodeIds: Set<string>;
    selectedNodeId: string | null;
    onSelectNode: (nodeId: string | null) => void;
  }
>(function TemperatureNetworkView(
  { network, solution, scale, filter, inScopeNodeIds, selectedNodeId, onSelectNode },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const fittedRef = useRef(false);
  const fittedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const signatureRef = useRef('');

  const handlers = useRef({ onSelectNode });
  handlers.current = { onSelectNode };

  const elements = useMemo(
    () => buildElements(network, solution, scale, filter, inScopeNodeIds),
    [network, solution, scale, filter, inScopeNodeIds],
  );

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: stylesheet(),
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,
      // Screen 09 is read-only: the graph is inspected, never rearranged.
      autoungrabify: true,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (event) => handlers.current.onSelectNode(event.target.id() as string));
    cy.on('tap', (event) => {
      if (event.target === cy) handlers.current.onSelectNode(null);
    });

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      cy.resize();
      if (cy.nodes().length === 0) return;

      const last = fittedSizeRef.current;
      const changed =
        !last ||
        Math.abs(rect.width - last.width) / Math.max(last.width, 1) > 0.15 ||
        Math.abs(rect.height - last.height) / Math.max(last.height, 1) > 0.15;

      if (!fittedRef.current || changed) {
        cy.fit(undefined, 40);
        fittedRef.current = true;
        fittedSizeRef.current = { width: rect.width, height: rect.height };
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
    if (!selectedNodeId) return;
    const node = cy.getElementById(selectedNodeId);
    if (node.length > 0) node.select();
  }, [selectedNodeId, elements]);

  useImperativeHandle(
    ref,
    (): NetworkViewHandle => ({
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

  return <div ref={containerRef} className="size-full" data-testid="temperature-network-canvas" />;
});

/** Temperature legend — 09 §21. */
export function TemperatureLegend({
  scale,
  locked,
}: {
  scale: TemperatureScale;
  locked: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold text-ink-500 tabular">
        {scale.min.toFixed(0)} °C
      </span>
      <span className="flex h-2 w-28 overflow-hidden rounded-full">
        {scale.bands.map((band) => (
          <span key={band.color} className="h-full flex-1" style={{ backgroundColor: band.color }} />
        ))}
      </span>
      <span className="text-[10px] font-semibold text-ink-500 tabular">
        {scale.max.toFixed(0)} °C
      </span>
      <span className="text-[10px] text-ink-400">
        {locked ? 'Fixed / 固定' : 'Auto / 自動'}
      </span>
    </div>
  );
}
